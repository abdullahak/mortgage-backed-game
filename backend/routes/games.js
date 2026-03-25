const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('./auth');

module.exports = (io) => {
const router = express.Router();

function parseGame(game) {
    return { ...game, game_state: JSON.parse(game.game_state) };
}

// POST /api/games — create a new game for a room
router.post('/', requireAuth, (req, res) => {
    const { room_id, game_state } = req.body;
    if (!room_id || !game_state) {
        return res.status(400).json({ error: 'room_id and game_state required' });
    }

    const room = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(room_id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.host_id !== req.userId) return res.status(403).json({ error: 'Not the host' });

    const gameId = uuidv4();
    db.prepare(`
        INSERT INTO games (id, room_id, game_state, current_player_index)
        VALUES (?, ?, ?, 0)
    `).run(gameId, room_id, JSON.stringify(game_state));

    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(gameId);
    res.json(parseGame(game));
});

// GET /api/games/by-room/:roomId
router.get('/by-room/:roomId', (req, res) => {
    const game = db.prepare(`SELECT * FROM games WHERE room_id = ?`).get(req.params.roomId);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(parseGame(game));
});

// GET /api/games/:id
router.get('/:id', (req, res) => {
    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    res.json(parseGame(game));
});

// PATCH /api/games/:id/state — update game state
router.patch('/:id/state', requireAuth, (req, res) => {
    const { game_state } = req.body;
    if (!game_state) return res.status(400).json({ error: 'game_state required' });

    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });

    db.prepare(`
        UPDATE games SET game_state = ?, updated_at = datetime('now') WHERE id = ?
    `).run(JSON.stringify(game_state), req.params.id);

    io.to(`room:${game.room_id}`).emit('game:state_update', { ...game, game_state });

    res.json({ ok: true });
});

// POST /api/games/:id/events — log a game event
router.post('/:id/events', requireAuth, (req, res) => {
    const { event_type, event_data } = req.body;
    if (!event_type) return res.status(400).json({ error: 'event_type required' });

    const eventId = uuidv4();
    db.prepare(`
        INSERT INTO game_events (id, game_id, player_id, event_type, event_data)
        VALUES (?, ?, ?, ?, ?)
    `).run(eventId, req.params.id, req.userId, event_type, JSON.stringify(event_data || {}));

    res.json({ ok: true });
});

// GET /api/games/:id/events — get recent events
router.get('/:id/events', (req, res) => {
    const events = db.prepare(`
        SELECT * FROM game_events WHERE game_id = ?
        ORDER BY created_at DESC LIMIT 100
    `).all(req.params.id);

    res.json(events.map(e => ({ ...e, event_data: JSON.parse(e.event_data) })));
});

    return router;
};
