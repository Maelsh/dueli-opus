#!/usr/bin/env node
/**
 * @file dev-tools/audit-i18n-completeness.mjs
 * @description UNIT 42.1 — i18n Completeness Auditor (the layer validate() lacks)
 *
 * `validate` in i18n-global-generator.mjs guarantees STRUCTURAL parity (keys,
 * shapes, placeholders, protected terms, mandated copy, length sanity) — but a
 * value that is a verbatim COPY of the English (or Arabic) source passes every
 * one of those checks. This auditor closes that gap:
 *
 *   1. Detects untranslated leaves: values identical (after script-aware
 *      normalisation) to the en.ts or ar.ts source.
 *   2. Writes a precise repair worklist: dev-tools/i18n-work/audit/<lang>.untranslated.json
 *   3. Re-checks identity charter items that translations routinely break:
 *      app_title, splash.word_1..4, monetization_locked (from the generator's
 *      single source of truth MANDATED_COPY), protected terms, percentages.
 *   4. `export-draft` plugs an external draft .ts file (e.g. from another agent)
 *      into the official pipeline as dev-tools/i18n-work/translations/<lang>.json.
 *
 * Verdict thresholds for copied leaves (per source, length ≥ MIN_COPY_LEN):
 *   ≤ 8%  → CLEAN      (baseline of the 10 shipped packs is 3.3–5.7% vs en)
 *   ≤ 25% → WARN       (partially translated — finish the worklist)
 *   > 25% → FAIL       (mostly a source copy — not shippable)
 *
 * Usage:
 *   node dev-tools/audit-i18n-completeness.mjs audit --lang id --file path/to/draft.ts
 *   node dev-tools/audit-i18n-completeness.mjs audit --lang id          (audits src/i18n/id.ts)
 *   node dev-tools/audit-i18n-completeness.mjs audit --lang id,fa,ur    (batch)
 *   node dev-tools/audit-i18n-completeness.mjs export-draft --file draft.ts --lang fa
 *
 * Repository-change-policy note (docs/18): lives inside the approved dev-tools/
 * path; runtime output goes to dev-tools/i18n-work/ (not required by the build).
 */

import ts from 'typescript';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { MANDATED_COPY, PROTECTED_TERMS, placeholdersOf, percentFormPresent } from './i18n-global-generator.mjs';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const I18N_DIR = path.join(REPO_ROOT, 'src', 'i18n');
const WORK_DIR = path.join(REPO_ROOT, 'dev-tools', 'i18n-work');
const AUDIT_DIR = path.join(WORK_DIR, 'audit');

/** Copies at or above this length count as untranslated evidence; shorter
 *  strings (buttons like "OK", brand words) may legitimately coincide. */
const MIN_COPY_LEN = 8;
const CLEAN_MAX_PCT = 8;
const WARN_MAX_PCT = 25;

// ─────────────────────────────────────────────────────────────────────────────
// AST helpers (no eval — mirrors i18n-global-generator.mjs)
// ─────────────────────────────────────────────────────────────────────────────

function parseDefaultObject(file) {
    const src = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.ES2022, true);
    let out = null;
    const walk = (node) => {
        if (out) return;
        if (ts.isVariableStatement(node)) {
            const decl = node.declarationList.declarations[0];
            if (decl?.initializer && ts.isObjectLiteralExpression(decl.initializer)) { out = decl.initializer; return; }
        }
        ts.forEachChild(node, walk);
    };
    walk(src);
    if (!out) throw new Error(`no exported object literal found in ${file}`);
    return { src, obj: out };
}

/** Flat string leaves: key → { value, enValue } (arrays flattened by index). */
function flatStrings(node, src, prefix = '', map = new Map()) {
    for (const prop of node.properties) {
        if (!ts.isPropertyAssignment(prop)) continue;
        const key = prop.name.getText(src).replace(/^['"]|['"]$/g, '');
        const full = prefix ? `${prefix}.${key}` : key;
        const init = prop.initializer;
        if (ts.isObjectLiteralExpression(init)) flatStrings(init, src, full, map);
        else if (ts.isArrayLiteralExpression(init)) {
            init.elements.forEach((el, i) => {
                if (ts.isObjectLiteralExpression(el)) flatStrings(el, src, `${full}.${i}`, map);
                else if (ts.isStringLiteral(el)) map.set(`${full}.${i}`, el.text);
            });
        } else if (ts.isStringLiteral(init)) map.set(full, init.text);
    }
    return map;
}

function flatFromTs(file) {
    const { src, obj } = parseDefaultObject(file);
    return flatStrings(obj, src);
}

// ─────────────────────────────────────────────────────────────────────────────
// Script-aware normalisation (fa/ur legitimately use Arabic-script letters;
// letterform swaps ي↔ی ك↔ک alone do NOT make a string a translation).
// ─────────────────────────────────────────────────────────────────────────────

function normalise(s) {
    return s
        .replace(/[\u064B-\u065F\u0670\u0640]/g, '') // harakat + tatweel
        .replace(/\u064A/g, '\u06CC')                 // ي → ی
        .replace(/\u0643/g, '\u06A9')                 // ك → ک
        .replace(/\u06D2/g, '\u0647')                 // ے → ه (ur)
        .replace(/[\u200C-\u200F\u202A-\u202E]/g, '') // ZWJ/ZWNJ/marks
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

const isProtectedish = (v) =>
    v.length < MIN_COPY_LEN ||
    /^(https?:\/\/|[\w.+-]+@[\w-]+\.)/.test(v) ||
    /^[\d\s%％.,:+\-–—/()]+$/.test(v) ||
    PROTECTED_TERMS.includes(v);

// ─────────────────────────────────────────────────────────────────────────────
// Reference dictionaries (en is the translation source; ar the legacy source
// that fa/ur drafts are routinely copied from)
// ─────────────────────────────────────────────────────────────────────────────

const EN = flatFromTs(path.join(I18N_DIR, 'en.ts'));
let AR = null;
try { AR = flatFromTs(path.join(I18N_DIR, 'ar.ts')); } catch { /* ar optional for audits of non-Arabic-script langs */ }

// ─────────────────────────────────────────────────────────────────────────────
// Audit
// ─────────────────────────────────────────────────────────────────────────────

function auditLanguage(lang, file) {
    const pack = flatFromTs(file);
    const problems = [];
    const untranslated = { vsEn: [], vsAr: [] };

    // 1. key parity
    const missing = [...EN.keys()].filter((k) => !pack.has(k));
    const extra = [...pack.keys()].filter((k) => !EN.has(k));
    if (missing.length) problems.push(`missing ${missing.length} en.ts keys (e.g. ${missing.slice(0, 5).join(', ')})`);
    if (extra.length) problems.push(`${extra.length} keys not in en.ts (e.g. ${extra.slice(0, 5).join(', ')})`);

    // 2. per-leaf checks
    for (const [k, enVal] of EN) {
        const out = pack.get(k);
        if (out === undefined) continue;
        if (!out.trim()) problems.push(`empty value at ${k}`);

        const want = placeholdersOf(enVal);
        const got = placeholdersOf(out);
        if (JSON.stringify(want) !== JSON.stringify(got)) problems.push(`placeholder mismatch at ${k}`);

        for (const term of PROTECTED_TERMS) {
            if (enVal.includes(term) && !out.includes(term)) problems.push(`protected term lost at ${k}: ${term}`);
        }
        for (const pct of ['80', '20', '100']) {
            if (new RegExp(`(?<!\\d)${pct}(?!\\d)\\s*[%％]|[%％]\\s*${pct}(?!\\d)`).test(enVal) && !percentFormPresent(out, pct)) {
                problems.push(`percentage lost at ${k}: ${pct}%`);
            }
        }
        if (/^(\.{3}|…|\[\s*\.\.\.\s*\]|\/\/\s*\.\.\.)$/.test(out.trim())) problems.push(`truncation sentinel at ${k}`);
        if (/\b(TODO|FIXME|XXX)\b/.test(out)) problems.push(`meta marker at ${k}`);

        // untranslated-copy detection (the unique check of this auditor)
        if (!isProtectedish(enVal) && typeof enVal === 'string' && typeof out === 'string') {
            if (normalise(out) === normalise(enVal)) untranslated.vsEn.push(k);
            else if (AR && normalise(out) === normalise(AR.get(k) ?? '\u0000')) untranslated.vsAr.push(k);
        }
    }

    // 3. mandated identity copy
    const mandated = MANDATED_COPY[lang];
    if (mandated) {
        if (pack.get('app_title') !== 'Dueli') problems.push(`app_title must be exactly "Dueli" (got "${pack.get('app_title')}")`);
        mandated.splash.forEach((word, i) => {
            const got = pack.get(`splash.word_${i + 1}`);
            if (got !== word) problems.push(`mandated splash.word_${i + 1} must be exactly "${word}" (got "${got}")`);
        });
        if (pack.get('monetization_locked') !== mandated.monetization_locked) {
            problems.push(`monetization_locked must match MANDATED_COPY (got "${pack.get('monetization_locked')}")`);
        }
    }

    // 4. verdict
    const eligible = [...EN.values()].filter((v) => !isProtectedish(v)).length;
    const copiedPctEn = +((untranslated.vsEn.length / eligible) * 100).toFixed(1);
    const copiedPctAr = AR ? +((untranslated.vsAr.length / eligible) * 100).toFixed(1) : 0;
    const worst = Math.max(copiedPctEn, copiedPctAr);
    const verdict = problems.length || worst > WARN_MAX_PCT ? 'FAIL' : worst > CLEAN_MAX_PCT ? 'WARN' : 'CLEAN';

    // 5. worklist for the repair agent
    fs.mkdirSync(AUDIT_DIR, { recursive: true });
    const worklist = {
        lang,
        file: path.relative(REPO_ROOT, file),
        auditedAt: new Date().toISOString(),
        verdict,
        leaves: pack.size,
        translated: eligible - untranslated.vsEn.length - untranslated.vsAr.length,
        copiedVsEn: untranslated.vsEn.length,
        copiedVsAr: untranslated.vsAr.length,
        copiedPctEn,
        copiedPctAr,
        mustTranslateKeys: [...new Set([...untranslated.vsEn, ...untranslated.vsAr])],
        problems,
    };
    fs.writeFileSync(path.join(AUDIT_DIR, `${lang}.untranslated.json`), JSON.stringify(worklist, null, 1));

    // 6. report
    console.log(`\n═ AUDIT ${lang} (${path.relative(REPO_ROOT, file)}) — verdict: ${verdict}`);
    console.log(`  leaves ${pack.size} · copied vs en ${untranslated.vsEn.length} (${copiedPctEn}%) · copied vs ar ${untranslated.vsAr.length} (${copiedPctAr}%)`);
    console.log(`  worklist: dev-tools/i18n-work/audit/${lang}.untranslated.json (${worklist.mustTranslateKeys.length} keys)`);
    if (problems.length) {
        console.log(`  charter/parity problems: ${problems.length}`);
        for (const p of problems.slice(0, 12)) console.log(`   - ${p}`);
        if (problems.length > 12) console.log(`   ... and ${problems.length - 12} more`);
    }
    return verdict === 'CLEAN';
}

// ─────────────────────────────────────────────────────────────────────────────
// export-draft: plug an external draft into the official pipeline
// ─────────────────────────────────────────────────────────────────────────────

function exportDraft(file, lang) {
    const pack = flatFromTs(file);
    const out = {};
    let missing = 0;
    for (const [k, v] of EN) {
        const got = pack.get(k);
        if (typeof got === 'string') out[k] = got;
        else { out[k] = v; missing++; } // fall back to EN so merge/emit never sees a hole
    }
    fs.mkdirSync(path.join(WORK_DIR, 'translations'), { recursive: true });
    const dest = path.join(WORK_DIR, 'translations', `${lang}.json`);
    fs.writeFileSync(dest, JSON.stringify(out, null, 1));
    console.log(`[export-draft] ${lang}: ${Object.keys(out).length - missing} draft values + ${missing} en-fallbacks → ${path.relative(REPO_ROOT, dest)}`);
    console.log(`[export-draft] NEXT: fix the worklist keys, then merge-less flow: validate --lang ${lang} → audit --lang ${lang} → emit --lang ${lang}`);
    return missing;
}

// ─────────────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
    const args = { _: [] };
    for (let i = 0; i < argv.length; i++) {
        const a = argv[i];
        if (a === '--lang') args.lang = argv[++i];
        else if (a === '--file') args.file = argv[++i];
        else args._.push(a);
    }
    return args;
}

const args = parseArgs(process.argv.slice(2));
const mode = args._[0] ?? 'audit';

if (mode === 'export-draft') {
    if (!args.file || !args.lang) { console.error('export-draft needs --file <draft.ts> --lang <code>'); process.exit(2); }
    exportDraft(args.file, args.lang);
} else if (mode === 'audit') {
    if (!args.lang) { console.error('audit needs --lang <code[,code2]> (and optionally --file <draft.ts>)'); process.exit(2); }
    let allClean = true;
    for (const lang of args.lang.split(',')) {
        const file = args.file ?? path.join(I18N_DIR, `${lang}.ts`);
        if (!fs.existsSync(file)) { console.error(`[audit] ${lang}: file not found: ${file}`); allClean = false; continue; }
        if (!auditLanguage(lang, file)) allClean = false;
    }
    process.exitCode = allClean ? 0 : 1;
} else {
    console.error('Unknown mode. Use: audit | export-draft');
    process.exit(2);
}
