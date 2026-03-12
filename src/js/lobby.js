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
                    <span>Created ${formatTimeAgo(room.created_at)}</span>
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

// Close modal
function closeModal(modalId) {
    document.getElementById(modalId).classList.remove('active');

    if (modalId === 'createRoomModal') {
        document.getElementById('room-name').value = '';
        document.getElementById('max-players').value = '4';
        document.getElementById('host-player-name').value = '';
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

        // Notify host via email with room code (best-effort)
        sendRoomCodeEmail(userSession.user.email, room.invite_code, room.name);

        // Redirect to waiting room
        window.location.href = `waiting.html?room=${room.id}`;
    } catch (error) {
        console.error('Error creating room:', error);
        alert('Error creating game: ' + error.message);
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

// escapeHtml and formatTimeAgo are defined in supabase.js

// Close modal when clicking outside
window.onclick = function(event) {
    if (event.target.classList.contains('modal')) {
        event.target.classList.remove('active');
    }
}

// Handle Enter key in modals
document.addEventListener('DOMContentLoaded', () => {
    ['room-name', 'max-players', 'host-player-name'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') createRoom();
            });
        }
    });
});

function sendRoomCodeEmail(email, inviteCode, roomName) {
    callSendRoomCode({ action: 'room_created', email, inviteCode, roomName });
}

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLobby);
} else {
    initLobby();
}
