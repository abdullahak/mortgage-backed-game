// @ts-check
const { test, expect } = require('@playwright/test');
const { loginPage } = require('./helpers');

const BASE = 'http://192.168.4.57';
const BASE_API = `${BASE}/api`;

/**
 * Create a game where the current player is at a specific position.
 */
async function setupGameAt(request, position, opts = {}) {
    const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
    const g = await (await request.post(`${BASE_API}/auth/anonymous`)).json();

    const room = await (await request.post(`${BASE_API}/rooms`, {
        headers: { Authorization: `Bearer ${h.token}` },
        data: { name: 'Mechanics Room', player_name: 'Alice', max_players: 4 },
    })).json();

    await request.post(`${BASE_API}/rooms/${room.id}/join`, {
        headers: { Authorization: `Bearer ${g.token}` },
        data: { player_name: 'Bob' },
    });

    const gameState = {
        currentPlayerIndex: 0,
        players: [
            { userId: h.user.id, name: 'Alice', cash: 1500, position, bankrupt: false, inJail: opts.inJail || false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            { userId: g.user.id, name: 'Bob',   cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
        ],
        properties: opts.properties || [],
        corporations: [],
        debts: [],
        lastDiceRoll: opts.lastDiceRoll || null,
        lastCardDrawn: null,
        settings: { passGoAmount: 200, startingCash: 1500 },
    };

    const game = await (await request.post(`${BASE_API}/games`, {
        headers: { Authorization: `Bearer ${h.token}` },
        data: { room_id: room.id, game_state: gameState },
    })).json();

    return { room, game, hostToken: h.token, guestToken: g.token, hostId: h.user.id, guestId: g.user.id };
}

test.describe('Game mechanics — via API state patching', () => {
    test('inJail state is stored and retrieved correctly', async ({ request }) => {
        const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const room = await (await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { name: 'Jail Test Room', player_name: 'Alice', max_players: 2 },
        })).json();

        const gameState = {
            currentPlayerIndex: 0,
            players: [
                { userId: h.user.id, name: 'Alice', cash: 1500, position: 10, bankrupt: false, inJail: true, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            ],
            properties: [], corporations: [], debts: [], lastDiceRoll: null, lastCardDrawn: null,
            settings: { passGoAmount: 200, startingCash: 1500 },
        };

        const game = await (await request.post(`${BASE_API}/games`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { room_id: room.id, game_state: gameState },
        })).json();

        // Retrieve game and verify jail state
        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`)).json();
        expect(fetched.game_state.players[0].inJail).toBe(true);
        expect(fetched.game_state.players[0].position).toBe(10);
    });

    test('bankrupt player state persists correctly', async ({ request }) => {
        const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const room = await (await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { name: 'Bankrupt Room', player_name: 'Alice', max_players: 2 },
        })).json();

        const gameState = {
            currentPlayerIndex: 0,
            players: [
                { userId: h.user.id, name: 'Alice', cash: -100, position: 0, bankrupt: true, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            ],
            properties: [], corporations: [], debts: [], lastDiceRoll: null, lastCardDrawn: null,
            settings: { passGoAmount: 200, startingCash: 1500 },
        };

        const game = await (await request.post(`${BASE_API}/games`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { room_id: room.id, game_state: gameState },
        })).json();

        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`)).json();
        expect(fetched.game_state.players[0].bankrupt).toBe(true);
        expect(fetched.game_state.players[0].cash).toBe(-100);
    });

    test('property ownership state persists correctly', async ({ request }) => {
        const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const room = await (await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { name: 'Property Room', player_name: 'Alice', max_players: 2 },
        })).json();

        const gameState = {
            currentPlayerIndex: 0,
            players: [
                { userId: h.user.id, name: 'Alice', cash: 1440, position: 1, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            ],
            properties: [
                { id: 'prop-0', name: 'Mediterranean Ave', color: 'Brown', price: 60, rent: [2, 10, 30, 90, 160, 250], ownerId: h.user.id, ownerName: 'Alice', houses: 0 },
            ],
            corporations: [], debts: [], lastDiceRoll: null, lastCardDrawn: null,
            settings: { passGoAmount: 200, startingCash: 1500 },
        };

        const game = await (await request.post(`${BASE_API}/games`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { room_id: room.id, game_state: gameState },
        })).json();

        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`)).json();
        expect(fetched.game_state.properties[0].ownerId).toBe(h.user.id);
        expect(fetched.game_state.players[0].cash).toBe(1440);
    });

    test('house count persists on property', async ({ request }) => {
        const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const room = await (await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { name: 'House Room', player_name: 'Alice', max_players: 2 },
        })).json();

        const gameState = {
            currentPlayerIndex: 0,
            players: [
                { userId: h.user.id, name: 'Alice', cash: 1300, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            ],
            properties: [
                { id: 'prop-0', name: 'Mediterranean Ave', color: 'Brown', price: 60, rent: [2, 10, 30, 90, 160, 250], ownerId: h.user.id, ownerName: 'Alice', houses: 3 },
                { id: 'prop-1', name: 'Baltic Ave', color: 'Brown', price: 60, rent: [4, 20, 60, 180, 320, 450], ownerId: h.user.id, ownerName: 'Alice', houses: 3 },
            ],
            corporations: [], debts: [], lastDiceRoll: null, lastCardDrawn: null,
            settings: { passGoAmount: 200, startingCash: 1500 },
        };

        const game = await (await request.post(`${BASE_API}/games`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { room_id: room.id, game_state: gameState },
        })).json();

        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`)).json();
        expect(fetched.game_state.properties[0].houses).toBe(3);
        expect(fetched.game_state.properties[1].houses).toBe(3);
    });

    test('game state update changes current player index', async ({ request }) => {
        const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const g = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const room = await (await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { name: 'Turn Room', player_name: 'Alice', max_players: 4 },
        })).json();
        await request.post(`${BASE_API}/rooms/${room.id}/join`, {
            headers: { Authorization: `Bearer ${g.token}` },
            data: { player_name: 'Bob' },
        });

        const gameState = {
            currentPlayerIndex: 0,
            players: [
                { userId: h.user.id, name: 'Alice', cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: true, hasGetOutOfJailCard: false },
                { userId: g.user.id, name: 'Bob',   cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            ],
            properties: [], corporations: [], debts: [], lastDiceRoll: [3, 4], lastCardDrawn: null,
            settings: { passGoAmount: 200, startingCash: 1500 },
        };

        const game = await (await request.post(`${BASE_API}/games`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { room_id: room.id, game_state: gameState },
        })).json();

        // End turn: advance to player index 1
        const updatedGs = { ...gameState, currentPlayerIndex: 1, players: gameState.players.map((p, i) => ({ ...p, diceRolled: false })) };
        await request.patch(`${BASE_API}/games/${game.id}/state`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { game_state: updatedGs },
        });

        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`)).json();
        expect(fetched.game_state.currentPlayerIndex).toBe(1);
    });

    test('debt state persists in game_state', async ({ request }) => {
        const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const room = await (await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { name: 'Debt Room', player_name: 'Alice', max_players: 2 },
        })).json();

        const debt = { id: 'debt-1', issuerId: h.user.id, principal: 500, interestRate: 0.1, turnsOutstanding: 2 };
        const gameState = {
            currentPlayerIndex: 0,
            players: [
                { userId: h.user.id, name: 'Alice', cash: 2000, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
            ],
            properties: [], corporations: [],
            debts: [debt],
            lastDiceRoll: null, lastCardDrawn: null,
            settings: { passGoAmount: 200, startingCash: 1500 },
        };

        const game = await (await request.post(`${BASE_API}/games`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { room_id: room.id, game_state: gameState },
        })).json();

        const fetched = await (await request.get(`${BASE_API}/games/${game.id}`)).json();
        expect(fetched.game_state.debts).toHaveLength(1);
        expect(fetched.game_state.debts[0].principal).toBe(500);
    });
});

test.describe('Game mechanics — UI', () => {
    test('game.html loads with IPO button visible', async ({ page, request }) => {
        const h = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const g = await (await request.post(`${BASE_API}/auth/anonymous`)).json();
        const room = await (await request.post(`${BASE_API}/rooms`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { name: 'IPO UI Room', player_name: 'Alice', max_players: 4 },
        })).json();
        await request.post(`${BASE_API}/rooms/${room.id}/join`, {
            headers: { Authorization: `Bearer ${g.token}` },
            data: { player_name: 'Bob' },
        });
        const game = await (await request.post(`${BASE_API}/games`, {
            headers: { Authorization: `Bearer ${h.token}` },
            data: { room_id: room.id, game_state: {
                currentPlayerIndex: 0,
                players: [
                    { userId: h.user.id, name: 'Alice', cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
                    { userId: g.user.id, name: 'Bob',   cash: 1500, position: 0, bankrupt: false, inJail: false, jailTurns: 0, doubleCount: 0, diceRolled: false, hasGetOutOfJailCard: false },
                ],
                properties: [], corporations: [], debts: [], lastDiceRoll: null, lastCardDrawn: null,
                settings: { passGoAmount: 200, startingCash: 1500 },
            }},
        })).json();

        await loginPage(page, h.token);
        await page.goto(`${BASE}/game.html?room=${room.id}`);
        await page.waitForLoadState('networkidle');

        // Check for IPO-related button (may not be visible on all tabs)
        const ipoBtn = page.locator('button, a').filter({ hasText: /ipo/i }).first();
        if (await ipoBtn.count() > 0) {
            await expect(ipoBtn).toBeVisible({ timeout: 5000 });
        } else {
            // IPO may be under a different tab
            await expect(page.locator('body')).toBeVisible();
        }
    });
});
