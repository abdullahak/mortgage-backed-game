// @ts-check
const { test, expect } = require('@playwright/test');
const { loginPage } = require('./helpers');

const BASE = process.env.BASE_URL || 'http://100.110.102.49:3011';
const BASE_API = process.env.API_BASE_URL || 'http://100.110.102.49:3111/api';

async function apiJson(request, method, url, options = {}) {
    const res = await request[method](url, options);
    const text = await res.text();
    let body = null;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {
        body = text;
    }
    expect(res.ok(), `${method.toUpperCase()} ${url} failed ${res.status()}: ${text}`).toBeTruthy();
    return body;
}

async function setupTwoPlayerGame(request, label, playerNames) {
    const host = await apiJson(request, 'post', `${BASE_API}/auth/anonymous`);
    const guest = await apiJson(request, 'post', `${BASE_API}/auth/anonymous`);

    const room = await apiJson(request, 'post', `${BASE_API}/rooms`, {
        headers: { Authorization: `Bearer ${host.token}` },
        data: {
            name: `${label} ${Date.now()}`,
            player_name: playerNames[0],
            max_players: 4,
        },
    });

    await apiJson(request, 'post', `${BASE_API}/rooms/${room.id}/join`, {
        headers: { Authorization: `Bearer ${guest.token}` },
        data: { player_name: playerNames[1] },
    });

    const gameState = {
        currentPlayerIndex: 0,
        players: [
            playerState(host.user.id, playerNames[0]),
            playerState(guest.user.id, playerNames[1]),
        ],
        properties: [],
        corporations: [],
        debts: [],
        marketOffers: [],
        gameLog: [],
        lastDiceRoll: null,
        lastCardDrawn: null,
        settings: { passGoAmount: 200, startingCash: 1500, interestRate: 5 },
    };

    const game = await apiJson(request, 'post', `${BASE_API}/games`, {
        headers: { Authorization: `Bearer ${host.token}` },
        data: { room_id: room.id, game_state: gameState },
    });

    return { room, game, host, guest, hostName: playerNames[0], guestName: playerNames[1] };
}

function playerState(userId, name) {
    return {
        userId,
        name,
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
    };
}

async function fetchGame(request, gameId, token) {
    return apiJson(request, 'get', `${BASE_API}/games/${gameId}`, {
        headers: { Authorization: `Bearer ${token}` },
    });
}

test.describe('Concurrent games', () => {
    test('separate rooms can progress independently without state bleed', async ({ page, request }) => {
        const gameA = await setupTwoPlayerGame(request, 'Concurrent Room A', ['Alice A', 'Bob A']);
        const gameB = await setupTwoPlayerGame(request, 'Concurrent Room B', ['Alice B', 'Bob B']);

        await apiJson(request, 'post', `${BASE_API}/games/${gameA.game.id}/actions`, {
            headers: { Authorization: `Bearer ${gameA.host.token}` },
            data: {
                actionId: `concurrent-a-payment-${Date.now()}`,
                type: 'manual_payment',
                payload: {
                    fromPlayerId: gameA.host.user.id,
                    toPlayerId: gameA.guest.user.id,
                    amount: 25,
                },
                expectedVersion: gameA.game.state_version,
            },
        });

        const afterA = await fetchGame(request, gameA.game.id, gameA.host.token);
        const untouchedB = await fetchGame(request, gameB.game.id, gameB.host.token);

        expect(afterA.state_version).toBe(1);
        expect(afterA.game_state.players.find(player => player.userId === gameA.host.user.id).cash).toBe(1475);
        expect(afterA.game_state.players.find(player => player.userId === gameA.guest.user.id).cash).toBe(1525);
        expect(untouchedB.state_version).toBe(0);
        expect(untouchedB.game_state.players.find(player => player.userId === gameB.host.user.id).cash).toBe(1500);
        expect(untouchedB.game_state.players.find(player => player.userId === gameB.guest.user.id).cash).toBe(1500);

        await Promise.all([
            apiJson(request, 'post', `${BASE_API}/games/${gameA.game.id}/actions`, {
                headers: { Authorization: `Bearer ${gameA.guest.token}` },
                data: {
                    actionId: `concurrent-a-return-${Date.now()}`,
                    type: 'manual_payment',
                    payload: {
                        fromPlayerId: gameA.guest.user.id,
                        toPlayerId: gameA.host.user.id,
                        amount: 5,
                    },
                    expectedVersion: afterA.state_version,
                },
            }),
            apiJson(request, 'post', `${BASE_API}/games/${gameB.game.id}/actions`, {
                headers: { Authorization: `Bearer ${gameB.host.token}` },
                data: {
                    actionId: `concurrent-b-payment-${Date.now()}`,
                    type: 'manual_payment',
                    payload: {
                        fromPlayerId: gameB.host.user.id,
                        toPlayerId: gameB.guest.user.id,
                        amount: 40,
                    },
                    expectedVersion: gameB.game.state_version,
                },
            }),
        ]);

        const finalA = await fetchGame(request, gameA.game.id, gameA.host.token);
        const finalB = await fetchGame(request, gameB.game.id, gameB.host.token);

        expect(finalA.state_version).toBe(2);
        expect(finalA.game_state.players.find(player => player.userId === gameA.host.user.id).cash).toBe(1480);
        expect(finalA.game_state.players.find(player => player.userId === gameA.guest.user.id).cash).toBe(1520);
        expect(finalB.state_version).toBe(1);
        expect(finalB.game_state.players.find(player => player.userId === gameB.host.user.id).cash).toBe(1460);
        expect(finalB.game_state.players.find(player => player.userId === gameB.guest.user.id).cash).toBe(1540);

        await loginPage(page, gameA.host.token);
        await page.goto(`${BASE}/game.html?room=${gameA.room.id}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('body')).toContainText('Alice A', { timeout: 5000 });
        await expect(page.locator('body')).toContainText('Bob A');
        await expect(page.locator('body')).not.toContainText('Alice B');

        await page.evaluate(token => localStorage.setItem('auth_token', token), gameB.host.token);
        await page.goto(`${BASE}/game.html?room=${gameB.room.id}`);
        await page.waitForLoadState('domcontentloaded');
        await expect(page.locator('body')).toContainText('Alice B', { timeout: 5000 });
        await expect(page.locator('body')).toContainText('Bob B');
        await expect(page.locator('body')).not.toContainText('Alice A');
    });
});
