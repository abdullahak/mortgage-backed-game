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
        let message = text || `HTTP ${res.status}`;
        try {
            const parsed = JSON.parse(text);
            message = parsed.error || message;
        } catch {}
        const err = new Error(message);
        err.status = res.status;
        err.responseText = text;
        throw err;
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
        window.location.href = 'index.html';
        return null;
    }
    try {
        const user = await apiFetch('/auth/me');
        return user;
    } catch {
        localStorage.removeItem('auth_token');
        window.location.href = 'index.html';
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
    window.location.href = 'index.html';
}

// ----------------------------------------------------------------
// Room helpers
// ----------------------------------------------------------------

const HOTSEAT_RESUME_STORAGE_KEY = 'mortgage_hotseat_resume_rooms';

function getHotseatResumeRooms() {
    try {
        return JSON.parse(localStorage.getItem(HOTSEAT_RESUME_STORAGE_KEY) || '{}');
    } catch {
        return {};
    }
}

function saveHotseatResume(room, tokenRecords) {
    if (!room || !room.invite_code || !Array.isArray(tokenRecords) || tokenRecords.length === 0) return;

    const rooms = getHotseatResumeRooms();
    const code = room.invite_code.toUpperCase();
    rooms[code] = {
        roomId: room.id,
        inviteCode: code,
        tokens: tokenRecords,
        savedAt: new Date().toISOString()
    };
    localStorage.setItem(HOTSEAT_RESUME_STORAGE_KEY, JSON.stringify(rooms));
}

function getHotseatResumeByCode(inviteCode) {
    const code = String(inviteCode || '').trim().toUpperCase();
    if (!code) return null;

    const resume = getHotseatResumeRooms()[code];
    if (!resume || !resume.roomId || !Array.isArray(resume.tokens) || resume.tokens.length === 0) {
        return null;
    }
    return resume;
}

function restoreHotseatResume(resume) {
    if (!resume || !resume.roomId || !Array.isArray(resume.tokens) || resume.tokens.length === 0) {
        return false;
    }

    sessionStorage.setItem('hotseat_tokens', JSON.stringify(resume.tokens));
    localStorage.setItem('auth_token', resume.tokens[0].token);
    return true;
}

function restoreHotseatPlayer(resume, userId) {
    if (!resume || !Array.isArray(resume.tokens)) return false;

    const player = resume.tokens.find(record => record.userId === userId);
    if (!player || !player.token) return false;

    sessionStorage.removeItem('hotseat_tokens');
    localStorage.setItem('auth_token', player.token);
    return true;
}

function continueHotseatMode(inviteCode) {
    const resume = getHotseatResumeByCode(inviteCode);
    if (!resume || !restoreHotseatResume(resume)) return false;

    window.location.href = `game.html?room=${encodeURIComponent(resume.roomId)}`;
    return true;
}

function continueHotseatOnline(inviteCode, userId) {
    const resume = getHotseatResumeByCode(inviteCode);
    if (!resume || !restoreHotseatPlayer(resume, userId)) return false;

    window.location.href = `game.html?room=${encodeURIComponent(resume.roomId)}`;
    return true;
}

function renderHotseatResumeOptions(container, inviteCode) {
    if (!container) return false;

    const resume = getHotseatResumeByCode(inviteCode);
    if (!resume) {
        container.innerHTML = '';
        container.style.display = 'none';
        return false;
    }

    container.innerHTML = '';
    container.style.display = 'block';

    const title = document.createElement('h4');
    title.textContent = 'Continue this saved hotseat game';
    container.appendChild(title);

    const modeText = document.createElement('p');
    modeText.className = 'hotseat-resume-hint';
    modeText.textContent = 'Use local hotseat on this device, or continue online as one player.';
    container.appendChild(modeText);

    const hotseatButton = document.createElement('button');
    hotseatButton.type = 'button';
    hotseatButton.className = 'btn btn-primary hotseat-resume-main';
    hotseatButton.textContent = 'Continue Hotseat';
    hotseatButton.addEventListener('click', () => continueHotseatMode(inviteCode));
    container.appendChild(hotseatButton);

    const playerList = document.createElement('div');
    playerList.className = 'hotseat-player-options';
    const playerLabel = document.createElement('p');
    playerLabel.className = 'hotseat-resume-hint';
    playerLabel.textContent = 'Continue online as:';
    playerList.appendChild(playerLabel);

    resume.tokens.forEach(record => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary btn-sm hotseat-player-option';
        button.textContent = record.name || 'Player';
        button.addEventListener('click', () => continueHotseatOnline(inviteCode, record.userId));
        playerList.appendChild(button);
    });

    container.appendChild(playerList);
    return true;
}

function renderExistingRoomMemberOptions(container, inviteCode, room) {
    if (!container || !room || !Array.isArray(room.room_members)) return false;

    const roomIsClosedToNewMembers = room.status !== 'waiting' || room.room_members.length >= room.max_players;
    if (!roomIsClosedToNewMembers) return false;

    container.innerHTML = '';
    container.style.display = 'block';

    const title = document.createElement('h4');
    title.textContent = 'Continue as an existing player';
    container.appendChild(title);

    const hint = document.createElement('p');
    hint.className = 'hotseat-resume-hint';
    hint.textContent = 'This room is already full. Continue local hotseat, or choose one player for online mode.';
    container.appendChild(hint);

    const hotseatButton = document.createElement('button');
    hotseatButton.type = 'button';
    hotseatButton.className = 'btn btn-primary hotseat-resume-main';
    hotseatButton.textContent = 'Continue Hotseat';
    hotseatButton.addEventListener('click', () => continueExistingRoomHotseat(inviteCode));
    container.appendChild(hotseatButton);

    const playerList = document.createElement('div');
    playerList.className = 'hotseat-player-options';
    const playerLabel = document.createElement('p');
    playerLabel.className = 'hotseat-resume-hint';
    playerLabel.textContent = 'Continue online as:';
    playerList.appendChild(playerLabel);

    room.room_members.forEach(member => {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'btn btn-secondary btn-sm hotseat-player-option';
        button.textContent = member.player_name || 'Player';
        button.addEventListener('click', () => continueExistingRoomMember(inviteCode, member.id));
        playerList.appendChild(button);
    });

    container.appendChild(playerList);
    return true;
}

function clearHotseatResume(inviteCode) {
    const code = String(inviteCode || '').trim().toUpperCase();
    if (!code) return;

    const rooms = getHotseatResumeRooms();
    delete rooms[code];
    localStorage.setItem(HOTSEAT_RESUME_STORAGE_KEY, JSON.stringify(rooms));
}

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

async function claimRoomMemberByCode(inviteCode, memberId) {
    return apiFetch(`/rooms/by-code/${inviteCode.toUpperCase()}/claim-member`, {
        method: 'POST',
        body: JSON.stringify({ member_id: memberId })
    });
}

async function claimRoomHotseatByCode(inviteCode) {
    return apiFetch(`/rooms/by-code/${inviteCode.toUpperCase()}/claim-hotseat`, {
        method: 'POST'
    });
}

async function continueExistingRoomMember(inviteCode, memberId) {
    const data = await claimRoomMemberByCode(inviteCode, memberId);
    localStorage.setItem('auth_token', data.token);
    sessionStorage.removeItem('hotseat_tokens');

    const room = data.room;
    window.location.href = room.status === 'in_progress'
        ? `game.html?room=${encodeURIComponent(room.id)}`
        : `waiting.html?room=${encodeURIComponent(room.id)}`;
}

async function continueExistingRoomHotseat(inviteCode) {
    const data = await claimRoomHotseatByCode(inviteCode);
    const room = data.room;
    const tokens = data.tokens || [];
    if (tokens.length === 0) throw new Error('No players found for hotseat resume');

    sessionStorage.setItem('hotseat_tokens', JSON.stringify(tokens));
    localStorage.setItem('auth_token', tokens[0].token);
    saveHotseatResume(room, tokens);

    window.location.href = room.status === 'in_progress'
        ? `game.html?room=${encodeURIComponent(room.id)}`
        : `waiting.html?room=${encodeURIComponent(room.id)}`;
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

    // Create game record. The backend also marks the room in progress atomically.
    const game = await apiFetch('/games', {
        method: 'POST',
        body: JSON.stringify({ room_id: roomId, game_state: initialGameState })
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
    const join = () => socket.emit('join_room', roomId);
    join();

    function gameHandler(game) { if (onGameUpdate) onGameUpdate(game); }
    socket.on('connect', join);
    socket.on('game:state_update', gameHandler);

    return {
        unsubscribe() {
            socket.off('connect', join);
            socket.off('game:state_update', gameHandler);
            socket.emit('leave_room', roomId);
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
