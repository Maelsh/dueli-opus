Select-String -Path 'D:\projects\opus-dueli\webapp\src\lib\services\CryptoUtils.ts' -Pattern 'export|timingSafe|constantTime' | Select-Object LineNumber,Line
