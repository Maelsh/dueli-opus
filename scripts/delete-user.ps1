param (
    [Parameter(Mandatory=$true)]
    [string]$Email
)

Write-Host "Deleting user with email: $Email from local database..." -ForegroundColor Yellow

$command = "DELETE FROM users WHERE email = '$Email';"
npx wrangler d1 execute dueli-db --local --command $command

if ($LASTEXITCODE -eq 0) {
    Write-Host "User deleted successfully (if existed)." -ForegroundColor Green
} else {
    Write-Host "Failed to delete user." -ForegroundColor Red
}
