# Quickstart: Competition Lifecycle

This feature focuses on backend logic and state transitions mapped to Cloudflare D1.

## Local Development Requirements
- Ensure Wrangler is installed globally or locally: `npm install -g wrangler`
- D1 Database bindings must be active in `.dev.vars` or via `wrangler.jsonc`

## Testing the Flow
1. Start the dev server: `npm run dev`
2. Simulate CRON executions locally to test timeouts using:
   `wrangler dev --test-scheduled`
3. Hit `/__scheduled` manually via cURL to force the ScheduleController to trigger early for rapid testing of timeouts.
