Set-Location 'D:\projects\opus-dueli\webapp'
Write-Output "== SEC-06: Math.random in security paths =="
Get-ChildItem -Path 'src\middleware','src\lib','src\modules\api' -Filter *.ts -Recurse | Select-String -Pattern 'Math\.random' | Select-Object Path,LineNumber,Line
Write-Output "== SEC-07: session_id remnants in pages =="
Get-ChildItem -Path 'src\modules\pages' -Filter *.ts -Recurse | Select-String -Pattern "session_id'" | Select-Object Path,LineNumber,Line
Write-Output "== SEC-08: localStorage session count =="
(Get-ChildItem -Path 'src' -Filter *.ts -Recurse | Select-String -Pattern "localStorage.*[sS]ession").Count
Write-Output "== SEC-10: this.sockets in workers =="
Get-ChildItem -Path 'workers' -Filter *.ts -Recurse | Select-String -Pattern 'this\.sockets' | Select-Object Path,LineNumber
Write-Output "== SEC-12: rate limit new Map() count =="
Get-ChildItem -Path 'src\middleware' -Filter *.ts | Select-String -Pattern 'new Map\(\)' | Select-Object Path,LineNumber
Write-Output "== find payment-methods dir =="
Get-ChildItem -Path 'src\modules\api' -Directory | Where-Object { $_.Name -like '*payment*' }
