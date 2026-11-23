'use strict';

const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  reporter: 'dot',
  timeout: 15000,
  expect: { timeout: 3000 },
  use: {
    baseURL: 'http://127.0.0.1:3001',
    browserName: 'chromium',
    headless: true,
    trace: 'retain-on-failure'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'node server.js',
    url: 'http://127.0.0.1:3001/api/health',
    env: {
      ...process.env,
      NODE_ENV: 'test',
      PORT: '3001',
      DATABASE_PATH: ':memory:'
    },
    reuseExistingServer: false,
    timeout: 60000
  }
});
