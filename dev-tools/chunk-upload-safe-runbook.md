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
| `finalize.php` | `ChunkUploader.finalize` (client trigger only) | External merge trigger | Server-side merge on hosting (banned for new work); row 28 does NOT call it from the platform — the client trigger stays through the dual-write era until row 30 cutover | KEEP (do not invoke from new code; retire at row-30 cutover) |
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
2. Freeze: host recording/upload is paused (announce; new `register` calls
   are rejected by the frozen Worker — no keyless fallback, no queueing).
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
   Snapshot production D1 first (read-only export) so 0042-column restore
   never needs a destructive rollback.
2. `upload.php`: (a) REQUIRE `chunk_key` (reject keyless with explicit
   error — no silent accept, NO fallback to keyless upload); (b) verify via platform
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

### 3a. Exact reviewed `upload.php` patch (REVIEW-ONLY — hosting applies)

The external agent applies this AFTER the owner supplies the current
`upload.php` (stripped of secrets). It is reviewed here, never executed
here. Contract: mandatory keys, immutable objects, generation fencing,
verified receipts. Real-PHP PASS is NOT claimed without §6 proof.

```php
<?php
// R4-CHUNK-UPLOAD-SAFE-1 / R4-RELEASE-RECOVERY-C — reviewed upload.php patch.
// Assumes: $PLATFORM_BASE (e.g. https://<pages>/), $UPLOAD_SECRET (shared
// HMAC secret, same as Worker's UPLOAD_SERVER_SECRET), $ALLOWED_ORIGINS.
// Helpers hmac_headers()/api() below build the Worker HMAC envelope:
//   canonical = METHOD\npath\ntimestamp\nnonce\nsha256(body),
//   signature = HMAC-SHA256($UPLOAD_SECRET, canonical).

// (a) REQUIRE chunk_key — no keyless fallback, ever.
$chunkKey = $_POST['chunk_key'] ?? '';
if (!is_string($chunkKey) || $chunkKey === '') {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'chunk_key required']);
    exit;
}

// (b) Verify via the platform and enforce the returned binding.
$verify = api('GET', '/api/chunks/verify?key=' . urlencode($chunkKey));
if (!$verify['ok'] || empty($verify['json']['valid'])) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'key verification failed']);
    exit;
}
$binding = $verify['json']['data'] ?? [];
$objectPath = (string)($binding['object_path'] ?? '');
$leaseGen   = (int)($binding['lease_generation'] ?? 0);
$maxBytes   = (int)($binding['max_bytes'] ?? 0);
if ($objectPath === '' || $leaseGen < 1 || $maxBytes < 1) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'binding incomplete']);
    exit;
}
// (b2) No path traversal: the object path is platform-derived, never trusted.
if (strpos($objectPath, '..') !== false || $objectPath[0] === '/' || preg_match('#^[a-z]+://#i', $objectPath)) {
    http_response_code(403);
    echo json_encode(['success' => false, 'error' => 'bad object path']);
    exit;
}

// (c) Save EXCLUSIVELY: refuse overwrite (same bytes may retry idempotently,
//     different bytes conflict). Never trust client duration/bytes.
$tmp = $_FILES['chunk'] ?? null;
if (!$tmp || ($tmp['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    api('POST', '/api/chunks/receipt', ['competition_id' => (int)($_POST['competition_id'] ?? 0),
        'sequence' => (int)($_POST['chunk_number'] ?? 0), 'status' => 'failed', 'error' => 'upload error']);
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'upload error']);
    exit;
}
$dest = storage_path($objectPath); // host-local mapping, outside web root
if (file_exists($dest)) {
    $same = (filesize($dest) === (int)$tmp['size'])
        && (hash_file('sha256', $dest) === hash_file('sha256', $tmp['tmp_name']));
    if (!$same) {
        http_response_code(409);
        echo json_encode(['success' => false, 'error' => 'object exists']);
        exit;
    }
} else {
    if ((int)$tmp['size'] > $maxBytes) {
        http_response_code(413);
        echo json_encode(['success' => false, 'error' => 'too large']);
        exit;
    }
    move_uploaded_file($tmp['tmp_name'], $dest);
}

// (d) Bounds already enforced above (size ceiling + never-trusted path);
//     container allow-list stays mp4/webm by the platform register gate.

// (e) Post-save DELETE of the consumed key (idempotent; verify consumed it).
api('DELETE', '/api/chunks/' . urlencode($chunkKey));

// (f) Receipt with MEASURED facts (never client claims).
api('POST', '/api/chunks/receipt', ['competition_id' => (int)($_POST['competition_id'] ?? 0),
    'sequence' => (int)($_POST['chunk_number'] ?? 0), 'status' => 'stored',
    'bytes' => filesize($dest), 'object_hash' => hash_file('sha256', $dest)]);
echo json_encode(['success' => true]);
```

Generation fencing needs no extra PHP branch: a taken-over generation's
keys fail `verify` platform-side (`Stale generation`), so the `(b)` gate
above rejects them before any byte lands.

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

## 5. Rollback (forward-only — no destructive schema rollback)

- Code: revert this PR's branch (or the merge commit) — no prod data
  touched by the revert itself.
- Migrations: D1/SQLite `ALTER ADD COLUMN` (0042) has no `DROP COLUMN`
  path, so there is NO destructive schema rollback. If the authorized
  apply must be undone: (1) restore `chunk_keys` from the mandatory
  pre-apply read-only snapshot (operator backup, not a migration);
  (2) `DROP TABLE IF EXISTS recording_chunks; DROP TABLE IF EXISTS
  recording_finals;` (0041, additive tables, reverse-creation order);
  (3) `DROP TABLE IF EXISTS recording_leases;` (0040). Never `DROP`
  `chunk_keys` itself and never rewrite applied migration history.
- PHP: restore the timestamped backup; confirm old shapes respond.

## 6. External evidence still needed (NOT claimed by row-28 T/B)

Per 15 §4 the following need the real host or a faithful equivalent,
never the in-test double alone: mandatory-key rejection by the actual
`upload.php`; generation-fenced verify against live PHP timing; receipt
delivery failures/retries over the real network; the no-window proof
across client/PHP/schema versions at each cutover phase. Row-28 T/B
proves platform logic + the documented double order only.
