Write-Output "--- SEC-06 Math.random in security paths ---"
Select-String -Path 'D:\projects\opus-dueli\webapp\src\middleware\security.ts' -Pattern 'Math.random'
Select-String -Path 'D:\projects\opus-dueli\webapp\src\modules\api\chunks\routes.ts' -Pattern 'Math.random'
Write-Output "--- SEC-11 token in query in auth.ts ---"
Select-String -Path 'D:\projects\opus-dueli\webapp\src\middleware\auth.ts' -Pattern "query\('token'\)"
Write-Output "--- SEC-07 session_id in pages ---"
Get-ChildItem -Path 'D:\projects\opus-dueli\webapp\src\modules\pages' -Filter *.ts -Recurse | Select-String -Pattern "session_id'"
Write-Output "--- SEC-05 cors() bare ---"
Select-String -Path 'D:\projects\opus-dueli\webapp\src\main.ts' -Pattern 'cors\('
Write-Output "--- SEC-10 this.sockets in workers ---"
Get-ChildItem -Path 'D:\projects\opus-dueli\webapp\workers' -Filter *.ts -Recurse | Select-String -Pattern 'this.sockets'
Write-Output "--- SEC-01 donations complete route ---"
Select-String -Path 'D:\projects\opus-dueli\webapp\src\modules\api\donations\routes.ts' -Pattern "/complete|paypal"
Write-Output "--- SEC-02 withdrawal model ---"
Test-Path 'D:\projects\opus-dueli\webapp\src\models\WithdrawalRequestModel.ts'
Write-Output "--- SEC-04 cron key query ---"
Select-String -Path 'D:\projects\opus-dueli\webapp\src\modules\api\cron\routes.ts' -Pattern "query\('key'\)|Authorization"
