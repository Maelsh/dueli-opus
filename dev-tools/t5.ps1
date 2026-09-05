Select-String -Path 'D:\projects\opus-dueli\webapp\src\main.ts' -Pattern "import.*rateLimit|import.*security" | Select-Object LineNumber,Line
