Set-Location 'D:\projects\opus-dueli\webapp'
Write-Output "== SEC-01: donations complete route =="
Select-String -Path 'src\modules\api\donations\routes.ts' -Pattern "complete" | Select-Object LineNumber,Line
Write-Output "== SEC-04: cron query key =="
Select-String -Path 'src\modules\api\cron\routes.ts' -Pattern "query\('key'\)|Authorization" | Select-Object LineNumber,Line
Write-Output "== SEC-05: cors() =="
Select-String -Path 'src\main.ts' -Pattern "cors\(" | Select-Object LineNumber,Line
Write-Output "== SEC-06: Math.random in security paths =="
Select-String -Path 'src\middleware','src\lib','src\modules\api' -Pattern 'Math\.random' -Recurse | Select-Object Path,LineNumber,Line
Write-Output "== SEC-07: session_id remnants =="
Select-String -Path 'src\modules\pages' -Pattern "session_id'" -Recurse | Select-Object Path,LineNumber
Write-Output "== SEC-08: localStorage session =="
(Select-String -Path 'src' -Pattern "localStorage.*[sS]ession" -Recurse | Measure-Object).Count
Write-Output "== SEC-09: unsafe-eval =="
Select-String -Path 'src\middleware\security.ts' -Pattern 'unsafe-eval|unsafe-inline' | Select-Object LineNumber,Line
Write-Output "== SEC-10: this.sockets =="
Select-String -Path 'workers' -Pattern 'this\.sockets' -Recurse | Select-Object Path,LineNumber
Write-Output "== SEC-11: token query in auth mw =="
Select-String -Path 'src\middleware\auth.ts' -Pattern "query\('token'\)" | Select-Object LineNumber,Line
Write-Output "== SEC-12: rate limit stores =="
(Select-String -Path 'src\middleware' -Pattern 'new Map\(\)' -Recurse).Count
Write-Output "== SEC-13: payment-methods / ad-blocks auth =="
Select-String -Path 'src\modules\api\payment-methods\routes.ts' -Pattern 'authMiddleware' 2>$null
Select-String -Path 'src\modules\api\ad-blocks\routes.ts' -Pattern 'authMiddleware' 2>$null
