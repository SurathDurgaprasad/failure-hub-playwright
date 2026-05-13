import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  reporter: [
    ['list'],
    ['./failure-hub/playwright/reporter.ts', { endpoint: process.env.FAILURE_HUB_ENDPOINT || 'http://localhost:3000/api/ingest' }]
  ],
  use: {
    // Traces are heavy ZIPs; the Forensic Reporter captures all needed context.
    trace: 'off',
    screenshot: 'only-on-failure',
  },
});