// Load .env if present
try { require('fs').readFileSync(__dirname + '/.env'); } catch {}
try {
    const lines = require('fs').readFileSync(__dirname + '/.env', 'utf8').split('\n');
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

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { router: authRouter } = require('./routes/auth');

const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const roomsRouter = require('./routes/rooms')(io);
const gamesRouter = require('./routes/games')(io);

app.use(cors());
app.use(express.json({ limit: '2mb' }));

// Routes
app.use('/api/auth', authRouter);
app.use('/api/rooms', roomsRouter);
app.use('/api/games', gamesRouter);

// Health check
app.get('/api/health', (req, res) => res.json({ ok: true }));

// ----------------------------------------------------------------
// Socket.io — real-time events
// ----------------------------------------------------------------

// Authenticate socket via token query param or auth header
io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) return next(); // allow unauthenticated (read-only observer)
    try {
        const payload = jwt.verify(token, JWT_SECRET);
        socket.userId = payload.sub;
    } catch {
        // invalid token — still allow connection, just no userId
    }
    next();
});

io.on('connection', (socket) => {
    // Join a room's Socket.io channel
    socket.on('join_room', (roomId) => {
        socket.join(`room:${roomId}`);
    });

    // Leave a room's channel
    socket.on('leave_room', (roomId) => {
        socket.leave(`room:${roomId}`);
    });

    socket.on('disconnect', () => {});
});


if (require.main === module) {
    server.listen(PORT, () => {
        console.log(`Mortgage Backed Game backend running on port ${PORT}`);
    });
}

module.exports = { app, server, io };
