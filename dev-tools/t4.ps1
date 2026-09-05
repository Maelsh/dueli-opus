Set-Location 'D:\projects\opus-dueli\webapp'
Get-ChildItem -Path 'src\middleware' -Filter *.ts | Select-Object Name
Write-Output "---"
Get-Content 'src\middleware\rate-limit.ts' -ErrorAction SilentlyContinue | Select-Object -First 20
Write-Output "---security.ts rate section---"
Select-String -Path 'src\middleware\security.ts' -Pattern 'rateLimit|Map\(' | Select-Object LineNumber,Line
Write-Output "---payment dirs---"
Get-ChildItem -Path 'src\modules\api' -Directory | Select-Object Name
