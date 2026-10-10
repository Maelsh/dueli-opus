/**
 * Local ffmpeg-server test double for the R4-CHUNK-PLAY-1 audience spec.
 *
 * Implements ONLY the contract the platform touches:
 *  GET  /time.php                       → { timestamp }
 *  POST /upload.php (multipart)         → stores the chunk bytes, {success:true}
 *  GET  /playlist.php?id=               → { chunks: [{index,url,size}] } (no durations — honest)
 *  GET  /stream.php?path=live/match_ID/chunk_NNNN.ext → stored bytes (video/*)
 *  POST /finalize.php                   → counts the call, {success:true}
 *  GET  /state?comp=ID                  → { chunks:[numbers], uploads, finalizeCalls, playlistHits } (assertions)
 *  GET  /health                         → {ok:true} (spec gating)
 *
 * Standalone: `node tests/e2e/ffmpeg-stub.mjs <port>`.
 * Test-only helper — never ships, never touches production.
 */
import { createServer } from 'node:http';
import { createServer as createHttpsServer } from 'node:https';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const store = new Map(); // compId -> [{ n, bytes, ext, at }]
const finalizeCalls = [];
const playlistHits = [];
const uploads = [];

function compChunks(compId) {
    if (!store.has(compId)) store.set(compId, []);
    return store.get(compId);
}

function parseMultipart(body, boundary) {
    const fields = {};
    const files = {};
    const sep = Buffer.from('--' + boundary);
    const parts = [];
    let start = 0;
    while (true) {
        const i = body.indexOf(sep, start);
        if (i === -1) break;
        parts.push(body.subarray(start, i));
        start = i + sep.length;
    }
    for (const part of parts) {
        const headEnd = part.indexOf('\r\n\r\n');
        if (headEnd === -1) continue;
        const head = part.subarray(0, headEnd).toString('latin1');
        let data = part.subarray(headEnd + 4);
        if (data.subarray(data.length - 2).toString() === '\r\n') data = data.subarray(0, data.length - 2);
        const name = (head.match(/name="([^"]+)"/) || [])[1];
        const filename = (head.match(/filename="([^"]+)"/) || [])[1];
        if (!name) continue;
        if (filename) files[name] = { filename, data: Buffer.from(data) };
        else fields[name] = data.toString('utf8');
    }
    return { fields, files };
}

function readBody(req) {
    return new Promise((resolve, reject) => {
        const chunks = [];
        req.on('data', (c) => chunks.push(c));
        req.on('end', () => resolve(Buffer.concat(chunks)));
        req.on('error', reject);
    });
}

function json(res, code, obj, extraHeaders) {
    const body = JSON.stringify(obj);
    res.writeHead(code, { 'content-type': 'application/json', 'content-length': Buffer.byteLength(body), 'access-control-allow-origin': '*', ...(extraHeaders || {}) });
    res.end(body);
}

export function startStub(port, opts) {
    opts = opts || {};
    const servers = [];
    const base = (https) => `${https ? 'https' : 'http'}://127.0.0.1:${https ? opts.httpsPort || port : port}`;
    const handler = async (req, res) => {
        try {
            const url = new URL(req.url || '/', 'http://x');
            const path = url.pathname;
            if (req.method === 'GET' && path === '/health') return json(res, 200, { ok: true });
            if (req.method === 'GET' && path === '/time.php') return json(res, 200, { timestamp: Date.now() });

            if (req.method === 'POST' && path === '/upload.php') {
                const ctype = req.headers['content-type'] || '';
                const boundary = (ctype.match(/boundary=(.+)$/) || [])[1];
                if (!boundary) return json(res, 400, { success: false, error: 'no boundary' });
                const body = await readBody(req);
                const { fields, files } = parseMultipart(body, boundary);
                const compId = String(fields.competition_id || '');
                const n = Number(fields.chunk_number || 0);
                const file = files.chunk;
                if (!compId || !Number.isFinite(n) || n <= 0 || !file) {
                    return json(res, 400, { success: false, error: 'missing fields' });
                }
                const ext = (file.filename.match(/\.(mp4|webm)$/i) || [])[1]?.toLowerCase() || 'webm';
                const list = compChunks(compId);
                const at = Date.now();
                const existing = list.findIndex((c) => c.n === n);
                const row = { n, bytes: file.data, ext, at };
                if (existing >= 0) list[existing] = row; // idempotent same-number retry
                else list.push(row);
                uploads.push({ compId, n, bytes: file.data.length, at });
                return json(res, 200, { success: true, chunk: file.filename });
            }

            if (req.method === 'GET' && path === '/playlist.php') {
                const compId = String(url.searchParams.get('id') || '');
                playlistHits.push({ compId, at: Date.now() });
                const list = compChunks(compId).slice().sort((a, b) => a.n - b.n);
                return json(res, 200, {
                    chunks: list.map((c) => ({
                        index: c.n - 1,
                        url: `${opts.publicBase || base(false)}/stream.php?path=live/match_${compId}/chunk_${String(c.n).padStart(4, '0')}.${c.ext}`,
                        size: c.bytes.length,
                    })),
                });
            }

            if (req.method === 'GET' && path === '/stream.php') {
                const p = String(url.searchParams.get('path') || '');
                const m = p.match(/^live\/match_(\d+)\/(chunk_\d+\.(mp4|webm))$/i);
                if (!m) return json(res, 404, { success: false });
                const row = compChunks(m[1]).find((c) => `chunk_${String(c.n).padStart(4, '0')}.${c.ext}` === m[2]);
                if (!row) return json(res, 404, { success: false });
                const ct = row.ext === 'mp4' ? 'video/mp4' : 'video/webm';
                res.writeHead(200, {
                    'content-type': ct,
                    'content-length': row.bytes.length,
                    'access-control-allow-origin': '*',
                    'accept-ranges': 'bytes',
                });
                return res.end(row.bytes);
            }

            if (req.method === 'POST' && path === '/finalize.php') {
                await readBody(req).catch(() => Buffer.alloc(0));
                finalizeCalls.push({ at: Date.now() });
                return json(res, 200, { success: true });
            }

            if (req.method === 'GET' && path === '/state') {
                const compId = String(url.searchParams.get('comp') || '');
                const list = compChunks(compId).slice().sort((a, b) => a.n - b.n);
                return json(res, 200, {
                    chunks: list.map((c) => c.n),
                    uploads: uploads.filter((u) => u.compId === compId),
                    finalizeCalls: finalizeCalls.length,
                    playlistHits: playlistHits.filter((h) => h.compId === compId).map((h) => h.at),
                });
            }

            return json(res, 404, { success: false, error: 'unknown stub route' });
        } catch (e) {
            return json(res, 500, { success: false, error: String((e && e.message) || e) });
        }
    };
    return new Promise((resolve) => {
        const ready = [];
        const done = () => {
            if (ready.length === servers.length) {
                resolve({
                    url: base(!!opts.httpsPort),
                    close: () => Promise.all(servers.map((s) => new Promise((r) => s.close(() => r())))),
                });
            }
        };
        const listen = (server, listenPort) => server.listen(listenPort, '127.0.0.1', () => {
            ready.push(listenPort);
            console.log(`ffmpeg-stub listening on ${listenPort}`);
            done();
        });
        if (opts.httpsPort) {
            const httpsServer = createHttpsServer(
                { key: readFileSync(opts.key), cert: readFileSync(opts.cert) },
                handler,
            );
            servers.push(httpsServer);
            listen(httpsServer, opts.httpsPort);
        }
        if (opts.httpPort !== false) {
            const httpServer = createServer(handler);
            servers.push(httpServer);
            listen(httpServer, port);
        }
    });
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
    // argv: port [--https-port P --cert C --key K --public-base URL]
    // The browser leg needs https: (app media-src CSP); the platform proxy
    // leg needs plain http (workerd rejects the test self-signed cert), so
    // both can run side by side sharing one store. publicBase rewrites the
    // chunk URLs advertised in playlist.php (browser-facing).
    const port = Number(process.argv[2] || 4931);
    const opts = {};
    for (let i = 3; i < process.argv.length; i += 2) {
        const flag = process.argv[i];
        const val = process.argv[i + 1];
        if (flag === '--https-port') opts.httpsPort = Number(val);
        else if (flag === '--cert') opts.cert = val;
        else if (flag === '--key') opts.key = val;
        else if (flag === '--public-base') opts.publicBase = val;
        else if (flag === '--http-only') { opts.httpOnly = true; i -= 1; }
    }
    if (opts.httpOnly) delete opts.httpsPort;
    startStub(port, opts).then((s) => console.log(`ffmpeg-stub ready at ${s.url}`));
}
