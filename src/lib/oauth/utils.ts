export const ALLOWED_EMAIL_DOMAINS = [
    'gmail.com',
    'outlook.com',
    'yahoo.com',
    'hotmail.com',
    'live.com'
];

export function isEmailAllowed(email: string): boolean {
    if (!email) return false;
    const domain = email.split('@')[1]?.toLowerCase();
    return ALLOWED_EMAIL_DOMAINS.includes(domain);
}

export function generateState(): string {
    const array = new Uint8Array(16);
    crypto.getRandomValues(array);
    return Array.from(array, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
