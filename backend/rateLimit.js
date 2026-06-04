'use strict';

function createRateLimiter(options = {}) {
    const name = options.name || 'request';
    const enabled = options.enabled !== false;
    const max = positiveInteger(options.max, 60);
    const windowMs = positiveInteger(options.windowMs, 60 * 1000);
    const keyGenerator = options.keyGenerator || defaultKeyGenerator;
    const store = new Map();
    let lastPruneAt = 0;

    return function rateLimit(req, res, next) {
        if (!enabled) return next();

        const now = Date.now();
        if (now - lastPruneAt > windowMs) {
            pruneExpired(store, now);
            lastPruneAt = now;
        }

        const key = `${name}:${keyGenerator(req)}`;
        let record = store.get(key);
        if (!record || now >= record.resetAt) {
            record = { count: 0, resetAt: now + windowMs };
        }
        record.count += 1;
        store.set(key, record);

        const retryAfterSeconds = Math.max(1, Math.ceil((record.resetAt - now) / 1000));
        const remaining = Math.max(0, max - record.count);
        res.set('X-RateLimit-Limit', String(max));
        res.set('X-RateLimit-Remaining', String(remaining));
        res.set('X-RateLimit-Reset', String(Math.ceil(record.resetAt / 1000)));

        if (record.count > max) {
            res.set('Retry-After', String(retryAfterSeconds));
            return res.status(429).json({
                error: 'Too many requests',
                retryAfterSeconds,
            });
        }

        next();
    };
}

function defaultKeyGenerator(req) {
    return getRequestActorKey(req);
}

function getRequestActorKey(req) {
    if (req.userId) return `user:${req.userId}`;
    return `ip:${req.ip || req.socket?.remoteAddress || 'unknown'}`;
}

function pruneExpired(store, now) {
    for (const [key, record] of store.entries()) {
        if (now >= record.resetAt) store.delete(key);
    }
}

function positiveInteger(value, fallback) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

module.exports = { createRateLimiter, getRequestActorKey };
