# Research Findings & Decisions

**Feature**: Competition Lifecycle
**Date**: 2026-04-02

## Unknowns Addressed

None. The Unified Master Plan provided by the user resolved all architectural disputes and unknowns prior to the spec creation phase.

## Technical Decisions

### D1 Transaction Management
- **Decision**: Use `db.batch()` for atomic actions (e.g. accepting a request) instead of standard SQL `BEGIN TRANSACTION` / `COMMIT`.
- **Rationale**: Cloudflare D1's specific architectural constraint does not support raw transaction boundaries effectively over HTTP API.
- **Alternatives considered**: None practical under D1.

### Abandonment Cron Strategy
- **Decision**: Dedicated `ScheduleController` hooking into Cloudflare Worker Scheduled triggers.
- **Rationale**: Keeps the cleanup decoupled from user requests to maintain high performance.
