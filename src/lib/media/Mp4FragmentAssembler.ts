/**
 * @file src/lib/media/Mp4FragmentAssembler.ts
 * @description R4-CHUNK-DOWNLOAD-1: structural fMP4 remux without re-encoding.
 * @module lib/media/Mp4FragmentAssembler
 *
 * Production recording chunks are MediaRecorder timeslices stored with the
 * init segment prepended: `ftyp + moov + moof + mdat (+ mfra)`. Raw Blob
 * concatenation produces many init segments and duplicate/absolute indexes,
 * which is why the old download path was invalid. This module:
 *
 *  1. keeps exactly one init segment (`ftyp + moov`);
 *  2. validates `mvex/trex` (a real fragmented MP4 init);
 *  3. patches every `tfdt` to the authoritative chunk timeline origin using
 *     each track's own timescale;
 *  4. renumbers `mfhd` and rewrites absolute `tfhd` base-data-offsets for the
 *     new output positions;
 *  5. sets `mvhd`/`tkhd`/`mdhd` durations and adds/patchs `mvex/mehd`;
 *  6. drops `mfra`/`sidx`/`styp` (absolute offsets or stale segment types);
 *  7. keeps `moof + mdat` byte-identical in layout otherwise.
 *
 * It never invents a duration: the caller supplies verified D1 durations and
 * timeline origins. If the input is not structurally assemblable the caller
 * must fall back to FFmpeg remux/transcode — never to raw concatenation.
 */

export type Mp4AssemblyErrorCode =
    | 'empty_input'
    | 'invalid_box'
    | 'no_ftyp'
    | 'no_moov'
    | 'no_mvex'
    | 'no_trex'
    | 'no_track'
    | 'no_moof'
    | 'no_mdat'
    | 'no_tfhd'
    | 'no_tfdt'
    | 'unknown_track'
    | 'init_mismatch'
    | 'multiple_fragments'
    | 'schedule_non_monotonic'
    | 'duration_overflow'
    | 'unsupported_layout';

export class Mp4AssemblyError extends Error {
    readonly code: Mp4AssemblyErrorCode;
    constructor(code: Mp4AssemblyErrorCode, message: string) {
        super(message);
        this.name = 'Mp4AssemblyError';
        this.code = code;
    }
}

export interface Mp4Box {
    type: string;
    /** Offset in the source buffer. */
    start: number;
    size: number;
    headerSize: number;
    dataStart: number;
    dataEnd: number;
    data: Uint8Array;
    children?: Mp4Box[];
}

export interface Mp4ChunkInput {
    sequence: number;
    data: Uint8Array;
    /** Verified server duration (ms). */
    durationMs: number;
    /** Authoritative timeline origin (ms). */
    timelineStartMs: number;
}

export interface Mp4Assembly {
    parts: Uint8Array[];
    mimeType: 'video/mp4';
    durationMs: number;
    trackCount: number;
    videoTrackCount: number;
    audioTrackCount: number;
    fragmentCount: number;
    /** Total bytes of all parts (the Blob size). */
    byteLength: number;
}

export interface Mp4TrackInfo {
    id: number;
    handler: string;
    timescale: number;
    sampleEntry: string | null;
}

const CONTAINER_TYPES = new Set(['moov', 'trak', 'mdia', 'minf', 'stbl', 'mvex', 'moof', 'traf']);
const MAX_BOXES = 20000;
const MAX_DEPTH = 8;

function ascii(bytes: Uint8Array, start: number, end: number): string {
    let out = '';
    for (let i = start; i < end; i++) out += String.fromCharCode(bytes[i]);
    return out;
}

export function readU32(bytes: Uint8Array, offset: number): number {
    if (offset + 4 > bytes.length) throw new Mp4AssemblyError('invalid_box', 'Truncated u32');
    return ((bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3]) >>> 0;
}

export function readU64(bytes: Uint8Array, offset: number): bigint {
    if (offset + 8 > bytes.length) throw new Mp4AssemblyError('invalid_box', 'Truncated u64');
    let value = 0n;
    for (let i = 0; i < 8; i++) value = (value << 8n) | BigInt(bytes[offset + i]);
    return value;
}

function writeU32(bytes: Uint8Array, offset: number, value: number): void {
    bytes[offset] = (value >>> 24) & 0xff;
    bytes[offset + 1] = (value >>> 16) & 0xff;
    bytes[offset + 2] = (value >>> 8) & 0xff;
    bytes[offset + 3] = value & 0xff;
}

function writeU64(bytes: Uint8Array, offset: number, value: bigint): void {
    for (let i = 7; i >= 0; i--) {
        bytes[offset + i] = Number(value & 0xffn);
        value >>= 8n;
    }
}

function boxAt(bytes: Uint8Array, offset: number, limit: number, depth: number, counter: { n: number }): Mp4Box {
    if (counter.n++ > MAX_BOXES) throw new Mp4AssemblyError('invalid_box', 'Too many boxes');
    if (offset + 8 > limit) throw new Mp4AssemblyError('invalid_box', `Truncated box at ${offset}`);
    const size32 = readU32(bytes, offset);
    const type = ascii(bytes, offset + 4, offset + 8);
    let size = size32;
    let headerSize = 8;
    if (size32 === 1) {
        if (offset + 16 > limit) throw new Mp4AssemblyError('invalid_box', `Truncated 64-bit box ${type}`);
        const size64 = readU64(bytes, offset + 8);
        if (size64 > BigInt(Number.MAX_SAFE_INTEGER)) throw new Mp4AssemblyError('invalid_box', 'Box too large');
        size = Number(size64);
        headerSize = 16;
    } else if (size32 === 0) {
        size = limit - offset;
    }
    if (size < headerSize || offset + size > limit) {
        throw new Mp4AssemblyError('invalid_box', `Invalid ${type} size ${size} at ${offset}`);
    }
    const dataStart = offset + headerSize;
    const dataEnd = offset + size;
    const box: Mp4Box = {
        type,
        start: offset,
        size,
        headerSize,
        dataStart,
        dataEnd,
        data: bytes.subarray(dataStart, dataEnd),
    };
    if (CONTAINER_TYPES.has(type) && depth < MAX_DEPTH) {
        const children: Mp4Box[] = [];
        let childOffset = dataStart;
        while (childOffset < dataEnd) {
            const child = boxAt(bytes, childOffset, dataEnd, depth + 1, counter);
            children.push(child);
            childOffset += child.size;
        }
        box.children = children;
    }
    return box;
}

export function parseTopLevelBoxes(bytes: Uint8Array): Mp4Box[] {
    const boxes: Mp4Box[] = [];
    const counter = { n: 0 };
    let offset = 0;
    while (offset < bytes.length) {
        const box = boxAt(bytes, offset, bytes.length, 0, counter);
        boxes.push(box);
        offset += box.size;
    }
    return boxes;
}

export function findBox(box: Mp4Box, type: string): Mp4Box | null {
    return box.children?.find((child) => child.type === type) ?? null;
}

export function findBoxDeep(box: Mp4Box, path: string[]): Mp4Box | null {
    let current: Mp4Box | null = box;
    for (const type of path) {
        if (!current) return null;
        current = findBox(current, type);
    }
    return current;
}

function serialize(box: Mp4Box, preserveHeaderSize = true): Uint8Array {
    const payloadParts: Uint8Array[] = [];
    let payloadLength = 0;
    if (box.children) {
        for (const child of box.children) {
            const bytes = serialize(child);
            payloadParts.push(bytes);
            payloadLength += bytes.length;
        }
    } else {
        payloadParts.push(box.data);
        payloadLength += box.data.length;
    }

    let headerSize = preserveHeaderSize ? box.headerSize : 8;
    let total = headerSize + payloadLength;
    if (total > Number.MAX_SAFE_INTEGER) throw new Mp4AssemblyError('unsupported_layout', 'Box too large');
    if (total > 0xffffffff && headerSize === 8) {
        headerSize = 16;
        total = headerSize + payloadLength;
    }
    const out = new Uint8Array(headerSize + payloadLength);
    if (headerSize === 16) {
        writeU32(out, 0, 1);
        writeU64(out, 8, BigInt(total));
    } else {
        writeU32(out, 0, total);
    }
    for (let i = 0; i < 4; i++) out[4 + i] = box.type.charCodeAt(i) & 0xff;
    let offset = headerSize;
    for (const part of payloadParts) {
        out.set(part, offset);
        offset += part.length;
    }
    return out;
}

export function serializeBox(box: Mp4Box): Uint8Array {
    return serialize(box);
}

function mutableData(box: Mp4Box): Uint8Array {
    const copy = new Uint8Array(box.data.length);
    copy.set(box.data);
    box.data = copy;
    return copy;
}

interface MovieInfo {
    movieTimescale: number;
    tracks: Mp4TrackInfo[];
    videoTracks: number;
    audioTracks: number;
    stsdBytes: Map<number, Uint8Array>;
}

function parseMovieInfo(moov: Mp4Box, requireFragmented = true): MovieInfo {
    const mvhd = findBox(moov, 'mvhd');
    if (!mvhd) throw new Mp4AssemblyError('invalid_box', 'moov has no mvhd');
    const movieTimescale = readMovieTimescale(mvhd);
    if (!movieTimescale || movieTimescale <= 0) throw new Mp4AssemblyError('invalid_box', 'Invalid mvhd timescale');

    const traks = moov.children?.filter((child) => child.type === 'trak') ?? [];
    if (traks.length === 0) throw new Mp4AssemblyError('no_track', 'moov has no tracks');
    const tracks: Mp4TrackInfo[] = [];
    const stsdBytes = new Map<number, Uint8Array>();
    let videoTracks = 0;
    let audioTracks = 0;
    for (const trak of traks) {
        const tkhd = findBox(trak, 'tkhd');
        const mdia = findBox(trak, 'mdia');
        const mdhd = mdia ? findBox(mdia, 'mdhd') : null;
        const hdlr = mdia ? findBox(mdia, 'hdlr') : null;
        const stsd = mdia ? findBoxDeep(mdia, ['minf', 'stbl', 'stsd']) : null;
        if (!tkhd || !mdhd || !hdlr) throw new Mp4AssemblyError('invalid_box', 'Track is missing tkhd/mdhd/hdlr');
        const id = readTrackId(tkhd);
        const timescale = readMediaTimescale(mdhd);
        if (!id || !timescale || timescale <= 0) throw new Mp4AssemblyError('invalid_box', 'Invalid track id/timescale');
        if (tracks.some((track) => track.id === id)) throw new Mp4AssemblyError('invalid_box', 'Duplicate track id');
        const handler = hdlr.data.length >= 12 ? ascii(hdlr.data, 8, 12) : '';
        let sampleEntry: string | null = null;
        if (stsd && stsd.data.length >= 16) {
            sampleEntry = ascii(stsd.data, 12, 16);
            stsdBytes.set(id, stsd.data.slice());
        }
        if (handler === 'vide') videoTracks++;
        if (handler === 'soun') audioTracks++;
        tracks.push({ id, handler, timescale, sampleEntry });
    }

    if (requireFragmented) {
        const mvex = findBox(moov, 'mvex');
        if (!mvex) throw new Mp4AssemblyError('no_mvex', 'Not a fragmented MP4 (no mvex)');
        const trexIds = new Set((mvex.children ?? []).filter((b) => b.type === 'trex').map((b) => readU32(b.data, 4)));
        if (trexIds.size === 0) throw new Mp4AssemblyError('no_trex', 'mvex has no trex');
        for (const track of tracks) {
            if (!trexIds.has(track.id)) throw new Mp4AssemblyError('no_trex', `No trex for track ${track.id}`);
        }
    }

    return { movieTimescale, tracks, videoTracks, audioTracks, stsdBytes };
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
}

function sameStsd(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
    if (!a || !b) return a === b;
    return sameBytes(a, b);
}

/**
 * Recorders that write an init segment per chunk commonly update duration
 * fields (mvhd/tkhd/mdhd/mehd) on each file. Those values are patched by this
 * assembler and must not make otherwise-identical tracks look incompatible.
 * Codec/track facts, timescales and sample descriptions are the contract.
 */
function sameMovieContract(a: MovieInfo, b: MovieInfo): boolean {
    if (a.movieTimescale !== b.movieTimescale) return false;
    if (a.tracks.length !== b.tracks.length) return false;
    if (a.videoTracks !== b.videoTracks || a.audioTracks !== b.audioTracks) return false;
    for (let i = 0; i < a.tracks.length; i++) {
        const left = a.tracks[i];
        const right = b.tracks[i];
        if (left.id !== right.id || left.handler !== right.handler
            || left.timescale !== right.timescale || left.sampleEntry !== right.sampleEntry) {
            return false;
        }
        if (!sameStsd(a.stsdBytes.get(left.id), b.stsdBytes.get(right.id))) return false;
    }
    return true;
}

function readTrackId(tkhd: Mp4Box): number {
    return readU32(tkhd.data, tkhd.data[0] === 1 ? 20 : 12);
}

function readMovieTimescale(mvhd: Mp4Box): number {
    const v = mvhd.data[0];
    return readU32(mvhd.data, v === 1 ? 20 : 12);
}

function readMediaTimescale(mdhd: Mp4Box): number {
    const v = mdhd.data[0];
    return readU32(mdhd.data, v === 1 ? 20 : 12);
}

function writeDuration(box: Mp4Box, durationMs: number, timescale: number, durationOffsetV0: number, durationOffsetV1: number): void {
    const data = mutableData(box);
    const version = data[0];
    const units = Math.round((durationMs * timescale) / 1000);
    if (!Number.isFinite(units) || units < 0) throw new Mp4AssemblyError('duration_overflow', 'Invalid duration');
    if (version === 1) {
        writeU64(data, durationOffsetV1, BigInt(units));
    } else {
        if (units > 0xffffffff) throw new Mp4AssemblyError('duration_overflow', 'Duration exceeds v0 field');
        writeU32(data, durationOffsetV0, units);
    }
}

function patchInit(moov: Mp4Box, movie: MovieInfo, totalMs: number): Uint8Array {
    const mvhd = findBox(moov, 'mvhd');
    if (!mvhd) throw new Mp4AssemblyError('invalid_box', 'moov has no mvhd');
    writeDuration(mvhd, totalMs, movie.movieTimescale, 16, 24);

    for (const trak of moov.children?.filter((c) => c.type === 'trak') ?? []) {
        const tkhd = findBox(trak, 'tkhd');
        const mdia = findBox(trak, 'mdia');
        const mdhd = mdia ? findBox(mdia, 'mdhd') : null;
        if (!tkhd || !mdhd) throw new Mp4AssemblyError('invalid_box', 'Track is missing tkhd/mdhd');
        const trackId = readTrackId(tkhd);
        const track = movie.tracks.find((t) => t.id === trackId);
        if (!track) throw new Mp4AssemblyError('unknown_track', `Unknown track ${trackId}`);
        writeDuration(tkhd, totalMs, movie.movieTimescale, 20, 28);
        writeDuration(mdhd, totalMs, track.timescale, 16, 24);
    }

    const mvex = findBox(moov, 'mvex');
    if (!mvex || !mvex.children) throw new Mp4AssemblyError('no_mvex', 'Not a fragmented MP4 (no mvex)');
    const mehd = mvex.children.find((c) => c.type === 'mehd') ?? null;
    const units = Math.round((totalMs * movie.movieTimescale) / 1000);
    if (mehd) {
        const data = mutableData(mehd);
        const version = data[0];
        if (version === 1) writeU64(data, 4, BigInt(units));
        else {
            if (units > 0xffffffff) throw new Mp4AssemblyError('duration_overflow', 'mehd v0 overflow');
            writeU32(data, 4, units);
        }
    } else {
        const data = units > 0xffffffff ? new Uint8Array(12) : new Uint8Array(8);
        data[0] = units > 0xffffffff ? 1 : 0;
        if (data[0] === 1) writeU64(data, 4, BigInt(units));
        else writeU32(data, 4, units);
        mvex.children.push({ type: 'mehd', start: 0, size: 0, headerSize: 8, dataStart: 0, dataEnd: 0, data });
    }
    return serialize(moov);
}

function readTfhdDefaultDuration(tfhd: Mp4Box): number {
    const flags = ((tfhd.data[1] << 16) | (tfhd.data[2] << 8) | tfhd.data[3]) >>> 0;
    let p = 8;
    if (flags & 0x000001) p += 8;
    if (flags & 0x000002) p += 4;
    if (flags & 0x000008) return readU32(tfhd.data, p);
    return 0;
}

/** Sum sample durations in one traf's trun (ISO trun flag layout). */
export function sumTrunSampleDurationUnits(traf: Mp4Box): number {
    const tfhd = findBox(traf, 'tfhd');
    const trun = findBox(traf, 'trun');
    if (!trun) return 0;
    const defaultDuration = tfhd ? readTfhdDefaultDuration(tfhd) : 0;
    const flags = ((trun.data[1] << 16) | (trun.data[2] << 8) | trun.data[3]) >>> 0;
    const sampleCount = readU32(trun.data, 4);
    let p = 8;
    if (flags & 0x000001) p += 4;
    if (flags & 0x000004) p += 4;
    let sum = 0;
    for (let i = 0; i < sampleCount; i++) {
        if (flags & 0x000100) {
            if (p + 4 > trun.data.length) break;
            sum += readU32(trun.data, p);
            p += 4;
        } else {
            sum += defaultDuration;
        }
        if (flags & 0x000200) p += 4;
        if (flags & 0x000400) p += 4;
        if (flags & 0x000800) p += 4;
    }
    return sum;
}

function patchFragment(
    moof: Mp4Box,
    movie: MovieInfo,
    sequence: number,
    newMoofStart: number,
    trackBaseUnits: Map<number, bigint>
): Uint8Array {
    const mfhd = findBox(moof, 'mfhd');
    if (!mfhd) throw new Mp4AssemblyError('invalid_box', 'moof has no mfhd');
    writeU32(mutableData(mfhd), 4, sequence);

    const trafs = moof.children?.filter((c) => c.type === 'traf') ?? [];
    if (trafs.length === 0) throw new Mp4AssemblyError('invalid_box', 'moof has no traf');
    for (const traf of trafs) {
        const tfhd = findBox(traf, 'tfhd');
        const tfdt = findBox(traf, 'tfdt');
        if (!tfhd) throw new Mp4AssemblyError('no_tfhd', 'traf has no tfhd');
        if (!tfdt) throw new Mp4AssemblyError('no_tfdt', 'traf has no tfdt');
        const trackId = readU32(tfhd.data, 4);
        const track = movie.tracks.find((t) => t.id === trackId);
        if (!track) throw new Mp4AssemblyError('unknown_track', `Fragment track ${trackId} not in init`);

        const flags = ((tfhd.data[1] << 16) | (tfhd.data[2] << 8) | tfhd.data[3]) >>> 0;
        if (flags & 0x000001) {
            const data = mutableData(tfhd);
            const oldBase = readU64(data, 8);
            if (oldBase < BigInt(moof.start)) {
                throw new Mp4AssemblyError('unsupported_layout', 'tfhd base-data-offset precedes its moof');
            }
            const relative = Number(oldBase - BigInt(moof.start));
            writeU64(data, 8, BigInt(newMoofStart + relative));
        }

        const tfdtData = mutableData(tfdt);
        const version = tfdtData[0];
        const base = trackBaseUnits.has(trackId)
            ? trackBaseUnits.get(trackId)!
            : 0n;
        if (version === 1) {
            writeU64(tfdtData, 4, base);
        } else {
            if (base > 0xffffffffn) throw new Mp4AssemblyError('duration_overflow', 'tfdt v0 overflow');
            writeU32(tfdtData, 4, Number(base));
        }
    }

    const bytes = serialize(moof);
    if (bytes.length !== moof.size) {
        throw new Mp4AssemblyError('unsupported_layout', `moof size changed (${moof.size} -> ${bytes.length})`);
    }
    return bytes;
}

function appendBoxesUntilNextMoof(
    boxes: Mp4Box[],
    moofIndex: number,
    chunkData: Uint8Array,
    parts: Uint8Array[],
    outputOffsetRef: { value: number },
    bytesTotalRef: { value: number },
    chunkSequence: number
): void {
    let mdatCount = 0;
    for (let i = moofIndex + 1; i < boxes.length && boxes[i].type !== 'moof'; i++) {
        const box = boxes[i];
        if (box.type === 'mfra' || box.type === 'sidx' || box.type === 'styp') continue;
        const slice = chunkData.subarray(box.start, box.start + box.size);
        parts.push(slice);
        outputOffsetRef.value += slice.length;
        bytesTotalRef.value += slice.length;
        if (box.type === 'mdat') mdatCount++;
    }
    if (mdatCount === 0) {
        throw new Mp4AssemblyError('no_mdat', `Chunk ${chunkSequence} has no mdat after moof`);
    }
}

function emitPatchedMoof(
    moof: Mp4Box,
    movie: MovieInfo,
    sequence: number,
    newMoofStart: number,
    trackBaseUnits: Map<number, bigint>,
    parts: Uint8Array[],
    outputOffsetRef: { value: number },
    bytesTotalRef: { value: number }
): void {
    const bases = new Map<number, bigint>();
    for (const traf of moof.children?.filter((c) => c.type === 'traf') ?? []) {
        const tfhd = findBox(traf, 'tfhd');
        if (!tfhd) continue;
        const trackId = readU32(tfhd.data, 4);
        bases.set(trackId, trackBaseUnits.get(trackId) ?? 0n);
    }
    const patched = patchFragment(moof, movie, sequence, newMoofStart, bases);
    parts.push(patched);
    outputOffsetRef.value += patched.length;
    bytesTotalRef.value += patched.length;
    for (const traf of moof.children?.filter((c) => c.type === 'traf') ?? []) {
        const tfhd = findBox(traf, 'tfhd');
        if (!tfhd) continue;
        const trackId = readU32(tfhd.data, 4);
        const prev = trackBaseUnits.get(trackId) ?? 0n;
        trackBaseUnits.set(trackId, prev + BigInt(sumTrunSampleDurationUnits(traf)));
    }
}

function trackTimelineEndMs(movie: MovieInfo, trackBaseUnits: Map<number, bigint>): number {
    let maxMs = 0;
    for (const track of movie.tracks) {
        const units = trackBaseUnits.get(track.id) ?? 0n;
        const ms = Math.round(Number(units) * 1000 / track.timescale);
        if (ms > maxMs) maxMs = ms;
    }
    return maxMs;
}

/**
 * Assemble independently downloaded chunks into one valid fragmented MP4.
 */
export function assembleFragmentedMp4(chunks: Mp4ChunkInput[]): Mp4Assembly {
    if (chunks.length === 0) throw new Mp4AssemblyError('empty_input', 'No chunks to assemble');
    const order = [...chunks].sort((a, b) => a.sequence - b.sequence);

    let initFtyp: Uint8Array | null = null;
    let initFtypSource: Uint8Array | null = null;
    let initMoov: Uint8Array | null = null;
    let movie: MovieInfo | null = null;
    let previousEnd = 0;

    // First pass: establish and validate the single init segment.
    for (const chunk of order) {
        if (!Number.isFinite(chunk.durationMs) || chunk.durationMs <= 0) {
            throw new Mp4AssemblyError('invalid_box', `Chunk ${chunk.sequence} has no verified duration`);
        }
        if (chunk.timelineStartMs < 0) {
            throw new Mp4AssemblyError('invalid_box', `Chunk ${chunk.sequence} has a negative timeline origin`);
        }
        // Overlap is worse than a gap: it would duplicate audio/video and make
        // seek targets ambiguous. Only an origin at/after the previous chunk's
        // verified end is structurally assemblable. A real gap stays a gap.
        if (chunk.timelineStartMs < previousEnd) {
            throw new Mp4AssemblyError('schedule_non_monotonic', 'Chunk origins are not monotonic');
        }
        previousEnd = chunk.timelineStartMs + chunk.durationMs;

        const boxes = parseTopLevelBoxes(chunk.data);
        const ftyp = boxes.find((b) => b.type === 'ftyp') ?? null;
        const moov = boxes.find((b) => b.type === 'moov') ?? null;
        const moof = boxes.find((b) => b.type === 'moof') ?? null;
        if (!moof) throw new Mp4AssemblyError('no_moof', `Chunk ${chunk.sequence} has no moof`);
        if (!boxes.some((b) => b.type === 'mdat')) {
            throw new Mp4AssemblyError('no_mdat', `Chunk ${chunk.sequence} has no mdat`);
        }

        if (initMoov === null) {
            if (!ftyp) throw new Mp4AssemblyError('no_ftyp', 'First chunk has no ftyp');
            if (!moov) throw new Mp4AssemblyError('no_moov', 'First chunk has no moov init segment');
            initFtyp = serialize(ftyp);
            initFtypSource = initFtyp;
            movie = parseMovieInfo(moov);
            initMoov = patchInit(moov, movie, order.reduce((sum, c) => Math.max(sum, c.timelineStartMs + c.durationMs), 0));
        } else if (moov) {
            if (!movie) throw new Mp4AssemblyError('no_moov', 'No usable init segment');
            if (ftyp && initFtypSource && !sameBytes(serialize(ftyp), initFtypSource)) {
                throw new Mp4AssemblyError('init_mismatch', `Chunk ${chunk.sequence} ftyp differs from the first chunk`);
            }
            const candidate = parseMovieInfo(moov);
            if (!sameMovieContract(movie, candidate)) {
                throw new Mp4AssemblyError('init_mismatch', `Chunk ${chunk.sequence} track contract differs from the first chunk`);
            }
        } else if (ftyp) {
            throw new Mp4AssemblyError('no_moov', `Chunk ${chunk.sequence} has ftyp but no moov`);
        }
    }

    if (!initFtyp || !initMoov || !movie) {
        throw new Mp4AssemblyError('no_moov', 'No usable init segment');
    }

    const manifestTotalMs = order.reduce((sum, c) => Math.max(sum, c.timelineStartMs + c.durationMs), 0);
    const parts: Uint8Array[] = [initFtyp, initMoov];
    const offsetRef = { value: initFtyp.length + initMoov.length };
    const bytesRef = { value: offsetRef.value };
    const trackBaseUnits = new Map<number, bigint>();
    let fragmentCount = 0;
    let moofSequence = 0;

    for (const chunk of order) {
        const boxes = parseTopLevelBoxes(chunk.data);
        for (let i = 0; i < boxes.length; i++) {
            if (boxes[i].type !== 'moof') continue;
            const moof = boxes[i];
            moofSequence += 1;
            fragmentCount += 1;
            emitPatchedMoof(
                moof,
                movie,
                moofSequence,
                offsetRef.value,
                trackBaseUnits,
                parts,
                offsetRef,
                bytesRef
            );
            appendBoxesUntilNextMoof(boxes, i, chunk.data, parts, offsetRef, bytesRef, chunk.sequence);
        }
    }

    const sampleTotalMs = trackTimelineEndMs(movie, trackBaseUnits);
    const durationMs = sampleTotalMs > 0 ? sampleTotalMs : manifestTotalMs;
    if (durationMs !== manifestTotalMs && Math.abs(durationMs - manifestTotalMs) > 50) {
        const moovBox = parseTopLevelBoxes(parts[1]).find((b) => b.type === 'moov');
        if (moovBox) {
            parts[1] = patchInit(moovBox, movie, durationMs);
        }
    }

    return {
        parts,
        mimeType: 'video/mp4',
        durationMs,
        trackCount: movie.tracks.length,
        videoTrackCount: movie.videoTracks,
        audioTrackCount: movie.audioTracks,
        fragmentCount,
        byteLength: bytesRef.value,
    };
}

/** Exposed for tests/tools: read track facts from any init segment (finalized or fragmented). */
export function inspectMp4Tracks(bytes: Uint8Array): Mp4TrackInfo[] {
    const boxes = parseTopLevelBoxes(bytes);
    const moov = boxes.find((b) => b.type === 'moov');
    if (!moov) throw new Mp4AssemblyError('no_moov', 'No moov');
    return parseMovieInfo(moov, false).tracks;
}

/** Read `mvhd` duration in milliseconds (0 when unset). */
export function readMp4DurationMs(bytes: Uint8Array): number {
    const boxes = parseTopLevelBoxes(bytes);
    const moov = boxes.find((b) => b.type === 'moov');
    if (!moov) throw new Mp4AssemblyError('no_moov', 'No moov');
    const mvhd = findBox(moov, 'mvhd');
    if (!mvhd) throw new Mp4AssemblyError('invalid_box', 'moov has no mvhd');
    const timescale = readMovieTimescale(mvhd);
    if (!timescale) return 0;
    const version = mvhd.data[0];
    const units = version === 1
        ? Number(readU64(mvhd.data, 24))
        : readU32(mvhd.data, 16);
    return Math.round((units * 1000) / timescale);
}

export default assembleFragmentedMp4;
