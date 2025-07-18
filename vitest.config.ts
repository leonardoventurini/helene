import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    browser: {
      enabled: true,
      instances: [
        {
          browser: 'chromium',
        },
      ],
      provider: 'playwright',
      headless: true,
      screenshotOnFailure: false,
    },
    include: ['src/test/browser/**/*.test.ts'],
    exclude: ['node_modules', 'dist'],
    globals: true,
  },
})