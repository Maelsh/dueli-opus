#!/usr/bin/env node
/**
 * Cross-platform D1 local state reset.
 * Replaces the Windows-only `powershell -Command "Remove-Item ..."` in
 * package.json's db:reset (flagged in docs/13-TEST-STRATEGY.md §6 —
 * PowerShell does not run on CI/Linux/macOS).
 */
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';

const target = path.resolve(process.cwd(), '.wrangler', 'state', 'v3', 'd1');
if (existsSync(target)) {
    rmSync(target, { recursive: true, force: true });
    console.log(`Removed ${target}`);
} else {
    console.log(`Nothing to remove at ${target}`);
}
