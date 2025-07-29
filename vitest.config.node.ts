import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: [
      'src/test/node/**/*.test.ts',
      'src/react/**/*.test.tsx',
      'src/data/**/*.test.ts',
      'src/ejson/**/*.test.ts',
    ],
    exclude: ['node_modules', 'dist', 'src/test/browser/**/*'],
    globals: true,
    setupFiles: ['src/test/setup.ts'],
    testTimeout: 10000,
    maxWorkers: 1,
  },
})
