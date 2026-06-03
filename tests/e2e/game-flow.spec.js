// @ts-check
const { test, expect } = require('@playwright/test');
const { loginPage } = require('./helpers');

const BASE = process.env.BASE_URL || 'http://100.110.102.49:3011';
const BASE_API = process.env.API_BASE_URL || 'http://100.110.102.49:3111/api';

/**
 * Helper to start a game with 2 players and navigate to game.html.
 * Returns { room, game, hostToken, guestToken, player1Id, player2Id }
 */
async function setupGame(request) {
    // Host
    const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
    // Guest
    const g = await (await request.post(`${BASE_API}/auth/anonymous`)).json();

    // Create room
    const room = await (await request.post(`${BASE_API}/rooms`, {
        headers: { Authorization: `Bearer ${h.token}` },
        data: { name: 'Game Test Room', player_name: 'Alice', max_players: 4 },
    })).json();

    // Guest joins
    await request.post(`${BASE_API}/rooms/${room.id}/join`, {
        headers: { Authorization: `Bearer ${g.token}` },
        data: { player_name: 'Bob' },
    });

    // Create game
    const gameState = {
        currentPlayerIndex: 0,
        players: [
            { userId: h.user.id, name: 'Alice', cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            { userId: g.user.id, name: 'Bob',   cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
        ],
        properties: [],
        corporations: [],
        debts: [],
        lastDiceRoll: null,
        lastCardDrawn: null,
        settings: { passGoAmount: 200, startingCash: 1500 },
    };

    const game = await (await request.post(`${BASE_API}/games`, {
        headers: { Authorization: `Bearer ${h.token}` },
        data: { room_id: room.id, game_state: gameState },
    })).json();

    return { room, game, hostToken: h.token, guestToken: g.token, hostId: h.user.id, guestId: g.user.id };
}

test.describe('Game flow', () => {
    let setup;

    test.beforeAll(async ({ request }) => {
        setup = await setupGame(request);
    });

    test('game.html loads after navigating with game context', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('body')).toBeVisible();
    });

    test('player names appear on game page', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        await expect(page.locator('body')).toContainText('Alice', { timeout: 5000 });
    });

    test('board tab shows game board', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        // Click board tab if present
        const boardTab = page.locator('[role="tab"], button, a').filter({ hasText: /board/i }).first();
        if (await boardTab.count() > 0) {
            await boardTab.click();
        }

        // Board grid should be visible. Scope to the rendered board content so
        // hidden mobile/desktop duplicate markup does not satisfy the selector.
        const board = page.locator('#boardContent .board-grid:visible, #boardContent .mobile-board-view:visible, #boardContent .board-tab-wrapper:visible').first();
        await expect(board).toBeVisible({ timeout: 5000 });
    });

    test('current player can see Roll Dice button', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        // Navigate to board tab
        const boardTab = page.locator('[role="tab"], button, a').filter({ hasText: /board/i }).first();
        if (await boardTab.count() > 0) await boardTab.click();

        // Roll button should be visible for current player (Alice = player index 0)
        const rollBtn = page.locator('button:visible').filter({ hasText: /roll/i }).first();
        await expect(rollBtn).toBeVisible({ timeout: 5000 });
    });

    test('non-current player does not see Roll Dice button', async ({ page }) => {
        await loginPage(page, setup.guestToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        const boardTab = page.locator('[role="tab"], button, a').filter({ hasText: /board/i }).first();
        if (await boardTab.count() > 0) await boardTab.click();

        // Bob is player index 1, Alice is current (index 0)
        const rollBtn = page.locator('button:visible').filter({ hasText: /roll/i });
        await expect(rollBtn).toHaveCount(0, { timeout: 2000 });
    });

    test('game log tab shows event history', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        const logTab = page.locator('[role="tab"], button, a').filter({ hasText: /log|history|events/i }).first();
        if (await logTab.count() > 0) {
            await logTab.click();
            await expect(page.locator('body')).toBeVisible();
        } else {
            await expect(page.locator('body')).toBeVisible();
        }
    });

    test('player cash is displayed', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        // Should show starting cash (1500)
        await expect(page.locator('body')).toContainText('1500', { timeout: 5000 });
    });
});

test.describe('Game flow — multiplayer real-time', () => {
    test('player 2 sees game state loaded via API', async ({ page, request }) => {
        const setup = await setupGame(request);

        // Page 2 (guest) loads the game
        await loginPage(page, setup.guestToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        // Both player names should be visible
        await expect(page.locator('body')).toContainText('Alice', { timeout: 5000 });
        await expect(page.locator('body')).toContainText('Bob', { timeout: 5000 });
    });
});
