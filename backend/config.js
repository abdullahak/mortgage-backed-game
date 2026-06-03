const path = require('path');

const DEFAULT_DEV_SECRET = 'dev-secret-change-me';

function loadDotEnv() {
    const fs = require('fs');
    const envPath = path.join(__dirname, '.env');
    try {
        const lines = fs.readFileSync(envPath, 'utf8').split('\n');
        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) continue;
            const eq = trimmed.indexOf('=');
            if (eq === -1) continue;
            const key = trimmed.slice(0, eq).trim();
            const val = trimmed.slice(eq + 1).trim();
            if (key && !process.env[key]) process.env[key] = val;
        }
    } catch {}
}

function isProduction() {
    return process.env.NODE_ENV === 'production' || process.env.APP_ENV === 'production';
}

function getConfig() {
    loadDotEnv();
    const env = process.env.APP_ENV || process.env.NODE_ENV || 'development';
    const port = Number(process.env.PORT || 3000);
    const host = process.env.HOST || process.env.BIND_HOST || (isProduction() ? '127.0.0.1' : '0.0.0.0');
    const jwtSecret = process.env.JWT_SECRET || DEFAULT_DEV_SECRET;
    const dbPath = process.env.DB_PATH || (process.env.NODE_ENV === 'test'
        ? ':memory:'
        : path.join(__dirname, 'game.db'));
    const corsOrigins = (process.env.CORS_ORIGINS || (isProduction() ? '' : '*'))
        .split(',')
        .map(origin => origin.trim())
        .filter(Boolean);

    if (isProduction()) {
        if (!process.env.DB_PATH) throw new Error('DB_PATH is required in production');
        if (!process.env.JWT_SECRET || jwtSecret === DEFAULT_DEV_SECRET) {
            throw new Error('A non-default JWT_SECRET is required in production');
        }
        if (corsOrigins.length === 0 || corsOrigins.includes('*')) {
            throw new Error('CORS_ORIGINS must be explicit in production');
        }
        if (host !== '127.0.0.1' && host !== 'localhost') {
            throw new Error('Production HOST/BIND_HOST must be 127.0.0.1');
        }
    }

    return {
        env,
        isProduction: isProduction(),
        port,
        host,
        jwtSecret,
        jwtExpiry: process.env.JWT_EXPIRY || (isProduction() ? '12h' : '30d'),
        dbPath,
        corsOrigins,
        allowStateRepair: process.env.ALLOW_STATE_REPAIR === 'true',
        requestBodyLimit: process.env.REQUEST_BODY_LIMIT || '256kb',
        otpLogEnabled: process.env.LOG_OTPS === 'true' && !isProduction(),
    };
}

function getCorsOptions(config) {
    if (config.corsOrigins.includes('*')) return { origin: '*', methods: ['GET', 'POST', 'PATCH', 'DELETE'] };
    return {
        origin(origin, callback) {
            if (!origin || config.corsOrigins.includes(origin)) return callback(null, true);
            return callback(new Error('Origin not allowed'));
        },
        methods: ['GET', 'POST', 'PATCH', 'DELETE'],
    };
}

module.exports = { getConfig, getCorsOptions, DEFAULT_DEV_SECRET };
