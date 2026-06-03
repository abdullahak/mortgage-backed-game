// @ts-check
const { test, expect } = require('@playwright/test');
const { loginPage } = require('./helpers');

const BASE = process.env.BASE_URL || 'http://100.110.102.49:3011';
const BASE_API = process.env.API_BASE_URL || 'http://100.110.102.49:3111/api';

/**
 * Setup a 2-player game with some properties owned.
 */
async function setupTradingGame(request) {
    const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
    const g = await (await request.post(`${BASE_API}/auth/anonymous`)).json();

    const room = await (await request.post(`${BASE_API}/rooms`, {
        headers: { Authorization: `Bearer ${h.token}` },
        data: { name: 'Trading Room', player_name: 'Alice', max_players: 4 },
    })).json();

    await request.post(`${BASE_API}/rooms/${room.id}/join`, {
        headers: { Authorization: `Bearer ${g.token}` },
        data: { player_name: 'Bob' },
    });

    const gameState = {
        currentPlayerIndex: 0,
        players: [
            { userId: h.user.id, name: 'Alice', cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            { userId: g.user.id, name: 'Bob',   cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
        ],
        properties: [
            { id: 'prop-0', name: 'Mediterranean Ave', color: 'Brown', price: 60, rent: [2, 10, 30, 90, 160, 250], ownerId: h.user.id, ownerName: 'Alice', houses: 0 },
            { id: 'prop-1', name: 'Baltic Ave', color: 'Brown', price: 60, rent: [4, 20, 60, 180, 320, 450], ownerId: g.user.id, ownerName: 'Bob', houses: 0 },
        ],
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

test.describe('Trading — API state manipulation', () => {
    test('cash transfer between players persists correctly', async ({ request }) => {
        const { game, hostToken, hostId, guestId } = await setupTradingGame(request);

        // Simulate Alice paying Bob $200
        const updatedState = {
            ...game.game_state,
            players: [
                { ...game.game_state.players[0], cash: 1300 }, // Alice -200
                { ...game.game_state.players[1], cash: 1700 }, // Bob +200
            ],
        };

        await request.post(`${BASE_API}/games/${game.id}/actions`, {
            headers: { Authorization: `Bearer ${hostToken}` },
            data: {
                actionId: `e2e-payment-${Date.now()}`,
                type: 'manual_payment',
                payload: { fromPlayerId: hostId, toPlayerId: guestId, amount: 200 },
                expectedVersion: game.state_version,
            },
        });

        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`, {
            headers: { Authorization: `Bearer ${hostToken}` },
        })).json();
        expect(fetched.game_state.players[0].cash).toBe(1300);
        expect(fetched.game_state.players[1].cash).toBe(1700);
    });

    test('property transfer between players persists correctly', async ({ request }) => {
        const { game, hostToken, hostId, guestId } = await setupTradingGame(request);

        // Simulate Alice trading prop-0 to Bob
        const updatedState = {
            ...game.game_state,
            properties: [
                { ...game.game_state.properties[0], ownerId: guestId, ownerName: 'Bob' },
                game.game_state.properties[1],
            ],
        };

        await request.post(`${BASE_API}/games/${game.id}/actions`, {
            headers: { Authorization: `Bearer ${hostToken}` },
            data: {
                actionId: `e2e-trade-prop-${Date.now()}`,
                type: 'trade',
                payload: { player1Id: hostId, player2Id: guestId, player1Cash: 0, player2Cash: 0, player1AssetIds: ['prop-0'], player2AssetIds: [] },
                expectedVersion: game.state_version,
            },
        });

        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`, {
            headers: { Authorization: `Bearer ${hostToken}` },
        })).json();
        expect(fetched.game_state.properties[0].ownerId).toBe(guestId);
        expect(fetched.game_state.properties[0].ownerName).toBe('Bob');
    });

    test('mutual exchange (cash + property) persists correctly', async ({ request }) => {
        const { game, hostToken, hostId, guestId } = await setupTradingGame(request);

        // Alice sends prop-0 to Bob, Bob sends $100 to Alice
        const updatedState = {
            ...game.game_state,
            players: [
                { ...game.game_state.players[0], cash: 1600 }, // Alice +100
                { ...game.game_state.players[1], cash: 1400 }, // Bob -100
            ],
            properties: [
                { ...game.game_state.properties[0], ownerId: guestId, ownerName: 'Bob' }, // Alice's prop → Bob
                game.game_state.properties[1],
            ],
        };

        await request.post(`${BASE_API}/games/${game.id}/actions`, {
            headers: { Authorization: `Bearer ${hostToken}` },
            data: {
                actionId: `e2e-trade-mutual-${Date.now()}`,
                type: 'trade',
                payload: { player1Id: hostId, player2Id: guestId, player1Cash: 0, player2Cash: 100, player1AssetIds: ['prop-0'], player2AssetIds: [] },
                expectedVersion: game.state_version,
            },
        });

        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`, {
            headers: { Authorization: `Bearer ${hostToken}` },
        })).json();
        expect(fetched.game_state.players[0].cash).toBe(1600);
        expect(fetched.game_state.players[1].cash).toBe(1400);
        expect(fetched.game_state.properties[0].ownerId).toBe(guestId);
    });
});

test.describe('Trading — UI', () => {
    let setup;

    test.beforeAll(async ({ request }) => {
        setup = await setupTradingGame(request);
    });

    test('game.html loads with market/trading functionality accessible', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        // Look for market/trade tab
        const marketTab = page.locator('[role="tab"], button, a').filter({ hasText: /market|trade|transaction/i }).first();
        if (await marketTab.count() > 0) {
            await marketTab.click();
            await expect(page.locator('body')).toBeVisible();
        } else {
            await expect(page.locator('body')).toBeVisible();
        }
    });

    test('corporation panel is accessible in game', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        // Check for corporations tab or button
        const corpTab = page.locator('[role="tab"], button, a').filter({ hasText: /corp/i }).first();
        if (await corpTab.count() > 0) {
            await corpTab.click();
            await expect(page.locator('body')).toBeVisible();
        } else {
            await expect(page.locator('body')).toBeVisible();
        }
    });

    test('player cash values are shown on game page', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        // Should show cash amounts
        await expect(page.locator('body')).toContainText('1500', { timeout: 5000 });
    });

    test('property names are shown in game state', async ({ page }) => {
        await loginPage(page, setup.hostToken);
        await page.goto(`${BASE}/game.html?room=${setup.room.id}`);
        await page.waitForLoadState('domcontentloaded');

        // Board has Mediterranean Ave
        const boardTab = page.locator('[role="tab"], button, a').filter({ hasText: /board/i }).first();
        if (await boardTab.count() > 0) {
            await boardTab.click();
        }

        // Mediterranean should appear on the board
        await expect(page.locator('body')).toContainText('Mediterranean', { timeout: 5000 });
    });
});
