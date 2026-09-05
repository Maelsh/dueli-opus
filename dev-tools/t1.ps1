Select-String -Path 'D:\projects\opus-dueli\webapp\src\modules\api\sse\routes.ts' -Pattern 'POLL_INTERVAL_MS|HEARTBEAT_MS' | Select-Object LineNumber,Line
