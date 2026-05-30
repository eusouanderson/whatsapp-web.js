import { defineConfig } from 'vitest/config';

export default defineConfig({
    test: {
        globals: true,
        environment: 'node',
        coverage: {
            provider: 'v8',
            reporter: ['text', 'html', 'lcov'],
            include: ['db.js', 'csv-parser.js', 'groq-ai.js', 'server.js'],
            exclude: ['node_modules', 'tests', 'public', '*.config.*'],
            thresholds: {
                lines: 100,
                functions: 100,
                branches: 100,
                statements: 100,
            },
        },
        testTimeout: 10000,
        hookTimeout: 10000,
        sequence: { concurrent: false },
    },
});
