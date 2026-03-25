/**
 * E2E test helpers for mortgage-backed-game Playwright tests.
 */

const BASE_API = 'http://192.168.4.57/api';

/**
 * Create an authenticated user via the API and return {token, user}.
 */
async function createAndLoginUser(request, email) {
    // Request OTP
    await request.post(`${BASE_API}/auth/send-otp`, { data: { email } });

    // Get the OTP from the server logs — in tests we use the API to get the code
    // Since we can't intercept logs, use anonymous auth instead for E2E helpers
    const res = await request.post(`${BASE_API}/auth/anonymous`);
    const body = await res.json();
    return body; // { token, user }
}

/**
 * Set the auth token in a page's localStorage and reload.
 */
async function loginPage(page, token) {
    await page.evaluate((t) => localStorage.setItem('auth_token', t), token);
}

/**
 * Create a room via the API.
 */
async function createRoom(request, token, opts = {}) {
    const res = await request.post(`${BASE_API}/rooms`, {
        headers: { Authorization: `Bearer ${token}` },
        data: {
            name: opts.name || 'Test Room',
            player_name: opts.playerName || 'Host',
            max_players: opts.maxPlayers || 4,
        },
    });
    return await res.json();
}

module.exports = { createAndLoginUser, loginPage, createRoom };
