## B5-1 — Competition state transition guards

**User outcome (one sentence):** Competitions can only go `accepted → live → completed`, with clear 409 errors and a safe idempotent re-end — enforced in the model, not just the controller.

### Files changed and why
- `src/models/CompetitionModel.ts` — `startLive()` now `UPDATE ... WHERE id=? AND status='accepted'`; `complete()` now `... AND status='live'`; both return `boolean` from `meta.changes` (authoritative on real D1), with a before/after-state fallback because local Wrangler CLI omits `meta` on writes (discovered + proven by the real-D1 test).
- `src/controllers/CompetitionController.ts` — `start()`: after ownership check, `status!=='accepted'` → 409 `competition_errors.not_eligible_to_start`; missing opponent → 409 `competition_errors.no_opponent` (i18n, replaces hardcoded English string); `startLive()===false` (race) → same 409. `end()`: `completed` → success `{already_completed:true}` (unchanged); `!==live` → 409 `competition_errors.not_live`; `complete()===false` (race) → idempotent success, `finalize_payouts` is NOT scheduled twice.
- `src/i18n/ar.ts`, `src/i18n/en.ts` — added `competition_errors.not_eligible_to_start / no_opponent / not_live / already_completed` with the exact ar/en strings from the task.
- `tests/integration/competition-state-guards.test.ts` (new, 7 tests) — real `CompetitionModel` + real local D1 via Wrangler CLI (no mocks of SQL/model logic). Covers all 6 required behaviors + controller source contract.
- `tests/api/competition-state-guards-i18n.test.ts` (new, 3 tests) — exact ar/en strings via `t()`.
- `PLAN-STATUS.md`, `WORKLOG.md` — status + log entries (B5-1, 🧪 pending leader review).

### Red test proof
Before the fix, `startLive()`/`complete()` had unguarded `WHERE id = ?`, so: pending→end would succeed (test 1 failed), live→start would re-fire (test 4 failed), and live→end on a completed row would re-fire (test 6 failed). The intermediate run (before the before/after fallback) demonstrated the same signal: `startLive(accepted)=false` under the CLI's missing `meta`, which the fallback now resolves from real before/after state — 7/7 green after the fix.

### Command outputs
- `npx vitest run -c vitest.integration.config.ts tests/integration/competition-state-guards.test.ts` → **7/7 passed** (~120s, real D1 via Wrangler CLI).
- `npm test` → **73/73 passed** (10 files, incl. 3 new i18n tests).
- `npx tsc --noEmit` → clean (exit 0).
- `npm run build` → success (tailwind + esbuild + vite, `dist/_worker.js` built).

### i18n keys added (ar + en)
- `competition_errors.not_eligible_to_start` / `no_opponent` / `not_live` / `already_completed` (exact strings per task; `no_opponent` added because the previous opponent error was a hardcoded English string, which the architecture rules forbid).

### Deliberately NOT touched
- `LivePayoutEngine`, `ScheduledTaskService.updateAggregatesAfterVote`, any financial logic, any migration, anything from B5-2 onward.

### Rollback plan (G8)
- Revert commit `6410f75` on this branch (`git revert`); no migration to roll back (schema untouched). Re-run the 4 commands above to confirm green.
