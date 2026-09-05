Set-Location 'D:\projects\opus-dueli\webapp'
Get-ChildItem -Path 'src' -Filter *.ts -Recurse | Select-String -Pattern 'paypal' -CaseSensitive:$false | Select-Object Path,LineNumber,Line
