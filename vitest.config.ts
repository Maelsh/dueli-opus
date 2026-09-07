import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        environment: 'node',
        include: ['tests/**/*.test.ts'],
        exclude: ['tests/integration/**'],
        testTimeout: 30000,
        pool: 'forks'
    }
});
