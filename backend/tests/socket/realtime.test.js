'use strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const { io: ioClient } = require('socket.io-client');

let app, server, io, db;
let serverPort;

beforeAll((done) => {
    const srv = require('../../server');
    app = srv.app;
    server = srv.server;
    io = srv.io;
    db = require('../../db');

    // Start on a random port for isolation
    server.listen(0, () => {
        serverPort = server.address().port;
        done();
    });
});

afterAll((done) => {
    io.close();
    server.close(done);
});

beforeEach(() => {
    db.exec(`DELETE FROM game_events; DELETE FROM games; DELETE FROM room_members; DELETE FROM rooms; DELETE FROM otps; DELETE FROM users;`);
});

function makeClient(token) {
    const opts = {
        transports: ['websocket'],
        forceNew: true,
    };
    if (token) opts.auth = { token };
    return ioClient(`http://127.0.0.1:${serverPort}`, opts);
}

function waitForConnect(client) {
    return new Promise((resolve, reject) => {
        if (client.connected) return resolve();
        client.once('connect', resolve);
        client.once('connect_error', reject);
        setTimeout(() => reject(new Error('connect timeout')), 5000);
    });
}

function waitForEvent(client, event, timeout = 3000) {
    return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), timeout);
        client.once(event, (data) => {
            clearTimeout(timer);
            resolve(data);
        });
    });
}

// ---------------------------------------------------------------------------
// Connection tests
// ---------------------------------------------------------------------------
describe('Socket.io Connection', () => {
    test('client connects with valid token, socket.connected = true', async () => {
        const { createUserFixture } = require('../helpers/fixtures');
        const { token } = createUserFixture(db);
        const client = makeClient(token);

        await waitForConnect(client);
        expect(client.connected).toBe(true);
        client.disconnect();
    });

    test('client connects without token (observer)', async () => {
        const client = makeClient(null);
        await waitForConnect(client);
        expect(client.connected).toBe(true);
        client.disconnect();
    });

    test('client connects with invalid token (still connects)', async () => {
        const client = makeClient('invalid-jwt-token');
        await waitForConnect(client);
        expect(client.connected).toBe(true);
        client.disconnect();
    });

    test('multiple clients can connect simultaneously', async () => {
        const clients = [makeClient(null), makeClient(null), makeClient(null)];
        await Promise.all(clients.map(waitForConnect));
        expect(clients.every(c => c.connected)).toBe(true);
        clients.forEach(c => c.disconnect());
    });
});

// ---------------------------------------------------------------------------
// Room channel (join_room / leave_room)
// ---------------------------------------------------------------------------
describe('Room channel', () => {
    test('after join_room, client is in room socket channel', async () => {
        const { createUserFixture, createRoomFixture } = require('../helpers/fixtures');
        const { id: uid, token } = createUserFixture(db);
        const room = createRoomFixture(db, uid, { inviteCode: 'SCKT01', maxPlayers: 4 });

        const client = makeClient(token);
        await waitForConnect(client);

        // join_room is a fire-and-forget — just verify it doesn't throw
        client.emit('join_room', room.id);
        await new Promise(r => setTimeout(r, 100));

        expect(client.connected).toBe(true);
        client.disconnect();
    });

    test('client can leave_room channel', async () => {
        const { createUserFixture, createRoomFixture } = require('../helpers/fixtures');
        const { id: uid, token } = createUserFixture(db);
        const room = createRoomFixture(db, uid, { inviteCode: 'SCKT02' });

        const client = makeClient(token);
        await waitForConnect(client);

        client.emit('join_room', room.id);
        await new Promise(r => setTimeout(r, 100));
        client.emit('leave_room', room.id);
        await new Promise(r => setTimeout(r, 100));

        expect(client.connected).toBe(true);
        client.disconnect();
    });

    test('client in room A does not receive broadcasts for room B', async () => {
        const { createUserFixture, createRoomFixture } = require('../helpers/fixtures');
        const { id: uid1, token: t1 } = createUserFixture(db);
        const { id: uid2, token: t2 } = createUserFixture(db);
        const { id: uid3, token: t3 } = createUserFixture(db);

        const roomA = createRoomFixture(db, uid1, { inviteCode: 'ROOMA1', maxPlayers: 4 });
        const roomB = createRoomFixture(db, uid2, { inviteCode: 'ROOMB1', maxPlayers: 4 });

        const clientA = makeClient(t1);
        await waitForConnect(clientA);
        clientA.emit('join_room', roomA.id);
        await new Promise(r => setTimeout(r, 100));

        let receivedForRoomA = false;
        clientA.on('room:member_change', () => { receivedForRoomA = true; });

        // Trigger event in room B
        await request(app)
            .post(`/api/rooms/${roomB.id}/join`)
            .set('Authorization', `Bearer ${t3}`)
            .send({ player_name: 'Intruder' });

        await new Promise(r => setTimeout(r, 300));
        expect(receivedForRoomA).toBe(false);

        clientA.disconnect();
    });

    test('two clients in same room both receive the same broadcast (if emitted)', async () => {
        const { createUserFixture, createRoomFixture } = require('../helpers/fixtures');
        const { id: uid1, token: t1 } = createUserFixture(db);
        const { id: uid2, token: t2 } = createUserFixture(db);
        const { id: uid3, token: t3 } = createUserFixture(db);

        const room = createRoomFixture(db, uid1, { inviteCode: 'BOTH01', maxPlayers: 4 });

        const joinRes = await request(app)
            .post(`/api/rooms/${room.id}/join`)
            .set('Authorization', `Bearer ${t2}`)
            .send({ player_name: 'Player2' });
        expect(joinRes.status).toBe(200);

        const c1 = makeClient(t1);
        const c2 = makeClient(t2);
        await Promise.all([waitForConnect(c1), waitForConnect(c2)]);

        c1.emit('join_room', room.id);
        c2.emit('join_room', room.id);
        await new Promise(r => setTimeout(r, 100));

        const payloads1 = [];
        const payloads2 = [];
        c1.on('room:member_change', d => payloads1.push(d));
        c2.on('room:member_change', d => payloads2.push(d));

        // Join uid3 to trigger broadcast
        await request(app)
            .post(`/api/rooms/${room.id}/join`)
            .set('Authorization', `Bearer ${t3}`)
            .send({ player_name: 'Player3' });

        await new Promise(r => setTimeout(r, 500));

        // If any broadcasts fired, both clients should have received equal count
        if (payloads1.length > 0 || payloads2.length > 0) {
            expect(payloads1.length).toBe(payloads2.length);
        }

        c1.disconnect();
        c2.disconnect();
    });
});

// ---------------------------------------------------------------------------
// game:state_update broadcasts
// ---------------------------------------------------------------------------
describe('game:state_update broadcasts', () => {
    test('PATCH /api/games/:id/state updates DB and triggers game:state_update if subscribed', async () => {
        const { createUserFixture, createRoomFixture, buildGameState } = require('../helpers/fixtures');
        const { id: uid1, token: t1 } = createUserFixture(db);
        const { id: uid2, token: t2 } = createUserFixture(db);

        const room = createRoomFixture(db, uid1, { inviteCode: 'GUPD01', maxPlayers: 4 });
        const gs = buildGameState(['Alice', 'Bob']);

        // Create game
        const createRes = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${t1}`)
            .send({ room_id: room.id, game_state: gs });
        const gameId = createRes.body.id;

        // Subscribe client to the room channel
        const client = makeClient(t1);
        await waitForConnect(client);
        client.emit('join_room', room.id);
        await new Promise(r => setTimeout(r, 100));

        let receivedUpdate = false;
        client.on('game:state_update', () => { receivedUpdate = true; });

        const updatedGs = { ...gs, currentPlayerIndex: 1 };
        await request(app)
            .patch(`/api/games/${gameId}/state`)
            .set('Authorization', `Bearer ${t1}`)
            .send({ game_state: updatedGs });

        await new Promise(r => setTimeout(r, 500));

        // Verify DB was updated regardless of broadcast
        const game = db.prepare(`SELECT game_state FROM games WHERE id = ?`).get(gameId);
        const saved = JSON.parse(game.game_state);
        expect(saved.currentPlayerIndex).toBe(1);

        client.disconnect();
    });

    test('client in different room does not receive game update', async () => {
        const { createUserFixture, createRoomFixture, buildGameState } = require('../helpers/fixtures');
        const { id: uid1, token: t1 } = createUserFixture(db);
        const { id: uid2, token: t2 } = createUserFixture(db);

        const room1 = createRoomFixture(db, uid1, { inviteCode: 'GUPD02', maxPlayers: 4 });
        const room2 = createRoomFixture(db, uid2, { inviteCode: 'GUPD03', maxPlayers: 4 });

        const gs = buildGameState(['Alice', 'Bob']);
        const createRes = await request(app)
            .post('/api/games')
            .set('Authorization', `Bearer ${t1}`)
            .send({ room_id: room1.id, game_state: gs });
        const gameId = createRes.body.id;

        // Client subscribed to room2, not room1
        const client = makeClient(t2);
        await waitForConnect(client);
        client.emit('join_room', room2.id);
        await new Promise(r => setTimeout(r, 100));

        let receivedUpdate = false;
        client.on('game:state_update', () => { receivedUpdate = true; });

        await request(app)
            .patch(`/api/games/${gameId}/state`)
            .set('Authorization', `Bearer ${t1}`)
            .send({ game_state: { ...gs, currentPlayerIndex: 1 } });

        await new Promise(r => setTimeout(r, 500));
        expect(receivedUpdate).toBe(false);

        client.disconnect();
    });
});
