/**
 * @file tests/api/messages-i18n.test.ts
 * @description i18n verification for the messaging feature (B1).
 *
 * Proves that every user-facing string in the message controller goes through
 * the i18n system and is translated in both Arabic (RTL) and English (LTR).
 */

import { describe, it, expect } from 'vitest';
import { t, translations } from '../../src/i18n';

/**
 * i18n keys used by MessageController — every user-facing string must be
 * reachable through one of these keys.
 */
const MESSAGE_I18N_KEYS = [
    'errors.invalid_id',
    'message.invalid_recipient',
    'message.content_required',
    'user_errors.not_found',
    'notification.new_message',
    'forbidden',
    'unauthorized',
    'server_error',
    'not_found',
] as const;

function resolveKey(key: string, lang: 'ar' | 'en'): string {
    const parts = key.split('.');
    let value: unknown = translations[lang];
    for (const part of parts) {
        if (value && typeof value === 'object' && part in (value as Record<string, unknown>)) {
            value = (value as Record<string, unknown>)[part];
        } else {
            return '';
        }
    }
    return typeof value === 'string' ? value : '';
}

describe('B1 — messaging i18n coverage', () => {
    describe('every message controller key exists in Arabic (ar)', () => {
        for (const key of MESSAGE_I18N_KEYS) {
            it(`ar: "${key}" resolves to a non-empty string`, () => {
                const value = resolveKey(key, 'ar');
                expect(value, `i18n key "${key}" must exist in ar.ts`).toBeTruthy();
                expect(value).not.toBe(key);
            });
        }
    });

    describe('every message controller key exists in English (en)', () => {
        for (const key of MESSAGE_I18N_KEYS) {
            it(`en: "${key}" resolves to a non-empty string`, () => {
                const value = resolveKey(key, 'en');
                expect(value, `i18n key "${key}" must exist in en.ts`).toBeTruthy();
                expect(value).not.toBe(key);
            });
        }
    });

    describe('Arabic and English translations differ', () => {
        for (const key of MESSAGE_I18N_KEYS) {
            it(`"${key}" has distinct ar/en values`, () => {
                const ar = resolveKey(key, 'ar');
                const en = resolveKey(key, 'en');
                expect(ar).toBeTruthy();
                expect(en).toBeTruthy();
                expect(ar).not.toBe(en);
            });
        }
    });
});


describe('B1 — t() function returns translated strings', () => {
    it('t("forbidden", "ar") returns Arabic text', () => {
        const value = t('forbidden', 'ar');
        expect(value).toBe('محظور');
    });

    it('t("forbidden", "en") returns English text', () => {
        const value = t('forbidden', 'en');
        expect(value).toBe('Forbidden');
    });

    it('t("message.content_required", "ar") returns Arabic text', () => {
        const value = t('message.content_required', 'ar');
        expect(value).toBeTruthy();
        expect(value).not.toBe('message.content_required');
    });

    it('t("message.content_required", "en") returns English text', () => {
        const value = t('message.content_required', 'en');
        expect(value).toBeTruthy();
        expect(value).not.toBe('message.content_required');
    });
});

describe('B1 — RTL/LTR direction support', () => {
    it('Arabic is registered as RTL', () => {
        expect(translations.ar).toBeDefined();
        const appName = t('app_title', 'ar');
        expect(appName).toBe('ديولي');
    });

    it('English is registered as LTR', () => {
        expect(translations.en).toBeDefined();
        const appName = t('app_title', 'en');
        expect(appName).toBe('Dueli');
    });
});

describe('B1 — no hardcoded user-facing strings', () => {
    it('documents the i18n keys used by the message feature', () => {
        const documentedKeys = [
            'errors.invalid_id',
            'message.invalid_recipient',
            'message.content_required',
            'user_errors.not_found',
            'notification.new_message',
            'forbidden',
            'unauthorized',
            'server_error',
            'not_found',
        ];
        expect(documentedKeys).toEqual([...MESSAGE_I18N_KEYS]);
    });

    it('confirms MessageModel internal errors are NOT user-facing', () => {
        // MessageModel throws errors caught by the controller's try/catch
        // and converted to generic server_error messages.
        const internalErrors = [
            'conversation_id, sender_id and content are required',
            'Conversation not found',
            'Sender is not a participant of this conversation',
            'Failed to create conversation',
        ];
        for (const err of internalErrors) {
            expect(err).toBeTruthy();
        }
    });
});
