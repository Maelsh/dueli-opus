## Result for user
Due scheduled tasks (start/end a scheduled competition) are actually captured when their time arrives, instead of remaining pending due to a string comparison between different datetime formats.

## What changed and why
- `src/lib/services/ScheduledTaskService.ts` (line 115): Changed `WHERE t.execute_at <= datetime('now')` to `WHERE datetime(t.execute_at) <= datetime('now')`. The `schedule()` method stores `execute_at` via `Date.toISOString()` (e.g. `2026-09-09T05:00:00.000Z`) while `datetime('now')` returns `YYYY-MM-DD HH:MM:SS`. Lexical comparison never matches (`T` > ` `), so due tasks never ran. Wrapping with `datetime()` normalizes both sides.
- `tests/integration/scheduled-tasks-due.test.ts`: Real D1/SQLite test via Wrangler CLI (not a JavaScript mock). Proves (a) a past ISO-format task IS captured, (b) a past space-format task IS captured, (c) a future task is NOT captured, (d) exactly 2 due tasks returned, (e) results ordered chronologically.
- `WORKLOG.md`: Updated B4 entry with final test counts and commit/PR references.

## Redness proof (behavioral, real SQL)
1. Reverted ONLY the production WHERE clause to `WHERE t.execute_at <= datetime('now')` (old broken SQL).
2. Ran `tests/integration/scheduled-tasks-due.test.ts` → **3 tests FAILED**:
   ```
   × captures a past task with T-separator (ISO) execute_at
   × returns exactly 2 due tasks (got 1)
   × orders results chronologically by execute_at
   ```
   The ISO-format task was NOT captured because lexical comparison (`T` > ` `) made it appear "later" than `datetime('now')`.
3. Restored the fix (`WHERE datetime(t.execute_at) <= datetime('now')`).
4. Re-ran → **5/5 passed**.

## Verification commands
1. `./node_modules/.bin/vitest run -c vitest.integration.config.ts tests/integration/scheduled-tasks-due.test.ts` → **5/5 passed**

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
