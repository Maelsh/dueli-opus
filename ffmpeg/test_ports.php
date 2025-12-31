<?php
/**
 * Port Tester - Test UDP/TCP Port Availability
 * اختبار توفر منافذ UDP/TCP
 * 
 * Place this file on your server and access it via browser
 * ضع هذا الملف على سيرفرك وافتحه من المتصفح
 */
header('Content-Type: text/html; charset=utf-8');
echo "<html><head><title>Port Tester</title>";
echo "<style>
body { font-family: Arial; padding: 20px; background: #f5f5f5; }
.result { padding: 15px; margin: 10px 0; border-radius: 5px; }
.success { background: #d4edda; border: 1px solid #c3e6cb; color: #155724; }
.error { background: #f8d7da; border: 1px solid #f5c6cb; color: #721c24; }
.info { background: #d1ecf1; border: 1px solid #bee5eb; color: #0c5460; }
h2 { color: #333; }
code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; }
</style></head><body>";
echo "<h1>🔌 Port Availability Tester</h1>";
echo "<p>Testing if this shared hosting allows opening UDP/TCP ports...</p>";
// Test ports
$ports_to_test = [
    ['type' => 'tcp', 'port' => 3478],
    ['type' => 'tcp', 'port' => 8080],
    ['type' => 'tcp', 'port' => 3000],
    ['type' => 'udp', 'port' => 3478],
];
foreach ($ports_to_test as $test) {
    $type = strtoupper($test['type']);
    $port = $test['port'];
    
    echo "<h2>Testing {$type} Port {$port}</h2>";
    
    if ($test['type'] === 'tcp') {
        testTCP($port);
    } else {
        testUDP($port);
    }
}
// Additional info
echo "<hr><h2>📋 Server Information</h2>";
echo "<div class='result info'>";
echo "<strong>PHP Version:</strong> " . phpversion() . "<br>";
echo "<strong>Disabled Functions:</strong> " . ini_get('disable_functions') . "<br>";
echo "<strong>Open Base Dir:</strong> " . (ini_get('open_basedir') ?: 'None') . "<br>";
echo "<strong>Safe Mode:</strong> " . (ini_get('safe_mode') ? 'Yes ⚠️' : 'No ✅') . "<br>";
echo "</div>";
echo "<hr><h2>💡 What This Means</h2>";
echo "<div class='result info'>";
echo "<p><strong>If all tests FAILED:</strong><br>";
echo "→ This shared hosting does NOT allow opening custom ports<br>";
echo "→ You MUST use external TURN service (OpenRelay, Metered.ca)<br>";
echo "→ Cannot run coturn on this server</p>";
echo "<p><strong>If TCP tests PASSED:</strong><br>";
echo "→ You can run HTTP/WebSocket servers on custom ports<br>";
echo "→ Use Apache reverse proxy to port 80/443<br>";
echo "→ Still need external TURN for UDP (WebRTC media)</p>";
echo "<p><strong>If UDP tests PASSED:</strong><br>";
echo "→ Rare on shared hosting! 🎉<br>";
echo "→ You CAN run coturn TURN server<br>";
echo "→ Full control over WebRTC infrastructure</p>";
echo "</div>";
echo "</body></html>";
// ============================================
// TEST FUNCTIONS
// ============================================
function testTCP($port) {
    $address = '0.0.0.0';
    
    // Try to create socket
    $socket = @socket_create(AF_INET, SOCK_STREAM, SOL_TCP);
    
    if ($socket === false) {
        showError("Failed to create TCP socket: " . socket_strerror(socket_last_error()));
        return;
    }
    
    // Allow reuse
    @socket_set_option($socket, SOL_SOCKET, SO_REUSEADDR, 1);
    
    // Try to bind
    $result = @socket_bind($socket, $address, $port);
    
    if ($result === false) {
        $error = socket_strerror(socket_last_error($socket));
        socket_close($socket);
        
        if (strpos($error, 'Permission denied') !== false) {
            showError("❌ BLOCKED: Permission denied to bind TCP port $port<br>→ This port range is restricted on this hosting");
        } elseif (strpos($error, 'Address already in use') !== false) {
            showSuccess("✅ Port $port is AVAILABLE (but currently in use by another service)");
        } else {
            showError("❌ Error: $error");
        }
        return;
    }
    
    // Try to listen
    $listen_result = @socket_listen($socket, 5);
    
    if ($listen_result === false) {
        $error = socket_strerror(socket_last_error($socket));
        socket_close($socket);
        showError("❌ Bind OK but Listen failed: $error");
        return;
    }
    
    // Success!
    socket_close($socket);
    showSuccess("✅ SUCCESS: TCP port $port is fully available!<br>→ You can run servers on this port");
}
function testUDP($port) {
    $address = '0.0.0.0';
    
    // Try to create UDP socket
    $socket = @socket_create(AF_INET, SOCK_DGRAM, SOL_UDP);
    
    if ($socket === false) {
        showError("Failed to create UDP socket: " . socket_strerror(socket_last_error()));
        return;
    }
    
    // Try to bind
    $result = @socket_bind($socket, $address, $port);
    
    if ($result === false) {
        $error = socket_strerror(socket_last_error($socket));
        socket_close($socket);
        
        if (strpos($error, 'Permission denied') !== false) {
            showError("❌ BLOCKED: Permission denied to bind UDP port $port<br>→ UDP ports are restricted on this hosting<br>→ <strong>Must use external TURN service</strong>");
        } elseif (strpos($error, 'Address already in use') !== false) {
            showSuccess("✅ Port $port is AVAILABLE (but currently in use)");
        } else {
            showError("❌ Error: $error");
        }
        return;
    }
    
    // Success!
    socket_close($socket);
    showSuccess("✅ SUCCESS: UDP port $port is available! 🎉<br>→ You can run coturn TURN server");
}
function showSuccess($msg) {
    echo "<div class='result success'>{$msg}</div>";
}
function showError($msg) {
    echo "<div class='result error'>{$msg}</div>";
}
function showInfo($msg) {
    echo "<div class='result info'>{$msg}</div>";
}
?>