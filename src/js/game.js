// Game Room JavaScript - Multiplayer Monopoly Game Logic

let currentGame = null;
let currentRoom = null;
let currentUser = null;
let gameChannel = null;
let currentPlayerData = null;

// Initialize game on page load
document.addEventListener('DOMContentLoaded', async () => {
    try {
        // Get current user
        const { data: { user }, error: userError } = await supabase.auth.getUser();
        if (userError || !user) {
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
        alert('Failed to load game');
    }
});

// Load game and room data
async function loadGameData(roomId) {
    try {
        // Load room data
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('*')
            .eq('id', roomId)
            .single();

        if (roomError) throw roomError;
        currentRoom = room;

        // Display room info
        document.getElementById('room-code').textContent = `Room: ${room.invite_code}`;
        document.getElementById('user-email').textContent = currentUser.email;

        // Load game data
        const { data: game, error: gameError } = await supabase
            .from('games')
            .select('*')
            .eq('room_id', roomId)
            .single();

        if (gameError) throw gameError;
        currentGame = game;

        // Find current player data
        const gameState = game.game_state;
        currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);

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
    // Subscribe to game state changes
    gameChannel = supabase
        .channel(`game:${currentGame.id}`)
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'games',
            filter: `id=eq.${currentGame.id}`
        }, async (payload) => {
            currentGame = payload.new;
            const gameState = payload.new.game_state;

            // Update current player data
            currentPlayerData = gameState.players.find(p => p.userId === currentUser.id);

            // Re-render game state
            renderGameState(gameState);

            // Reload game log
            await loadGameLog();
        })
        .subscribe();
}

// Render complete game state
function renderGameState(gameState) {
    const gameContent = document.getElementById('gameContent');

    const currentPlayer = gameState.players[gameState.currentPlayerIndex];
    const isMyTurn = currentPlayer.userId === currentUser.id;

    gameContent.innerHTML = `
        <div class="game-header">
            <h2>Current Turn: ${currentPlayer.name}</h2>
            ${isMyTurn ? '<p class="turn-indicator">It\'s your turn!</p>' : '<p class="waiting-indicator">Waiting for other players...</p>'}
        </div>

        <div class="players-grid">
            ${gameState.players.map(player => renderPlayerCard(player, player.userId === currentUser.id)).join('')}
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
}

// Render individual player card
function renderPlayerCard(player, isCurrentUser) {
    const totalPropertyValue = player.properties.reduce((sum, p) => sum + p.value, 0);
    const netWorth = player.cash + totalPropertyValue;

    return `
        <div class="player-card ${isCurrentUser ? 'current-user' : ''}">
            <div class="player-header">
                <h3>${player.name}</h3>
                ${isCurrentUser ? '<span class="badge">You</span>' : ''}
            </div>
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
        </div>
    `;
}

// Render action buttons for current player's turn
function renderActionButtons() {
    return `
        <div class="action-buttons">
            <button class="btn btn-primary" onclick="openBuyPropertyModal()">Buy Property</button>
            <button class="btn btn-secondary" onclick="openIPOModal()">Create IPO</button>
            <button class="btn btn-secondary" onclick="openDebtModal()">Manage Debt</button>
            <button class="btn btn-secondary" onclick="openCorporationModal()">View Corporations</button>
            <button class="btn btn-success" onclick="endTurn()">End Turn</button>
        </div>
    `;
}

// Load game log from events table
async function loadGameLog() {
    try {
        const { data: events, error } = await supabase
            .from('game_events')
            .select('*')
            .eq('game_id', currentGame.id)
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        const logContainer = document.getElementById('full-game-log');
        logContainer.innerHTML = events.map(event => `
            <div class="log-entry">
                <span class="log-time">${new Date(event.created_at).toLocaleString()}</span>
                <span class="log-type">${event.event_type}</span>
                <span class="log-message">${JSON.stringify(event.event_data)}</span>
            </div>
        `).join('');

    } catch (error) {
        console.error('Error loading game log:', error);
    }
}

// Open Buy Property Modal
async function openBuyPropertyModal() {
    const gameState = currentGame.game_state;
    const availableProperties = gameState.properties.filter(p => !p.ownerId);

    const propertiesHtml = availableProperties.map(p => `
        <div class="property-card" onclick="selectProperty('${p.id}')" data-property-id="${p.id}">
            <div class="property-color" style="background-color: ${p.color}"></div>
            <div class="property-name">${p.name}</div>
            <div class="property-price">$${p.price}</div>
        </div>
    `).join('');

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

        // Remove assets from player's properties
        selectedAssets.forEach(asset => {
            const index = currentPlayerData.properties.findIndex(p => p.id === asset.id);
            if (index !== -1) {
                currentPlayerData.properties.splice(index, 1);
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

    const corporationsHtml = gameState.corporations.map(corp => `
        <div class="corporation-card">
            <h3>${corp.ticker} - ${corp.name}</h3>
            <p>Founder: ${corp.founderName}</p>
            <p>Total Shares: ${corp.totalShares}</p>
            <p>Price per Share: $${corp.pricePerShare.toFixed(2)}</p>
            <h4>Assets:</h4>
            <ul>
                ${corp.assets.map(a => `<li>${a.name} ($${a.value})</li>`).join('')}
            </ul>
            <h4>Shareholders:</h4>
            <ul>
                ${corp.shareholders.map(s => `<li>${s.name}: ${s.shares} shares</li>`).join('')}
            </ul>
        </div>
    `).join('');

    document.getElementById('corporationList').innerHTML = corporationsHtml || '<p>No corporations created yet</p>';
    document.getElementById('corporationModal').style.display = 'flex';
}

// End turn
async function endTurn() {
    try {
        const gameState = currentGame.game_state;

        // Move to next player
        gameState.currentPlayerIndex = (gameState.currentPlayerIndex + 1) % gameState.players.length;

        const nextPlayer = gameState.players[gameState.currentPlayerIndex];

        gameState.gameLog.push({
            timestamp: new Date().toISOString(),
            message: `${currentPlayerData.name} ended their turn. It's now ${nextPlayer.name}'s turn.`
        });

        await updateGameState(gameState);
        await logGameEvent('turn_end', {
            player: currentPlayerData.name,
            nextPlayer: nextPlayer.name
        });

    } catch (error) {
        console.error('Error ending turn:', error);
        alert('Failed to end turn');
    }
}

// Update game state in database
async function updateGameState(gameState) {
    const { error } = await supabase
        .from('games')
        .update({ game_state: gameState })
        .eq('id', currentGame.id);

    if (error) throw error;
}

// Log game event
async function logGameEvent(eventType, eventData) {
    const { error } = await supabase
        .from('game_events')
        .insert({
            game_id: currentGame.id,
            room_id: currentRoom.id,
            user_id: currentUser.id,
            event_type: eventType,
            event_data: eventData
        });

    if (error) console.error('Error logging event:', error);
}

// Modal controls
function closeModal(modalId) {
    document.getElementById(modalId).style.display = 'none';
}

// Tab navigation
function showSection(sectionName) {
    document.querySelectorAll('.section').forEach(section => {
        section.classList.remove('active');
    });
    document.querySelectorAll('.nav-tab').forEach(tab => {
        tab.classList.remove('active');
    });

    document.getElementById(sectionName).classList.add('active');
    event.target.classList.add('active');
}

// Set up UI listeners for Market section
function setupUIListeners() {
    // Populate player dropdowns
    populatePlayerDropdowns();
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
