<?php
/**
 * Time Sync Endpoint
 * نقطة نهاية مزامنة الوقت
 * 
 * Returns server timestamp for client-side sync
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

echo json_encode([
    'success' => true,
    'timestamp' => round(microtime(true) * 1000), // milliseconds
    'timezone' => date_default_timezone_get(),
    'datetime' => date('Y-m-d H:i:s')
]);
