Set-Location 'D:\projects\opus-dueli\webapp'
Write-Output "== SEC-11: token in query (auth.ts) =="
Select-String -Path 'src\middleware\auth.ts' -Pattern "query\('token'\)"
Write-Output "== SEC-09: CSP unsafe-eval/unsafe-inline =="
Select-String -Path 'src\middleware\security.ts' -Pattern 'unsafe-eval|unsafe-inline'
Write-Output "== SEC-08: localStorage session count =="
(Get-ChildItem -Path 'src' -Filter *.ts -Recurse | Select-String -Pattern "localStorage.*[sS]ession").Count
Write-Output "== SEC-07: session_id count =="
(Get-ChildItem -Path 'src\modules\pages' -Filter *.ts -Recurse | Select-String -Pattern "session_id'").Count
Write-Output "== SEC-03: chunks auth (Origin startsWith) =="
Select-String -Path 'src\modules\api\chunks\routes.ts' -Pattern 'Origin|startsWith|X-Signature'
Write-Output "== SEC-02: WithdrawalRequestModel batch/ledger =="
Select-String -Path 'src\models\WithdrawalRequestModel.ts' -Pattern 'db.batch|financial_ledger|on_hold'
Write-Output "== donate-page paypal button =="
Select-String -Path 'src\modules\pages\donate-page.ts' -Pattern 'paypal' -CaseSensitive:$false
Write-Output "== git status =="
git status --short
Write-Output "== tsc DO worker =="
Set-Location 'workers\dueli-realtime'
npx tsc --noEmit 2>&1 | Select-Object -First 20
