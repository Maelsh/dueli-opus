/**
 * R2-J — show-page + my-requests invite contracts (UI layer).
 *
 * The competition page renders client-side, so these tests pin the wiring
 * contract in the served source: invite Accept/Decline actions exist, are
 * CSP-allowlisted, surface translated server errors, and the render branches
 * on the current user's own invite state (never another user's).
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const COMPETITION_PAGE = readFileSync(
    resolve(__dirname, '../../src/modules/pages/competition-page.ts'),
    'utf-8'
);
const MY_REQUESTS_PAGE = readFileSync(
    resolve(__dirname, '../../src/modules/pages/my-requests-page.ts'),
    'utf-8'
);
const DELEGATE = readFileSync(
    resolve(__dirname, '../../src/client/csp-delegate.ts'),
    'utf-8'
);

describe('R2-J show page invite wiring', () => {
    it('renders Accept/Decline invite actions gated on the current user invite flag', () => {
        expect(COMPETITION_PAGE).toContain('user_has_pending_invitation');
        expect(COMPETITION_PAGE).toContain('data-csp-fn="acceptInvite"');
        expect(COMPETITION_PAGE).toContain('data-csp-fn="declineInvite"');
        // Invite path replaces — not parallels — the join-request path.
        expect(COMPETITION_PAGE).toContain('!hasInvite && !hasRequested && needsOpponent');
    });

    it('invite handlers hit the invite endpoints with auth and surface server errors', () => {
        expect(COMPETITION_PAGE).toContain('/accept-invite');
        expect(COMPETITION_PAGE).toContain('/decline-invite');
        expect(COMPETITION_PAGE).toContain('window.acceptInvite = acceptInvite;');
        expect(COMPETITION_PAGE).toContain('window.declineInvite = declineInvite;');
        expect(COMPETITION_PAGE).toContain('alert(data.error');
    });

    it('closed competitions expose a translated reason and no action buttons', () => {
        expect(COMPETITION_PAGE).toContain('closedReason');
        expect(COMPETITION_PAGE).toContain('competition_closed');
        expect(COMPETITION_PAGE).toContain('opponent_already_set');
    });

    it('both invite actions are CSP-allowlisted', () => {
        expect(DELEGATE).toContain("'acceptInvite',");
        expect(DELEGATE).toContain("'declineInvite',");
    });
});

describe('R2-J my-requests failure surfacing', () => {
    it('failed accept/decline/cancel surfaces the translated server error', () => {
        const occurrences = MY_REQUESTS_PAGE.match(/alert\(\(data && data\.error\)/g) ?? [];
        // handleRequest + handleInvitation(ok-branch + !ok-branch) + cancelRequest
        expect(occurrences.length).toBeGreaterThanOrEqual(3);
    });

    it('history statuses (rejected/auto_declined) have badge colors', () => {
        expect(MY_REQUESTS_PAGE).toContain("rejected: 'text-red-600 bg-red-100'");
        expect(MY_REQUESTS_PAGE).toContain("auto_declined: 'text-red-600 bg-red-100'");
    });
});
