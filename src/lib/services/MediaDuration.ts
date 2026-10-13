/**
 * @file src/lib/services/MediaDuration.ts
 * @description ROW28 D3 — server-side duration measurement from the REAL
 *              stored bytes (WebM/Matroska + MP4), pure + fetchable halves.
 * @module lib/services/MediaDuration
 *
 * MediaRecorder timeslices are FRAGMENTS, not standalone files: a WebM
 * chunk after the first carries clusters only, and its Segment Info has
 * NO Duration element (Chromium never finalizes a live blob's header).
 * getID3 — or any Duration-element reader — therefore returns nothing for
 * exactly the chunks this platform stores, and the host PREPENDS the init
 * to every stored object (see ChunkInitSegment), so an Info Duration from
 * the init describes the FIRST blob, never the fragment. The only honest
 * measurement is from the actual media timestamps of the stored bytes.
 *
 * WebM: walk the EBML top level; honor TimecodeScale (default 1ms),
 * per-Cluster Timestamp, SimpleBlock / BlockGroup(Block+BlockDuration)
 * relative timestamps; multi-cluster is summed by max-block tracking.
 * The stored end is the LAST block end; a trailing SimpleBlock without
 * BlockDuration contributes its start (≤ one video frame under the true
 * end — never invented, never over-reported). Missing timestamps default
 * to 0 per spec; no block at all → null (fail closed, never ready).
 *
 * MP4: movie duration (mvhd/mehd) when finalized; otherwise the
 * fragmented form (moof → traf tfdt base + trun sample durations, in the
 * per-track mdhd timescale). Neither derivable → null (fail closed).
 *
 * Nothing here trusts a declared duration: the caller publishes `ready`
 * only from a value this module returns.
 */

import { DEFAULT_UPLOAD_URL } from '../../config/defaults';

/** Container formats the pipeline supports. */
export type MeasuredContainer = 'mp4' | 'webm';

/**
 * Upper bound on bytes pulled + structurally scanned for one measurement
 * (register already ceilings a chunk at 60MB; beyond this we fail closed
 * instead of spending Worker memory/time on an impossible object).
 */
export const MAX_MEASURE_BYTES = 64 * 1024 * 1024;

/** Fetch timeout for one stored-object measurement (fail closed on timeout). */
export const MEASURE_TIMEOUT_MS = 15_000;

/** Bounded structural scan: absurd element counts mean corrupt input. */
const MAX_ELEMENTS = 500_000;

// ---------------------------------------------------------------------------
// WebM / Matroska measurement
// ---------------------------------------------------------------------------

const ID_SEGMENT = [0x18, 0x53, 0x80, 0x67];
const ID_INFO = [0x15, 0x49, 0xa9, 0x66];
const ID_TIMECODE_SCALE = [0x2a, 0xd7, 0xb1];
const ID_CLUSTER = [0x1f, 0x43, 0xb6, 0x75];
const ID_TIMESTAMP = [0xe7];
const ID_BLOCK_GROUP = [0xa0];
const ID_BLOCK = [0xa1];
const ID_BLOCK_DURATION = [0x9b];
const ID_SIMPLE_BLOCK = [0xa3];

function sameId(id: number[], known: number[]): boolean {
    return id.length === known.length && id.every((b, i) => b === known[i]);
}

/** EBML element-ID VINT length from the first byte (0 = invalid). */
function idVintLength(b0: number): number {
    if (b0 & 0x80) return 1;
    if (b0 & 0x40) return 2;
    if (b0 & 0x20) return 3;
    if (b0 & 0x10) return 4;
    if (b0 & 0x08) return 5;
    if (b0 & 0x04) return 6;
    if (b0 & 0x02) return 7;
    if (b0 & 0x01) return 8;
    return 0;
}

interface WebmScanState {
    /** TimecodeScale in NANOSECONDS per timecode unit (default 1ms). */
    timecodeScaleNs: number;
    /**
     * The media SPAN this object covers, in timecode units: MediaRecorder
     * timeslices carry ABSOLUTE timestamps since the recording started, so
     * the stored object's own duration is (last block end − first block
     * start), never the absolute end (which grows with the session).
     */
    minBlockStartUnits: number | null;
    maxBlockEndUnits: number;
    sawBlock: boolean;
    elements: number;
}

/** Record one block [start,end) pair into the span tracker. */
function noteBlock(state: WebmScanState, start: number, end: number): void {
    state.sawBlock = true;
    if (state.minBlockStartUnits === null || start < state.minBlockStartUnits) {
        state.minBlockStartUnits = start;
    }
    if (end > state.maxBlockEndUnits) state.maxBlockEndUnits = end;
}

/** Big-endian unsigned int over `len` bytes (leading zeros tolerated). */
function readUint(bytes: Uint8Array, start: number, len: number): number {
    let v = 0;
    for (let i = 0; i < len; i++) v = v * 256 + bytes[start + i];
    return v;
}

/** EBML data-size VINT: {size | null}, null = unknown (all-ones sentinel). */
function readSizeVint(bytes: Uint8Array, pos: number): { size: number | null; next: number } {
    const b0 = bytes[pos];
    const len = idVintLength(b0);
    if (len === 0 || pos + len > bytes.length) return { size: null, next: bytes.length };
    const firstMask = 0xff >> len; // payload bits of the marker byte
    let value = 0;
    let allOnes = true;
    for (let i = 0; i < len; i++) {
        const b = bytes[pos + i];
        const payload = i === 0 ? (b & firstMask) : b;
        value = value * 256 + payload;
        if (payload !== (i === 0 ? firstMask : 0xff)) allOnes = false;
    }
    if (allOnes) return { size: null, next: pos + len }; // spec unknown-size
    return { size: value, next: pos + len };
}

/** One element header: id bytes + declared content bounds. */
interface Element {
    id: number[];
    start: number;
    contentStart: number;
    contentEnd: number;
}

function readElement(bytes: Uint8Array, pos: number, limit: number): Element | null {
    if (pos >= limit) return null;
    const idLen = idVintLength(bytes[pos]);
    if (idLen === 0 || pos + idLen > limit) return null;
    const id = Array.from(bytes.subarray(pos, pos + idLen));
    const sizeRead = readSizeVint(bytes, pos + idLen);
    const contentStart = sizeRead.next;
    const contentEnd = sizeRead.size === null
        ? limit // unknown size: parse to the parent bound
        : Math.min(limit, contentStart + sizeRead.size);
    if (contentStart > limit) return null;
    return { id, start: pos, contentStart, contentEnd };
}

function skipElement(state: WebmScanState, el: Element): number {
    state.elements++;
    return el.contentEnd;
}

/** Block header: track VINT + signed int16 relative timecode. */
function readBlockRelative(bytes: Uint8Array, start: number, limit: number): number | null {
    if (start >= limit) return null;
    const trackLen = idVintLength(bytes[start]);
    if (trackLen === 0) return null;
    const tsPos = start + trackLen;
    if (tsPos + 2 > limit) return null;
    const raw = readUint(bytes, tsPos, 2);
    return raw >= 0x8000 ? raw - 0x10000 : raw; // signed int16 BE
}

function scanBlockLike(state: WebmScanState, bytes: Uint8Array, el: Element, clusterTs: number): void {
    const rel = readBlockRelative(bytes, el.contentStart, el.contentEnd);
    if (rel === null) return;
    // SimpleBlock carries no duration of its own: its end is its start
    // (≤ one frame under the true end — the span tolerance).
    noteBlock(state, clusterTs + rel, clusterTs + rel);
}

function scanCluster(state: WebmScanState, bytes: Uint8Array, cluster: Element): void {
    let clusterTs = 0;
    let pos = cluster.contentStart;
    while (pos < cluster.contentEnd && state.elements < MAX_ELEMENTS) {
        const child = readElement(bytes, pos, cluster.contentEnd);
        if (!child) break;
        state.elements++;
        if (sameId(child.id, ID_TIMESTAMP)) {
            const v = readUint(bytes, child.contentStart, Math.min(8, child.contentEnd - child.contentStart));
            clusterTs = v;
            pos = child.contentEnd;
        } else if (sameId(child.id, ID_SIMPLE_BLOCK)) {
            scanBlockLike(state, bytes, child, clusterTs);
            pos = child.contentEnd;
        } else if (sameId(child.id, ID_BLOCK_GROUP)) {
            // Block (0xA1) + optional BlockDuration (0x9B, timecode units).
            let rel = 0;
            let dur = 0;
            let gpos = child.contentStart;
            while (gpos < child.contentEnd && state.elements < MAX_ELEMENTS) {
                const gchild = readElement(bytes, gpos, child.contentEnd);
                if (!gchild) break;
                state.elements++;
                if (sameId(gchild.id, ID_BLOCK)) {
                    const r = readBlockRelative(bytes, gchild.contentStart, gchild.contentEnd);
                    if (r !== null) rel = r;
                } else if (sameId(gchild.id, ID_BLOCK_DURATION)) {
                    dur = readUint(bytes, gchild.contentStart, Math.min(8, gchild.contentEnd - gchild.contentStart));
                }
                gpos = gchild.contentEnd;
            }
            noteBlock(state, clusterTs + rel, clusterTs + rel + dur);
            pos = child.contentEnd;
        } else {
            pos = child.contentEnd;
        }
    }
}

function scanTopLevel(state: WebmScanState, bytes: Uint8Array, start: number, limit: number): void {
    let pos = start;
    while (pos < limit && state.elements < MAX_ELEMENTS) {
        const el = readElement(bytes, pos, limit);
        if (!el) break;
        state.elements++;
        if (sameId(el.id, ID_SEGMENT)) {
            // The prepended-init object can carry a Segment size that
            // under-covers the appended fragment clusters, so children are
            // walked to the BUFFER bound, not the declared Segment size.
            scanTopLevel(state, bytes, el.contentStart, bytes.length);
            return;
        }
        if (sameId(el.id, ID_INFO)) {
            let ipos = el.contentStart;
            while (ipos < el.contentEnd && state.elements < MAX_ELEMENTS) {
                const child = readElement(bytes, ipos, el.contentEnd);
                if (!child) break;
                state.elements++;
                if (sameId(child.id, ID_TIMECODE_SCALE)) {
                    const v = readUint(bytes, child.contentStart, child.contentEnd - child.contentStart);
                    if (v > 0) state.timecodeScaleNs = v;
                }
                ipos = child.contentEnd;
            }
            pos = el.contentEnd;
        } else if (sameId(el.id, ID_CLUSTER)) {
            scanCluster(state, bytes, el);
            pos = el.contentEnd;
        } else {
            pos = skipElement(state, el);
        }
    }
}

/**
 * Measure the media SPAN of a WebM object (init-prepended fragment
 * included) from its real bytes: (last block end − first block start) in
 * the object's own timecode units. MediaRecorder timeslices continue the
 * session timeline, so a 10–15s chunk measures ~5s — never the absolute
 * end timestamp. Returns milliseconds, or null when no block timestamp
 * can be verified (fail closed — never ready, never invented).
 */
export function measureWebmDurationMs(bytes: Uint8Array): number | null {
    if (bytes.length < 4) return null;
    const state: WebmScanState = {
        timecodeScaleNs: 1_000_000, minBlockStartUnits: null, maxBlockEndUnits: 0,
        sawBlock: false, elements: 0,
    };
    scanTopLevel(state, bytes, 0, bytes.length);
    if (!state.sawBlock || state.minBlockStartUnits === null) return null;
    const spanUnits = state.maxBlockEndUnits - state.minBlockStartUnits;
    if (spanUnits <= 0) return null; // a single block has no measurable span
    const durationMs = (spanUnits * state.timecodeScaleNs) / 1_000_000;
    if (!Number.isFinite(durationMs) || durationMs <= 0) return null;
    return Math.round(durationMs);
}

// ---------------------------------------------------------------------------
// MP4 measurement (finalized movie or fragmented recording)
// ---------------------------------------------------------------------------

interface Mp4Box { type: string; start: number; end: number; bodyStart: number; bodyEnd: number; }

function u32(bytes: Uint8Array, pos: number): number {
    return readUint(bytes, pos, 4);
}

function u64(bytes: Uint8Array, pos: number): number {
    return readUint(bytes, pos, 8);
}

/** Walk sibling boxes in [start,end); unknown/invalid sizes stop the walk. */
function eachBox(
    bytes: Uint8Array, start: number, end: number,
    visit: (box: Mp4Box) => void,
): void {
    let pos = start;
    let guard = 0;
    while (pos + 8 <= end && guard++ < MAX_ELEMENTS) {
        let size = u32(bytes, pos);
        const type = String.fromCharCode(bytes[pos + 4], bytes[pos + 5], bytes[pos + 6], bytes[pos + 7]);
        let bodyStart = pos + 8;
        if (size === 1) {
            if (pos + 16 > end) return;
            size = u64(bytes, pos + 8);
            bodyStart = pos + 16;
        } else if (size === 0) {
            size = end - pos; // to end of buffer
        }
        if (size < 8 || pos + size > end) return;
        visit({ type, start: pos, end: pos + size, bodyStart, bodyEnd: pos + size });
        pos += size;
    }
}

function fullBoxVersion(bytes: Uint8Array, bodyStart: number): number {
    return bytes[bodyStart];
}

/** mvhd duration (ms) when the movie header carries a positive duration. */
function movieDurationMs(bytes: Uint8Array, moov: Mp4Box): number | null {
    // mvhd: version(1)+flags(3), creation(4), modification(4), timescale(4),
    // duration(4) [v0] — v1 widens creation+modification to 8 bytes each.
    for (const b of childBoxes(bytes, moov.bodyStart, moov.bodyEnd)) {
        if (b.type !== 'mvhd') continue;
        const v = fullBoxVersion(bytes, b.bodyStart);
        const timescale = v === 1 ? u32(bytes, b.bodyStart + 20) : u32(bytes, b.bodyStart + 12);
        const duration = v === 1 ? u64(bytes, b.bodyStart + 24) : u32(bytes, b.bodyStart + 16);
        if (timescale > 0 && duration > 0) return Math.round((duration * 1000) / timescale);
    }
    return null;
}

/** mehd fragment duration (ms) when present. */
function movieExtendsDurationMs(bytes: Uint8Array, moov: Mp4Box): number | null {
    const children = childBoxes(bytes, moov.bodyStart, moov.bodyEnd);
    let movieTimescale: number | null = null;
    for (const b of children) {
        if (b.type !== 'mvhd') continue;
        const v = fullBoxVersion(bytes, b.bodyStart);
        movieTimescale = v === 1 ? u32(bytes, b.bodyStart + 20) : u32(bytes, b.bodyStart + 12);
    }
    for (const b of children) {
        if (b.type !== 'mvex') continue;
        for (const mehd of childBoxes(bytes, b.bodyStart, b.bodyEnd)) {
            if (mehd.type !== 'mehd') continue;
            const v = fullBoxVersion(bytes, mehd.bodyStart);
            const fragDur = v === 1 ? u64(bytes, mehd.bodyStart + 4) : u32(bytes, mehd.bodyStart + 4);
            if (movieTimescale && fragDur > 0) {
                return Math.round((fragDur * 1000) / movieTimescale);
            }
        }
    }
    return null;
}

/** trak → {track_ID: mdhd timescale} map from the movie header. */
function trackTimescales(bytes: Uint8Array, moov: Mp4Box): Map<number, number> {
    const map = new Map<number, number>();
    for (const trak of findBoxes(bytes, moov.bodyStart, moov.bodyEnd, 'trak')) {
        let trackId: number | null = null;
        let timescale: number | null = null;
        for (const tkhd of findBoxes(bytes, trak.bodyStart, trak.bodyEnd, 'tkhd')) {
            // tkhd: version+flags(4), creation, modification, track_ID...
            const v = fullBoxVersion(bytes, tkhd.bodyStart);
            trackId = v === 1 ? u32(bytes, tkhd.bodyStart + 20) : u32(bytes, tkhd.bodyStart + 12);
        }
        for (const mdia of findBoxes(bytes, trak.bodyStart, trak.bodyEnd, 'mdia')) {
            for (const mdhd of findBoxes(bytes, mdia.bodyStart, mdia.bodyEnd, 'mdhd')) {
                // mdhd: version+flags(4), creation, modification, timescale...
                const v = fullBoxVersion(bytes, mdhd.bodyStart);
                timescale = v === 1 ? u32(bytes, mdhd.bodyStart + 20) : u32(bytes, mdhd.bodyStart + 12);
            }
        }
        if (trackId !== null && timescale !== null && timescale > 0) {
            map.set(trackId, timescale);
        }
    }
    return map;
}

/**
 * moof-walk: the SPAN the object's fragments cover, per track — tfdt base
 * times are absolute since the start of the fragmented stream, so the
 * chunk's own duration is (last fragment end − first fragment base), never
 * the absolute end. MP4 MediaRecorder chunks keep this absolute timeline,
 * so the span must be computed, not read from a movie header.
 */
function fragmentedDurationMs(bytes: Uint8Array, moofs: Mp4Box[], tracks: Map<number, number>): number | null {
    const spanByTrack = new Map<number, { minBase: number; maxEnd: number }>();
    for (const moof of moofs) {
        for (const traf of findBoxes(bytes, moof.bodyStart, moof.bodyEnd, 'traf')) {
            let trackId: number | null = null;
            let defaultDuration = 0;
            let baseTime = 0;
            let sampleSum = 0;
            let sawSamples = false;
            for (const child of childBoxes(bytes, traf.bodyStart, traf.bodyEnd)) {
                if (child.type === 'tfhd') {
                    const flags = (bytes[child.bodyStart + 1] << 16) | (bytes[child.bodyStart + 2] << 8) | bytes[child.bodyStart + 3];
                    trackId = u32(bytes, child.bodyStart + 4);
                    let p = child.bodyStart + 8;
                    if (flags & 0x000001) p += 8; // base_data_offset
                    if (flags & 0x000002) p += 4; // sample_description_index
                    if (flags & 0x000008) { defaultDuration = u32(bytes, p); p += 4; }
                } else if (child.type === 'tfdt') {
                    const v = fullBoxVersion(bytes, child.bodyStart);
                    baseTime = v === 1 ? u64(bytes, child.bodyStart + 4) : u32(bytes, child.bodyStart + 4);
                } else if (child.type === 'trun') {
                    const flags = (bytes[child.bodyStart + 1] << 16) | (bytes[child.bodyStart + 2] << 8) | bytes[child.bodyStart + 3];
                    const sampleCount = u32(bytes, child.bodyStart + 4);
                    let p = child.bodyStart + 8;
                    if (flags & 0x000001) p += 4; // data_offset
                    if (flags & 0x000002) p += 4; // first_sample_flags
                    for (let i = 0; i < sampleCount && p + 4 <= child.bodyEnd; i++) {
                        if (flags & 0x000100) { sampleSum += u32(bytes, p); p += 4; }
                        else { sampleSum += defaultDuration; }
                        if (flags & 0x000200) p += 4; // sample_size
                        if (flags & 0x000400) p += 4; // sample_flags
                        if (flags & 0x000800) p += 4; // composition offset
                    }
                    sawSamples = true;
                }
            }
            if (trackId === null) continue;
            const timescale = tracks.get(trackId);
            if (!timescale || !sawSamples) continue;
            const cur = spanByTrack.get(trackId) ?? { minBase: baseTime, maxEnd: 0 };
            cur.minBase = Math.min(cur.minBase, baseTime);
            cur.maxEnd = Math.max(cur.maxEnd, baseTime + sampleSum);
            spanByTrack.set(trackId, cur);
        }
    }
    let maxSpanMs: number | null = null;
    for (const [trackId, span] of spanByTrack) {
        const timescale = tracks.get(trackId);
        if (!timescale) continue;
        const spanMs = ((span.maxEnd - span.minBase) * 1000) / timescale;
        if (spanMs > (maxSpanMs ?? 0)) maxSpanMs = Math.round(spanMs);
    }
    return maxSpanMs;
}
/** All sibling boxes in [start,end), in document order. */
function childBoxes(bytes: Uint8Array, start: number, end: number): Mp4Box[] {
    const found: Mp4Box[] = [];
    eachBox(bytes, start, end, (b) => { found.push(b); });
    return found;
}

/** Top-level (or sibling) boxes of one type, in document order. */
function findBoxes(bytes: Uint8Array, start: number, end: number, type: string): Mp4Box[] {
    const found: Mp4Box[] = [];
    eachBox(bytes, start, end, (b) => { if (b.type === type) found.push(b); });
    return found;
}

/**
 * Measure an MP4 object from its real bytes. A FRAGMENTED object (moof
 * boxes present — every init-prepended MediaRecorder chunk) is measured
 * ONLY from its own moof/tfdt/trun timeline: the prepended init's
 * mvhd/mehd describe the whole (growing) movie and would over-report
 * every later chunk. A non-fragmented object falls back to the movie
 * header (mvhd → mehd). Nothing verifiable → null (fail closed).
 */
export function measureMp4DurationMs(bytes: Uint8Array): number | null {
    const movie = findBoxes(bytes, 0, bytes.length, 'moov')[0] ?? null;
    const moofs = findBoxes(bytes, 0, bytes.length, 'moof');
    if (moofs.length > 0) {
        if (movie) {
            const tracks = trackTimescales(bytes, movie);
            if (tracks.size > 0) {
                const fragmented = fragmentedDurationMs(bytes, moofs, tracks);
                if (fragmented !== null && fragmented > 0) return fragmented;
            }
        }
        // moof present but not derivable: fail closed — a stale movie
        // header must NEVER stand in for the fragment's own span.
        return null;
    }
    if (movie) {
        const finalized = movieDurationMs(bytes, movie);
        if (finalized !== null && finalized > 0) return finalized;
        const extendsDur = movieExtendsDurationMs(bytes, movie);
        if (extendsDur !== null && extendsDur > 0) return extendsDur;
    }
    return null;
}

/** Dispatch by container (unknown container → null). */
export function measureDurationMs(bytes: Uint8Array, container: MeasuredContainer): number | null {
    if (bytes.length === 0) return null;
    if (container === 'webm') return measureWebmDurationMs(bytes);
    if (container === 'mp4') return measureMp4DurationMs(bytes);
    return null;
}

/**
 * Fetch the REAL stored bytes of one chunk object from the upload host and
 * measure them server-side. Any failure (unreachable host, non-200,
 * oversized, unparsable) returns null — the caller must fail closed and
 * leave the slot unverified (never ready, never invented).
 */
export async function measureStoredChunkDuration(
    env: { FFMPEG_SERVER_URL?: string } | undefined,
    objectPath: string,
    container: MeasuredContainer,
): Promise<number | null> {
    if (!objectPath) return null;
    const base = (env?.FFMPEG_SERVER_URL || DEFAULT_UPLOAD_URL).replace(/\/+$/, '');
    try {
        const res = await fetch(`${base}/stream.php?path=${encodeURIComponent(objectPath)}`, {
            signal: AbortSignal.timeout(MEASURE_TIMEOUT_MS),
        });
        if (!res.ok) return null;
        const buf = new Uint8Array(await res.arrayBuffer());
        if (buf.length === 0 || buf.length > MAX_MEASURE_BYTES) return null;
        return measureDurationMs(buf, container);
    } catch {
        return null; // unreachable/timeout/unparsable — fail closed
    }
}
