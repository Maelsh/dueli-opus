Set-Location 'D:\projects\opus-dueli\webapp'
Select-String -Path 'src\config\types.ts' -Pattern 'ALLOWED_ORIGINS|Bindings' | Select-Object LineNumber,Line
Write-Output "---dev vars---"
Get-Content '.dev.vars.example' | Select-Object -First 30
