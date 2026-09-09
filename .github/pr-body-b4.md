## Result for user
Due scheduled tasks (start/end a scheduled competition) are actually captured when their time arrives, instead of remaining pending due to a string comparison between different datetime formats.

## What changed and why
- `src/lib/services/ScheduledTaskService.ts` (line 115): Changed `WHERE t.execute_at <= datetime('now')` to `WHERE datetime(t.execute_at) <= datetime('now')`. The `schedule()` method stores `execute_at` via `Date.toISOString()` (e.g. `2026-09-09T05:00:00.000Z`) while `datetime('now')` returns `YYYY-MM-DD HH:MM:SS`. Lexical comparison never matches (`T` > ` `), so due tasks never ran. Wrapping with `datetime()` normalizes both sides.
- `tests/api/scheduled-tasks-due.test.ts`: Enhanced from 1 to 5 tests proving (a) WHERE uses `datetime(t.execute_at)`, (b) ORDER BY uses `datetime(t.execute_at)`, (c) a past ISO-format task IS captured, (d) a past space-format task IS captured, (e) a future task is NOT captured.
- `WORKLOG.md`: Updated B4 entry with final test counts and commit/PR references.

## Redness proof
1. Reverted line 115 to `WHERE t.execute_at <= datetime('now')` (old code).
2. Ran `npx vitest run tests/api/scheduled-tasks-due.test.ts` → **FAILED** (1/5):
   ```
   × uses datetime() on execute_at in WHERE clause
   AssertionError: expected '...WHERE t.execute_at <= datetime('now')...'
   to match /WHERE\s+datetime\(\s*t\.execute_at\s*\)\s*<=\s*datetime\(\s*'now'\s*\)/
   ```
3. Restored the fix (`datetime(t.execute_at)`).
4. Re-ran → **5/5 passed**.

## Verification commands
1. `npx vitest run tests/api/scheduled-tasks-due.test.ts` → **5/5 passed**
2. `npm test` → **75/75 passed** (was 71, +4 new B4 tests)
3. `npx tsc --noEmit` → **0 errors**
4. `npm run build` → **success** (dist/_worker.js 892.78 kB)

## i18n keys added
None — no user-visible strings in this change.

## What was intentionally NOT touched
- `migrations/` — no schema change
- `CronHandler` or `/api/cron` route — out of scope
- SEC-04 (cron secret in query string) — documented debt, separate fix
- Any financial logic (LivePayoutEngine, ELO, payouts)
- `docs/16-AGENT-PROMPTS-PLAN.md` — plan document, not part of this commit

## Rollback plan (G8)
Revert this commit (`git revert <hash>`). The change is a single-line SQL fix in one file with no migration, no new API, and no client impact. Reverting restores the old (broken) behaviour — safe and self-contained.
