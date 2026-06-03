const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { sendEmail } = require('../mailer');
const db = require('../db');
const { getConfig } = require('../config');

const config = getConfig();
const JWT_SECRET = config.jwtSecret;
const JWT_EXPIRY = config.jwtExpiry;
const otpSendLimits = new Map();
const otpVerifyLimits = new Map();

// Middleware: verify JWT and attach user
function requireAuth(req, res, next) {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    try {
        const payload = jwt.verify(header.slice(7), JWT_SECRET);
        req.userId = payload.sub;
        next();
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
}

// Create a JWT for a user
function makeToken(userId) {
    return jwt.sign({ sub: userId }, JWT_SECRET, { expiresIn: JWT_EXPIRY });
}


// POST /api/auth/send-otp
router.post('/send-otp', async (req, res) => {
    const { email } = req.body;
    if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email required' });
    }
    const normalizedEmail = email.toLowerCase();
    if (isRateLimited(otpSendLimits, `${req.ip}:${normalizedEmail}`, 5, 15 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many code requests' });
    }

    const code = String(crypto.randomInt(100000, 1000000));
    const id = uuidv4();
    const expires = toSqliteDate(new Date(Date.now() + 10 * 60 * 1000)); // 10 min

    // Invalidate old OTPs for this email
    db.prepare(`DELETE FROM otps WHERE email = ?`).run(normalizedEmail);

    db.prepare(`
        INSERT INTO otps (id, email, code, expires_at)
        VALUES (?, ?, ?, ?)
    `).run(id, normalizedEmail, code, expires);

    if (process.env.NODE_ENV !== 'test') {
        try {
            await sendEmail(
                email,
                'Your Mortgage Backed Monopoly login code',
                `Your verification code is: ${code}\n\nValid for 10 minutes.`,
                `<p>Your verification code is: <strong>${code}</strong></p><p>Valid for 10 minutes.</p>`
            );
        } catch (err) {
            console.error('Email send error:', err);
            if (config.otpLogEnabled) console.log(`\nOTP for ${email}: ${code}\n`);
        }
    }

    res.json({ ok: true });
});

// POST /api/auth/verify-otp
router.post('/verify-otp', (req, res) => {
    const { email, token } = req.body;
    if (!email || !token) {
        return res.status(400).json({ error: 'email and token required' });
    }

    const normalizedEmail = email.toLowerCase();
    if (isRateLimited(otpVerifyLimits, `${req.ip}:${normalizedEmail}`, 10, 15 * 60 * 1000)) {
        return res.status(429).json({ error: 'Too many verification attempts' });
    }

    const otp = db.prepare(`
        SELECT * FROM otps
        WHERE email = ? AND code = ? AND used = 0 AND expires_at > datetime('now')
    `).get(normalizedEmail, String(token));

    if (!otp) {
        db.prepare(`UPDATE otps SET attempts = attempts + 1 WHERE email = ? AND used = 0`).run(normalizedEmail);
        return res.status(400).json({ error: 'Invalid or expired code' });
    }

    // Mark OTP as used
    db.prepare(`UPDATE otps SET used = 1 WHERE id = ?`).run(otp.id);

    // Get or create user
    let user = db.prepare(`SELECT * FROM users WHERE email = ?`).get(normalizedEmail);
    if (!user) {
        const userId = uuidv4();
        db.prepare(`INSERT INTO users (id, email, is_anonymous) VALUES (?, ?, 0)`).run(userId, normalizedEmail);
        user = db.prepare(`SELECT * FROM users WHERE id = ?`).get(userId);
    }

    res.json({ token: makeToken(user.id), user: { id: user.id, email: user.email, is_anonymous: false } });
});

// POST /api/auth/anonymous
router.post('/anonymous', (req, res) => {
    const userId = uuidv4();
    db.prepare(`INSERT INTO users (id, email, is_anonymous) VALUES (?, NULL, 1)`).run(userId);
    res.json({ token: makeToken(userId), user: { id: userId, email: null, is_anonymous: true } });
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
    const user = db.prepare(`SELECT id, email, is_anonymous FROM users WHERE id = ?`).get(req.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
});

// POST /api/auth/signout
router.post('/signout', requireAuth, (req, res) => {
    // JWTs are stateless; nothing to delete. Client clears the token.
    res.json({ ok: true });
});

module.exports = { router, requireAuth };

function toSqliteDate(date) {
    return date.toISOString().replace('T', ' ').slice(0, 19);
}

function isRateLimited(map, key, max, windowMs) {
    const now = Date.now();
    const record = map.get(key) || { count: 0, resetAt: now + windowMs };
    if (now > record.resetAt) {
        record.count = 0;
        record.resetAt = now + windowMs;
    }
    record.count += 1;
    map.set(key, record);
    return record.count > max;
}
