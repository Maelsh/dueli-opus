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
| `upload.php` | `ChunkUploader.doUpload` (+`chunk_key` since row 28), test host/guest/core scripts, `shared.ts` ChunkManager | Stores one chunk multipart upload | Optional-key verify; no competition/sequence/generation binding; overwrite possible (`chunk_%04d` fixed path); metadata.json read-modify-write without lock; `last_chunk` = last request, not max sequence; no size/type/duration proof; `offset` first-chunk only; CORS `*` is not auth; stale default URL + naive `.env` parse | KEEP + harden: the TESTED artifact is `dev-tools/php/upload.php` (§3a), executed by `php dev-tools/php/tests/run-tests.php` |
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

### 3a. The deployable `upload.php` — TESTED FILE (hosting applies)

The complete, tested artifact lives in the repository at
`dev-tools/php/upload.php` — deploy THAT file as-is (it is not a patch
and it is not a second copy that can drift). It was exercised end-to-end
by `php dev-tools/php/tests/run-tests.php` against a faithful mirror of
the Worker contract (`dev-tools/php/tests/router.php`) — no test helper
corrects it. PHP CLI evidence (local, PHP 8.3): lint PASS; contract 34/34
PASS (mandatory key, binding, exclusive storage, concurrency, receipt
confirmation). Real-host acceptance (§6) is still required before
reopening uploads.

Contract implemented by the artifact:

- **(a)** `chunk_key` is MANDATORY (no keyless fallback, ever).
- **(b)** `GET /api/chunks/verify?key=` — any loss (transport, non-2xx,
  missing body, `valid:false`) fails closed: no store, no receipt, no
  success.
- **(b2) BINDING** — the POSTed `competition_id` / `chunk_number` /
  `extension` must equal the VERIFIED binding, and the object path is
  re-derived platform-side (`live/match_<id>/chunk_<NNNN>.<ext>`) and
  compared: any mismatch is rejected 409 BEFORE a byte is stored or a
  receipt is sent. The receipt then echoes the verified generation and
  object path, so no browser session can ever post a receipt for a slot
  it does not own (the platform re-binds both against the registered
  slot).
- **(c) EXCLUSIVE atomic storage** — the complete upload is written to a
  temp file and published with `link()` (atomic O_EXCL create): the first
  object wins and is immutable; a concurrent DIFFERENT-byte upload gets
  409 and never replaces the original. Fallback (link disabled or
  cross-device): `flock` on a PERSISTENT per-object lock file that is
  NEVER unlinked under concurrency (unlinking the lock between two
  requests would let a third one create a fresh lock and bypass the
  guard), re-check + move; every save outcome is checked and a failure
  closes with 500. Identical bytes (same size AND same sha256) are a safe
  idempotent retry.
- **(d)** post-save `DELETE` of the consumed key (idempotent; verify
  consumed it).
- **(e) RECEIPT + CONFIRMATION** — facts-only receipt
  (`{bytes, object_hash, object_path, lease_generation}`; the platform
  measures duration itself from the stored bytes, D3). Success HTTP 2xx +
  `{success:true}` + a known state (`uploaded`|`ready`) is REQUIRED to
  report success; `stored-but-unconfirmed` (object durable, receipt
  failed) reports 502 so the client retries. Bounded retry inside
  upload.php: `RECEIPT_ATTEMPTS` (3) with backoff, then the client-level
  idempotent path (re-register a fresh key for the same slot → verify →
  identical-bytes retry keeps the original file). The consumed key is
  NEVER re-verified and no wait is unbounded.
- **HMAC envelope (pathname-only canonical)** — the canonical message is
  `METHOD\nPATHNAME\ntimestamp\nnonce\nsha256(body)` exactly as the
  Worker computes it (`new URL(c.req.url).pathname`): the query string
  stays in the REQUEST URL but never enters the canonical (signing
  `/api/chunks/verify?key=…` as-is is a 403 — proven by the harness
  negative control). Headers sent: `X-Signature`/`X-Timestamp`/`X-Nonce`
  (envelope), `Origin` (the PLATFORM origin — inside
  `DEFAULT_UPLOAD_SERVER_ORIGINS` for verifyUploadServerOrigin AND equal
  to the platform Host for the global csrfProtection same-origin proof),
  plus `X-CSRF-Token` as extra proof. No protection is disabled.

Deployment notes for the operator (nothing new is forced):

- Configuration keeps the EXISTING hosting setup: `upload-config.php` is
  included as-is when present (the artifact reads
  `$PLATFORM_BASE` / `$UPLOAD_SERVER_SECRET` / `$STORAGE_ROOT` /
  `$ALLOWED_ORIGINS` from it), otherwise the `.env` the current
  `upload.php` already reads is used with the SAME key names. The
  existing `storage/…` root, `stream.php` path and current recordings are
  untouched; no file is trimmed, no secret or permission is changed by
  this task.
- `.env` (if used) is `chmod 600`, owner = the PHP user, never committed,
  printed or logged. `UPLOAD_SERVER_SECRET` must equal the Worker value;
  rotating it requires updating BOTH sides in the same window.
- Requirements: PHP 8.0+ with `curl` + `hash`. `link()` (preferred) or the
  `flock` fallback — both standard on shared hosting.
- After deploy: verify with §6 before reopening uploads.

Generation fencing needs no extra PHP branch: a taken-over generation
fails `verify` platform-side (`Stale lease generation`) before any byte
lands, and the receipt route re-binds the generation against the
registered slot and the CURRENT lease generation (atomic subquery inside
the critical UPDATE) — a stale publication is refused even when the lease
was released between verify and receipt, and a replacement generation
never drains.
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

**Executable PHP evidence (local, PHP 8.3 CLI) — PASSED by this PR:**
`php dev-tools/php/tests/run-tests.php` runs THE ACTUAL
`dev-tools/php/upload.php` (served untouched by the PHP built-in server)
against the Worker-contract mirror: 34/34 checks PASS — lint, contract
order (mandatory key → verify → store → DELETE → confirmed receipt),
verify-response loss (fail closed), binding mismatches (competition /
sequence / extension), the HMAC canonical rule (pathname-only accepted,
query-inclusive REJECTED — the historical bug, proven both ways),
concurrent DIFFERENT-byte uploads (one 200 + one 409, original bytes
never replaced), identical retry idempotency, receipt failure after save
(no false success, then idempotent completion WITHOUT replacing the
file), takeover before receipt (stale refused, object immutable), and
consumed-key replay.

Per 15 §4 the following still need the REAL host (a faithful equivalent
is not enough): mandatory-key rejection by the deployed `upload.php`;
generation-fenced verify against live PHP timing; receipt delivery
failures/retries over the real network; concurrent different-byte
uploads against the deployed `link()`/`flock` storage on the real
filesystem; the no-window proof across client/PHP/schema versions at
each cutover phase. Row-28 T/B proves platform logic + the documented
double order only.
