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
        currentGame = game;
        const gameState = game.game_state;

        // Update current player data
        currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);

        // Re-render game state
        renderGameState(gameState);

        // Reload game log
        await loadGameLog();

        // Always re-render board so it stays in sync regardless of active tab
        renderBoardTab();

        // Refresh transaction dropdowns with latest player/property state
        populatePlayerDropdowns();
    });
}

// Render complete game state
function renderGameState(gameState) {
    const gameContent = document.getElementById('gameContent');

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const isMyTurn = currentPlayer.userId === currentUser.id;

    document.body.classList.toggle('is-my-turn', isMyTurn);

    const orderedPlayers = [
        ...gameState.players.filter(p => p.userId === currentUser.id),
        ...gameState.players.filter(p => p.userId !== currentUser.id)
    ];

    gameContent.innerHTML = `
        <div class="game-header">
            <h2>Current Turn: ${currentPlayer.name}</h2>
            ${isMyTurn ? '<p class="turn-indicator">It\'s your turn!</p>' : '<p class="waiting-indicator">Waiting for other players...</p>'}
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
                    <h3>${player.name}</h3>
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
    return `
        <div class="action-buttons">
            ${!hasRolled ? '<button class="btn btn-primary" style="margin-bottom:8px;width:100%;" onclick="rollDiceAndMove()">🎲 Roll Dice</button>' : ''}
            <button class="btn btn-success action-btn-end-turn" onclick="endTurn()">End Turn</button>
            <div class="action-btn-secondary-group">
                <button class="btn btn-primary btn-sm" onclick="openBuyPropertyModal()">Buy Property</button>
                <button class="btn btn-secondary btn-sm" onclick="openIPOModal()">Create IPO</button>
                <button class="btn btn-secondary btn-sm" onclick="openDebtModal()">Manage Debt</button>
                <button class="btn btn-secondary btn-sm" onclick="openCorporationModal()">Corporations</button>
                ${isHost ? '<button class="btn btn-danger btn-sm" onclick="hostEndGame()">End Game</button>' : ''}
            </div>
        </div>
    `;
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
                <span class="log-time">${new Date(event.created_at).toLocaleString()}</span>
                <span class="log-message">${formatLogEvent(event.event_type, event.event_data)}</span>
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
            <div class="property-name">${property.name}</div>
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

    const purchasePrice = parseFloat(document.getElementById('purchasePrice').value);

    try {
        const gameState = currentGame.game_state;
        const property = gameState.properties.find(p => p.id === selectedPropertyId);

        if (currentPlayerData.cash < purchasePrice) {
            alert('Insufficient funds');
            return;
        }

        // Update game state
        property.ownerId = currentUser.id;
        property.ownerName = currentPlayerData.name;

        currentPlayerData.cash -= purchasePrice;
        currentPlayerData.properties.push({
            id: property.id,
            name: property.name,
            color: property.color,
            value: purchasePrice
        });

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${currentPlayerData.name} purchased ${property.name} for $${purchasePrice.toFixed(2)}`
        });

        // Update database
        await updateGameState(gameState);
        renderGameState(currentGame.game_state);

        // Log event
        await logGameEvent('property_purchase', {
            property: property.name,
            buyer: currentPlayerData.name,
            price: purchasePrice
        });

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
            <label for="ipo-asset-${p.id}">${p.name} ($${p.value})</label>
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
        const gameState = currentGame.game_state;

        // Create corporation
        const corporation = {
            id: `corp-${Date.now()}`,
            ticker: ticker,
            name: `${ticker} Corporation`,
            founderId: currentUser.id,
            founderName: currentPlayerData.name,
            totalShares: numShares,
            pricePerShare: pricePerShare,
            assets: selectedAssets,
            shareholders: [{
                userId: currentUser.id,
                name: currentPlayerData.name,
                shares: numShares
            }]
        };

        gameState.corporations.push(corporation);

        // Remove assets from player's properties and clear ownership in master list
        selectedAssets.forEach(asset => {
            const index = currentPlayerData.properties.findIndex(p => p.id === asset.id);
            if (index !== -1) {
                currentPlayerData.properties.splice(index, 1);
            }
            // Clear ownerId so the board/rent logic no longer treats this as player-owned
            const masterProp = gameState.properties.find(p => p.id === asset.id);
            if (masterProp) {
                masterProp.ownerId = corporation.id;
                masterProp.ownerName = `[${ticker}]`;
            }
        });

        // Add corporation to player
        currentPlayerData.corporations.push({
            ticker: ticker,
            sharesOwned: numShares,
            totalShares: numShares
        });

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${currentPlayerData.name} created ${ticker} IPO with ${numShares} shares at $${pricePerShare} each`
        });

        // Update database
        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('ipo_created', {
            ticker: ticker,
            founder: currentPlayerData.name,
            shares: numShares,
            pricePerShare: pricePerShare
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
            <label for="collateral-${p.id}">${p.name} ($${p.value})</label>
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
        const gameState = currentGame.game_state;

        const debt = {
            id: `debt-${Date.now()}`,
            principal: loanAmount,
            interestRate: interestRate,
            collateral: selectedCollateral,
            issueDate: new Date().toISOString()
        };

        currentPlayerData.debts.push(debt);
        currentPlayerData.cash += loanAmount;

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${currentPlayerData.name} issued debt: $${loanAmount.toFixed(2)} @ ${interestRate}%`
        });

        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('debt_issued', {
            issuer: currentPlayerData.name,
            amount: loanAmount,
            interestRate: interestRate
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
        const gameState = currentGame.game_state;
        const debt = currentPlayerData.debts[debtIndex];

        currentPlayerData.cash -= paymentAmount;
        debt.principal -= paymentAmount;

        if (debt.principal <= 0) {
            currentPlayerData.debts.splice(debtIndex, 1);
            gameState.gameLog.push({
                timestamp: new Date().toISOString(),
                message: `${currentPlayerData.name} fully settled debt`
            });
        } else {
            gameState.gameLog.push({
                timestamp: new Date().toISOString(),
                message: `${currentPlayerData.name} paid $${paymentAmount.toFixed(2)} towards debt`
            });
        }

        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('debt_payment', {
            payer: currentPlayerData.name,
            amount: paymentAmount
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
        const sharesAvailable = corp.totalShares - corp.shareholders.reduce((sum, s) => sum + s.shares, 0);
        const isFounder = corp.founderId === currentUser.id;
        const canBuy = isMyTurn && !isFounder && sharesAvailable > 0;

        return `
        <div class="corporation-card">
            <h3>${corp.ticker} - ${corp.name}</h3>
            <p>Founder: ${corp.founderName}</p>
            <p>Total Shares: ${corp.totalShares} | Available: ${sharesAvailable} | Price: $${corp.pricePerShare.toFixed(2)}/share</p>
            <h4>Assets:</h4>
            <ul>
                ${corp.assets.map(a => `<li>${a.name} ($${a.value})</li>`).join('')}
            </ul>
            <h4>Shareholders:</h4>
            <ul>
                ${corp.shareholders.map(s => `<li>${s.name}: ${s.shares} shares</li>`).join('')}
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
    const sharesAvailable = corp.totalShares - corp.shareholders.reduce((sum, s) => sum + s.shares, 0);

    if (!numShares || numShares < 1 || numShares > sharesAvailable) {
        alert(`Enter a valid number of shares (1–${sharesAvailable})`);
        return;
    }

    if (currentPlayerData.cash < totalCost) {
        alert(`Insufficient funds. Cost: $${totalCost.toFixed(2)}, You have: $${currentPlayerData.cash.toFixed(2)}`);
        return;
    }

    try {
        // Deduct from buyer
        currentPlayerData.cash -= totalCost;

        // Pay founder
        const founder = gameState.players.find(p => p.userId === corp.founderId);
        if (founder) founder.cash += totalCost;

        // Update shareholder ledger
        const existing = corp.shareholders.find(s => s.userId === currentUser.id);
        if (existing) {
            existing.shares += numShares;
        } else {
            corp.shareholders.push({ userId: currentUser.id, name: currentPlayerData.name, shares: numShares });
        }

        // Update buyer's corporation list
        const myCorpEntry = currentPlayerData.corporations.find(c => c.ticker === corp.ticker);
        if (myCorpEntry) {
            myCorpEntry.sharesOwned += numShares;
        } else {
            currentPlayerData.corporations.push({ ticker: corp.ticker, sharesOwned: numShares, totalShares: corp.totalShares, pricePerShare: corp.pricePerShare });
        }

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${currentPlayerData.name} bought ${numShares} share(s) of ${corp.ticker} for $${totalCost.toFixed(2)}`
        });

        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('share_purchase', {
            buyer: currentPlayerData.name,
            ticker: corp.ticker,
            shares: numShares,
            totalCost
        });

        closeModal('corporationModal');

    } catch (error) {
        console.error('Error buying shares:', error);
        alert('Failed to buy shares');
    }
}

// End turn
async function endTurn() {
    try {
        const gameState = currentGame.game_state;

        // --- Board: warn if dice not rolled (unless first turn at GO) ---
        if (currentPlayerData && !currentPlayerData.diceRolled && (currentPlayerData.position || 0) !== 0) {
            gameState.gameLog.push({
                timestamp: new Date().toISOString(),
                message: `Note: ${currentPlayerData.name} ended their turn without rolling the dice.`
            });
        }

        // --- Board: reset turn fields ---
        if (currentPlayerData) {
            currentPlayerData.diceRolled = false;
            currentPlayerData.doubleCount = 0;
        }

        // --- Interest accrual ---
        let totalInterest = 0;
        currentPlayerData.debts.forEach(debt => {
            const interest = debt.principal * (debt.interestRate / 100);
            debt.principal += interest;
            totalInterest += interest;
        });

        if (totalInterest > 0) {
            currentPlayerData.cash -= totalInterest;
            gameState.gameLog.push({
                timestamp: new Date().toISOString(),
                message: `${currentPlayerData.name} was charged $${totalInterest.toFixed(2)} in interest.`
            });
            await logGameEvent('interest_accrual', {
                player: currentPlayerData.name,
                interestCharged: totalInterest
            });
        }

        // --- Bankruptcy detection ---
        if (currentPlayerData.cash < 0 && !currentPlayerData.bankrupt) {
            currentPlayerData.bankrupt = true;
            gameState.gameLog.push({
                timestamp: new Date().toISOString(),
                message: `${currentPlayerData.name} has gone BANKRUPT!`
            });
            await logGameEvent('bankruptcy', { player: currentPlayerData.name });
        }

        // --- Advance to next non-bankrupt player ---
        const totalPlayers = gameState.players.length;
        let nextIndex = (gameState.currentPlayerIndex + 1) % totalPlayers;
        let safetyCounter = 0;
        while (gameState.players[nextIndex].bankrupt && safetyCounter < totalPlayers) {
            nextIndex = (nextIndex + 1) % totalPlayers;
            safetyCounter++;
        }
        gameState.currentPlayerIndex = nextIndex;
        const nextPlayer = gameState.players[nextIndex];
        nextPlayer.diceRolled = false;
        gameState.lastDiceRoll = null;

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${currentPlayerData.name} ended their turn. It's now ${nextPlayer.name}'s turn.`
        });

        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('turn_end', {
            player: currentPlayerData.name,
            nextPlayer: nextPlayer.name
        });

        // --- Win condition ---
        const activePlayers = gameState.players.filter(p => !p.bankrupt);
        if (activePlayers.length <= 1) {
            if (isHotseatMode) sessionStorage.removeItem('hotseat_tokens');
            const reason = activePlayers.length === 1
                ? activePlayers[0].name + ' wins — last player standing!'
                : 'Everyone went bankrupt — it\'s a draw!';
            await triggerEndGame(gameState, reason);
            return;
        }

        // --- Hotseat: show pass-device screen before next player takes over ---
        if (isHotseatMode) {
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
        // Compute net worth for each player
        const standings = gameState.players.map(player => {
            const propertyValue = player.properties.reduce((sum, p) => sum + (p.value || 0), 0);
            const corpValue = (player.corporations || []).reduce((sum, c) => sum + (c.sharesOwned * (c.pricePerShare || 0)), 0);
            const debtTotal = player.debts.reduce((sum, d) => sum + d.principal, 0);
            const netWorth = player.cash + propertyValue + corpValue - debtTotal;
            return { name: player.name, cash: player.cash, propertyValue, corpValue, debtTotal, netWorth, bankrupt: player.bankrupt };
        });

        standings.sort((a, b) => b.netWorth - a.netWorth);

        // Update room status to completed
        await apiFetch(`/rooms/${currentRoom.id}/status`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'completed' })
        });

        await logGameEvent('game_ended', { reason, standings });

        // Clear hotseat session on game over
        if (isHotseatMode) sessionStorage.removeItem('hotseat_tokens');

        // Show winner modal
        const winner = standings[0];
        const standingsHtml = standings.map((p, i) => `
            <div class="standings-row ${p.bankrupt ? 'bankrupt' : ''}">
                <span class="rank">#${i + 1}</span>
                <span class="player-name">${p.name}${p.bankrupt ? ' (bankrupt)' : ''}</span>
                <span class="net-worth">$${p.netWorth.toFixed(2)}</span>
            </div>
        `).join('');

        document.getElementById('winnerName').textContent = winner.name;
        document.getElementById('winnerReason').textContent = reason || '';
        document.getElementById('finalStandings').innerHTML = standingsHtml;
        document.getElementById('winnerModal').style.display = 'flex';

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

// Update game state in database
async function updateGameState(gameState) {
    await apiFetch(`/games/${currentGame.id}/state`, {
        method: 'PATCH',
        body: JSON.stringify({ game_state: gameState })
    });
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
        `<option value="${p.userId}">${p.name}</option>`
    ).join('');

    player1Select.innerHTML = playersHtml;
    player2Select.innerHTML = playersHtml;
    paymentFromPlayer.innerHTML = playersHtml;
    paymentToPlayer.innerHTML = playersHtml;

    // Add event listeners for player selection
    player1Select.addEventListener('change', () => updatePlayerAssets('player1'));
    player2Select.addEventListener('change', () => updatePlayerAssets('player2'));
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
            <label for="${playerNumber}-asset-${p.id}">${p.name} ($${p.value})</label>
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
        const gameState = currentGame.game_state;
        const player1 = gameState.players.find(p => p.userId === player1Id);
        const player2 = gameState.players.find(p => p.userId === player2Id);

        // Transfer cash
        player1.cash -= player1Cash;
        player1.cash += player2Cash;
        player2.cash -= player2Cash;
        player2.cash += player1Cash;

        // Transfer assets from player1 to player2
        player1Assets.forEach(assetId => {
            const assetIndex = player1.properties.findIndex(p => p.id === assetId);
            if (assetIndex !== -1) {
                const asset = player1.properties.splice(assetIndex, 1)[0];
                player2.properties.push(asset);

                // Update property ownership in game state
                const property = gameState.properties.find(p => p.id === assetId);
                if (property) {
                    property.ownerId = player2Id;
                    property.ownerName = player2.name;
                }
            }
        });

        // Transfer assets from player2 to player1
        player2Assets.forEach(assetId => {
            const assetIndex = player2.properties.findIndex(p => p.id === assetId);
            if (assetIndex !== -1) {
                const asset = player2.properties.splice(assetIndex, 1)[0];
                player1.properties.push(asset);

                // Update property ownership in game state
                const property = gameState.properties.find(p => p.id === assetId);
                if (property) {
                    property.ownerId = player1Id;
                    property.ownerName = player1.name;
                }
            }
        });

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `Transaction: ${player1.name} ↔ ${player2.name} ($${player1Cash} + ${player1Assets.length} assets ↔ $${player2Cash} + ${player2Assets.length} assets)`
        });

        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('transaction', {
            player1: player1.name,
            player2: player2.name,
            player1Cash,
            player2Cash,
            player1Assets: player1Assets.length,
            player2Assets: player2Assets.length
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
        const gameState = currentGame.game_state;
        const fromPlayer = gameState.players.find(p => p.userId === fromPlayerId);
        const toPlayer = gameState.players.find(p => p.userId === toPlayerId);

        if (fromPlayer.cash < amount) {
            alert('Insufficient funds');
            return;
        }

        fromPlayer.cash -= amount;
        toPlayer.cash += amount;

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${fromPlayer.name} paid $${amount.toFixed(2)} to ${toPlayer.name}`
        });

        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('payment', {
            from: fromPlayer.name,
            to: toPlayer.name,
            amount: amount
        });

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

    const gameState = currentGame.game_state;
    const player = gameState.players[gameState.currentPlayerIndex];

    if (!player || player.userId !== currentUser.id) {
        showToast('It is not your turn!');
        return;
    }
    if (player.diceRolled) {
        showToast('You have already rolled this turn.');
        return;
    }

    const die1 = Math.floor(Math.random() * 6) + 1;
    const die2 = Math.floor(Math.random() * 6) + 1;
    const total = die1 + die2;
    const isDoubles = die1 === die2;

    gameState.lastDiceRoll = [die1, die2];

    if (isDoubles) {
        player.doubleCount = (player.doubleCount || 0) + 1;
        if (player.doubleCount >= 3) {
            // Three consecutive doubles → jail
            player.inJail = true;
            player.position = 10;
            player.doubleCount = 0;
            player.diceRolled = true;
            gameState.gameLog.push({
                timestamp: new Date().toISOString(),
                message: `${player.name} rolled doubles 3 times — sent to Jail!`
            });
            await updateGameState(gameState);
            currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);
            renderBoardTab();
            return;
        }
    } else {
        player.doubleCount = 0;
    }

    // Jail handling
    if (player.inJail) {
        if (isDoubles) {
            player.inJail = false;
            player.jailTurns = 0;
            showToast('Rolled doubles — released from Jail!');
        } else {
            player.jailTurns = (player.jailTurns || 0) + 1;
            if (player.jailTurns >= 3) {
                // Forced buy-out after 3 turns
                player.cash -= 50;
                player.inJail = false;
                player.jailTurns = 0;
                showToast('Paid $50 bail — released from Jail.');
            } else {
                player.diceRolled = true;
                gameState.gameLog.push({
                    timestamp: new Date().toISOString(),
                    message: `${player.name} is in Jail (turn ${player.jailTurns}/3). Rolled ${die1}+${die2}.`
                });
                await updateGameState(gameState);
                currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);
                renderBoardTab();
                return;
            }
        }
    }

    // Move
    const oldPos = player.position || 0;
    const newPos = (oldPos + total) % 40;

    // Detect passing GO (only when not about to be sent to jail by card/square)
    const passGoAmount = gameState.settings.passGoAmount || 200;
    if (newPos < oldPos) {
        player.cash += passGoAmount;
        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${player.name} passed GO — collected $${passGoAmount}!`
        });
        await logGameEvent('pass_go', { player: player.name, amount: passGoAmount });
    }

    player.position = newPos;

    // Doubles = can roll again (diceRolled stays false); otherwise lock
    if (!isDoubles) {
        player.diceRolled = true;
    }

    gameState.gameLog.push({
        timestamp: new Date().toISOString(),
        message: `${player.name} rolled ${die1}+${die2}=${total} — moved to ${BOARD_SQUARES[newPos].name}${isDoubles ? ' (doubles — roll again!)' : ''}`
    });

    await logGameEvent('dice_roll', {
        player: player.name,
        die1, die2, total,
        isDoubles,
        square: BOARD_SQUARES[newPos].name
    });

    // Process landing effects (may modify gameState or show modals)
    processLanding(player, newPos, gameState, total);

    // Save updated state
    await updateGameState(gameState);
    currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);
    renderGameState(currentGame.game_state);
    renderBoardTab();
}

// ---------------------------------------------------------------
// Landing logic
// ---------------------------------------------------------------
function processLanding(player, position, gameState, diceTotal) {
    const square = BOARD_SQUARES[position];

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
                    showRentPrompt(square, prop, owner, rent);
                }
            }
            break;
        }

        case 'tax':
            showTaxPrompt(square.taxAmount, square.name);
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
        `You landed on <strong>${square.name}</strong> (owned by <strong>${owner.name}</strong>).`;
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
        `You landed on <strong>${squareName}</strong>.`;
    document.getElementById('rentModalAmount').textContent = `Tax: $${amount}`;
    document.getElementById('rentModalCashAfter').textContent =
        `Your cash: $${myPlayer ? Math.round(myPlayer.cash) : '?'} → $${Math.round(cashAfter)} after payment`;
    document.getElementById('rentPayBtn').textContent = `Pay $${amount}`;
    document.getElementById('rentModal').style.display = 'flex';
}

async function confirmRentPayment() {
    if (!pendingPayment) return;

    try {
        const gameState = currentGame.game_state;
        const payer = gameState.players.find(p => p.userId === currentUser.id);
        if (!payer) return;

        payer.cash -= pendingPayment.amount;

        if (pendingPayment.toPlayerId) {
            const recipient = gameState.players.find(p => p.userId === pendingPayment.toPlayerId);
            if (recipient) recipient.cash += pendingPayment.amount;
        }

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${payer.name} paid $${pendingPayment.amount} to ${pendingPayment.toPlayerName}`
        });

        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('payment', {
            from: payer.name,
            to: pendingPayment.toPlayerName,
            amount: pendingPayment.amount
        });

        currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);
        pendingPayment = null;
        closeModal('rentModal');
        renderBoardTab();

    } catch (error) {
        console.error('Error processing payment:', error);
        alert('Failed to process payment');
    }
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
                        <strong>${prop.name}</strong>
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
        const gameState = currentGame.game_state;
        const myPlayer = gameState.players.find(p => p.userId === currentUser.id);
        if (!myPlayer) return;

        let totalCost = 0;
        const changes = [];

        for (const [propId, delta] of Object.entries(pendingHouseSelections)) {
            if (delta <= 0) continue;
            const prop = gameState.properties.find(p => p.id === propId);
            if (!prop) continue;
            const cost = delta * (HOUSE_COSTS[prop.color] || 0);
            totalCost += cost;
            changes.push({ prop, delta, cost });
        }

        if (changes.length === 0) {
            showToast('No houses selected.');
            return;
        }

        if (myPlayer.cash < totalCost) {
            showToast(`Insufficient funds. Need $${totalCost}, have $${Math.round(myPlayer.cash)}.`);
            return;
        }

        myPlayer.cash -= totalCost;
        changes.forEach(({ prop, delta }) => {
            prop.houses = Math.min(5, (prop.houses || 0) + delta);
            // Sync value in player.properties so net worth stays accurate
            const playerPropEntry = myPlayer.properties.find(p => p.id === prop.id);
            if (playerPropEntry) {
                playerPropEntry.value = prop.price + prop.houses * (HOUSE_COSTS[prop.color] || 0);
            }
        });

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${myPlayer.name} bought houses/hotels for $${totalCost}`
        });

        await updateGameState(gameState);
        renderGameState(currentGame.game_state);
        await logGameEvent('house_purchase', {
            player: myPlayer.name,
            cost: totalCost,
            properties: changes.map(c => ({ name: c.prop.name, added: c.delta }))
        });

        currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);
        pendingHouseSelections = {};
        closeModal('houseModal');
        renderBoardTab();

    } catch (error) {
        console.error('Error buying houses:', error);
        alert('Failed to purchase houses');
    }
}
