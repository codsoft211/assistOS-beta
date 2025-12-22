import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['./apps/api/tests/setup.ts'],
    include: ['tests/**/*.{test,spec}.{ts,tsx}', 'apps/api/tests/**/*.test.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/client/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'apps/api/tests/',
        '**/*.config.*',
        '**/dist/**'
      ]
    },
    testTimeout: 30000, // 30s for integration tests
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'client', 'src'),
      '@shared': path.resolve(__dirname, 'shared'),
      '@assets': path.resolve(__dirname, 'attached_assets'),
      'shared/schema': path.resolve(__dirname, 'shared', 'schema.ts'),
    },
  },
});
