'use strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');

let app, db;

beforeAll(() => {
    const { app: a } = require('../../server');
    const d = require('../../db');
    app = a;
    db = d;
});

test('GET /api/health verifies backend and database readiness', async () => {
    const res = await request(app).get('/api/health');

    expect(res.status).toBe(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.env).toBe('test');
    expect(res.body.db.ok).toBe(true);
    expect(res.body.db.migrationsApplied).toBeGreaterThanOrEqual(3);
    expect(res.body.uptimeSeconds).toEqual(expect.any(Number));
});

test('schema includes operational hot-path indexes', () => {
    const indexes = new Set([
        ...indexNames('room_members'),
        ...indexNames('games'),
        ...indexNames('game_events'),
        ...indexNames('game_actions'),
        ...indexNames('otps'),
        ...indexNames('rooms'),
    ]);

    [
        'idx_room_members_room_joined',
        'idx_room_members_user_joined',
        'idx_games_room',
        'idx_game_events_game_created',
        'idx_game_actions_game_created',
        'idx_game_actions_actor_created',
        'idx_otps_email_used_expires',
        'idx_rooms_status_created',
    ].forEach(name => expect(indexes.has(name)).toBe(true));
});

function indexNames(tableName) {
    return db.prepare(`PRAGMA index_list(${tableName})`).all().map(row => row.name);
}
