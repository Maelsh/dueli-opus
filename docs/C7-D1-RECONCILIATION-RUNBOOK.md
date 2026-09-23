# C7 — Remote D1 ↔ Repository Reconciliation Runbook

> Scope: C7 only. The rebuild below was executed 2026-09-23 under the owner's
> FINAL BACKEND DEBT CLOSURE directive (explicit authorization to close C7).
> Branch stack: `chore/c7-d1-reconciliation` on `chore/c3b-posts-cleanup`;
> replayed chain = stack tip (migrations `0001`–`0032`, 33 files).

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

## 5. Production cutover — EXECUTED 2026-09-23 (~15:25–15:50 UTC)

Pre-snapshot: 544 users (real 9005/9006), 1541 competitions (12 real 2161–2172),
28 history rows (ids 2–10 ghosts), 50 tables.

1. Fresh backup: `d1 export --remote` → 2,404,015 bytes (outside repo). ✅
2. Dropped all 50 user objects: 2 triggers + 49 tables in FK-child-first order via
   `--command` batches (the `--file` import API refuses reset-shaped batches with
   `{"D1_RESET_DO":true}`; per-statement query API works; D1 enforces FKs on DROP,
   so parents go last; two transient API errors retried successfully).
3. `wrangler d1 migrations apply dueli-db --remote` from the stack tip: all 33 files
   `0001`–`0032` ✅ (incl. `0029` posts drop + `0030`/`0031`/`0032`).
4. History verified byte-identical to repo file list (33/33). ✅
5. Reimported 22 data tables (4115 INSERTs minus `d1_migrations`, `OR IGNORE` for
   migration-seeded collisions), parents-first, per-table `--file` (small files pass
   the import API). Intentionally skipped: `rate_limits` (ephemeral windows),
   `sqlite_sequence` (engine-managed). One transient FK error on `messages` cleared
   on retry; `posts`/`post_likes` had 0 rows — nothing lost by the `0029` drop.
6. Validation (all remote):
   * counts: users 544, competitions 1541, sessions 86, messages 3 — match backup;
   * real users 9005/9006 + 12 real competitions intact;
   * `donations`, `ledger_entries`, `chunk_upload_nonces`, `realtime_tickets`,
     `cron_runs` present; `posts`/`post_likes` gone;
   * `PRAGMA foreign_key_check` → [];
   * `platform_settings` values identical to backup (only `updated_at` = replay time);
   * production smoke: `GET /?lang=en` 200, `GET /api/categories` 200.
7. Rollback (unused): re-import the §5 backup file, or replay pre-rebuild procedure.

## 6. Status

* Remote D1 == repository schema + history: **YES** (33/33, validated above).
* Code in this PR: `is_fake=0` creation paths, Demo badges (`demo.*` ar/en,
  profile + competition-card), `SyntheticRetirementService` (oldest-first,
  zero-dependent, FK-coverage-pinned) hooked into register/OAuth/competition
  creation (best-effort, never fails the primary write).
* Remaining: merge PRs in stack order; redeploy Pages + worker per their PR notes.
