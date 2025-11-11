// Waiting room page with real-time updates

let currentRoom = null;
let currentUser = null;
let roomChannel = null;
let isHost = false;

// Get room ID from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');

// Initialize waiting room
async function initWaitingRoom() {
    // Check authentication
    const session = await requireAuth();
    if (!session) return;

    currentUser = await getCurrentUser();
    document.getElementById('user-email').textContent = currentUser.email;

    if (!roomId) {
        alert('No room ID provided');
        window.location.href = 'lobby.html';
        return;
    }

    // Load room data
    await loadRoomData();

    // Subscribe to real-time updates
    subscribeToRoomUpdates();

    // Check if game has already started
    checkGameStatus();
}

// Load room data
async function loadRoomData() {
    try {
        const room = await getRoomById(roomId);
        currentRoom = room;

        // Update UI
        document.getElementById('room-name').textContent = room.name;
        document.getElementById('invite-code').textContent = room.invite_code;
        document.getElementById('player-count').textContent =
            `${room.room_members.length}/${room.max_players} players`;

        // Check if current user is host
        isHost = room.host_id === currentUser.id;

        if (isHost) {
            document.getElementById('host-controls').style.display = 'block';
        }

        // Update status
        updateRoomStatus(room.status);

        // Render players
        renderPlayers(room.room_members);

        // Update start button state
        updateStartButtonState(room.room_members.length);

    } catch (error) {
        console.error('Error loading room:', error);
        alert('Error loading room: ' + error.message);
        window.location.href = 'lobby.html';
    }
}

// Subscribe to real-time room updates
function subscribeToRoomUpdates() {
    roomChannel = subscribeToRoom(roomId, async (payload) => {
        console.log('Room update:', payload);

        // Reload room data when changes occur
        await loadRoomData();

        // Log activity
        if (payload.eventType === 'INSERT') {
            logActivity('A new player joined the room');
        } else if (payload.eventType === 'DELETE') {
            logActivity('A player left the room');
        }
    });

    // Also subscribe to room status changes
    supabase
        .channel(`room-status:${roomId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: `id=eq.${roomId}`
            },
            async (payload) => {
                console.log('Room status update:', payload);

                if (payload.new.status === 'in_progress') {
                    logActivity('Game is starting!');

                    // Redirect to game page after short delay
                    setTimeout(() => {
                        window.location.href = `game.html?room=${roomId}`;
                    }, 1500);
                }
            }
        )
        .subscribe();
}

// Render players list
function renderPlayers(members) {
    const container = document.getElementById('players-list');

    if (members.length === 0) {
        container.innerHTML = `
            <div class="loading">
                <p>No players yet</p>
            </div>
        `;
        return;
    }

    container.innerHTML = members.map(member => `
        <div class="player-item">
            <div class="player-item-info">
                <strong>${escapeHtml(member.player_name)}</strong>
                ${member.user_id === currentRoom.host_id ?
                    '<span class="player-badge">Host</span>' : ''}
                ${member.user_id === currentUser.id ?
                    '<span class="player-badge" style="background: #3498db;">You</span>' : ''}
            </div>
            <div style="color: #95a5a6; font-size: 0.9em;">
                Joined ${formatTimeAgo(member.joined_at)}
            </div>
        </div>
    `).join('');
}

// Update room status display
function updateRoomStatus(status) {
    const statusEl = document.getElementById('room-status');
    statusEl.className = `room-status ${status}`;

    const statusText = {
        'waiting': 'Waiting for players',
        'in_progress': 'Game in progress',
        'completed': 'Game completed'
    };

    statusEl.textContent = statusText[status] || status;
}

// Update start button state
function updateStartButtonState(playerCount) {
    const startBtn = document.getElementById('start-game-btn');

    if (!isHost) return;

    if (playerCount < 2) {
        startBtn.disabled = true;
        startBtn.textContent = 'Need at least 2 players';
    } else {
        startBtn.disabled = false;
        startBtn.textContent = `Start Game (${playerCount} players)`;
    }
}

// Copy invite code to clipboard
function copyInviteCode() {
    const code = document.getElementById('invite-code').textContent;
    const btn = event.target;
    const originalText = btn.textContent;

    // Try modern clipboard API first
    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {
            // Visual feedback
            btn.textContent = 'Copied!';
            btn.style.background = 'linear-gradient(45deg, #2ecc71, #27ae60)';

            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        }).catch(err => {
            console.error('Clipboard API failed:', err);
            fallbackCopyToClipboard(code, btn, originalText);
        });
    } else {
        // Fallback for older browsers
        fallbackCopyToClipboard(code, btn, originalText);
    }
}

// Fallback copy method using textarea
function fallbackCopyToClipboard(text, btn, originalText) {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();

    try {
        const successful = document.execCommand('copy');
        if (successful) {
            btn.textContent = 'Copied!';
            btn.style.background = 'linear-gradient(45deg, #2ecc71, #27ae60)';

            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        } else {
            alert('Code: ' + text + '\n\nPlease copy manually.');
        }
    } catch (err) {
        console.error('Fallback copy failed:', err);
        alert('Code: ' + text + '\n\nPlease copy manually.');
    } finally {
        document.body.removeChild(textarea);
    }
}

// Start game (host only)
async function startGameFromLobby() {
    if (!isHost) {
        alert('Only the host can start the game');
        return;
    }

    if (!currentRoom || currentRoom.room_members.length < 2) {
        alert('Need at least 2 players to start');
        return;
    }

    try {
        const startBtn = document.getElementById('start-game-btn');
        startBtn.disabled = true;
        startBtn.textContent = 'Starting game...';

        // Create initial game state
        const initialGameState = {
            players: currentRoom.room_members.map(member => ({
                userId: member.user_id,
                name: member.player_name,
                cash: 1500,
                properties: [],
                equities: [],
                debts: [],
                interestOwed: 0,
                netWorth: 1500,
                bankrupt: false
            })),
            currentPlayerIndex: 0,
            properties: MONOPOLY_PROPERTIES.map(prop => ({
                ...prop,
                owner: null,
                houses: 0,
                available: true
            })),
            corporations: [],
            gameLog: [],
            settings: {
                interestRate: 5,
                passGoAmount: 200
            }
        };

        // Start the game (calls helper function from supabase.js)
        const game = await startGame(roomId, initialGameState);

        logActivity('Game started! Redirecting...');

        // Redirect to game page
        setTimeout(() => {
            window.location.href = `game.html?room=${roomId}`;
        }, 1000);

    } catch (error) {
        console.error('Error starting game:', error);
        alert('Error starting game: ' + error.message);

        const startBtn = document.getElementById('start-game-btn');
        startBtn.disabled = false;
        startBtn.textContent = 'Start Game';
    }
}

// Leave room
async function leaveRoom() {
    if (!confirm('Are you sure you want to leave this room?')) {
        return;
    }

    try {
        // Remove user from room members
        const { error } = await supabase
            .from('room_members')
            .delete()
            .eq('room_id', roomId)
            .eq('user_id', currentUser.id);

        if (error) throw error;

        // Unsubscribe from updates
        if (roomChannel) {
            await unsubscribeChannel(roomChannel);
        }

        // Redirect to lobby
        window.location.href = 'lobby.html';

    } catch (error) {
        console.error('Error leaving room:', error);
        alert('Error leaving room: ' + error.message);
    }
}

// Check if game has already started
async function checkGameStatus() {
    try {
        const game = await getGameByRoomId(roomId);

        if (game && currentRoom.status === 'in_progress') {
            // Game already started, redirect to game page
            window.location.href = `game.html?room=${roomId}`;
        }
    } catch (error) {
        console.error('Error checking game status:', error);
    }
}

// Log activity
function logActivity(message) {
    const logContainer = document.getElementById('activity-log');
    const timestamp = new Date().toLocaleTimeString();

    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.textContent = `[${timestamp}] ${message}`;

    logContainer.insertBefore(entry, logContainer.firstChild);

    // Keep only last 10 entries
    while (logContainer.children.length > 10) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// Utility functions
function formatTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Monopoly properties for initial game state
const MONOPOLY_PROPERTIES = [
    { name: "Mediterranean Avenue", color: "Brown", price: 60, rent: [2, 10, 30, 90, 160, 250] },
    { name: "Baltic Avenue", color: "Brown", price: 60, rent: [4, 20, 60, 180, 320, 450] },
    { name: "Oriental Avenue", color: "Light Blue", price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { name: "Vermont Avenue", color: "Light Blue", price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { name: "Connecticut Avenue", color: "Light Blue", price: 120, rent: [8, 40, 100, 300, 450, 600] },
    { name: "St. Charles Place", color: "Pink", price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { name: "Electric Company", color: "Utility", price: 150, rent: [4, 10] },
    { name: "States Avenue", color: "Pink", price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { name: "Virginia Avenue", color: "Pink", price: 160, rent: [12, 60, 180, 500, 700, 900] },
    { name: "Pennsylvania Railroad", color: "Railroad", price: 200, rent: [25, 50, 100, 200] },
    { name: "St. James Place", color: "Orange", price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { name: "Tennessee Avenue", color: "Orange", price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { name: "New York Avenue", color: "Orange", price: 200, rent: [16, 80, 220, 600, 800, 1000] },
    { name: "Kentucky Avenue", color: "Red", price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { name: "Indiana Avenue", color: "Red", price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { name: "Illinois Avenue", color: "Red", price: 240, rent: [20, 100, 300, 750, 925, 1100] },
    { name: "B. & O. Railroad", color: "Railroad", price: 200, rent: [25, 50, 100, 200] },
    { name: "Atlantic Avenue", color: "Yellow", price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { name: "Ventnor Avenue", color: "Yellow", price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { name: "Water Works", color: "Utility", price: 150, rent: [4, 10] },
    { name: "Marvin Gardens", color: "Yellow", price: 280, rent: [24, 120, 360, 850, 1025, 1200] },
    { name: "Pacific Avenue", color: "Green", price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { name: "North Carolina Avenue", color: "Green", price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { name: "Pennsylvania Avenue", color: "Green", price: 320, rent: [28, 150, 450, 1000, 1200, 1400] },
    { name: "Short Line", color: "Railroad", price: 200, rent: [25, 50, 100, 200] },
    { name: "Park Place", color: "Dark Blue", price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
    { name: "Boardwalk", color: "Dark Blue", price: 400, rent: [50, 200, 600, 1400, 1700, 2000] }
];

// Cleanup on page unload
window.addEventListener('beforeunload', async () => {
    if (roomChannel) {
        await unsubscribeChannel(roomChannel);
    }
});

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWaitingRoom);
} else {
    initWaitingRoom();
}
