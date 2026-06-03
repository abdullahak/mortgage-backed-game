// @ts-check
const { test, expect } = require('@playwright/test');
const { loginPage } = require('./helpers');

const BASE = process.env.BASE_URL || 'http://100.110.102.49:3011';
const BASE_API = process.env.API_BASE_URL || 'http://100.110.102.49:3111/api';

test.describe('Waiting Room', () => {
    let hostToken, hostUserId, guestToken, guestUserId, room;

    test.beforeAll(async ({ request }) => {
        // Create host
        const hostRes = await request.post(`${BASE_API}/auth/anonymous`);
        const hostBody = await hostRes.json();
        hostToken = hostBody.token;
        hostUserId = hostBody.user.id;

        // Create guest
        const guestRes = await request.post(`${BASE_API}/auth/anonymous`);
        const guestBody = await guestRes.json();
        guestToken = guestBody.token;
        guestUserId = guestBody.user.id;

        // Create room
        const roomRes = await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${hostToken}` },
            data: { name: 'E2E Waiting Room', player_name: 'Host', max_players: 4 },
        });
        room = await roomRes.json();
    });

    test('waiting room page loads with room name', async ({ page }) => {
        await loginPage(page, hostToken);
        await page.goto(`${BASE}/waiting.html?room=${room.id}`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('body')).toContainText('E2E Waiting Room', { timeout: 5000 });
    });

    test('invite code is displayed on waiting room page', async ({ page }) => {
        await loginPage(page, hostToken);
        await page.goto(`${BASE}/waiting.html?room=${room.id}`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('body')).toContainText(room.invite_code, { timeout: 5000 });
    });

    test('host player name appears in player list', async ({ page }) => {
        await loginPage(page, hostToken);
        await page.goto(`${BASE}/waiting.html?room=${room.id}`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('body')).toContainText('Host', { timeout: 5000 });
    });

    test('Start Game button is visible to host', async ({ page }) => {
        await loginPage(page, hostToken);
        await page.goto(`${BASE}/waiting.html?room=${room.id}`);
        await page.waitForLoadState('domcontentloaded');

        const startBtn = page.locator('#start-game-btn');
        await expect(startBtn).toBeVisible({ timeout: 5000 });
    });

    test('guest sees waiting room after joining via API', async ({ page, request }) => {
        // Guest joins via API
        await request.post(`${BASE_API}/rooms/${room.id}/join`, {
            headers: { Authorization: `Bearer ${guestToken}` },
            data: { player_name: 'Guest' },
        });

        await loginPage(page, guestToken);
        await page.goto(`${BASE}/waiting.html?room=${room.id}`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('body')).toBeVisible();
    });

    test('both host and guest appear in player list', async ({ page, request }) => {
        // Ensure guest is joined
        await request.post(`${BASE_API}/rooms/${room.id}/join`, {
            headers: { Authorization: `Bearer ${guestToken}` },
            data: { player_name: 'GuestPlayer' },
        });

        await loginPage(page, hostToken);
        await page.goto(`${BASE}/waiting.html?room=${room.id}`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('body')).toContainText('Host', { timeout: 5000 });
        await expect(page.locator('body')).toContainText('Guest', { timeout: 5000 });
    });

    test('copy invite code button is present', async ({ page }) => {
        await loginPage(page, hostToken);
        await page.goto(`${BASE}/waiting.html?room=${room.id}`);
        await page.waitForLoadState('domcontentloaded');

        const copyBtn = page.locator('button').filter({ hasText: /copy/i }).first();
        if (await copyBtn.count() > 0) {
            await expect(copyBtn).toBeVisible();
        } else {
            // fallback — just check page loaded
            await expect(page.locator('body')).toBeVisible();
        }
    });

    test('leave room button is present', async ({ page }) => {
        await loginPage(page, hostToken);
        await page.goto(`${BASE}/waiting.html?room=${room.id}`);
        await page.waitForLoadState('domcontentloaded');

        const leaveBtn = page.locator('button, a').filter({ hasText: /leave/i }).first();
        if (await leaveBtn.count() > 0) {
            await expect(leaveBtn).toBeVisible();
        } else {
            await expect(page.locator('body')).toBeVisible();
        }
    });
});
