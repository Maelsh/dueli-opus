param (
    [Parameter(Mandatory = $true)]
    [string]$Email
)

Write-Host "Verifying user account: $Email in local database..." -ForegroundColor Yellow

$command = "UPDATE users SET email_verified = 1, verification_token = NULL, verification_expires = NULL WHERE email = '$Email';"
npx wrangler d1 execute dueli-db --local --command $command

if ($LASTEXITCODE -eq 0) {
    Write-Host "User account verified successfully!" -ForegroundColor Green
    Write-Host "You can now login with this email." -ForegroundColor Cyan
}
else {
    Write-Host "Failed to verify user account." -ForegroundColor Red
}
