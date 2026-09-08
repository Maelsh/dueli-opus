import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/integration/**/*.test.ts'],
        testTimeout: 120000,
        hookTimeout: 120000,
        // All integration files share one isolated local D1 state dir
        // (.wrangler-test) — they must never run in parallel.
        fileParallelism: false,
    },
});
