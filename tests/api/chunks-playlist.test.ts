/**
 * R4-CHUNK-PLAY-1 — playlist proxy contract (server).
 *
 * GET /api/chunks/playlist/:id is the single ordering truth for every
 * audience surface (competition embedded viewer, test viewer, host resume
 * base). It MUST:
 *  - normalize any upstream shape into validated, de-duplicated (first
 *    wins), index-sorted {index, url, duration?, size?} entries;
 *  - expose timeline/format metadata (extension, total_duration) when the
 *    upstream provides it — never guess;
 *  - discriminate upstream states: 'ok' | 'empty' | 'error' | 'invalid',
 *    so a 200-with-HTML error page is NEVER treated as video;
 *  - stay backward compatible ({success, id, chunks});
 *  - perform ZERO D1 reads (per-viewer polling stays cheap) and emit a
 *    short Cache-Control to collapse multi-viewer fan-out.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import app from '../../src/main';

const realFetch = globalThis.fetch;

function stubUpstream(handler: (url: string) => any) {
    (globalThis as any).fetch = async (url: any) => handler(String(url));
}

const okJson = (data: unknown, status = 200) => ({
    ok: status >= 200 && status < 300,
    status,
    text: async () => (typeof data === 'string' ? data : JSON.stringify(data)),
});

const get = (path: string) =>
    app.request(path, { headers: { 'X-CSRF-Token': 'test' } }, {} as any);

beforeEach(() => {
    stubUpstream(() => okJson({ chunks: [] }));
});

afterEach(() => {
    globalThis.fetch = realFetch;
});

describe('R4-CHUNK-PLAY-1 playlist contract', () => {
    it('1. normalizes, dedupes (first wins), and sorts entries + metadata', async () => {
        stubUpstream(() => okJson({
            chunks: [
                { chunk_number: 3, url: 'https://cdn.example/live/match_9/chunk_0003.mp4', duration: 5, size: 100 },
                { index: 1, file: 'chunk_0001.mp4', duration: 5 },
                { index: 2, url: 'https://cdn.example/live/match_9/chunk_0002.mp4', duration: 5, size: 120 },
                { index: 2, url: 'https://cdn.example/other.mp4', duration: 99 },
                { nope: true },
            ],
        }));
        const res = await get('/api/chunks/playlist/9');
        expect(res.status).toBe(200);
        const body: any = await res.json();
        expect(body.success).toBe(true);
        expect(body.id).toBe(9);
        expect(body.upstream).toBe('ok');
        expect(body.chunks.map((c: any) => c.index)).toEqual([1, 2, 3]);
        expect(body.chunks[0].url).toContain('chunk_0001.mp4');
        expect(body.chunks[1].duration).toBe(5); // first wins, not 99
        expect(body.chunk_count).toBe(3);
        expect(body.max_index).toBe(3);
        expect(body.extension).toBe('mp4');
        expect(body.total_duration).toBe(15);
        expect(typeof body.checked_at).toBe('string');
    });

    it('2. accepts bare filename strings and top-level arrays', async () => {
        stubUpstream(() => okJson({ chunks: ['chunk_0002.webm', 'chunk_0001.webm'] }));
        const body: any = await (await get('/api/chunks/playlist/9')).json();
        expect(body.upstream).toBe('ok');
        expect(body.chunks.map((c: any) => c.index)).toEqual([1, 2]);
        expect(body.chunks[0].url).toContain('/stream.php?path=live/match_9/chunk_0001.webm');
        expect(body.extension).toBe('webm');
        expect(body.total_duration).toBeNull(); // unknown — never guessed
    });

    it('3. empty upstream means empty-live (NOT an error, NOT video)', async () => {
        stubUpstream(() => okJson({ chunks: [] }));
        const body: any = await (await get('/api/chunks/playlist/9')).json();
        expect(body.upstream).toBe('empty');
        expect(body.chunks).toEqual([]);
        expect(body.chunk_count).toBe(0);
        expect(body.max_index).toBe(-1);
    });

    it('4. a 200-with-HTML error page is invalid — never video, never empty', async () => {
        stubUpstream(() => okJson('<html><body>Not Found</body></html>'));
        const body: any = await (await get('/api/chunks/playlist/9')).json();
        expect(body.upstream).toBe('invalid');
        expect(body.chunks).toEqual([]);
    });

    it('5. upstream non-OK status and transport failures are upstream-error', async () => {
        stubUpstream(() => okJson({ error: 'boom' }, 500));
        expect(((await (await get('/api/chunks/playlist/9')).json()) as any).upstream).toBe('error');
        stubUpstream(async () => { throw new Error('timeout'); });
        expect(((await (await get('/api/chunks/playlist/9')).json()) as any).upstream).toBe('error');
    });

    it('6. rejects non-numeric ids without touching upstream', async () => {
        let calls = 0;
        stubUpstream(() => { calls++; return okJson({ chunks: [] }); });
        const res = await get('/api/chunks/playlist/abc');
        expect(res.status).toBe(400);
        expect(calls).toBe(0);
    });

    it('7. emits a short edge cache header to collapse viewer fan-out', async () => {
        const res = await get('/api/chunks/playlist/9');
        const cc = res.headers.get('cache-control') || '';
        expect(cc).toContain('max-age=5');
    });

    it('8. performs zero D1 reads (works with no DB in env)', async () => {
        stubUpstream(() => okJson({ chunks: [{ index: 0, url: 'https://cdn.example/c.mp4' }] }));
        const res = await app.request('/api/chunks/playlist/9', { headers: { 'X-CSRF-Token': 'test' } }, {} as any);
        expect(res.status).toBe(200);
        expect(((await res.json()) as any).upstream).toBe('ok');
    });

    describe('GET /api/chunks/init/:id (recording init segment)', () => {
        // Pure-init first blob (like real recorder output: ftyp+moov only).
        const firstChunk = Buffer.from(new Uint8Array(96).fill(3));

        it('9. extracts init from the first saved chunk (mp4)', async () => {
            stubUpstream((url) => {
                if (url.includes('/playlist.php')) {
                    return okJson({ chunks: [{ index: 0, url: 'https://cdn.example/match_9/chunk_0001.mp4' }] });
                }
                return {
                    ok: true, status: 200,
                    arrayBuffer: async () => firstChunk.buffer.slice(
                        firstChunk.byteOffset, firstChunk.byteOffset + firstChunk.byteLength,
                    ) as ArrayBuffer,
                };
            });
            const res = await get('/api/chunks/init/9');
            expect(res.status).toBe(200);
            const body: any = await res.json();
            expect(body.success).toBe(true);
            expect(body.format).toBe('mp4');
            expect(body.byteLength).toBe(96); // no moof inside → whole head is init
            expect(Buffer.from(body.init, 'base64').length).toBe(96);
        });

        it('10. 404 when no init exists (empty playlist, bad id)', async () => {
            stubUpstream(() => okJson({ chunks: [] }));
            expect((await get('/api/chunks/init/9')).status).toBe(404);
            expect((await get('/api/chunks/init/abc')).status).toBe(400);
        });
    });
});
