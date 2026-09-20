#!/usr/bin/env node
/**
 * Route Inventory Generator
 * جرد المسارات — يولّد docs/14-ROUTE-INVENTORY.md و dev-tools/route-inventory.json
 *
 * الاستخدام: node dev-tools/route-inventory.mjs
 *
 * المرجع: docs/13-TEST-STRATEGY.md §4 — يبني tests/integration/authz/route-matrix.test.ts
 * من dev-tools/route-inventory.json (لا يُكتب يدوياً).
 *
 * ملاحظة: أُعيد بناء هذا السكربت لأنه كان مُشاراً إليه في docs/14-ROUTE-INVENTORY.md
 * (تاريخ توليد سابق) لكنه لم يُحفظ في dev-tools/ قبل انقطاع جلسة الوكيل السابق.
 * القيم الناتجة هنا قد تختلف بفروق طفيفة عن الجرد السابق — أعد التوليد دائماً
 * من هذا السكربت باعتباره مصدر الحقيقة من الآن.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'src');
const MAIN_TS = path.join(SRC, 'main.ts');

function read(file) {
    return readFileSync(file, 'utf8');
}

// ---- 1. Parse group-level middleware applied in main.ts ----
const mainSrc = read(MAIN_TS);
const groupGuards = [];
const guardLineRe = /app\.use\((['"`])([^'"`]+)\1,\s*([a-zA-Z]+)\(/g;
let m;
while ((m = guardLineRe.exec(mainSrc))) {
    groupGuards.push({ pattern: m[2], middleware: m[3] });
}

// ---- 2. Parse imports to map local identifier -> module file path ----
const importRe = /import\s+(\w+)\s+from\s+['"](\.\/modules\/api\/[^'"]+|\.\/routes\/[^'"]+)['"];/g;
const importMap = new Map();
while ((m = importRe.exec(mainSrc))) {
    importMap.set(m[1], m[2]);
}

// ---- 3. Parse app.route('/prefix', localIdentifier) mounts ----
const mountRe = /app\.route\((['"`])([^'"`]+)\1,\s*(\w+)\)/g;
const mounts = [];
while ((m = mountRe.exec(mainSrc))) {
    const prefix = m[2];
    const ident = m[3];
    const rel = importMap.get(ident);
    if (!rel) continue;
    const file = path.join(SRC, rel.slice(2)) + '.ts';
    mounts.push({ prefix, file });
}

// ---- 4. For each mounted router file, parse its own routes + middleware ----
// 7.A correction: classification is PER-ROUTE (text preceding that route's
// registration), never file-wide. A single authMiddleware({required:true})
// for /offer must not mark /ice-servers or /verify as AUTHENTICATED.
function classifyRoute(fileSrc, routeIndex) {
    const before = fileSrc.slice(0, routeIndex);
    const useRe = /(\w+)\.use\(\s*(['"`])([^'"`]*)\2\s*,\s*authMiddleware\(\s*\{\s*required:\s*(true|false)/g;
    let m;
    let requiredPaths = [];
    let optionalPaths = [];
    while ((m = useRe.exec(before))) {
        const mwPath = m[3];
        const required = m[4] === 'true';
        // Hono .use('/offer', ...) prefixes that path (and sub-paths).
        const prefix = mwPath === '*' || mwPath === '/*' ? '' : mwPath;
        (required ? requiredPaths : optionalPaths).push(prefix);
    }
    // Also honor router-wide guards (.use('*') / .use('/*')).
    const hasRequiredAuth = (subPath) =>
        requiredPaths.some((p) => p === '' || subPath === p || subPath.startsWith(p + '/'));
    const hasOptionalAuth = (subPath) =>
        optionalPaths.some((p) => p === '' || subPath === p || subPath.startsWith(p + '/'));
    // Per-route inline guard: router.post('/x', authMiddleware({required:true}), ...)
    const inlineRe = (subPath) => new RegExp(
        `\\.\\s*(get|post|put|delete|patch)\\s*\\(\\s*['"\`]${subPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}['"\`]\\s*,\\s*authMiddleware\\(\\s*\\{\\s*required:\\s*true`
    );
    return { hasRequiredAuth, hasOptionalAuth, inlineRe };
}

function classify(fileSrc, subPath, routeIndex) {
    const per = classifyRoute(fileSrc, routeIndex);
    const inlineGuarded = per.inlineRe(subPath).test(fileSrc);
    if (inlineGuarded || per.hasRequiredAuth(subPath)) return 'AUTHENTICATED';
    if (per.hasOptionalAuth(subPath)) return 'PUBLIC(auth-optional, in-handler check required)';
    const hasOriginOnly = /Origin['"]\)/.test(fileSrc);
    if (hasOriginOnly) return 'SERVICE(origin-only ⚠)';
    return 'UNGUARDED ⚠';
}

function guardsFor(fileSrc, subPath, routeIndex) {
    const per = classifyRoute(fileSrc, routeIndex);
    const guards = [];
    if (per.inlineRe(subPath).test(fileSrc) || per.hasRequiredAuth(subPath)) guards.push('router:auth');
    else if (per.hasOptionalAuth(subPath)) guards.push('router:auth-optional');
    guards.push('group:rateLimit', 'group:csrf');
    return guards.join(', ');
}

const routes = [];
const seenFiles = new Map();

for (const mount of mounts) {
    if (!existsSync(mount.file)) continue;
    const fileSrc = seenFiles.has(mount.file) ? seenFiles.get(mount.file) : read(mount.file);
    seenFiles.set(mount.file, fileSrc);

    const routerVarMatch = fileSrc.match(/const\s+(\w+)\s*=\s*new Hono/);
    const routerVar = routerVarMatch ? routerVarMatch[1] : null;
    if (!routerVar) continue;

    const routeRe = new RegExp(`${routerVar}\\.(get|post|put|delete|patch)\\((['"\`])([^'"\`]*)\\2`, 'g');
    let rm;
    while ((rm = routeRe.exec(fileSrc))) {
        const method = rm[1].toUpperCase();
        let subPath = rm[3];
        if (subPath === '/') subPath = '';
        const fullPath = (mount.prefix + subPath).replace(/\/\/+/g, '/') || '/';
        routes.push({
            method,
            path: fullPath,
            classification: classify(fileSrc, subPath, rm.index),
            guards: guardsFor(fileSrc, subPath, rm.index),
            file: path.relative(ROOT, mount.file).replace(/\\/g, '/'),
        });
    }
}

// De-dup + sort
const uniq = new Map();
for (const r of routes) {
    uniq.set(`${r.method} ${r.path}`, r);
}
const finalRoutes = [...uniq.values()].sort((a, b) =>
    a.path === b.path ? a.method.localeCompare(b.method) : a.path.localeCompare(b.path)
);

const counts = finalRoutes.reduce((acc, r) => {
    acc[r.classification] = (acc[r.classification] || 0) + 1;
    return acc;
}, {});

// ---- 5. Write JSON (consumed by tests/integration/authz/route-matrix.test.ts) ----
const jsonOut = {
    generatedAt: new Date().toISOString(),
    total: finalRoutes.length,
    routes: finalRoutes,
};
writeFileSync(path.join(__dirname, 'route-inventory.json'), JSON.stringify(jsonOut, null, 2));

// ---- 6. Write markdown doc ----
let md = `# جرد مسارات API — مولَّد آلياً\n\n`;
md += `> **لا تحرّر هذا الملف يدوياً.** أعد توليده: \`node dev-tools/route-inventory.mjs\`\n`;
md += `> تاريخ التوليد: ${jsonOut.generatedAt}\n\n`;
md += `## الإجمالي: ${finalRoutes.length} مسار\n\n`;
md += `| التصنيف | العدد |\n|---|---|\n`;
for (const [cls, count] of Object.entries(counts)) {
    md += `| ${cls} | ${count} |\n`;
}
md += `\n## الحماية على مستوى المجموعات (main.ts)\n\n`;
md += `| النمط | الوسيط |\n|---|---|\n`;
for (const g of groupGuards) {
    md += `| \`${g.pattern}\` | \`${g.middleware}(\` |\n`;
}
md += `\n## المسارات\n\n`;
md += `| Method | Path | التصنيف | الحواجز | الملف |\n|---|---|---|---|---|\n`;
for (const r of finalRoutes) {
    md += `| ${r.method} | \`${r.path}\` | ${r.classification} | ${r.guards} | \`${r.file}\` |\n`;
}
md += `\n> **تنبيه:** التصنيف يعتمد فحص \`authMiddleware\` داخل ملف الراوتر المباشر فقط\n`;
md += `> (لا يتتبّع طبقات وسيطة إضافية). راوتر بلا \`authMiddleware\` يُصنَّف \`UNGUARDED ⚠\`\n`;
md += `> حتى لو كان عاماً عن قصد — راجع \`docs/12-SECURITY-REMEDIATION.md\` (SEC-13)\n`;
md += `> قبل اعتبار أي علامة ⚠ ثغرة فعلية.\n`;

writeFileSync(path.join(ROOT, 'docs', '14-ROUTE-INVENTORY.md'), md, 'utf8');

console.log(`Generated ${finalRoutes.length} route(s) -> docs/14-ROUTE-INVENTORY.md + dev-tools/route-inventory.json`);
for (const [cls, count] of Object.entries(counts)) {
    console.log(`  ${cls}: ${count}`);
}
