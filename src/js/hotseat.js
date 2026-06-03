// Hotseat setup page logic

let playerFieldCount = 2;

function addPlayerField() {
    if (playerFieldCount >= 6) return;
    playerFieldCount++;

    const container = document.getElementById('player-name-fields');
    const div = document.createElement('div');
    div.className = 'form-group';
    div.innerHTML = `
        <label>Player ${playerFieldCount}</label>
        <input type="text" class="player-name-input"
               placeholder="Player ${playerFieldCount} name" maxlength="20">
    `;
    container.appendChild(div);

    if (playerFieldCount >= 6) {
        document.getElementById('add-player-btn').disabled = true;
    }
}

async function startHotseatGame() {
    const errorEl = document.getElementById('hotseat-error');
    const btn = document.getElementById('start-hotseat-btn');
    errorEl.textContent = '';
    errorEl.classList.remove('active');

    const inputs = document.querySelectorAll('.player-name-input');
    const names = Array.from(inputs)
        .map(i => i.value.trim())
        .filter(n => n.length > 0);

    if (names.length < 2) {
        errorEl.textContent = 'Enter at least 2 player names.';
        errorEl.classList.add('active');
        return;
    }

    const uniqueNames = new Set(names.map(n => n.toLowerCase()));
    if (uniqueNames.size !== names.length) {
        errorEl.textContent = 'Each player must have a unique name.';
        errorEl.classList.add('active');
        return;
    }

    btn.disabled = true;
    btn.textContent = 'Setting up game…';

    try {
        // 1. Create one anonymous user per player
        const tokenRecords = [];
        for (const name of names) {
            const data = await apiFetch('/auth/anonymous', { method: 'POST' });
            tokenRecords.push({ userId: data.user.id, token: data.token, name });
        }

        // 2. Activate player 1's session
        localStorage.setItem('auth_token', tokenRecords[0].token);

        // 3. Create a room as player 1
        const room = await apiFetch('/rooms', {
            method: 'POST',
            body: JSON.stringify({
                name: `${names[0]}'s Local Game`,
                player_name: names[0],
                max_players: names.length
            })
        });
        const roomId = room.id;

        // 4. Join every other local player to the room so server-authoritative
        // actions work when the active hotseat token changes.
        for (let i = 1; i < tokenRecords.length; i++) {
            localStorage.setItem('auth_token', tokenRecords[i].token);
            await apiFetch(`/rooms/${roomId}/join`, {
                method: 'POST',
                body: JSON.stringify({ player_name: tokenRecords[i].name })
            });
        }
        localStorage.setItem('auth_token', tokenRecords[0].token);

        // 5. Build initial game state (mirrors startGameFromLobby in waiting.js)
        const initialGameState = {
            players: tokenRecords.map(record => ({
                userId: record.userId,
                name: record.name,
                cash: 1500,
                properties: [],
                corporations: [],
                debts: [],
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
                houses: 0,
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

        // 6. Create game record
        const game = await apiFetch('/games', {
            method: 'POST',
            body: JSON.stringify({ room_id: roomId, game_state: initialGameState })
        });

        // 7. Store all player tokens in sessionStorage for game.js to pick up
        sessionStorage.setItem('hotseat_tokens', JSON.stringify(tokenRecords));

        // 8. Navigate to the game
        window.location.href = `game.html?room=${roomId}`;

    } catch (err) {
        console.error('Hotseat setup error:', err);
        errorEl.textContent = 'Setup failed: ' + err.message;
        errorEl.classList.add('active');
        btn.disabled = false;
        btn.textContent = 'Start Local Game';
    }
}

// Allow Enter key on last name field to submit
document.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') startHotseatGame();
});
