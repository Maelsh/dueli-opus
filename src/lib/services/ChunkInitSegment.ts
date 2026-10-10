/**
 * Media init-segment helpers (pure, zero imports).
 * R4-CHUNK-PLAY-1: MediaRecorder timeslices are FRAGMENTS — every blob after
 * the first lacks init bytes (mp4 ftyp+moov / webm header) and can never
 * decode alone. Shared by the platform playlist/init routes (server) and the
 * host ChunkUploader (browser) so both sides cut init identically.
 */

/** Container formats the pipeline supports. */
export type InitContainerFormat = 'mp4' | 'webm';

/**
 * Find the end of the init segment: mp4 → start of the first 'moof' box
 * (minus its 4-byte size field); webm → start of the first Cluster
 * (0x1F43B675). Returns -1 when the whole head is init (pure init blob).
 */
export function findInitEnd(buf: Uint8Array, format: string): number {
    if (format === 'mp4') {
        for (let i = 0; i + 8 < buf.length; i++) {
            if (buf[i + 4] === 0x6d && buf[i + 5] === 0x6f && buf[i + 6] === 0x6f && buf[i + 7] === 0x66) {
                return i;
            }
        }
        return -1;
    }
    for (let i = 0; i + 4 < buf.length; i++) {
        if (buf[i] === 0x1f && buf[i + 1] === 0x43 && buf[i + 2] === 0xb6 && buf[i + 3] === 0x75) {
            return i;
        }
    }
    return -1;
}

/**
 * Split head bytes into init segment vs first media. Returns the init
 * bytes, or null when the head carries no recognizable init (caller must
 * NOT prepend garbage — upload raw and let the audience skip on failure).
 */
export function extractInitSegment(
    head: Uint8Array,
    format: string,
): { init: Uint8Array; format: InitContainerFormat } | null {
    if (format !== 'mp4' && format !== 'webm') return null;
    if (head.length === 0) return null;
    const cut = findInitEnd(head, format);
    const init = cut > 0 ? head.subarray(0, cut) : head;
    if (init.length === 0) return null;
    return { init, format };
}

export default findInitEnd;
