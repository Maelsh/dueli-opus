/**
 * @file src/client/session-access.ts
 * @description SEC-08 synchronous browser session bootstrap.
 *
 * Loads in <head> before server-rendered inline scripts. It installs the
 * cookie/CSRF fetch shim and the no-secret `window.DueliSession` compatibility
 * object. The session secret itself is HttpOnly and never enters this bundle.
 */

import { installSessionAccessGlobal } from './core/SessionAccess';

if (typeof window !== 'undefined') {
    installSessionAccessGlobal(window);
}
