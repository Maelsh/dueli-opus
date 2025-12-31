<?php
/**
 * Stream Proxy with CORS
 */
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Range, Content-Type');
header('Access-Control-Expose-Headers: Content-Length, Content-Range');
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}
$path = $_GET['path'] ?? '';
if (empty($path)) {
    http_response_code(400);
    echo json_encode(['error' => 'Missing path']);
    exit;
}
// Security: prevent directory traversal
$path = str_replace(['..', '//'], '', $path);
$fullPath = __DIR__ . "/storage/" . $path;
if (!file_exists($fullPath)) {
    http_response_code(404);
    echo json_encode([
        'error' => 'File not found',
        'path' => $path,
        'full_path' => $fullPath
    ]);
    exit;
}
// Determine MIME type
$ext = pathinfo($fullPath, PATHINFO_EXTENSION);
$mimeTypes = [
    'mp4' => 'video/mp4',
    'webm' => 'video/webm',
    'm3u8' => 'application/vnd.apple.mpegurl',
    'ts' => 'video/mp2t'
];
$mimeType = $mimeTypes[$ext] ?? 'application/octet-stream';
header('Content-Type: ' . $mimeType);
// Support range requests
$fileSize = filesize($fullPath);
if (isset($_SERVER['HTTP_RANGE'])) {
    $range = $_SERVER['HTTP_RANGE'];
    $range = str_replace('bytes=', '', $range);
    list($start, $end) = explode('-', $range);
    
    $start = intval($start);
    $end = $end ? intval($end) : $fileSize - 1;
    
    header('HTTP/1.1 206 Partial Content');
    header('Content-Range: bytes ' . $start . '-' . $end . '/' . $fileSize);
    header('Content-Length: ' . ($end - $start + 1));
    
    $fp = fopen($fullPath, 'rb');
    fseek($fp, $start);
    echo fread($fp, $end - $start + 1);
    fclose($fp);
} else {
    header('Content-Length: ' . $fileSize);
    readfile($fullPath);
}
