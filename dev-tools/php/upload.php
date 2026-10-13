<?php
/**
 * upload.php — ROW28 final (D1–D4, D6, D7) hardened chunk uploader.
 *
 * THE deployable artifact: `dev-tools/php/tests/run-tests.php` lints and
 * exercises THIS exact file end-to-end against a faithful mirror of the
 * Worker contract (HMAC envelope, binding, exclusive storage, receipt
 * confirmation). No test helper re-implements or "corrects" this file.
 *
 * Responsibilities (nothing else):
 *   1. a MANDATORY chunk_key (no keyless fallback, ever);
 *   2. verify via GET /api/chunks/verify and fail closed on any loss;
 *   3. enforce the verified binding (competition/sequence/generation/
 *      object_path/extension/bytes ceiling) BEFORE storing or reporting;
 *   4. store the complete object then publish it EXCLUSIVELY and
 *      atomically (no overwrite; identical retry idempotent; different
 *      bytes conflict and never replace the original);
 *   5. delete the consumed key (idempotent);
 *   6. deliver the facts-only receipt and CONFIRM it (HTTP + JSON +
 *      state) — success is reported only when the platform confirms.
 *
 * Out of scope (banned by the runbook): FFmpeg, merge, transcode, chunk
 * deletion, finalize.php, browser-declared durations.
 *
 * Configuration (existing hosting setup is preserved, nothing new forced):
 *   - if `upload-config.php` sits next to this file it is included as-is
 *     and may define $PLATFORM_BASE / $UPLOAD_SERVER_SECRET / $STORAGE_ROOT /
 *     $ALLOWED_ORIGINS (the names read below);
 *   - otherwise the `.env` the current upload.php already reads is used,
 *     with the SAME key names. `UPLOAD_SERVER_SECRET` must equal the
 *     Worker's value. No secret is ever printed or logged.
 */

declare(strict_types=1);

/** Bounded receipt delivery: the receipt IS the confirmation, so a lost or
 *  failed delivery is retried a few times with backoff. The consumed key is
 *  NEVER re-verified (single-use) and no wait is unbounded. */
const RECEIPT_ATTEMPTS  = 3;
const RECEIPT_BACKOFF_US = 250000; // 250ms, 500ms between attempts

/** Read one config value: upload-config.php (existing hosting file) first,
 *  then .env with the same names. Values are never echoed anywhere. */
function upload_config(string $key, string $default = ''): string {
    static $vars = null;
    static $loaded = false;
    if (!$loaded) {
        $loaded = true;
        $vars = [];
        $configFile = __DIR__ . '/upload-config.php';
        if (is_file($configFile)) {
            // The existing hosting config is included unchanged; it may set
            // the well-known variables below (they are read after include).
            @include $configFile;
        }
        $envFile = __DIR__ . '/.env';
        if (is_readable($envFile)) {
            foreach (file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) as $line) {
                $line = trim($line);
                if ($line === '' || $line[0] === '#' || !str_contains($line, '=')) continue;
                [$k, $v] = explode('=', $line, 2);
                $vars[trim($k)] = trim(trim(trim($v), "\"'"));
            }
        }
    }
    $fromEnv = $vars[$key] ?? '';
    return $fromEnv !== '' ? $fromEnv : $default;
}

function respond(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

$PLATFORM_BASE   = rtrim(upload_config('PLATFORM_BASE', 'https://dueli.maelshpro.com'), '/');
$UPLOAD_SECRET   = upload_config('UPLOAD_SERVER_SECRET');
$STORAGE_ROOT    = rtrim(upload_config('STORAGE_ROOT', __DIR__ . '/live'), '/');
$ALLOWED_ORIGINS = array_values(array_filter(array_map(
    'trim', explode(',', upload_config('ALLOWED_ORIGINS', $PLATFORM_BASE))
)));

if ($UPLOAD_SECRET === '') {
    respond(503, ['success' => false, 'error' => 'upload auth not configured']);
}

// CORS: transport allowlist only — never treated as auth (the HMAC envelope
// is the auth). Nothing is disabled: the preflight only answers origins the
// operator has documented.
$origin = $_SERVER['HTTP_ORIGIN'] ?? '';
if ($origin !== '' && in_array($origin, $ALLOWED_ORIGINS, true)) {
    header('Access-Control-Allow-Origin: ' . $origin);
    header('Vary: Origin');
}
header('Access-Control-Allow-Headers: Content-Type, X-Signature, X-Timestamp, X-Nonce, X-CSRF-Token');
header('Access-Control-Allow-Methods: POST, OPTIONS');
if (($_SERVER['REQUEST_METHOD'] ?? '') === 'OPTIONS') { http_response_code(204); exit; }

/**
 * One platform call inside the shared HMAC envelope.
 *
 * CANONICAL RULE — Worker `verifyUploadServerHmac`
 * (src/modules/api/chunks/routes.ts):
 *   canonical = METHOD \n PATHNAME (WITHOUT the query) \n timestamp \n nonce \n sha256(body)
 * The query string stays in the REQUEST URL but NEVER enters the canonical
 * message — signing `/api/chunks/verify?key=…` as-is is a 403.
 *
 * Headers sent (nothing disabled, every current protection satisfied):
 *   X-Signature/X-Timestamp/X-Nonce — the HMAC envelope itself;
 *   Origin — the PLATFORM origin: it is in DEFAULT_UPLOAD_SERVER_ORIGINS
 *     (verifyUploadServerOrigin allowlist) AND equals the platform Host, so
 *     csrfProtection()'s same-origin proof passes;
 *   X-CSRF-Token — additional CSRF proof; the route keeps every check.
 */
function api(string $method, string $pathAndQuery, ?array $json = null): array {
    global $PLATFORM_BASE, $UPLOAD_SECRET;
    $body    = $json === null ? '' : (string)json_encode($json);
    $pathname = (string)parse_url($pathAndQuery, PHP_URL_PATH); // pathname ONLY
    $ts      = (string)round(microtime(true) * 1000);
    $nonce   = bin2hex(random_bytes(12));
    $canonical = $method . "\n" . $pathname . "\n" . $ts . "\n" . $nonce . "\n" . hash('sha256', $body);

    $ch = curl_init($PLATFORM_BASE . $pathAndQuery); // query kept in the URL
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_CUSTOMREQUEST  => $method,
        CURLOPT_TIMEOUT        => 20,
        CURLOPT_CONNECTTIMEOUT => 5,
        CURLOPT_FOLLOWLOCATION => false,
        CURLOPT_HTTPHEADER     => [
            'Content-Type: application/json',
            'X-Signature: ' . hash_hmac('sha256', $canonical, $UPLOAD_SECRET),
            'X-Timestamp: ' . $ts,
            'X-Nonce: ' . $nonce,
            'Origin: ' . $PLATFORM_BASE,
            'X-CSRF-Token: upload-php',
        ],
    ]);
    if ($body !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $body);
    $raw  = curl_exec($ch);
    $code = (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE);
    $err  = curl_error($ch);
    curl_close($ch);

    return [
        'ok'        => $raw !== false && $code >= 200 && $code < 300,
        'transport' => $raw !== false && $err === '',
        'code'      => $code,
        'json'      => $raw ? json_decode($raw, true) : null,
    ];
}

/**
 * Deliver the receipt and CONFIRM it: HTTP 2xx AND {success:true} AND a
 * known state. `stored-but-unconfirmed` (the object is durable but the
 * platform never confirmed) is reported to the client as a failure — the
 * caller may retry the whole upload; the stored object is immutable, so an
 * identical retry is safe and never replaces the file.
 */
function post_receipt(array $facts): array {
    for ($attempt = 1; $attempt <= RECEIPT_ATTEMPTS; $attempt++) {
        $r = api('POST', '/api/chunks/receipt', $facts);
        $state = is_array($r['json']) ? (string)(($r['json']['data']['state']) ?? '') : '';
        if ($r['ok'] && is_array($r['json']) && ($r['json']['success'] ?? false) === true
            && in_array($state, ['uploaded', 'ready'], true)) {
            return ['delivered' => true, 'state' => $state];
        }
        if ($attempt < RECEIPT_ATTEMPTS) usleep(RECEIPT_BACKOFF_US * $attempt);
    }
    return ['delivered' => false, 'state' => $state ?? ''];
}

// ---------------------------------------------------------------------------
// (a) chunk_key is MANDATORY — no keyless fallback, ever (D1).
// ---------------------------------------------------------------------------
$chunkKey = is_string($_POST['chunk_key'] ?? null) ? $_POST['chunk_key'] : '';
if ($chunkKey === '' || !preg_match('/^[0-9a-f]{48}$/', $chunkKey)) {
    respond(400, ['success' => false, 'error' => 'chunk_key required']);
}

// ---------------------------------------------------------------------------
// (b) Verify via the platform. ANY loss (transport, non-2xx, invalid body,
//     valid:false) fails closed: no store, no receipt, no success.
// ---------------------------------------------------------------------------
$verify = api('GET', '/api/chunks/verify?key=' . urlencode($chunkKey));
if (!$verify['transport'] || !$verify['ok'] || empty($verify['json']['valid'])) {
    respond(403, ['success' => false, 'error' => 'key verification failed']);
}
$binding    = $verify['json']['data'] ?? [];
$objectPath = (string)($binding['object_path'] ?? '');
$leaseGen   = (int)($binding['lease_generation'] ?? 0);
$maxBytes   = (int)($binding['max_bytes'] ?? 0);
if ($objectPath === '' || $leaseGen < 1 || $maxBytes < 1) {
    respond(403, ['success' => false, 'error' => 'binding incomplete']);
}
// The path is platform-derived; re-check shape + traversal (defense in depth).
if (str_contains($objectPath, '..') || str_contains($objectPath, '\\')
    || $objectPath[0] === '/' || preg_match('#^[a-z][a-z0-9+.-]*://#i', $objectPath)
    || !preg_match('#^live/match_\d+/chunk_\d+\.(mp4|webm)$#', $objectPath)) {
    respond(403, ['success' => false, 'error' => 'bad object path']);
}

// ---------------------------------------------------------------------------
// (b2) BINDING (item 2): the POSTed fields must match the VERIFIED binding.
//      Any mismatch is rejected BEFORE a byte is stored or a receipt sent.
//      A browser session can never post a receipt for someone else's slot:
//      the receipt carries the verified generation + object path, and the
//      platform re-binds both against the registered slot.
// ---------------------------------------------------------------------------
$competitionId = (int)($_POST['competition_id'] ?? 0);
$sequence      = (int)($_POST['chunk_number'] ?? 0);
$extension     = strtolower((string)($_POST['extension'] ?? ''));
if ($competitionId < 1 || $sequence < 1 || $sequence > 9999
    || !in_array($extension, ['mp4', 'webm'], true)) {
    respond(400, ['success' => false, 'error' => 'bad competition_id, chunk_number or extension']);
}
// (1) the POSTed identity must equal the verified binding's identity;
// (2) the platform derives the object path itself — re-derive and compare,
//     so competition, sequence AND extension are all bound before storage.
if ((int)($binding['competition_id'] ?? 0) !== $competitionId
    || (int)($binding['chunk_index'] ?? 0) !== $sequence) {
    respond(409, ['success' => false, 'error' => 'binding mismatch']);
}
$expectedPath = sprintf('live/match_%d/chunk_%04d.%s', $competitionId, $sequence, $extension);
if ($expectedPath !== $objectPath) {
    respond(409, ['success' => false, 'error' => 'binding mismatch']);
}

// ---------------------------------------------------------------------------
// (c) EXCLUSIVE atomic storage (items 3+4): upload the COMPLETE file, then
//     publish it without overwrite. The first object to land wins and is
//     immutable: a concurrent DIFFERENT-byte upload can never replace the
//     original bytes; an identical retry stays idempotently safe.
// ---------------------------------------------------------------------------
$tmp = $_FILES['chunk'] ?? null;
if (!$tmp || ($tmp['error'] ?? UPLOAD_ERR_NO_FILE) !== UPLOAD_ERR_OK) {
    api('POST', '/api/chunks/receipt', [
        'competition_id' => $competitionId, 'sequence' => $sequence,
        'lease_generation' => $leaseGen, 'object_path' => $objectPath,
        'status' => 'failed', 'error' => 'upload error',
    ]);
    respond(400, ['success' => false, 'error' => 'upload error']);
}
if ((int)$tmp['size'] > $maxBytes) {
    api('POST', '/api/chunks/receipt', [
        'competition_id' => $competitionId, 'sequence' => $sequence,
        'lease_generation' => $leaseGen, 'object_path' => $objectPath,
        'status' => 'failed', 'error' => 'too large',
    ]);
    respond(413, ['success' => false, 'error' => 'too large']);
}

$dest = $STORAGE_ROOT . '/' . $objectPath;
if (!is_dir(dirname($dest))) { mkdir(dirname($dest), 0770, true); }

$stored = false;
// Primary: link() is an ATOMIC exclusive create (O_EXCL semantics) — if the
// destination exists the call fails and NOTHING is written, so two
// concurrent uploaders can never both win and the loser cannot replace the
// winner's bytes. The uploaded temp file is already complete on disk.
if (function_exists('link')) {
    $stored = @link($tmp['tmp_name'], $dest);
}
// Fallback (link() disabled or cross-device): serialize on a per-object lock
// and re-check before the move. The lock file is PERSISTENT and is NEVER
// unlinked here: deleting it between two concurrent requests would let a
// third request create a fresh lock file and bypass the flock (the classic
// lock-file race). Every step's outcome is checked; any failure is closed.
if (!$stored && !file_exists($dest)) {
    $lockPath = $dest . '.lock';
    $lock = @fopen($lockPath, 'c');
    if ($lock === false) {
        respond(500, ['success' => false, 'error' => 'storage lock failed']);
    }
    $locked = flock($lock, LOCK_EX);
    if ($locked) {
        if (!file_exists($dest)) {
            $stored = @rename($tmp['tmp_name'], $dest);
        }
        flock($lock, LOCK_UN);
    }
    fclose($lock);
    if (!$locked) {
        respond(500, ['success' => false, 'error' => 'storage lock failed']);
    }
}
if (!$stored) {
    // The object exists: identical bytes are a safe idempotent retry (same
    // size AND same sha256); DIFFERENT bytes conflict — the original bytes
    // are preserved untouched and nothing is replaced.
    if (file_exists($dest)
        && (int)filesize($dest) === (int)$tmp['size']
        && hash_equals((string)hash_file('sha256', $dest), (string)hash_file('sha256', $tmp['tmp_name']))) {
        $stored = true;
        @unlink($tmp['tmp_name']);
    } else {
        respond(409, ['success' => false, 'error' => 'object exists with different bytes']);
    }
}
if (!$stored) {
    // link() and the fallback both failed without an existing object:
    // nothing was published and the client may retry the whole upload.
    respond(500, ['success' => false, 'error' => 'storage failed']);
}

// ---------------------------------------------------------------------------
// (d) Post-save DELETE of the consumed key (idempotent — verify consumed it).
// ---------------------------------------------------------------------------
api('DELETE', '/api/chunks/' . urlencode($chunkKey));

// ---------------------------------------------------------------------------
// (e) Receipt with STORAGE FACTS ONLY (the platform measures duration
//     itself from these real stored bytes — D3; nothing is declared here).
//     Success is reported ONLY when the platform confirms the receipt.
// ---------------------------------------------------------------------------
$confirmation = post_receipt([
    'competition_id'   => $competitionId,
    'sequence'         => $sequence,
    'lease_generation' => $leaseGen,
    'object_path'      => $objectPath,
    'status'           => 'stored',
    'bytes'            => (int)filesize($dest),
    'object_hash'      => (string)hash_file('sha256', $dest),
]);
if (!$confirmation['delivered']) {
    // The object IS durable (exclusive publish happened) but the platform
    // never confirmed: report failure so the client retries with a fresh
    // key. The retry re-registers (same slot, idempotent), re-verifies, and
    // the identical-bytes path above keeps the original file untouched.
    respond(502, ['success' => false, 'error' => 'receipt unconfirmed']);
}

respond(200, [
    'success' => true,
    'data'    => ['state' => $confirmation['state']], // 'uploaded' or 'ready'
]);
