// Lobby page functions

let userSession = null;

// Initialize lobby
async function initLobby() {
    userSession = await requireAuth();
    if (!userSession) return;

    // Display user email
    const user = await getCurrentUser();
    document.getElementById('user-email').textContent = user.email;

    // Load user's rooms
    await loadUserRooms();
}

// Load user's active rooms
async function loadUserRooms() {
    try {
        const rooms = await getUserRooms();
        const roomsList = document.getElementById('active-rooms-list');

        if (rooms.length === 0) {
            roomsList.innerHTML = `
                <div class="loading">
                    <p>No active games yet. Create one to get started!</p>
                </div>
            `;
            return;
        }

        roomsList.innerHTML = rooms.map(room => `
            <div class="room-card" onclick="goToRoom('${room.id}')">
                <div class="room-card-header">
                    <div class="room-name">${escapeHtml(room.name)}</div>
                    <div class="room-status ${room.status}">${formatStatus(room.status)}</div>
                </div>
                <div class="room-info">
                    <span>${room.room_members ? room.room_members.length : 0}/${room.max_players} players</span>
                    <span>Created ${formatDate(room.created_at)}</span>
                </div>
                <div>
                    <span class="room-invite-code">${room.invite_code}</span>
                </div>
            </div>
        `).join('');
    } catch (error) {
        console.error('Error loading rooms:', error);
        document.getElementById('active-rooms-list').innerHTML = `
            <div class="loading">
                <p style="color: #e74c3c;">Error loading games. Please refresh the page.</p>
            </div>
        `;
    }
}

// Show create room modal
function showCreateRoomModal() {
    document.getElementById('createRoomModal').classList.add('active');
}

// Show join room modal
function showJoinRoomModal() {
    document.getElementById('joinRoomModal').classList.add('active');
}

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');

    // Clear form fields
    if (modalId === 'createRoomModal') {
        document.getElementById('room-name').value = '';
        document.getElementById('max-players').value = '4';
        document.getElementById('host-player-name').value = '';
    } else if (modalId === 'joinRoomModal') {
        document.getElementById('invite-code').value = '';
        document.getElementById('join-player-name').value = '';
        document.getElementById('join-error').classList.remove('active');
    }
}

// Create room
async function createRoom() {
    const roomName = document.getElementById('room-name').value.trim();
    const maxPlayers = parseInt(document.getElementById('max-players').value);
    const playerName = document.getElementById('host-player-name').value.trim();

    if (!roomName || !playerName) {
        alert('Please fill in all fields');
        return;
    }

    if (maxPlayers < 2 || maxPlayers > 8) {
        alert('Max players must be between 2 and 8');
        return;
    }

    try {
        const room = await createNewRoom(roomName, maxPlayers, playerName);
        closeModal('createRoomModal');

        // Redirect to waiting room
        window.location.href = `waiting.html?room=${room.id}`;
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Error creating game: ' + error.message);
    }
}

// Join room
async function joinRoom() {
    const inviteCode = document.getElementById('invite-code').value.trim().toUpperCase();
    const playerName = document.getElementById('join-player-name').value.trim();
    const errorEl = document.getElementById('join-error');

    if (!inviteCode || !playerName) {
        errorEl.textContent = 'Please fill in all fields';
        errorEl.classList.add('active');
        return;
    }

    try {
        const room = await joinRoomByCode(inviteCode, playerName);
        closeModal('joinRoomModal');

        // Redirect to waiting room
        window.location.href = `waiting.html?room=${room.id}`;
    } catch (error) {
        console.error('Error joining room:', error);
        errorEl.textContent = error.message || 'Error joining game';
        errorEl.classList.add('active');
    }
}

// Go to room
function goToRoom(roomId) {
    window.location.href = `waiting.html?room=${roomId}`;
}

// Utility functions
function formatStatus(status) {
    const statusMap = {
        'waiting': 'Waiting',
        'in_progress': 'In Progress',
        'completed': 'Completed'
    };
    return statusMap[status] || status;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return date.toLocaleDateString();
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}

// Handle Enter key in modals
document.addEventListener('DOMContentLoaded', () => {
    // Create room modal
    ['room-name', 'max-players', 'host-player-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') createRoom();
            });
        }
    });

    // Join room modal
    ['invite-code', 'join-player-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') joinRoom();
            });
        }
    });
});

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLobby);
} else {
    initLobby();
}
