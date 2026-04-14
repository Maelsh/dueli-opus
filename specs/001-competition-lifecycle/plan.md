# Implementation Plan: Competition Lifecycle & Logic

**Branch**: `001-competition-lifecycle` | **Date**: 2026-04-02 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `specs/001-competition-lifecycle/spec.md`

## Summary

Implement the core logic for managing the states of an Opus Dueli competition (pending, accepted, live, completed, cancelled), enforcing transition rules, handling scheduled tasks via CRON for cleanups, and broadcasting status updates without touching the external broadcasting systems.

## Technical Context

**Language/Version**: TypeScript  
**Primary Dependencies**: Cloudflare Workers environment, Vite (Frontend build)  
**Storage**: Cloudflare D1 (SQLite)  
**Testing**: Vitest  
**Target Platform**: Cloudflare Pages / Workers  
**Project Type**: Fullstack Web Application  
**Performance Goals**: Fast state transitions, DB queries under 50ms, CRON executions under 500ms.  
**Constraints**: D1 requires `db.batch()` for transactions.  
**Scale/Scope**: Scales via Cloudflare edge infrastructure.

## Constitution Check

*GATE PASSING CONFIRMED.*
- **External Broadcasting Locked**: All streaming and WebRTC chunks are untouched; we only listen to metadata boundaries.
- **Design Locked**: No frontend styling files modified. We only update data models within existing UI hooks.
- **Core Logic First**: This is strictly the foundational logic for matchmaking.
- **System Self-Cleaning**: CRON jobs are specifically planned for.

## Project Structure

### Documentation (this feature)

```text
specs/001-competition-lifecycle/
├── plan.md              
├── research.md          
├── data-model.md        
├── quickstart.md        
└── tasks.md             
```

### Source Code (repository root)

```text
src/
├── controllers/
│   ├── CompetitionController.ts
│   └── ScheduleController.ts
├── models/
│   ├── CompetitionModel.ts
│   ├── UserModel.ts
│   └── CompetitionRequestModel.ts
├── lib/
│   └── db/
│       └── migrate.ts
└── middleware/
    └── error-handler.ts
```

**Structure Decision**: Centralize the logic in `CompetitionController` and `CompetitionModel` to keep business logic isolated from API route handlers, adhering to MVC principles already present in the codebase.
