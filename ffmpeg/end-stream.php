<?php
/**
 * End Stream API - Mark competition as ended
 * يُستدعى عند ضغط زر الإنهاء
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$inputJSON = file_get_contents('php://input');
$input = json_decode($inputJSON, true);
$compId = $input['competition_id'] ?? $_POST['competition_id'] ?? '';

if (empty($compId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing competition_id']);
    exit;
}

$liveDir = __DIR__ . "/storage/live/match_$compId";
if (!is_dir($liveDir)) {
    http_response_code(404);
    echo json_encode(['error' => 'Competition not found']);
    exit;
}

// Update status file
$statusFile = "$liveDir/status.json";
$status = [
    'competition_id' => (int)$compId,
    'is_live' => false,
    'ended' => true,
    'ended_at' => time(),
    'ended_by' => $input['user'] ?? 'host'
];

file_put_contents($statusFile, json_encode($status, JSON_PRETTY_PRINT));

// Count chunks
$chunks = glob("$liveDir/chunk_*.{mp4,webm}", GLOB_BRACE);
$chunkCount = count($chunks);

echo json_encode([
    'success' => true,
    'message' => 'Stream ended',
    'competition_id' => (int)$compId,
    'chunks_recorded' => $chunkCount,
    'ended_at' => date('Y-m-d H:i:s')
]);
