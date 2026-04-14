# Feature Specification: Competition Lifecycle & Logic

**Feature Branch**: `001-competition-lifecycle`  
**Created**: 2026-04-02  
**Status**: Draft  
**Input**: User description: "Implement Opus Dueli Competition logic"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Immediate Competition Lifecycle Flow (Priority: P1)

Users can create an immediate competition (pending), accept an opponent's request (accepted), both join the broadcast (live), and formally end the session (completed).

**Why this priority**: This is the core loop of the platform. Without this, no duels can happen.

**Independent Test**: Can be fully tested by simulating two users traversing the pending -> accepted -> live -> completed flow manually and verifying state changes and video chunk generation.

**Acceptance Scenarios**:

1. **Given** a pending immediate competition, **When** a creator creates it, **Then** they immediately see a list of online competitors with a search bar to send direct invitations.
2. **Given** an invited competitor, **When** they receive the request, **Then** it appears inline via SSE without a page refresh, allowing instant accept/decline.
3. **Given** an accepted competition, **When** both users connect to the signaling layer, **Then** our backend transitions the state to 'live' and sets both users as 'is_busy'.
4. **Given** a live competition, **When** a user deliberately ends the stream, **Then** the competition transitions to 'completed' and 'is_busy' flags are cleared.

---

### User Story 2 - Scheduled Competition Lifecycle Flow (Priority: P1)

Users can create a competition for a future date. It should lock in the attendees upon acceptance, wait until the scheduled time, and then allow transitioning to live.

**Why this priority**: Essential feature for influencers and planners who don't want to wait around for instant matchmaking.

**Independent Test**: Can be independently tested by setting a schedule 5 minutes in the future, verifying status transitions upon acceptance, and ensuring 'live' state only triggers when both stream at the scheduled time.

**Acceptance Scenarios**:

1. **Given** a scheduled competition mapped 2 days in advance, **When** accepted, **Then** it remains 'accepted' without expiring immediately, unlike immediate competitions.
2. **Given** an accepted scheduled competition that is over an hour past its scheduled time without anyone joining, **Then** the system automatically cancels it.

---

### User Story 3 - System Self-Cleaning & Abandonment Handlers (Priority: P1)

The system automatically cleans up stale data: pending requests over 1 hour, abandoned accepted duels, and stuck "is_busy" flags.

**Why this priority**: Prevents database bloat and resolves UI deadlocks for users whose connections dropped or who abandoned the platform.

**Independent Test**: Can be tested via CRON job simulation (fast-forwarding time) to ensure stale records are appropriately deleted or transitioned.

**Acceptance Scenarios**:

1. **Given** an immediate 'pending' competition older than 1 hour, **When** the cron job runs, **Then** the competition is deleted.
2. **Given** a user stuck with 'is_busy = true' but not actively in a 'live' competition for over 10 minutes, **When** the cron job runs, **Then** the user is released and 'is_busy' is set to false.

---

### User Story 4 - Conflict Prevention & Limits (Priority: P2)

Users cannot enter conflicting states. A user cannot schedule conflicting times, nor can they be in two live competitions. Limits prevent spam (3 pending competitions, 10 pending requests).

**Why this priority**: Critical for data integrity and spam prevention, but secondary to the happy paths.

**Independent Test**: Provide API input trying to create a 4th competition or overlapping schedule and verify a 400 error.

**Acceptance Scenarios**:

1. **Given** a user already in a 'live' competition, **When** they try to start another accepted competition, **Then** the backend rejects the action.
2. **Given** a user has 3 pending competitions, **When** they attempt to create a 4th, **Then** the system throws a quota error.

---

### User Story 5 - Heartbeats and Disconnections (Priority: P2)

The system gracefully handles sudden disconnections using client heartbeats. A disconnection grants a 3-minute grace period before prompting the other user.

**Why this priority**: Protects the experience of the remaining user if their opponent's internet drops.

**Independent Test**: Block heartbeat API calls on the client side, verify the backend flags the disconnect after 2 minutes, and prompts the opponent.

**Acceptance Scenarios**:

1. **Given** a live competition, **When** user A stops sending heartbeats for 2 minutes, **Then** the backend notes the disconnect.
2. **Given** the disconnect exceeds 3 minutes, **When** the cron job runs, **Then** user B is queried whether to end or keep waiting.

---

### Edge Cases

- What happens when two users try to accept different requests for the same competition at the exact same millisecond? (Requires atomic DB batch ops).
- How does system handle a user trying to upload a video chunk after the competition is marked 'completed' or 'cancelled'?
- What happens if the scheduled CRON job fails to execute for an hour?

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST strictly enforce competition state transitions: `pending` -> `accepted` -> `live` -> `completed` / `cancelled`. No other transitions allowed. 
- **FR-002**: System MUST transition an accepted competition to `live` ONLY when both endpoints report streaming status.
- **FR-003**: System MUST update the users table to flag `is_busy` when a competition becomes `live`, and clear it when the competition completes or cancels.
- **FR-004**: System MUST automatically delete `pending` immediate competitions that have no opponent after 1 hour.
- **FR-005**: System MUST enforce atomic database transactions (using `db.batch()`) when accepting a request or invitation to prevent race conditions.
- **FR-006**: System MUST track client heartbeats via a dedicated API endpoint every 30 seconds for active `live` competitions.
- **FR-007**: System MUST provide a cron-scheduled task running every 5 minutes to sweep and fix stale statuses (zombie completions, abandoned schedules).
- **FR-008**: System MUST implement a chunk upload retry queue on the client side backing off up to 3 times before failing.
- **FR-009**: System MUST prevent users from entering overlapping schedules by checking `scheduled_at` + `max_duration` windows before accepting.
- **FR-010**: System MUST NOT allow modifications to the competition title, description, or rules after the status becomes `accepted`.
- **FR-011**: System MUST display a list of currently online / available competitors to the creator upon creating a competition, including a search mechanism to send direct invites.
- **FR-012**: System MUST unify the visual presentation of "Competition Cards" universally across all pages to match the exact DOM structure and styling of the homepage cards.
- **FR-013**: System MUST deliver all requests, messages, and platform notifications in real-time via Server-Sent Events (SSE).
- **FR-014**: System MUST allow users to interact with SSE notifications (e.g., accept/decline requests, reply to messages) inline from any page without navigating away or refreshing the page.

### Key Entities *(include if feature involves data)*

- **User**: Stores current engagement state (`is_busy`, `current_competition_id`, `busy_since`).
- **Competition**: Central state machine tracking statuses, dates (`scheduled_at`, `accepted_at`), and players (`creator_id`, `opponent_id`).
- **Competition Request & Invitation**: Transient records mapping requests from users to competitions, with `expires_at` logic (defaults to 24h).
- **Competition Heartbeat**: Tracks `last_seen` timestamp per user per active competition.
- **Scheduled Task**: Internal queue table tracking delayed actions like auto-cancelling or notifications.
- **User Block**: Tracks `blocker_id` and `blocked_id` to prevent requests and invitations.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Zero occurrences of double-booked immediate competitions in production monitoring.
- **SC-002**: 100% of "zombie" live competitions (where both users disconnected completely) are gracefully terminated within 2 hours and 15 minutes.
- **SC-003**: The database maintains 0 orphaned pending requests older than 48 hours.
- **SC-004**: Client-side chunk upload success rate exceeds 98% even under simulated 5% packet loss networks (due to retry queues).
- **SC-005**: CRON jobs process sweeps (evaluating stale competitions) in under 500ms on the Cloudflare Worker.

## Assumptions

- We assume Cloudflare D1 supports `db.batch()` for transactions, and we cannot use `BEGIN IMMEDIATE` / `COMMIT`.
- The external signaling server and Jitsi API perform flawlessly; our logic acts as a pure state-manager overlay on top of them.
- Users have a reasonably stable connection to hit the heartbeat endpoint every 30 seconds.
- The UI gracefully renders these states (disconnections, busy overlays) using existing locked CSS logic.
