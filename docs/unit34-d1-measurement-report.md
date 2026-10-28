# UNIT34 — R4-DB-MEASURE-1 delivery report (numeric)

**Code BASE:** `8e10cdc3ec1f5f2dd1c225feee88ab7d225411cd` (pre-UNIT34) · **Branch:** `feat/unit34-r4-db-measure-1`  
**Plan SHA:** `dc5bc1efd7d94dfa1c19604b7277b8104cdb93ad`

## Measurement honesty

| Metric | Local harness | Production D1 |
|--------|---------------|---------------|
| `rowsRead` / `rowsWritten` | **Unavailable** (sqlite/vitest) | **Not measured** in this unit |
| Statement executions | **Measured** (`CountingDb`) | Estimated proportional |
| `EXPLAIN QUERY PLAN` | **Measured** on migrated schema | Same plans when indexes applied |
| Cache hit rate | **Measured** (second T0 stmt delta) | Isolate TTL ~15s |

Synthetic dataset: ~3 users, 5 live competitions, 1 category (`tests/api/unit34-d1-measurement.test.ts`).

## Before / after (cache pillar C)

| Journey | Before (cold T0 stmts) | After (warm guest suggested T0 stmts) | Method |
|---------|------------------------|----------------------------------------|--------|
| Guest suggested home rail `POST /api/home-rails/sessions` | Full provider + H7 build | Lower stmt count on repeat within TTL | `unit34-public-cache.test.ts` |

Ordering, weights (`h7-v1`), T0 freeze, and exhaustion semantics are unchanged; cache keys include `policy_version` (`RAIL_POLICY_VERSION`).

## Core journeys (statement counts — local)

| Journey | T0 / hot path stmts | Continuation / secondary | Test |
|---------|---------------------|--------------------------|------|
| Home rail session | Higher at `POST …/sessions` | Lower at `GET …/page` | `unit34-d1-measurement` #1 |
| Explore session | Higher at explore `POST` | Lower at explore `GET …/page` | #2 |
| H7SignalsModel | `loadCompetitions` + `loadViewerContext` | — | #3 |
| UserSignalsModel | `loadProfiles` | — | #3 |
| searchCompetitions / searchUsers | Separate counts | — | #4 |
| Index path | EXPLAIN text captured | — | #5 |

SSE polling and chunk_index/playlist paths reuse existing API tests (`r4-db-opt-1`, chunk-upload suites); dedicated stmt counters for those routes are **planned follow-up** in the same harness pattern (not production-measured here).

## Consumption budget (estimate)

Local statement reduction on cached guest suggested T0 is **measured** as strictly fewer prepared statements on the second create within 15s. Production `rowsRead` savings are **estimated** at a similar ratio for identical public keys; no production quota was consumed.

## Pillars A–D status

- **A:** `X-Request-Id` middleware + structured JSON error logs — `unit34-request-context.test.ts`
- **B:** Harness above + `r4-db-opt-1.test.ts` (indexes) remain valid
- **C:** `PublicSurfaceCache` (guest public rails) + bounded `openRail` retries — cache + UI tests
- **D:** This document + `WORKLOG.md` / `PLAN-STATUS.md`
