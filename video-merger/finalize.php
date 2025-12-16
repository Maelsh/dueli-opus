<?php
/**
 * Finalize Stream Handler
 * معالج إنهاء البث
 * 
 * Triggers FFmpeg to merge chunks into final video
 * يُطلق FFmpeg لدمج القطع في فيديو نهائي
 */

// CORS headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
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
$extension = isset($input['extension']) ? $input['extension'] : 'webm';

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

// Check if match directory exists
if (!is_dir($live_dir)) {
    http_response_code(404);
    echo json_encode(['success' => false, 'error' => 'Match not found']);
    exit();
}

// Create VOD directory if needed
if (!is_dir($vod_dir)) {
    mkdir($vod_dir, 0755, true);
}

// Add ENDLIST to playlist to mark stream as ended
$playlist_file = $live_dir . '/playlist.m3u8';
if (file_exists($playlist_file)) {
    $playlist = file_get_contents($playlist_file);
    if (strpos($playlist, '#EXT-X-ENDLIST') === false) {
        file_put_contents($playlist_file, $playlist . "#EXT-X-ENDLIST\n");
    }
}

// Trigger Node.js finalize script asynchronously
$node_script = __DIR__ . '/finalize.js';
$output_file = $vod_dir . '/match_' . $competition_id . '.mp4';

// Run Node.js in background (non-blocking)
$command = sprintf(
    'node %s %d %s > /dev/null 2>&1 &',
    escapeshellarg($node_script),
    $competition_id,
    escapeshellarg($extension)
);

// Execute command
exec($command);

// Return immediately (processing happens in background)
echo json_encode([
    'success' => true,
    'message' => 'Finalization started',
    'competition_id' => $competition_id,
    'expected_output' => '/storage/vod/match_' . $competition_id . '.mp4'
]);
