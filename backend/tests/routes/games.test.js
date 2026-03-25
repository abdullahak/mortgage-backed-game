'use strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');

let app, db;
let user1, user2, room;

beforeAll(() => {
    const { app: a } = require('../../server');
    const d = require('../../db');
    app = a;
    db = d;
});

beforeEach(() => {
    db.exec(`DELETE FROM game_events; DELETE FROM games; DELETE FROM room_members; DELETE FROM rooms; DELETE FROM otps; DELETE FROM users;`);
    const { createUserFixture, createRoomFixture } = require('../helpers/fixtures');
    user1 = createUserFixture(db);
    user2 = createUserFixture(db);
    room = createRoomFixture(db, user1.id, { inviteCode: 'ROOM01', maxPlayers: 4 });
});

function minimalGameState() {
    return {
        currentPlayerIndex: 0,
        players: [
            { userId: user1.id, name: 'Alice', cash: 1500, position: 0, bankrupt: false, inJail: false },
            { userId: user2.id, name: 'Bob',   cash: 1500, position: 0, bankrupt: false, inJail: false },
        ],
        properties: [],
        corporations: [],
        lastDiceRoll: null,
        lastCardDrawn: null,
        settings: { passGoAmount: 200, startingCash: 1500 },
    };
}

// ---------------------------------------------------------------------------
// POST /api/games
// ---------------------------------------------------------------------------
describe('POST /api/games', () => {
    test('creates game with game_state, returns parsed state', async () => {
        const gs = minimalGameState();
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: gs });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('id');
        expect(res.body.room_id).toBe(room.id);
        expect(typeof res.body.game_state).toBe('object');
    });

    test('game_state is returned as parsed object (not string)', async () => {
        const gs = minimalGameState();
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: gs });

        expect(res.body.game_state).toHaveProperty('players');
        expect(Array.isArray(res.body.game_state.players)).toBe(true);
    });

    test('400 if room_id is missing', async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ game_state: minimalGameState() });

        expect(res.status).toBe(400);
    });

    test('400 if game_state is missing', async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id });

        expect(res.status).toBe(400);
    });

    test('403 if requester is not room host', async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user2.token}`)
            .send({ room_id: room.id, game_state: minimalGameState() });

        expect(res.status).toBe(403);
    });

    test('401 without auth', async () => {
        const res = await request(app)
            .post('/api/games')
            .send({ room_id: room.id, game_state: minimalGameState() });

        expect(res.status).toBe(401);
    });

    test('sets room_id correctly in DB', async () => {
        const gs = minimalGameState();
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: gs });

        const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(res.body.id);
        expect(game.room_id).toBe(room.id);
    });

    test('game_state stored as JSON string in DB', async () => {
        const gs = minimalGameState();
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: gs });

        const game = db.prepare(`SELECT game_state FROM games WHERE id = ?`).get(res.body.id);
        expect(typeof game.game_state).toBe('string');
        expect(() => JSON.parse(game.game_state)).not.toThrow();
    });
});

// ---------------------------------------------------------------------------
// GET /api/games/by-room/:roomId
// ---------------------------------------------------------------------------
describe('GET /api/games/by-room/:roomId', () => {
    let gameId;

    beforeEach(async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: minimalGameState() });
        gameId = res.body.id;
    });

    test('200 returns game with parsed game_state', async () => {
        const res = await request(app).get(`/api/games/by-room/${room.id}`);
        expect(res.status).toBe(200);
        expect(typeof res.body.game_state).toBe('object');
    });

    test('404 if no game for room', async () => {
        const { createRoomFixture } = require('../helpers/fixtures');
        const emptyRoom = createRoomFixture(db, user1.id, { inviteCode: 'EMPTY1' });
        const res = await request(app).get(`/api/games/by-room/${emptyRoom.id}`);
        expect(res.status).toBe(404);
    });

    test('no auth required', async () => {
        const res = await request(app).get(`/api/games/by-room/${room.id}`);
        expect(res.status).toBe(200);
    });

    test('returns correct room_id', async () => {
        const res = await request(app).get(`/api/games/by-room/${room.id}`);
        expect(res.body.room_id).toBe(room.id);
    });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id
// ---------------------------------------------------------------------------
describe('GET /api/games/:id', () => {
    let gameId;

    beforeEach(async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: minimalGameState() });
        gameId = res.body.id;
    });

    test('200 returns game by ID', async () => {
        const res = await request(app).get(`/api/games/${gameId}`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(gameId);
    });

    test('404 for non-existent game', async () => {
        const res = await request(app).get('/api/games/nonexistent-id');
        expect(res.status).toBe(404);
    });

    test('no auth required', async () => {
        const res = await request(app).get(`/api/games/${gameId}`);
        expect(res.status).toBe(200);
    });

    test('game_state is parsed JSON object (not string)', async () => {
        const res = await request(app).get(`/api/games/${gameId}`);
        expect(typeof res.body.game_state).toBe('object');
        expect(typeof res.body.game_state).not.toBe('string');
    });
});

// ---------------------------------------------------------------------------
// PATCH /api/games/:id/state
// ---------------------------------------------------------------------------
describe('PATCH /api/games/:id/state', () => {
    let gameId;

    beforeEach(async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: minimalGameState() });
        gameId = res.body.id;
    });

    test('200 updates game_state', async () => {
        const updatedGs = { ...minimalGameState(), currentPlayerIndex: 1 };
        const res = await request(app)
            .patch(`/api/games/${gameId}/state`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ game_state: updatedGs });

        expect(res.status).toBe(200);
    });

    test('state persisted after update', async () => {
        const updatedGs = { ...minimalGameState(), currentPlayerIndex: 1 };
        await request(app)
            .patch(`/api/games/${gameId}/state`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ game_state: updatedGs });

        const game = db.prepare(`SELECT game_state FROM games WHERE id = ?`).get(gameId);
        const parsed = JSON.parse(game.game_state);
        expect(parsed.currentPlayerIndex).toBe(1);
    });

    test('400 with missing game_state', async () => {
        const res = await request(app)
            .patch(`/api/games/${gameId}/state`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({});

        expect(res.status).toBe(400);
    });

    test('401 without auth', async () => {
        const res = await request(app)
            .patch(`/api/games/${gameId}/state`)
            .send({ game_state: minimalGameState() });

        expect(res.status).toBe(401);
    });

    test('404 for non-existent game', async () => {
        const res = await request(app)
            .patch('/api/games/nonexistent/state')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ game_state: minimalGameState() });

        expect(res.status).toBe(404);
    });

    test('large game_state (8 players, many properties) round-trips correctly', async () => {
        const bigState = {
            ...minimalGameState(),
            players: Array.from({ length: 8 }, (_, i) => ({
                userId: `u${i}`, name: `Player${i}`, cash: 1500 + i * 100,
                position: i * 5, bankrupt: false, inJail: false,
            })),
            properties: Array.from({ length: 28 }, (_, i) => ({
                id: `prop-${i}`, color: 'Brown', price: 60 + i * 10,
                rent: [2, 10, 30, 90, 160, 250], ownerId: null, houses: 0,
            })),
        };

        await request(app)
            .patch(`/api/games/${gameId}/state`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ game_state: bigState });

        const game = db.prepare(`SELECT game_state FROM games WHERE id = ?`).get(gameId);
        const parsed = JSON.parse(game.game_state);
        expect(parsed.players).toHaveLength(8);
        expect(parsed.properties).toHaveLength(28);
        expect(parsed.players[7].cash).toBe(1500 + 7 * 100);
    });
});

// ---------------------------------------------------------------------------
// POST /api/games/:id/events
// ---------------------------------------------------------------------------
describe('POST /api/games/:id/events', () => {
    let gameId;

    beforeEach(async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: minimalGameState() });
        gameId = res.body.id;
    });

    test('201/200 logs event successfully', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_type: 'dice_roll', event_data: { roll: [3, 4] } });

        expect([200, 201]).toContain(res.status);
    });

    test('400 with missing event_type', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_data: {} });

        expect(res.status).toBe(400);
    });

    test('401 without auth', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/events`)
            .send({ event_type: 'dice_roll' });

        expect(res.status).toBe(401);
    });

    test('event is stored in DB', async () => {
        await request(app)
            .post(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_type: 'test_event', event_data: { foo: 'bar' } });

        const event = db.prepare(`SELECT * FROM game_events WHERE game_id = ? AND event_type = 'test_event'`).get(gameId);
        expect(event).toBeTruthy();
        expect(JSON.parse(event.event_data)).toEqual({ foo: 'bar' });
    });

    test('multiple events can be logged in sequence', async () => {
        await request(app).post(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_type: 'event1' });
        await request(app).post(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_type: 'event2' });

        const events = db.prepare(`SELECT * FROM game_events WHERE game_id = ?`).all(gameId);
        expect(events.length).toBeGreaterThanOrEqual(2);
    });
});

// ---------------------------------------------------------------------------
// GET /api/games/:id/events
// ---------------------------------------------------------------------------
describe('GET /api/games/:id/events', () => {
    let gameId;

    beforeEach(async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: minimalGameState() });
        gameId = res.body.id;
    });

    test('200 returns events array', async () => {
        const res = await request(app).get(`/api/games/${gameId}/events`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('returns empty array if no events', async () => {
        const res = await request(app).get(`/api/games/${gameId}/events`);
        expect(res.body).toEqual([]);
    });

    test('event_data is parsed JSON', async () => {
        await request(app).post(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_type: 'buy', event_data: { property: 'prop-0', price: 60 } });

        const res = await request(app).get(`/api/games/${gameId}/events`);
        expect(res.body[0].event_data).toEqual({ property: 'prop-0', price: 60 });
    });

    test('no auth required to get events', async () => {
        const res = await request(app).get(`/api/games/${gameId}/events`);
        expect(res.status).toBe(200);
    });
});

// ---------------------------------------------------------------------------
// Game State Integrity
// ---------------------------------------------------------------------------
describe('Game state integrity', () => {
    test('deeply nested game_state is preserved exactly', async () => {
        const deepState = {
            ...minimalGameState(),
            meta: { nested: { deeply: { value: 42, arr: [1, 2, 3] } } },
        };

        const createRes = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: deepState });

        const getRes = await request(app).get(`/api/games/${createRes.body.id}`);
        expect(getRes.body.game_state.meta.nested.deeply.value).toBe(42);
        expect(getRes.body.game_state.meta.nested.deeply.arr).toEqual([1, 2, 3]);
    });

    test('unicode player names in game_state handled correctly', async () => {
        const { createRoomFixture } = require('../helpers/fixtures');
        const unicodeRoom = createRoomFixture(db, user1.id, { inviteCode: 'UNCD01' });

        const unicodeState = {
            ...minimalGameState(),
            players: [{ userId: user1.id, name: '日本語プレーヤー', cash: 1500, position: 0, bankrupt: false, inJail: false }],
        };

        const createRes = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: unicodeRoom.id, game_state: unicodeState });

        const getRes = await request(app).get(`/api/games/${createRes.body.id}`);
        expect(getRes.body.game_state.players[0].name).toBe('日本語プレーヤー');
    });
});
