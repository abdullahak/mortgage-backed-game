const { devices } = require('@playwright/test');

const baseURL = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:3011';

module.exports = {
    testDir: './tests/e2e',
    testMatch: ['real-player-flow.spec.js'],
    timeout: 180000,
    retries: 0,
    workers: 1,
    use: {
        baseURL,
        headless: process.env.PLAYWRIGHT_HEADLESS !== '0',
        viewport: { width: 1280, height: 720 },
        actionTimeout: 10000,
        navigationTimeout: 15000,
        trace: 'retain-on-failure',
        screenshot: 'only-on-failure',
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
};
