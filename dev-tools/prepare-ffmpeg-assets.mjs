/**
 * R4-CHUNK-DOWNLOAD-1: prepare self-hosted FFmpeg.wasm assets.
 *
 * Cloudflare Pages rejects any single static file above 25 MiB. The official
 * single-threaded `@ffmpeg/core` wasm is 32,232,419 bytes, so it is split into
 * two deterministic parts (< 25 MiB each). The worker concatenates and
 * verifies them at runtime. No CDN is involved.
 *
 * Generated files live under public/static/ffmpeg and are gitignored; the
 * source of truth remains node_modules/@ffmpeg/core pinned in package.json.
 */
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = join(root, 'node_modules', '@ffmpeg', 'core', 'dist', 'umd');
const outDir = join(root, 'public', 'static', 'ffmpeg');
const PART_BYTES = 16 * 1024 * 1024; // 16 MiB < Cloudflare Pages' 25 MiB

const coreJs = join(sourceDir, 'ffmpeg-core.js');
const coreWasm = join(sourceDir, 'ffmpeg-core.wasm');

for (const file of [coreJs, coreWasm]) {
  if (!existsSync(file)) {
    console.error(`[ffmpeg-assets] Missing ${file}. Run npm install first.`);
    process.exit(1);
  }
}

mkdirSync(outDir, { recursive: true });
copyFileSync(coreJs, join(outDir, 'ffmpeg-core.js'));

const wasm = readFileSync(coreWasm);
const sha256 = createHash('sha256').update(wasm).digest('hex');
const parts = [];
let offset = 0;
let index = 0;
while (offset < wasm.length) {
  const end = Math.min(offset + PART_BYTES, wasm.length);
  const name = `ffmpeg-core.wasm.part${index}`;
  writeFileSync(join(outDir, name), wasm.subarray(offset, end));
  parts.push({ url: name, bytes: end - offset });
  offset = end;
  index++;
}

const manifest = {
  version: 1,
  core_url: 'ffmpeg-core.js',
  wasm: {
    total_bytes: wasm.length,
    sha256,
    parts,
  },
};

writeFileSync(join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

const largest = parts.reduce((max, part) => Math.max(max, part.bytes), 0);
if (largest >= 25 * 1024 * 1024) {
  console.error('[ffmpeg-assets] A wasm part exceeds the 25 MiB static host limit');
  process.exit(1);
}

console.log(
  `[ffmpeg-assets] ${parts.length} wasm part(s), ${statSync(coreWasm).size} bytes total, sha256 ${sha256.slice(0, 12)}…`
);
