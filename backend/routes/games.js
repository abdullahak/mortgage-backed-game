const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('./auth');

module.exports = (io) => {
const router = express.Router();
const TURN_ACTIONS = new Set([
    'dice_roll',
    'property_purchase',
    'ipo_created',
    'share_purchase',
    'debt_issued',
    'debt_payment',
    'interest_accrual',
    'bankruptcy',
    'turn_end',
    'house_purchase',
    'card_draw',
    'pass_go',
    'forced_payment',
    'tax_payment',
]);
const OUT_OF_TURN_ACTIONS = new Set(['transaction', 'manual_payment']);
const HOST_ACTIONS = new Set(['host_state_repair']);

function parseGame(game) {
    return { ...game, game_state: JSON.parse(game.game_state) };
}

function isRoomMember(roomId, userId) {
    return !!db.prepare(`
        SELECT 1 FROM room_members WHERE room_id = ? AND user_id = ?
    `).get(roomId, userId);
}

function changedPlayerIds(beforeState, afterState) {
    const afterById = new Map((afterState.players || []).map(player => [player.userId, player]));
    return (beforeState.players || [])
        .filter(player => JSON.stringify(player) !== JSON.stringify(afterById.get(player.userId)))
        .map(player => player.userId);
}

function validateStateShape(beforeState, afterState) {
    if (!afterState || !Array.isArray(afterState.players) || !Array.isArray(afterState.properties)) {
        return 'Invalid game state shape';
    }

    const beforePlayerIds = (beforeState.players || []).map(player => player.userId).sort();
    const afterPlayerIds = afterState.players.map(player => player.userId).sort();
    if (JSON.stringify(beforePlayerIds) !== JSON.stringify(afterPlayerIds)) {
        return 'Player list cannot be changed by state patch';
    }

    const beforePropertyIds = (beforeState.properties || []).map(prop => prop.id).sort();
    const afterPropertyIds = afterState.properties.map(prop => prop.id).sort();
    if (JSON.stringify(beforePropertyIds) !== JSON.stringify(afterPropertyIds)) {
        return 'Property list cannot be changed by state patch';
    }

    const playerPropertyIds = new Set();
    const propertyOwners = new Map(afterState.properties.map(prop => [prop.id, prop.ownerId]));
    for (const player of afterState.players) {
        if (!Array.isArray(player.properties) || !Array.isArray(player.corporations) || !Array.isArray(player.debts)) {
            return 'Invalid player portfolio shape';
        }
        for (const prop of player.properties) {
            if (playerPropertyIds.has(prop.id)) return 'Property duplicated across players';
            playerPropertyIds.add(prop.id);
            if (propertyOwners.get(prop.id) !== player.userId) {
                return 'Player property ownership does not match master property owner';
            }
        }
    }

    for (const corp of afterState.corporations || []) {
        const shares = (corp.shareholders || []).reduce((sum, shareholder) => sum + Number(shareholder.shares || 0), 0);
        if (shares > Number(corp.totalShares || 0)) return 'Corporation shareholders exceed total shares';
        for (const asset of corp.assets || []) {
            if (propertyOwners.get(asset.id) !== corp.id) return 'Corporation asset ownership does not match master property owner';
            if (playerPropertyIds.has(asset.id)) return 'Corporation asset is also held by a player';
        }
    }

    return null;
}

function authorizeStatePatch({ actionType, room, game, beforeState, afterState, userId }) {
    if (!actionType) return { ok: false, status: 400, error: 'action_type required' };

    const shapeError = validateStateShape(beforeState, afterState);
    if (shapeError) return { ok: false, status: 400, error: shapeError };

    if (TURN_ACTIONS.has(actionType)) {
        const currentPlayer = beforeState.players && beforeState.players[beforeState.currentPlayerIndex];
        if (!currentPlayer || currentPlayer.userId !== userId) {
            return { ok: false, status: 403, error: 'Not the current player' };
        }
        return { ok: true };
    }

    if (OUT_OF_TURN_ACTIONS.has(actionType)) {
        const changedIds = changedPlayerIds(beforeState, afterState);
        if (changedIds.length > 2) return { ok: false, status: 400, error: 'Market action changed too many players' };
        if (changedIds.length > 0 && !changedIds.includes(userId)) {
            return { ok: false, status: 403, error: 'Market action must involve the acting player' };
        }
        return { ok: true };
    }

    if (HOST_ACTIONS.has(actionType)) {
        if (room.host_id !== userId) return { ok: false, status: 403, error: 'Not the host' };
        return { ok: true };
    }

    return { ok: false, status: 400, error: 'Unknown action_type' };
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

    const existingGame = db.prepare(`SELECT * FROM games WHERE room_id = ?`).get(room_id);
    if (existingGame) return res.json(parseGame(existingGame));

    const gameId = uuidv4();
    try {
        db.exec('BEGIN');
        db.prepare(`
            INSERT INTO games (id, room_id, game_state, current_player_index)
            VALUES (?, ?, ?, 0)
        `).run(gameId, room_id, JSON.stringify(game_state));
        db.prepare(`UPDATE rooms SET status = 'in_progress' WHERE id = ?`).run(room_id);
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        throw err;
    }

    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(gameId);
    io.to(`room:${room_id}`).emit('room:status_change', { ...room, status: 'in_progress' });
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
    const { game_state, action_type, expected_version } = req.body;
    if (!game_state) return res.status(400).json({ error: 'game_state required' });
    if (typeof expected_version !== 'number') return res.status(400).json({ error: 'expected_version required' });

    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!isRoomMember(game.room_id, req.userId)) return res.status(403).json({ error: 'Not a room member' });
    if (game.state_version !== expected_version) {
        return res.status(409).json({ error: 'Stale game state', state_version: game.state_version });
    }

    const room = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(game.room_id);
    const beforeState = JSON.parse(game.game_state);
    const auth = authorizeStatePatch({
        actionType: action_type,
        room,
        game,
        beforeState,
        afterState: game_state,
        userId: req.userId,
    });
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    db.prepare(`
        UPDATE games
        SET game_state = ?, state_version = state_version + 1, updated_at = datetime('now')
        WHERE id = ?
    `).run(JSON.stringify(game_state), req.params.id);

    const updatedGame = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
    io.to(`room:${game.room_id}`).emit('game:state_update', parseGame(updatedGame));

    res.json(parseGame(updatedGame));
});

// POST /api/games/:id/events — log a game event
router.post('/:id/events', requireAuth, (req, res) => {
    const { event_type, event_data } = req.body;
    if (!event_type) return res.status(400).json({ error: 'event_type required' });

    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!isRoomMember(game.room_id, req.userId)) return res.status(403).json({ error: 'Not a room member' });

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
