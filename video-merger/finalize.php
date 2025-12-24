<?php
/**
 * Dueli Finalize - SAFE VERSION
 * Uses RELATIVE paths + verification before deletion
 */

set_time_limit(0);
ignore_user_abort(true);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit(http_response_code(200));
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

$input = json_decode(file_get_contents('php://input'), true);
$competition_id = isset($input['competition_id']) ? intval($input['competition_id']) : null;

if (!$competition_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing competition_id']);
    exit();
}

// Paths
$ffmpeg_path = '/home/maelshpr/nodevenv/ffmpeg/10/lib/node_modules/ffmpeg-static/ffmpeg';
$base_dir = __DIR__ . '/storage';
$live_dir = $base_dir . '/live/match_' . $competition_id;
$vod_dir = $base_dir . '/vod';
$log_dir = __DIR__ . '/logs';
$concat_file = $live_dir . '/concat.txt';
$output_file = $vod_dir . '/match_' . $competition_id . '.mp4';
$log_file = $log_dir . '/finalize_' . $competition_id . '.log';

if (!is_dir($live_dir)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Match directory not found']);
    exit();
}

if (!is_dir($vod_dir)) mkdir($vod_dir, 0755, true);
if (!is_dir($log_dir)) mkdir($log_dir, 0755, true);

// Find chunks
$chunks = glob($live_dir . '/chunk_*.{webm,mp4}', GLOB_BRACE);
sort($chunks);

if (empty($chunks)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'No chunks found']);
    exit();
}

// Create concat file with RELATIVE paths
$concat_content = '';
foreach ($chunks as $chunk) {
    $concat_content .= "file '" . basename($chunk) . "'\n";  // ✅ Relative path
}
file_put_contents($concat_file, $concat_content);

// Log start
file_put_contents($log_file, 
    "=== Finalize " . date('Y-m-d H:i:s') . " ===\n" .
    "Chunks: " . count($chunks) . "\n" .
    "Output: $output_file\n\n"
);

// FFmpeg command - cd to directory first!
$ffmpeg_cmd = sprintf(
    'cd %s && %s ' .
    '-probesize 50M -analyzeduration 50M ' .
    '-f concat -safe 0 -i concat.txt ' .
    '-fflags +genpts ' .
    '-c copy ' .
    '-bsf:a aac_adtstoasc ' .
    '-movflags +faststart ' .
    '-y %s >> %s 2>&1',
    escapeshellarg($live_dir),   // ✅ cd first
    $ffmpeg_path,
    escapeshellarg($output_file),
    escapeshellarg($log_file)
);

file_put_contents($log_file, "Command:\n$ffmpeg_cmd\n\n", FILE_APPEND);

// Execute
exec($ffmpeg_cmd, $exec_output, $return_code);
file_put_contents($log_file, implode("\n", $exec_output) . "\n", FILE_APPEND);

// Verify output before deletion
$success = false;
$file_size = 0;

if (file_exists($output_file)) {
    $file_size = filesize($output_file);
    
    if ($file_size > 1000) {  // ✅ Verify size
        $success = true;
        
        // Delete chunks ONLY after verification
        foreach ($chunks as $chunk) @unlink($chunk);
        @unlink($concat_file);
        
        file_put_contents($log_file, "\n✅ SUCCESS ($file_size bytes)\n", FILE_APPEND);
    } else {
        file_put_contents($log_file, "\n❌ FAILED: Output too small\n", FILE_APPEND);
    }
} else {
    file_put_contents($log_file, "\n❌ FAILED: No output file\n", FILE_APPEND);
}

if ($success) {
    echo json_encode([
        'success' => true,
        'vod_url' => '/storage/vod/match_' . $competition_id . '.mp4',
        'size' => $file_size
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Merge failed',
        'log_file' => '/logs/finalize_' . $competition_id . '.log'
    ]);
}
