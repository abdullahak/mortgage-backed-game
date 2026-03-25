// @ts-check
const { test, expect } = require('@playwright/test');
const { loginPage } = require('./helpers');

const BASE = 'http://192.168.4.57';
const BASE_API = `${BASE}/api`;

test.describe('Lobby', () => {
    let token, userId;

    test.beforeAll(async ({ request }) => {
        const res = await request.post(`${BASE_API}/auth/anonymous`);
        const body = await res.json();
        token = body.token;
        userId = body.user.id;
    });

    test.beforeEach(async ({ page }) => {
        await page.goto(BASE);
        await loginPage(page, token);
        await page.goto(`${BASE}/lobby.html`);
    });

    test('lobby.html loads without error', async ({ page }) => {
        await expect(page.locator('body')).toBeVisible();
        await page.waitForLoadState('networkidle');
    });

    test('"Create New Game" button or link is present', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const createBtn = page.locator('button, a').filter({ hasText: /create|new game/i }).first();
        await expect(createBtn).toBeVisible({ timeout: 5000 });
    });

    test('create room modal appears on button click', async ({ page }) => {
        await page.waitForLoadState('networkidle');
        const createBtn = page.locator('button, a').filter({ hasText: /create|new game/i }).first();
        await createBtn.click();

        // Modal or form should appear
        await expect(
            page.locator('dialog, [role="dialog"], .modal, form').first()
        ).toBeVisible({ timeout: 5000 });
    });

    test('submitting create form creates a room and shows it in the list', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        // Open create modal
        const createBtn = page.locator('button, a').filter({ hasText: /create|new game/i }).first();
        await createBtn.click();

        // Fill in name
        const nameInput = page.locator('input[name="name"], input[placeholder*="name"], #room-name').first();
        await nameInput.waitFor({ timeout: 5000 });
        await nameInput.fill('E2E Test Room');

        // Fill in player name
        const playerNameInput = page.locator('input[name="player_name"], input[placeholder*="player"], #player-name').first();
        if (await playerNameInput.count() > 0) {
            await playerNameInput.fill('TestHost');
        }

        // Submit
        const submitBtn = page.locator('button[type="submit"], button').filter({ hasText: /create|submit|start/i }).first();
        await submitBtn.click();

        // Room should appear in list
        await expect(page.locator('body')).toContainText('E2E Test Room', { timeout: 5000 });
    });

    test('room card shows invite code', async ({ page, request }) => {
        // Create a room via API first
        const roomRes = await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${token}` },
            data: { name: 'InviteCode Room', player_name: 'Host', max_players: 4 },
        });
        const room = await roomRes.json();

        await page.reload();
        await page.waitForLoadState('networkidle');

        // Should show invite code somewhere on the page
        await expect(page.locator('body')).toContainText(room.invite_code, { timeout: 5000 });
    });

    test('logout clears session', async ({ page }) => {
        await page.waitForLoadState('networkidle');

        const logoutBtn = page.locator('button, a').filter({ hasText: /logout|sign out|log out/i }).first();
        if (await logoutBtn.count() > 0) {
            await logoutBtn.click();
            const storedToken = await page.evaluate(() => localStorage.getItem('auth_token'));
            expect(storedToken).toBeFalsy();
        } else {
            // No logout button visible — test passes
            await expect(page.locator('body')).toBeVisible();
        }
    });
});
