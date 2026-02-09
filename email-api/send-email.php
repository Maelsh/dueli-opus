<?php
/**
 * Email API Endpoint for Dueli
 * يجب رفع هذا الملف على استضافة iFastNet
 * 
 * الاستخدام: POST /send-email.php
 */

// رمز سري للتحقق من أن الطلب من تطبيقك فقط
define('API_SECRET', ''); // غيّر هذا لرمز سري قوي

// إعدادات CORS للسماح بالطلبات من Cloudflare
header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, X-API-Key');

// Handle preflight
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Only allow POST
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['success' => false, 'error' => 'Method not allowed']);
    exit;
}

// Verify API key
$headers = getallheaders();
$apiKey = $headers['X-API-Key'] ?? $headers['x-api-key'] ?? '';

if ($apiKey !== API_SECRET) {
    http_response_code(401);
    echo json_encode(['success' => false, 'error' => 'Unauthorized']);
    exit;
}

// Get JSON body
$input = file_get_contents('php://input');
$data = json_decode($input, true);

if (!$data) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid JSON']);
    exit;
}

// Validate required fields
$to = $data['to'] ?? '';
$subject = $data['subject'] ?? '';
$html = $data['html'] ?? '';
$fromName = $data['fromName'] ?? 'Dueli';
$fromEmail = $data['fromEmail'] ?? 'dueli@maelsh.pro'; // غيّر هذا لإيميلك

if (empty($to) || empty($subject) || empty($html)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Missing required fields: to, subject, html']);
    exit;
}

// Validate email format
if (!filter_var($to, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['success' => false, 'error' => 'Invalid email address']);
    exit;
}

// Build email headers with anti-spam improvements
$messageId = '<' . uniqid('dueli_', true) . '@maelsh.pro>';
$headers = [
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=UTF-8',
    'From: ' . mb_encode_mimeheader($fromName, 'UTF-8') . ' <' . $fromEmail . '>',
    'Reply-To: ' . $fromEmail,
    'Return-Path: ' . $fromEmail,
    'Message-ID: ' . $messageId,
    'Date: ' . date('r'),
    'X-Priority: 3',
    'X-MSMail-Priority: Normal',
    'Importance: Normal',
    'List-Unsubscribe: <mailto:unsubscribe@maelsh.pro?subject=Unsubscribe>'
];

// Encode subject for UTF-8 support
$encodedSubject = mb_encode_mimeheader($subject, 'UTF-8');

// Send email using PHP mail()
$success = mail($to, $encodedSubject, $html, implode("\r\n", $headers), '-f' . $fromEmail);

if ($success) {
    echo json_encode([
        'success' => true,
        'message' => 'Email sent successfully',
        'id' => $messageId
    ]);
} else {
    http_response_code(500);
    echo json_encode([
        'success' => false,
        'error' => 'Failed to send email. Check server mail configuration.'
    ]);
}
