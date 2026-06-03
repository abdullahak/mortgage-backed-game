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
            { userId: user1.id, name: 'Alice', cash: 1500, position: 0, bankrupt: false, inJail: false, properties: [], corporations: [], debts: [] },
            { userId: user2.id, name: 'Bob',   cash: 1500, position: 0, bankrupt: false, inJail: false, properties: [], corporations: [], debts: [] },
        ],
        properties: [],
        corporations: [],
        gameLog: [],
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

    test('creates default authoritative state if game_state is missing', async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id });

        expect(res.status).toBe(200);
        expect(res.body.game_state.players).toHaveLength(1);
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

    test('duplicate create returns existing game instead of 500', async () => {
        const gs = minimalGameState();
        const first = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: gs });

        const second = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: gs });

        expect(second.status).toBe(200);
        expect(second.body.id).toBe(first.body.id);
    });

    test('creating game marks room in_progress', async () => {
        const gs = minimalGameState();
        await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: gs });

        const updatedRoom = db.prepare(`SELECT status FROM rooms WHERE id = ?`).get(room.id);
        expect(updatedRoom.status).toBe('in_progress');
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
        const res = await request(app)
            .get(`/api/games/by-room/${room.id}`)
            .set('Authorization', `Bearer ${user1.token}`);
        expect(res.status).toBe(200);
        expect(typeof res.body.game_state).toBe('object');
    });

    test('404 if no game for room', async () => {
        const { createRoomFixture } = require('../helpers/fixtures');
        const emptyRoom = createRoomFixture(db, user1.id, { inviteCode: 'EMPTY1' });
        const res = await request(app)
            .get(`/api/games/by-room/${emptyRoom.id}`)
            .set('Authorization', `Bearer ${user1.token}`);
        expect(res.status).toBe(404);
    });

    test('auth required', async () => {
        const res = await request(app).get(`/api/games/by-room/${room.id}`);
        expect(res.status).toBe(401);
    });

    test('returns correct room_id', async () => {
        const res = await request(app)
            .get(`/api/games/by-room/${room.id}`)
            .set('Authorization', `Bearer ${user1.token}`);
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
        const res = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', `Bearer ${user1.token}`);
        expect(res.status).toBe(200);
        expect(res.body.id).toBe(gameId);
    });

    test('404 for non-existent game', async () => {
        const res = await request(app)
            .get('/api/games/nonexistent-id')
            .set('Authorization', `Bearer ${user1.token}`);
        expect(res.status).toBe(404);
    });

    test('auth required', async () => {
        const res = await request(app).get(`/api/games/${gameId}`);
        expect(res.status).toBe(401);
    });

    test('game_state is parsed JSON object (not string)', async () => {
        const res = await request(app)
            .get(`/api/games/${gameId}`)
            .set('Authorization', `Bearer ${user1.token}`);
        expect(typeof res.body.game_state).toBe('object');
        expect(typeof res.body.game_state).not.toBe('string');
    });
});

// ---------------------------------------------------------------------------
// POST /api/games/:id/actions
// ---------------------------------------------------------------------------
describe('POST /api/games/:id/actions', () => {
    let gameId;

    beforeEach(async () => {
        const res = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: room.id, game_state: minimalGameState() });
        gameId = res.body.id;
    });

    function actionPayload(type, payload = {}, expectedVersion = 0, actionId = uuidForTest()) {
        return { actionId, type, payload, expectedVersion };
    }

    test('200 applies end_turn action', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send(actionPayload('end_turn'));

        expect(res.status).toBe(200);
        expect(res.body.game.state_version).toBe(1);
        expect(res.body.game.game_state.currentPlayerIndex).toBe(1);
    });

    test('state persisted after action', async () => {
        await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send(actionPayload('end_turn'));

        const game = db.prepare(`SELECT game_state FROM games WHERE id = ?`).get(gameId);
        const parsed = JSON.parse(game.game_state);
        expect(parsed.currentPlayerIndex).toBe(1);
    });

    test('400 with missing actionId', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ type: 'end_turn', expectedVersion: 0 });

        expect(res.status).toBe(400);
    });

    test('400 with missing type', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ actionId: uuidForTest(), expectedVersion: 0 });

        expect(res.status).toBe(400);
    });

    test('400 with missing expectedVersion', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ actionId: uuidForTest(), type: 'end_turn' });

        expect(res.status).toBe(400);
    });

    test('401 without auth', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .send(actionPayload('end_turn'));

        expect(res.status).toBe(401);
    });

    test('404 for non-existent game', async () => {
        const res = await request(app)
            .post('/api/games/nonexistent/actions')
            .set('Authorization', `Bearer ${user1.token}`)
            .send(actionPayload('end_turn'));

        expect(res.status).toBe(404);
    });

    test('403 for authenticated user outside the room', async () => {
        const { createUserFixture } = require('../helpers/fixtures');
        const outsider = createUserFixture(db);

        const res = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${outsider.token}`)
            .send(actionPayload('end_turn'));

        expect(res.status).toBe(403);
    });

    test('409 with stale expected_version', async () => {
        await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send(actionPayload('end_turn'));

        const res = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send(actionPayload('end_turn', {}, 0));

        expect(res.status).toBe(409);
    });

    test('403 when non-current player attempts turn action', async () => {
        const res = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user2.token}`)
            .send(actionPayload('end_turn'));

        expect(res.status).toBe(403);
    });

    test('same actionId is idempotent', async () => {
        const actionId = uuidForTest();
        const first = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send(actionPayload('end_turn', {}, 0, actionId));
        const second = await request(app)
            .post(`/api/games/${gameId}/actions`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send(actionPayload('end_turn', {}, 0, actionId));

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(second.body.game.state_version).toBe(first.body.game.state_version);
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

    test('403 for authenticated user outside the room', async () => {
        const { createUserFixture } = require('../helpers/fixtures');
        const outsider = createUserFixture(db);

        const res = await request(app)
            .post(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${outsider.token}`)
            .send({ event_type: 'test_event' });

        expect(res.status).toBe(403);
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
        const res = await request(app)
            .get(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`);
        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test('returns game_started event after create', async () => {
        const res = await request(app)
            .get(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`);
        expect(res.body.some(event => event.event_type === 'game_started')).toBe(true);
    });

    test('event_data is parsed JSON', async () => {
        await request(app).post(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ event_type: 'buy', event_data: { property: 'prop-0', price: 60 } });

        const res = await request(app)
            .get(`/api/games/${gameId}/events`)
            .set('Authorization', `Bearer ${user1.token}`);
        const event = res.body.find(row => row.event_type === 'buy');
        expect(event.event_data).toEqual({ property: 'prop-0', price: 60 });
    });

    test('auth required to get events', async () => {
        const res = await request(app).get(`/api/games/${gameId}/events`);
        expect(res.status).toBe(401);
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

        const getRes = await request(app)
            .get(`/api/games/${createRes.body.id}`)
            .set('Authorization', `Bearer ${user1.token}`);
        expect(getRes.body.game_state.meta.nested.deeply.value).toBe(42);
        expect(getRes.body.game_state.meta.nested.deeply.arr).toEqual([1, 2, 3]);
    });

    test('unicode player names in game_state handled correctly', async () => {
        const { createRoomFixture } = require('../helpers/fixtures');
        const unicodeRoom = createRoomFixture(db, user1.id, { inviteCode: 'UNCD01' });

        const unicodeState = {
            ...minimalGameState(),
            players: [{ userId: user1.id, name: '日本語プレーヤー', cash: 1500, position: 0, bankrupt: false, inJail: false, properties: [], corporations: [], debts: [] }],
        };

        const createRes = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${user1.token}`)
            .send({ room_id: unicodeRoom.id, game_state: unicodeState });

        const getRes = await request(app)
            .get(`/api/games/${createRes.body.id}`)
            .set('Authorization', `Bearer ${user1.token}`);
        expect(getRes.body.game_state.players[0].name).toBe('日本語プレーヤー');
    });
});

function uuidForTest() {
    return `test-${Math.random().toString(16).slice(2)}-${Date.now()}`;
}
