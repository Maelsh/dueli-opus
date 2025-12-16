<?php
/**
 * Chunk Upload Handler
 * معالج رفع القطع
 * 
 * Receives video chunks from clients and stores them
 * يستقبل قطع الفيديو من العملاء ويخزنها
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

// Get parameters
$competition_id = isset($_POST['competition_id']) ? intval($_POST['competition_id']) : null;
$chunk_number = isset($_POST['chunk_number']) ? intval($_POST['chunk_number']) : null;
$extension = isset($_POST['extension']) ? $_POST['extension'] : 'webm';
$offset = isset($_POST['offset']) ? floatval($_POST['offset']) : 0;

// Validate required fields
if (!$competition_id || !$chunk_number || !isset($_FILES['chunk'])) {
    http_response_code(400);
    echo json_encode([
        'success' => false, 
        'error' => 'Missing required parameters: competition_id, chunk_number, chunk file'
    ]);
    exit();
}

// Validate file upload
if ($_FILES['chunk']['error'] !== UPLOAD_ERR_OK) {
    http_response_code(400);
    echo json_encode([
        'success' => false, 
        'error' => 'File upload error: ' . $_FILES['chunk']['error']
    ]);
    exit();
}

// Sanitize extension (only allow webm or mp4)
$extension = in_array($extension, ['webm', 'mp4']) ? $extension : 'webm';

// Create storage directory
$base_dir = __DIR__ . '/storage/live';
$match_dir = $base_dir . '/match_' . $competition_id;

if (!is_dir($match_dir)) {
    if (!mkdir($match_dir, 0755, true)) {
        http_response_code(500);
        echo json_encode([
            'success' => false, 
            'error' => 'Failed to create storage directory'
        ]);
        exit();
    }
}

// Create filename with zero-padded chunk number
$filename = sprintf('chunk_%04d.%s', $chunk_number, $extension);
$filepath = $match_dir . '/' . $filename;

// Move uploaded file
if (!move_uploaded_file($_FILES['chunk']['tmp_name'], $filepath)) {
    http_response_code(500);
    echo json_encode([
        'success' => false, 
        'error' => 'Failed to save chunk file'
    ]);
    exit();
}

// Save offset for sync (only first chunk)
if ($chunk_number === 1) {
    file_put_contents($match_dir . '/offset.txt', $offset);
}

// Save metadata
$meta_file = $match_dir . '/metadata.json';
$metadata = [];
if (file_exists($meta_file)) {
    $metadata = json_decode(file_get_contents($meta_file), true) ?: [];
}

$metadata['last_chunk'] = $chunk_number;
$metadata['extension'] = $extension;
$metadata['updated_at'] = time();
$metadata['chunks'][$chunk_number] = [
    'filename' => $filename,
    'size' => filesize($filepath),
    'uploaded_at' => time()
];

file_put_contents($meta_file, json_encode($metadata, JSON_PRETTY_PRINT));

// Return success
echo json_encode([
    'success' => true,
    'chunk' => $filename,
    'match_dir' => 'match_' . $competition_id,
    'chunk_count' => count($metadata['chunks'] ?? [])
]);
