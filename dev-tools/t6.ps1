Set-Location 'D:\projects\opus-dueli\webapp'
Get-ChildItem -Path 'src' -Filter *.ts -Recurse | Select-String -Pattern "middleware/rate-limit" | Select-Object Path,LineNumber,Line
