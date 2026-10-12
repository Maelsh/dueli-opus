# R4-CHUNK-UPLOAD-SAFE-1 — Deployment Runbook (REVIEWED, NOT APPLIED)

Row 28, 15 §§2/4/8, plan 10. This document PREPARES the reviewed
migration/PHP deployment with rollback and compatibility steps. It applies
NOTHING: no remote D1 migration, no PHP deployment, no production write,
no secret change from this unit. Every step below needs its explicit
owner-gated authorization before execution.

> R4-RELEASE-RECOVERY-C: §3 now carries the EXACT reviewed `upload.php`
> patch (verbatim PHP, review-only — never applied from this unit). The
> external agent applies it on the hosting side after the owner supplies
> the current `upload.php`; real-PHP PASS is NOT claimed until proven
> against the real endpoint per §6.

## 1. PHP inventory (from CODE references + 15 §1 — no blind deletion)

No PHP file is deleted, moved, or edited by row 28. `watcher.js`,
`end-stream.php` and `old_playlist.php` have ZERO in-repo callers
(verified by repo search); their fate (keep/compat/remove) is decided in
the PHP inventory step with the owner-supplied files, never from absence
of callers alone.

| File (hosting) | In-repo callers / URLs | Purpose (as used) | Known risks (15 §1) | Row-28 decision |
|---|---|---|---|---|
| `upload.php` | `ChunkUploader.doUpload` (+`chunk_key` since row 28), test host/guest/core scripts, `shared.ts` ChunkManager | Stores one chunk multipart upload | Optional-key verify; no competition/sequence/generation binding; overwrite possible (`chunk_%04d` fixed path); metadata.json read-modify-write without lock; `last_chunk` = last request, not max sequence; no size/type/duration proof; `offset` first-chunk only; CORS `*` is not auth; stale default URL + naive `.env` parse | KEEP + harden per §4 below (runbook, not in this PR) |
| `playlist.php?id=` | Platform proxy `GET /api/chunks/playlist/:id`, init route | Lists stored chunks | Known-empty responses (owner); no CORS headers (hence the proxy) | KEEP (proxy stays the legacy locator; D1 index is the authority) |
| `stream.php?path=` | Playlist URL builder, player/test basePaths | Serves chunk bytes | None platform-side (byte pipe) | KEEP |
| `finalize.php` | `ChunkUploader.finalize` (client trigger only) | External merge trigger | Removed in ROW28.1 — no callable path, no dual-write era, no client trigger (platform-owned final marker only) | REMOVE (insecure finalize/release flow, deleted) |
| `time.php` | `ChunkUploader.syncTime` | Timestamp alignment | Trivial | KEEP |
| `watcher.js` | none in repo | Unknown (needs owner file copy) | Uninventoried | KEEP, inventory on receipt of the secret-stripped copy |
| `end-stream.php` | none in repo | Unknown (needs owner file copy) | Uninventoried | KEEP, inventory on receipt |
| `old_playlist.php` | none in repo | Presumably legacy lister | Uninventoried | KEEP, inventory on receipt |

## 2. Migration order (all LOCAL-ONLY in this unit)

1. `0040_recording_leases.sql` — lease arbiter (extracted identical from PR110/HOLD 6e7ca10; required in manifest baseline-0042).
2. `0041_chunk_index.sql` — index authority (merged via PR111; required in manifest baseline-0042).
3. `0042_chunk_key_binding.sql` — key binding columns (required in manifest baseline-0042).

Production apply (owner-gated, separate action per plan 10 §9): apply all
three TOGETHER, in order, after verifying target = dueli-db, HEAD hash,
and baseline = manifest `R-RELEASE-1.baseline-0039` with zero other
pending. Applying 0040 without 0041/0042 (or any subset) opens the exact
unsafe window row 28 closes: issuance without fencing/index. Verify with
`npm run db:migrate:local`-equivalent read-only checks + release-readiness
(checks 5/6/8b/9) BEFORE and AFTER; any deviation = STOP, no write.

### 2a. Maintenance window + upload freeze + in-flight drain (operator-only)

No migration is applied while uploads are flowing. The ordered cutover is:

1. Owner declares the maintenance window and approves the exact HEAD.
2. Freeze: operator sets the Worker secret `UPLOADS_FROZEN=1` (re-issuing
   the deploy env for the current HEAD), then host recording/upload is paused
   (announce). This is a **real, implementable** barrier: with the flag truthy,
   `POST /api/chunks/register` refuses to issue **any** new chunk key with
   `503 {"code":"uploads_frozen"}` (fail-closed, no keyless fallback, no
   queueing). In-flight chunks that already hold a key are unaffected and
   continue to `/verify → /receipt`, so they drain. New sessions cannot start.
3. Drain: wait for in-flight PHP uploads to finish (verify → save →
   DELETE → receipt) or expire via the 10-minute key TTL. Poll
   `recording_chunks` for rows stuck in `uploaded` past TTL — they are
   re-driven by receipt, never deleted, never force-marked ready.
4. Apply 0040→0041→0042 in order (single authorized `wrangler d1
   migrations apply dueli-db --remote` run covers all three in filename
   order; do NOT apply subsets).
5. Deploy the Worker (this HEAD) BEFORE hardening PHP: the new Worker
   tolerates old PHP (keys stay additive) but old Worker + new PHP would
   reject everything (fail-closed the wrong way).
6. Harden PHP per §3, then acceptance (§6), then reopen uploads.

Skipping freeze/drain opens an insecure dual-write window (old keyless
writes landing beside fenced writes with no generation to arbitrate) —
that window is banned by this runbook.

## 3. PHP deployment steps (hosting operator, authorized separately)

1. Back up the full ffmpeg directory (files + `.env`) with timestamp.
   Snapshot production D1 first (read-only export) so any restore never
   needs a destructive rollback (see §5 — DROP TABLE is banned).
2. `upload.php`: (a) REQUIRE `chunk_key` (reject keyless with explicit
   error — no silent accept, NO fallback to keyless upload); (b) verify via platform
   `GET /api/chunks/verify?key=` (HMAC envelope already shared) and
   enforce the returned binding (`lease_generation`, `object_path`,
   `max_bytes`); (c) save EXCLUSIVELY (atomic `link()` create; refuse
   overwrite of an existing object — same bytes may retry idempotently,
   different bytes conflict, the original is never replaced); (d) enforce
   the size ceiling + object-path shape + no path traversal; (e) keep the
   post-save `DELETE {platform}/api/chunks/:key` call (idempotent; verify
   already consumed); (f) report `POST {platform}/api/chunks/receipt`
   with STORAGE FACTS ONLY — `{bytes, object_hash, object_path,
   lease_generation}` — on store AND on permanent failure. The duration
   is NOT reported by PHP: the platform measures it server-side from the
   real stored bytes (D3), so a WebM fragment with no Duration element
   can never be mis-measured by host-side getID3; (g) CORS allowlist for
   documented origins (transport note, never treated as auth).
3. Do NOT add server FFmpeg/merge/transcode; do NOT delete chunks on any
   path; do NOT change `playlist.php`/`stream.php` response shapes.
4. `finalize.php` is REMOVED from the flow entirely (insecure finalizer +
   release flow deleted): no callable path, no dual-write compatibility,
   no new dependencies. The client finalize trigger is retired; the index
   is the only authority.

### 3a. Complete deployable `upload.php` (REVIEWED — hosting applies)

This is the COMPLETE file, not a patch: it replaces the current
`upload.php` as-is. It embeds NO secret — configuration comes from
`.env` (example below), and `UPLOAD_SERVER_SECRET` is the SAME shared
value already configured on the Worker (never printed, never logged).
Contract: mandatory bound keys (D1), immutable exclusive storage (D4),
facts-only receipts (D3 platform-measured duration), retired
finalize.php (D6). Real-PHP PASS is NOT claimed without §6 proof.

```php
<?php
/**
 * upload.php — ROW28 (D1–D4, D6) hardened chunk uploader.
 *
 * Responsibilities (nothing else): verify the platform-issued chunk key,
 * enforce its binding, store the object EXCLUSIVELY and atomically,
 * delete the consumed key, and report storage facts. FFmpeg, merge,
 * transcode, chunk deletion and finalize.php are all OUT of scope
 * (banned by the runbook).
 *
 * Configuration comes from .env in this directory (chmod 600, NEVER
 * committed):
 *   PLATFORM_BASE=https://dueli.maelshpro.com
 *   UPLOAD_SERVER_SECRET=<same value as the Worker's UPLOAD_SERVER_SECRET>
 *   STORAGE_ROOT=/absolute/path/outside/web-root
 *   ALLOWED_ORIGINS=https://dueli.maelshpro.com,https://www.dueli.maelshpro.com
 */

/** Minimal .env reader (no secret is ever printed or logged). */
function env_value(string $key, string $default = ''): string {
    static $vars = null;
    if ($vars === null) {
        $vars = [];
        $file = __DIR__ . '/.env';
        if (is_readable($file)) {
            foreach (file($file, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
                [$k, $v] = explode('=', $line, 2);
                $vars[trim($k)] = trim(trim(trim($v), "\"'"));
            }
        }
    }
    return $vars[$key] ?? $default;
}

function respond(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

$PLATFORM_BASE    = rtrim(env_value('PLATFORM_BASE', 'https://dueli.maelshpro.com'), '/');
$UPLOAD_SECRET    = env_value('UPLOAD_SERVER_SECRET');
$STORAGE_ROOT     = rtrim(env_value('STORAGE_ROOT', __DIR__ . '/storage'), '/');
$ALLOWED_ORIGINS  = array_values(array_filter(array_map(
    'trim', explode(',', env_value('ALLOWED_ORIGINS', $PLATFORM_BASE))
)));

if ($UPLOAD_SECRET === '') {
    respond(503, ['success' => false, 'error' => 'upload auth not configured']);
}

// CORS: transport allowlist ONLY — it is never treated as auth (the HMAC
// envelope is the auth).
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, X-Signature, X-Timestamp, X-Nonce');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

/** Platform call inside the shared HMAC envelope:
 *  canonical = METHOD\npath\ntimestamp\nnonce\nsha256(body),
 *  signature = HMAC-SHA256(UPLOAD_SERVER_SECRET, canonical). */
function api(string $method, string $path, ?array $json = null): array {
    global $PLATFORM_BASE, $UPLOAD_SECRET;
    $body   = $json === null ? '' : json_encode($json);
    $ts     = (string) round(microtime(true) * 1000);
    $nonce  = bin2hex(random_bytes(12));
    $canon  = $method . "\n" . $path . "\n" . $ts . "\n" . $nonce . "\n" . hash('sha256', $body);
    $ch = curl_init($PLATFORM_BASE . $path);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Signature: ' . hash_hmac('sha256', $canon, $UPLOAD_SECRET),
            'X-Timestamp: ' . $ts,
            'X-Nonce: ' . $nonce,
        ],
    ]);
    if ($body !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $raw  = curl_exec($ch);
    $code = (int) curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    curl_close($ch);
    return ['ok' => $code >= 200 && $code < 300, 'json' => $raw ? json_decode($raw, true) : null];
}

// (a) chunk_key is MANDATORY — no keyless fallback, ever (D1).
$chunkKey = is_string($_POST['chunk_key'] ?? null) ? $_POST['chunk_key'] : '';
if ($chunkKey === '' || !preg_match('/^[0-9a-f]{48}$/', $chunkKey)) {
    respond(400, ['success' => false, 'error' => 'chunk_key required']);
}

// (b) Verify via the platform and enforce the returned binding (D1).
$verify = api('GET', '/api/chunks/verify?key=' . urlencode($chunkKey));
if (!$verify['ok'] || empty($verify['json']['valid'])) {
    respond(403, ['success' => false, 'error' => 'key verification failed']);
}
$binding    = $verify['json']['data'] ?? [];
$objectPath = (string) ($binding['object_path'] ?? '');
$leaseGen   = (int) ($binding['lease_generation'] ?? 0);
$maxBytes   = (int) ($binding['max_bytes'] ?? 0);
if ($objectPath === '' || $leaseGen < 1 || $maxBytes < 1) {
    respond(403, ['success' => false, 'error' => 'binding incomplete']);
}
// The path is platform-derived; re-check shape + traversal (defense in depth).
if (str_contains($objectPath, '..') || str_contains($objectPath, '\\')
    || $objectPath[0] === '/' || preg_match('#^[a-z][a-z0-9+.-]*://#i', $objectPath)
    || !preg_match('#^live/match_\d+/chunk_\d+\.(mp4|webm)$#', $objectPath)) {
    respond(403, ['success' => false, 'error' => 'bad object path']);
}
$competitionId = (int) ($_POST['competition_id'] ?? 0);
$sequence      = (int) ($_POST['chunk_number'] ?? 0);
if ($competitionId < 1 || $sequence < 1) {
    respond(400, ['success' => false, 'error' => 'bad competition_id or chunk_number']);
}

// (c) EXCLUSIVE atomic storage (D4). The first object to land wins and is
//     immutable: a concurrent DIFFERENT-byte upload can never replace the
//     original bytes, while an identical retry stays idempotently safe.
$tmp = $_FILES['chunk'] ?? null;
if (!$tmp || ($tmp['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    api('POST', '/api/chunks/receipt', [
        'competition_id' => $competitionId, 'sequence' => $sequence,
        'lease_generation' => $leaseGen, 'status' => 'failed', 'error' => 'upload error',
    ]);
    respond(400, ['success' => false, 'error' => 'upload error']);
}
if ((int) $tmp['size'] > $maxBytes) {
    api('POST', '/api/chunks/receipt', [
        'competition_id' => $competitionId, 'sequence' => $sequence,
        'lease_generation' => $leaseGen, 'status' => 'failed', 'error' => 'too large',
    ]);
    respond(413, ['success' => false, 'error' => 'too large']);
}
$dest = $STORAGE_ROOT . '/' . $objectPath;
if (!is_dir(dirname($dest))) { mkdir(dirname($dest), 0770, true); }

$stored = false;
// Primary: link() is an ATOMIC exclusive create (O_EXCL semantics) — when
// the destination already exists it fails and nothing is written, so two
// concurrent uploads can never both "win" and the later one cannot replace
// the winner's bytes.
if (function_exists('link')) {
    if (@link($tmp['tmp_name'], $dest)) { $stored = true; }
}
// Fallback (link() disabled or cross-device): serialize on a per-object
// lock and re-check before the move — still no overwrite, just serialized.
if (!$stored && !file_exists($dest)) {
    $lock = @fopen($dest . '.lock', 'c');
    if ($lock && flock($lock, LOCK_EX)) {
        if (!file_exists($dest)) { $stored = @rename($tmp['tmp_name'], $dest); }
        flock($lock, LOCK_UN);
    }
    if ($lock) { fclose($lock); }
    @unlink($dest . '.lock');
}
if (!$stored) {
    // The object already exists: identical bytes are a safe idempotent
    // retry (same size AND same sha256); different bytes CONFLICT and the
    // original bytes are preserved untouched.
    if (file_exists($dest)
        && (int) filesize($dest) === (int) $tmp['size']
        && hash_equals(hash_file('sha256', $dest), hash_file('sha256', $tmp['tmp_name']))) {
        $stored = true;
        @unlink($tmp['tmp_name']);
    } else {
        respond(409, ['success' => false, 'error' => 'object exists with different bytes']);
    }
}
if (!$stored) {
    respond(500, ['success' => false, 'error' => 'storage failed']);
}

// (e) Post-save DELETE of the consumed key (idempotent — verify consumed it).
api('DELETE', '/api/chunks/' . urlencode($chunkKey));

// (f) Receipt with STORAGE FACTS ONLY (D3). No duration is ever declared
//     here: the platform measures the real stored bytes itself, so a
//     MediaRecorder WebM fragment (no Duration element, getID3-blind) is
//     measured from its actual media timestamps or stays unverified.
api('POST', '/api/chunks/receipt', [
    'competition_id'   => $competitionId,
    'sequence'         => $sequence,
    'lease_generation' => $leaseGen,
    'object_path'      => $objectPath,
    'status'           => 'stored',
    'bytes'            => (int) filesize($dest),
    'object_hash'      => hash_file('sha256', $dest),
]);

respond(200, ['success' => true]);
```

Deployment notes for the operator:

- Set `STORAGE_ROOT` OUTSIDE the web root; `stream.php`/`playlist.php`
  keep serving from the same root (move the existing `live/` tree once,
  during the freeze window, and repoint the readers).
- `.env` is `chmod 600`, owner = the PHP user, and is never committed,
  printed, or logged. `UPLOAD_SERVER_SECRET` must equal the Worker's
  value; rotating it requires updating BOTH sides in the same window.
- Requirements: PHP 8.0+ with `curl` and `hash`. `link()` (preferred) or
  `flock` fallback — both are standard on shared hosting.
- The old `metadata.json` read-modify-write, `last_chunk` tracking,
  `offset` handling and keyless path are GONE: the D1 index is the
  metadata authority (row 27), receipts are the only writer.
- Verify after deploy with §6 before reopening uploads.

Generation fencing needs no extra PHP branch: a taken-over generation's
keys fail `verify` platform-side (`Stale generation`), so the `(b)` gate
above rejects them before any byte lands; the receipt route re-checks the
generation binding against the registered slot and refuses a stale
publication even when the lease was released between verify and receipt.

## 4. Cutover sequencing (no unsafe window)

There is **no** keyless/old-PHP-tolerant phase in the activation path.
Uploads only ever run against the hardened PHP (§3) that mandates
`chunk_key` and fencing; the keyless Phase-1/old-PHP-ignores-the-field
model was **banned** (ROW28.1) because it reopens the insecure
dual-write window the whole runbook exists to close.

- Phase 0 (before activation, production frozen): uploads stopped via
  `UPLOADS_FROZEN=1` (§2a); only the legacy/playback path is live.
  Activation is blocked until the release candidate below is READY.
- Phase A (release candidate = **Recovery C + Profile ROW28.2**): both
  units land on `main` together as one candidate; no partial deploy.
  Apply 0040→0042, deploy the Worker (§2a), harden PHP (§3), run
  acceptance (§6), then **only then** clear `UPLOADS_FROZEN` to reopen
  uploads. Rollback: set `UPLOADS_FROZEN=1` again (uploads halt,
  fail-closed) — never a destructive schema rollback.
- Phase B (row 30): player/download consume the index; `finalize.php`
  trigger retired with its own runbook. Never before receipts prove
  ready end-to-end.

### 4a. Release candidate definition (ROW28.1 item 4)

The production activation candidate is **exactly** the merge of:
- **Recovery C** (this PR #114, HEAD on `fix/r4-release-recovery-c`), and
- **Profile ROW28.2** (PR #115, R4-PROFILE-SEC11-1).

Neither unit is deployable alone for activation: Recovery C gates
activation on readiness (fail-closed), Profile ROW28.2 removes the
SEC-11/07 query-token/session_id drift on the profile path. Both must be
merged to `main` and pass Quality + Deploy on the **merge commit** before
`UPLOADS_FROZEN` is cleared in production.

## 5. Rollback (forward-only — no destructive schema rollback)

- Code: revert this PR's branch (or the merge commit) — no prod data
  touched by the revert itself.
- Migrations: there is NO destructive schema rollback. DROP TABLE /
  DROP COLUMN instructions are BANNED from this runbook (ROW28 D5):
  `recording_chunks`, `recording_finals` and `recording_leases` are
  additive, forward-only tables, and `chunk_keys` gains only nullable
  columns (0042). If an authorized apply must be undone, the ONLY path
  is restoring the pre-apply read-only D1 snapshot (operator backup,
  taken in §2a step 1) or letting the additive tables sit unused — the
  platform fails closed without them and never rewrites applied
  migration history.
- PHP: restore the timestamped backup; confirm old shapes respond.

### 5a. Deploy behavior — readiness is a backstop, NOT the barrier (ROW28.1 item 5)

`main` is **auto-deployed to Cloudflare on every merge** (`.github/workflows/deploy.yml`,
`on: push: branches: [main]`). A failed readiness read inside that deploy job
does NOT reliably stop the already-started production deploy. Therefore the
**primary** activation barrier is operational, not the readiness check:

- Production stays `UPLOADS_FROZEN=1` across the whole cutover. Even if the
  auto-deploy ships the Worker while migrations/PHP are not yet ready, uploads
  remain closed (fail-closed 503), so nothing unsafe can happen.
- The readiness check (`check-release-readiness.mjs`, fail-closed on read
  failure or unexpected applied/pending) is a **detector** for the operator:
  it tells you whether 0040→0042 + schema are in place. Treat a READY-green
  deploy run as confirmation, not as the thing keeping uploads safe.
- Do **not** gate activation on "the deploy workflow will fail if not ready."
  Gate it on the ordered §2a sequence + explicit owner sign-off, then clear
  `UPLOADS_FROZEN` only after §6 acceptance passes.

## 6. External evidence still needed (NOT claimed by row-28 T/B)

Per 15 §4 the following need the real host or a faithful equivalent,
never the in-test double alone: mandatory-key rejection by the actual
`upload.php`; generation-fenced verify against live PHP timing; receipt
delivery failures/retries over the real network; concurrent
different-byte uploads against the real `link()`/`flock` storage (the
in-test harness proves the platform-side conflict path only — the
atomic-exclusive guarantee of §3a(c) needs a real two-writer race on
the host); the no-window proof across client/PHP/schema versions at
each cutover phase. Row-28 T/B proves platform logic + the documented
double order only.
