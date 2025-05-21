import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: ['node_modules'],
    coverage: {
      all: true,
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['node_modules'],
      reporter: ['text', 'lcov']
    }
  }
});
