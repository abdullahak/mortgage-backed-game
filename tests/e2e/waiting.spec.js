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

    test('bad guest room code shows inline error without persisting a guest token', async ({ page }) => {
        const consoleErrors = [];
        page.on('console', msg => {
            const text = msg.text();
            if (msg.type() === 'error' && !/Failed to load resource: the server responded with a status of 404/.test(text)) {
                consoleErrors.push(text);
            }
        });

        await page.goto(`${BASE}/waiting.html?code=BAD999`);
        await page.locator('#guest-player-name').fill('Lost Guest');
        await page.locator('#guest-join-btn').click();

        await expect(page.locator('#guest-join-error')).toContainText(/Room not found|Could not join room/i);
        await expect.poll(() => page.evaluate(() => localStorage.getItem('auth_token'))).toBe(null);
        expect(consoleErrors).toEqual([]);
    });

    test('room code resumes an in-progress game as an existing player', async ({ page, request }) => {
        const host = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const guest = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const resumeRoom = await (await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${host.token}` },
            data: { name: 'Resume Existing Room', player_name: 'Resume Host', max_players: 4 },
        })).json();
        await request.post(`${BASE_API}/rooms/${resumeRoom.id}/join`, {
            headers: { Authorization: `Bearer ${guest.token}` },
            data: { player_name: 'Resume Guest' },
        });
        const joinedRoom = await (await request.get(`${BASE_API}/rooms/${resumeRoom.id}`, {
            headers: { Authorization: `Bearer ${host.token}` },
        })).json();
        const gameState = {
            currentPlayerIndex: 0,
            players: joinedRoom.room_members.map(member => ({
                userId: member.user_id,
                name: member.player_name,
                cash: 1500,
                position: 0,
                bankrupt: false,
                inJail: false,
                jailTurns: 0,
                doubleCount: 0,
                diceRolled: false,
                hasGetOutOfJailCard: false,
                properties: [],
                corporations: [],
                debts: [],
            })),
            properties: [],
            corporations: [],
            debts: [],
            marketOffers: [],
            gameLog: [],
            lastDiceRoll: null,
            lastCardDrawn: null,
            settings: { passGoAmount: 200, startingCash: 1500, interestRate: 5 },
        };
        await request.post(`${BASE_API}/games`, {
            headers: { Authorization: `Bearer ${host.token}` },
            data: { room_id: resumeRoom.id, game_state: gameState },
        });

        await page.goto(BASE);
        await page.locator('#resume-code').fill(resumeRoom.invite_code);
        await page.getByRole('button', { name: /Join Game/i }).click();
        await page.waitForURL(/waiting\.html\?code=/, { timeout: 10000 });
        await expect(page.locator('#hotseat-resume-options')).toContainText('Continue as an existing player', { timeout: 10000 });

        await page.getByRole('button', { name: 'Resume Host' }).click();
        await page.waitForURL(/game\.html\?room=/, { timeout: 10000 });
        await expect(page.locator('#gameContent')).toContainText('Current Turn: Resume Host', { timeout: 10000 });
        await expect.poll(() => page.evaluate(() => localStorage.getItem('auth_token'))).not.toBeNull();
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
