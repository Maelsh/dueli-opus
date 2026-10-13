<?php
/**
 * Worker-contract mirror for the upload.php harness (test-only, NEVER
 * deployed). Mirrors the CURRENT Worker checks for /api/chunks/* exactly:
 *
 *  - verifyUploadServerHmac (src/modules/api/chunks/routes.ts):
 *    X-Signature/X-Timestamp/X-Nonce required; ±5min skew; nonce single-use;
 *    canonical = METHOD \n PATHNAME (WITHOUT query) \n ts \n nonce \n sha256(body);
 *    signature = HMAC-SHA256(secret, canonical) hex, constant-time compare.
 *  - verifyUploadServerOrigin: Origin must be in the allowlist.
 *  - /verify: missing → 400; unknown → {valid:false}; expired → deleted +
 *    invalid; unbound generation → deleted + invalid; lease held with a
 *    superseded generation → deleted + 'Stale lease generation'; a MISSING
 *    lease row still verifies (bounded drain); atomic single-use consume
 *    (a replay finds no key).
 *  - /receipt: facts-only body; the slot must be REGISTERED (404), the
 *    generation must own the slot (409 stale_generation), the echoed object
 *    path must match (409 object_mismatch), the CURRENT lease generation
 *    must equal the receipt generation (409 stale_generation), and
 *    divergent bytes/hash for a confirmed slot never overwrite (409).
 *  - DELETE /api/chunks/{key}: idempotent.
 *
 * The /__control/* endpoints exist ONLY for the harness: seeding keys and
 * slots, lease takeover, receipt failure modes, and assertions. upload.php
 * never calls them.
 */

declare(strict_types=1);

$uri = (string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
// Serve the REAL artifact unchanged: the built-in server executes it itself.
if ($uri === '/upload.php') { return false; }

const STATE_DIR = __DIR__ . '/../.php-test-state';
const SECRET    = 'row28-php-test-secret';
const PLATFORM_ORIGIN = 'http://127.0.0.1'; // set per-run by the runner

function state_file(): string { return STATE_DIR . '/state.json'; }
function objects_dir(): string { return STATE_DIR . '/objects'; }

function load_state(): array {
    $file = state_file();
    if (!is_file($file)) {
        return [
            'keys' => [], 'slots' => [], 'leases' => [], 'nonces' => [],
            'receipts' => [], 'modes' => ['receipt' => 'ok', 'verify' => 'ok'],
        ];
    }
    $raw = file_get_contents($file);
    $st = json_decode($raw ?: '[]', true);
    return is_array($st) ? $st + ['keys' => [], 'slots' => [], 'leases' => [], 'nonces' => [], 'receipts' => [], 'modes' => []] : ['keys' => [], 'slots' => [], 'leases' => [], 'nonces' => [], 'receipts' => [], 'modes' => []];
}

/** Serialized state mutation — concurrent harness requests never interleave. */
function with_state(callable $fn) {
    $file = state_file();
    @mkdir(dirname($file), 0770, true);
    $fp = fopen($file, 'c+');
    if ($fp === false) { http_response_code(500); echo json_encode(['error' => 'state unavailable']); exit; }
    flock($fp, LOCK_EX);
    $raw = stream_get_contents($fp);
    $st = json_decode($raw ?: '[]', true);
    if (!is_array($st)) $st = [];
    $st += ['keys' => [], 'slots' => [], 'leases' => [], 'nonces' => [], 'receipts' => [], 'modes' => []];
    $st['modes'] += ['receipt' => 'ok', 'verify' => 'ok'];
    $result = $fn($st);
    ftruncate($fp, 0);
    rewind($fp);
    fwrite($fp, (string)json_encode($st));
    fflush($fp);
    flock($fp, LOCK_UN);
    fclose($fp);
    return $result;
}

function json_out(int $status, array $payload): void {
    http_response_code($status);
    header('Content-Type: application/json');
    echo json_encode($payload);
    exit;
}

function hmac_ok(string $method, string $pathname, string $body): array {
    $signature = $_SERVER['HTTP_X_SIGNATURE'] ?? '';
    $timestamp = $_SERVER['HTTP_X_TIMESTAMP'] ?? '';
    $nonce     = $_SERVER['HTTP_X_NONCE'] ?? '';
    if ($signature === '' || $timestamp === '' || $nonce === '') {
        json_out(403, ['valid' => false, 'error' => 'Missing upload signature']);
    }
    $ts = (int)$timestamp;
    if (abs(time() * 1000 - $ts) > 5 * 60 * 1000) {
        json_out(403, ['valid' => false, 'error' => 'Stale upload signature']);
    }
    $canonical = $method . "\n" . $pathname . "\n" . $timestamp . "\n" . $nonce . "\n" . hash('sha256', $body);
    $expected  = hash_hmac('sha256', $canonical, SECRET);
    if (!hash_equals($expected, $signature)) {
        json_out(403, ['valid' => false, 'error' => 'Invalid upload signature']);
    }
    $reuse = false;
    with_state(function (array &$st) use ($nonce, &$reuse): void {
        if (isset($st['nonces'][$nonce])) { $reuse = true; return; }
        $st['nonces'][$nonce] = time();
        // prune like the Worker (10-minute retention)
        foreach ($st['nonces'] as $n => $t) { if ($t < time() - 600) unset($st['nonces'][$n]); }
    });
    if ($reuse) {
        json_out(403, ['valid' => false, 'error' => 'Reused upload nonce']);
    }
    return [];
}

function origin_ok(): void {
    $origin = $_SERVER['HTTP_ORIGIN'] ?? '';
    $host = parse_url($origin, PHP_URL_HOST) ?: '';
    if ($host !== '127.0.0.1' && $host !== 'localhost') {
        json_out(403, ['valid' => false, 'error' => 'Origin not allowed']);
    }
}

$uri    = (string)parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$body   = (string)file_get_contents('php://input');

// ---------------------------------------------------------------- control --
if (str_starts_with($uri, '/__control/')) {
    $payload = json_decode($body ?: '{}', true) ?: [];
    switch ($uri) {
        case '/__control/reset':
            @mkdir(STATE_DIR, 0770, true);
            @mkdir(objects_dir(), 0770, true);
            @unlink(state_file());
            json_out(200, ['ok' => true]);
        case '/__control/seed-key':
            with_state(function (array &$st) use ($payload): void {
                $st['keys'][(string)$payload['key']] = [
                    'competition' => (int)$payload['competition'],
                    'sequence'    => (int)$payload['sequence'],
                    'generation'  => (int)$payload['generation'],
                    'object_path' => (string)$payload['object_path'],
                    'max_bytes'   => (int)($payload['max_bytes'] ?? 60000000),
                ];
                $st['slots'][(int)$payload['competition'] . ':' . (int)$payload['sequence']] = [
                    'competition' => (int)$payload['competition'],
                    'sequence'    => (int)$payload['sequence'],
                    'generation'  => (int)$payload['generation'],
                    'object_path' => (string)$payload['object_path'],
                    'state'       => 'uploaded',
                    'bytes'       => null,
                    'object_hash' => null,
                    'duration_ms' => null,
                ];
            });
            json_out(200, ['ok' => true]);
        case '/__control/set-lease':
            with_state(function (array &$st) use ($payload): void {
                $st['leases'][(string)(int)$payload['competition']] = [
                    'generation' => (int)$payload['generation'],
                    'held'       => (bool)($payload['held'] ?? true),
                ];
            });
            json_out(200, ['ok' => true]);
        case '/__control/set-modes':
            with_state(function (array &$st) use ($payload): void {
                foreach ((array)($payload['modes'] ?? []) as $k => $v) { $st['modes'][$k] = $v; }
            });
            json_out(200, ['ok' => true]);
        case '/__control/receipts':
            $st = load_state();
            json_out(200, ['receipts' => $st['receipts']]);
        case '/__control/state':
            $st = load_state();
            json_out(200, ['slots' => $st['slots'], 'leases' => $st['leases'], 'modes' => $st['modes']]);
        default:
            json_out(404, ['error' => 'unknown control']);
    }
}

// ------------------------------------------------------------- platform API --
hmac_ok($method, $uri, $body);
origin_ok();

if ($method === 'GET' && $uri === '/api/chunks/verify') {
    $key = (string)($_GET['key'] ?? '');
    if ($key === '') json_out(400, ['valid' => false, 'error' => 'Missing key']);
    $st = load_state();
    if (($st['modes']['verify'] ?? 'ok') === 'lost') {
        // verify-response loss: a transport-shaped failure the host must
        // treat as fail-closed (no store, no receipt, no success).
        json_out(503, ['valid' => false, 'error' => 'simulated verify loss']);
    }
    $found = with_state(function (array &$st) use ($key) {
        if (!isset($st['keys'][$key])) return null;
        $k = $st['keys'][$key];
        unset($st['keys'][$key]); // atomic single-use consume
        return $k;
    });
    if ($found === null) json_out(200, ['valid' => false, 'error' => 'Key not found']);
    $lease = $st['leases'][(string)$found['competition']] ?? null;
    if ($lease !== null && ($lease['held'] ?? false) && (int)$lease['generation'] !== (int)$found['generation']) {
        json_out(200, ['valid' => false, 'error' => 'Stale lease generation']);
    }
    // A missing lease row still verifies (bounded drain tail) — mirrors the
    // Worker: the row is never deleted, so the drain only lacks the check.
    json_out(200, ['valid' => true, 'data' => [
        'competition_id'   => $found['competition'],
        'chunk_index'      => $found['sequence'],
        'user_id'          => null,
        'lease_generation' => $found['generation'],
        'object_path'      => $found['object_path'],
        'max_bytes'        => $found['max_bytes'],
    ]]);
}

if ($method === 'DELETE' && preg_match('#^/api/chunks/([0-9a-f]{48})$#', $uri, $m)) {
    with_state(function (array &$st) use ($m): void { unset($st['keys'][$m[1]]); });
    json_out(200, ['success' => true]);
}

if ($method === 'POST' && $uri === '/api/chunks/receipt') {
    $facts = json_decode($body ?: '{}', true) ?: [];
    $competition = (int)($facts['competition_id'] ?? 0);
    $sequence    = (int)($facts['sequence'] ?? 0);
    $generation  = (int)($facts['lease_generation'] ?? 0);
    $objectPath  = (string)($facts['object_path'] ?? '');
    $bytes       = $facts['bytes'] ?? null;
    $hash        = $facts['object_hash'] ?? null;
    $status      = (string)($facts['status'] ?? 'stored');
    if ($competition < 1 || $sequence < 1 || $generation < 1) {
        json_out(400, ['success' => false, 'error' => 'Invalid competition_id or sequence', 'code' => 'bad_input']);
    }

    $st = load_state();
    $mode = $st['modes']['receipt'] ?? 'ok';
    if ($mode === 'takeover') {
        // A takeover lands between the pre-check and the confirmation:
        // the receipt's generation is now superseded and must be rejected.
        with_state(function (array &$st) use ($competition): void {
            $st['leases'][(string)$competition] = ['generation' => 99, 'held' => true];
        });
        $st = load_state();
    }
    if ($mode === 'fail') {
        json_out(500, ['success' => false, 'error' => 'simulated receipt failure']);
    }
    if ($mode === 'invalid') {
        header('Content-Type: application/json');
        http_response_code(200);
        echo '{not-json';
        exit;
    }

    if ($status === 'failed') {
        // failed mutation: still bound to the registered slot + generation.
        $slot = $st['slots'][$competition . ':' . $sequence] ?? null;
        if ($slot === null) json_out(404, ['success' => false, 'error' => 'No such chunk slot', 'code' => 'unregistered']);
        if ((int)$slot['generation'] !== $generation) {
            json_out(409, ['success' => false, 'error' => 'Stale lease generation', 'code' => 'stale_generation']);
        }
        with_state(function (array &$st) use ($competition, $sequence): void {
            $st['slots'][$competition . ':' . $sequence]['state'] = 'failed';
        });
        json_out(200, ['success' => true, 'data' => ['state' => 'failed', 'sequence' => $sequence]]);
    }

    // stored: registered slot, generation ownership, object identity.
    $slot = $st['slots'][$competition . ':' . $sequence] ?? null;
    if ($slot === null) {
        json_out(404, ['success' => false, 'error' => 'No registered slot for this sequence', 'code' => 'unregistered']);
    }
    if ((int)$slot['generation'] !== $generation) {
        json_out(409, ['success' => false, 'error' => 'Receipt generation does not own the registered slot', 'code' => 'stale_generation']);
    }
    if ($objectPath !== '' && $objectPath !== $slot['object_path']) {
        json_out(409, ['success' => false, 'error' => 'Receipt object path does not match the registered slot', 'code' => 'object_mismatch']);
    }
    $lease = $st['leases'][(string)$competition] ?? null;
    if ($lease !== null && (int)$lease['generation'] !== $generation) {
        // current-generation authorization (the atomic rule on the Worker).
        json_out(409, ['success' => false, 'error' => 'Stale lease generation', 'code' => 'stale_generation']);
    }
    if ($slot['state'] === 'ready' || $slot['state'] === 'failed') {
        if ($bytes !== null && $slot['bytes'] !== null && (int)$bytes !== (int)$slot['bytes']) {
            json_out(409, ['success' => false, 'error' => 'Conflicting bytes for this sequence', 'code' => 'conflict']);
        }
        if ($hash !== null && $slot['object_hash'] !== null && $hash !== $slot['object_hash']) {
            json_out(409, ['success' => false, 'error' => 'Conflicting bytes for this sequence', 'code' => 'conflict']);
        }
        with_state(function (array &$st) use ($competition, $sequence, $facts): void {
            $st['receipts'][] = $facts + ['_idempotent' => true];
        });
        json_out(200, ['success' => true, 'data' => ['state' => $slot['state'], 'sequence' => $sequence]]);
    }
    with_state(function (array &$st) use ($competition, $sequence, $facts, $bytes, $hash): void {
        $key = $competition . ':' . $sequence;
        $st['slots'][$key]['bytes'] = $bytes;
        $st['slots'][$key]['object_hash'] = $hash;
        $st['slots'][$key]['state'] = 'uploaded';
        $st['receipts'][] = $facts;
    });
    json_out(200, ['success' => true, 'data' => ['state' => 'uploaded', 'sequence' => $sequence]]);
}

json_out(404, ['error' => 'not found']);
