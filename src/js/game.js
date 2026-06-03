// Game Room JavaScript - Multiplayer Monopoly Game Logic

let currentGame = null;
let currentRoom = null;
let currentUser = null;
let gameChannel = null;
let currentPlayerData = null;

// Hotseat mode (same-device local play)
let isHotseatMode = false;
let hotseatTokens = []; // [{userId, token, name}]

// Initialize game on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Detect hotseat mode from sessionStorage
        const storedTokens = sessionStorage.getItem('hotseat_tokens');
        if (storedTokens) {
            isHotseatMode = true;
            hotseatTokens = JSON.parse(storedTokens);
        }

        // Get current user (player 1's token is already in localStorage for hotseat)
        const user = await getCurrentUser();
        if (!user) {
            window.location.href = 'auth.html';
            return;
        }
        currentUser = user;

        // Get room ID from URL
        const urlParams = new URLSearchParams(window.location.search);
        const roomId = urlParams.get('room');

        if (!roomId) {
            alert('No room specified');
            window.location.href = 'lobby.html';
            return;
        }

        // Load room and game data
        await loadGameData(roomId);

        // Set up real-time subscriptions
        setupRealtimeSubscriptions();

        // Set up UI event listeners
        setupUIListeners();

    } catch (error) {
        console.error('Error initializing game:', error);
        const gameContent = document.getElementById('gameContent');
        if (gameContent) {
            gameContent.innerHTML = `
                <div style="text-align:center;padding:40px 20px;">
                    <p style="color:#e74c3c;font-size:1.1rem;margin-bottom:16px;">
                        Failed to load game: ${escapeHtml(error.message)}
                    </p>
                    <a href="lobby.html" class="btn btn-secondary">Back to Lobby</a>
                </div>`;
        }
    }
});

// Load game and room data
async function loadGameData(roomId) {
    try {
        console.log('Loading game data for room:', roomId);

        // Load room data
        const room = await apiFetch(`/rooms/${roomId}`);
        console.log('Room loaded:', room);
        if (!room) throw new Error('Room not found');

        currentRoom = room;

        // Display room info
        document.getElementById('room-code').textContent = `Room: ${room.invite_code}`;

        // Load game data
        const game = await apiFetch(`/games/by-room/${roomId}`);
        console.log('Game loaded:', game);
        if (!game) throw new Error('Game not found for this room');

        currentGame = game;

        // Find current player data
        const gameState = game.game_state;
        console.log('Game state:', gameState);

        currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);
        console.log('Current player data:', currentPlayerData);

        if (!currentPlayerData) {
            throw new Error('You are not a player in this game');
        }

        document.getElementById('user-email').textContent =
            currentUser.email || (currentPlayerData && currentPlayerData.name) || 'Guest';

        // Render game state
        renderGameState(gameState);

        // Load game log
        await loadGameLog();

    } catch (error) {
        console.error('Error loading game data:', error);
        throw error;
    }
}

// Set up real-time subscriptions
function setupRealtimeSubscriptions() {
    gameChannel = subscribeToGame(currentRoom.id, async (game) => {
        await applyGameUpdate(game);
    });
}

async function applyGameUpdate(game, options = {}) {
    if (!game || !game.game_state) return;
    const incomingVersion = Number(game.state_version ?? game.stateVersion ?? 0);
    const currentVersion = Number(currentGame?.state_version ?? currentGame?.stateVersion ?? -1);
    if (!options.force && incomingVersion < currentVersion) return;

    currentGame = game;
    const gameState = game.game_state;
    currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);

    renderGameState(gameState);
    await loadGameLog();
    renderBoardTab();
    populatePlayerDropdowns();

    if (gameState.ended) {
        showWinnerFromState(gameState, gameState.gameLog.length ? gameState.gameLog[gameState.gameLog.length - 1].message : 'Game over');
    }
}

// Render complete game state
function renderGameState(gameState) {
    const gameContent = document.getElementById('gameContent');

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const isMyTurn = currentPlayer.userId === currentUser.id;
    const landing = getLandingSummary(gameState, currentPlayer);

    document.body.classList.toggle('is-my-turn', isMyTurn);

    const orderedPlayers = [
        ...gameState.players.filter(p => p.userId === currentUser.id),
        ...gameState.players.filter(p => p.userId !== currentUser.id)
    ];

    gameContent.innerHTML = `
        <div class="game-header">
            <h2>Current Turn: ${escapeHtml(currentPlayer.name)}</h2>
            ${isMyTurn ? '<p class="turn-indicator">It\'s your turn!</p>' : '<p class="waiting-indicator">Waiting for other players...</p>'}
            <div class="landing-summary ${landing.canBuy ? 'can-buy' : ''}">
                <div>
                    <span class="landing-label">${escapeHtml(landing.label)}</span>
                    <strong>${escapeHtml(landing.squareName)}</strong>
                </div>
                <p>${escapeHtml(landing.detail)}</p>
            </div>
        </div>

        <div class="players-grid">
            ${orderedPlayers.map(player => renderPlayerCard(player, player.userId === currentUser.id)).join('')}
        </div>

        ${isMyTurn ? renderActionButtons() : ''}

        <div class="recent-log">
            <h3>Recent Actions</h3>
            <div class="log-entries">
                ${gameState.gameLog.slice(-5).reverse().map(entry => `
                    <div class="log-entry">
                        <span class="log-time">${new Date(entry.timestamp).toLocaleTimeString()}</span>
                        <span class="log-message">${entry.message}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;

    updateTurnBanner();
}

function getLandingSummary(gameState, player) {
    const position = player.position || 0;
    const square = BOARD_SQUARES[position] || BOARD_SQUARES[0];
    const dice = Array.isArray(gameState.lastDiceRoll) ? gameState.lastDiceRoll : null;
    const label = dice ? `Rolled ${dice[0]} + ${dice[1]}` : `Position ${position}`;
    const property = square.propertyId
        ? gameState.properties.find(prop => prop.id === square.propertyId)
        : null;
    const isBuyableSquare = ['property', 'railroad', 'utility'].includes(square.type);
    const canBuy = !!(isBuyableSquare && property && !property.ownerId);

    if (canBuy) {
        return {
            label,
            squareName: square.name,
            detail: `Unowned ${square.type.replace('_', ' ')}. You can buy it for $${property.price}.`,
            canBuy,
        };
    }

    if (isBuyableSquare && property && property.ownerId) {
        const owner = gameState.players.find(p => p.userId === property.ownerId);
        const ownerName = owner ? owner.name : property.ownerName || 'another player';
        return {
            label,
            squareName: square.name,
            detail: property.ownerId === player.userId ? 'You already own this square.' : `Owned by ${ownerName}.`,
            canBuy: false,
        };
    }

    const detailsByType = {
        go: 'Collect salary when you pass GO.',
        community_chest: 'Community Chest effect is applied automatically.',
        chance: 'Chance effect is applied automatically.',
        tax: `Tax square. Amount: $${square.taxAmount || 0}.`,
        jail: player.inJail ? 'You are in Jail.' : 'Just visiting.',
        free_parking: 'Free Parking.',
        go_to_jail: 'Go directly to Jail.',
    };

    return {
        label,
        squareName: square.name,
        detail: detailsByType[square.type] || 'No purchasable property on this square.',
        canBuy: false,
    };
}

// Render individual player card
function renderPlayerCard(player, isCurrentUser) {
    const totalPropertyValue = player.properties.reduce((sum, p) => sum + p.value, 0);
    const netWorth = player.cash + totalPropertyValue;

    const cardDetails = `
        <div class="player-stats">
            <div class="stat">
                <span class="stat-label">Cash:</span>
                <span class="stat-value">$${player.cash.toFixed(2)}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Properties:</span>
                <span class="stat-value">${player.properties.length}</span>
            </div>
            <div class="stat">
                <span class="stat-label">Net Worth:</span>
                <span class="stat-value">$${netWorth.toFixed(2)}</span>
            </div>
        </div>
        ${player.properties.length > 0 ? `
            <div class="player-properties">
                <h4>Properties:</h4>
                <div class="property-badges">
                    ${player.properties.map(p => `
                        <span class="property-badge" style="background-color: ${p.color}">
                            ${p.name}
                        </span>
                    `).join('')}
                </div>
            </div>
        ` : ''}
        ${player.corporations.length > 0 ? `
            <div class="player-corporations">
                <h4>Corporations:</h4>
                ${player.corporations.map(c => `
                    <div class="corp-badge">
                        ${c.ticker} (${c.sharesOwned}/${c.totalShares} shares)
                    </div>
                `).join('')}
            </div>
        ` : ''}
        ${player.debts.length > 0 ? `
            <div class="player-debts">
                <h4>Debts:</h4>
                ${player.debts.map(d => `
                    <div class="debt-badge">
                        $${d.principal.toFixed(2)} @ ${d.interestRate}%
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;

    if (isCurrentUser) {
        return `
            <div class="player-card current-user">
                <div class="player-header">
                    <h3>${escapeHtml(player.name)}</h3>
                    <span class="badge">You</span>
                </div>
                ${cardDetails}
            </div>
        `;
    }

    return `
        <div class="player-card player-card-other collapsed" data-player-id="${player.userId}">
            <div class="player-card-summary" onclick="togglePlayerCard(this)">
                <span class="player-name-sm">${player.name}</span>
                <span class="player-stat-sm">$${player.cash.toFixed(0)}</span>
                <span class="player-stat-sm">NW: $${netWorth.toFixed(0)}</span>
                <span class="player-card-chevron">▼</span>
            </div>
            <div class="player-card-details" style="display:none;">
                <div class="player-header">
                    <h3>${player.name}</h3>
                </div>
                ${cardDetails}
            </div>
        </div>
    `;
}

function togglePlayerCard(summaryEl) {
    const details = summaryEl.nextElementSibling;
    const chevron = summaryEl.querySelector('.player-card-chevron');
    const isOpen = details.style.display !== 'none';
    details.style.display = isOpen ? 'none' : 'block';
    chevron.textContent = isOpen ? '▼' : '▲';
    summaryEl.closest('.player-card').classList.toggle('collapsed', isOpen);
}

// Render action buttons for current player's turn
function renderActionButtons() {
    const gameState = currentGame.game_state;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const hasRolled = currentPlayer.diceRolled;
    const isHost = currentUser.id === currentRoom.host_id;
    const landing = getLandingSummary(gameState, currentPlayer);
    const buyButton = landing.canBuy
        ? '<button class="btn btn-success btn-sm action-btn-buy" onclick="openBuyPropertyModal()">Buy Property</button>'
        : `<button class="btn btn-secondary btn-sm action-btn-buy" disabled title="${escapeHtml(landing.detail)}">${escapeHtml(buyUnavailableLabel(landing))}</button>`;
    return `
        <div class="action-buttons">
            ${!hasRolled ? '<button class="btn btn-primary" style="margin-bottom:8px;width:100%;" onclick="rollDiceAndMove()">🎲 Roll Dice</button>' : ''}
            <button class="btn btn-success action-btn-end-turn" onclick="endTurn()">End Turn</button>
            <div class="action-btn-secondary-group">
                ${buyButton}
                <button class="btn btn-secondary btn-sm" onclick="openIPOModal()">Create IPO</button>
                <button class="btn btn-secondary btn-sm" onclick="openDebtModal()">Manage Debt</button>
                <button class="btn btn-secondary btn-sm" onclick="openCorporationModal()">Corporations</button>
                ${isHost ? '<button class="btn btn-danger btn-sm" onclick="hostEndGame()">End Game</button>' : ''}
            </div>
        </div>
    `;
}

function buyUnavailableLabel(landing) {
    if (landing.detail.startsWith('Owned by')) return 'Property Owned';
    if (landing.detail.startsWith('You already own')) return 'Already Yours';
    return 'No Property to Buy';
}

// Format a game event into a human-readable string
function formatLogEvent(type, data) {
    switch (type) {
        case 'property_purchase':
            return `${data.buyer} purchased ${data.property} for $${Number(data.price).toFixed(2)}`;
        case 'ipo_created':
            return `${data.founder} created IPO ${data.ticker} — ${data.shares} shares at $${Number(data.pricePerShare).toFixed(2)}/share`;
        case 'share_purchase':
            return `${data.buyer} bought ${data.shares} share(s) of ${data.ticker} for $${Number(data.totalCost).toFixed(2)}`;
        case 'debt_issued':
            return `${data.issuer} issued debt of $${Number(data.amount).toFixed(2)} at ${data.interestRate}% interest`;
        case 'debt_payment':
            return `${data.payer} paid $${Number(data.amount).toFixed(2)} towards their debt`;
        case 'interest_accrual':
            return `${data.player} was charged $${Number(data.interestCharged).toFixed(2)} in interest`;
        case 'forced_payment':
            return `${data.from} paid $${Number(data.amount).toFixed(2)} to ${data.to}${data.reason ? ` for ${data.reason}` : ''}`;
        case 'tax_payment':
            return `${data.from} paid $${Number(data.amount).toFixed(2)} to ${data.to}${data.reason ? ` for ${data.reason}` : ''}`;
        case 'bankruptcy':
            return `${data.player} has gone BANKRUPT`;
        case 'turn_end':
            return `${data.player} ended their turn — it's now ${data.nextPlayer}'s turn`;
        case 'transaction':
            return `Trade: ${data.player1} ↔ ${data.player2} ($${data.player1Cash} + ${data.player1Assets} assets ↔ $${data.player2Cash} + ${data.player2Assets} assets)`;
        case 'payment':
            return `${data.from} paid $${Number(data.amount).toFixed(2)} to ${data.to}`;
        case 'game_started':
            return 'Game started';
        case 'game_ended':
            return `Game over — ${data.reason}`;
        case 'house_purchase':
            return `${data.player} bought houses/hotels for $${Number(data.cost).toFixed(2)}`;
        case 'dice_roll':
            return `${data.player} rolled ${data.die1}+${data.die2}=${data.total} — moved to ${data.square}${data.isDoubles ? ' (doubles!)' : ''}`;
        case 'card_draw':
            return `${data.player} drew ${data.deckType}: "${data.card}"`;
        case 'pass_go':
            return `${data.player} passed GO — collected $${data.amount}`;
        default:
            return `${type}: ${JSON.stringify(data)}`;
    }
}

// Load game log from events table
async function loadGameLog() {
    try {
        const events = await apiFetch(`/games/${currentGame.id}/events`);

        const logContainer = document.getElementById('full-game-log');
        logContainer.innerHTML = events.map(event => `
            <div class="log-entry">
                <span class="log-time">${escapeHtml(new Date(event.created_at).toLocaleString())}</span>
                <span class="log-message">${escapeHtml(formatLogEvent(event.event_type, event.event_data))}</span>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading game log:', error);
    }
}

// Open Buy Property Modal
async function openBuyPropertyModal() {
    const gameState = currentGame.game_state;
    const position = currentPlayerData.position || 0;
    const square = BOARD_SQUARES[position];

    if (!square || square.propertyId === null) {
        selectedPropertyId = null;
        document.getElementById('availableProperties').innerHTML =
            '<p style="color:#c0392b;padding:12px;">You must land on a property square to buy it.</p>';
        document.getElementById('buyPropertyModal').style.display = 'flex';
        return;
    }

    const property = gameState.properties.find(p => p.id === square.propertyId);

    if (!property || property.ownerId) {
        selectedPropertyId = null;
        document.getElementById('availableProperties').innerHTML =
            '<p style="color:#c0392b;padding:12px;">This property is already owned.</p>';
        document.getElementById('buyPropertyModal').style.display = 'flex';
        return;
    }

    const propertiesHtml = `
        <div class="property-card selected" onclick="selectProperty('${property.id}')" data-property-id="${property.id}">
            <div class="property-color" style="background-color: ${property.color}"></div>
            <div class="property-name">${escapeHtml(property.name)}</div>
            <div class="property-price">$${property.price}</div>
        </div>
    `;

    selectedPropertyId = property.id;
    document.getElementById('purchasePrice').value = property.price;
    document.getElementById('availableProperties').innerHTML = propertiesHtml;
    document.getElementById('buyPropertyModal').style.display = 'flex';
}

let selectedPropertyId = null;

function selectProperty(propertyId) {
    selectedPropertyId = propertyId;
    document.querySelectorAll('.property-card').forEach(card => {
        card.classList.remove('selected');
    });
    document.querySelector(`[data-property-id="${propertyId}"]`).classList.add('selected');

    const property = currentGame.game_state.properties.find(p => p.id === propertyId);
    document.getElementById('purchasePrice').value = property.price;
}

async function confirmPurchase() {
    if (!selectedPropertyId) {
        alert('Please select a property');
        return;
    }

    // Re-validate: property must be at player's current position and unowned
    const position = currentPlayerData.position || 0;
    const square = BOARD_SQUARES[position];
    if (!square || square.propertyId !== selectedPropertyId) {
        alert('You can only buy the property you landed on.');
        return;
    }
    const gameState = currentGame.game_state;
    const property = gameState.properties.find(p => p.id === selectedPropertyId);
    if (!property || property.ownerId) {
        alert('This property is not available for purchase.');
        return;
    }

    const purchasePrice = property.price;

    try {
        await performGameAction('buy_property', {});
        closeModal('buyPropertyModal');
        selectedPropertyId = null;

    } catch (error) {
        console.error('Error purchasing property:', error);
        alert('Failed to purchase property');
    }
}

// Open IPO Modal
async function openIPOModal() {
    const assetsHtml = currentPlayerData.properties.map(p => `
        <div class="asset-checkbox">
            <input type="checkbox" id="ipo-asset-${p.id}" value="${p.id}">
            <label for="ipo-asset-${p.id}">${escapeHtml(p.name)} ($${p.value})</label>
        </div>
    `).join('');

    document.getElementById('ipoAssets').innerHTML = assetsHtml;
    document.getElementById('ipoModal').style.display = 'flex';
}

async function createIPO() {
    const ticker = document.getElementById('ipoTicker').value.toUpperCase();
    const numShares = parseInt(document.getElementById('ipoShares').value);
    const pricePerShare = parseFloat(document.getElementById('ipoPrice').value);

    if (!ticker || !numShares || !pricePerShare) {
        alert('Please fill in all fields');
        return;
    }

    const selectedAssets = Array.from(document.querySelectorAll('#ipoAssets input:checked'))
        .map(cb => currentPlayerData.properties.find(p => p.id === cb.value));

    if (selectedAssets.length === 0) {
        alert('Please select at least one asset');
        return;
    }

    try {
        await performGameAction('create_ipo', {
            ticker,
            totalShares: numShares,
            pricePerShare,
            assetIds: selectedAssets.map(asset => asset.id),
        });
        closeModal('ipoModal');

    } catch (error) {
        console.error('Error creating IPO:', error);
        alert('Failed to create IPO');
    }
}

// Open Debt Modal
async function openDebtModal() {
    // Load collateral assets
    const assetsHtml = currentPlayerData.properties.map(p => `
        <div class="asset-checkbox">
            <input type="checkbox" id="collateral-${p.id}" value="${p.id}">
            <label for="collateral-${p.id}">${escapeHtml(p.name)} ($${p.value})</label>
        </div>
    `).join('');

    document.getElementById('collateralAssets').innerHTML = assetsHtml;

    // Load existing debts
    const debtsHtml = currentPlayerData.debts.map((d, index) => `
        <option value="${index}">Loan #${index + 1}: $${d.principal.toFixed(2)} @ ${d.interestRate}%</option>
    `).join('');

    document.getElementById('debtToSettle').innerHTML = debtsHtml || '<option value="">No debts to settle</option>';

    document.getElementById('debtModal').style.display = 'flex';
}

function toggleDebtForm() {
    const action = document.getElementById('debtAction').value;
    if (action === 'issue') {
        document.getElementById('issueDebtForm').style.display = 'block';
        document.getElementById('settleDebtForm').style.display = 'none';
    } else {
        document.getElementById('issueDebtForm').style.display = 'none';
        document.getElementById('settleDebtForm').style.display = 'block';
    }
}

async function processDebt() {
    const action = document.getElementById('debtAction').value;

    if (action === 'issue') {
        await issueDebt();
    } else {
        await settleDebt();
    }
}

async function issueDebt() {
    const loanAmount = parseFloat(document.getElementById('loanAmount').value);
    const interestRate = parseFloat(document.getElementById('loanRate').value);

    const selectedCollateral = Array.from(document.querySelectorAll('#collateralAssets input:checked'))
        .map(cb => currentPlayerData.properties.find(p => p.id === cb.value));

    if (!loanAmount || !interestRate) {
        alert('Please fill in all fields');
        return;
    }

    try {
        await performGameAction('issue_debt', {
            amount: loanAmount,
            interestRate,
            collateralIds: selectedCollateral.map(asset => asset.id),
        });
        closeModal('debtModal');

    } catch (error) {
        console.error('Error issuing debt:', error);
        alert('Failed to issue debt');
    }
}

async function settleDebt() {
    const debtIndex = parseInt(document.getElementById('debtToSettle').value);
    const paymentAmount = parseFloat(document.getElementById('settlementAmount').value);

    if (isNaN(debtIndex) || !paymentAmount) {
        alert('Please select a debt and enter payment amount');
        return;
    }

    if (currentPlayerData.cash < paymentAmount) {
        alert('Insufficient funds');
        return;
    }

    try {
        const debt = currentPlayerData.debts[debtIndex];
        await performGameAction('pay_debt', {
            debtId: debt && debt.id,
            debtIndex,
            amount: paymentAmount,
        });
        closeModal('debtModal');

    } catch (error) {
        console.error('Error settling debt:', error);
        alert('Failed to settle debt');
    }
}

// Open Corporation Modal
async function openCorporationModal() {
    const gameState = currentGame.game_state;
    const isMyTurn = gameState.players[gameState.currentPlayerIndex].userId === currentUser.id;

    const corporationsHtml = gameState.corporations.map(corp => {
        const myShares = corp.shareholders.find(s => s.userId === currentUser.id);
        const sharesAvailable = typeof corp.availableShares === 'number'
            ? corp.availableShares
            : corp.totalShares - corp.shareholders.reduce((sum, s) => sum + s.shares, 0);
        const isFounder = corp.founderId === currentUser.id;
        const canBuy = isMyTurn && !isFounder && sharesAvailable > 0;

        return `
        <div class="corporation-card">
            <h3>${escapeHtml(corp.ticker)} - ${escapeHtml(corp.name)}</h3>
            <p>Founder: ${escapeHtml(corp.founderName)}</p>
            <p>Total Shares: ${corp.totalShares} | Available: ${sharesAvailable} | Price: $${corp.pricePerShare.toFixed(2)}/share</p>
            <h4>Assets:</h4>
            <ul>
                ${corp.assets.map(a => `<li>${escapeHtml(a.name)} ($${a.value})</li>`).join('')}
            </ul>
            <h4>Shareholders:</h4>
            <ul>
                ${corp.shareholders.map(s => `<li>${escapeHtml(s.name)}: ${s.shares} shares</li>`).join('')}
            </ul>
            ${myShares ? `<p><strong>Your shares:</strong> ${myShares.shares}</p>` : ''}
            ${canBuy ? `
                <div class="buy-shares-form" style="margin-top: 10px; padding: 10px; background: #f0f4ff; border-radius: 6px;">
                    <label>Buy shares (max ${sharesAvailable}):</label>
                    <input type="number" id="buyShares-${corp.id}" min="1" max="${sharesAvailable}" value="1" style="width: 80px; margin: 0 8px;">
                    <button class="btn btn-primary" style="padding: 4px 12px; font-size: 0.9rem;" onclick="buyShares('${corp.id}')">Buy</button>
                </div>
            ` : ''}
        </div>
    `;
    }).join('');

    document.getElementById('corporationList').innerHTML = corporationsHtml || '<p>No corporations created yet</p>';
    document.getElementById('corporationModal').style.display = 'flex';
}

async function buyShares(corpId) {
    const gameState = currentGame.game_state;
    const corp = gameState.corporations.find(c => c.id === corpId);
    if (!corp) return;

    const numShares = parseInt(document.getElementById(`buyShares-${corpId}`).value);
    const totalCost = numShares * corp.pricePerShare;
        const sharesAvailable = typeof corp.availableShares === 'number'
            ? corp.availableShares
            : corp.totalShares - corp.shareholders.reduce((sum, s) => sum + s.shares, 0);

    if (!numShares || numShares < 1 || numShares > sharesAvailable) {
        alert(`Enter a valid number of shares (1–${sharesAvailable})`);
        return;
    }

    if (currentPlayerData.cash < totalCost) {
        alert(`Insufficient funds. Cost: $${totalCost.toFixed(2)}, You have: $${currentPlayerData.cash.toFixed(2)}`);
        return;
    }

    try {
        await performGameAction('buy_shares', { corpId, shares: numShares });
        closeModal('corporationModal');

    } catch (error) {
        console.error('Error buying shares:', error);
        alert('Failed to buy shares');
    }
}

// End turn
async function endTurn() {
    try {
        const beforeUserId = currentUser.id;
        await performGameAction('end_turn', {});
        const gameState = currentGame.game_state;
        const nextPlayer = gameState.players[gameState.currentPlayerIndex];
        if (gameState.ended) {
            showWinnerFromState(gameState, gameState.gameLog.length ? gameState.gameLog[gameState.gameLog.length - 1].message : 'Game over');
            return;
        }

        // --- Hotseat: show pass-device screen before next player takes over ---
        if (isHotseatMode && nextPlayer && nextPlayer.userId !== beforeUserId) {
            showHotseatInterstitial(nextPlayer.name);
        }

    } catch (error) {
        console.error('Error ending turn:', error);
        alert('Failed to end turn');
    }
}

// ── Hotseat: pass-device interstitial ──────────────────────────────
function showHotseatInterstitial(nextPlayerName) {
    document.getElementById('hotseat-next-player-name').textContent = nextPlayerName;
    document.getElementById('hotseat-interstitial').style.display = 'flex';
}

function dismissHotseatInterstitial() {
    const gameState = currentGame.game_state;
    const nextPlayer = gameState.players[gameState.currentPlayerIndex];

    const record = hotseatTokens.find(t => t.userId === nextPlayer.userId);
    if (!record) {
        document.getElementById('hotseat-interstitial').style.display = 'none';
        return;
    }

    // Swap active token — apiFetch() reads localStorage on every call
    localStorage.setItem('auth_token', record.token);

    // Update in-memory identity without an extra API round-trip
    currentUser = { id: record.userId, email: null, is_anonymous: true };
    currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);

    // Re-render from the new player's perspective
    renderGameState(gameState);
    document.getElementById('hotseat-interstitial').style.display = 'none';
}

// End Game - compute net worth and show winner screen
async function triggerEndGame(gameState, reason) {
    try {
        await performGameAction('host_end_game', {});
        showWinnerFromState(currentGame.game_state, reason);

    } catch (error) {
        console.error('Error ending game:', error);
        alert('Failed to end game: ' + error.message);
    }
}

// Host-triggered end game
async function hostEndGame() {
    if (!confirm('End the game now and declare a winner by net worth?')) return;
    const gameState = currentGame.game_state;
    await triggerEndGame(gameState, 'Host ended the game.');
}

async function performGameAction(type, payload = {}) {
    try {
        const result = await apiFetch(`/games/${currentGame.id}/actions`, {
            method: 'POST',
            body: JSON.stringify({
                actionId: makeActionId(),
                type,
                payload,
                expectedVersion: currentGame.state_version
            })
        });
        await applyGameUpdate(result.game, { force: true });
        return result;
    } catch (error) {
        if (error.status === 409) {
            await refreshCurrentGame();
            alert('The game changed before your action was saved. Review the latest state and try again.');
            return null;
        }
        throw error;
    }
}

async function refreshCurrentGame() {
    if (!currentRoom) return;
    currentGame = await getGameByRoomId(currentRoom.id);
    currentPlayerData = currentGame.game_state.players.find(p => p.userId === currentUser.id);
    renderGameState(currentGame.game_state);
    renderBoardTab();
}

function makeActionId() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return `action-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function showWinnerFromState(gameState, reason) {
    const standings = gameState.standings || gameState.players.map(player => ({
        name: player.name,
        netWorth: player.netWorth || player.cash,
        bankrupt: player.bankrupt
    })).sort((a, b) => b.netWorth - a.netWorth);
    if (isHotseatMode) sessionStorage.removeItem('hotseat_tokens');
    const winner = standings[0];
    const standingsHtml = standings.map((p, i) => `
        <div class="standings-row ${p.bankrupt ? 'bankrupt' : ''}">
            <span class="rank">#${i + 1}</span>
            <span class="player-name">${escapeHtml(p.name)}${p.bankrupt ? ' (bankrupt)' : ''}</span>
            <span class="net-worth">$${Number(p.netWorth || 0).toFixed(2)}</span>
        </div>
    `).join('');
    document.getElementById('winnerName').textContent = winner ? winner.name : 'Game Over';
    document.getElementById('winnerReason').textContent = reason || '';
    document.getElementById('finalStandings').innerHTML = standingsHtml;
    document.getElementById('winnerModal').style.display = 'flex';
}

// Log game event
async function logGameEvent(eventType, eventData) {
    try {
        await apiFetch(`/games/${currentGame.id}/events`, {
            method: 'POST',
            body: JSON.stringify({ event_type: eventType, event_data: eventData })
        });
    } catch (err) {
        console.error('Error logging event:', err);
    }
}

// Modal controls
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Tab navigation
function showSection(event, sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.getElementById(sectionName).classList.add('active');
    event.target.classList.add('active');

    if (sectionName === 'board') {
        renderBoardTab();
    }

    updateTurnBanner();
}

function updateTurnBanner() {
    const banner = document.getElementById('turn-banner');
    if (!banner || !currentGame || !currentUser) return;
    const gameState = currentGame.game_state;
    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const isMyTurn = currentPlayer && currentPlayer.userId === currentUser.id;
    banner.style.display = isMyTurn ? 'flex' : 'none';
    const onGameTab = document.getElementById('game')?.classList.contains('active');
    const goBtn = banner.querySelector('button');
    if (goBtn) goBtn.style.display = onGameTab ? 'none' : '';
}

function switchToGameTab() {
    const gameTabBtn = document.querySelector('.nav-tab[onclick*="\'game\'"]');
    if (gameTabBtn) gameTabBtn.click();
}

// Set up UI listeners for Market section
function setupUIListeners() {
    // Populate player dropdowns
    populatePlayerDropdowns();
    window.addEventListener('resize', scaleBoardToFit);
}

function populatePlayerDropdowns() {
    const gameState = currentGame.game_state;

    const player1Select = document.getElementById('player1Select');
    const player2Select = document.getElementById('player2Select');
    const paymentFromPlayer = document.getElementById('paymentFromPlayer');
    const paymentToPlayer = document.getElementById('paymentToPlayer');

    const playersHtml = gameState.players.map(p =>
        `<option value="${escapeHtml(p.userId)}">${escapeHtml(p.name)}</option>`
    ).join('');

    player1Select.innerHTML = playersHtml;
    player2Select.innerHTML = playersHtml;
    paymentFromPlayer.innerHTML = playersHtml;
    paymentToPlayer.innerHTML = playersHtml;

    if (!player1Select.dataset.assetsBound) {
        player1Select.addEventListener('change', () => updatePlayerAssets('player1'));
        player1Select.dataset.assetsBound = 'true';
    }
    if (!player2Select.dataset.assetsBound) {
        player2Select.addEventListener('change', () => updatePlayerAssets('player2'));
        player2Select.dataset.assetsBound = 'true';
    }
}

function updatePlayerAssets(playerNumber) {
    const gameState = currentGame.game_state;
    const selectId = playerNumber === 'player1' ? 'player1Select' : 'player2Select';
    const assetsId = playerNumber === 'player1' ? 'player1Assets' : 'player2Assets';

    const userId = document.getElementById(selectId).value;
    const player = gameState.players.find(p => p.userId === userId);

    if (!player) return;

    const assetsHtml = player.properties.map(p => `
        <div class="asset-checkbox">
            <input type="checkbox" id="${playerNumber}-asset-${p.id}" value="${p.id}">
            <label for="${playerNumber}-asset-${p.id}">${escapeHtml(p.name)} ($${p.value})</label>
        </div>
    `).join('');

    document.getElementById(assetsId).innerHTML = assetsHtml || '<p>No properties</p>';
}

async function executeTransaction() {
    const player1Id = document.getElementById('player1Select').value;
    const player2Id = document.getElementById('player2Select').value;
    const player1Cash = parseFloat(document.getElementById('player1Cash').value) || 0;
    const player2Cash = parseFloat(document.getElementById('player2Cash').value) || 0;

    const player1Assets = Array.from(document.querySelectorAll('#player1Assets input:checked'))
        .map(cb => cb.value);
    const player2Assets = Array.from(document.querySelectorAll('#player2Assets input:checked'))
        .map(cb => cb.value);

    try {
        await performGameAction('trade', {
            player1Id,
            player2Id,
            player1Cash,
            player2Cash,
            player1AssetIds: player1Assets,
            player2AssetIds: player2Assets,
        });
        alert('Transaction completed successfully');

        // Reset form
        document.getElementById('player1Cash').value = 0;
        document.getElementById('player2Cash').value = 0;
        document.getElementById('player1Assets').innerHTML = '';
        document.getElementById('player2Assets').innerHTML = '';

    } catch (error) {
        console.error('Error executing transaction:', error);
        alert('Failed to execute transaction');
    }
}

async function makePayment() {
    const fromPlayerId = document.getElementById('paymentFromPlayer').value;
    const toPlayerId = document.getElementById('paymentToPlayer').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value);

    if (!amount || amount <= 0) {
        alert('Please enter a valid amount');
        return;
    }

    try {
        await performGameAction('manual_payment', { fromPlayerId, toPlayerId, amount });
        alert('Payment completed successfully');
        document.getElementById('paymentAmount').value = '';

    } catch (error) {
        console.error('Error making payment:', error);
        alert('Failed to make payment');
    }
}

// ============================================================
// BOARD TAB FUNCTIONS
// ============================================================

// Pending payment state (set by showRentPrompt / showTaxPrompt)
let pendingPayment = null;

// Pending house selections { propertyId: deltaCount }
let pendingHouseSelections = {};

// Show a brief toast notification
function showToast(message) {
    const toast = document.createElement('div');
    toast.style.cssText = [
        'position:fixed', 'top:20px', 'right:20px',
        'background:#2c3e50', 'color:#fff',
        'padding:12px 20px', 'border-radius:8px',
        'z-index:9999', 'font-size:0.9rem',
        'box-shadow:0 4px 12px rgba(0,0,0,0.25)',
        'max-width:320px', 'word-wrap:break-word'
    ].join(';');
    toast.textContent = message;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3500);
}

// Render / refresh the Board tab content
function renderBoardTab() {
    const el = document.getElementById('boardContent');
    if (!el || !currentGame || !currentUser) return;
    el.innerHTML = renderBoard(currentGame.game_state, currentUser.id);
    scaleBoardToFit();
}

// ---------------------------------------------------------------
// Dice rolling and movement
// ---------------------------------------------------------------
async function rollDiceAndMove() {
    if (!currentGame || !currentUser) return;
    try {
        const payload = Array.isArray(window.__E2E_NEXT_DICE)
            ? { testDice: window.__E2E_NEXT_DICE.splice(0, 2) }
            : {};
        await performGameAction('roll_dice', payload);
    } catch (error) {
        console.error('Error rolling dice:', error);
        alert(error.message || 'Failed to roll dice');
    }
}

// ---------------------------------------------------------------
// Landing logic
// ---------------------------------------------------------------
function processLanding(player, position, gameState, diceTotal) {
    const square = BOARD_SQUARES[position];
    const landingEvents = [];

    switch (square.type) {
        case 'go':
            // Nothing extra — GO money already given on pass
            break;

        case 'property':
        case 'railroad':
        case 'utility': {
            const prop = gameState.properties.find(p => p.id === square.propertyId);
            if (!prop) break;
            if (!prop.ownerId) {
                showToast(`${square.name} is unowned — buy it via the Game tab.`);
            } else if (prop.ownerId === player.userId) {
                showToast(`You own ${square.name}.`);
            } else {
                // Owned by another active player
                const owner = gameState.players.find(p => p.userId === prop.ownerId);
                if (owner && !owner.bankrupt) {
                    const rent = calculateRent(prop, gameState, diceTotal);
                    player.cash -= rent;
                    owner.cash += rent;
                    gameState.gameLog.push({
                        timestamp: new Date().toISOString(),
                        message: `${player.name} paid $${rent} rent to ${owner.name} for ${square.name}`
                    });
                    landingEvents.push({
                        type: 'forced_payment',
                        data: { from: player.name, to: owner.name, amount: rent, reason: `Rent for ${square.name}` }
                    });
                    showToast(`Paid $${rent} rent to ${owner.name}.`);
                }
            }
            break;
        }

        case 'tax':
            player.cash -= square.taxAmount;
            gameState.gameLog.push({
                timestamp: new Date().toISOString(),
                message: `${player.name} paid $${square.taxAmount} to the Bank for ${square.name}`
            });
            landingEvents.push({
                type: 'tax_payment',
                data: { from: player.name, to: 'the Bank', amount: square.taxAmount, reason: square.name }
            });
            showToast(`Paid $${square.taxAmount} for ${square.name}.`);
            break;

        case 'chance':
            handleCardDraw('chance', gameState, gameState.players.indexOf(player));
            break;

        case 'community_chest':
            handleCardDraw('community_chest', gameState, gameState.players.indexOf(player));
            break;

        case 'go_to_jail':
            player.inJail = true;
            player.position = 10;
            player.doubleCount = 0;
            player.diceRolled = true;
            gameState.gameLog.push({
                timestamp: new Date().toISOString(),
                message: `${player.name} landed on Go to Jail!`
            });
            break;

        case 'jail':
            showToast('Just visiting!');
            break;

        case 'free_parking':
            showToast('Free Parking — enjoy the rest!');
            break;

        default:
            break;
    }

    return landingEvents;
}

// ---------------------------------------------------------------
// Card drawing
// ---------------------------------------------------------------
function handleCardDraw(deckType, gameState, activePlayerIndex) {
    const isChance = deckType === 'chance';
    const deckKey = isChance ? 'chanceCards' : 'communityChestCards';
    const sourceDeck = isChance ? CHANCE_CARDS : COMMUNITY_CHEST_CARDS;

    // Ensure deck exists and is populated
    if (!gameState[deckKey] || gameState[deckKey].length === 0) {
        gameState[deckKey] = shuffleDeck(sourceDeck);
    }

    const card = gameState[deckKey].shift();

    const { message } = applyCardEffect(card, gameState, activePlayerIndex);

    gameState.lastCardDrawn = card;

    // Show card modal
    document.getElementById('cardModalHeader').textContent = isChance ? 'Chance' : 'Community Chest';
    document.getElementById('cardModalText').textContent = card.text;
    document.getElementById('cardModalEffect').textContent = 'Applied: ' + message;
    document.getElementById('cardModal').style.display = 'flex';

    // Log to persistent game log
    const playerName = gameState.players[activePlayerIndex] ? gameState.players[activePlayerIndex].name : 'Unknown';
    logGameEvent('card_draw', {
        player: playerName,
        deckType: isChance ? 'Chance' : 'Community Chest',
        card: card.text,
        effect: message
    });
}

// ---------------------------------------------------------------
// Rent / Tax prompts
// ---------------------------------------------------------------
function showRentPrompt(square, property, owner, amount) {
    pendingPayment = { amount, toPlayerId: owner.userId, toPlayerName: owner.name };

    const myPlayer = currentGame.game_state.players.find(p => p.userId === currentUser.id);
    const cashAfter = (myPlayer ? myPlayer.cash : 0) - amount;

    document.getElementById('rentModalMessage').innerHTML =
        `You landed on <strong>${escapeHtml(square.name)}</strong> (owned by <strong>${escapeHtml(owner.name)}</strong>).`;
    document.getElementById('rentModalAmount').textContent = `Rent: $${amount}`;
    document.getElementById('rentModalCashAfter').textContent =
        `Your cash: $${myPlayer ? Math.round(myPlayer.cash) : '?'} → $${Math.round(cashAfter)} after payment`;
    document.getElementById('rentPayBtn').textContent = `Pay $${amount}`;
    document.getElementById('rentModal').style.display = 'flex';
}

function showTaxPrompt(amount, squareName) {
    pendingPayment = { amount, toPlayerId: null, toPlayerName: 'the Bank' };

    const myPlayer = currentGame.game_state.players.find(p => p.userId === currentUser.id);
    const cashAfter = (myPlayer ? myPlayer.cash : 0) - amount;

    document.getElementById('rentModalMessage').innerHTML =
        `You landed on <strong>${escapeHtml(squareName)}</strong>.`;
    document.getElementById('rentModalAmount').textContent = `Tax: $${amount}`;
    document.getElementById('rentModalCashAfter').textContent =
        `Your cash: $${myPlayer ? Math.round(myPlayer.cash) : '?'} → $${Math.round(cashAfter)} after payment`;
    document.getElementById('rentPayBtn').textContent = `Pay $${amount}`;
    document.getElementById('rentModal').style.display = 'flex';
}

async function confirmRentPayment() {
    pendingPayment = null;
    closeModal('rentModal');
    renderBoardTab();
}

// ---------------------------------------------------------------
// House purchase
// ---------------------------------------------------------------
function openHouseModal() {
    if (!currentGame || !currentUser) return;
    const gameState = currentGame.game_state;
    const myProps = getCompleteGroupProperties(currentUser.id, gameState);

    pendingHouseSelections = {};
    myProps.forEach(p => { pendingHouseSelections[p.id] = 0; });

    function renderHouseModal() {
        const myPlayer = gameState.players.find(p => p.userId === currentUser.id);
        const cash = myPlayer ? myPlayer.cash : 0;
        let totalCost = 0;
        Object.entries(pendingHouseSelections).forEach(([id, delta]) => {
            const prop = gameState.properties.find(p => p.id === id);
            if (prop) totalCost += delta * (HOUSE_COSTS[prop.color] || 0);
        });

        const rowsHtml = myProps.map(prop => {
            const delta = pendingHouseSelections[prop.id] || 0;
            const currentHouses = prop.houses || 0;
            const newHouses = currentHouses + delta;
            const costPer = HOUSE_COSTS[prop.color] || 0;
            const houseLabel = newHouses === 5 ? 'Hotel' : `${newHouses} house(s)`;
            return `
                <div class="house-property-row">
                    <div>
                        <span style="display:inline-block;width:10px;height:10px;border-radius:2px;background:${PROP_COLORS[prop.color]};margin-right:6px;vertical-align:middle;"></span>
                        <strong>${escapeHtml(prop.name)}</strong>
                        <span style="color:#888;margin-left:6px;font-size:0.8rem;">($${costPer}/house)</span>
                    </div>
                    <div class="house-count-control">
                        <button onclick="houseModalAdjust('${prop.id}', -1)">−</button>
                        <span style="min-width:60px;text-align:center;">${houseLabel}</span>
                        <button onclick="houseModalAdjust('${prop.id}', 1)">+</button>
                    </div>
                </div>`;
        }).join('');

        document.getElementById('houseModalProperties').innerHTML = rowsHtml;
        document.getElementById('houseModalTotal').textContent =
            `Total cost: $${totalCost}  |  Cash available: $${Math.round(cash)}`;
    }

    // Expose adjust function globally so inline onclick works
    window.houseModalAdjust = function(propertyId, delta) {
        const prop = gameState.properties.find(p => p.id === propertyId);
        if (!prop) return;
        const current = pendingHouseSelections[propertyId] || 0;
        const newHouses = (prop.houses || 0) + current + delta;
        if (newHouses < (prop.houses || 0) || newHouses > 5) return;
        pendingHouseSelections[propertyId] = current + delta;
        renderHouseModal();
    };

    renderHouseModal();
    document.getElementById('houseModal').style.display = 'flex';
}

async function confirmHousePurchase() {
    if (!currentGame || !currentUser) return;

    try {
        const selections = Object.fromEntries(Object.entries(pendingHouseSelections).filter(([, delta]) => delta > 0));
        if (Object.keys(selections).length === 0) {
            showToast('No houses selected.');
            return;
        }
        await performGameAction('buy_houses', { selections });
        pendingHouseSelections = {};
        closeModal('houseModal');

    } catch (error) {
        console.error('Error buying houses:', error);
        alert('Failed to purchase houses');
    }
}
