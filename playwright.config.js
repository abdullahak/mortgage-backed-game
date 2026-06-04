const { devices } = require('@playwright/test');
const baseURL = process.env.BASE_URL || 'http://100.110.102.49:3011';

module.exports = {
    testDir: './tests/e2e',
    testIgnore: ['real-player-flow.spec.js'],
    timeout: 30000,
    retries: 0,
    use: {
        baseURL,
        headless: true,
        viewport: { width: 1280, height: 720 },
    },
    projects: [
        {
            name: 'chromium',
            use: { ...devices['Desktop Chrome'] },
        },
    ],
};
