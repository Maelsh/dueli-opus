# R4-CHUNK-UPLOAD-SAFE-1 — Deployment Runbook (REVIEWED, NOT APPLIED)

Row 28, 15 §§2/4/8, plan 10. This document PREPARES the reviewed
migration/PHP deployment with rollback and compatibility steps. It applies
NOTHING: no remote D1 migration, no PHP deployment, no production write,
no secret change from this unit. Every step below needs its explicit
owner-gated authorization before execution.

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
| `finalize.php` | `ChunkUploader.finalize` (client trigger only) | External merge trigger | Server-side merge on hosting (banned for new work); row 28 does NOT call it from the platform — the client trigger stays through the dual-write era until row 30 cutover | KEEP (do not invoke from new code; retire at row-30 cutover) |
| `time.php` | `ChunkUploader.syncTime` | Timestamp alignment | Trivial | KEEP |
| `watcher.js` | none in repo | Unknown (needs owner file copy) | Uninventoried | KEEP, inventory on receipt of the secret-stripped copy |
| `end-stream.php` | none in repo | Unknown (needs owner file copy) | Uninventoried | KEEP, inventory on receipt |
| `old_playlist.php` | none in repo | Presumably legacy lister | Uninventoried | KEEP, inventory on receipt |

## 2. Migration order (all LOCAL-ONLY in this unit)

1. `0040_recording_leases.sql` — lease arbiter (extracted identical from PR110/HOLD 6e7ca10; manifest membership added here).
2. `0041_chunk_index.sql` — index authority (merged via PR111).
3. `0042_chunk_key_binding.sql` — key binding columns (this unit).

Production apply (owner-gated, separate action per plan 10 §9): apply all
three TOGETHER, in order, after verifying target = dueli-db, HEAD hash,
and baseline = manifest `R-RELEASE-1.baseline-0039` with zero other
pending. Applying 0040 without 0041/0042 (or any subset) opens the exact
unsafe window row 28 closes: issuance without fencing/index. Verify with
`npm run db:migrate:local`-equivalent read-only checks + release-readiness
(checks 5/6/8b/9) BEFORE and AFTER; any deviation = STOP, no write.

## 3. PHP deployment steps (hosting operator, authorized separately)

1. Back up the full ffmpeg directory (files + `.env`) with timestamp.
2. `upload.php`: (a) REQUIRE `chunk_key` (reject keyless with explicit
   error — no silent accept); (b) verify via platform
   `GET /api/chunks/verify?key=` (HMAC envelope already shared) and
   enforce the returned binding (`lease_generation`, `object_path`,
   `max_bytes`); (c) save EXCLUSIVELY (refuse overwrite of an existing
   object — same bytes may retry idempotently, different bytes conflict);
   (d) enforce size/type/duration bounds + no path traversal (noXSS);
   (e) keep the post-save `DELETE {platform}/api/chunks/:key` call
   (idempotent; verify already consumed); (f) report
   `POST {platform}/api/chunks/receipt` with measured
   `{bytes, object_hash?, duration_ms?}` on store AND on permanent
   failure; (g) CORS allowlist for documented origins (transport note,
   never treated as auth).
3. Do NOT add server FFmpeg/merge/transcode; do NOT delete chunks on any
   path; do NOT change `playlist.php`/`stream.php` response shapes.
4. Keep `finalize.php` callable (dual-write era) but take NO new
   dependencies on it; row 30 retires the trigger after the index cutover.

## 4. Cutover sequencing (no unsafe window)

- Phase 0 (today): keyless direct uploads; proxy playlist; no index.
- Phase 1 (this PR deployed, PHP untouched): clients attach keys
  (additive FormData field — old PHP ignores it); platform issues,
  verifies (on request), indexes and receipts; playlist gains D1
  authority where rows exist, legacy elsewhere. Rollback: revert code;
  old PHP never saw the field.
- Phase 2 (PHP hardened per §3 + migrations applied): verify mandatory,
  receipts live, fencing enforced, immutable store. Rollback: restore
  PHP backup (platform tolerates unverified uploads again — keys stay
  additive); index rows remain valid history.
- Phase 3 (row 30): player/download consume the index; `finalize.php`
  trigger retired with its own runbook. Never before receipts prove
  ready end-to-end.

## 5. Rollback

- Code: revert this PR's branch (or the merge commit) — no prod data
  touched by the revert itself.
- Migrations (only if applied by an authorized action, reverse order):
  `DROP TABLE IF EXISTS recording_finals; DROP TABLE IF EXISTS
  recording_chunks;` then remove 0042 columns is NOT supported by
  SQLite/D1 ALTER — instead restore `chunk_keys` from the pre-apply
  backup (the runbook's pre-check snapshot is mandatory), then
  `DROP TABLE IF EXISTS recording_leases;`.
- PHP: restore the timestamped backup; confirm old shapes respond.

## 6. External evidence still needed (NOT claimed by row-28 T/B)

Per 15 §4 the following need the real host or a faithful equivalent,
never the in-test double alone: mandatory-key rejection by the actual
`upload.php`; generation-fenced verify against live PHP timing; receipt
delivery failures/retries over the real network; the no-window proof
across client/PHP/schema versions at each cutover phase. Row-28 T/B
proves platform logic + the documented double order only.
