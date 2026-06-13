import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    // Hot-path / determinism work must fail fast, never wedge the gate.
    testTimeout: 10_000,
    hookTimeout: 10_000,
    teardownTimeout: 10_000,
  },
});
