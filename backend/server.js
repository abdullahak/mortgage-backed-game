const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const { getConfig, getCorsOptions } = require('./config');
const db = require('./db');
const { router: authRouter } = require('./routes/auth');

const config = getConfig();
const PORT = config.port;
const HOST = config.host;
const JWT_SECRET = config.jwtSecret;

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: getCorsOptions(config)
});

const roomsRouter = require('./routes/rooms')(io);
const gamesRouter = require('./routes/games')(io);

app.use(cors(getCorsOptions(config)));
app.use(express.json({ limit: config.requestBodyLimit }));

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
        return next(new Error('Invalid token'));
    }
    next();
});

io.on('connection', (socket) => {
    // Join a room's Socket.io channel
    socket.on('join_room', (roomId) => {
        if (!socket.userId) return;
        const membership = db.prepare(`
            SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?
        `).get(roomId, socket.userId);
        if (!membership) return;
        socket.join(`room:${roomId}`);
    });

    // Leave a room's channel
    socket.on('leave_room', (roomId) => {
        socket.leave(`room:${roomId}`);
    });

    socket.on('disconnect', () => {});
});


if (require.main === module) {
    server.listen(PORT, HOST, () => {
        console.log(`Mortgage Backed Game backend running env=${config.env} host=${HOST} port=${PORT} db=${config.dbPath}`);
    });
}

module.exports = { app, server, io };
