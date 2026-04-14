# Data Model: Competition Lifecycle

This document defines the schema definitions for the D1 database to support the competition state machine.

## Modified Entities

### users
Added fields to track active competition boundaries:
- `is_busy` (BOOLEAN DEFAULT 0)
- `current_competition_id` (INTEGER NULLABLE)
- `busy_since` (DATETIME NULLABLE)

### competitions
Added tracking for scheduling and lifecycle transitions:
- `accepted_at` (DATETIME NULLABLE)
- `max_duration` (INTEGER DEFAULT 7200)
- `status` (ENUM / TEXT) - constrained to: 'pending', 'accepted', 'live', 'completed', 'cancelled'

### competition_requests
- `expires_at` (DATETIME DEFAULT datetime('now', '+24 hours'))

## New Entities

### competition_heartbeats
Tracks if a client disconnected.
- `competition_id` (INTEGER, FK to competitions)
- `user_id` (INTEGER, FK to users)
- `last_seen` (DATETIME)
- *Indices*: on `last_seen`

### competition_scheduled_tasks
Drives the CRON background workers.
- `id` (INTEGER PK)
- `competition_id` (FK to competitions)
- `task_type` (TEXT) - auto_delete_if_not_live, auto_end_live, check_disconnection
- `execute_at` (DATETIME)
- `status` (TEXT) - pending, completed, failed

### user_blocks
- `blocker_id` (FK)
- `blocked_id` (FK)
- `created_at` (DATETIME)
- *Constraint*: UNIQUE(blocker_id, blocked_id)
