'use strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';
process.env.RATE_LIMIT_ENABLED = 'true';
process.env.AUTH_RATE_LIMIT_MAX = '2';
process.env.AUTH_RATE_LIMIT_WINDOW_MS = '60000';
process.env.ROOM_CREATE_RATE_LIMIT_MAX = '1';
process.env.ROOM_CREATE_RATE_LIMIT_WINDOW_MS = '60000';
process.env.GAME_ACTION_RATE_LIMIT_MAX = '1';
process.env.GAME_ACTION_RATE_LIMIT_WINDOW_MS = '60000';
process.env.MANUAL_EVENT_RATE_LIMIT_MAX = '1';
process.env.MANUAL_EVENT_RATE_LIMIT_WINDOW_MS = '60000';

const request = require('supertest');

let app, db;

beforeAll(() => {
    const { app: a } = require('../../server');
    const d = require('../../db');
    app = a;
    db = d;
});

beforeEach(() => {
    db.exec(`DELETE FROM game_actions; DELETE FROM game_events; DELETE FROM games; DELETE FROM room_members; DELETE FROM rooms; DELETE FROM otps; DELETE FROM users;`);
});

afterAll(() => {
    [
        'RATE_LIMIT_ENABLED',
        'AUTH_RATE_LIMIT_MAX',
        'AUTH_RATE_LIMIT_WINDOW_MS',
        'ROOM_CREATE_RATE_LIMIT_MAX',
        'ROOM_CREATE_RATE_LIMIT_WINDOW_MS',
        'GAME_ACTION_RATE_LIMIT_MAX',
        'GAME_ACTION_RATE_LIMIT_WINDOW_MS',
        'MANUAL_EVENT_RATE_LIMIT_MAX',
        'MANUAL_EVENT_RATE_LIMIT_WINDOW_MS',
    ].forEach(key => delete process.env[key]);
});

describe('production rate limits', () => {
    test('limits auth requests by client, path, and email', async () => {
        await request(app).post('/api/auth/send-otp').send({ email: 'limit@example.com' }).expect(200);
        await request(app).post('/api/auth/send-otp').send({ email: 'limit@example.com' }).expect(200);

        const limited = await request(app)
            .post('/api/auth/send-otp')
            .send({ email: 'limit@example.com' });

        expect(limited.status).toBe(429);
        expect(limited.body.error).toBe('Too many requests');
        expect(limited.headers['retry-after']).toBeTruthy();
        expect(limited.headers['x-ratelimit-limit']).toBe('2');
        expect(limited.headers['x-ratelimit-remaining']).toBe('0');
    });

    test('limits room creation per authenticated user', async () => {
        const { createUserFixture } = require('../helpers/fixtures');
        const user = createUserFixture(db);

        await request(app)
            .post('/api/rooms')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ name: 'First Room', player_name: 'Alice' })
            .expect(200);

        const limited = await request(app)
            .post('/api/rooms')
            .set('Authorization', `Bearer ${user.token}`)
            .send({ name: 'Second Room', player_name: 'Alice' });

        expect(limited.status).toBe(429);
        expect(limited.body.error).toBe('Too many requests');
        expect(db.prepare(`SELECT COUNT(*) AS count FROM rooms`).get().count).toBe(1);
    });

    test('limits authoritative game actions per game and actor', async () => {
        const { user1, game } = createTwoPlayerGame();

        await request(app)
            .post(`/api/games/${game.id}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ actionId: 'first-action', type: 'end_turn', expectedVersion: 0 })
            .expect(200);

        const limited = await request(app)
            .post(`/api/games/${game.id}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ actionId: 'second-action', type: 'end_turn', expectedVersion: 1 });

        expect(limited.status).toBe(429);
        expect(limited.body.error).toBe('Too many requests');
        expect(db.prepare(`SELECT COUNT(*) AS count FROM game_actions WHERE game_id = ?`).get(game.id).count).toBe(1);
    });

    test('limits manual game event writes per game and actor', async () => {
        const { user1, game } = createTwoPlayerGame();

        await request(app)
            .post(`/api/games/${game.id}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_type: 'note', event_data: { body: 'first' } })
            .expect(200);

        const limited = await request(app)
            .post(`/api/games/${game.id}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_type: 'note', event_data: { body: 'second' } });

        expect(limited.status).toBe(429);
        expect(limited.body.error).toBe('Too many requests');
        expect(db.prepare(`SELECT COUNT(*) AS count FROM game_events WHERE game_id = ?`).get(game.id).count).toBe(1);
    });
});

function createTwoPlayerGame() {
    const {
        createUserFixture,
        createRoomFixture,
        createGameFixture,
        buildGameState,
    } = require('../helpers/fixtures');

    const user1 = createUserFixture(db);
    const user2 = createUserFixture(db);
    const room = createRoomFixture(db, user1.id, { maxPlayers: 4 });
    db.prepare(`
        INSERT INTO room_members (id, room_id, user_id, player_name)
        VALUES (?, ?, ?, ?)
    `).run(`member-${user2.id}`, room.id, user2.id, 'Bob');

    const gameState = buildGameState(['Alice', 'Bob']);
    gameState.players[0].userId = user1.id;
    gameState.players[0].diceRolled = true;
    gameState.players[1].userId = user2.id;
    const game = createGameFixture(db, room.id, { gameState });

    return { user1, user2, room, game };
}
