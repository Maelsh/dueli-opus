<!-- 
Sync Impact Report:
- Version change: 1.0.0 (Initial Creation)
- Added sections: Core Principles, Development Workflow, Governance
- Modified principles: N/A
- Templates requiring updates: N/A
-->
# Opus Dueli Constitution

## Core Principles

### I. EXTERNAL BROADCASTING IS LOCKED (🔴 STRICT)
The logic for the Signaling Server, TURN servers, Jitsi Meet API, and the external streaming server (`stream.maelshpro.com`) is considered a black-box integration. We must treat these as external APIs. All modifications related to streaming must happen outside these modules (e.g., managing the state of competitions or handling local chunk retries), not within their core implementations.

### II. DESIGN AND UI ARE LOCKED (🔴 STRICT)
The frontend design, CSS styles, animations, and established layouts are FINAL. Absolutely no changes to the visual representation or stylesheets are allowed. Development is strictly limited to Backend and Client logic integration.

### III. CORE LOGIC ATTAINMENT FIRST
The implementation must focus exclusively on the core logic defined in the Unified Master Plan. Zero time or effort should be allocated to future enhancements, nice-to-haves, or post-launch features until the foundation (competition lifecycle, notifications, scheduling, recommendations) is 100% complete and verified.

### IV. SYSTEM SELF-CLEANING & DATA INTEGRITY
The database and user states must be kept pristine through rigorous scheduled tasks and proper lifecycle management. Zombie entries (long-pending requests, abandoned competitions) must be proactively cleaned (e.g., via CRONs). State flags like `is_busy` must faithfully reflect reality via timeouts and heartbeats.

## Platform Constraints

### I. Technology Stack
- **Backend:** Cloudflare Workers ecosystem (Triggers, Cron).
- **Database:** Cloudflare D1 (SQLite). Use `db.batch()` for atomic transactions instead of raw BEGIN/COMMIT blocks.
- **Client Framework:** TypeScript, Vite, with strict adherence to existing Vanilla CSS.

### II. Security & Stability
- Avoid SQL injection systematically by explicitly defining queries (e.g., parameterized queries for Recommendations).
- Implement explicit rate limiting and CSRF protections for core logic APIs.
- Utilize retry queues with exponential backoffs for vital operations like Chunk Uploading.

## Governance

This Constitution supersedes all ad-hoc agent plans and historical discussions. It embodies the final Unified Master Plan agreements.
- Any deviation from these principles must be explicitly authorized by the project lead.
- Amendments to this constitution must increment the version number and log breaking changes in the Sync Impact Report.

**Version**: 1.0.0 | **Ratified**: 2026-04-02 | **Last Amended**: 2026-04-02
