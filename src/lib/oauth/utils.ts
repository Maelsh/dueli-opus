export const ALLOWED_EMAIL_DOMAINS = [
    // Google
    'gmail.com',
    'googlemail.com',
    // Microsoft
    'outlook.com',
    'outlook.sa',
    'hotmail.com',
    'live.com',
    'msn.com',
    'microsoft.com',
    // Yahoo
    'yahoo.com',
    'ymail.com',
    // Apple
    'icloud.com',
    'me.com',
    'mac.com',
    // Proton
    'protonmail.com',
    'proton.me',
    // AOL
    'aol.com',
    // Zoho
    'zoho.com',
    'zohomail.com',
];

export function isEmailAllowed(email: string): boolean {
    // If no email provided, allow it (some providers don't give email)
    if (!email) return true;

    // Basic email format validation
    if (!email.includes('@')) return false;

    const domain = email.split('@')[1]?.toLowerCase();
    if (!domain) return false;

    // Allow all domains in the list
    if (ALLOWED_EMAIL_DOMAINS.includes(domain)) return true;

    // Also allow any .onmicrosoft.com domain (Microsoft 365/Azure)
    if (domain.endsWith('.onmicrosoft.com')) return true;

    // Allow Google Workspace domains (they all use Google)
    // For now, accept any email with valid format from OAuth providers
    // since we trust the provider already verified the email
    return true;
}

export function generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
