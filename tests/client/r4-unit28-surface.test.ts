/**
 * UNIT28 acceptance follow-up — A28-SURFACE.
 *
 * Behavioral tests against the REAL `applyCompetitionState` body extracted
 * from the emitted competition page. Dependencies are stubbed so the exact
 * transition ordering and failure behavior are observable:
 *   applyCompetitionState → cleanup → terminal teardown → render.
 *
 * The owner-reported defect is a completed decision that never becomes a
 * surface. The brittle shape: state was assigned to `completed` BEFORE
 * cleanup/render, so any cleanup exception skipped render forever (later
 * duplicate completed events saw prev=completed and did nothing).
 *
 * Contract pinned here:
 *  - a cleanup/teardown exception NEVER blocks the completed surface;
 *  - a failed render is retryable by the next completed event/resync;
 *  - a successful completed render stays idempotent (no double render);
 *  - viewer and competitor both reach the embedded surface;
 *  - non-completed transitions keep their existing behavior.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resolveVideoSurface } from '../../src/client/helpers/CompetitionSurface';

const PAGE = readFileSync(resolve(__dirname, '../../src/modules/pages/competition-page.ts'), 'utf-8');

function between(src: string, start: string, end: string): string {
    const a = src.indexOf(start);
    expect(a, `marker exists: ${start}`).toBeGreaterThanOrEqual(0);
    const b = src.indexOf(end, a + start.length);
    expect(b, `marker after ${start}: ${end}`).toBeGreaterThanOrEqual(0);
    return src.slice(a, b);
}

type HarnessOptions = {
    userId?: number | null;
    competitorStarted?: boolean;
    closeThrows?: boolean;
    teardownThrows?: boolean;
    renderThrows?: boolean;
};

function loadApply(opts: HarnessOptions = {}) {
    const src = between(PAGE, 'function applyCompetitionState(next)', 'async function syncCompetitionFromServer');
    const calls: string[] = [];
    const rendered: any[] = [];
    let comp: any = {
        id: 2242, status: 'live', creator_id: 1, opponent_id: 2,
        stream_status: 'live', creator_name: 'A', opponent_name: 'B',
    };
    const windowMock: any = {
        currentUser: opts.userId === null ? null : { id: opts.userId ?? 1 },
        resolveVideoSurface,
    };
    const factory = new Function(
        'window', 'closeRatingUi', 'beginTerminalTeardown', 'renderCompetition',
        'paintCompetitionChrome', 'paintCompetitionTimer', 'initCompetitionDynamics',
        'checkAndInitStream', 'maybeStartRecording', 'log',
        // R4-CHUNK-DOWNLOAD-1: applyCompetitionState refreshes the independent
        // download affordance after painting; it is not part of A28's contract.
        'refreshEmbeddedDownloadButton',
        'initialComp', 'initialCompetitorStarted',
        `
        let competitionData = initialComp;
        let competitorStarted = initialCompetitorStarted;
        let completedSurfaceKey = null;
        ${src}
        return {
            apply: applyCompetitionState,
            getComp: function() { return competitionData; },
            getKey: function() { return completedSurfaceKey; }
        };
        `,
    );
    const api = factory(
        windowMock,
        () => {
            calls.push('cleanup');
            if (opts.closeThrows) throw new Error('rating DOM cleanup failed');
        },
        () => {
            calls.push('teardown');
            if (opts.teardownThrows) throw new Error('device release failed');
        },
        (c: any) => {
            calls.push('render');
            rendered.push(c);
            if (opts.renderThrows && rendered.length === 1) throw new Error('avatar renderer unavailable');
        },
        () => { calls.push('chrome'); },
        () => { calls.push('timer'); },
        () => { calls.push('dynamics'); throw new Error('realtime hook failed'); },
        () => { calls.push('stream'); },
        () => { calls.push('maybeRecord'); },
        () => { calls.push('log'); },
        () => { calls.push('downloadRefresh'); },
        comp,
        opts.competitorStarted === true,
    );
    return {
        api, calls, rendered, windowMock,
        setComp(c: any) { comp = c; },
    };
}

describe('A28-SURFACE — completed decision reaches a truthful surface', () => {
    it('1. healthy competitor end: cleanup + teardown run, then the embedded surface renders', () => {
        const h = loadApply({ userId: 1 });
        expect(() => h.api.apply({ status: 'completed', ended_at: '2026-10-21 10:00:00' })).not.toThrow();
        expect(h.calls.indexOf('cleanup')).toBeLessThan(h.calls.indexOf('teardown'));
        expect(h.calls.indexOf('teardown')).toBeLessThan(h.calls.indexOf('render'));
        expect(h.rendered).toHaveLength(1);
        expect(h.rendered[0].status).toBe('completed');
        expect(h.api.getComp().status).toBe('completed');
        expect(h.windowMock.resolveVideoSurface(h.api.getComp(), 1)).toBe('embedded');
    });

    it('2. a throwing terminal teardown cannot block the completed VOD surface', () => {
        const h = loadApply({ userId: 1, teardownThrows: true });
        expect(() => h.api.apply({ status: 'completed' })).not.toThrow();
        expect(h.rendered).toHaveLength(1);
        expect(h.rendered[0].status).toBe('completed');
        expect(h.api.getComp().status).toBe('completed');
    });

    it('3. a throwing rating cleanup cannot block the completed VOD surface', () => {
        const h = loadApply({ userId: 3, closeThrows: true });
        expect(() => h.api.apply({ status: 'completed' })).not.toThrow();
        expect(h.rendered).toHaveLength(1);
        expect(h.rendered[0].status).toBe('completed');
    });

    it('4. a failed render is retried by the next completed event (state is not left stranded)', () => {
        const h = loadApply({ userId: 1, renderThrows: true });
        expect(() => h.api.apply({ status: 'completed' })).not.toThrow();
        expect(h.rendered).toHaveLength(1); // first render failed
        expect(h.api.getKey()).toBeNull();
        // The duplicate SSE event / GET resync must retry the surface.
        expect(() => h.api.apply({ status: 'completed' })).not.toThrow();
        expect(h.rendered).toHaveLength(2);
        expect(h.rendered[1].status).toBe('completed');
        expect(h.api.getKey()).not.toBeNull();
    });

    it('5. a successful completed render is idempotent (no double render on duplicate events)', () => {
        const h = loadApply({ userId: 1 });
        h.api.apply({ status: 'completed' });
        h.api.apply({ status: 'completed' });
        h.api.apply({ status: 'completed', ended_at: '2026-10-21 10:00:00' });
        expect(h.rendered).toHaveLength(1);
    });

    it('6. a viewer (non-participant) reaches the same embedded surface with no teardown', () => {
        const h = loadApply({ userId: 99 });
        h.api.apply({ status: 'completed' });
        expect(h.calls).not.toContain('teardown');
        expect(h.rendered).toHaveLength(1);
        expect(h.rendered[0].status).toBe('completed');
    });

    it('7. live → completed with a broken dynamics hook still leaves the surface painted', () => {
        const h = loadApply({ userId: 1 });
        // initCompetitionDynamics is stubbed to throw; it must not undo or
        // block the already-painted surface.
        expect(() => h.api.apply({ status: 'completed' })).not.toThrow();
        expect(h.rendered).toHaveLength(1);
        expect(h.calls).toContain('dynamics');
    });
});
