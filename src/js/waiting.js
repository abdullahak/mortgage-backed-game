// Waiting room page with real-time updates

let currentRoom = null;
let currentUser = null;
let roomChannel = null;
let isHost = false;

// Get params from URL
const urlParams = new URLSearchParams(window.location.search);
const roomId = urlParams.get('room');
const roomCode = urlParams.get('code'); // unauthenticated join path

// Initialize waiting room
async function initWaitingRoom() {
    if (roomCode) {
        // Guest join path: show name form, sign in anonymously after submission
        showGuestJoinSection();
        return;
    }

    if (!roomId) {
        alert('No room ID provided');
        window.location.href = 'landing.html';
        return;
    }

    // Authenticated path (host or returning member)
    const session = await requireAuth();
    if (!session) return;

    currentUser = await getCurrentUser();
    const emailDisplay = document.getElementById('user-email');
    if (emailDisplay) {
        emailDisplay.textContent = currentUser.email || 'Guest';
    }

    await loadRoomData();
    subscribeToRoomUpdates();
    checkGameStatus();
}

// Show guest join UI
function showGuestJoinSection() {
    document.getElementById('waiting-room-section').style.display = 'none';
    document.getElementById('guest-join-section').style.display = 'block';

    const codeInput = document.getElementById('guest-room-code');
    if (codeInput) codeInput.value = roomCode.toUpperCase();

    const nameInput = document.getElementById('guest-player-name');
    if (nameInput) {
        nameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') joinAsGuest();
        });
    }
}

// Guest joins with anonymous session
async function joinAsGuest() {
    const playerName = document.getElementById('guest-player-name').value.trim();
    const errorEl = document.getElementById('guest-join-error');
    const btn = document.getElementById('guest-join-btn');

    if (!playerName) {
        errorEl.textContent = 'Please enter your player name';
        errorEl.classList.add('active');
        return;
    }

    errorEl.classList.remove('active');
    btn.disabled = true;
    btn.textContent = 'Joining...';

    try {
        // Sign in anonymously so RLS policies work
        const { error: anonError } = await supabase.auth.signInAnonymously();
        if (anonError) throw anonError;

        currentUser = await getCurrentUser();

        // Join room by code
        const room = await joinRoomByCode(roomCode, playerName);
        currentRoom = room;

        // Switch to waiting room UI
        document.getElementById('guest-join-section').style.display = 'none';
        document.getElementById('waiting-room-section').style.display = 'block';

        const emailDisplay = document.getElementById('user-email');
        if (emailDisplay) emailDisplay.textContent = playerName;

        // Use room.id going forward
        history.replaceState(null, '', `waiting.html?room=${room.id}`);

        await loadRoomDataById(room.id);
        subscribeToRoomUpdatesById(room.id);
        checkGameStatusById(room.id);

    } catch (error) {
        console.error('Error joining room:', error);
        errorEl.textContent = error.message || 'Could not join room. Check your code and try again.';
        errorEl.classList.add('active');
        btn.disabled = false;
        btn.textContent = 'Join Game';
    }
}

// Load room data (uses module-level roomId)
async function loadRoomData() {
    await loadRoomDataById(roomId);
}

async function loadRoomDataById(id) {
    try {
        const room = await getRoomById(id);
        currentRoom = room;

        document.getElementById('room-name').textContent = room.name;
        document.getElementById('invite-code').textContent = room.invite_code;
        document.getElementById('player-count').textContent =
            `${room.room_members.length}/${room.max_players} players`;

        isHost = currentUser && room.host_id === currentUser.id;

        if (isHost) {
            document.getElementById('host-controls').style.display = 'block';
        }

        updateRoomStatus(room.status);
        renderPlayers(room.room_members);
        updateStartButtonState(room.room_members.length);

    } catch (error) {
        console.error('Error loading room:', error);
        alert('Error loading room: ' + error.message);
        window.location.href = 'landing.html';
    }
}

// Subscribe to real-time room updates
function subscribeToRoomUpdates() {
    subscribeToRoomUpdatesById(roomId);
}

function subscribeToRoomUpdatesById(id) {
    roomChannel = subscribeToRoom(id, async (payload) => {
        console.log('Room update:', payload);
        await loadRoomDataById(id);

        if (payload.eventType === 'INSERT') {
            logActivity('A new player joined the room');
        } else if (payload.eventType === 'DELETE') {
            logActivity('A player left the room');
        }
    });

    supabase
        .channel(`room-status:${id}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'rooms',
                filter: `id=eq.${id}`
            },
            async (payload) => {
                console.log('Room status update:', payload);

                if (payload.new.status === 'in_progress') {
                    logActivity('Game is starting!');
                    setTimeout(() => {
                        window.location.href = `game.html?room=${id}`;
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
        container.innerHTML = `<div class="loading"><p>No players yet</p></div>`;
        return;
    }

    container.innerHTML = members.map(member => `
        <div class="player-item">
            <div class="player-item-info">
                <strong>${escapeHtml(member.player_name)}</strong>
                ${member.user_id === currentRoom.host_id ?
                    '<span class="player-badge">Host</span>' : ''}
                ${currentUser && member.user_id === currentUser.id ?
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
    if (!isHost || !startBtn) return;

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

    if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(code).then(() => {
            btn.textContent = 'Copied!';
            btn.style.background = 'linear-gradient(45deg, #2ecc71, #27ae60)';
            setTimeout(() => {
                btn.textContent = originalText;
                btn.style.background = '';
            }, 2000);
        }).catch(() => fallbackCopyToClipboard(code, btn, originalText));
    } else {
        fallbackCopyToClipboard(code, btn, originalText);
    }
}

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
        alert('Code: ' + text + '\n\nPlease copy manually.');
    } finally {
        document.body.removeChild(textarea);
    }
}

// Invite friend by email (host only)
async function sendInviteEmail() {
    const emailInput = document.getElementById('invite-email');
    const email = emailInput.value.trim();
    const statusEl = document.getElementById('invite-status');

    if (!email || !currentRoom) return;

    statusEl.textContent = 'Sending...';
    statusEl.style.color = '';

    await callSendRoomCode({
        action: 'invite_friend',
        email,
        inviteCode: currentRoom.invite_code,
        roomName: currentRoom.name
    });

    statusEl.textContent = `Invite sent to ${email}!`;
    statusEl.style.color = '#27ae60';
    emailInput.value = '';
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

        const initialGameState = {
            players: currentRoom.room_members.map(member => ({
                userId: member.user_id,
                name: member.player_name,
                cash: 1500,
                properties: [],
                equities: [],
                corporations: [],
                debts: [],
                interestOwed: 0,
                netWorth: 1500,
                bankrupt: false,
                position: 0,
                inJail: false,
                jailTurns: 0,
                hasGetOutOfJailCard: false,
                doubleCount: 0,
                diceRolled: false,
            })),
            currentPlayerIndex: 0,
            properties: MONOPOLY_PROPERTIES.map((prop, i) => ({
                ...prop,
                id: `prop-${i}`,
                ownerId: null,
                ownerName: null,
                owner: null,
                houses: 0,
                available: true
            })),
            corporations: [],
            gameLog: [],
            settings: {
                interestRate: 5,
                passGoAmount: 200
            },
            chanceCards: shuffleDeck(CHANCE_CARDS),
            communityChestCards: shuffleDeck(COMMUNITY_CHEST_CARDS),
            lastDiceRoll: null,
            lastCardDrawn: null,
        };

        const activeRoomId = currentRoom.id;
        const game = await startGame(activeRoomId, initialGameState);

        logActivity('Game started! Redirecting...');

        setTimeout(() => {
            window.location.href = `game.html?room=${activeRoomId}`;
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
    if (!confirm('Are you sure you want to leave this room?')) return;

    try {
        const activeRoomId = currentRoom ? currentRoom.id : roomId;

        if (currentUser) {
            const { error } = await supabase
                .from('room_members')
                .delete()
                .eq('room_id', activeRoomId)
                .eq('user_id', currentUser.id);

            if (error) throw error;
        }

        if (roomChannel) {
            await unsubscribeChannel(roomChannel);
        }

        window.location.href = 'landing.html';

    } catch (error) {
        console.error('Error leaving room:', error);
        alert('Error leaving room: ' + error.message);
    }
}

// Check if game has already started
async function checkGameStatus() {
    await checkGameStatusById(roomId);
}

async function checkGameStatusById(id) {
    try {
        const game = await getGameByRoomId(id);
        if (game && currentRoom && currentRoom.status === 'in_progress') {
            window.location.href = `game.html?room=${id}`;
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

    while (logContainer.children.length > 10) {
        logContainer.removeChild(logContainer.lastChild);
    }
}

// escapeHtml and formatTimeAgo are defined in supabase.js

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

// Cleanup on page unload (synchronous — browser won't wait for async)
window.addEventListener('beforeunload', () => {
    if (roomChannel) {
        unsubscribeChannel(roomChannel);
    }
});

// Initialize on page load
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWaitingRoom);
} else {
    initWaitingRoom();
}
