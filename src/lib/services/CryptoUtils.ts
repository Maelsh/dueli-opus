/**
 * Crypto Utilities - أدوات التشفير
 *
 * Provides cryptographic utilities using Web Crypto API
 * يوفر أدوات التشفير باستخدام Web Crypto API
 *
 * T1.4: Password hashing upgraded from plain SHA-256 to PBKDF2-SHA256
 * with random salt and timing-safe comparison.
 * Format: pbkdf2$<iterations>$<saltHex>$<hashHex>
 * Legacy SHA-256 hashes remain verifiable for backward compatibility
 * and are transparently upgraded on successful login.
 */

/** PBKDF2 iteration count (OWASP-recommended minimum for SHA-256) */
const PBKDF2_ITERATIONS = 100_000;

/** Salt length in bytes */
const SALT_BYTES = 16;

/** Derived hash length in bits */
const HASH_BITS = 256;

function toHex(bytes: Uint8Array): string {
    return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

function fromHex(hex: string): Uint8Array {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return out;
}

/** Constant-time comparison of two byte arrays (prevents timing attacks) */
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) {
        diff |= a[i] ^ b[i];
    }
    return diff === 0;
}

/**
 * Crypto Utilities Class
 * Provides secure cryptographic operations
 */
export class CryptoUtils {

    /**
     * Hash password using PBKDF2-SHA256 with a random salt.
     * Output format: pbkdf2$<iterations>$<saltHex>$<hashHex>
     */
    static async hashPassword(password: string): Promise<string> {
        const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
        const encoder = new TextEncoder();
        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits']
        );
        const bits = await crypto.subtle.deriveBits(
            { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
            keyMaterial,
            HASH_BITS
        );
        return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(new Uint8Array(bits))}`;
    }

    /**
     * Verify a password against a stored hash.
     * Supports the new PBKDF2 format and legacy plain SHA-256 hex hashes.
     */
    static async verifyPassword(password: string, stored: string): Promise<boolean> {
        if (!stored) return false;

        if (stored.startsWith('pbkdf2$')) {
            try {
                const parts = stored.split('$');
                if (parts.length !== 4) return false;
                const iterations = parseInt(parts[1], 10) || PBKDF2_ITERATIONS;
                const salt = fromHex(parts[2]);
                const expected = fromHex(parts[3]);

                const encoder = new TextEncoder();
                const keyMaterial = await crypto.subtle.importKey(
                    'raw',
                    encoder.encode(password),
                    'PBKDF2',
                    false,
                    ['deriveBits']
                );
                const bits = await crypto.subtle.deriveBits(
                    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
                    keyMaterial,
                    expected.length * 8
                );
                return timingSafeEqual(new Uint8Array(bits), expected);
            } catch {
                return false;
            }
        }

        // Legacy: plain unsalted SHA-256 hex
        const legacyHash = await CryptoUtils.sha256Hex(password);
        return timingSafeEqual(fromHex(legacyHash), fromHex(stored));
    }

    /** True when the stored hash uses the legacy (weak) scheme */
    static isLegacyHash(stored: string): boolean {
        return !!stored && !stored.startsWith('pbkdf2$');
    }

    /**
     * Legacy SHA-256 hex digest (kept only for verifying old hashes)
     */
    private static async sha256Hex(input: string): Promise<string> {
        const data = new TextEncoder().encode(input);
        const hashBuffer = await crypto.subtle.digest('SHA-256', data);
        return toHex(new Uint8Array(hashBuffer));
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
