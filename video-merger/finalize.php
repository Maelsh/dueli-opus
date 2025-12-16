<?php
/**
 * Finalize Stream Handler (Shared Hosting Compatible)
 * معالج إنهاء البث (متوافق مع الاستضافة المشتركة)
 * 
 * Uses PHP + FFmpeg directly instead of Node.js
 * Runs FFmpeg in background - returns immediately
 */

// ============================================
// SHARED HOSTING CONFIGURATIONS
// ============================================

// CRITICAL: Disable time limit for long FFmpeg operations
set_time_limit(0);

// Ignore user abort - continue processing even if browser disconnects
ignore_user_abort(true);

// ============================================
// CORS HEADERS - Allow Cloudflare Pages
// ============================================
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-Requested-With');
header('Access-Control-Max-Age: 86400');
header('Content-Type: application/json');

// Handle preflight requests
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Only accept POST requests
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit();
}

// Get JSON body
$input = json_decode(file_get_contents('php://input'), true);
$competition_id = isset($input['competition_id']) ? intval($input['competition_id']) : null;
$extension = isset($input['extension']) ? $input['extension'] : 'mp4';

// Validate
if (!$competition_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing competition_id']);
    exit();
}

// Paths
$base_dir = __DIR__ . '/storage';
$live_dir = $base_dir . '/live/match_' . $competition_id;
$vod_dir = $base_dir . '/vod';
$log_dir = __DIR__ . '/logs';

// Check if match directory exists
if (!is_dir($live_dir)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Match not found: match_' . $competition_id]);
    exit();
}

// Create directories if needed (with proper permissions)
if (!is_dir($vod_dir)) {
    mkdir($vod_dir, 0755, true);
}
if (!is_dir($log_dir)) {
    mkdir($log_dir, 0755, true);
}

// Add ENDLIST to playlist to mark stream as ended
$playlist_file = $live_dir . '/playlist.m3u8';
if (file_exists($playlist_file)) {
    $playlist = file_get_contents($playlist_file);
    if (strpos($playlist, '#EXT-X-ENDLIST') === false) {
        file_put_contents($playlist_file, $playlist . "#EXT-X-ENDLIST\n");
    }
}

// Find all chunks (supports both webm and mp4)
$chunks = glob($live_dir . '/chunk_*.{webm,mp4}', GLOB_BRACE);
sort($chunks); // Sort alphabetically (chunk_0001, chunk_0002, etc.)

if (empty($chunks)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'No chunks found in match_' . $competition_id]);
    exit();
}

// Create concat file for FFmpeg
$concat_file = $live_dir . '/concat.txt';
$concat_content = '';
foreach ($chunks as $chunk) {
    // Use absolute path
    $concat_content .= "file '" . realpath($chunk) . "'\n";
}
file_put_contents($concat_file, $concat_content);

// Output file paths
$output_file = $vod_dir . '/match_' . $competition_id . '.mp4';
$log_file = $log_dir . '/finalize_' . $competition_id . '.log';

// ============================================
// FFMPEG COMMAND (BACKGROUND EXECUTION)
// ============================================
// - nice -n 19: Low priority to not overload shared server
// - > log 2>&1 &: Run in background, redirect output to log
// - nohup: Prevent hangup when PHP script ends

$ffmpeg_cmd = sprintf(
    'nohup nice -n 19 ffmpeg -f concat -safe 0 -i %s -c:v libx264 -c:a aac -preset fast -crf 23 -movflags +faststart -y %s >> %s 2>&1 &',
    escapeshellarg($concat_file),
    escapeshellarg($output_file),
    escapeshellarg($log_file)
);

// Log the start
$log_content = "===========================================\n";
$log_content .= "Finalization started at " . date('Y-m-d H:i:s') . "\n";
$log_content .= "Competition ID: " . $competition_id . "\n";
$log_content .= "Chunks count: " . count($chunks) . "\n";
$log_content .= "Output file: " . $output_file . "\n";
$log_content .= "Command: " . $ffmpeg_cmd . "\n";
$log_content .= "===========================================\n";
file_put_contents($log_file, $log_content);

// Execute command in background (returns immediately)
exec($ffmpeg_cmd);

// Update metadata
$meta_file = $live_dir . '/metadata.json';
$metadata = [];
if (file_exists($meta_file)) {
    $metadata = json_decode(file_get_contents($meta_file), true) ?: [];
}
$metadata['finalize_started'] = time();
$metadata['finalize_started_at'] = date('Y-m-d H:i:s');
$metadata['expected_output'] = $output_file;
$metadata['status'] = 'processing';
file_put_contents($meta_file, json_encode($metadata, JSON_PRETTY_PRINT));

// Return immediately (FFmpeg runs in background)
echo json_encode([
    'success' => true,
    'message' => 'Finalization started in background. Check status endpoint for progress.',
    'competition_id' => $competition_id,
    'chunks_count' => count($chunks),
    'expected_output' => '/storage/vod/match_' . $competition_id . '.mp4',
    'log_file' => '/logs/finalize_' . $competition_id . '.log',
    'status_url' => '/status.php?id=' . $competition_id
]);
