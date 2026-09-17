import { defineConfig, devices } from '@playwright/test';

/**
 * B16 — Beta Core E2E (test-only config, NOT wired into CI).
 * Two projects run the SAME single scenario with different locales:
 *   ar -> RTL, en -> LTR. No scenario duplication: the spec branches
 *   on testInfo.project.name only.
 * CI wiring is deliberately deferred to a separate governance PR.
 */
export default defineConfig({
    testDir: './tests/e2e',
    testMatch: '**/*.spec.ts',
    fullyParallel: false,
    workers: 1,
    retries: 0,
    timeout: 120000,
    expect: { timeout: 15000 },
    reporter: [['list']],
    use: {
        baseURL: 'http://127.0.0.1:4173',
        trace: 'off',
        screenshot: 'off',
        video: 'off'
    },
    webServer: {
        command: 'npm run db:reset && npm run build && npx wrangler pages dev dist --local --ip 127.0.0.1 --port 4173',
        url: 'http://127.0.0.1:4173/',
        reuseExistingServer: false,
        timeout: 120000,
        stdout: 'pipe',
        stderr: 'pipe'
    },
    projects: [
        { name: 'ar', use: { ...devices['Desktop Chrome'], locale: 'ar-EG' } },
        { name: 'en', use: { ...devices['Desktop Chrome'], locale: 'en-US' } }
    ]
});
