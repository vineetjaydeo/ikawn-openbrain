import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./tests/helpers/setup.js'],
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
