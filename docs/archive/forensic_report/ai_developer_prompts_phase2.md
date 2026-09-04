# AI Developer Prompts - Dueli Core Systems (Phase 2)

> **Context for the AI Developer**: You are tasked with implementing Phase 2 modules for the "Dueli" web application (TypeScript, Hono, React/Vue/HTML frontend).
> 
> Strict constraints:
> 1. **Comments but NO Gifts**: Live comments are required to ignite the competition, but there will be NO gifts, superchats, or direct monetary donations to competitors via chat. 
> 2. **Categories Preservation**: The DB is heavily seeded with 3 main categories (Dialogue, Science, Talents) and dozens of subcategories. You MUST utilize the existing `color` and `icon` fields from the `categories` table in all UI cards to maintain the platform's visual identity.
> 3. **Architecture**: Strictly adhere to MVC.
> 4. **Internationalization (i18n)**: All texts must pass through the `t()` translation function.
> 5. **Database**: Cloudflare D1 with BaseModel wrappers. ALL SCHEMA CHANGES must be done via a `.sql` migration file (e.g. `migrations/0004_phase2_systems.sql`).

---

## Task 6: Operational Financials (Withdrawals & KYC)
**Objective**: Build the user-facing payout logic and admin approval gateway.
**Requirements**:
- **Backend Models**: 
  - Create table `withdrawal_requests` (user_id, amount, status: pending/approved/rejected, payment_method_details).
- **Frontend (User View)**: 
  - A "Wallet / Cash Out" screen in the user profile displaying available balance (from `user_earnings` wallet). 
  - Form to request withdrawal.
- **Frontend (Admin View)**: 
  - Admin screen to manually review, approve, or reject withdrawal requests, interacting seamlessly with the Financial Ledger (Task 4) when marked as "Paid".

---

## Task 7: Advanced Recommendation Engine & Matchmaking
**Objective**: Suggest relevant content/opponents dynamically based on existing data, without restricting manual search.
**Requirements**:
- **Algorithm Factors**: Must prioritize by: Language matched, Country matched, Highest Rating, Topic Relevancy, Unwatched status, and Recency.
- **Graceful Degradation**: Queries must handle infinite scrolling. If exact matches run out, progressively query less relevant content so the user never hits a hard "0 results" wall unless the DB is empty.
- **Frontend (Profile & Discovery)**: 
  - Create a "Recommendation Carousel" that users can scroll through, but it MUST NOT hide or replace the universal Search Bar.
  - Implement a "Competitors Mini-Stats Card" (Wins/Losses/Top Categories) on user profiles.

---

## Task 8: Competition Lifecycle & Strict Timers
**Objective**: Fortify the time-boundaries of the platform according to strict business logic.
**Requirements**:
- **Backend (ScheduledTaskService Optimization)**: 
  - Rule A (Instant): "Instant" open competitions get deleted entirely (with requests) if 1 hour passes without an opponent.
  - Rule B (Scheduled): "Scheduled" open competitions free the creator and cancel the match if 1 hour passes post-schedule without starting.
  - Rule C (Live Limit): Live broadcasts auto-terminate after exactly 2 hours max.
- **Frontend**: 
  - Build universal visual countdown Timers matching the server rules (e.g., "Time left to join: 59:59" or "Broadcast ends in 01:59:59").

---

## Task 9: Real-Time WebSockets & Transparent Admin Veto
**Objective**: Achieve instant UI reactivity and give Admin an auditable "Kill Switch".
**Requirements**:
- **WebSockets / SSE Centralization**: 
  - Implement a central event pusher. When User A invites User B, or accepts/rejects, the target gets an instant UI update WITHOUT page refresh.
  - Live Comments must be powered by this WebSocket channel.
- **Admin "Transparent God Mode"**: 
  - Implement the `AdminController.suspendBroadcast()` method.
  - **Crucial Transparency Rule**: Do NOT delete the competition from the DB. Change status to `archived` or `suspended`. It MUST remain visible in the archive with a tombstone marker for transparency.
  - **Audit Logging**: Every single Admin action here MUST clearly log the Admin's name, role, action timestamp, and the required explicit reason for the shutdown in the `admin_audit_logs` table.

---

## Task 10: The Dynamic Matchmaking & Invite Panel (The Fixes)
**Objective**: Fix the critical DB missing elements and build the floating dynamic invite modal.
**Requirements**:
- **Database Fixes (CRITICAL)**:
  - ALTER `users` table to add: `is_online` (BOOLEAN), `last_seen_at` (DATETIME), and `is_busy` (BOOLEAN). (Note: `is_busy` was used in `ScheduledTaskService.ts` but never existed!).
  - Create `user_blocks` table (blocker_id, blocked_id) so users can block others.
  - Add `UNIQUE(competition_id, invitee_id)` to `competition_invites` and `competition_requests` to prevent double-inviting spam.
- **Frontend (The Live Polling Modal)**:
  - Build a highly flexible, floating "Invite Opponent" modal that the creator can open/close at will.
  - It MUST automatically update the list of online users, ranking them by recommendation compatibility (from Task 7).
  - It MUST filter out any users that exist in the `user_blocks` table for that caller.
  - Clicking "Send Invite" should disable the button dynamically.
