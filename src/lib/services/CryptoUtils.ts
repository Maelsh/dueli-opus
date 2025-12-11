/**
 * Crypto Utilities - أدوات التشفير
 * 
 * Provides cryptographic utilities using Web Crypto API
 * يوفر أدوات التشفير باستخدام Web Crypto API
 */

/**
 * Crypto Utilities Class
 * Provides secure cryptographic operations
 */
export class CryptoUtils {
    /**
     * Hash password using SHA-256
     */
    static async hashPassword(password: string): Promise<string> {
        const encoder = new TextEncoder();
        const data = encoder.encode(password);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }

    /**
     * Generate random state for OAuth
     */
    static generateState(): string {
        return crypto.randomUUID();
    }

    /**
     * Generate random verification token
     */
    static generateToken(): string {
        return crypto.randomUUID();
    }

    /**
     * Generate random numeric code (for password reset)
     */
    static generateNumericCode(length: number = 6): string {
        const array = new Uint8Array(length);
        crypto.getRandomValues(array);
        return Array.from(array, byte => (byte % 10).toString()).join('');
    }

    /**
     * Generate random hex string
     */
    static generateHexString(length: number = 32): string {
        const array = new Uint8Array(length / 2);
        crypto.getRandomValues(array);
        return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
    }
}

export default CryptoUtils;
