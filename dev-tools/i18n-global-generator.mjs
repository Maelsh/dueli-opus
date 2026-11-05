#!/usr/bin/env node
/**
 * @file dev-tools/i18n-global-generator.mjs
 * @description UNIT 42.1 (R4-GLOBAL-I18N-ALL-LANGS-1) — AST Chunked Generator & Validator
 *
 * The single, approved tool that grows Dueli from 2 to 15 global languages:
 *   1. `extract`   — parse src/i18n/en.ts + src/i18n/ar.ts with the TypeScript AST
 *                    (no eval) into flat key trees under dev-tools/i18n-work/.
 *   2. `plan`      — split the EN key tree into bounded translation chunks
 *                    (~2600 chars / 12..70 leaves each) — dev-tools/i18n-work/chunks/.
 *   3. `translate` — translate every chunk for a target language through the
 *                    z-ai chat LLM (resumable per chunk, validated per chunk),
 *                    then merge into dev-tools/i18n-work/translations/<lang>.json.
 *   4. `validate`  — STRICT PARITY GUARD: 100% key parity with en.ts, identical
 *                    nested objects & array shapes, identical {placeholders},
 *                    protected identity terms (Dueli, Maelsh Pro, domains,
 *                    e-mails, AI/model & infra names) kept verbatim, mandated
 *                    splash words + monetization gate phrase, no truncation,
 *                    no empty values, length sanity for long paragraphs.
 *   5. `emit`      — write src/i18n/<lang>.ts (single-quoted, 4-space indent,
 *                    same house style as en.ts; typed implicitly like en.ts —
 *                    never `any`, never `as any`, never `// ...`).
 *   6. `emit-json` — write the runtime dictionary as a static asset to
 *                    public/static/locales/<lang>.json (nested structure).
 *                    UNIT 42.1 ships each non-bundled language as this file
 *                    and loads it at request time via ensureLanguageLoaded —
 *                    the code bundle never grows with new languages.
 *
 * Repository-change-policy note (docs/18): this tool lives inside the already
 * approved dev-tools/ path; no new top-level folder (e.g. scripts/) is created.
 * Runtime scratch data goes to dev-tools/i18n-work/ and is NOT required by the
 * app build — since UNIT 42.1 the committed runtime deliverables are the
 * static dictionaries public/static/locales/<lang>.json (made by `emit-json`);
 * src/i18n/<lang>.ts from `emit` is optional reference material and must
 * NEVER be imported into the code bundle.
 *
 * Usage:
 *   node dev-tools/i18n-global-generator.mjs extract
 *   node dev-tools/i18n-global-generator.mjs plan
 *   node dev-tools/i18n-global-generator.mjs translate --lang es [--concurrency 6] [--force]
 *   node dev-tools/i18n-global-generator.mjs translate --all [--concurrency 6]
 *   node dev-tools/i18n-global-generator.mjs validate [--lang es]   (default: all)
 *   node dev-tools/i18n-global-generator.mjs emit     [--lang es] [--tsc]
 *   node dev-tools/i18n-global-generator.mjs emit-json [--lang es | --all]
 *   node dev-tools/i18n-global-generator.mjs status
 */

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I18N_DIR = path.join(REPO_ROOT, 'src', 'i18n');
const WORK_DIR = path.join(REPO_ROOT, 'dev-tools', 'i18n-work');
const CHUNKS_DIR = path.join(WORK_DIR, 'chunks');
const TRANS_DIR = path.join(WORK_DIR, 'translations');
/** UNIT 42.1: static runtime dictionaries served from /static/locales/<lang>.json. */
const LOCALES_DIR = path.join(REPO_ROOT, 'public', 'static', 'locales');

/** The 13 languages UNIT 42.1 adds (ar + en already exist). */
export const TARGET_LANGUAGES = [
    { code: 'es', native: 'Español', english: 'Spanish', script: 'Latin' },
    { code: 'fr', native: 'Français', english: 'French', script: 'Latin' },
    { code: 'de', native: 'Deutsch', english: 'German', script: 'Latin' },
    { code: 'pt', native: 'Português', english: 'Portuguese', script: 'Latin' },
    { code: 'ru', native: 'Русский', english: 'Russian', script: 'Cyrillic' },
    { code: 'zh', native: '中文', english: 'Simplified Chinese', script: 'Hanzi (Simplified)' },
    { code: 'ja', native: '日本語', english: 'Japanese', script: 'Kanji + Kana' },
    { code: 'ko', native: '한국어', english: 'Korean', script: 'Hangul' },
    { code: 'tr', native: 'Türkçe', english: 'Turkish', script: 'Latin' },
    { code: 'hi', native: 'हिन्दी', english: 'Hindi', script: 'Devanagari' },
    { code: 'id', native: 'Bahasa Indonesia', english: 'Indonesian', script: 'Latin' },
    { code: 'fa', native: 'فارسی', english: 'Persian', script: 'Perso-Arabic' },
    { code: 'ur', native: 'اردو', english: 'Urdu', script: 'Perso-Arabic (Nastaliq)' },
];

/** Full UNIT 42.1 registry (order defines the language switcher order). */
export const ALL_LANGUAGE_CODES = ['ar', 'en', ...TARGET_LANGUAGES.map((l) => l.code)];

/** Direction per language (mirror of src/i18n/languages.ts). */
export const LANGUAGE_DIRS = { ar: 'rtl', fa: 'rtl', ur: 'rtl' };

// ─────────────────────────────────────────────────────────────────────────────
// Identity charter — protected terms that must survive translation verbatim.
// ─────────────────────────────────────────────────────────────────────────────
export const PROTECTED_TERMS = [
    'Dueli',
    'Maelsh Pro',
    'dueli.win',
    'dueli.maelshpro.com',
    'dueli@maelshpro.com',
    'info@maelshpro.com',
    'OpenAI', 'ChatGPT', 'Anthropic',
    'Claude Opus', 'Claude Sonnet', 'Claude Haiku',
    'Gemini', 'Google AI Studio', 'Google Cloud', 'AWS', 'Alibaba Cloud', 'Tencent Cloud',
    'DeepSeek', 'MiniMax', 'Genspark AI', 'OpenRouter',
    'Cloudflare Pages', 'Cloudflare Workers', 'Cloudflare D1', 'Cloudflare',
    'SQLite', 'Wrangler', 'Hono', 'TypeScript', 'JavaScript', 'Tailwind CSS',
    'Vite', 'esbuild', 'FFmpeg', 'WebRTC', 'Stripe', 'PayPal', 'Vitest', 'Playwright',
    'PWA', 'SEO', 'API', 'OAuth', 'CSRF', 'RTL', 'LTR', 'Turnstile', 'hCaptcha',
];

/** Mandated official copy per language (owner-approved, not paraphrasable). */
export const MANDATED_COPY = {
    ar: {
        splash: ['ارتقِ', 'تثقف', 'استمتع', 'اربح'],
        monetization_locked: 'سيتم فتح الباب بعد استكمال الإجراءات',
    },
    en: {
        splash: ['Elevate', 'Learn', 'Enjoy', 'Earn'],
        monetization_locked: 'This section will open soon upon completion of procedures',
    },
    es: {
        splash: ['Supera', 'Aprende', 'Disfruta', 'Gana'],
        monetization_locked: 'Esta sección se abrirá pronto una vez completados los trámites',
    },
    fr: {
        splash: ['Élevez', 'Apprenez', 'Savourez', 'Gagnez'],
        monetization_locked: 'Cette section ouvrira bientôt une fois les procédures achevées',
    },
    de: {
        splash: ['Steige auf', 'Lerne', 'Genieße', 'Verdiene'],
        monetization_locked: 'Dieser Bereich wird bald geöffnet, sobald die Verfahren abgeschlossen sind',
    },
    pt: {
        splash: ['Eleve-se', 'Aprenda', 'Desfrute', 'Ganhe'],
        monetization_locked: 'Esta seção abrirá em breve após a conclusão dos procedimentos',
    },
    ru: {
        splash: ['Возвышайся', 'Познавай', 'Наслаждайся', 'Зарабатывай'],
        monetization_locked: 'Этот раздел скоро откроется после завершения процедур',
    },
    zh: {
        splash: ['进阶', '求知', '乐享', '赢取'],
        monetization_locked: '相关手续完成后，此板块即将开放',
    },
    ja: {
        splash: ['高めよう', '学ぼう', '楽しもう', '稼ごう'],
        monetization_locked: 'このセクションは、手続きの完了後まもなく開放されます',
    },
    ko: {
        splash: ['격상', '배움', '즐거움', '수익'],
        monetization_locked: '이 섹션은 절차가 완료되면 곧 개방될 예정입니다',
    },
    tr: {
        splash: ['Yüksel', 'Öğren', 'Keyfini çıkar', 'Kazan'],
        monetization_locked: 'Bu bölüm, prosedürler tamamlandıktan sonra yakında açılacaktır',
    },
    hi: {
        splash: ['ऊपर उठें', 'सीखें', 'आनंद लें', 'कमाएँ'],
        monetization_locked: 'प्रक्रियाएँ पूरी होने के बाद यह अनुभाग शीघ्र खुल जाएगा',
    },
    id: {
        splash: ['Tingkatkan', 'Belajar', 'Nikmati', 'Hasilkan'],
        monetization_locked: 'Bagian ini akan segera dibuka setelah prosedur selesai',
    },
    fa: {
        splash: ['اوج بگیر', 'یاد بگیر', 'لذت ببر', 'درآمد بساز'],
        monetization_locked: 'این بخش به‌زودی پس از تکمیل تشریفات باز خواهد شد',
    },
    ur: {
        splash: ['بلندی حاصل کریں', 'سیکھیں', 'لطف اٹھائیں', 'کمائیں'],
        monetization_locked: 'یہ حصہ جلد ہی طریقہ کار مکمل ہونے کے بعد کھل جائے گا',
    },
};

// ─────────────────────────────────────────────────────────────────────────────
// AST extraction (no eval, no import of the dictionaries).
// ─────────────────────────────────────────────────────────────────────────────

function loadObjectLiteral(file) {
    const source = fs.readFileSync(file, 'utf8');
    const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
    let obj = null;
    sf.forEachChild((node) => {
        if (ts.isVariableStatement(node)) {
            for (const decl of node.declarationList.declarations) {
                if (ts.isIdentifier(decl.name) && ts.isObjectLiteralExpression(decl.initializer)) {
                    obj = decl.initializer;
                }
            }
        }
    });
    if (!obj) throw new Error(`No exported object literal found in ${file}`);
    return obj;
}

function propKey(name) {
    if (ts.isIdentifier(name) || ts.isStringLiteral(name) || ts.isNumericLiteral(name)) return name.text;
    throw new Error(`Unsupported property name kind: ${ts.SyntaxKind[name.kind]}`);
}

function astToPlain(node) {
    if (ts.isObjectLiteralExpression(node)) {
        const out = {};
        for (const prop of node.properties) {
            if (!ts.isPropertyAssignment(prop)) continue;
            out[propKey(prop.name)] = astToPlain(prop.initializer);
        }
        return out;
    }
    if (ts.isArrayLiteralExpression(node)) {
        return node.elements.map((el) => (ts.isSpreadElement(el) ? { __spread: true } : astToPlain(el)));
    }
    if (ts.isStringLiteral(node)) return node.text;
    if (ts.isNumericLiteral(node)) return Number(node.text);
    if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
    if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
    if (node.kind === ts.SyntaxKind.NullKeyword) return null;
    throw new Error(`Non-literal initializer: ${ts.SyntaxKind[node.kind]}`);
}

function flattenTree(obj, prefix, out) {
    for (const [k, v] of Object.entries(obj)) {
        const key = prefix ? `${prefix}.${k}` : k;
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            flattenTree(v, key, out);
        } else if (Array.isArray(v)) {
            flattenArray(v, key, out);
        } else {
            out[key] = { kind: 'scalar', value: v };
        }
    }
}

function flattenArray(arr, key, out) {
    arr.forEach((el, i) => {
        const itemKey = `${key}.${i}`;
        if (el !== null && typeof el === 'object' && !Array.isArray(el)) {
            flattenTree(el, itemKey, out);
        } else if (Array.isArray(el)) {
            flattenArray(el, itemKey, out);
        } else {
            out[itemKey] = { kind: 'scalar', value: el };
        }
    });
    out[key] = { kind: 'array', length: arr.length };
}

function modeExtract() {
    fs.mkdirSync(WORK_DIR, { recursive: true });
    const enPlain = astToPlain(loadObjectLiteral(path.join(I18N_DIR, 'en.ts')));
    const arPlain = astToPlain(loadObjectLiteral(path.join(I18N_DIR, 'ar.ts')));
    const enFlat = {};
    flattenTree(enPlain, '', enFlat);
    const arFlat = {};
    flattenTree(arPlain, '', arFlat);

    const enKeys = Object.keys(enFlat);
    const arKeys = Object.keys(arFlat);
    const arMissing = enKeys.filter((k) => !(k in arFlat));
    const arExtra = arKeys.filter((k) => !(k in enFlat));

    fs.writeFileSync(path.join(WORK_DIR, 'en.flat.json'), JSON.stringify(enFlat, null, 1));
    fs.writeFileSync(path.join(WORK_DIR, 'ar.flat.json'), JSON.stringify(arFlat, null, 1));
    fs.writeFileSync(
        path.join(WORK_DIR, 'parity-baseline.json'),
        JSON.stringify(
            {
                generated_at: new Date().toISOString(),
                en_leaf_count: enKeys.length,
                ar_leaf_count: arKeys.length,
                // Documented, accepted asymmetry: en.ts keeps 21 legacy flat
                // category labels (mirrored under categories.*) that ar.ts
                // never had. New UNIT 42.1 dictionaries MUST match en.ts 1:1.
                ar_missing_vs_en: arMissing,
                ar_extra_vs_en: arExtra,
            },
            null,
            2,
        ),
    );
    console.log(`[extract] en leaves: ${enKeys.length}, ar leaves: ${arKeys.length}, ar-missing (accepted): ${arMissing.length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Chunk planning
// ─────────────────────────────────────────────────────────────────────────────

const CHUNK_MAX_CHARS = 7000;
const CHUNK_MIN_KEYS = 12;
const CHUNK_MAX_KEYS = 170;

function modePlan() {
    const enFlat = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'en.flat.json'), 'utf8'));
    const leaves = Object.entries(enFlat)
        .filter(([, meta]) => meta.kind === 'scalar' && typeof meta.value === 'string')
        .map(([key, meta]) => ({ key, value: meta.value }));
    fs.rmSync(CHUNKS_DIR, { recursive: true, force: true });
    fs.mkdirSync(CHUNKS_DIR, { recursive: true });

    const chunks = [];
    let cur = [];
    let curChars = 0;
    for (const leaf of leaves) {
        cur.push(leaf);
        curChars += leaf.value.length + leaf.key.length;
        const maxKeys = leaf.key.startsWith('guide.') ? 90 : CHUNK_MAX_KEYS;
        if (curChars >= CHUNK_MAX_CHARS || cur.length >= maxKeys) {
            chunks.push(cur);
            cur = [];
            curChars = 0;
        }
    }
    if (cur.length) {
        if (cur.length < CHUNK_MIN_KEYS && chunks.length) chunks[chunks.length - 1].push(...cur);
        else chunks.push(cur);
    }

    for (let i = 0; i < chunks.length; i++) {
        const items = Object.fromEntries(chunks[i].map((l) => [l.key, l.value]));
        fs.writeFileSync(path.join(CHUNKS_DIR, `chunk-${String(i + 1).padStart(3, '0')}.json`), JSON.stringify(items, null, 1));
    }
    fs.writeFileSync(
        path.join(CHUNKS_DIR, 'manifest.json'),
        JSON.stringify({ chunk_count: chunks.length, leaf_count: leaves.length, chars: leaves.reduce((a, l) => a + l.value.length, 0) }, null, 2),
    );
    console.log(`[plan] chunks: ${chunks.length}, translatable leaves: ${leaves.length}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

function readJsonSafe(file, fallback = null) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
        return fallback;
    }
}

function ensureWorkData() {
    if (!fs.existsSync(path.join(WORK_DIR, 'en.flat.json'))) modeExtract();
    if (!fs.existsSync(path.join(CHUNKS_DIR, 'manifest.json'))) modePlan();
}

function chunkFiles() {
    return fs.readdirSync(CHUNKS_DIR)
        .filter((f) => /^chunk-\d+\.json$/.test(f))
        .sort();
}

/** All {placeholder} tokens used by a source string. */
export function placeholdersOf(text) {
    return (String(text).match(/\{[A-Za-z_][A-Za-z0-9_]*\}/g) || []).sort();
}

/**
 * Strict financial-figure check: the 80/20 (and 100) formulation must survive
 * in every language. Locale typography is respected — "80%", "80 %" (de),
 * "%80" (tr), "80％" (ja/zh full-width) all carry the SAME exact figure.
 */
export function percentFormPresent(text, num) {
    return new RegExp(`${num}\\s*[%％]|[%％]\\s*${num}`).test(String(text));
}

/**
 * Width units mirroring src/lib/i18nAutoFit.ts heuristics — used for the
 * length-sanity bounds so compact scripts (zh/ja/ko) are judged fairly.
 */
function widthUnits(text, lang) {
    const factor = { ar: 0.92, fa: 0.92, ur: 1.05, ru: 1.05, hi: 0.8 }[lang] ?? 1;
    let units = 0;
    for (const ch of String(text)) {
        if (ch === ' ') units += 0.35;
        else if (/[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/.test(ch)) units += 0.85 * factor;
        else if (/[\u4E00-\u9FFF\u3400-\u4DBF]/.test(ch)) units += 1;
        else if (/[\u3040-\u30FF\u31F0-\u31FF]/.test(ch)) units += 1;
        else if (/[\uAC00-\uD7AF]/.test(ch)) units += 0.95;
        else if (/[\u0900-\u097F]/.test(ch)) units += 0.7 * factor;
        else if (/[A-Za-z]/.test(ch)) units += 0.55 * factor;
        else if (/[\u0400-\u04FF]/.test(ch)) units += 0.6 * factor;
        else units += 0.65 * factor;
    }
    return units;
}

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--lang') args.lang = argv[++i];
        else if (a === '--all') args.all = true;
        else if (a === '--force') args.force = true;
        else if (a === '--tsc') args.tsc = true;
        else if (a === '--concurrency') args.concurrency = Number(argv[++i]) || 6;
        else args._.push(a);
    }
    return args;
}

// ─────────────────────────────────────────────────────────────────────────────
// Translation via z-ai LLM (per chunk, resumable, validated per chunk)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SDK location. Override with DUELI_I18N_SDK_PATH when running outside the
 * canonical sandbox (e.g. a local agent machine):
 *   DUELI_I18N_SDK_PATH=/path/to/z-ai-web-dev-sdk/dist/index.js node dev-tools/i18n-global-generator.mjs translate --lang it
 * If the SDK is unavailable, a local LLM agent can translate the chunk files
 * itself (dev-tools/i18n-work/chunks/chunk-*.json → translations/<lang>/chunk-*.json)
 * and then run `merge --lang <code>` + `validate --lang <code>` + `emit --lang <code>`.
 */
const SDK_PATH = process.env.DUELI_I18N_SDK_PATH
    || '/home/z/.bun/install/global/node_modules/z-ai-web-dev-sdk/dist/index.js';

let zaiInstance = null;
async function getZai() {
    if (!zaiInstance) {
        const mod = await import(SDK_PATH);
        const ZAI = mod.default;
        zaiInstance = await ZAI.create();
    }
    return zaiInstance;
}

function chunkErrorsFor(items, output, lang) {
    const errs = [];
    for (const key of Object.keys(items)) {
        const out = output[key];
        if (typeof out !== 'string') { errs.push(`missing key ${key}`); continue; }
        if (!out.trim()) { errs.push(`empty value for ${key}`); continue; }
        const want = placeholdersOf(items[key]);
        const got = placeholdersOf(out);
        if (JSON.stringify(want) !== JSON.stringify(got)) errs.push(`placeholder mismatch for ${key}: expected ${want.join('+')} got ${got.join('+')}`);
        for (const term of PROTECTED_TERMS) {
            if (items[key].includes(term) && !out.includes(term)) errs.push(`protected term lost for ${key}: ${term}`);
        }
        if (/^(\.{3}|…|\[\s*\.\.\.\s*\])$/.test(out.trim())) errs.push(`truncation sentinel for ${key}`);
        if (/\b(TODO|FIXME|XXX)\b/.test(out)) errs.push(`meta marker inside ${key}`);
        for (const pct of ['80', '20', '100']) {
            if (new RegExp(`(?<!\\d)${pct}(?!\\d)\\s*[%％]|[%％]\\s*${pct}(?!\\d)`).test(items[key]) && !percentFormPresent(out, pct)) {
                errs.push(`percentage lost for ${key}: ${pct}%`);
            }
        }
        if (items[key].length >= 60) {
            const cjk = lang === 'zh' || lang === 'ja' || lang === 'ko';
            const floor = cjk ? 0.28 : 0.45;
            const ratio = widthUnits(out, lang) / Math.max(1, widthUnits(items[key], 'en'));
            if (ratio < floor) errs.push(`suspiciously short for ${key} (width ratio ${ratio.toFixed(2)})`);
            if (ratio > 2.6) errs.push(`suspiciously long for ${key} (width ratio ${ratio.toFixed(2)})`);
        }
    }
    const extra = Object.keys(output).filter((k) => !(k in items));
    if (extra.length) errs.push(`unexpected extra keys: ${extra.slice(0, 5).join(', ')}`);
    return errs;
}

function buildSystemPrompt(langMeta) {
    return [
        'You are a senior localizer for Dueli — a global competition & dialogue platform by Maelsh Pro (non-profit humanitarian initiative).',
        `Translate UI/product strings from English into ${langMeta.english} (${langMeta.native}; script: ${langMeta.script}).`,
        'Output: ONLY a valid JSON object mapping the SAME keys to the translated strings. No markdown fences, no comments, no extra keys, no trailing text.',
        'Rules:',
        '1) Preserve every {placeholder} EXACTLY as written ({actor}, {preview}, {size}, {duration}, {title}, ...). Never rename, translate, reorder-count or drop them.',
        '2) Keep these terms verbatim (never translate or transliterate): ' + PROTECTED_TERMS.join(', ') + '.',
        '3) Keep percentages exactly as in the source: 80%, 20%, 100%. The 80%/20% revenue split (competitors 80% / platform sustainability 20%) is a legal, non-negotiable figure.',
        '4) Translate fully and faithfully. Never summarize, never truncate, never add translator notes. Long paragraphs must stay complete paragraphs.',
        '5) UI labels/buttons stay concise (short imperative or noun forms). Body copy stays natural, fluent and warm-formal.',
        '6) Keep HTML entities, quotes style and leading/trailing colons sensible for the target language typography.',
        '7) "competition" and "duel" are the platform\'s core concepts — translate as the natural word for a fair contest/debate duel.',
        '8) If a source string is already a proper noun, an e-mail, a domain or a technical name, keep it unchanged.',
    ].join('\n');
}

function buildUserPrompt(items, langMeta, lang) {
    const mandated = MANDATED_COPY[lang];
    const mandatedLines = [
        `- splash.word_1 => ${mandated.splash[0]}`,
        `- splash.word_2 => ${mandated.splash[1]}`,
        `- splash.word_3 => ${mandated.splash[2]}`,
        `- splash.word_4 => ${mandated.splash[3]}`,
        `- monetization_locked => ${mandated.monetization_locked}`,
    ].join('\n');
    return [
        `Target language: ${langMeta.english} (${lang} — ${langMeta.native}).`,
        'Translate this JSON object. Same keys, translated values, JSON only:',
        '```json',
        JSON.stringify(items, null, 1),
        '```',
        'MANDATED COPY — these keys MUST use EXACTLY this official wording:',
        mandatedLines,
    ].join('\n');
}

function stripFences(text) {
    let cleaned = String(text).trim();
    // Drop every markdown fence line (```json, ```JSON5, ``` — opening or
    // closing), whatever their count or position.
    cleaned = cleaned.replace(/^```[a-zA-Z0-9]*\s*/gm, '').replace(/```/g, '');
    const start = Math.min(...['{', '['].map((c) => {
        const i = cleaned.indexOf(c);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
    }));
    const end = Math.max(cleaned.lastIndexOf('}'), cleaned.lastIndexOf(']'));
    if (start === Number.MAX_SAFE_INTEGER || end === -1) return cleaned;
    return cleaned.slice(start, end + 1);
}

/**
 * Tolerant JSON parse: models sometimes emit raw newlines/tabs inside JSON
 * strings (invalid per spec). Walk the text, track string state, and escape
 * raw control characters that sit inside a string literal.
 */
function parseLooseJson(text) {
    try {
        return JSON.parse(text);
    } catch {
        // fall through to repair
    }
    let out = '';
    let inString = false;
    let escaped = false;
    for (const ch of text) {
        if (inString) {
            if (escaped) {
                escaped = false;
                out += ch;
                continue;
            }
            if (ch === '\\') {
                escaped = true;
                out += ch;
                continue;
            }
            if (ch === '"') {
                inString = false;
                out += ch;
                continue;
            }
            if (ch === '\n') { out += '\\n'; continue; }
            if (ch === '\r') { out += '\\r'; continue; }
            if (ch === '\t') { out += '\\t'; continue; }
            out += ch;
            continue;
        }
        if (ch === '"') inString = true;
        out += ch;
    }
    return JSON.parse(out);
}

class RateLimitError extends Error {
    constructor(message) {
        super(message);
        this.name = 'RateLimitError';
        this.rateLimited = true;
    }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** One LLM call with 429-aware exponential backoff (the z-ai endpoint throttles hard; hourly windows need long patience). */
async function callLlm(zai, messages) {
    let lastErr = null;
    const waits = [10000, 20000, 40000, 80000, 160000, 300000];
    for (let attempt = 0; attempt < waits.length; attempt++) {
        try {
            return await zai.chat.completions.create({ messages, thinking: { type: 'disabled' } });
        } catch (err) {
            lastErr = err;
            const msg = String(err?.message || err);
            const is429 = /429|Too many requests/i.test(msg);
            if (!is429) throw err;
            const wait = waits[attempt] + Math.floor(Math.random() * 3000);
            console.warn(`    [llm] 429 throttled — backing off ${(wait / 1000).toFixed(0)}s (attempt ${attempt + 1})`);
            await sleep(wait);
        }
    }
    throw lastErr;
}

async function translateChunk(zai, langMeta, lang, items, previousOutput) {
    const retryBlock = previousOutput
        ? '\n\nPREVIOUS ATTEMPT FAILED VALIDATION — fix these problems and return the FULL corrected JSON:\n- '
            + chunkErrorsFor(items, previousOutput, lang).slice(0, 20).join('\n- ')
        : '';
    const completion = await callLlm(zai, [
        { role: 'assistant', content: buildSystemPrompt(langMeta) },
        { role: 'user', content: buildUserPrompt(items, langMeta, lang) + retryBlock },
    ]);
    const raw = completion.choices?.[0]?.message?.content ?? '';
    return parseLooseJson(stripFences(raw));
}

async function translateOneChunk(zai, langMeta, lang, chunkFile, force) {
    const items = readJsonSafe(path.join(CHUNKS_DIR, chunkFile), {});
    const outFile = path.join(TRANS_DIR, lang, chunkFile);
    if (!force && fs.existsSync(outFile)) {
        const cached = readJsonSafe(outFile, {});
        if (!chunkErrorsFor(items, cached, lang).length) return { chunk: chunkFile, status: 'cached' };
    }
    fs.mkdirSync(path.join(TRANS_DIR, lang), { recursive: true });

    let lastOutput = null;
    for (let attempt = 0; attempt < 5; attempt++) {
        try {
            const output = await translateChunk(zai, langMeta, lang, items, lastOutput);
            lastOutput = output;
            const errs = chunkErrorsFor(items, output, lang);
            if (!errs.length) {
                fs.writeFileSync(outFile, JSON.stringify(output, null, 1));
                return { chunk: chunkFile, status: 'ok' };
            }
            console.warn(`  [${lang}/${chunkFile}] attempt ${attempt + 1} invalid: ${errs.slice(0, 4).join('; ')}`);
            await sleep(1200);
        } catch (err) {
            console.warn(`  [${lang}/${chunkFile}] attempt ${attempt + 1} error: ${String(err.message || err).slice(0, 140)}`);
            if (!err?.rateLimited) await sleep(1500 * (attempt + 1));
        }
    }
    return { chunk: chunkFile, status: 'failed' };
}

async function modeTranslate(args) {
    const langs = args.all ? TARGET_LANGUAGES.map((l) => l.code) : [args.lang].filter(Boolean);
    if (!langs.length) throw new Error('translate needs --lang <code> or --all');
    const files = chunkFiles();
    const manifest = readJsonSafe(path.join(CHUNKS_DIR, 'manifest.json'), {});
    console.log(`[translate] ${langs.join(', ')} — ${files.length} chunks each`);

    for (const lang of langs) {
        const langMeta = TARGET_LANGUAGES.find((l) => l.code === lang);
        if (!langMeta) throw new Error(`unknown target language: ${lang}`);
        const zai = await getZai();
        const done = new Set();
        let ok = 0;
        let cached = 0;
        let failed = 0;
        const concurrency = Math.max(1, Math.min(3, args.concurrency ?? 2));
        const queue = [...files];
        async function worker() {
            while (queue.length) {
                const file = queue.shift();
                const res = await translateOneChunk(zai, langMeta, lang, file, args.force);
                if (res.status === 'ok') ok++;
                else if (res.status === 'cached') cached++;
                else failed++;
                done.add(file);
                process.stdout.write(`  [${lang}] ${done.size}/${files.length} (ok ${ok}, cached ${cached}, failed ${failed})\r`);
                await sleep(700 + Math.floor(Math.random() * 900));
            }
        }
        await Promise.all(Array.from({ length: concurrency }, worker));
        console.log('');
        // merge
        const merged = {};
        let missing = 0;
        for (const file of files) {
            const part = readJsonSafe(path.join(TRANS_DIR, lang, file), {});
            for (const [k, v] of Object.entries(part)) {
                if (typeof v === 'string') merged[k] = v;
            }
        }
        const enFlat = readJsonSafe(path.join(WORK_DIR, 'en.flat.json'), {});
        for (const [k, meta] of Object.entries(enFlat)) {
            if (meta.kind === 'scalar' && typeof meta.value === 'string' && typeof merged[k] !== 'string') {
                missing++;
                console.error(`  [${lang}] MISSING merged key: ${k}`);
            }
        }
        fs.writeFileSync(path.join(TRANS_DIR, `${lang}.json`), JSON.stringify(merged, null, 1));
        console.log(`[translate] ${lang}: ok ${ok}, cached ${cached}, failed ${failed}, merged ${Object.keys(merged).length} keys, missing ${missing}`);
        if (failed || missing) process.exitCode = 1;
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Strict Parity Guard
// ─────────────────────────────────────────────────────────────────────────────

function rebuildTree(flat, enFlat) {
    const root = {};
    for (const [key, meta] of Object.entries(flat)) {
        if (meta && meta.kind === 'array') continue;
        const parts = key.split('.');
        let node = root;
        for (let i = 0; i < parts.length - 1; i++) {
            const seg = parts[i];
            const nextSeg = parts[i + 1];
            const isIndex = /^\d+$/.test(nextSeg) || nextSeg === 'length';
            if (typeof node[seg] !== 'object' || node[seg] === null) node[seg] = isIndex ? [] : {};
            node = node[seg];
        }
        const last = parts[parts.length - 1];
        node[last] = meta && meta.kind === 'scalar' ? meta.value : undefined;
    }
    return root;
}

function collectTreeProblems(lang, flat, enFlat) {
    const problems = [];
    const enKeys = Object.keys(enFlat);
    const keys = Object.keys(flat);

    for (const k of enKeys) if (!(k in flat)) problems.push(`missing key: ${k}`);
    for (const k of keys) if (!(k in enFlat)) problems.push(`extra key: ${k}`);

    for (const [k, meta] of Object.entries(enFlat)) {
        if (meta.kind === 'array') {
            const got = flat[k];
            if (!got || got.kind !== 'array' || got.length !== meta.length) {
                problems.push(`array shape mismatch at ${k}: expected ${meta.kind}(${meta.length}) got ${got ? `${got.kind}(${got.length ?? '?'})` : 'missing'}`);
            }
            continue;
        }
        const v = flat[k];
        if (typeof v !== 'object' || v === null || v.kind !== 'scalar' || typeof v.value !== 'string') {
            problems.push(`type mismatch at ${k}: expected string leaf`);
        }
    }
    return problems;
}

function validateLanguage(lang, merged, enFlat) {
    const problems = [];
    // 1. rebuilt flat view: translation file stores ONLY scalars; array lengths come from EN.
    const flat = {};
    for (const [k, v] of Object.entries(merged)) {
        if (typeof v === 'string') flat[k] = { kind: 'scalar', value: v };
    }
    for (const [k, meta] of Object.entries(enFlat)) {
        if (meta.kind === 'array') flat[k] = { kind: 'array', length: meta.length };
    }

    // 2. key + shape parity
    problems.push(...collectTreeProblems(lang, flat, enFlat));

    // 3. value-level checks
    for (const [k, meta] of Object.entries(enFlat)) {
        if (meta.kind !== 'scalar' || typeof meta.value !== 'string') continue;
        const src = meta.value;
        const out = flat[k]?.value ?? '';
        if (!out.trim()) problems.push(`empty value at ${k}`);

        const wantVars = placeholdersOf(src);
        const gotVars = placeholdersOf(out);
        if (JSON.stringify(wantVars) !== JSON.stringify(gotVars)) {
            problems.push(`placeholder mismatch at ${k}: expected [${wantVars.join(', ')}] got [${gotVars.join(', ')}]`);
        }
        for (const term of PROTECTED_TERMS) {
            if (src.includes(term) && !out.includes(term)) problems.push(`protected term lost at ${k}: ${term}`);
        }
        for (const pct of ['80', '20', '100']) {
            if (new RegExp(`(?<!\\d)${pct}(?!\\d)\\s*[%％]|[%％]\\s*${pct}(?!\\d)`).test(src) && !percentFormPresent(out, pct)) {
                problems.push(`percentage lost at ${k}: ${pct}%`);
            }
        }
        if (/^(\.{3}|…|\[\s*\.\.\.\s*\]|\/\/\s*\.\.\.)$/.test(out.trim())) problems.push(`truncation sentinel at ${k}`);
        if (/\b(TODO|FIXME|XXX)\b/.test(out)) problems.push(`meta marker at ${k}`);
        // Length sanity via width units (mirrors i18nAutoFit): compact scripts
        // (zh/ja/ko) carry the same meaning in far fewer characters, so raw
        // char ratios would false-positive; width units judge them fairly.
        if (src.length >= 60) {
            // CJK prose legitimately compresses to ~0.30-0.55 of EN width;
            // real truncation lands far below 0.25.
            const floor = (lang === 'zh' || lang === 'ja' || lang === 'ko') ? 0.28 : 0.45;
            const ratio = widthUnits(out, lang) / Math.max(1, widthUnits(src, 'en'));
            if (ratio < floor) problems.push(`suspiciously short at ${k} (width ratio ${ratio.toFixed(2)})`);
            if (ratio > 2.6) problems.push(`suspiciously long at ${k} (width ratio ${ratio.toFixed(2)})`);
        }
    }

    // 4. mandated copy
    const mandated = MANDATED_COPY[lang];
    if (!mandated) problems.push(`no mandated copy table for ${lang}`);
    else {
        mandated.splash.forEach((word, i) => {
            const key = `splash.word_${i + 1}`;
            if (flat[key]?.value !== word) problems.push(`mandated splash.word_${i + 1} must be exactly "${word}" (got "${flat[key]?.value}")`);
        });
        if (flat.monetization_locked?.value !== mandated.monetization_locked) {
            problems.push(`mandated monetization_locked mismatch (got "${flat.monetization_locked?.value}")`);
        }
    }
    return problems;
}

/**
 * Standalone merge (no LLM): rebuild translations/<lang>.json from whatever
 * chunk files exist under translations/<lang>/. This is the entry point for
 * LLM agents that fill chunk JSONs themselves instead of calling the SDK.
 */
function modeMerge(args) {
    const langs = args.all ? TARGET_LANGUAGES.map((l) => l.code) : [args.lang].filter(Boolean);
    if (!langs.length) throw new Error('merge needs --lang <code> or --all');
    const files = chunkFiles();
    const enFlat = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'en.flat.json'), 'utf8'));
    for (const lang of langs) {
        const merged = {};
        let chunksFound = 0;
        for (const file of files) {
            const part = readJsonSafe(path.join(TRANS_DIR, lang, file), null);
            if (part) chunksFound++;
            for (const [k, v] of Object.entries(part || {})) {
                if (typeof v === 'string') merged[k] = v;
            }
        }
        let missing = 0;
        for (const [k, meta] of Object.entries(enFlat)) {
            if (meta.kind === 'scalar' && typeof meta.value === 'string' && typeof merged[k] !== 'string') {
                missing++;
                console.error(`  [${lang}] MISSING merged key: ${k}`);
            }
        }
        fs.mkdirSync(TRANS_DIR, { recursive: true });
        fs.writeFileSync(path.join(TRANS_DIR, `${lang}.json`), JSON.stringify(merged, null, 1));
        console.log(`[merge] ${lang}: chunks ${chunksFound}/${files.length}, merged ${Object.keys(merged).length} keys, missing ${missing}`);
        if (missing || chunksFound < files.length) process.exitCode = 1;
    }
}

function modeValidate(args) {
    const enFlat = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'en.flat.json'), 'utf8'));
    const langs = args.lang ? [args.lang] : ALL_LANGUAGE_CODES.filter((c) => c !== 'ar' && c !== 'en');
    let hadErrors = false;
    for (const lang of langs) {
        const merged = readJsonSafe(path.join(TRANS_DIR, `${lang}.json`), null);
        if (!merged) {
            console.error(`[validate] ${lang}: no merged translation file (run translate first)`);
            hadErrors = true;
            continue;
        }
        const problems = validateLanguage(lang, merged, enFlat);
        if (problems.length) {
            hadErrors = true;
            console.error(`[validate] ${lang}: ${problems.length} problem(s)`);
            for (const p of problems.slice(0, 25)) console.error(`   - ${p}`);
            if (problems.length > 25) console.error(`   ... and ${problems.length - 25} more`);
        } else {
            console.log(`[validate] ${lang}: OK (100% parity with en.ts)`);
        }
    }
    if (hadErrors) process.exitCode = 1;
}

/** Keys flagged by the guard, grouped by chunk file — the repair worklist. */
function badKeysByChunk(lang, enFlat) {
    const merged = readJsonSafe(path.join(TRANS_DIR, `${lang}.json`), null);
    if (!merged) throw new Error(`no merged translation for ${lang}`);
    const problems = validateLanguage(lang, merged, enFlat);
    const badKeys = new Set();
    for (const p of problems) {
        const m = p.match(/(?:at|for) ([A-Za-z0-9_.]+?):/);
        if (m) badKeys.add(m[1]);
    }
    const byChunk = new Map();
    for (const file of chunkFiles()) {
        const items = readJsonSafe(path.join(CHUNKS_DIR, file), {});
        const hits = Object.keys(items).filter((k) => badKeys.has(k));
        if (hits.length) byChunk.set(file, hits);
    }
    return { problems, byChunk };
}

async function modeRepair(args) {
    const enFlat = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'en.flat.json'), 'utf8'));
    const langs = args.all ? TARGET_LANGUAGES.map((l) => l.code) : [args.lang].filter(Boolean);
    if (!langs.length) throw new Error('repair needs --lang <code> or --all');
    for (const lang of langs) {
        const langMeta = TARGET_LANGUAGES.find((l) => l.code === lang);
        const { problems, byChunk } = badKeysByChunk(lang, enFlat);
        if (!byChunk.size) {
            console.log(`[repair] ${lang}: nothing to repair (${problems.length} unresolved problems matched no chunk keys)`);
            if (problems.length) process.exitCode = 1;
            continue;
        }
        console.log(`[repair] ${lang}: ${problems.length} problem(s) in ${byChunk.size} chunk(s): ${[...byChunk.keys()].join(', ')}`);
        const zai = await getZai();
        for (const [file] of byChunk) {
            const res = await translateOneChunk(zai, langMeta, lang, file, true);
            console.log(`  [repair] ${lang}/${file}: ${res.status}`);
        }
        // re-merge + re-validate
        const merged = {};
        for (const file of chunkFiles()) {
            const part = readJsonSafe(path.join(TRANS_DIR, lang, file), {});
            for (const [k, v] of Object.entries(part)) if (typeof v === 'string') merged[k] = v;
        }
        fs.writeFileSync(path.join(TRANS_DIR, `${lang}.json`), JSON.stringify(merged, null, 1));
        const after = validateLanguage(lang, merged, enFlat);
        console.log(`[repair] ${lang}: ${after.length} problem(s) remain`);
        if (after.length) {
            for (const p of after.slice(0, 10)) console.error(`   - ${p}`);
            process.exitCode = 1;
        }
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Emit src/i18n/<lang>.ts
// ─────────────────────────────────────────────────────────────────────────────

const IDENT_RE = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

function tsString(value) {
    return `'${String(value)
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\r?\n/g, '\\n')}'`;
}

function serialize(obj, indent, out, langMeta, lang) {
    const pad = '    '.repeat(indent);
    const entries = Object.entries(obj);
    for (let i = 0; i < entries.length; i++) {
        const [k, v] = entries[i];
        const key = IDENT_RE.test(k) ? k : tsString(k);
        if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
            out.push(`${pad}// ${k}\n${pad}${key}: {\n`);
            serialize(v, indent + 1, out, langMeta, lang);
            out.push(`${pad}}${i === entries.length - 1 ? '' : ','}\n`);
        } else if (Array.isArray(v)) {
            out.push(`${pad}${key}: [\n`);
            for (let j = 0; j < v.length; j++) {
                const el = v[j];
                if (el !== null && typeof el === 'object' && !Array.isArray(el)) {
                    out.push(`${pad}    {\n`);
                    serialize(el, indent + 2, out, langMeta, lang);
                    out.push(`${pad}    }${j === v.length - 1 ? '' : ','}\n`);
                } else {
                    out.push(`${pad}    ${tsString(el)}${j === v.length - 1 ? '' : ','}\n`);
                }
            }
            out.push(`${pad}]${i === entries.length - 1 ? '' : ','}\n`);
        } else {
            out.push(`${pad}${key}: ${tsString(v)}${i === entries.length - 1 ? '' : ','}\n`);
        }
    }
}

function modeEmit(args) {
    const enFlat = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'en.flat.json'), 'utf8'));
    const langMeta = TARGET_LANGUAGES.find((l) => l.code === args.lang);
    if (!langMeta) throw new Error('emit needs --lang <code> from the UNIT 42.1 target list');
    const merged = readJsonSafe(path.join(TRANS_DIR, `${langMeta.code}.json`), null);
    if (!merged) throw new Error(`no merged translation for ${langMeta.code} — run translate first`);

    const problems = validateLanguage(langMeta.code, merged, enFlat);
    if (problems.length) {
        console.error(`[emit] STRICT PARITY GUARD blocked ${langMeta.code}: ${problems.length} problem(s); first: ${problems[0]}`);
        process.exitCode = 1;
        return;
    }

    // nested tree: EN structure with translated strings (+ EN non-string scalars)
    const tree = buildNestedTree(langMeta.code, merged, enFlat);

    const dir = LANGUAGE_DIRS[langMeta.code] ?? 'ltr';
    const header = [
        '/**',
        ` * ${langMeta.native} (${langMeta.english}) Translations — UNIT 42.1 (R4-GLOBAL-I18N-ALL-LANGS-1)`,
        ' * Auto-generated by dev-tools/i18n-global-generator.mjs from src/i18n/en.ts.',
        ' * Full key parity with en.ts (objects, arrays and {placeholders} included).',
        ` * Text direction: ${dir}. Protected identity terms (Dueli, Maelsh Pro,`,
        ' * domains, e-mails, AI/model & infrastructure names) are kept verbatim.',
        ' * Do NOT hand-edit: re-run the generator after changing en.ts.',
        ' */',
        `export const ${langMeta.code} = {`,
    ].map((l) => `${l}\n`);
    const body = [];
    serialize(tree, 1, body, langMeta, langMeta.code);
    const footer = ['};', ''];
    const file = path.join(I18N_DIR, `${langMeta.code}.ts`);
    fs.writeFileSync(file, [...header, ...body, ...footer].join(''));
    console.log(`[emit] ${file}`);
}

function flatFromMerged(merged, enFlat) {
    const flat = {};
    for (const [k, v] of Object.entries(merged)) {
        if (typeof v === 'string') flat[k] = { kind: 'scalar', value: v };
    }
    for (const [k, meta] of Object.entries(enFlat)) {
        if (meta.kind === 'array') flat[k] = { kind: 'array', length: meta.length };
    }
    return flat;
}

/** Nested (un-flattened) tree of a language: EN structure, translated leaves. */
function buildNestedTree(lang, merged, enFlat) {
    const tree = rebuildTree(flatFromMerged(merged, enFlat), enFlat);
    const enPlain = astToPlain(loadObjectLiteral(path.join(I18N_DIR, 'en.ts')));
    // keep EN values for non-string scalars (en.ts is string-only today)
    (function copyNonStrings(enNode, outNode) {
        for (const [k, v] of Object.entries(enNode)) {
            if (v === null || typeof v !== 'object' || Array.isArray(v)) {
                if (typeof v !== 'string') outNode[k] = v;
            } else if (Array.isArray(v)) {
                for (let i = 0; i < v.length; i++) {
                    const el = v[i];
                    if (el !== null && typeof el === 'object' && !Array.isArray(el) && outNode[k]?.[i]) {
                        copyNonStrings(el, outNode[k][i]);
                    }
                }
            } else if (outNode[k]) {
                copyNonStrings(v, outNode[k]);
            }
        }
    })(enPlain, tree);
    return tree;
}

/**
 * UNIT 42.1 — write the runtime dictionary as a static asset:
 * public/static/locales/<lang>.json (nested, EN-shaped, translated).
 * This is the file the lazy loader (`ensureLanguageLoaded` in
 * src/i18n/index.ts) fetches at request time. Code-bundle size stays
 * constant: no `src/i18n/<lang>.ts` import is created by this mode.
 */
function modeEmitJson(args) {
    const enFlat = JSON.parse(fs.readFileSync(path.join(WORK_DIR, 'en.flat.json'), 'utf8'));
    const langs = args.all
        ? TARGET_LANGUAGES.map((l) => l.code)
        : [args.lang].filter(Boolean);
    if (!langs.length) throw new Error('emit-json needs --lang <code> or --all');
    fs.mkdirSync(LOCALES_DIR, { recursive: true });
    for (const lang of langs) {
        const merged = readJsonSafe(path.join(TRANS_DIR, `${lang}.json`), null);
        if (!merged) {
            console.error(`[emit-json] ${lang}: no merged translation — run translate/merge first`);
            process.exitCode = 1;
            continue;
        }
        const problems = validateLanguage(lang, merged, enFlat);
        if (problems.length) {
            console.error(`[emit-json] STRICT PARITY GUARD blocked ${lang}: ${problems.length} problem(s); first: ${problems[0]}`);
            process.exitCode = 1;
            continue;
        }
        const tree = buildNestedTree(lang, merged, enFlat);
        const file = path.join(LOCALES_DIR, `${lang}.json`);
        fs.writeFileSync(file, JSON.stringify(tree));
        console.log(`[emit-json] ${file} (${Object.keys(merged).length} keys)`);
    }
}

function modeStatus() {
    const manifest = readJsonSafe(path.join(CHUNKS_DIR, 'manifest.json'), {});
    const baseline = readJsonSafe(path.join(WORK_DIR, 'parity-baseline.json'), {});
    console.log(`en leaves: ${baseline.en_leaf_count ?? '?'} | chunks: ${manifest.chunk_count ?? '?'}`);
    for (const lang of TARGET_LANGUAGES) {
        const merged = readJsonSafe(path.join(TRANS_DIR, `${lang.code}.json`), null);
        const have = merged ? Object.keys(merged).length : 0;
        console.log(`  ${lang.code}: ${have} translated keys ${have ? '✓' : '—'}`);
    }
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
    const args = parseArgs(process.argv.slice(2));
    switch (args._[0]) {
        case 'extract': return modeExtract();
        case 'plan': return modePlan();
        case 'translate': {
            ensureWorkData();
            return modeTranslate(args);
        }
        case 'validate': {
            ensureWorkData();
            return modeValidate(args);
        }
        case 'merge': {
            ensureWorkData();
            return modeMerge(args);
        }
        case 'repair': {
            ensureWorkData();
            return modeRepair(args);
        }
        case 'emit': {
            ensureWorkData();
            return modeEmit(args);
        }
        case 'emit-json': {
            ensureWorkData();
            return modeEmitJson(args);
        }
        case 'status': return modeStatus();
        default:
            console.log('Commands: extract | plan | translate [--lang xx|--all] | merge [--lang xx|--all] | validate [--lang xx] | repair [--lang xx|--all] | emit [--lang xx] [--tsc] | emit-json [--lang xx|--all] | status');
            process.exitCode = 1;
    }
}

// Run the CLI only when executed directly — importing this module (e.g. from
// audit-i18n-completeness.mjs for MANDATED_COPY/PROTECTED_TERMS) must not fire it.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
    main().catch((err) => {
        console.error('[i18n-global-generator]', err);
        process.exitCode = 1;
    });
}
