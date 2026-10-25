/**
 * UNIT30.4 — tower buttons visual contract on the BUILT stylesheet.
 *
 * The 24-10 owner addendum (15§15.7): before a real publish the Start/publish
 * tower is visible and End is hidden; after a real publish Start is hidden and
 * End is visible. The compiler (`npm run build:css` → public/static/styles.css,
 * which is what production serves) must therefore honour `hidden` on
 * `.live-tool` buttons.
 *
 * Why a resolver instead of a source-contract check: the production defect was
 * a cascade-layer inversion — Tailwind v4 imports `.hidden` inside
 * `@layer utilities`, while the custom `.live-tool { display: inline-flex }`
 * rule is UNLAYERED. Per CSS Cascade Layers, unlayered author styles beat any
 * layer at normal importance, so a `hidden` tool stayed rendered (computed
 * display flex on production, proven with a real-browser probe). A text check
 * cannot see that; this suite executes the layer decision on the actual
 * built sheet.
 *
 * Scope (fail-loud by design, not a general CSS engine): single sheet, author
 * origin, `display` property only, class-only rightmost compounds. If a rule
 * this resolver cannot faithfully interpret rivals `display` for the tower
 * buttons (media/supports/container/ancestor-scoped selector), the suite
 * THROWS instead of silently passing — extend the resolver in that case.
 *
 * Note: the condition name below is split ('@' + 'container') so this file
 * stays inert to Tailwind's automatic content extraction — a literal token
 * would mint a stray `.\@container` utility into the built stylesheet.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveCompetitorButtons } from '../../src/client/helpers/CompetitionSurface';

const ROOT = join(__dirname, '..', '..');
const BUILT_CSS = join(ROOT, 'public', 'static', 'styles.css');

interface Decl { prop: string; value: string; important: boolean }
interface SheetRule { sel: string; decls: Decl[]; layer: string | null; order: number; enclosed: string | null }

function decls(body: string): Decl[] {
    const out: Decl[] = [];
    for (const part of body.split(';')) {
        const m = part.match(/^\s*([-a-zA-Z]+)\s*:\s*(.*?)\s*(!\s*important)?\s*$/s);
        if (m) out.push({ prop: m[1].toLowerCase(), value: m[2].trim(), important: Boolean(m[3]) });
    }
    return out;
}

/**
 * Parses the compiled sheet top level only: layer orders, layer blocks,
 * media/supports/container envelopes, style rules. `@...` blocks that can
 * never contain display rules for our buttons (keyframes, fonts, property
 * registry) are skipped wholesale.
 */
function parseSheet(source: string): { rules: SheetRule[]; layerOrder: string[] } {
    const css = source.replace(/\/\*[\s\S]*?\*\//g, ' ');
    const layerOrder: string[] = [];
    const rules: SheetRule[] = [];
    const contexts: Array<{ kind: string; layer: string | null }> = [];
    let order = 0;

    const register = (names: string[]) => {
        for (const raw of names) {
            const name = raw.trim().replace(/["']/g, '');
            if (name && !layerOrder.includes(name)) layerOrder.push(name);
        }
    };

    let i = 0;
    while (i < css.length) {
        if (css[i] === '}') { contexts.pop(); i += 1; continue; }
        const brace = css.indexOf('{', i);
        const semi = css.indexOf(';', i);
        const close = css.indexOf('}', i);
        const stop = [brace, semi, close].filter(n => n >= 0).sort((a, b) => a - b)[0];
        if (stop === undefined) break;
        const head = css.slice(i, stop).trim();

        if (css[stop] === '}') {
            // Whitespace-only head before an envelope-closing brace: the style
            // rule body scans above never consume the parent '}', so any stop
            // at '}' closes the innermost envelope (e.g. "@layer theme { … }").
            contexts.pop();
            i = stop + 1;
            continue;
        }
        if (stop === semi) {
            if (head.startsWith('@layer')) register(head.slice('@layer'.length).split(','));
            i = semi + 1;
            continue;
        }
        if (head.startsWith('@')) {
            const at = head.replace(/\s*\{.*$/, '').trim();
            if (head.startsWith('@layer')) {
                const name = head.slice('@layer'.length).replace(/\{+$/, '').trim();
                register(name.split(','));
                contexts.push({ kind: '@layer', layer: name || null });
            } else if (['@media', '@supports', '@' + 'container'].includes(at)) {
                contexts.push({ kind: at, layer: contexts.at(-1)?.layer ?? null });
            } else {
                // @property, @font-face, @keyframes, @scope … — skip balanced.
                let depth = 1;
                let j = stop + 1;
                while (j < css.length && depth > 0) {
                    if (css[j] === '{') depth += 1;
                    else if (css[j] === '}') depth -= 1;
                    j += 1;
                }
                i = j;
                continue;
            }
            i = stop + 1;
            continue;
        }
        // Style rule.
        const layer = contexts.at(-1)?.layer ?? null;
        const enclosed = contexts.map(c => c.kind).find(k => k !== '@layer') ?? null;
        let depth = 1;
        let j = stop + 1;
        while (j < css.length && depth > 0) {
            if (css[j] === '{') depth += 1;
            else if (css[j] === '}') depth -= 1;
            j += 1;
        }
        rules.push({ sel: head, decls: decls(css.slice(stop + 1, j - 1)), layer, order: order++, enclosed });
        i = j;
    }
    return { rules, layerOrder };
}

interface Compound { tag: string | null; classes: string[]; pseudos: string[]; unsupported: boolean }

/** Parses ONLY the rightmost compound, with ancestor markers detected. */
function parseSelector(sel: string): { compound: Compound; hasAncestor: boolean } | null {
    const parts = sel.split(/\s+/).filter(Boolean);
    let hasAncestor = false;
    let rightmost = parts[parts.length - 1] ?? '';
    if (parts.some(p => ['>', '+', '~'].includes(p))) {
        hasAncestor = true;
        const at = parts.map((p, k) => (['>', '+', '~'].includes(p) ? k : -1)).filter(k => k >= 0).at(-1);
        if (at === undefined) return null;
        rightmost = parts.slice(at + 1).join(' ');
    }
    const compound: Compound = { tag: null, classes: [], pseudos: [], unsupported: false };
    if (!rightmost.startsWith('.') && !/^[a-zA-Z\-*]/.test(rightmost)) return null;
    for (const m of rightmost.matchAll(/(\*|[a-zA-Z][\w-]*|[.#][\w-]+|::[\w-]+|:[\w-]+)/g)) {
        const t = m[1];
        if (t.startsWith('.')) compound.classes.push(t.slice(1));
        else if (t.startsWith('::')) compound.unsupported = true;
        else if (t.startsWith(':')) compound.pseudos.push(t);
        else if (t === '*') continue;
        else compound.tag = t.toLowerCase();
    }
    if (/[[\]]/.test(rightmost)) compound.unsupported = true;
    // A selector grouping other elements (",") never shares our buttons' fate:
    // Tailwind emits display utilities as single-selector rules; treat grouped
    // selectors as unsupported so they fail loud instead of silently passing.
    if (sel.includes(',')) compound.unsupported = true;
    return { compound, hasAncestor };
}

function cascade(sheet: { rules: SheetRule[]; layerOrder: string[] }, q: readonly string[], tag = 'button'):
        { display: string; important: boolean; layer: string | null; selector: string } {
    const collect = (rule: SheetRule) => {
        const parsed = parseSelector(rule.sel);
        if (!parsed) {
            if (rule.decls.some(d => d.prop === 'display') && /\.(live-tool|hidden)/.test(rule.sel)) {
                throw new Error(`uninterpretable rival selector for tower buttons: ${rule.sel}`);
            }
            return null;
        }
        const { compound, hasAncestor } = parsed;
        const matches = compound.tag === null || compound.tag === '*' || compound.tag === tag;
        if (!matches || compound.unsupported) {
            if (rule.decls.some(d => d.prop === 'display') && /\.(live-tool|hidden)/.test(rule.sel)) {
                throw new Error(`uninterpretable rival selector for tower buttons: ${rule.sel}`);
            }
            return null;
        }
        if (compound.pseudos.length > 0) return null; // static paint contract only
        if (hasAncestor) {
            if (rule.decls.some(d => d.prop === 'display') && compound.classes.every(c => q.includes(c))) {
                throw new Error(`ancestor-scoped display rule for tower buttons detected: ${rule.sel}`);
            }
            return null;
        }
        if (!compound.classes.every(c => q.includes(c))) return null;
        return rule;
    };

    const candidates: Array<{ rule: SheetRule; decl: Decl }> = [];
    for (const rule of sheet.rules) {
        if (rule.enclosed) {
            if (collect(rule) && rule.decls.some(d => d.prop === 'display')) {
                throw new Error(`display rule for tower buttons inside ${rule.enclosed}/${rule.layer ?? 'no layer'} — resolver cannot resolve this faithfully, extend parseSheet/cascade: ${rule.sel}`);
            }
            continue;
        }
        const picked = collect(rule);
        if (picked) for (const d of picked.decls.filter(d => d.prop === 'display')) candidates.push({ rule, decl: d });
    }
    expect(candidates.length > 0, `no display candidate matches class set [${q.join(' ')}] in the built stylesheet`).toBe(true);

    const prio = (layer: string | null, important: boolean): number => {
        if (layer === null) return important ? Number.NEGATIVE_INFINITY : Number.POSITIVE_INFINITY;
        const idx = sheet.layerOrder.indexOf(layer);
        expect(idx >= 0, `unknown layer ${layer}`).toBe(true);
        return important ? -idx : idx;
    };
    const spec = (sel: string): number[] => {
        const compound = parseSelector(sel);
        const c = compound?.compound;
        const ids = (sel.match(/#[\w-]+/g) ?? []).length;
        const classes = c ? c.classes.length : (sel.match(/\.[\w-]+/g) ?? []).length;
        const tags = c?.tag ? 1 : 0;
        return [ids, classes, tags];
    };
    const best = (important: boolean) => {
        const pool = candidates.filter(x => x.decl.important === important);
        if (pool.length === 0) return null;
        return pool.reduce((acc, cur) => {
            const ka = [prio(acc.rule.layer, important), ...spec(acc.rule.sel), acc.rule.order];
            const kb = [prio(cur.rule.layer, important), ...spec(cur.rule.sel), cur.rule.order];
            const cmp = (kb[0] > ka[0]) - (kb[0] < ka[0])
                || (kb[1] > ka[1]) - (kb[1] < ka[1])
                || (kb[2] > ka[2]) - (kb[2] < ka[2])
                || (kb[3] > ka[3]) - (kb[3] < ka[3]);
            return cmp > 0 ? cur : acc;
        });
    };
    const winner = best(true) ?? best(false) as { rule: SheetRule; decl: Decl };
    return {
        display: winner.decl.value,
        important: winner.decl.important,
        layer: winner.rule.layer,
        selector: winner.rule.sel,
    };
}

const built = (): { rules: SheetRule[]; layerOrder: string[] } => {
    let source: string;
    try {
        source = readFileSync(BUILT_CSS, 'utf8');
    } catch {
        throw new Error('public/static/styles.css is missing — run `npm run build:css` (the built sheet is what production serves)');
    }
    expect(source.includes('tailwindcss v4'), 'public/static/styles.css does not look like the built tailwind stylesheet — run `npm run build:css`, do not hand-edit').toBe(true);
    return parseSheet(source);
};

const START_CLASSES_PRE = ['live-tool', 'bg-purple-600'] as const;
const START_CLASSES_PUBLISHED = ['live-tool', 'bg-purple-600', 'hidden'] as const;
const END_CLASSES_PRE = ['live-tool', 'bg-red-600', 'hidden'] as const;
const END_CLASSES_PUBLISHED = ['live-tool', 'bg-red-600'] as const;

describe('UNIT30.4 §15.7 — tower buttons computed on the built stylesheet', () => {
    it('has a built stylesheet (run `npm run build:css`; CI builds before tests)', () => {
        const { layerOrder } = built();
        for (const layer of ['theme', 'base', 'components', 'utilities']) {
            expect(layerOrder).toContain(layer);
        }
    });

    it('declares `.hidden` as display:none inside a cascade layer (the hostile premise)', () => {
        const { rules, layerOrder } = built();
        const hidden = rules.filter(r => r.sel === '.hidden' && r.decls.some(d => d.prop === 'display'));
        expect(hidden.length).toBeGreaterThanOrEqual(1);
        for (const rule of hidden) {
            expect(rule.layer, '.hidden must live inside a layer for this contract to matter').not.toBeNull();
            expect(rule.decls.filter(d => d.prop === 'display').map(d => d.value)).toContain('none');
        }
        // utilities is declared after base/components → layered utilities wins
        // fights among layers, but never beats an unlayered declaration.
        expect(layerOrder.indexOf('utilities')).toBeGreaterThan(layerOrder.indexOf('base'));
    });
});

describe('UNIT30.4 — pre-publish paint (Start visible, End hidden)', () => {
    const svg = built();

    it('Start tower stays visually alive with its palette', () => {
        expect(cascade(svg, START_CLASSES_PRE)).toMatchObject({ display: 'inline-flex', layer: null });
    });

    it('End button with the `hidden` class is display:none', () => {
        expect(cascade(svg, END_CLASSES_PRE)).toMatchObject({ display: 'none' });
    });
});

describe('UNIT30.4 — publishing/after-publish paint (Start hidden, End visible)', () => {
    const svg = built();

    it('BUG GUARD: a `.live-tool` button carrying `hidden` resolves to display:none', () => {
        const winner = cascade(svg, START_CLASSES_PUBLISHED);
        // Pre-fix the unlayered palette rule beat the layered `.hidden`
        // utility: the winner came back `inline-flex` and the Start tower
        // stayed rendered beside End (production defect).
        expect(winner.display).toBe('none');
    });

    it('End button is visually alive once published', () => {
        expect(cascade(svg, END_CLASSES_PUBLISHED)).toMatchObject({ display: 'inline-flex' });
    });

    it('the mirror case hides the plain run-of-the-mill `hidden` element', () => {
        expect(cascade(svg, ['hidden'])).toMatchObject({ display: 'none' });
    });
});

describe('UNIT30.4 — state matrix × built CSS: exactly one visually enabled action', () => {
    const svg = built();

    // Same matrix as tests/ui/unit30-4-controls-fullscreen.test.ts A-01:
    // decision machine output on the left, built-cascade resolution on the
    // right, so a paint bug of any kind (state OR css) is caught here.
    const states: Array<[string, Parameters<typeof resolveCompetitorButtons>[0]]> = [
        ['accepted idle', { status: 'accepted', role: 'host', mediaPublished: false, startInFlight: false, publishInFlight: false, endInFlight: false, endUnknown: false }],
        ['live not published', { status: 'live', role: 'host', mediaPublished: false, startInFlight: false, publishInFlight: false, endInFlight: false, endUnknown: false }],
        ['live after real publish', { status: 'live', role: 'host', mediaPublished: true, startInFlight: false, publishInFlight: false, endInFlight: false, endUnknown: false }],
        ['live publishing in flight', { status: 'live', role: 'host', mediaPublished: false, publishInFlight: true, startInFlight: false, endInFlight: false, endUnknown: false }],
        ['live ending in flight', { status: 'live', role: 'host', mediaPublished: true, endInFlight: true, startInFlight: false, publishInFlight: false, endUnknown: false }],
        ['live end unknown', { status: 'live', role: 'host', mediaPublished: true, endUnknown: true, startInFlight: false, publishInFlight: false, endInFlight: false }],
        ['completed', { status: 'completed', role: 'host', mediaPublished: true, startInFlight: false, publishInFlight: false, endInFlight: false, endUnknown: false }],
        ['viewer on live', { status: 'live', role: 'viewer', mediaPublished: true, startInFlight: false, publishInFlight: false, endInFlight: false, endUnknown: false }],
    ];

    it('never renders both actions; whatever the machine hides stays hidden', () => {
        for (const [name, state] of states) {
            const decision = resolveCompetitorButtons(state);
            const startHidden = decision.start === 'hidden';
            const endHidden = decision.end === 'hidden';
            const startDisplay = cascade(svg, startHidden ? START_CLASSES_PUBLISHED : START_CLASSES_PRE).display;
            const endDisplay = cascade(svg, endHidden ? END_CLASSES_PRE : END_CLASSES_PUBLISHED).display;
            expect(startDisplay, `${name}: start tower computed display`).toBe(startHidden ? 'none' : 'inline-flex');
            expect(endDisplay, `${name}: End button computed display`).toBe(endHidden ? 'none' : 'inline-flex');
            expect(startDisplay === 'none' || endDisplay === 'none', `${name}: both actions visible in computed CSS`).toBe(true);
        }
    });

    it('competitor-only states surface the documented progress instead of the pair', () => {
        expect(resolveCompetitorButtons({
            status: 'live', role: 'opponent', mediaPublished: false, startInFlight: false,
            publishInFlight: false, endInFlight: false, endUnknown: false,
        })).toMatchObject({ start: 'visible', end: 'hidden', progress: null });
    });
});
