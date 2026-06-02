'use strict';

process.env.DB_PATH = ':memory:';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const jwt = require('jsonwebtoken');

let app, db;

beforeAll(() => {
    const { app: a } = require('../../server');
    const d = require('../../db');
    app = a;
    db = d;
});

afterEach(() => {
    // Clear all tables between tests
    db.exec(`DELETE FROM game_events; DELETE FROM games; DELETE FROM room_members; DELETE FROM rooms; DELETE FROM otps; DELETE FROM users;`);
});

// ---------------------------------------------------------------------------
// POST /api/auth/send-otp
// ---------------------------------------------------------------------------
describe('POST /api/auth/send-otp', () => {
    test('200 with valid email', async () => {
        const res = await request(app)
            .post('/api/auth/send-otp')
            .send({ email: 'test@example.com' });
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('ok', true);
    });

    test('400 with missing email', async () => {
        const res = await request(app)
            .post('/api/auth/send-otp')
            .send({});
        expect(res.status).toBe(400);
    });

    test('stores expiry in SQLite datetime format', async () => {
        const res = await request(app)
            .post('/api/auth/send-otp')
            .send({ email: 'format@example.com' });

        expect(res.status).toBe(200);
        const otp = db.prepare(`SELECT expires_at FROM otps WHERE email = ?`).get('format@example.com');
        expect(otp.expires_at).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
    });

    test('invalidates old OTPs case-insensitively', async () => {
        await request(app)
            .post('/api/auth/send-otp')
            .send({ email: 'case@example.com' });
        await request(app)
            .post('/api/auth/send-otp')
            .send({ email: 'CASE@example.com' });

        const rows = db.prepare(`SELECT * FROM otps WHERE email = ?`).all('case@example.com');
        expect(rows).toHaveLength(1);
    });

    test('400 with invalid email format (no @)', async () => {
        const res = await request(app)
            .post('/api/auth/send-otp')
            .send({ email: 'notanemail' });
        expect(res.status).toBe(400);
    });

    test('creates OTP record in DB with 10-min expiry', async () => {
        await request(app)
            .post('/api/auth/send-otp')
            .send({ email: 'otp@example.com' });

        const otp = db.prepare(`SELECT * FROM otps WHERE email = ?`).get('otp@example.com');
        expect(otp).toBeTruthy();
        expect(otp.code).toMatch(/^\d{6}$/);
        const expiry = new Date(otp.expires_at);
        const now = new Date();
        expect(expiry.getTime() - now.getTime()).toBeGreaterThan(9 * 60 * 1000);
    });

    test('deletes previous OTP for same email before creating new one', async () => {
        await request(app).post('/api/auth/send-otp').send({ email: 'dup@example.com' });
        await request(app).post('/api/auth/send-otp').send({ email: 'dup@example.com' });

        const otps = db.prepare(`SELECT * FROM otps WHERE email = ?`).all('dup@example.com');
        expect(otps).toHaveLength(1);
    });

    test('OTP code is 6 digits', async () => {
        await request(app).post('/api/auth/send-otp').send({ email: 'digits@example.com' });
        const otp = db.prepare(`SELECT * FROM otps WHERE email = ?`).get('digits@example.com');
        expect(otp.code).toMatch(/^\d{6}$/);
    });

    test('second send creates a new code', async () => {
        await request(app).post('/api/auth/send-otp').send({ email: 'second@example.com' });
        const first = db.prepare(`SELECT code FROM otps WHERE email = ?`).get('second@example.com');

        await request(app).post('/api/auth/send-otp').send({ email: 'second@example.com' });
        const second = db.prepare(`SELECT code FROM otps WHERE email = ?`).get('second@example.com');

        // Codes may differ (very high probability), and old one is gone
        const all = db.prepare(`SELECT * FROM otps WHERE email = ?`).all('second@example.com');
        expect(all).toHaveLength(1);
        expect(all[0].code).toBe(second.code);
    });
});

// ---------------------------------------------------------------------------
// POST /api/auth/verify-otp
// ---------------------------------------------------------------------------
describe('POST /api/auth/verify-otp', () => {
    function toSqliteDate(d) {
        // SQLite datetime('now') returns 'YYYY-MM-DD HH:MM:SS' (space, no T, no Z)
        // We must use the same format so the > comparison works correctly
        return d.toISOString().replace('T', ' ').slice(0, 19);
    }

    function insertOtp(email, code, { used = 0, expiredMinutesAgo = 0 } = {}) {
        const { v4: uuidv4 } = require('uuid');
        const id = uuidv4();
        const expires = expiredMinutesAgo > 0
            ? toSqliteDate(new Date(Date.now() - expiredMinutesAgo * 60 * 1000))
            : toSqliteDate(new Date(Date.now() + 10 * 60 * 1000));
        db.prepare(`INSERT INTO otps (id, email, code, expires_at, used) VALUES (?, ?, ?, ?, ?)`).run(id, email, code, expires, used);
        return id;
    }

    test('200 with valid email + code → returns token and user', async () => {
        insertOtp('valid@example.com', '123456');
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'valid@example.com', token: '123456' });

        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user.email).toBe('valid@example.com');
    });

    test('400 with wrong code', async () => {
        insertOtp('wrong@example.com', '111111');
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'wrong@example.com', token: '999999' });
        expect(res.status).toBe(400);
    });

    test('400 with expired code', async () => {
        insertOtp('expired@example.com', '222222', { expiredMinutesAgo: 15 });
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'expired@example.com', token: '222222' });
        expect(res.status).toBe(400);
    });

    test('400 with already-used code', async () => {
        insertOtp('used@example.com', '333333', { used: 1 });
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'used@example.com', token: '333333' });
        expect(res.status).toBe(400);
    });

    test('400 with missing email', async () => {
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ token: '123456' });
        expect(res.status).toBe(400);
    });

    test('400 with missing token field', async () => {
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'missing@example.com' });
        expect(res.status).toBe(400);
    });

    test('creates new user if email not seen before', async () => {
        insertOtp('newuser@example.com', '444444');
        await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'newuser@example.com', token: '444444' });

        const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get('newuser@example.com');
        expect(user).toBeTruthy();
        expect(user.is_anonymous).toBe(0);
    });

    test('returns existing user if email already registered', async () => {
        const { v4: uuidv4 } = require('uuid');
        const existingId = uuidv4();
        db.prepare(`INSERT INTO users (id, email, is_anonymous) VALUES (?, ?, 0)`).run(existingId, 'existing@example.com');
        insertOtp('existing@example.com', '555555');

        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'existing@example.com', token: '555555' });

        expect(res.status).toBe(200);
        expect(res.body.user.id).toBe(existingId);
    });

    test('JWT token is valid and contains correct sub (userId)', async () => {
        insertOtp('jwt@example.com', '666666');
        const res = await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'jwt@example.com', token: '666666' });

        const decoded = jwt.verify(res.body.token, 'test-secret');
        const user = db.prepare(`SELECT * FROM users WHERE email = ?`).get('jwt@example.com');
        expect(decoded.sub).toBe(user.id);
    });

    test('OTP marked as used after successful verify', async () => {
        insertOtp('mark@example.com', '777777');
        await request(app)
            .post('/api/auth/verify-otp')
            .send({ email: 'mark@example.com', token: '777777' });

        const otp = db.prepare(`SELECT * FROM otps WHERE email = ? AND code = ?`).get('mark@example.com', '777777');
        expect(otp.used).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// POST /api/auth/anonymous
// ---------------------------------------------------------------------------
describe('POST /api/auth/anonymous', () => {
    test('200 → returns token and anonymous user', async () => {
        const res = await request(app).post('/api/auth/anonymous');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('token');
        expect(res.body).toHaveProperty('user');
        expect(res.body.user.is_anonymous).toBe(true);
    });

    test('user created with is_anonymous = 1 and no email', async () => {
        const res = await request(app).post('/api/auth/anonymous');
        const user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(res.body.user.id);
        expect(user.is_anonymous).toBe(1);
        expect(user.email).toBeNull();
    });

    test('JWT token is valid', async () => {
        const res = await request(app).post('/api/auth/anonymous');
        expect(() => jwt.verify(res.body.token, 'test-secret')).not.toThrow();
    });

    test('multiple anonymous users can be created', async () => {
        const r1 = await request(app).post('/api/auth/anonymous');
        const r2 = await request(app).post('/api/auth/anonymous');
        expect(r1.body.user.id).not.toBe(r2.body.user.id);
    });
});

// ---------------------------------------------------------------------------
// GET /api/auth/me
// ---------------------------------------------------------------------------
describe('GET /api/auth/me', () => {
    test('200 with valid Bearer token → returns user', async () => {
        const { createUserFixture } = require('../helpers/fixtures');
        const { id, email, token } = createUserFixture(db);

        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.id).toBe(id);
        expect(res.body.email).toBe(email);
    });

    test('401 with no Authorization header', async () => {
        const res = await request(app).get('/api/auth/me');
        expect(res.status).toBe(401);
    });

    test('401 with invalid JWT', async () => {
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', 'Bearer notajwt');
        expect(res.status).toBe(401);
    });

    test('401 with expired JWT', async () => {
        const { v4: uuidv4 } = require('uuid');
        const id = uuidv4();
        const expiredToken = jwt.sign({ sub: id }, 'test-secret', { expiresIn: '-1s' });
        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${expiredToken}`);
        expect(res.status).toBe(401);
    });

    test('returns anonymous user correctly (email null)', async () => {
        const anonRes = await request(app).post('/api/auth/anonymous');
        const { token } = anonRes.body;

        const res = await request(app)
            .get('/api/auth/me')
            .set('Authorization', `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(res.body.email).toBeNull();
        expect(res.body.is_anonymous).toBe(1);
    });
});

// ---------------------------------------------------------------------------
// POST /api/auth/signout
// ---------------------------------------------------------------------------
describe('POST /api/auth/signout', () => {
    test('200 with valid token', async () => {
        const { createUserFixture } = require('../helpers/fixtures');
        const { token } = createUserFixture(db);

        const res = await request(app)
            .post('/api/auth/signout')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
    });

    test('401 with no token', async () => {
        const res = await request(app).post('/api/auth/signout');
        expect(res.status).toBe(401);
    });

    test('response body includes ok: true', async () => {
        const { createUserFixture } = require('../helpers/fixtures');
        const { token } = createUserFixture(db);

        const res = await request(app)
            .post('/api/auth/signout')
            .set('Authorization', `Bearer ${token}`);
        expect(res.body).toHaveProperty('ok', true);
    });
});
