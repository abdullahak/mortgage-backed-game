// API + real-time helpers (replaces Supabase)

// ----------------------------------------------------------------
// API fetch helper — attaches auth token automatically
// ----------------------------------------------------------------
async function apiFetch(path, options = {}) {
    const token = localStorage.getItem('auth_token');
    const res = await fetch(window.API_BASE + path, {
        ...options,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...options.headers
        }
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
}

// ----------------------------------------------------------------
// Socket.io connection (lazy — initialised once per page)
// ----------------------------------------------------------------
let _socket = null;

function getSocket() {
    if (!_socket) {
        const token = localStorage.getItem('auth_token');
        _socket = io({ auth: token ? { token } : {} });
    }
    return _socket;
}

// ----------------------------------------------------------------
// Auth helpers
// ----------------------------------------------------------------

async function requireAuth() {
    const token = localStorage.getItem('auth_token');
    if (!token) {
        window.location.href = 'landing.html';
        return null;
    }
    try {
        const user = await apiFetch('/auth/me');
        return user;
    } catch {
        localStorage.removeItem('auth_token');
        window.location.href = 'landing.html';
        return null;
    }
}

async function getCurrentUser() {
    const token = localStorage.getItem('auth_token');
    if (!token) return null;
    try {
        return await apiFetch('/auth/me');
    } catch {
        return null;
    }
}

async function handleLogout() {
    try {
        await apiFetch('/auth/signout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('auth_token');
    window.location.href = 'landing.html';
}

// ----------------------------------------------------------------
// Room helpers
// ----------------------------------------------------------------

async function createNewRoom(roomName, maxPlayers, playerName) {
    return apiFetch('/rooms', {
        method: 'POST',
        body: JSON.stringify({ name: roomName, max_players: maxPlayers, player_name: playerName })
    });
}

async function joinRoomByCode(inviteCode, playerName) {
    // 1. Find room by code
    const room = await apiFetch(`/rooms/by-code/${inviteCode.toUpperCase()}`);

    // 2. Join the room (server handles "already joined" gracefully)
    return apiFetch(`/rooms/${room.id}/join`, {
        method: 'POST',
        body: JSON.stringify({ player_name: playerName })
    });
}

async function getUserRooms() {
    try {
        return await apiFetch('/rooms/mine');
    } catch {
        return [];
    }
}

async function getRoomById(roomId) {
    return apiFetch(`/rooms/${roomId}`);
}

async function startGame(roomId, initialGameState) {
    const user = await getCurrentUser();
    if (!user) throw new Error('Not authenticated');

    const room = await getRoomById(roomId);
    if (room.host_id !== user.id) throw new Error('Only the host can start the game');

    // Update room status to in_progress
    await apiFetch(`/rooms/${roomId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'in_progress' })
    });

    // Create game record
    const game = await apiFetch('/games', {
        method: 'POST',
        body: JSON.stringify({ room_id: roomId, game_state: initialGameState })
    });

    // Log game start event
    await logGameEvent(game.id, 'game_started', {
        player_count: room.room_members.length,
        players: room.room_members.map(m => m.player_name)
    });

    return game;
}

async function getGameByRoomId(roomId) {
    try {
        return await apiFetch(`/games/by-room/${roomId}`);
    } catch (err) {
        if (err.message.includes('404') || err.message.includes('not found')) return null;
        throw err;
    }
}

async function logGameEvent(gameId, eventType, eventData) {
    try {
        await apiFetch(`/games/${gameId}/events`, {
            method: 'POST',
            body: JSON.stringify({ event_type: eventType, event_data: eventData })
        });
        return true;
    } catch (err) {
        console.error('Error logging game event:', err);
        return false;
    }
}

// Send invite email via backend (best-effort)
async function callSendRoomCode(payload) {
    try {
        await apiFetch('/rooms/send-code', {
            method: 'POST',
            body: JSON.stringify(payload)
        });
    } catch (err) {
        console.warn('send-room-code error:', err);
    }
}

// ----------------------------------------------------------------
// Real-time subscriptions (Socket.io)
// ----------------------------------------------------------------

// Subscribe to room member + status changes
// Returns an object with an unsubscribe() method
function subscribeToRoom(roomId, onMemberChange, onStatusChange) {
    const socket = getSocket();
    socket.emit('join_room', roomId);

    function memberHandler(room) { if (onMemberChange) onMemberChange(room); }
    function statusHandler(room) { if (onStatusChange) onStatusChange(room); }

    socket.on('room:member_change', memberHandler);
    socket.on('room:status_change', statusHandler);

    return {
        unsubscribe() {
            socket.off('room:member_change', memberHandler);
            socket.off('room:status_change', statusHandler);
            socket.emit('leave_room', roomId);
        }
    };
}

// Subscribe to game state updates
function subscribeToGame(roomId, onGameUpdate) {
    const socket = getSocket();
    socket.emit('join_room', roomId);

    function gameHandler(game) { if (onGameUpdate) onGameUpdate(game); }
    socket.on('game:state_update', gameHandler);

    return {
        unsubscribe() {
            socket.off('game:state_update', gameHandler);
        }
    };
}

// Legacy alias used in waiting.js (kept for backwards compat)
async function unsubscribeChannel(sub) {
    if (sub && typeof sub.unsubscribe === 'function') sub.unsubscribe();
}

// ----------------------------------------------------------------
// Shared utilities
// ----------------------------------------------------------------

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
    return date.toLocaleDateString();
}

// Generate random invite code (kept for any local usage)
function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
