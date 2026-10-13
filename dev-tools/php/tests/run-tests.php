<?php
/**
 * Executable harness for dev-tools/php/upload.php (ROW28).
 *
 * It lints and then runs THE ACTUAL FILE (served as-is by the PHP built-in
 * server) against the Worker-contract mirror in router.php. No test helper
 * re-implements upload.php or "corrects" its mistakes: if the artifact
 * signs the query, forgets the binding, overwrites bytes, or reports
 * success without a confirmed receipt, the corresponding scenario fails.
 *
 * Run:  php dev-tools/php/tests/run-tests.php        (exit 0 = all pass)
 */

declare(strict_types=1);

define('PHP_DIR', dirname(__DIR__));
define('SECRET', 'row28-php-test-secret'); // matches router.php
define('ARTIFACT', PHP_DIR . '/upload.php');
define('ROUTER', PHP_DIR . '/tests/router.php');
define('STATE_DIR', PHP_DIR . '/.php-test-state');

$failures = [];
$passes   = 0;
function check(string $name, bool $ok, ?string $detail = ''): void {
    global $failures, $passes;
    if ($ok) { $passes++; echo "PASS  {$name}\n"; return; }
    $failures[] = $name;
    echo "FAIL  {$name}" . ($detail !== null && $detail !== '' ? " — {$detail}" : '') . "\n";
}

// ---------------------------------------------------------------- lint ----
$lint = shell_exec(escapeshellarg(PHP_BINARY) . ' -l ' . escapeshellarg(ARTIFACT) . ' 2>&1');
check('T0 lint upload.php', $lint !== null && str_contains($lint, 'No syntax errors'), (string)$lint);

// ------------------------------------------------------------- bootstrap --
if (is_dir(STATE_DIR)) {
    foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(STATE_DIR, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
        @unlink($f->isDir() ? $f->getPathname() : $f->getPathname());
    }
    @rmdir(STATE_DIR);
}
@mkdir(STATE_DIR, 0770, true);
@mkdir(STATE_DIR . '/objects', 0770, true);

// free ports: the platform mirror and the artifact server are SEPARATE
// processes — upload.php calls the mirror while the artifact server serves
// the upload, so a single-threaded built-in server can never deadlock
// against itself.
function free_port(): int {
    $probe = @stream_socket_server('tcp://127.0.0.1:0', $errno, $errstr);
    if ($probe === false) { fwrite(STDERR, "no free port\n"); exit(2); }
    $addr = (string)stream_socket_get_name($probe, false);
    fclose($probe);
    return (int)substr($addr, (int)strrpos($addr, ':') + 1);
}
$mirrorPort   = free_port();
$artifactPort = free_port();
$mirror   = "http://127.0.0.1:{$mirrorPort}";
$base     = "http://127.0.0.1:{$artifactPort}"; // the REAL upload.php endpoint

// .env the artifact reads (same names the current host upload.php uses;
// gitignored, removed at teardown — no secret is committed).
file_put_contents(PHP_DIR . '/.env', implode("\n", [
    'PLATFORM_BASE=' . $mirror,
    'UPLOAD_SERVER_SECRET=' . SECRET,
    'STORAGE_ROOT=' . STATE_DIR . '/live',
    'ALLOWED_ORIGINS=' . $mirror,
]) . "\n");

$serverLog = STATE_DIR . '/server.log';
function start_server(string $cmd, string $log, ?array $env = null) {
    $spec = [1 => ['file', $log, 'a'], 2 => ['file', $log, 'a']];
    $proc = $env === null
        ? proc_open($cmd, $spec, $unused)
        : proc_open($cmd, $spec, $unused, null, $env);
    if (!is_resource($proc)) { fwrite(STDERR, "server start failed\n"); exit(2); }
    return $proc;
}
$mirrorServer = start_server(
    escapeshellarg(PHP_BINARY) . ' -S 127.0.0.1:' . $mirrorPort . ' ' . escapeshellarg(ROUTER),
    $serverLog
);
// The artifact server has NO router: every request under the docroot is
// executed as-is, so /upload.php is THE file being tested, untouched.
$artifactServer = start_server(
    escapeshellarg(PHP_BINARY) . ' -S 127.0.0.1:' . $artifactPort . ' -t ' . escapeshellarg(PHP_DIR),
    $serverLog
);

register_shutdown_function(function () use ($mirrorServer, $artifactServer, $serverLog): void {
    @unlink(PHP_DIR . '/.env');
    foreach ([$mirrorServer, $artifactServer] as $server) {
        if (!is_resource($server)) continue;
        // Terminate and WAIT for each built-in server to exit, so no
        // grandchild keeps the harness (or the shell) alive.
        @proc_terminate($server, 15);
        for ($i = 0; $i < 50; $i++) {
            if (!proc_get_status($server)['running']) break;
            usleep(100000);
        }
        if (proc_get_status($server)['running']) {
            @proc_terminate($server, 9);
            usleep(200000);
        }
        @proc_close($server);
    }
    @unlink($serverLog);
    if (is_dir(STATE_DIR)) {
        foreach (new RecursiveIteratorIterator(new RecursiveDirectoryIterator(STATE_DIR, FilesystemIterator::SKIP_DOTS), RecursiveIteratorIterator::CHILD_FIRST) as $f) {
            @unlink($f->isDir() ? $f->getPathname() : $f->getPathname());
        }
        @rmdir(STATE_DIR);
    }
});

// wait for readiness (the mirror answers control calls)
$ready = false;
for ($i = 0; $i < 60; $i++) {
    $ctx = stream_context_create(['http' => ['method' => 'POST', 'timeout' => 1]]);
    $r = @file_get_contents($mirror . '/__control/reset', false, $ctx);
    if ($r !== false && str_contains($r, 'ok')) { $ready = true; break; }
    usleep(150000);
}
check('T0b server ready', $ready);
if (!$ready) {
    echo "HARNESS BLOCKED\n";
    echo "server log:\n" . (string)@file_get_contents(STATE_DIR . '/server.log') . "\n";
    exit(2);
}

// ---------------------------------------------------------------- helpers --
function control(string $path, array $payload): array {
    global $mirror;
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => "Content-Type: application/json\r\n",
        'content' => (string)json_encode($payload), 'timeout' => 5, 'ignore_errors' => true,
    ]]);
    $raw = file_get_contents($mirror . $path, false, $ctx);
    $code = 0;
    foreach ($http_response_header ?? [] as $h) { if (preg_match('#HTTP/\S+ (\d+)#', $h, $m)) $code = (int)$m[1]; }
    return ['code' => $code, 'json' => json_decode((string)$raw, true)];
}

function seed(string $key, int $comp, int $seq, int $gen, string $ext = 'webm'): void {
    control('/__control/seed-key', [
        'key' => $key, 'competition' => $comp, 'sequence' => $seq, 'generation' => $gen,
        'object_path' => sprintf('live/match_%d/chunk_%04d.%s', $comp, $seq, $ext),
    ]);
    control('/__control/set-lease', ['competition' => $comp, 'generation' => $gen, 'held' => true]);
}

/** POST one multipart upload to the REAL upload.php. */
function upload(int $comp, int $seq, string $ext, string $key, string $bytes): array {
    global $base;
    $boundary = '----row28' . bin2hex(random_bytes(6));
    $fields = [
        'competition_id' => (string)$comp, 'chunk_number' => (string)$seq,
        'extension' => $ext, 'offset' => '0', 'chunk_key' => $key,
        'chunk' => ['row28chunk.webm', $bytes],
    ];
    $body = '';
    foreach ($fields as $name => $value) {
        if (is_array($value)) {
            $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$name}\"; filename=\"{$value[0]}\"\r\nContent-Type: application/octet-stream\r\n\r\n{$value[1]}\r\n";
        } else {
            $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$name}\"\r\n\r\n{$value}\r\n";
        }
    }
    $body .= "--{$boundary}--\r\n";
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 20, 'ignore_errors' => true,
        'header' => "Content-Type: multipart/form-data; boundary={$boundary}\r\n",
        'content' => $body,
    ]]);
    $raw = file_get_contents($base . '/upload.php', false, $ctx);
    $code = 0;
    foreach ($http_response_header ?? [] as $h) { if (preg_match('#HTTP/\S+ (\d+)#', $h, $m)) $code = (int)$m[1]; }
    return ['code' => $code, 'json' => json_decode((string)$raw, true), 'raw' => (string)$raw];
}

function stored_path(string $objectPath): string { return STATE_DIR . '/live/' . $objectPath; }
function stored_exists(string $objectPath): bool { return file_exists(stored_path($objectPath)); }
function stored_hash(string $objectPath): string { return (string)@hash_file('sha256', stored_path($objectPath)); }
function receipt_count(): int { return count(control('/__control/receipts', [])['json']['receipts'] ?? []); }

$KEY_A = str_repeat('a1b2', 12);
$KEY_B = str_repeat('c3d4', 12);
$KEY_C = str_repeat('e5f6', 12);
$OBJ   = 'live/match_70/chunk_0001.webm';
$BYTES1 = 'FIRST-BYTES-ROW28-' . str_repeat('x', 64);
$BYTES2 = 'SECOND-BYTES-ROW28-' . str_repeat('y', 64);
$HASH1  = hash('sha256', $BYTES1);

control('/__control/reset', []);

// ===================================================================
// 1. contract: the shipped order lands a CONFIRMED receipt
// ===================================================================
seed($KEY_A, 70, 1, 1);
$r = upload(70, 1, 'webm', $KEY_A, $BYTES1);
check('T1 contract: 200 + success', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, json_encode($r['json']));
check('T1 contract: state is a platform state', in_array($r['json']['data']['state'] ?? '', ['uploaded', 'ready'], true), $r['raw']);
check('T1 contract: object stored', stored_exists($OBJ));
check('T1 contract: exactly one receipt delivered', receipt_count() === 1, (string)receipt_count());

// ===================================================================
// 2. keyless upload fails closed
// ===================================================================
$r = upload(70, 1, 'webm', '', $BYTES1);
check('T2 keyless rejected 400', $r['code'] === 400);

// ===================================================================
// 3. wrong key → verify fails, nothing stored, no receipt
// ===================================================================
$r = upload(70, 1, 'webm', str_repeat('0', 48), $BYTES2);
check('T3 unknown key → 403', $r['code'] === 403);
check('T3 unknown key: original bytes intact', stored_hash($OBJ) === $HASH1);
check('T3 unknown key: no extra receipt', receipt_count() === 1);

// ===================================================================
// 4. verify-response loss → fail closed, no store, no receipt
// ===================================================================
control('/__control/set-modes', ['modes' => ['verify' => 'lost']]);
seed($KEY_B, 70, 1, 1);
$r = upload(70, 1, 'webm', $KEY_B, $BYTES2);
check('T4 verify loss → 403 fail-closed', $r['code'] === 403, $r['raw']);
check('T4 verify loss: no receipt', receipt_count() === 1);
control('/__control/set-modes', ['modes' => ['verify' => 'ok']]);

// ===================================================================
// 5. binding mismatches rejected BEFORE storage or receipt
// ===================================================================
seed($KEY_B, 70, 1, 1);
$r = upload(71, 1, 'webm', $KEY_B, $BYTES2);   // wrong competition
check('T5 wrong competition → 409 binding mismatch', $r['code'] === 409 && str_contains($r['raw'], 'binding mismatch'), $r['raw']);
seed($KEY_B, 70, 1, 1);
$r = upload(70, 2, 'webm', $KEY_B, $BYTES2);   // wrong sequence
check('T5 wrong sequence → 409 binding mismatch', $r['code'] === 409 && str_contains($r['raw'], 'binding mismatch'), $r['raw']);
seed($KEY_B, 70, 1, 1);
$r = upload(70, 1, 'mp4', $KEY_B, $BYTES2);    // wrong extension
check('T5 wrong extension → 409 binding mismatch', $r['code'] === 409 && str_contains($r['raw'], 'binding mismatch'), $r['raw']);
check('T5 binding mismatches: original bytes intact', stored_hash($OBJ) === $HASH1);
check('T5 binding mismatches: no extra receipt', receipt_count() === 1);

// ===================================================================
// 6. HMAC canonical rule: pathname-only is accepted, query-inclusive is
//    rejected (negative control — proves the mirror enforces the rule and
//    the artifact satisfies it instead of a helper fixing it)
// ===================================================================
$sign = function (string $method, string $path, string $body, string $ts, string $nonce): string {
    $canonical = $method . "\n" . $path . "\n" . $ts . "\n" . $nonce . "\n" . hash('sha256', $body);
    return hash_hmac('sha256', $canonical, SECRET);
};
$rawCall = function (string $url, string $sig, string $ts, string $nonce): array {
    $ctx = stream_context_create(['http' => [
        'method' => 'GET', 'timeout' => 5, 'ignore_errors' => true,
        'header' => "X-Signature: {$sig}\r\nX-Timestamp: {$ts}\r\nX-Nonce: {$nonce}\r\nOrigin: " . $GLOBALS['mirror'] . "\r\nX-CSRF-Token: t\r\n",
    ]]);
    $raw = file_get_contents($url, false, $ctx);
    $code = 0;
    foreach ($http_response_header ?? [] as $h) { if (preg_match('#HTTP/\S+ (\d+)#', $h, $m)) $code = (int)$m[1]; }
    return ['code' => $code, 'json' => json_decode((string)$raw, true), 'raw' => (string)$raw];
};
seed($KEY_B, 70, 1, 1);
$ts = (string)round(microtime(true) * 1000);
$r = $rawCall($mirror . '/api/chunks/verify?key=' . $KEY_B, $sign('GET', '/api/chunks/verify', '', $ts, 'good-nonce-1'), $ts, 'good-nonce-1');
check('T6a pathname-only signature accepted', ($r['json']['valid'] ?? false) === true, (string)($r['raw'] ?? ''));
$ts = (string)round(microtime(true) * 1000);
$r = $rawCall($mirror . '/api/chunks/verify?key=' . $KEY_B, $sign('GET', '/api/chunks/verify?key=' . $KEY_B, '', $ts, 'bad-nonce-1'), $ts, 'bad-nonce-1');
check('T6b query-inclusive signature REJECTED (old bug)', $r['code'] === 403 && str_contains((string)($r['raw'] ?? ''), 'Invalid upload signature'), (string)($r['raw'] ?? ''));

// ===================================================================
// 7. concurrent DIFFERENT-byte uploads (two keys, same slot): exactly one
//    wins, the original bytes are never replaced
// ===================================================================
seed($KEY_B, 70, 2, 1);
seed($KEY_C, 70, 2, 1);
$obj2 = 'live/match_70/chunk_0002.webm';
$concurrent = function (array $uploads): array {
    global $base;
    $mh = curl_multi_init();
    $handles = [];
    foreach ($uploads as $i => $u) {
        $boundary = '----row28c' . $i;
        $body = '';
        foreach (['competition_id' => (string)$u['comp'], 'chunk_number' => (string)$u['seq'], 'extension' => $u['ext'], 'offset' => '0', 'chunk_key' => $u['key']] as $n => $v) {
            $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$n}\"\r\n\r\n{$v}\r\n";
        }
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"chunk\"; filename=\"c.webm\"\r\nContent-Type: application/octet-stream\r\n\r\n{$u['bytes']}\r\n--{$boundary}--\r\n";
        $ch = curl_init($base . '/upload.php');
        curl_setopt_array($ch, [
            CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true,
            CURLOPT_HTTPHEADER => ['Content-Type: multipart/form-data; boundary=' . $boundary],
            CURLOPT_POSTFIELDS => $body, CURLOPT_TIMEOUT => 20,
        ]);
        curl_multi_add_handle($mh, $ch);
        $handles[] = $ch;
    }
    do { $status = curl_multi_exec($mh, $active); curl_multi_select($mh); } while ($active && $status === CURLM_OK);
    $out = [];
    foreach ($handles as $ch) {
        $out[] = ['code' => (int)curl_getinfo($ch, CURLINFO_RESPONSE_CODE), 'raw' => (string)curl_multi_getcontent($ch)];
        curl_multi_remove_handle($mh, $ch);
    }
    curl_multi_close($mh);
    return $out;
};
$w1 = hash('sha256', 'WINNER-BYTES-' . str_repeat('w', 32));
$w2 = hash('sha256', 'LOSER-BYTES-' . str_repeat('l', 32));
$res = $concurrent([
    ['comp' => 70, 'seq' => 2, 'ext' => 'webm', 'key' => $KEY_B, 'bytes' => 'WINNER-BYTES-' . str_repeat('w', 32)],
    ['comp' => 70, 'seq' => 2, 'ext' => 'webm', 'key' => $KEY_C, 'bytes' => 'LOSER-BYTES-' . str_repeat('l', 32)],
]);
$codes = array_map(static fn($r) => $r['code'], $res);
sort($codes);
check('T7 concurrent different bytes: one 200 + one 409', $codes === [200, 409], json_encode($codes));
check('T7 original bytes are the winner, never replaced', stored_exists($obj2) && (stored_hash($obj2) === $w1 || stored_hash($obj2) === $w2));
check('T7 different bytes never both stored/confirmed', in_array(stored_hash($obj2), [$w1, $w2], true));

// ===================================================================
// 8. identical retry stays idempotent and does not replace the file
// ===================================================================
$sameBytes = 'WINNER-BYTES-' . str_repeat('w', 32);
seed($KEY_B, 70, 2, 1);
$r = upload(70, 2, 'webm', $KEY_B, $sameBytes);
check('T8 identical retry → 200 idempotent', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, $r['raw']);
check('T8 identical retry: bytes unchanged', stored_hash($obj2) === $w1);

// ===================================================================
// 9. receipt failure after a successful save → NO false success; then the
//    idempotent re-upload (fresh key) completes WITHOUT replacing the file
// ===================================================================
seed($KEY_A, 70, 3, 1);
control('/__control/set-modes', ['modes' => ['receipt' => 'fail']]);
$r = upload(70, 3, 'webm', $KEY_A, 'CHUNK3-BYTES-' . str_repeat('z', 40));
$obj3 = 'live/match_70/chunk_0003.webm';
$hash3 = stored_hash($obj3);
check('T9 receipt failure: object IS stored (immutable)', stored_exists($obj3));
check('T9 receipt failure: NOT reported as success', $r['code'] !== 200 && ($r['json']['success'] ?? false) !== true, $r['raw']);
check('T9 receipt failure: 502 stored-but-unconfirmed', $r['code'] === 502, (string)$r['code']);
control('/__control/set-modes', ['modes' => ['receipt' => 'ok']]);
seed($KEY_B, 70, 3, 1);
$r2 = upload(70, 3, 'webm', $KEY_B, 'CHUNK3-BYTES-' . str_repeat('z', 40));
check('T9 completion: re-upload → 200', $r2['code'] === 200 && ($r2['json']['success'] ?? false) === true, $r2['raw']);
check('T9 completion: file NOT replaced', stored_hash($obj3) === $hash3);

// ===================================================================
// 10. generation takeover between pre-check and receipt → stale, no success
// ===================================================================
seed($KEY_A, 70, 4, 1);
control('/__control/set-modes', ['modes' => ['receipt' => 'takeover']]);
$r = upload(70, 4, 'webm', $KEY_A, 'CHUNK4-BYTES-' . str_repeat('q', 30));
check('T10 takeover before receipt → not success', $r['code'] !== 200 && ($r['json']['success'] ?? false) !== true, $r['raw']);
check('T10 takeover: object stored immutably', stored_exists('live/match_70/chunk_0004.webm'));
control('/__control/set-modes', ['modes' => ['receipt' => 'ok']]);
$slot = control('/__control/state', [])['json']['slots']['70:4'] ?? null;
check('T10 takeover: slot never confirmed by the stale receipt', $slot !== null && $slot['state'] === 'uploaded', json_encode($slot));

// ===================================================================
// 11. consumed key is never re-verified (single-use) — a replay of the
//     same key fails at verify, no second store path
// ===================================================================
$r = upload(70, 3, 'webm', $KEY_A, 'CHUNK3-BYTES-' . str_repeat('z', 40));
check('T11 consumed-key replay → 403', $r['code'] === 403, $r['raw']);
check('T11 consumed-key replay: file untouched', stored_hash($obj3) === $hash3);

// ===================================================================
// 12. CONFIG COMPATIBILITY — the owner's upload-config.php ARRAY form
//     (platform_url / upload_secret / browser_origins / storage_root).
//     The artifact must be driven by the array with NO .env at all.
// ===================================================================
$writeArrayConfig = function (array $values) use ($mirror): void {
    $lines = [];
    foreach ($values as $k => $v) {
        if (is_array($v)) {
            $items = "[" . implode(', ', array_map(static fn($x) => "'" . $x . "'", $v)) . "]";
            $lines[] = "    '" . $k . "' => " . $items . ",";
        } else {
            $lines[] = "    '" . $k . "' => '" . $v . "',";
        }
    }
    file_put_contents(PHP_DIR . '/upload-config.php', "<?php\nreturn [\n" . implode("\n", $lines) . "\n];\n");
};

@unlink(PHP_DIR . '/.env');
$writeArrayConfig([
    'platform_url'    => $mirror,
    'upload_secret'   => SECRET,
    'browser_origins' => [$mirror],
    'storage_root'    => STATE_DIR . '/live',
]);
seed($KEY_A, 70, 9, 1);
$r = upload(70, 9, 'webm', $KEY_A, 'ARRAY-CONFIG-BYTES');
check('T12 array upload-config.php drives the flow (no .env)', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, $r['raw']);
check('T12 artifact stored under the configured storage_root', stored_exists('live/match_70/chunk_0009.webm'));

// browser_origins becomes the CORS allowlist (transport note only).
$ctx = stream_context_create(['http' => [
    'method' => 'OPTIONS', 'timeout' => 5, 'ignore_errors' => true,
    'header' => "Origin: {$mirror}\r\nAccess-Control-Request-Method: POST\r\n",
]]);
@file_get_contents($base . '/upload.php', false, $ctx);
$headers = implode("\n", (array)($http_response_header ?? []));
check('T12b browser_origins drives the CORS preflight allowlist', str_contains($headers, 'Access-Control-Allow-Origin: ' . $mirror), $headers);

// A partial array: .env fills ONLY the missing values (the array wins).
$writeArrayConfig(['storage_root' => STATE_DIR . '/live']);
file_put_contents(PHP_DIR . '/.env', implode("\n", [
    'PLATFORM_BASE=' . $mirror,
    'UPLOAD_SERVER_SECRET=' . SECRET,
    'STORAGE_ROOT=' . STATE_DIR . '/live',
    'ALLOWED_ORIGINS=' . $mirror,
]) . "\n");
seed($KEY_B, 70, 10, 1);
$r = upload(70, 10, 'webm', $KEY_B, 'PARTIAL-CONFIG-BYTES');
check('T13 partial array + .env fallback works', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, $r['raw']);

// No configuration at all → fail closed, nothing stored, no receipt.
@unlink(PHP_DIR . '/upload-config.php');
@unlink(PHP_DIR . '/.env');
seed($KEY_C, 70, 11, 1);
$r = upload(70, 11, 'webm', $KEY_C, 'NO-CONFIG-BYTES');
check('T14 missing configuration → 503 fail-closed', $r['code'] === 503, $r['raw']);
check('T14 missing configuration: nothing stored', !stored_exists('live/match_70/chunk_0011.webm'));

// ===================================================================
// 15. DUELI_UPLOAD_CONFIG override — a config OUTSIDE the artifact
//     directory (the documented private path) is honored.
// ===================================================================
$external = STATE_DIR . '/external-upload-config.php';
file_put_contents($external, "<?php\nreturn [\n    'platform_url' => '" . $mirror . "',\n    'upload_secret' => '" . SECRET . "',\n    'browser_origins' => ['" . $mirror . "'],\n    'storage_root' => '" . STATE_DIR . "/live',\n];\n");
$overridePort = free_port();
$overrideBase = "http://127.0.0.1:{$overridePort}";
$overrideServer = start_server(
    escapeshellarg(PHP_BINARY) . ' -S 127.0.0.1:' . $overridePort . ' -t ' . escapeshellarg(PHP_DIR),
    $serverLog,
    ['DUELI_UPLOAD_CONFIG' => $external] + getenv(),
);
$overrideReady = false;
for ($i = 0; $i < 40; $i++) {
    $probeCtx = stream_context_create(['http' => ['method' => 'POST', 'timeout' => 1, 'ignore_errors' => true]]);
    if (@file_get_contents($overrideBase . '/upload.php', false, $probeCtx) !== false) { $overrideReady = true; break; }
    usleep(150000);
}
$overrideUpload = function (string $bytes) use ($overrideBase, $mirror) {
    $boundary = '----row28ov';
    $body = '';
    foreach (['competition_id' => '70', 'chunk_number' => '12', 'extension' => 'webm', 'offset' => '0', 'chunk_key' => str_repeat('a1b2', 12)] as $n => $v) {
        $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"{$n}\"\r\n\r\n{$v}\r\n";
    }
    $body .= "--{$boundary}\r\nContent-Disposition: form-data; name=\"chunk\"; filename=\"c.webm\"\r\nContent-Type: application/octet-stream\r\n\r\n{$bytes}\r\n--{$boundary}--\r\n";
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'timeout' => 20, 'ignore_errors' => true,
        'header' => "Content-Type: multipart/form-data; boundary={$boundary}\r\n",
        'content' => $body,
    ]]);
    $raw = file_get_contents($overrideBase . '/upload.php', false, $ctx);
    $code = 0;
    foreach ($http_response_header ?? [] as $h) { if (preg_match('#HTTP/\S+ (\d+)#', $h, $m)) $code = (int)$m[1]; }
    return ['code' => $code, 'json' => json_decode((string)$raw, true), 'raw' => (string)$raw];
};
if ($overrideReady) {
    seed(str_repeat('a1b2', 12), 70, 12, 1);
    $r = $overrideUpload('OVERRIDE-CONFIG-BYTES');
    check('T15 DUELI_UPLOAD_CONFIG override honored', $r['code'] === 200 && ($r['json']['success'] ?? false) === true, $r['raw']);
    check('T15 override config stored the artifact', stored_exists('live/match_70/chunk_0012.webm'));
} else {
    check('T15 override server ready', false, 'server did not start');
}
@proc_terminate($overrideServer, 15);
for ($i = 0; $i < 50; $i++) { if (!proc_get_status($overrideServer)['running']) break; usleep(100000); }
@proc_close($overrideServer);
@unlink(PHP_DIR . '/upload-config.php');

echo "\n{$passes} passed, " . count($failures) . " failed\n";
exit($failures === [] ? 0 : 1);
