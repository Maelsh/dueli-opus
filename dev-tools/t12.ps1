Select-String -Path 'D:\projects\opus-dueli\webapp\src\main.ts' -Pattern "from '.\/config\/defaults'" | Select-Object LineNumber,Line
