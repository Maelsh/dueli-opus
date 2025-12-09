/**
 * @file src/client/core/CookieUtils.ts
 * @description أدوات التعامل مع الكوكيز
 * @module client/core/CookieUtils
 */

/**
 * Cookie Utilities
 * أدوات الكوكيز
 */
export class CookieUtils {
    /**
     * Get cookie value by name
     */
    static get(name: string): string | null {
        const match = document.cookie.match(new RegExp('(^| )' + name + '=([^;]+)'));
        return match ? match[2] : null;
    }

    /**
     * Set cookie
     */
    static set(name: string, value: string, days: number = 7): void {
        const expires = new Date();
        expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
        document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Lax`;
    }

    /**
     * Delete cookie
     */
    static delete(name: string): void {
        document.cookie = `${name}=;path=/;max-age=0`;
    }
}

export default CookieUtils;
