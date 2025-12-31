<?php
/**
 * Playlist API - Get competition chunks
 * بدون دمج - chunks فقط!
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');
header('Content-Type: application/json');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
$compId = $_GET['id'] ?? '';
if (empty($compId)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing competition ID']);
    exit;
}
$liveDir = __DIR__ . "/storage/live/match_$compId";
if (!is_dir($liveDir)) {
    http_response_code(404);
    echo json_encode(['error' => 'Competition not found']);
    exit;
}

// Get all chunks (MP4 or WebM)
$chunks = glob("$liveDir/chunk_*.{mp4,webm}", GLOB_BRACE);
natsort($chunks);
$chunks = array_values($chunks); // Re-index

// Read metadata
$metaFile = "$liveDir/metadata.json";
$metadata = file_exists($metaFile) ? json_decode(file_get_contents($metaFile), true) : [];

// Check if live or ended
$statusFile = "$liveDir/status.json";
$statusData = file_exists($statusFile) ? json_decode(file_get_contents($statusFile), true) : [];
$isLive = isset($statusData['is_live']) ? $statusData['is_live'] : false;
$isEnded = isset($statusData['ended']) ? $statusData['ended'] : false;

// If no status file, check if last chunk was updated recently (5 min)
if (!file_exists($statusFile) && count($chunks) > 0) {
    $lastChunk = end($chunks);
    $lastModified = filemtime($lastChunk);
    $isLive = (time() - $lastModified) < 300; // Last chunk within 5 minutes = live
}

// Extension detection
$extension = 'webm';
if (count($chunks) > 0) {
    $firstChunk = $chunks[0];
    $extension = pathinfo($firstChunk, PATHINFO_EXTENSION);
}
if (isset($metadata['extension'])) {
    $extension = $metadata['extension'];
}

// Calculate chunk durations (estimate from file size or use default)
$chunkDuration = isset($metadata['chunk_duration']) ? $metadata['chunk_duration'] : 10; // seconds

// Build playlist
$playlist = [
    'competition_id' => (int)$compId,
    'is_live' => $isLive,
    'is_ended' => $isEnded,
    'status' => $isLive ? 'live' : ($isEnded ? 'ended' : 'recorded'),
    'chunks' => [],
    'total_duration' => 0,
    'chunk_duration' => $chunkDuration,
    'extension' => $extension,
    'updated_at' => time()
];

foreach ($chunks as $index => $chunk) {
    $basename = basename($chunk);
    $duration = $chunkDuration; // Use default
    
    // Try to read duration from metadata if exists
    $chunkMetaFile = "$liveDir/{$basename}.meta.json";
    if (file_exists($chunkMetaFile)) {
        $chunkMeta = json_decode(file_get_contents($chunkMetaFile), true);
        if (isset($chunkMeta['duration'])) {
            $duration = $chunkMeta['duration'];
        }
    }
    
    $playlist['chunks'][] = [
        'index' => $index,
        'file' => $basename,
        'url' => "https://maelsh.pro/ffmpeg/stream.php?path=live/match_$compId/$basename",
        'duration' => $duration,
        'size' => filesize($chunk)
    ];
    
    $playlist['total_duration'] += $duration;
}

echo json_encode($playlist, JSON_PRETTY_PRINT);
