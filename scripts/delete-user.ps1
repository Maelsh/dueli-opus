param (
    [Parameter(Mandatory = $true)]
    [string]$Email
)

Write-Host "Deleting user with email: $Email from local database..." -ForegroundColor Yellow

# First, delete all sessions for this user
Write-Host "Deleting user sessions..." -ForegroundColor Cyan
$sessionCommand = "DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE email = '$Email');"
npx wrangler d1 execute dueli-db --local --command $sessionCommand

# Then delete the user
Write-Host "Deleting user record..." -ForegroundColor Cyan
$command = "DELETE FROM users WHERE email = '$Email';"
npx wrangler d1 execute dueli-db --local --command $command

if ($LASTEXITCODE -eq 0) {
    Write-Host "User deleted successfully (if existed)." -ForegroundColor Green
}
else {
    Write-Host "Failed to delete user." -ForegroundColor Red
}
