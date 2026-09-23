# C7 — Remote D1 ↔ Repository Reconciliation Runbook

> Scope: C7 only. No destructive step here was executed against production.
> Base: `origin/main 376b2ea` (PR #49). Branch: `chore/c7-d1-reconciliation`.

## 1. Proven remote state (read-only, 2026-09-23)

* `d1_migrations`: 28 rows. ids 2–10 name pre-rewrite files absent from the repo
  (`0002_add_auth_fields.sql` … `0010_add_invitations.sql`); ids 11–28 = repo `0002`–`0018`.
* Pending vs repo: `0019`–`0028` (10 migrations) cannot apply — `donations` table missing remotely.
* Remote tables: 50 (incl. legacy `posts`/`post_likes`, no `donations`, `ledger_entries`,
  `stripe_webhook_events`, `donation_refund_intents`, `ad_click_tokens`, `ad_clicks`,
  `ad_impression_dedup`, `payment_methods`).
* Rows: 544 users (2 real `is_fake=0` + 542 synthetic), 1541 competitions (12 real + 1529 synthetic).

## 2. Backup (done, non-destructive)

* `npx wrangler d1 export dueli-db --remote` → 2,403,011 bytes, kept **outside the repo**
  (operator temp dir, 1-hour signed URL also issued by wrangler).
* Integrity: file parses; data section loads (see §3).

## 3. Restore test (done, local only — no production touch)

* Fresh in-memory SQLite → applied repo migrations `0001`–`0028` in order → loaded backup
  `INSERT`s (`OR IGNORE` for seed collisions, `d1_migrations` rows skipped).
* Result: users 544 (2 real), competitions 1541 (12 real), **0 `foreign_key_check` violations**.
* Conclusion: remote data fits the repository schema; the migration chain is replayable from empty.

## 4. Synthetic-data safety (done in this PR)

* Root cause: `users.is_fake` / `competitions.is_fake` default to `1`, and all three creation
  paths omitted the column — every real signup/competition was marked fake.
* Fixed: `UserModel.create`, `CompetitionModel.create`, OAuth `INSERT` now write `is_fake=0`.
* Existing synthetic rows untouched; seed (demo) data untouched.
* Regression: `tests/models/IsFakeCreation.test.ts` (3/3).

## 5. Production cutover (NOT executed — requires owner approval)

1. Re-confirm backup freshness (`d1 export`) immediately before the window.
2. Announce maintenance; stop writers (pause cron + app writes if possible).
3. Destructive step (owner approval required): drop/recreate remote database
   (or `DELETE` all user tables in dependency order), then `wrangler d1 migrations apply --remote`
   from the repo (now incl. `0029` after C3b merges — rebase this branch first).
4. Re-import preserved rows: the 2 real users + 12 real competitions (+ their dependent rows
   per cascade policy), then re-seed demo data via `db/seed` if the site must not look empty.
5. Validate: migration history == repo list; `donations` + money tables present;
   `PRAGMA foreign_key_check` empty; schema-contract integration green; ledger invariant 0.
6. Rollback: re-import the §2 backup file; history returns to the 28-row legacy state.

## 6. Status

* Code + tests + backup + restore-proof: DONE in this PR (unmerged).
* Remote rebuild + cutover: OPEN, manual, owner-gated. This PR must NOT be read as
  "remote == repo" until §5 is executed and validated.
