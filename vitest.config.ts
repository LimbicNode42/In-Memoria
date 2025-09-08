import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    testTimeout: 30000, // 30 seconds for integration tests
    hookTimeout: 10000, // 10 seconds for setup/teardown
    include: [
      'src/**/*.test.ts',
      'src/**/*.spec.ts'
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'rust-core/**'
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: [
        'src/**/*.ts'
      ],
      exclude: [
        'src/**/*.test.ts',
        'src/**/*.spec.ts',
        'src/__tests__/**',
        'src/**/*.d.ts'
      ]
    },
    env: {
      // Test environment variables
      NODE_ENV: 'test',
      TEST_TIMEOUT: '30000',
      // Integration test flags (set these to enable integration tests)
      // TEST_WITH_POSTGRES: 'true',
      // TEST_WITH_QDRANT: 'true',
      // Test database configurations
      TEST_POSTGRES_HOST: 'localhost',
      TEST_POSTGRES_PORT: '5432',
      TEST_POSTGRES_DB: 'inmemoria_test',
      TEST_POSTGRES_USER: 'test_user',
      TEST_POSTGRES_PASSWORD: 'test_password',
      TEST_QDRANT_URL: 'http://localhost:6333'
    }
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './src')
    }
  },
  esbuild: {
    target: 'node18'
  }
});
