<?php
/**
 * Time Sync Endpoint
 * نقطة نهاية مزامنة الوقت
 * 
 * Returns server timestamp for client-side sync
 */

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET');

echo json_encode([
    'success' => true,
    'timestamp' => round(microtime(true) * 1000) // milliseconds
]);
