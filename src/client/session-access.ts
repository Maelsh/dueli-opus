/**
 * @file src/client/session-access.ts
 * @description R4-SESSION-KEY-SEC07-1 — synchronous global session accessor.
 *
 * This tiny entry loads in <head> before server-rendered inline page scripts.
 * It exposes the same precedence implemented by AuthService/ApiClient so page
 * consumers never read `session_id` directly and a stale legacy value can
 * never override the canonical `sessionId` pair.
 */

import { installSessionAccessGlobal } from './core/SessionAccess';

if (typeof window !== 'undefined') {
    installSessionAccessGlobal(window);
}
