const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db');
const { requireAuth } = require('./auth');
const { getConfig } = require('../config');
const {
    createInitialGame,
    normalizeState,
    applyAction,
    GameRuleError,
    MONOPOLY_PROPERTIES,
    BOARD_SQUARES,
    HOUSE_COSTS,
    CHANCE_CARDS,
    COMMUNITY_CHEST_CARDS,
} = require('../domain/gameRules');

module.exports = (io) => {
const router = express.Router();
const config = getConfig();

function parseGame(game) {
    const gameState = normalizeState(JSON.parse(game.game_state));
    return { ...game, game_state: gameState, gameState, stateVersion: game.state_version };
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

function getRoom(roomId) {
    return db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(roomId);
}

function insertEvents(gameId, actorUserId, events) {
    const stmt = db.prepare(`
        INSERT INTO game_events (id, game_id, player_id, event_type, event_data)
        VALUES (?, ?, ?, ?, ?)
    `);
    events.forEach(event => {
        stmt.run(uuidv4(), gameId, event.playerId || actorUserId, event.type, JSON.stringify(event.data || {}));
    });
}

function makeActionResponse(game, events) {
    const parsed = parseGame(game);
    return {
        game: parsed,
        events,
    };
}

function requireMember(req, res, next) {
    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!isRoomMember(game.room_id, req.userId)) return res.status(403).json({ error: 'Not a room member' });
    req.gameRow = game;
    next();
}

// GET /api/games/config — authoritative board/config data
router.get('/config', (_req, res) => {
    res.json({ properties: MONOPOLY_PROPERTIES, board: BOARD_SQUARES, houseCosts: HOUSE_COSTS, chanceCards: CHANCE_CARDS, communityChestCards: COMMUNITY_CHEST_CARDS });
});

// POST /api/games — create a new game for a room
router.post('/', requireAuth, (req, res) => {
    const { room_id, game_state } = req.body;
    if (!room_id) {
        return res.status(400).json({ error: 'room_id required' });
    }

    const room = getRoom(room_id);
    if (!room) return res.status(404).json({ error: 'Room not found' });
    if (room.host_id !== req.userId) return res.status(403).json({ error: 'Not the host' });

    const existingGame = db.prepare(`SELECT * FROM games WHERE room_id = ?`).get(room_id);
    if (existingGame) return res.json(parseGame(existingGame));

    const gameId = uuidv4();
    const roomMembers = db.prepare(`SELECT * FROM room_members WHERE room_id = ? ORDER BY joined_at ASC`).all(room_id);
    const initialState = normalizeState(game_state || createInitialGame(roomMembers));
    try {
        db.exec('BEGIN');
        db.prepare(`
            INSERT INTO games (id, room_id, game_state, current_player_index)
            VALUES (?, ?, ?, 0)
        `).run(gameId, room_id, JSON.stringify(initialState));
        db.prepare(`UPDATE rooms SET status = 'in_progress' WHERE id = ?`).run(room_id);
        db.prepare(`
            INSERT INTO game_events (id, game_id, player_id, event_type, event_data)
            VALUES (?, ?, ?, ?, ?)
        `).run(uuidv4(), gameId, req.userId, 'game_started', JSON.stringify({
            player_count: initialState.players.length,
            players: initialState.players.map(player => player.name),
        }));
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
router.get('/by-room/:roomId', requireAuth, (req, res) => {
    const game = db.prepare(`SELECT * FROM games WHERE room_id = ?`).get(req.params.roomId);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!isRoomMember(game.room_id, req.userId)) return res.status(403).json({ error: 'Not a room member' });
    res.json(parseGame(game));
});

// GET /api/games/:id
router.get('/:id', requireAuth, (req, res) => {
    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!isRoomMember(game.room_id, req.userId)) return res.status(403).json({ error: 'Not a room member' });
    res.json(parseGame(game));
});

// POST /api/games/:id/actions — authoritative game action
router.post('/:id/actions', requireAuth, requireMember, (req, res) => {
    const { actionId, type, payload, expectedVersion } = req.body;
    if (!actionId || !type) return res.status(400).json({ error: 'actionId and type required' });
    if (typeof expectedVersion !== 'number') return res.status(400).json({ error: 'expectedVersion required' });

    const existing = db.prepare(`SELECT result_json FROM game_actions WHERE game_id = ? AND action_id = ?`).get(req.params.id, actionId);
    if (existing) return res.json(JSON.parse(existing.result_json));

    let result;
    let updatedGame;
    let events;
    try {
        db.exec('BEGIN');
        const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
        if (!game) throw new GameRuleError(404, 'Game not found');
        if (game.state_version !== expectedVersion) {
            throw new GameRuleError(409, 'Stale game state');
        }
        const room = getRoom(game.room_id);
        const beforeState = normalizeState(JSON.parse(game.game_state));
        const testDice = config.allowStateRepair && Array.isArray((payload || {}).testDice)
            ? (payload || {}).testDice
            : undefined;
        const applied = applyAction(beforeState, req.userId, { type, payload: payload || {} }, { hostId: room.host_id, dice: testDice });
        const afterState = applied.state;
        events = applied.events;
        db.prepare(`
            UPDATE games
            SET game_state = ?, current_player_index = ?, state_version = state_version + 1, updated_at = datetime('now')
            WHERE id = ?
        `).run(JSON.stringify(afterState), afterState.currentPlayerIndex, req.params.id);
        if (afterState.ended) {
            db.prepare(`UPDATE rooms SET status = 'completed' WHERE id = ?`).run(game.room_id);
        }
        insertEvents(req.params.id, req.userId, events);
        updatedGame = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
        result = makeActionResponse(updatedGame, events);
        db.prepare(`
            INSERT INTO game_actions (id, game_id, actor_user_id, action_id, action_type, request_json, result_json, state_version)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(uuidv4(), req.params.id, req.userId, actionId, type, JSON.stringify(req.body), JSON.stringify(result), updatedGame.state_version);
        db.exec('COMMIT');
    } catch (err) {
        db.exec('ROLLBACK');
        if (err instanceof GameRuleError) {
            const body = err.status === 409
                ? { error: err.message, state_version: db.prepare(`SELECT state_version FROM games WHERE id = ?`).get(req.params.id)?.state_version }
                : { error: err.message };
            return res.status(err.status).json(body);
        }
        throw err;
    }

    io.to(`room:${updatedGame.room_id}`).emit('game:state_update', parseGame(updatedGame));
    res.json(result);
});

// PATCH /api/games/:id/state — emergency host state repair only
router.patch('/:id/state', requireAuth, (req, res) => {
    if (!config.allowStateRepair) return res.status(404).json({ error: 'State repair disabled' });
    const { game_state, action_type, expected_version } = req.body;
    if (!game_state) return res.status(400).json({ error: 'game_state required' });
    if (typeof expected_version !== 'number') return res.status(400).json({ error: 'expected_version required' });

    const game = db.prepare(`SELECT * FROM games WHERE id = ?`).get(req.params.id);
    if (!game) return res.status(404).json({ error: 'Game not found' });
    if (!isRoomMember(game.room_id, req.userId)) return res.status(403).json({ error: 'Not a room member' });
    const room = db.prepare(`SELECT * FROM rooms WHERE id = ?`).get(game.room_id);
    if (!room || room.host_id !== req.userId) return res.status(403).json({ error: 'Not the host' });
    if (game.state_version !== expected_version) {
        return res.status(409).json({ error: 'Stale game state', state_version: game.state_version });
    }

    const beforeState = JSON.parse(game.game_state);
    const shapeError = validateStateShape(beforeState, game_state);
    if (shapeError) return res.status(400).json({ error: shapeError });
    if (action_type !== 'host_state_repair') return res.status(400).json({ error: 'Only host_state_repair is allowed' });
    const repairedState = normalizeState(game_state);

    db.prepare(`
        UPDATE games
        SET game_state = ?, state_version = state_version + 1, updated_at = datetime('now')
        WHERE id = ?
    `).run(JSON.stringify(repairedState), req.params.id);

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
router.get('/:id/events', requireAuth, requireMember, (req, res) => {
    const events = db.prepare(`
        SELECT * FROM game_events WHERE game_id = ?
        ORDER BY created_at DESC LIMIT 100
    `).all(req.params.id);

    res.json(events.map(e => ({ ...e, event_data: JSON.parse(e.event_data) })));
});

    return router;
};
