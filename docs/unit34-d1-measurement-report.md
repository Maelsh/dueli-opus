# UNIT34 — R4-DB-MEASURE-1 delivery report (remediation)

**Code BASE (PR #146):** `20c16dc7bbda3af1aa3b0597f0f147a59c44b1c4`  
**Plan SHA:** `dc5bc1efd7d94dfa1c19604b7277b8104cdb93ad`  
**Branch:** `feat/unit34-r4-db-measure-1`  
**PR:** https://github.com/Maelsh/dueli-opus/pull/146

## Measurement honesty (read first)

| Metric | Local vitest / sqlite shim | Production Cloudflare D1 |
|--------|----------------------------|---------------------------|
| SQL statement executions (`CountingDb`) | **Measured** | Not run in this unit |
| `rowsRead` / `rowsWritten` (D1 analytics) | **Unavailable** — API not exposed in test double | **Unavailable** — no production experiments (quota / safety) |
| `rowsReadApprox` / `rowsWrittenApprox` (`InstrumentedDb`) | **Measured** — rows returned or `meta.changes` from sqlite only; **not** Cloudflare `rowsRead` | N/A |
| `EXPLAIN QUERY PLAN` | **Measured** on migrated schema | Same plans when indexes match `r4-db-opt-1` |
| Public cache hit (module) | **Measured** — keyed get/set avoids repeat compute in tests | In-memory per isolate; **not** wired to session T0 (would break fresh snapshots) |

Never treat statement counts or `rowsReadApprox` as production D1 billing metrics.

## Synthetic dataset

| Shape | Contents |
|-------|----------|
| Users | ids 1–3 (`viewer`, `alice`, `bob`) + ad-hoc users in notifications/chunk tests |
| Category | `dialogue` (id 10) |
| Competitions | 5× `live` with `started_at` (measurement seed); 1× `live` + 1× `completed` (cache seed); competition id 50 + chunks (chunk_index seed) |

**Setup:** `SqliteD1` applies migrations in-process (same as other API tests). No production data.

## Reproducible commands

```bash
npx vitest run tests/api/unit34-request-context.test.ts tests/api/unit34-d1-measurement.test.ts tests/api/unit34-public-cache.test.ts tests/ui/unit34-home-rail-open-retry.test.ts
npx vitest run tests/api/home-rails-continuation.test.ts tests/api/r3-d1-h7-ranking.test.ts tests/api/d1-param-limit-hotfix.test.ts
npx vitest run tests/ui/unit33-home-progressive-rails.test.ts
npx tsc --noEmit
npm run build
```

Vitest prints `[UNIT34 measure]` / `[UNIT34 cache]` lines with per-run statement counts (machine-dependent magnitudes; compare cold vs warm / T0 vs continuation on the same run).

## Journey table (required paths)

| Journey | Stmt count (local) | D1 `rowsRead` / `rowsWritten` | `rowsReadApprox` (sqlite) | EXPLAIN | Test |
|---------|-------------------|-------------------------------|---------------------------|---------|------|
| Home rail T0 `POST …/sessions` | **Measured** (T0 > continuation page) | **Unavailable** | N/A (API uses `CountingDb`) | N/A | `unit34-d1-measurement` #1 |
| Home rail continuation `GET …/page` | **Measured** (lower than T0) | **Unavailable** | N/A | N/A | #1 |
| Explore T0 vs continuation | **Measured** | **Unavailable** | N/A | N/A | #2 |
| `H7SignalsModel` loadCompetitions / viewer / profiles | **Measured** | **Unavailable** | N/A | N/A | #3 |
| `searchCompetitions` / `searchUsers` | **Measured** | **Unavailable** | N/A | N/A | #4 |
| Competitions listing index path | N/A | **Unavailable** | N/A | **Measured** (sample plan text) | #5 |
| SSE poll (`sse_event_log`) | **Measured** | **Unavailable** | **Measured** (approx) | Not captured | #6 |
| `GET /api/notifications` | **Measured** | **Unavailable** | **Measured** (approx) | Not captured | #7 |
| `chunk_index` timeline + `timeLookup` (seek) | **Measured** | **Unavailable** | **Measured** (approx) | Not captured | #8 |
| `UserSignalsModel.loadUsers` | **Measured** | **Unavailable** | N/A | N/A | #9 |

**Before/after (cache):** Ordered-id caching on `POST …/sessions` was **not** enabled — it violated R3 T0 freshness (regression tests #9 / H7 post-T0 arrival). `PublicSurfaceCache` is validated for key isolation and hit/miss at module level; safe production attachment points remain future work with explicit invalidation.

**Regression (unchanged semantics):** `home-rails-continuation`, `r3-d1-h7-ranking`, `d1-param-limit-hotfix`, `unit33-home-progressive-rails` — T0 ordering, H7 weights (`h7-v1`), 100-bind ceiling, progressive rails.

## Pillar C — public cache

- Keys: `surface`, `category`, `subcategory`, `status`, `lang`, `policy_version` (`RAIL_POLICY_VERSION`).
- Session `buildOrderedIds` always uncached so each new rail session gets a fresh T0 snapshot (R3-RAILS / H7).
- `PublicSurfaceCache` utility: keys, TTL, clear — ready for safe read paths with invalidation (not ordered-id freeze).
- `live` vs `completed` tabs use distinct keys → cold path for status change (no stale live list served as completed).
- Logged-in `POST` does not reuse guest-warmed cache (`unit34-public-cache` logged-in test).
- Global `clearPublicSurfaceCache()` in `tests/vitest.setup.ts` prevents cross-test pollution (fixes CI leak on `a4dede3`).

## Pillar C — degraded UI / API

| Check | Evidence |
|-------|----------|
| API 500 on D1 outage, `X-Request-Id` | `unit34-request-context` home-rails + search |
| No internal exception text in response body | `unit34-request-context` |
| Bounded rail open retry (max 2), backoff | `unit34-home-rail-open-retry` + `HomePage.RAIL_OPEN_MAX_ATTEMPTS` |
| Retry UI / no silent empty wipe | `unit33-home-progressive-rails` (existing) |

## Pillar A — request ID + logging

- `X-Request-Id` propagated or generated (`request-context` middleware).
- 5xx structured JSON logs: `requestId`, method, path, status, duration, `errorCode`; redaction in `structured-server-log.ts`.
- Tests assert no `D1_ERROR` / SQL in logs or user JSON.

## Production follow-up (blockers)

1. **D1 `rowsRead` / `rowsWritten` per journey** — measure via Cloudflare dashboard / Workers analytics on staged traffic with agreed sampling; not done here.
2. **Cross-isolate cache** — production has multiple isolates; 15s TTL cache is best-effort per isolate only.
3. **Windows full suite** — `npm test` may still report 6 failures on `jq`-dependent poll tests (pre-existing); vitest gate is authoritative for UNIT34.

## Pillars status (owner handoff)

| Pillar | Status |
|--------|--------|
| A Request ID + logging | Implemented + tests |
| B Measurement harness + report | Implemented; D1 rows metrics explicitly unavailable locally |
| C Cache + degraded UX | Implemented + tests |
| D Documentation | This file + `WORKLOG.md` + `PLAN-STATUS.md` |

**UNIT34 is not declared complete under Protocol 10** until REMOTE review accepts this evidence.
