<?php
/**
 * Finalization Status Checker
 * فحص حالة الدمج
 * 
 * Check if VOD is ready and get progress info
 */

// CORS Headers
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit();
}

// Get competition ID
$competition_id = isset($_GET['id']) ? intval($_GET['id']) : null;

if (!$competition_id) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing id parameter']);
    exit();
}

// Paths
$live_dir = __DIR__ . '/storage/live/match_' . $competition_id;
$vod_file = __DIR__ . '/storage/vod/match_' . $competition_id . '.mp4';
$log_file = __DIR__ . '/logs/finalize_' . $competition_id . '.log';
$meta_file = $live_dir . '/metadata.json';

// Check VOD file exists (finalization complete)
if (file_exists($vod_file)) {
    $size = filesize($vod_file);
    
    // Update metadata
    if (file_exists($meta_file)) {
        $metadata = json_decode(file_get_contents($meta_file), true) ?: [];
        $metadata['status'] = 'ready';
        $metadata['finalized'] = true;
        $metadata['finalized_at'] = date('Y-m-d H:i:s');
        $metadata['vod_size'] = $size;
        file_put_contents($meta_file, json_encode($metadata, JSON_PRETTY_PRINT));
    }
    
    echo json_encode([
        'success' => true,
        'status' => 'ready',
        'vod_url' => '/storage/vod/match_' . $competition_id . '.mp4',
        'vod_size' => $size,
        'vod_size_mb' => round($size / 1024 / 1024, 2)
    ]);
    exit();
}

// Check if processing started
if (file_exists($meta_file)) {
    $metadata = json_decode(file_get_contents($meta_file), true) ?: [];
    
    if (isset($metadata['finalize_started'])) {
        $elapsed = time() - $metadata['finalize_started'];
        
        // Read last lines from log
        $log_tail = '';
        if (file_exists($log_file)) {
            $lines = file($log_file);
            $log_tail = implode('', array_slice($lines, -5)); // Last 5 lines
        }
        
        echo json_encode([
            'success' => true,
            'status' => 'processing',
            'started_at' => $metadata['finalize_started_at'] ?? null,
            'elapsed_seconds' => $elapsed,
            'chunks_count' => $metadata['last_chunk'] ?? 0,
            'log_tail' => $log_tail
        ]);
        exit();
    }
}

// Not started
echo json_encode([
    'success' => true,
    'status' => 'pending',
    'message' => 'Finalization has not started yet'
]);
