/**
 * Media fixtures for ROW28 D3 — real MediaRecorder-shaped bytes.
 *
 * Chromium's MediaRecorder WebM output is: EBML header + Segment(Info with
 * TimecodeScale, Tracks, Clusters); every blob after the first is CLUSTERS
 * ONLY (no Duration element anywhere — getID3-blind). The host prepends the
 * init (ChunkInitSegment contract), so a stored object is exactly:
 * [header][segment-start][info][tracks][clusters...]. These builders emit
 * that byte shape with deterministic, known timestamps so measurements can
 * be asserted to the frame.
 *
 * MP4 builders emit the finalized (mvhd) and fragmented (moof/traf/tfdt/
 * trun) shapes the same contract must handle.
 */

// ---------------------------------------------------------------------------
// EBML primitives
// ---------------------------------------------------------------------------

function element(id: number[], payload: number[]): number[] {
    return [...id, ...vintSize(payload.length), ...payload];
}

/** EBML size VINT (shortest form that fits). */
function vintSize(n: number): number[] {
    for (let len = 1; len <= 8; len++) {
        const max = 2 ** (7 * len) - 1;
        if (n < max) {
            const marker = 0x80 >> (len - 1); // first 1-bit of the marker byte
            let value = n;
            const bytes: number[] = [];
            for (let i = 0; i < len; i++) {
                bytes.unshift(value & 0xff);
                value = Math.floor(value / 256);
            }
            bytes[0] |= marker;
            return bytes;
        }
    }
    throw new Error('vint overflow');
}

/** Unsigned integer payload, big-endian, minimal length (≥1 byte). */
function uint(n: number): number[] {
    const bytes: number[] = [];
    let v = Math.max(0, Math.floor(n));
    do {
        bytes.unshift(v & 0xff);
        v = Math.floor(v / 256);
    } while (v > 0);
    return bytes;
}

const ID_EBML = [0x1a, 0x45, 0xdf, 0xa3];
const ID_SEGMENT = [0x18, 0x53, 0x80, 0x67];
const ID_INFO = [0x15, 0x49, 0xa9, 0x66];
const ID_TIMECODE_SCALE = [0x2a, 0xd7, 0xb1];
const ID_TRACKS = [0x16, 0x54, 0xae, 0x6b];
const ID_TRACK_ENTRY = [0xae];
const ID_TRACK_NUMBER = [0xd7];
const ID_CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
const ID_TIMESTAMP = [0xe7];
const ID_SIMPLE_BLOCK = [0xa3];
const ID_BLOCK_GROUP = [0xa0];
const ID_BLOCK = [0xa1];
const ID_BLOCK_DURATION = [0x9b];

function simpleBlock(track: number, relativeTs: number, keyframe = true): number[] {
    // track number VINT (1 byte, marker 0x80) + int16 BE timecode + flags.
    return [0x80 | track, (relativeTs >> 8) & 0xff, relativeTs & 0xff, keyframe ? 0x80 : 0x00, 0x11, 0x22, 0x33, 0x44];
}

function blockGroup(track: number, relativeTs: number, durationUnits: number): number[] {
    const block = element(ID_BLOCK, simpleBlock(track, relativeTs));
    const dur = element(ID_BLOCK_DURATION, uint(durationUnits));
    return element(ID_BLOCK_GROUP, [...block, ...dur]);
}

/** One SimpleBlock cluster: timestamp + blocks ([[relativeTs], ...]). */
function simpleCluster(clusterTs: number | null, blockTs: number[]): number[] {
    const parts: number[] = [];
    if (clusterTs !== null) parts.push(...element(ID_TIMESTAMP, uint(clusterTs)));
    for (const ts of blockTs) parts.push(...element(ID_SIMPLE_BLOCK, simpleBlock(1, ts)));
    return element(ID_CLUSTER, parts);
}

/** One BlockGroup cluster (Block + BlockDuration — the duration-carrying form). */
function durationCluster(clusterTs: number, blocks: Array<[relativeTs: number, durationUnits: number]>): number[] {
    const parts: number[] = [ ...element(ID_TIMESTAMP, uint(clusterTs)) ];
    for (const [ts, dur] of blocks) parts.push(...blockGroup(1, ts, dur));
    return element(ID_CLUSTER, parts);
}

export interface WebmOptions {
    /** TimecodeScale in NANOSECONDS per timecode unit (default 1ms). */
    timecodeScaleNs?: number;
    /** Omit the TimecodeScale element entirely (spec default must apply). */
    omitTimecodeScale?: boolean;
    /** Omit the Segment wrapper (raw-cluster fragment). */
    omitSegment?: boolean;
    /** Emit an unknown-size (all-ones) Segment size marker. */
    unknownSegmentSize?: boolean;
}

/**
 * Build a stored-object WebM: init (header + segment start + info + tracks)
 * followed by the given clusters — exactly what ChunkUploader prepends to a
 * MediaRecorder fragment. Clusters are given as [clusterTimestamp, blockTs[]]
 * pairs; null clusterTimestamp omits the element (spec default 0).
 */
export function buildWebmObject(
    clusters: Array<[clusterTs: number | null, blockTs: number[]]>,
    opts: WebmOptions = {},
): Uint8Array {
    const scale = opts.timecodeScaleNs ?? 1_000_000;
    const info = element(ID_INFO, opts.omitTimecodeScale ? [] : element(ID_TIMECODE_SCALE, uint(scale)));
    const tracks = element(ID_TRACKS, element(ID_TRACK_ENTRY, element(ID_TRACK_NUMBER, uint(1))));
    const header = element(ID_EBML, [
        ...element([0x42, 0x86], uint(1)),        // EBMLVersion
        ...element([0x42, 0xf7], uint(1)),        // EBMLReadVersion
        ...element([0x42, 0xf2], uint(4)),        // EBMLMaxIDLength
        ...element([0x42, 0xf3], uint(8)),        // EBMLMaxSizeLength
        ...element([0x42, 0x82], [0x77, 0x65, 0x62, 0x6d]), // DocType 'webm'
    ]);
    const clusterBytes = clusters.flatMap(([ts, blocks]) => simpleCluster(ts, blocks));
    if (opts.omitSegment) {
        return new Uint8Array([...header, ...clusterBytes]);
    }
    const segmentPayload = [...info, ...tracks, ...clusterBytes];
    let segment: number[];
    if (opts.unknownSegmentSize) {
        segment = [...ID_SEGMENT, 0xff, ...segmentPayload]; // 1-byte all-ones size
    } else {
        segment = element(ID_SEGMENT, segmentPayload);
    }
    return new Uint8Array([...header, ...segment]);
}

/** A stored WebM whose clusters carry BlockDuration elements. */
export function buildWebmWithBlockDurations(
    clusters: Array<[clusterTs: number, blocks: Array<[relativeTs: number, durationUnits: number]>]>,
    timecodeScaleNs = 1_000_000,
): Uint8Array {
    const info = element(ID_INFO, element(ID_TIMECODE_SCALE, uint(timecodeScaleNs)));
    const tracks = element(ID_TRACKS, element(ID_TRACK_ENTRY, element(ID_TRACK_NUMBER, uint(1))));
    const header = element(ID_EBML, [
        ...element([0x42, 0x86], uint(1)),
        ...element([0x42, 0x82], [0x77, 0x65, 0x62, 0x6d]),
    ]);
    const clusterBytes = clusters.flatMap(([ts, blocks]) => durationCluster(ts, blocks));
    return new Uint8Array([...header, ...element(ID_SEGMENT, [...info, ...tracks, ...clusterBytes])]);
}

/**
 * A REAL MediaRecorder timeslice: the init (header+segment start+info+
 * tracks, prepended by the host to every fragment) followed by THIS
 * chunk's clusters. MediaRecorder continues the session timeline, so the
 * clusters carry ABSOLUTE timestamps [startMs..endMs] — the stored
 * object's own duration is the span, not the absolute end.
 */
export function webmChunkWindow(startMs: number, endMs: number, frameMs = 33): Uint8Array {
    const blocks: number[] = [];
    for (let t = startMs; t <= endMs; t += frameMs) blocks.push(t);
    if (blocks[blocks.length - 1] !== endMs) blocks.push(endMs);
    return buildWebmObject([[startMs, blocks]]);
}

// ---------------------------------------------------------------------------
// MP4 primitives
// ---------------------------------------------------------------------------

function box(type: string, payload: number[]): number[] {
    const size = 8 + payload.length;
    return [
        (size >>> 24) & 0xff, (size >>> 16) & 0xff, (size >>> 8) & 0xff, size & 0xff,
        ...Array.from(type, (ch) => ch.charCodeAt(0)),
        ...payload,
    ];
}

/** Fixed-width 32-bit big-endian field (MP4 integer fields are NOT varint). */
function be32(n: number): number[] {
    return [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];
}

function fullBox(type: string, version: number, flags: number, payload: number[]): number[] {
    return box(type, [version, (flags >>> 16) & 0xff, (flags >>> 8) & 0xff, flags & 0xff, ...payload]);
}

/** A finalized movie: ftyp + moov(mvhd with a positive duration). */
export function buildMp4WithMovieDuration(timescale: number, durationUnits: number): Uint8Array {
    const mvhd = fullBox('mvhd', 0, 0, [
        ...be32(0), ...be32(0),           // creation, modification
        ...be32(timescale), ...be32(durationUnits),
        ...be32(0x00010000), ...be32(0x0000), // rate, volume
    ]);
    return new Uint8Array([
        ...box('ftyp', [0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00]), // 'isom'
        ...box('moov', [...mvhd]),
    ]);
}

/** A fragmented recording: moov(mvhd duration 0 + trak) + moof(traf tfdt+trun). */
export function buildFragmentedMp4(
    mediaTimescale: number,
    fragments: Array<{ baseTime: number; sampleDurations: number[] }>,
    opts: { movieDurationUnits?: number } = {},
): Uint8Array {
    const tkhd = fullBox('tkhd', 0, 0, [...be32(0), ...be32(0), ...be32(1), ...be32(0), ...be32(0)]);
    const mdhd = fullBox('mdhd', 0, 0, [...be32(0), ...be32(0), ...be32(mediaTimescale), ...be32(0)]);
    const trak = box('trak', [...tkhd, ...box('mdia', [...mdhd])]);
    // A prepended init carries the WHOLE movie's duration (it grows as the
    // session continues) — a stale init must never be a chunk's duration.
    const mvhd = fullBox('mvhd', 0, 0, [...be32(0), ...be32(0), ...be32(1000), ...be32(opts.movieDurationUnits ?? 0)]);
    const moov = box('moov', [...mvhd, ...trak]);
    let bytes: number[] = [...box('ftyp', [0x69, 0x73, 0x6f, 0x6d]), ...moov];
    for (const frag of fragments) {
        const tfhd = fullBox('tfhd', 0, 0x08, [...be32(1), ...be32(1000)]); // track 1, default duration
        const tfdt = fullBox('tfdt', 0, 0, be32(frag.baseTime));
        const trun = fullBox('trun', 0, 0x000100, [
            ...be32(frag.sampleDurations.length),
            ...frag.sampleDurations.flatMap((d) => be32(d)),
        ]);
        const traf = box('traf', [...tfhd, ...tfdt, ...trun]);
        bytes = [...bytes, ...box('moof', [...traf]), ...box('mdat', [0x00])];
    }
    return new Uint8Array(bytes);
}

/**
 * A real MP4 MediaRecorder timeslice object: the init (moov, prepended by
 * the host) + THIS chunk's moof fragment at an absolute tfdt base.
 */
export function fragmentedMp4ChunkWindow(
    mediaTimescale: number,
    baseUnits: number,
    sampleDurations: number[],
    staleMovieDurationUnits = 900000,
): Uint8Array {
    return buildFragmentedMp4(mediaTimescale, [{ baseTime: baseUnits, sampleDurations }], {
        movieDurationUnits: staleMovieDurationUnits,
    });
}

export interface RealTrunOptions {
    /** per-sample size units (parallel to durations; 0 when absent) */
    sampleSizes?: number[];
    /** first_sample_flags header value (present as 4 bytes in the trun header) */
    firstSampleFlags?: number;
    /** data_offset header value */
    dataOffset?: number;
    /** hidden default sample duration from tfhd (used when 0x100 is absent) */
    defaultDuration?: number;
}

/**
 * A fragmented object whose trun carries the REAL muxer header: flags,
 * data_offset and (for 0x305) first_sample_flags, followed by per-sample
 * duration (0x100) and size (0x200) fields. This is the exact byte layout
 * the ROW28 production object used — where first_sample_flags lives under
 * 0x000004 (ffmpeg/GPAC/ISO), NOT 0x000002: mis-reading that bit shifts
 * every per-sample read by 4 bytes and sums the size fields as durations.
 */
export function buildRealTrunMp4(
    mediaTimescale: number,
    baseTime: number,
    sampleDurations: number[],
    trunFlags: number,
    opts: RealTrunOptions = {},
): Uint8Array {
    const tkhd = fullBox('tkhd', 0, 0, [...be32(0), ...be32(0), ...be32(1), ...be32(0), ...be32(0)]);
    const mdhd = fullBox('mdhd', 0, 0, [...be32(0), ...be32(0), ...be32(mediaTimescale), ...be32(0)]);
    const trak = box('trak', [...tkhd, ...box('mdia', [...mdhd])]);
    // The prepended init's movie duration grows with the session — stale.
    const mvhd = fullBox('mvhd', 0, 0, [...be32(0), ...be32(0), ...be32(1000), ...be32(900000)]);
    const moov = box('moov', [...mvhd, ...trak]);
    let trunPayload: number[] = [...be32(sampleDurations.length)];
    if (trunFlags & 0x000001) trunPayload = [...trunPayload, ...be32(opts.dataOffset ?? 0)];
    if (trunFlags & 0x000004) trunPayload = [...trunPayload, ...be32(opts.firstSampleFlags ?? 0x02000000)];
    for (let i = 0; i < sampleDurations.length; i++) {
        if (trunFlags & 0x000100) trunPayload = [...trunPayload, ...be32(sampleDurations[i])];
        if (trunFlags & 0x000200) trunPayload = [...trunPayload, ...be32(opts.sampleSizes?.[i] ?? 0)];
    }
    const trun = fullBox('trun', 0, trunFlags, trunPayload);
    const tfhdFlags = opts.defaultDuration ? 0x08 : 0;
    const tfhd = fullBox('tfhd', 0, tfhdFlags, [
        ...be32(1),
        ...(opts.defaultDuration ? be32(opts.defaultDuration) : []),
    ]);
    const tfdt = fullBox('tfdt', 0, 0, be32(baseTime));
    const traf = box('traf', [...tfhd, ...tfdt, ...trun]);
    const moof = box('moof', [...traf]);
    return new Uint8Array([...box('ftyp', [0x69, 0x73, 0x6f, 0x6d]), ...moov, ...moof, ...box('mdat', [0x00])]);
}

// ---------------------------------------------------------------------------
// R4-CHUNK-DOWNLOAD-1: structurally valid fragmented MP4 chunks.
//
// The builders above are intentionally minimal (they exercise duration readers
// and trun parsing). Download tests need a real init contract: hdlr, stsd,
// mvex/trex and per-track timescales. These chunks are deterministic and
// carry one moof + mdat after a single ftyp+moov init, matching stored objects.
// ---------------------------------------------------------------------------

function be64(n: number): number[] {
    const hi = Math.floor(n / 0x100000000);
    const lo = n >>> 0;
    return [...be32(hi), ...be32(lo)];
}

export interface Fmp4TrackSpec {
    id: number;
    handler: 'vide' | 'soun';
    timescale: number;
    sampleEntry: string;
}

function hdlrBox(handler: 'vide' | 'soun'): number[] {
    const type = handler === 'vide' ? [0x76, 0x69, 0x64, 0x65] : [0x73, 0x6f, 0x75, 0x6e];
    return fullBox('hdlr', 0, 0, [
        ...be32(0), ...type,
        ...be32(0), ...be32(0), ...be32(0),
        0,
    ]);
}

function trakBox(track: Fmp4TrackSpec): number[] {
    const tkhd = fullBox('tkhd', 0, 0, [
        ...be32(0), ...be32(0), ...be32(track.id), ...be32(0), ...be32(0),
    ]);
    const mdhd = fullBox('mdhd', 0, 0, [
        ...be32(0), ...be32(0), ...be32(track.timescale), ...be32(0),
    ]);
    // stsd.data: version/flags, entry_count, then the sample entry box. The
    // sample-entry type lives at data offset 12 (what parseMovieInfo reads).
    const stsd = fullBox('stsd', 0, 0, [
        ...be32(1),
        ...box(track.sampleEntry, new Array(24).fill(0)),
    ]);
    const minf = box('minf', box('stbl', stsd));
    return box('trak', [...tkhd, ...box('mdia', [...mdhd, ...hdlrBox(track.handler), ...minf])]);
}

export function buildDownloadFmp4Init(tracks: Fmp4TrackSpec[]): Uint8Array {
    const mvhd = fullBox('mvhd', 0, 0, [
        ...be32(0), ...be32(0), ...be32(1000), ...be32(0),
        ...be32(0x00010000), ...be32(0),
    ]);
    const trex = tracks.map((track) => fullBox('trex', 0, 0, [
        ...be32(track.id), ...be32(1), ...be32(0), ...be32(16), ...be32(0),
    ]));
    const moov = box('moov', [...mvhd, ...tracks.flatMap(trakBox), ...box('mvex', trex.flat())]);
    return new Uint8Array([
        ...box('ftyp', [0x69, 0x73, 0x6f, 0x6d, 0x00, 0x00, 0x00, 0x00, 0x69, 0x73, 0x6f, 0x6d]),
        ...moov,
    ]);
}

export interface DownloadFmp4ChunkOptions {
    /** Absolute sequence written to mfhd. */
    sequence: number;
    /** Authoritative timeline origin in ms (the service/D1 value). */
    timelineStartMs: number;
    /** Authoritative chunk duration in ms. */
    durationMs: number;
    /** Append a stale mfra box to prove the assembler drops it. */
    withMfra?: boolean;
}

/** One stored object: init + moof(traf per track) + mdat (+ optional mfra). */
export function buildDownloadFmp4Chunk(
    init: Uint8Array,
    tracks: Fmp4TrackSpec[],
    opts: DownloadFmp4ChunkOptions,
): Uint8Array {
    const sampleSize = 16;
    const buildMoof = (dataOffset: number): number[] => {
        const trafs = tracks.map((track) => {
            const durationUnits = Math.max(1, Math.round((opts.durationMs * track.timescale) / 1000));
            const baseUnits = Math.max(0, Math.round((opts.timelineStartMs * track.timescale) / 1000));
            const tfhd = fullBox('tfhd', 0, 0x020000 | 0x08, [
                ...be32(track.id), ...be32(durationUnits),
            ]);
            const tfdt = fullBox('tfdt', 1, 0, be64(baseUnits));
            const trun = fullBox('trun', 0, 0x000305, [
                ...be32(1), ...be32(dataOffset), ...be32(0x02000000),
                ...be32(durationUnits), ...be32(sampleSize),
            ]);
            return box('traf', [...tfhd, ...tfdt, ...trun]);
        });
        return box('moof', [...fullBox('mfhd', 0, 0, be32(opts.sequence)), ...trafs.flat()]);
    };

    // data_offset is relative to the moof start (default-base-is-moof); the
    // value is fixed-width, so one sizing pass is enough.
    const moofSize = buildMoof(0).length;
    const moof = buildMoof(moofSize + 8); // + mdat header
    const parts: number[] = [
        ...init,
        ...moof,
        ...box('mdat', new Array(sampleSize).fill(0x11)),
    ];
    if (opts.withMfra) {
        // Absolute indexes from the old file: must never survive a remux.
        parts.push(...box('mfra', [...fullBox('tfra', 0, 0, [...be32(1), ...be32(0), ...be32(0), ...be32(0), ...be32(0)])]));
    }
    return new Uint8Array(parts);
}
