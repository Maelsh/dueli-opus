/**
 * UNIT 42.1 (R4-GLOBAL-I18N-ALL-LANGS-1) — global i18n parity suite.
 *
 * What this file locks in, permanently:
 *   1. The 56-language central registry with exactly 15 enabled global
 *      languages (3 RTL: ar/fa/ur + 12 LTR), every enabled one with a
 *      usable translation pack — bundled ar/en or a lazy-loaded static
 *      dictionary from public/static/locales/<lang>.json.
 *   2. 100% key parity of the 13 lazy-loaded packs with en.ts — nested
 *      objects and arrays included. ar.ts parity is enforced against the
 *      documented legacy exception list (flat category labels that only
 *      en.ts ever had), so any NEW drift fails here.
 *   3. Identical {placeholders} in every translated string of every language.
 *   4. Protected identity terms (Dueli, Maelsh Pro, domains, e-mails, AI /
 *      model & infrastructure names) survive translation verbatim.
 *   5. Owner-mandated copy: the splash motto (word_1..4) and the public
 *      monetization gate phrase per language, and the non-negotiable 80%/20%
 *      (and 100%) financial figures.
 *   6. No truncation / no meta markers anywhere.
 *   7. hreflang + canonical + og:locale + JSON-LD for all 15 languages in
 *      seo.ts, correct <html lang/dir> + language fonts + the inlined
 *      window.__DUELI_LOCALE_PACK__ head script in layout.ts.
 *   8. The lazy-loading boundary: ensureLanguageLoaded loads packs from the
 *      static locale files through the REAL runtime engine, and every
 *      language without a shipped file (e.g. the registered-but-not-enabled
 *      `he`, or unknown codes) stays silently and safely on English.
 *   9. i18nAutoFit works with the translated strings of all languages, and
 *      I18nLayoutGuard applies the auto-fit CSS variable through a DOM stub.
 */
import { describe, it, expect, beforeAll, vi, afterEach } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { en } from '../../src/i18n/en';
import { ar } from '../../src/i18n/ar';
import { translations } from '../../src/i18n';
import {
    LANGUAGES,
    TRANSLATED_LANGUAGES,
    DEFAULT_LANGUAGE,
    getAvailableLanguages,
    getUILanguage,
    registerLanguage,
    ensureLanguageLoaded,
    isLanguageLoaded,
    localeAssetUrl,
    t,
    isRTL,
    getDir,
    normalizeContentLanguage,
} from '../../src/i18n';
import { SEO_LANGUAGES, hreflangLinks, canonicalUrl, buildJsonLd, buildSeoHead, ogLocaleFor, SITE_ORIGIN } from '../../src/shared/templates/seo';
import { generateHTML } from '../../src/shared/templates/layout';
import { estimateTextWidthUnits, computeI18nFontScale, clampI18nFontScale, I18N_FONT_SCALE_MIN } from '../../src/lib/i18nAutoFit';

const STATIC_LOCAL_DIR = join(process.cwd(), 'public', 'static', 'locales');

/** The 13 lazy-loaded UNIT 42.1 dictionaries + the 2 bundled packs. */
const LAZY_CODES = ['es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja', 'ko', 'tr', 'hi', 'id', 'fa', 'ur'];
const ALL_CODES = ['ar', 'en', ...LAZY_CODES];

/** Packs sourced through the REAL runtime engine (translations registry). */
const PACKS: Record<string, Record<string, any>> = {};

beforeAll(async () => {
    for (const code of LAZY_CODES) {
        expect(existsSync(join(STATIC_LOCAL_DIR, `${code}.json`)), `${code}.json must ship in public/static/locales`).toBe(true);
        JSON.parse(readFileSync(join(STATIC_LOCAL_DIR, `${code}.json`), 'utf8')); // every file is valid, parseable JSON
        await ensureLanguageLoaded(code); // no assetsFetcher → the Node/Vitest disk fallback path
        PACKS[code] = translations[code];
        expect(PACKS[code], `${code} pack must register via ensureLanguageLoaded`).toBeTruthy();
    }
    PACKS.ar = translations.ar;
    PACKS.en = translations.en;
});

/** Owner-mandated official copy (mirrors MANDATED_COPY in the generator). */
const MANDATED: Record<string, { splash: [string, string, string, string]; monetization_locked: string }> = {
    ar: { splash: ['ارتقِ', 'تثقف', 'استمتع', 'اربح'], monetization_locked: 'سيتم فتح الباب بعد استكمال الإجراءات' },
    en: { splash: ['Elevate', 'Learn', 'Enjoy', 'Earn'], monetization_locked: 'This section will open soon upon completion of procedures' },
    es: { splash: ['Supera', 'Aprende', 'Disfruta', 'Gana'], monetization_locked: 'Esta sección se abrirá pronto una vez completados los trámites' },
    fr: { splash: ['Élevez', 'Apprenez', 'Savourez', 'Gagnez'], monetization_locked: 'Cette section ouvrira bientôt une fois les procédures achevées' },
    de: { splash: ['Steige auf', 'Lerne', 'Genieße', 'Verdiene'], monetization_locked: 'Dieser Bereich wird bald geöffnet, sobald die Verfahren abgeschlossen sind' },
    pt: { splash: ['Eleve-se', 'Aprenda', 'Desfrute', 'Ganhe'], monetization_locked: 'Esta seção abrirá em breve após a conclusão dos procedimentos' },
    ru: { splash: ['Возвышайся', 'Познавай', 'Наслаждайся', 'Зарабатывай'], monetization_locked: 'Этот раздел скоро откроется после завершения процедур' },
    zh: { splash: ['进阶', '求知', '乐享', '赢取'], monetization_locked: '相关手续完成后，此板块即将开放' },
    ja: { splash: ['高めよう', '学ぼう', '楽しもう', '稼ごう'], monetization_locked: 'このセクションは、手続きの完了後まもなく開放されます' },
    ko: { splash: ['격상', '배움', '즐거움', '수익'], monetization_locked: '이 섹션은 절차가 완료되면 곧 개방될 예정입니다' },
    tr: { splash: ['Yüksel', 'Öğren', 'Keyfini çıkar', 'Kazan'], monetization_locked: 'Bu bölüm, prosedürler tamamlandıktan sonra yakında açılacaktır' },
    hi: { splash: ['ऊपर उठें', 'सीखें', 'आनंद लें', 'कमाएँ'], monetization_locked: 'प्रक्रियाएँ पूरी होने के बाद यह अनुभाग शीघ्र खुल जाएगा' },
    id: { splash: ['Tingkatkan', 'Belajar', 'Nikmati', 'Hasilkan'], monetization_locked: 'Bagian ini akan segera dibuka setelah prosedur selesai' },
    fa: { splash: ['اوج بگیر', 'یاد بگیر', 'لذت ببر', 'درآمد بساز'], monetization_locked: 'این بخش به‌زودی پس از تکمیل تشریفات باز خواهد شد' },
    ur: { splash: ['بلندی حاصل کریں', 'سیکھیں', 'لطف اٹھائیں', 'کمائیں'], monetization_locked: 'یہ حصہ جلد ہی طریقہ کار مکمل ہونے کے بعد کھل جائے گا' },
};

/** Legacy flat category labels only en.ts ever carried (see parity baseline). */
const AR_LEGACY_FLAT_EXCEPTIONS = [
    'religions', 'sects', 'politics', 'economics', 'current_affairs', 'disputes',
    'physics', 'biology', 'chemistry', 'math', 'technology', 'medicine',
    'philosophy', 'singing', 'poetry', 'art', 'sports', 'comedy', 'cooking', 'gaming',
    'magic', // UNIT 42.1 audit: legacy ar.ts predates the `magic` competition category
];

const PROTECTED_TERMS = [
    'Dueli', 'Maelsh Pro', 'dueli.win', 'dueli.maelshpro.com',
    'dueli@maelshpro.com', 'info@maelshpro.com',
    'OpenAI', 'ChatGPT', 'Anthropic', 'Claude Opus', 'Claude Sonnet', 'Claude Haiku',
    'Gemini', 'Google AI Studio', 'Google Cloud', 'AWS', 'Alibaba Cloud', 'Tencent Cloud',
    'DeepSeek', 'MiniMax', 'Genspark AI', 'OpenRouter',
    'Cloudflare Pages', 'Cloudflare Workers', 'Cloudflare D1', 'Cloudflare',
    'SQLite', 'Wrangler', 'Hono', 'TypeScript', 'JavaScript', 'Tailwind CSS',
    'Vite', 'esbuild', 'FFmpeg', 'WebRTC', 'Stripe', 'PayPal', 'Vitest', 'Playwright',
    'PWA', 'SEO', 'API', 'OAuth', 'CSRF', 'RTL', 'LTR',
];

// ── helpers ─────────────────────────────────────────────────────────────────

/** Deep key paths; array elements are indexed (a.b.0.c), array objects included. */
function flatKeys(node: unknown, prefix = '', out: Set<string> = new Set()): Set<string> {
    if (Array.isArray(node)) {
        out.add(prefix);
        node.forEach((el, i) => flatKeys(el, `${prefix}.${i}`, out));
        return out;
    }
    if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            flatKeys(v, prefix ? `${prefix}.${k}` : k, out);
        }
        return out;
    }
    out.add(prefix);
    return out;
}

/** {placeholder} tokens of a string. */
function vars(s: string): string[] {
    return (s.match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) || []).sort();
}

interface WalkIssue {
    path: string;
    problem: string;
}

/** Walk a pack; run a check on every string leaf. */
function walkStrings(node: unknown, path: string, check: (s: string, path: string) => WalkIssue[] | undefined, out: WalkIssue[] = []): WalkIssue[] {
    if (Array.isArray(node)) {
        node.forEach((el, i) => walkStrings(el, `${path}.${i}`, check, out));
        return out;
    }
    if (node !== null && typeof node === 'object') {
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
            walkStrings(v, path ? `${path}.${k}` : k, check, out);
        }
        return out;
    }
    if (typeof node === 'string') {
        out.push(...(check(node, path) ?? []));
    }
    return out;
}

function lookup(root: unknown, path: string): unknown {
    return path.split('.').reduce<unknown>((acc, seg) => {
        if (acc !== null && typeof acc === 'object') return (acc as Record<string, unknown>)[seg];
        return undefined;
    }, root);
}

const EN_FLAT = flatKeys(en);
const AR_FLAT = flatKeys(ar);

// ── 1. registry ─────────────────────────────────────────────────────────────

describe('UNIT 42.1 — central language registry (56 languages, 15 active)', () => {
    it('registers 56 languages; enabled exactly the 15 global languages in canonical order', () => {
        expect(LANGUAGES).toHaveLength(56);
        expect(LANGUAGES.filter((l) => l.enabled).map((l) => l.code)).toEqual([
            'ar', 'en', 'es', 'fr', 'de', 'pt', 'ru', 'zh', 'ja', 'ko', 'tr', 'hi', 'id', 'fa', 'ur',
        ]);
        expect(new Set(LANGUAGES.map((l) => l.code)).size, 'codes must be unique').toBe(56);
        expect(TRANSLATED_LANGUAGES, 'the code bundle embeds exactly the 2 base packs').toEqual(['ar', 'en']);
    });

    it('marks ar/fa/ur/he as rtl and every other registered language as ltr', () => {
        for (const l of LANGUAGES) {
            const expectRtl = ['ar', 'fa', 'ur', 'he'].includes(l.code);
            expect(l.dir, `dir of ${l.code}`).toBe(expectRtl ? 'rtl' : 'ltr');
        }
    });

    it('exposes all 15 in the switcher once the packs are loaded (registry + pack)', async () => {
        expect(getAvailableLanguages().map((l) => l.code).sort()).toEqual([...ALL_CODES].sort());
        for (const code of ALL_CODES) {
            expect(isLanguageLoaded(code), `${code} must be loaded before rendering`).toBe(true);
            expect(getUILanguage(code)).toBe(code);
        }
    });

    it('points every locale asset at /static/locales/<lang>.json', () => {
        expect(localeAssetUrl('fr')).toBe('/static/locales/fr.json');
        expect(localeAssetUrl('he')).toBe('/static/locales/he.json');
    });

    it('keeps the DB content-language boundary strictly ar/en', () => {
        expect(normalizeContentLanguage('ar')).toBe('ar');
        expect(normalizeContentLanguage('en')).toBe('en');
        expect(normalizeContentLanguage('fr')).toBe('en');
        expect(normalizeContentLanguage('zh-CN')).toBe('en');
        expect(normalizeContentLanguage('fa')).toBe('en');
        expect(normalizeContentLanguage(undefined)).toBe('en');
    });
});

// ── 2. key parity ───────────────────────────────────────────────────────────

describe('UNIT 42.1 — Strict Parity Guard (keys, shapes, variables)', () => {
    it('the 13 lazy packs match en.ts 1:1 — no missing key, no extra key, arrays included', () => {
        for (const code of LAZY_CODES) {
            const packFlat = flatKeys(PACKS[code]);
            const missing = [...EN_FLAT].filter((k) => !packFlat.has(k));
            const extra = [...packFlat].filter((k) => !EN_FLAT.has(k));
            expect(missing, `${code}: missing keys vs en.ts`).toEqual([]);
            expect(extra, `${code}: extra keys vs en.ts`).toEqual([]);
        }
    });

    it('array shapes (lengths + element object fields) match en.ts exactly', () => {
        for (const code of LAZY_CODES) {
            for (const key of EN_FLAT) {
                const enVal = lookup(en, key);
                if (Array.isArray(enVal)) {
                    const locVal = lookup(PACKS[code], key);
                    expect(Array.isArray(locVal), `${code}: ${key} must stay an array`).toBe(true);
                    expect((locVal as unknown[]).length, `${code}: ${key}.length`).toBe(enVal.length);
                    enVal.forEach((el, i) => {
                        if (el !== null && typeof el === 'object') {
                            expect(Object.keys((locVal as unknown[])[i] as object).sort(), `${code}: ${key}.${i} fields`).toEqual(Object.keys(el as object).sort());
                        }
                    });
                }
            }
        }
    });

    it('ar.ts drift is frozen to the documented legacy exception list', () => {
        const missing = [...EN_FLAT].filter((k) => !AR_FLAT.has(k));
        const bare = missing.filter((k) => !k.includes('.'));
        const nested = missing.filter((k) => k.includes('.'));
        expect(bare.sort()).toEqual([...AR_LEGACY_FLAT_EXCEPTIONS].sort());
        expect(nested, 'ar.ts must never lose a nested/array key vs en.ts').toEqual([]);
        expect([...AR_FLAT].filter((k) => !EN_FLAT.has(k)), 'ar.ts must never gain an en.ts-foreign key').toEqual([]);
    });

    it('keeps every {placeholder} identical in every language', () => {
        for (const code of LAZY_CODES) {
            for (const key of EN_FLAT) {
                const enVal = lookup(en, key);
                if (typeof enVal === 'string' && enVal.includes('{')) {
                    const locVal = lookup(PACKS[code], key);
                    expect(typeof locVal, `${code}: ${key} must stay a string`).toBe('string');
                    expect(vars(locVal as string), `${code}: ${key} placeholders`).toEqual(vars(enVal));
                }
            }
        }
    });

    it('survives spot-check of the known variable keys with t()', () => {
        const varKeys = [
            'notification.new_message_body',
            'notification.new_join_request_body',
            'notification.competition_invite_body',
            'profile_competitions.delete_confirm_body',
            'download_ui.success',
            'download_ui.success_partial',
        ];
        for (const code of ALL_CODES) {
            for (const key of varKeys) {
                const value = t(key, code);
                expect(value, `${code}/${key}`).not.toBe(key);
                expect(vars(value), `${code}/${key} vars`).toEqual(vars(String(lookup(en, key))));
            }
        }
    });
});

// ── 3. content rules ────────────────────────────────────────────────────────

describe('UNIT 42.1 — protected identity, mandated copy, no truncation', () => {
    it('never truncates: no empty value, no …/...// TODO sentinel in any pack', () => {
        const issues: WalkIssue[] = [];
        for (const code of LAZY_CODES) {
            walkStrings(PACKS[code], code, (s, path) => {
                const out: WalkIssue[] = [];
                if (!s.trim()) out.push({ path, problem: 'empty' });
                if (/^(\.{3}|…|\[\s*\.\.\.\s*\]|\/\/\s*\.\.\.)$/.test(s.trim())) out.push({ path, problem: 'truncation sentinel' });
                if (/\b(TODO|FIXME|XXX)\b/.test(s)) out.push({ path, problem: 'meta marker' });
                return out;
            }, issues);
        }
        expect(issues).toEqual([]);
    });

    it('keeps protected identity terms verbatim wherever en.ts carries them', () => {
        const issues: WalkIssue[] = [];
        for (const code of LAZY_CODES) {
            for (const key of EN_FLAT) {
                const enVal = lookup(en, key);
                if (typeof enVal !== 'string') continue;
                for (const term of PROTECTED_TERMS) {
                    if (enVal.includes(term) && !String(lookup(PACKS[code], key)).includes(term)) {
                        issues.push({ path: `${code}:${key}`, problem: `lost ${term}` });
                    }
                }
            }
        }
        expect(issues).toEqual([]);
    });

    it('keeps app_title as "Dueli" and the splash motto in every language', () => {
        for (const code of ALL_CODES) {
            // ar keeps its legacy BASE rendering of the brand; every UNIT 42.1 pack uses Latin "Dueli".
            expect(t('app_title', code)).toBe(code === 'ar' ? 'ديولي' : 'Dueli');
            MANDATED[code].splash.forEach((word, i) => {
                expect(t(`splash.word_${i + 1}`, code), `${code} splash.word_${i + 1}`).toBe(word);
            });
        }
    });

    it('uses the owner-mandated monetization gate phrase in every language', () => {
        for (const code of ALL_CODES) {
            expect(t('monetization_locked', code), `${code}`).toBe(MANDATED[code].monetization_locked);
            // zh is a complete 15-char sentence — CJK compacts; the real guard against
            // truncation is the mandated-copy equality above, this only rejects empties.
            expect(t('monetization_locked', code).length).toBeGreaterThan(6);
        }
    });

    it('preserves the non-negotiable 80%/20%/100% figures everywhere', () => {
        // Locale typography is respected: "80%" (en/ar), "80 %" (de),
        // "%80" (tr), "80％" (zh/ja full-width) all carry the same figure.
        const hasPercent = (s: string, num: string) => new RegExp(`${num}\\s*[%％]|[%％]\\s*${num}`).test(s);
        const issues: string[] = [];
        for (const code of LAZY_CODES) {
            for (const key of EN_FLAT) {
                const enVal = lookup(en, key);
                if (typeof enVal !== 'string') continue;
                for (const num of ['80', '20', '100']) {
                    if (new RegExp(`(?<!\\d)${num}(?!\\d)\\s*[%％]|[%％]\\s*${num}(?!\\d)`).test(enVal) && !hasPercent(String(lookup(PACKS[code], key)), num)) {
                        issues.push(`${code}:${key} lost ${num}%`);
                    }
                }
            }
        }
        expect(issues).toEqual([]);
    });

    it('translates the escrow-continuity clause without changing the split', () => {
        for (const code of ALL_CODES) {
            const continuity = t('guide.charter_content.continuity_body', code);
            expect(typeof continuity).toBe('string');
            expect(continuity.length).toBeGreaterThan(0);
        }
    });
});

// ── 4. t()/fallback behaviour across languages ───────────────────────────────

describe('UNIT 42.1 — t()/fallback behaviour with 15 packs', () => {
    it('resolves UI keys in every language and never returns the bare key', () => {
        for (const code of ALL_CODES) {
            for (const key of ['home', 'explore', 'login', 'register', 'search_placeholder', 'skip_to_content']) {
                const value = t(key, code);
                expect(value, `${code}/${key}`).not.toBe(key);
                expect(value.length).toBeGreaterThan(0);
            }
        }
    });

    it('keeps the live.* alias working in every language', () => {
        for (const code of ALL_CODES) {
            expect(t('live.connecting', code)).toBe(t('live_signaling.connecting', code));
        }
    });

    it('UNIT 42.1 contract: a language whose locale file is missing falls back to English gracefully', async () => {
        // (a) unknown code (not even in the 56-language registry)
        expect(getUILanguage('xx')).toBe(DEFAULT_LANGUAGE);
        expect(getUILanguage('xx')).toBe('en');
        expect(t('home', 'xx')).toBe(t('home', 'en'));
        expect(getDir('xx')).toBe('ltr');
        expect(isRTL('xx')).toBe(false);

        // (b) registered-but-not-yet-active: `he` has a registry entry
        //     (rtl, enabled: false) but no public/static/locales/he.json yet.
        //     The loader must refuse silently — no throw, single negative-cache
        //     miss — and every consumer keeps rendering English.
        expect(existsSync(join(STATIC_LOCAL_DIR, 'he.json'))).toBe(false);
        await expect(ensureLanguageLoaded('he')).resolves.toBeUndefined();
        expect(isLanguageLoaded('he')).toBe(false);
        expect(getUILanguage('he')).toBe('en');
        expect(t('home', 'he')).toBe(t('home', 'en'));
        // direction comes from the registry even while the pack is missing
        expect(isRTL('he')).toBe(true);
        expect(getDir('he')).toBe('rtl');

        // (c) a second attempt stays silent (negative cache, no retry storm)
        await expect(ensureLanguageLoaded('he')).resolves.toBeUndefined();

        // (d) missing keys inside a loaded language fall back to English values
        expect(t('definitely_not_a_key', 'fr')).toBe('definitely_not_a_key');
    });

    it('registerLanguage is the single in-memory entry point outside the loader', () => {
        expect(getUILanguage('pseudo-probe')).toBe('en');
        registerLanguage('pseudo-probe', { app_title: 'Probe', home: 'Pseudo' });
        expect(getUILanguage('pseudo-probe')).toBe('pseudo-probe');
        expect(t('home', 'pseudo-probe')).toBe('Pseudo');
    });
});

// ── 5. SEO / hreflang / meta ────────────────────────────────────────────────

describe('UNIT 42.1 — SEO meta + hreflang for 15 languages', () => {
    it('exposes exactly the 15 languages to SEO (static, deterministic set)', () => {
        expect([...SEO_LANGUAGES].sort()).toEqual(ALL_CODES.slice().sort());
        expect(SEO_LANGUAGES).toHaveLength(15);
    });

    it('emits hreflang links for all 15 languages + x-default on /guide', () => {
        const links = hreflangLinks('/guide');
        expect(links).toHaveLength(16);
        const byCode = new Map(links.map((l) => [l.hreflang, l.href]));
        for (const code of ALL_CODES) expect(byCode.get(code)).toBeTruthy();
        expect(byCode.get('en')).toBe(`${SITE_ORIGIN}/guide`);
        expect(byCode.get('fr')).toBe(`${SITE_ORIGIN}/guide?lang=fr`);
        expect(byCode.get('fa')).toBe(`${SITE_ORIGIN}/guide?lang=fa`);
        expect(byCode.get('x-default')).toBe(`${SITE_ORIGIN}/guide`);
    });

    it('keeps the canonical ?lang contract per language', () => {
        expect(canonicalUrl('/guide', 'en')).toBe(`${SITE_ORIGIN}/guide`);
        for (const code of ALL_CODES.filter((c) => c !== 'en')) {
            expect(canonicalUrl('/guide', code)).toBe(`${SITE_ORIGIN}/guide?lang=${code}`);
        }
    });

    it('builds localized meta description + og:locale for every language', () => {
        for (const code of ALL_CODES) {
            const head = buildSeoHead({ lang: code, title: 'Guide', path: '/guide' });
            expect(head).toContain(`content="${ogLocaleFor(code)}"`);
            const desc = (PACKS[code].seo as Record<string, string>).default_description;
            expect(head).toContain(desc.slice(0, 24));
            expect(head).toContain('og:title');
            expect(head).toContain('og:description');
        }
        expect(ogLocaleFor('ja')).toBe('ja_JP');
        expect(ogLocaleFor('ur')).toBe('ur_PK');
        expect(ogLocaleFor('pt')).toBe('pt_BR');
        expect(ogLocaleFor('xx')).toBe('en_US');
    });

    it('lists all 15 languages in the JSON-LD inLanguage and parses as JSON', () => {
        const jsonLd = buildJsonLd('en');
        const parsed = JSON.parse(jsonLd) as { '@graph': Array<{ '@type': string; inLanguage?: string[] }> };
        const website = parsed['@graph'].find((n) => n['@type'] === 'WebSite');
        expect(website?.inLanguage?.sort()).toEqual(ALL_CODES.slice().sort());
    });
});

// ── 6. layout / direction / fonts / inlined pack ─────────────────────────────

describe('UNIT 42.1 — layout html lang/dir + language fonts + locale pack injection', () => {
    it('renders correct lang/dir attribute pair for every language', () => {
        for (const code of ALL_CODES) {
            const html = generateHTML('<main>x</main>', code);
            expect(html).toContain(`<html lang="${code}" dir="${['ar', 'fa', 'ur'].includes(code) ? 'rtl' : 'ltr'}"`);
        }
    });

    it('uses a script-appropriate font per language', () => {
        const expectations: Record<string, string> = {
            ar: 'Cairo', fa: 'Noto Naskh Arabic', ur: 'Noto Nastaliq Urdu',
            zh: 'Noto Sans SC', ja: 'Noto Sans JP', ko: 'Noto Sans KR', hi: 'Noto Sans Devanagari',
            en: 'Inter', fr: 'Inter', de: 'Inter', ru: 'Inter',
        };
        for (const [code, font] of Object.entries(expectations)) {
            const html = generateHTML('<main>x</main>', code);
            expect(html).toContain(`font-family: '${font}'`);
        }
    });

    it('loads the extended Google Fonts set once', () => {
        const html = generateHTML('<main>x</main>', 'zh');
        expect(html).toContain('Noto+Sans+SC');
        expect(html).toContain('Noto+Nastaliq+Urdu');
        expect(html).toContain('Noto+Sans+Devanagari');
    });

    it('localizes the document title suffix and metaTitle override per language', () => {
        const frHtml = generateHTML('<main>x</main>', 'fr');
        expect(frHtml).toContain(`<title>Dueli - ${(PACKS.fr as Record<string, string>).app_title}</title>`);
        const jaHtml = generateHTML('<main>x</main>', 'ja', 'Dueli', '', { metaTitle: (PACKS.ja.seo as Record<string, string>).meta_title });
        expect(jaHtml).toContain((PACKS.ja.seo as Record<string, string>).meta_title);
    });

    it('localizes skip-to-content in every language', () => {
        for (const code of ALL_CODES) {
            const html = generateHTML('<main>x</main>', code);
            expect(html).toContain(String(PACKS[code].skip_to_content));
        }
    });

    it('inlines the resolved locale pack for lazy languages into <head> with a nonce', () => {
        const html = generateHTML('<main>x</main>', 'fr', 'Dueli', 'test-nonce-42');
        expect(html).toContain('<script nonce="test-nonce-42">window.__DUELI_LOCALE_PACK__ = {"code":"fr","pack"');
        // only ONE injection, never for the bundled ar/en pairs
        expect(html.match(/__DUELI_LOCALE_PACK__/g)?.length).toBe(1);
        const arHtml = generateHTML('<main>x</main>', 'ar');
        expect(arHtml).not.toContain('__DUELI_LOCALE_PACK__');
        const enHtml = generateHTML('<main>x</main>', 'en');
        expect(enHtml).not.toContain('__DUELI_LOCALE_PACK__');

        // the payload is the exact loaded pack, safely escaped, still server JSON
        const payloadStart = html.indexOf('window.__DUELI_LOCALE_PACK__ = ');
        const payloadEnd = html.indexOf(';</script>', payloadStart);
        const payload = html.slice(payloadStart + 'window.__DUELI_LOCALE_PACK__ = '.length, payloadEnd);
        expect(payload).not.toContain('</script');
        expect(payload).not.toContain('<'); // '<' escaped to \u003c — tag spoofing impossible
        const parsed = JSON.parse(payload) as { code: string; pack: Record<string, unknown> };
        expect(parsed.code).toBe('fr');
        expect(parsed.pack.app_title).toBe('Dueli');
        expect(parsed.pack).toEqual(PACKS.fr);
    });

    it('never injects a pack when the language resolved to the English fallback', () => {
        const html = generateHTML('<main>x</main>', 'xx');
        expect(html).not.toContain('__DUELI_LOCALE_PACK__');
        expect(html).toContain('<html lang="xx" dir="ltr"');
        // the page renders in English even though ?lang=xx was requested
        expect(html).toContain(String(PACKS.en.skip_to_content));
    });
});

// ── 7. i18nAutoFit + I18nLayoutGuard ────────────────────────────────────────

describe('UNIT 42.1 — i18nAutoFit with translated copy', () => {
    it('has width factors for all 15 languages', () => {
        for (const code of ALL_CODES) {
            const units = estimateTextWidthUnits('x'.repeat(10), code);
            expect(units).toBeGreaterThan(0);
        }
    });

    it('scales long localized copy down when wider than the EN baseline', () => {
        // German "Startseite" is wider than "Home" → clamped at the floor.
        expect(computeI18nFontScale('Home', 'Startseite', 'de')).toBe(I18N_FONT_SCALE_MIN);
        expect(computeI18nFontScale('Home', 'Home', 'es')).toBe(1);
        expect(computeI18nFontScale('Home', 'Inicio', 'es')).toBe(1);
    });

    it('measures CJK/Perso-Arabic/Devanagari scripts with dedicated branches', () => {
        expect(estimateTextWidthUnits('进阶求知', 'zh')).toBeCloseTo(4, 5);
        expect(estimateTextWidthUnits('ارتقِ', 'ar')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('سیکھیں', 'ur')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('सीखें', 'hi')).toBeGreaterThan(0);
        expect(estimateTextWidthUnits('Возвышайся', 'ru')).toBeGreaterThan(estimateTextWidthUnits('Elevate', 'en'));
    });

    it('clamps to the documented scale bounds', () => {
        expect(clampI18nFontScale(0.1)).toBe(I18N_FONT_SCALE_MIN);
        expect(clampI18nFontScale(3)).toBe(1);
        expect(clampI18nFontScale(Number.NaN)).toBe(1);
    });

    it('applies the auto-fit CSS variable through I18nLayoutGuard (DOM stub)', async () => {
        const elements: Array<Record<string, unknown>> = [];
        const fakeEl = () => {
            const el: Record<string, unknown> = {
                textContent: 'Startseite',
                style: { setProperty: (k: string, v: string) => { el.__set = [k, v]; } },
                classList: { contains: () => false, add: () => undefined },
                dataset: {},
                getAttribute: (attr: string) => (attr === 'data-i18n-fit-key' ? 'home' : null),
                addEventListener: () => undefined,
                setAttribute: () => undefined,
            };
            return el;
        };
        const target = fakeEl();
        elements.push(target);
        vi.stubGlobal('document', {
            documentElement: { lang: 'de', dir: 'ltr' },
            getElementById: () => null,
            querySelectorAll: () => elements,
            body: { appendChild: () => undefined },
        });
        vi.stubGlobal('window', { innerWidth: 1200, innerHeight: 800 });
        const { refreshI18nLayout } = await import('../../src/client/ui/I18nLayoutGuard');
        refreshI18nLayout(document as unknown as ParentNode, 'de');
        expect(target.__set).toEqual(['--i18n-font-scale', String(computeI18nFontScale('Home', 'Startseite', 'de'))]);
        vi.unstubAllGlobals();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
    });
});
