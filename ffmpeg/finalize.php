<?php
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
$compId = $input['competition_id'] ?? '';
if (empty($compId)) {
    echo json_encode(['error' => 'Missing comp_id']);
    exit;
}
$liveDir = __DIR__ . "/storage/live/match_$compId";
$vodDir = __DIR__ . "/storage/vod";
$logDir = __DIR__ . "/storage/logs";
$output = "$vodDir/match_$compId.webm";
$playlist = "$liveDir/playlist.m3u8";
if (!is_dir($vodDir)) mkdir($vodDir, 0755, true);
if (!is_dir($logDir)) mkdir($logDir, 0755, true);
if (!file_exists($playlist)) {
    echo json_encode(['error' => 'No playlist']);
    exit;
}
// ⭐ حفظ نسخة من playlist قبل الحذف
copy($playlist, "$logDir/match_$compId.m3u8");
// عدد القطع
$chunks = glob("$liveDir/chunk_*.webm");
$chunkCount = count($chunks);
$ffmpeg = __DIR__ . '/node_modules/ffmpeg-static/ffmpeg';
$cmd = "cd '$liveDir' && '$ffmpeg' -y "
     . "-allowed_extensions ALL "
     . "-protocol_whitelist file,http,https,tcp,tls "
     . "-probesize 50M "
     . "-analyzeduration 100M "
     . "-i playlist.m3u8 "
     . "-c copy "
     . "-ignore_unknown "
     . "-max_interleave_delta 0 "
     . "-avoid_negative_ts make_zero "
     . "-f webm "
     . "'$output' 2>&1";
exec($cmd, $out, $ret);
// ⭐ حفظ ffmpeg log
file_put_contents("$logDir/match_$compId.log", implode("\n", $out));
if ($ret === 0 && file_exists($output)) {
    // حذف chunks
    foreach ($chunks as $c) @unlink($c);
    @unlink("$liveDir/metadata.json");
    @unlink("$liveDir/offset.txt");
    @unlink("$liveDir/playlist.m3u8");
    @rmdir($liveDir);
    
    // قراءة مدة الفيديو الفعلية
    $getDuration = "'$ffmpeg' -i '$output' 2>&1 | grep Duration";
    $durationOut = shell_exec($getDuration);
    
    echo json_encode([
        'success' => true,
        'vod_url' => "https://maelsh.pro/ffmpeg/storage/vod/match_$compId.webm",
        'chunks_uploaded' => $chunkCount,
        'duration_info' => $durationOut,
        'log_saved' => "logs/match_$compId.log"
    ]);
} else {
    echo json_encode([
        'error' => 'Failed',
        'chunks_found' => $chunkCount,
        'log' => array_slice($out, -15),
        'log_saved' => "logs/match_$compId.log"
    ]);
}