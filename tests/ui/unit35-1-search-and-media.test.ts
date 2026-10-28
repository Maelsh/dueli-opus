/**
 * UNIT35.1 — explore live search, home unknown subtitle, eye/PiP regression strings.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(process.cwd(), 'src');

function read(rel: string): string {
    return readFileSync(join(ROOT, rel), 'utf8');
}

describe('UNIT35.1 home search subtitle', () => {
    it('does not hard-code Unknown when creator metadata is missing', () => {
        const home = read('client/pages/HomePage.ts');
        expect(home).not.toContain("'Unknown'");
        expect(home).toContain('creator_display_name');
        expect(home).toContain('creator_username');
    });
});

describe('UNIT35.1 explore live search', () => {
    it('debounces input and prevents full form submit-only reload', () => {
        const explore = read('modules/pages/explore-page.ts');
        expect(explore).toContain('runExploreLiveSearch');
        expect(explore).toContain('exploreSearchForm');
        expect(explore).toContain('ev.preventDefault()');
        expect(explore).toContain('exploreSearchDebounce');
        expect(explore).toContain('exploreFetchGen');
        expect(explore).toContain('history.replaceState');
    });
});

describe('UNIT35.1 eye vs camera independence', () => {
    it('competition page limits eye toggle to remote PiP layout', () => {
        const page = read('modules/pages/competition-page.ts');
        expect(page).toContain("competitorVideoLayout === 'remote'");
        expect(page).toContain('localBtn.disabled = !pipActive');
        const toggle = page.slice(
            page.indexOf('window.toggleLocalVideo = function()'),
            page.indexOf('window.switchCamera = async function()')
        );
        expect(toggle).not.toContain('.stop(');
    });

    it('live shared hide-local does not resize main stage when PiP inactive', () => {
        const shared = read('modules/pages/live/scripts/client/shared.ts');
        const fn = shared.slice(
            shared.indexOf('window.toggleLocalVideoVisibility = function()'),
            shared.indexOf('// ===== Shared State Variables =====')
        );
        expect(fn).toContain('pipLaneActive');
        expect(fn).not.toContain("remoteWrapper.classList.add('w-full', 'md:w-[80%]')");
    });
});

describe('UNIT35.1 VOD chunk handoff hygiene', () => {
    it('pauses and clears onended before swapping chunk src', () => {
        const shared = read('modules/pages/live/scripts/client/shared.ts');
        const fn = shared.slice(
            shared.indexOf('async loadAndPlayChunk(index, globalSeekTime)'),
            shared.indexOf('async _loadChunk(index)')
        );
        expect(fn).toContain('this.videoElement.pause()');
        expect(fn).toContain('this.videoElement.onended = null');
    });
});
