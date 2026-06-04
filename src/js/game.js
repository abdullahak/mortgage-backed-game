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
    const paused = !!gameState.paused;
    const landing = getLandingSummary(gameState, currentPlayer);

    document.body.classList.toggle('is-my-turn', isMyTurn && !paused);
    document.body.classList.toggle('game-paused', paused);

    const orderedPlayers = [
        ...gameState.players.filter(p => p.userId === currentUser.id),
        ...gameState.players.filter(p => p.userId !== currentUser.id)
    ];

    gameContent.innerHTML = `
        <div class="game-header">
            <h2>Current Turn: ${escapeHtml(currentPlayer.name)}</h2>
            ${paused ? '<p class="waiting-indicator">Game paused by host</p>' : (isMyTurn ? '<p class="turn-indicator">It\'s your turn!</p>' : '<p class="waiting-indicator">Waiting for other players...</p>')}
            <div class="landing-summary ${landing.canBuy ? 'can-buy' : ''}">
                <div>
                    <span class="landing-label">${escapeHtml(landing.label)}</span>
                    <strong>${escapeHtml(landing.squareName)}</strong>
                </div>
                <p>${escapeHtml(landing.detail)}</p>
            </div>
            ${renderCashWarning(currentPlayer, isMyTurn)}
            ${renderPauseBanner(gameState)}
            ${renderLastCardSummary(gameState, currentPlayer)}
            ${renderTurnChecklist(gameState, currentPlayer, landing, isMyTurn)}
        </div>

        <div class="players-grid">
            ${orderedPlayers.map(player => renderPlayerCard(player, player.userId === currentUser.id)).join('')}
        </div>

        ${renderAuctionPanel(gameState)}

        ${paused ? renderPausedActions(gameState) : (isMyTurn ? renderActionButtons() : renderNonTurnActions())}

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

function renderPauseBanner(gameState) {
    if (!gameState?.paused) return '';
    const pause = gameState.pause || {};
    const pausedBy = pause.pausedByName || 'Host';
    const reason = pause.reason || 'Host paused the game';
    const time = pause.pausedAt ? `Paused ${formatTimeAgo(pause.pausedAt)}.` : '';
    return `
        <div class="pause-panel" id="pausePanel">
            <div>
                <span class="pause-label">Game Paused</span>
                <strong>${escapeHtml(reason)}</strong>
            </div>
            <p>${escapeHtml(`${pausedBy} paused the session. ${time}`.trim())}</p>
        </div>
    `;
}

function renderCashWarning(currentPlayer, isMyTurn) {
    const claim = getBankruptcyClaimForPlayer(currentPlayer?.userId);
    if (!currentPlayer || currentPlayer.bankrupt || (Number(currentPlayer.cash || 0) >= 0 && !claim)) return '';
    if (claim) {
        const unpaid = Number(claim.unpaidAmount || 0).toFixed(2);
        const creditor = claim.creditorName || 'the creditor';
        const message = isMyTurn
            ? `You have $${unpaid} unpaid to ${creditor}. Raise cash before ending your turn or End Turn will declare bankruptcy.`
            : `${currentPlayer.name} has $${unpaid} unpaid to ${creditor} and must resolve it before ending the turn.`;
        return `<div class="turn-warning danger">${escapeHtml(message)}</div>`;
    }
    const amount = Math.abs(Number(currentPlayer.cash || 0)).toFixed(2);
    const message = isMyTurn
        ? `You are $${amount} below zero. Recover before ending your turn or End Turn will declare bankruptcy.`
        : `${currentPlayer.name} is $${amount} below zero and must recover before ending the turn.`;
    return `<div class="turn-warning danger">${escapeHtml(message)}</div>`;
}

function getBankruptcyClaimForPlayer(playerId) {
    if (!playerId || !currentGame?.game_state?.bankruptcyClaims) return null;
    const claim = currentGame.game_state.bankruptcyClaims[playerId];
    return claim && Number(claim.unpaidAmount || 0) > 0 ? claim : null;
}

function renderAuctionPanel(gameState) {
    const auction = gameState.auction;
    if (!auction || auction.status !== 'open') return '';
    const property = gameState.properties.find(prop => prop.id === auction.propertyId);
    const currentBid = Number(auction.currentBid || 0);
    const passed = (auction.passedPlayerIds || []).includes(currentUser.id);
    const isHighBidder = auction.highBidderId === currentUser.id;
    const currentPlayer = gameState.players.find(player => player.userId === currentUser.id);
    const canAct = currentPlayer && !currentPlayer.bankrupt && !passed && !isHighBidder;
    const isHost = currentRoom && currentUser.id === currentRoom.host_id;
    const minBid = currentBid + 1;
    const status = auction.highBidderName
        ? `High bid: $${currentBid.toFixed(2)} by ${auction.highBidderName}`
        : 'No bids yet';
    const expiryText = formatAuctionExpiry(auction.expiresAt);
    const actionState = passed
        ? '<p class="auction-note">You passed on this auction.</p>'
        : (isHighBidder
            ? '<p class="auction-note">You are the current high bidder.</p>'
            : '');

    return `
        <div class="auction-panel" id="auctionPanel">
            <div class="auction-header">
                <div>
                    <span class="auction-label">Property Auction</span>
                    <h3>${escapeHtml(auction.propertyName || property?.name || 'Property')}</h3>
                </div>
                <strong>${escapeHtml(status)}</strong>
            </div>
            <p>${escapeHtml(auction.startedByName || 'A player')} started this auction. Resolve it before the turn can continue.</p>
            ${expiryText ? `<p class="auction-note">${escapeHtml(expiryText)}</p>` : ''}
            ${actionState}
            ${canAct ? `
                <div class="auction-actions">
                    <input type="number" id="auctionBidAmount" min="${minBid}" step="1" value="${minBid}" aria-label="Auction bid amount">
                    <button class="btn btn-success btn-sm" onclick="placeAuctionBid()">Bid</button>
                    <button class="btn btn-secondary btn-sm" onclick="passAuction()">Pass</button>
                </div>
            ` : ''}
            ${isHost ? `
                <div class="auction-host-actions">
                    <button class="btn btn-danger btn-sm" onclick="hostCancelAuction()">Cancel Auction</button>
                </div>
            ` : ''}
        </div>
    `;
}

function formatAuctionExpiry(expiresAt) {
    if (!expiresAt) return '';
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) return '';
    const seconds = Math.max(Math.ceil((expiry.getTime() - Date.now()) / 1000), 0);
    if (seconds <= 0) return 'Auction timeout reached. The next action will resolve it.';
    return `Timeout if idle for ${seconds}s more.`;
}

function renderTurnChecklist(gameState, currentPlayer, landing, isMyTurn) {
    const hasRolled = !!currentPlayer.diceRolled;
    const ended = !!gameState.ended;
    const items = [
        {
            label: 'Roll',
            state: hasRolled ? 'complete' : (isMyTurn ? 'current' : 'upcoming'),
            detail: hasRolled ? formatDiceLabel(gameState.lastDiceRoll) : 'Waiting for dice',
        },
        {
            label: 'Resolve',
            state: !hasRolled ? 'upcoming' : (landing.canBuy ? 'current' : 'complete'),
            detail: landing.canBuy ? 'Property available' : landing.squareName,
        },
        {
            label: 'Actions',
            state: hasRolled && !ended ? 'current' : 'upcoming',
            detail: 'Assets, debt, market',
        },
        {
            label: 'End',
            state: ended ? 'complete' : (hasRolled && isMyTurn ? 'current' : 'upcoming'),
            detail: 'Interest and next player',
        },
    ];

    return `
        <div class="turn-checklist" aria-label="Turn progress">
            ${items.map(item => `
                <div class="turn-step ${item.state}">
                    <span>${escapeHtml(item.label)}</span>
                    <strong>${escapeHtml(item.detail)}</strong>
                </div>
            `).join('')}
        </div>
    `;
}

function formatDiceLabel(dice) {
    if (!Array.isArray(dice) || dice.length < 2) return 'Rolled';
    return `${dice[0]} + ${dice[1]} = ${dice[0] + dice[1]}`;
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

function renderLastCardSummary(gameState, player) {
    const lastCard = normalizeLastCardDrawn(gameState.lastCardDrawn);
    if (!lastCard || lastCard.playerId !== player.userId) return '';
    return `
        <div class="card-effect-summary">
            <span>${escapeHtml(deckDisplayName(lastCard.deckType))}</span>
            <strong>${escapeHtml(lastCard.card)}</strong>
            <p>${escapeHtml(lastCard.effect ? `Applied: ${lastCard.effect}.` : 'Card effect was applied automatically.')}</p>
        </div>
    `;
}

function normalizeLastCardDrawn(card) {
    if (!card) return null;
    if (card.card || card.playerId || card.effect) return card;
    return { card: card.text || 'Card drawn', deckType: 'card', playerId: null, effect: null };
}

function deckDisplayName(deckType) {
    if (deckType === 'chance') return 'Chance';
    if (deckType === 'community_chest') return 'Community Chest';
    return 'Card';
}

// Render individual player card
function renderPlayerCard(player, isCurrentUser) {
    const totalPropertyValue = player.properties.reduce((sum, p) => sum + p.value, 0);
    const corporationValue = getPlayerCorporationValue(player);
    const debtTotal = getDebtTotal(player.debts);
    const netWorth = player.cash + totalPropertyValue + corporationValue - debtTotal;
    const cashFlow = getEntityCashFlow(player.userId);
    const bankruptBadge = player.bankrupt ? '<span class="badge badge-danger">Bankrupt</span>' : '';
    const cardClass = player.bankrupt ? 'bankrupt' : '';

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
        <div class="cash-flow-summary">
            <div><span>Paid this turn</span><strong>$${cashFlow.paid.toFixed(2)}</strong></div>
            <div><span>Received this turn</span><strong>$${cashFlow.received.toFixed(2)}</strong></div>
            <div><span>Received between turns</span><strong>$${cashFlow.receivedBetweenTurns.toFixed(2)}</strong></div>
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
                        ${escapeHtml(c.ticker)} (${c.sharesOwned}/${c.totalShares} shares, ${ownershipPercent(c.sharesOwned, c.totalShares)}%)
                        <span class="corp-assets-owned">NAV: $${getPlayerCorporationShareValue(c).toFixed(2)}/share</span>
                        ${c.insolvent ? '<span class="badge badge-danger">Insolvent</span>' : ''}
                        ${renderCorporationAssetSummary(c.id)}
                    </div>
                `).join('')}
            </div>
        ` : ''}
        ${player.debts.length > 0 ? `
            <div class="player-debts">
                <h4>Debts:</h4>
                ${player.debts.map(d => `
                    <div class="debt-badge">
                        $${Number(d.principal || 0).toFixed(2)} @ ${Number(d.interestRate || 0)}%
                        <span>Interest next turn: $${interestPayment(d).toFixed(2)}</span>
                    </div>
                `).join('')}
            </div>
        ` : ''}
    `;

    if (isCurrentUser) {
        return `
            <div class="player-card current-user ${cardClass}">
                <div class="player-header">
                    <h3>${escapeHtml(player.name)}</h3>
                    <span class="badge">You</span>
                    ${bankruptBadge}
                </div>
                ${cardDetails}
            </div>
        `;
    }

    return `
        <div class="player-card player-card-other collapsed ${cardClass}" data-player-id="${player.userId}">
            <div class="player-card-summary" onclick="togglePlayerCard(this)">
                <span class="player-name-sm">${escapeHtml(player.name)}</span>
                ${bankruptBadge}
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

function getDebtTotal(debts) {
    return (debts || []).reduce((sum, debt) => sum + Number(debt.principal || 0), 0);
}

function interestPayment(debt) {
    return Number(debt.principal || 0) * (Number(debt.interestRate || 0) / 100);
}

function getPlayerCorporationValue(player) {
    return (player.corporations || []).reduce((sum, corp) => {
        return sum + Number(corp.sharesOwned || 0) * getPlayerCorporationShareValue(corp);
    }, 0);
}

function getPlayerCorporationShareValue(playerCorp) {
    if (Number.isFinite(Number(playerCorp.shareValue))) return Number(playerCorp.shareValue);
    const corp = currentGame?.game_state?.corporations?.find(item => item.id === playerCorp.id);
    return corp ? getCorporationShareValue(corp) : Number(playerCorp.pricePerShare || 0);
}

function getCorporationAssetValue(corp) {
    const properties = currentGame?.game_state?.properties || [];
    const assetIds = new Set((corp.assets || []).map(asset => asset.id));
    const propertyValue = properties
        .filter(prop => prop.ownerId === corp.id)
        .reduce((sum, prop) => {
            assetIds.delete(prop.id);
            return sum + Number(prop.price || 0) + Number(prop.houses || 0) * (HOUSE_COSTS[prop.color] || 0);
        }, 0);
    const fallbackAssetValue = (corp.assets || [])
        .filter(asset => assetIds.has(asset.id))
        .reduce((sum, asset) => sum + Number(asset.value || 0), 0);
    return propertyValue + fallbackAssetValue;
}

function getCorporationDebtValue(corp) {
    return (corp.debts || []).reduce((sum, debt) => sum + Number(debt.principal || 0), 0);
}

function getCorporationNetAssetValue(corp) {
    if (corp.insolvent || corp.status === 'insolvent') return 0;
    return getCorporationAssetValue(corp) + Number(corp.cash || 0) - getCorporationDebtValue(corp);
}

function getCorporationShareValue(corp) {
    const totalShares = Number(corp.totalShares || 0);
    if (totalShares <= 0) return 0;
    return Math.max(0, getCorporationNetAssetValue(corp)) / totalShares;
}

function getEntityCashFlow(entityId) {
    const flow = currentGame?.game_state?.turnCashFlow?.[entityId] || {};
    return {
        paid: Number(flow.paid || 0),
        received: Number(flow.received || 0),
        receivedBetweenTurns: Number(flow.receivedBetweenTurns || 0),
    };
}

function ownershipPercent(sharesOwned, totalShares) {
    const total = Number(totalShares || 0);
    if (!total) return '0.0';
    return ((Number(sharesOwned || 0) / total) * 100).toFixed(1);
}

function renderCorporationAssetSummary(corpId) {
    const corp = currentGame?.game_state?.corporations?.find(item => item.id === corpId);
    if (!corp || !Array.isArray(corp.assets) || corp.assets.length === 0) return '';
    const assets = corp.assets
        .map(asset => escapeHtml(asset.name))
        .join(', ');
    return `<span class="corp-assets-owned">Assets: ${assets}</span>`;
}

function getMyShares(corp) {
    const holder = (corp.shareholders || []).find(item => item.userId === currentUser.id);
    return holder ? Number(holder.shares || 0) : 0;
}

function getListedShares(corp) {
    return Math.max(0, Number(corp.availableShares || 0));
}

function getTreasuryListedShares(corp) {
    return Math.min(Math.max(0, Number(corp.treasuryShares || 0)), getListedShares(corp));
}

function getFounderListedShares(corp) {
    return Math.max(0, getListedShares(corp) - getTreasuryListedShares(corp));
}

function getBuyableListedShares(corp, userId) {
    if (corp.founderId === userId) return getTreasuryListedShares(corp);
    return getListedShares(corp);
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
    const endTurnLabel = Number(currentPlayer.cash || 0) < 0 || getBankruptcyClaimForPlayer(currentPlayer.userId) ? 'Declare Bankruptcy' : 'End Turn';
    const auctionOpen = gameState.auction?.status === 'open';
    const buyButton = landing.canBuy
        ? '<button class="btn btn-success btn-sm action-btn-buy" onclick="openBuyPropertyModal()">Buy Property</button>'
        : `<button class="btn btn-secondary btn-sm action-btn-buy" disabled title="${escapeHtml(landing.detail)}">${escapeHtml(buyUnavailableLabel(landing))}</button>`;
    return `
        <div class="action-buttons">
            ${!hasRolled ? '<button class="btn btn-primary" style="margin-bottom:8px;width:100%;" onclick="rollDiceAndMove()">🎲 Roll Dice</button>' : ''}
            <button class="btn btn-success action-btn-end-turn" onclick="endTurn()" ${!hasRolled || auctionOpen ? `disabled title="${auctionOpen ? 'Resolve auction before ending your turn' : 'Roll before ending your turn'}"` : ''}>${escapeHtml(auctionOpen ? 'Resolve Auction' : endTurnLabel)}</button>
            <div class="action-btn-secondary-group">
                ${auctionOpen ? '<button class="btn btn-secondary btn-sm action-btn-buy" disabled>Auction Open</button>' : buyButton}
                <button class="btn btn-secondary btn-sm" onclick="openIPOModal()" ${auctionOpen ? 'disabled' : ''}>Create IPO</button>
                <button class="btn btn-secondary btn-sm" onclick="openDebtModal()" ${auctionOpen ? 'disabled' : ''}>Manage Debt</button>
                <button class="btn btn-secondary btn-sm" onclick="openCorporationModal()">Corporations</button>
                ${isHost ? '<button class="btn btn-warning btn-sm" onclick="hostPauseGame()">Pause Game</button>' : ''}
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

function renderNonTurnActions() {
    const isHost = currentUser.id === currentRoom.host_id;
    return `
        <div class="action-buttons">
            <div class="action-btn-secondary-group">
                <button class="btn btn-secondary btn-sm" onclick="openCorporationModal()">Corporations</button>
                ${isHost ? '<button class="btn btn-warning btn-sm" onclick="hostPauseGame()">Pause Game</button>' : ''}
                ${isHost ? '<button class="btn btn-danger btn-sm" onclick="hostEndGame()">End Game</button>' : ''}
            </div>
        </div>
    `;
}

function renderPausedActions() {
    const isHost = currentUser.id === currentRoom.host_id;
    return `
        <div class="action-buttons paused-actions">
            <div class="action-btn-secondary-group">
                <button class="btn btn-secondary btn-sm" onclick="openCorporationModal()">Corporations</button>
                ${isHost ? '<button class="btn btn-success btn-sm" onclick="hostResumeGame()">Resume Game</button>' : ''}
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
            return `${data.founder} created IPO ${data.ticker} — ${data.founderShares || data.shares} founder-owned shares listed at $${Number(data.pricePerShare).toFixed(2)}/share`;
        case 'share_purchase': {
            const founderShares = Number(data.founderShares || 0);
            const treasuryShares = Number(data.treasuryShares || 0);
            const parts = [];
            if (founderShares > 0) parts.push(`${founderShares} from founder`);
            if (treasuryShares > 0) parts.push(`${treasuryShares} from treasury`);
            const source = parts.length ? ` (${parts.join(', ')})` : '';
            return `${data.buyer} bought ${data.shares} share(s) of ${data.ticker}${source} for $${Number(data.totalCost).toFixed(2)}`;
        }
        case 'chairman_changed':
            if (data.method === 'bankruptcy') return `${data.ticker} chairman changed to ${data.chairman} after bankruptcy`;
            return `${data.ticker} chairman changed to ${data.chairman} by ${data.method === 'vote' ? `${data.supportedShares} supporting shares` : 'majority control'}`;
        case 'chairman_vacated':
            return `${data.ticker} chairman seat is vacant after ${data.formerChairman}'s bankruptcy`;
        case 'chairman_vote_proposed':
            return `${data.ticker} chairman vote proposed for ${data.candidate}`;
        case 'chairman_vote_supported':
            return `${data.supporter} supported ${data.candidate} for ${data.ticker} chairman`;
        case 'debt_issued':
            return `${data.actor ? `${data.actor} issued` : `${data.issuer} issued`} debt${data.actor ? ` under ${data.issuer}` : ''} of $${Number(data.amount).toFixed(2)} at ${data.interestRate}% interest`;
        case 'debt_payment':
            return `${data.payer} paid $${Number(data.amount).toFixed(2)} towards their debt`;
        case 'interest_accrual':
            return `${data.player} was charged $${Number(data.interestCharged).toFixed(2)} in interest`;
        case 'corporation_insolvent': {
            const propertyCount = Array.isArray(data.releasedProperties) ? data.releasedProperties.length : 0;
            const sharePositions = Array.isArray(data.wipedSharePositions) ? data.wipedSharePositions.length : 0;
            const debtCount = Array.isArray(data.clearedDebts) ? data.clearedDebts.length : 0;
            return `${data.ticker} became insolvent; ${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'} returned to the Bank, ${sharePositions} shareholder position(s) wiped, ${debtCount} debt(s) cleared`;
        }
        case 'game_paused':
            return `${data.actor || 'Host'} paused the game${data.reason ? `: ${data.reason}` : ''}`;
        case 'game_resumed':
            return `${data.actor || 'Host'} resumed the game`;
        case 'forced_payment':
            if (Number(data.unpaidAmount || 0) > 0) {
                return `${data.from} owed $${Number(data.amountOwed || 0).toFixed(2)} to ${data.to}${data.reason ? ` for ${data.reason}` : ''}; paid $${Number(data.amount || 0).toFixed(2)}, $${Number(data.unpaidAmount || 0).toFixed(2)} unpaid`;
            }
            return `${data.from} paid $${Number(data.amount).toFixed(2)} to ${data.to}${data.reason ? ` for ${data.reason}` : ''}`;
        case 'tax_payment':
            return `${data.from} paid $${Number(data.amount).toFixed(2)} to ${data.to}${data.reason ? ` for ${data.reason}` : ''}`;
        case 'bankruptcy_claim_payment':
            return `${data.player} paid $${Number(data.amount).toFixed(2)} toward ${data.reason} owed to ${data.creditor}`;
        case 'bankruptcy_claim_settled':
            return `${data.player} settled ${data.reason} owed to ${data.creditor}`;
        case 'bankruptcy':
            return `${data.player} has gone BANKRUPT${data.creditor ? ` owing ${data.creditor}` : ''}`;
        case 'bankruptcy_liquidation': {
            const propertyCount = Array.isArray(data.releasedProperties) ? data.releasedProperties.length : 0;
            const shares = (data.returnedSharePositions || []).reduce((sum, item) => sum + Number(item.shares || 0), 0);
            const transferredShares = (data.transferredSharePositions || []).reduce((sum, item) => sum + Number(item.shares || 0), 0);
            const destination = data.assetDestinationName || 'the Bank';
            return `${data.player} liquidation: ${propertyCount} propert${propertyCount === 1 ? 'y' : 'ies'} to ${destination}, ${shares} share(s) returned, ${transferredShares} share(s) transferred`;
        }
        case 'turn_end':
            return `${data.player} ended their turn — it's now ${data.nextPlayer}'s turn`;
        case 'trade_offer_proposed':
            return `${data.proposer} proposed a trade with ${data.recipient}`;
        case 'trade_offer_accepted':
            return `${data.accepter} accepted ${data.proposer}'s trade offer`;
        case 'trade_offer_canceled':
            return `${data.actor} ${data.status === 'declined' ? 'declined' : 'canceled'} a trade offer`;
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
        case 'property_auction_started':
            return `${data.startedBy} started an auction for ${data.property}`;
        case 'property_auction_bid':
            return `${data.bidder} bid $${Number(data.amount).toFixed(2)} for ${data.property}`;
        case 'property_auction_passed':
            return `${data.player} passed on ${data.property}`;
        case 'property_auction_won':
            return `${data.winner} won ${data.property} at auction for $${Number(data.amount).toFixed(2)}${data.reason === 'timeout' ? ' after timeout' : ''}`;
        case 'property_auction_no_sale':
            return `Auction ended with no sale for ${data.property}${data.reason === 'timeout' ? ' after timeout' : ''}`;
        case 'property_auction_canceled':
            return `${data.actor} canceled the auction for ${data.property}`;
        case 'dice_roll':
            return `${data.player} rolled ${data.die1}+${data.die2}=${data.total} — moved to ${data.square}${data.isDoubles ? ' (doubles!)' : ''}`;
        case 'card_draw':
            return `${data.player} drew ${deckDisplayName(data.deckType)}: "${data.card}"${data.effect ? ` Applied: ${data.effect}.` : ''}`;
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
    document.getElementById('purchasePriceDisplay').textContent = `$${Number(property.price).toFixed(2)}`;
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
    document.getElementById('purchasePriceDisplay').textContent = `$${Number(property.price).toFixed(2)}`;
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

async function startAuctionFromPurchase() {
    try {
        await performGameAction('start_auction', {});
        closeModal('buyPropertyModal');
        selectedPropertyId = null;
    } catch (error) {
        console.error('Error starting auction:', error);
        alert(error.message || 'Failed to start auction');
    }
}

async function placeAuctionBid() {
    const input = document.getElementById('auctionBidAmount');
    const amount = parseFloat(input?.value);
    if (!amount || amount <= 0) {
        alert('Enter a bid amount greater than $0.');
        return;
    }

    try {
        await performGameAction('place_bid', { amount });
    } catch (error) {
        console.error('Error placing auction bid:', error);
        alert(error.message || 'Failed to place bid');
    }
}

async function passAuction() {
    try {
        await performGameAction('pass_auction', {});
    } catch (error) {
        console.error('Error passing auction:', error);
        alert(error.message || 'Failed to pass auction');
    }
}

async function hostCancelAuction() {
    if (!confirm('Cancel this auction? No property or cash will move.')) return;
    try {
        await performGameAction('host_cancel_auction', {});
    } catch (error) {
        console.error('Error canceling auction:', error);
        alert(error.message || 'Failed to cancel auction');
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
    document.getElementById('debtAction').value = 'issue';
    const rate = Number(currentGame.game_state.settings?.interestRate || 5);
    document.getElementById('loanRate').value = String(rate);
    document.getElementById('loanRateDisplay').textContent = `${rate}% per turn`;
    document.getElementById('debtIssuer').innerHTML = debtIssuerOptionsHtml();
    renderDebtCollateralOptions();
    toggleDebtForm();

    // Load existing debts
    const debtsHtml = currentPlayerData.debts.map((d, index) => `
        <option value="${index}">Loan #${index + 1}: $${d.principal.toFixed(2)} @ ${d.interestRate}%</option>
    `).join('');

    document.getElementById('debtToSettle').innerHTML = debtsHtml || '<option value="">No debts to settle</option>';

    document.getElementById('debtModal').style.display = 'flex';
}

function debtIssuerOptionsHtml() {
    const corporationOptions = getEligibleDebtCorporations().map(corp =>
        `<option value="corporation:${corp.id}">${escapeHtml(corp.ticker)} Corporation</option>`
    );
    return [
        '<option value="player">Personal</option>',
        ...corporationOptions,
    ].join('');
}

function getEligibleDebtCorporations() {
    const gameState = currentGame.game_state;
    return (gameState.corporations || []).filter(corp => canManageCorporationDebtUi(corp, currentUser.id));
}

function canManageCorporationDebtUi(corp, userId) {
    if (!corp || !userId) return false;
    return corp.chairmanId === userId || hasMajoritySharesUi(corp, userId);
}

function renderDebtCollateralOptions() {
    const issuer = document.getElementById('debtIssuer')?.value || 'player';
    let assets = currentPlayerData.properties || [];
    if (issuer.startsWith('corporation:')) {
        const corpId = issuer.split(':')[1];
        const corp = currentGame.game_state.corporations.find(item => item.id === corpId);
        assets = corp ? (corp.assets || []) : [];
    }

    const assetsHtml = assets.map(p => `
        <div class="asset-checkbox">
            <input type="checkbox" id="collateral-${p.id}" value="${p.id}">
            <label for="collateral-${p.id}">${escapeHtml(p.name)} ($${Number(p.value || p.price || 0).toFixed(2)})</label>
        </div>
    `).join('');

    document.getElementById('collateralAssets').innerHTML = assetsHtml || '<p class="empty-state">No collateral assets available</p>';
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
    const interestRate = Number(currentGame.game_state.settings?.interestRate || document.getElementById('loanRate').value || 5);
    const issuer = document.getElementById('debtIssuer').value || 'player';
    const issuerType = issuer.startsWith('corporation:') ? 'corporation' : 'player';
    const corpId = issuerType === 'corporation' ? issuer.split(':')[1] : null;

    const selectedCollateral = Array.from(document.querySelectorAll('#collateralAssets input:checked'))
        .map(cb => cb.value);

    if (!loanAmount) {
        alert('Please enter a loan amount');
        return;
    }

    try {
        await performGameAction('issue_debt', {
            amount: loanAmount,
            interestRate,
            issuerType,
            corpId,
            collateralIds: selectedCollateral,
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
        const shareholders = Array.isArray(corp.shareholders) ? corp.shareholders : [];
        const assets = Array.isArray(corp.assets) ? corp.assets : [];
        const debts = Array.isArray(corp.debts) ? corp.debts : [];
        const myShares = shareholders.find(s => s.userId === currentUser.id);
        const listedShares = getListedShares(corp);
        const treasuryListedShares = getTreasuryListedShares(corp);
        const founderListedShares = getFounderListedShares(corp);
        const isFounder = corp.founderId === currentUser.id;
        const isInsolvent = !!corp.insolvent || corp.status === 'insolvent';
        const buyableShares = getBuyableListedShares(corp, currentUser.id);
        const canBuy = isMyTurn && buyableShares > 0 && !isInsolvent;
        const governanceHtml = renderChairmanGovernance(corp);
        const pricePerShare = Number(corp.pricePerShare || 0);
        const netAssetValue = getCorporationNetAssetValue(corp);
        const shareValue = getCorporationShareValue(corp);
        const shareholderRows = shareholders.length
            ? shareholders.map(s => `<li>${escapeHtml(s.name)}: ${s.shares} shares (${ownershipPercent(s.shares, corp.totalShares)}%)</li>`).join('')
            : '<li>No active shareholders</li>';
        const debtRows = debts.length
            ? debts.map(d => `<li>$${Number(d.principal || 0).toFixed(2)} @ ${Number(d.interestRate || 0)}% (interest next turn: $${interestPayment(d).toFixed(2)})</li>`).join('')
            : '<li>No corporation debt</li>';
        const listingDetails = listedShares > 0
            ? `<p>Listed Shares: ${listedShares} (${founderListedShares} founder, ${treasuryListedShares} treasury)</p>`
            : '<p>Listed Shares: 0</p>';
        const buyLabel = isFounder ? 'Buy treasury shares' : 'Buy listed shares';

        return `
        <div class="corporation-card">
            <h3>${escapeHtml(corp.ticker)} - ${escapeHtml(corp.name)} ${isInsolvent ? '<span class="badge badge-danger">Insolvent</span>' : ''}</h3>
            <p>Founder: ${escapeHtml(corp.founderName)}</p>
            <p>Chairman: ${escapeHtml(isInsolvent ? 'Closed' : (corp.chairmanName || corp.founderName || 'Unassigned'))}</p>
            <p>Majority holder: ${escapeHtml(majorityHolderName(corp) || 'None')}</p>
            <p>Treasury Cash: $${Number(corp.cash || 0).toFixed(2)}</p>
            <p>Total Shares: ${corp.totalShares} | Asking: $${pricePerShare.toFixed(2)}/share | NAV: $${shareValue.toFixed(2)}/share</p>
            <p>Net Asset Value: $${netAssetValue.toFixed(2)}</p>
            ${listingDetails}
            ${isInsolvent ? '<p class="corp-status-warning">This corporation is closed after treasury insolvency. Properties returned to the Bank; shares, debt, and governance were wiped.</p>' : ''}
            <h4>Assets:</h4>
            <ul>
                ${assets.map(a => `<li>${escapeHtml(a.name)} ($${Number(a.value || 0).toFixed(2)})</li>`).join('') || '<li>No assets</li>'}
            </ul>
            <h4>Shareholders:</h4>
            <ul>
                ${shareholderRows}
            </ul>
            <h4>Debt:</h4>
            <ul>
                ${debtRows}
            </ul>
            ${governanceHtml}
            ${myShares ? `<p><strong>Your shares:</strong> ${myShares.shares}</p>` : ''}
            ${canBuy ? `
                <div class="buy-shares-form" style="margin-top: 10px; padding: 10px; background: #f0f4ff; border-radius: 6px;">
                    <label>${buyLabel} (max ${buyableShares}):</label>
                    <input type="number" id="buyShares-${corp.id}" min="1" max="${buyableShares}" value="1" style="width: 80px; margin: 0 8px;">
                    <button class="btn btn-primary" style="padding: 4px 12px; font-size: 0.9rem;" onclick="buyShares('${corp.id}')">Buy</button>
                </div>
            ` : ''}
        </div>
    `;
    }).join('');

    document.getElementById('corporationList').innerHTML = corporationsHtml || '<p>No corporations created yet</p>';
    document.getElementById('corporationModal').style.display = 'flex';
}

function renderChairmanGovernance(corp) {
    if (corp.insolvent || corp.status === 'insolvent') {
        return `
            <div class="chairman-governance">
                <h4>Chairman Governance</h4>
                <p class="empty-state">Governance closed after insolvency.</p>
            </div>
        `;
    }
    const myShares = sharesForUi(corp, currentUser.id);
    const candidates = chairmanCandidateOptions(corp);
    const voteOptions = candidates.map(player =>
        `<option value="${player.userId}">${escapeHtml(player.name)}</option>`
    ).join('');
    const required = majorityThresholdUi(corp);
    const openVotes = (corp.chairmanVotes || []).filter(vote => vote.status === 'open');
    const openVotesHtml = openVotes.length
        ? openVotes.map(vote => {
            const supportedShares = voteSupportSharesUi(corp, vote);
            const alreadySupported = (vote.supporters || []).some(supporter => supporter.userId === currentUser.id);
            const canSupport = myShares > 0 && !alreadySupported;
            return `
                <div class="chairman-vote-row">
                    <div>
                        <strong>${escapeHtml(vote.candidateName)}</strong>
                        <span>${supportedShares}/${corp.totalShares} shares supporting, ${required} needed</span>
                    </div>
                    ${canSupport ? `<button class="btn btn-primary btn-sm" onclick="supportChairmanVote('${corp.id}', '${vote.id}')">Support</button>` : ''}
                </div>
            `;
        }).join('')
        : '<p class="empty-state">No open chairman votes</p>';

    return `
        <div class="chairman-governance">
            <h4>Chairman Governance</h4>
            <p>Changing chairman requires ${required}/${corp.totalShares} shares.</p>
            ${hasMajoritySharesUi(corp, currentUser.id) ? `
                <div class="governance-control">
                    <label>Majority change:</label>
                    <select id="chairmanMajority-${corp.id}">${voteOptions}</select>
                    <button class="btn btn-primary btn-sm" onclick="changeChairmanByMajority('${corp.id}')">Change Chairman</button>
                </div>
            ` : ''}
            ${myShares > 0 ? `
                <div class="governance-control">
                    <label>Propose vote:</label>
                    <select id="chairmanVoteCandidate-${corp.id}">${voteOptions}</select>
                    <button class="btn btn-secondary btn-sm" onclick="proposeChairmanVote('${corp.id}')">Propose</button>
                </div>
            ` : ''}
            <div class="chairman-votes">
                ${openVotesHtml}
            </div>
        </div>
    `;
}

function chairmanCandidateOptions(corp) {
    const players = currentGame.game_state.players || [];
    return players.filter(player =>
        player.userId === corp.chairmanId ||
        player.userId === corp.founderId ||
        sharesForUi(corp, player.userId) > 0
    );
}

function majorityHolderName(corp) {
    const holder = (corp.shareholders || []).find(shareholder => hasMajoritySharesUi(corp, shareholder.userId));
    return holder ? holder.name : null;
}

function sharesForUi(corp, userId) {
    const holder = (corp.shareholders || []).find(shareholder => shareholder.userId === userId);
    return Number(holder?.shares || 0);
}

function hasMajoritySharesUi(corp, userId) {
    return sharesForUi(corp, userId) > Number(corp.totalShares || 0) / 2;
}

function majorityThresholdUi(corp) {
    return Math.floor(Number(corp.totalShares || 0) / 2) + 1;
}

function voteSupportSharesUi(corp, vote) {
    return (vote.supporters || []).reduce((sum, supporter) => sum + sharesForUi(corp, supporter.userId), 0);
}

async function changeChairmanByMajority(corpId) {
    const candidateUserId = document.getElementById(`chairmanMajority-${corpId}`).value;
    try {
        await performGameAction('change_chairman', { corpId, candidateUserId });
        await openCorporationModal();
    } catch (error) {
        console.error('Error changing chairman:', error);
        alert('Failed to change chairman');
    }
}

async function proposeChairmanVote(corpId) {
    const candidateUserId = document.getElementById(`chairmanVoteCandidate-${corpId}`).value;
    try {
        await performGameAction('propose_chairman_vote', { corpId, candidateUserId });
        await openCorporationModal();
    } catch (error) {
        console.error('Error proposing chairman vote:', error);
        alert('Failed to propose chairman vote');
    }
}

async function supportChairmanVote(corpId, voteId) {
    try {
        await performGameAction('support_chairman_vote', { corpId, voteId });
        await openCorporationModal();
    } catch (error) {
        console.error('Error supporting chairman vote:', error);
        alert('Failed to support chairman vote');
    }
}

async function buyShares(corpId) {
    const gameState = currentGame.game_state;
    const corp = gameState.corporations.find(c => c.id === corpId);
    if (!corp) return;
    if (corp.insolvent || corp.status === 'insolvent') {
        alert('This corporation is insolvent and cannot sell shares.');
        return;
    }

    const numShares = parseInt(document.getElementById(`buyShares-${corpId}`).value);
    const totalCost = numShares * Number(corp.pricePerShare || 0);
    const buyableShares = getBuyableListedShares(corp, currentUser.id);

    if (!numShares || numShares < 1 || numShares > buyableShares) {
        alert(`Enter a valid number of shares (1-${buyableShares})`);
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
        alert(error.message || 'Failed to buy shares');
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

async function hostPauseGame() {
    if (!confirm('Pause the game for everyone? Players will not be able to take normal actions until the host resumes.')) return;
    try {
        await performGameAction('host_pause_game', { reason: 'Host paused the game' });
        showToast('Game paused.');
    } catch (error) {
        console.error('Error pausing game:', error);
        showToast(error.message || 'Failed to pause game.');
    }
}

async function hostResumeGame() {
    if (!confirm('Resume the game for everyone?')) return;
    try {
        await performGameAction('host_resume_game', {});
        showToast('Game resumed.');
    } catch (error) {
        console.error('Error resuming game:', error);
        showToast(error.message || 'Failed to resume game.');
    }
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
        showLiquidationSummaryFromEvents(result.events || []);
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
    if (isHotseatMode) {
        sessionStorage.removeItem('hotseat_tokens');
        if (currentRoom && currentRoom.invite_code) clearHotseatResume(currentRoom.invite_code);
    }
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

function showLiquidationSummaryFromEvents(events) {
    const liquidationEvent = (events || []).find(event => event.type === 'bankruptcy_liquidation');
    if (!liquidationEvent) return;
    const bankruptcyEvent = (events || []).find(event => event.type === 'bankruptcy');
    const data = liquidationEvent.data || {};
    const destination = data.assetDestinationName || 'the Bank';
    const reason = data.reason || bankruptcyEvent?.data?.reason || 'bankruptcy';
    const propertyNames = (data.releasedProperties || []).map(item => item.name || item.id).filter(Boolean);
    const returnedShares = formatSharePositions(data.returnedSharePositions);
    const transferredShares = formatSharePositions(data.transferredSharePositions, true);

    const title = `${data.player || 'Player'} Bankruptcy Summary`;
    const summary = `${data.player || 'The player'} went bankrupt${data.creditor ? ` owing ${data.creditor}` : ''}. Direct properties were ${data.assetDestinationType === 'bank' ? 'returned to' : 'transferred to'} ${destination}.`;
    const rows = [
        ['Cause', reason],
        ['Properties', propertyNames.length ? `${propertyNames.join(', ')} to ${destination}; houses/hotels cleared` : 'No direct properties moved'],
        ['Shares', [returnedShares, transferredShares].filter(Boolean).join('; ') || 'No player-held shares moved'],
        ['Debts', 'Personal debts cleared'],
    ];

    document.getElementById('liquidationModalTitle').textContent = title;
    document.getElementById('liquidationModalSummary').textContent = summary;
    document.getElementById('liquidationModalDetails').innerHTML = rows.map(([label, value]) => `
        <div class="liquidation-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>
    `).join('');
    document.getElementById('liquidationModal').style.display = 'flex';
}

function formatSharePositions(positions, transferred = false) {
    if (!Array.isArray(positions) || positions.length === 0) return '';
    return positions.map(item => {
        const shares = Number(item.shares || 0);
        const ticker = item.ticker || 'corporation';
        if (transferred && item.to) return `${shares} ${ticker} share(s) to ${item.to}`;
        return `${shares} ${ticker} share(s) returned to availability`;
    }).join(', ');
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
    if (!player1Select || !player2Select || !paymentFromPlayer || !paymentToPlayer) return;

    const playersHtml = gameState.players.map(p =>
        `<option value="${escapeHtml(p.userId)}">${escapeHtml(p.name)}</option>`
    ).join('');

    const previous = {
        player1: player1Select.value,
        player2: player2Select.value,
        paymentFrom: paymentFromPlayer.value,
        paymentTo: paymentToPlayer.value,
    };
    const firstOtherId = getFirstOtherPlayerId(currentUser.id) || gameState.players[0]?.userId || '';

    player1Select.innerHTML = playersHtml;
    player2Select.innerHTML = playersHtml;
    paymentFromPlayer.innerHTML = playersHtml;
    paymentToPlayer.innerHTML = playersHtml;

    setSelectValue(player1Select, previous.player1 || currentUser.id, currentUser.id);
    setSelectValue(player2Select, previous.player2 || firstOtherId, firstOtherId || currentUser.id);
    setSelectValue(paymentFromPlayer, currentUser.id, currentUser.id);
    setSelectValue(paymentToPlayer, previous.paymentTo || firstOtherId, firstOtherId || currentUser.id);
    paymentFromPlayer.disabled = true;
    enforceDistinctPlayers(player1Select, player2Select);
    enforceDistinctPlayers(paymentFromPlayer, paymentToPlayer);

    if (!player1Select.dataset.assetsBound) {
        player1Select.addEventListener('change', () => {
            enforceDistinctPlayers(player1Select, player2Select);
            updatePlayerAssets('player1');
            updatePlayerAssets('player2');
            updateMarketActionState();
        });
        player1Select.dataset.assetsBound = 'true';
    }
    if (!player2Select.dataset.assetsBound) {
        player2Select.addEventListener('change', () => {
            enforceDistinctPlayers(player2Select, player1Select);
            updatePlayerAssets('player1');
            updatePlayerAssets('player2');
            updateMarketActionState();
        });
        player2Select.dataset.assetsBound = 'true';
    }
    if (!paymentToPlayer.dataset.paymentBound) {
        paymentToPlayer.addEventListener('change', () => {
            enforceDistinctPlayers(paymentFromPlayer, paymentToPlayer);
            updateMarketActionState();
        });
        paymentToPlayer.dataset.paymentBound = 'true';
    }
    ['player1Cash', 'player2Cash', 'paymentAmount'].forEach(id => {
        const input = document.getElementById(id);
        if (input && !input.dataset.marketBound) {
            input.addEventListener('input', updateMarketActionState);
            input.dataset.marketBound = 'true';
        }
    });

    updatePlayerAssets('player1');
    updatePlayerAssets('player2');
    renderTradeOffers();
    updateMarketActionState();
}

function setSelectValue(select, preferredValue, fallbackValue) {
    if (!select) return;
    const values = Array.from(select.options).map(option => option.value);
    if (values.includes(preferredValue)) {
        select.value = preferredValue;
    } else if (values.includes(fallbackValue)) {
        select.value = fallbackValue;
    } else if (select.options.length > 0) {
        select.selectedIndex = 0;
    }
}

function getFirstOtherPlayerId(userId) {
    return currentGame?.game_state?.players?.find(player => player.userId !== userId)?.userId || null;
}

function enforceDistinctPlayers(primarySelect, secondarySelect) {
    if (!primarySelect || !secondarySelect || primarySelect.value !== secondarySelect.value) return;
    const replacement = Array.from(secondarySelect.options).find(option => option.value !== primarySelect.value);
    if (replacement) secondarySelect.value = replacement.value;
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
            <input type="checkbox" id="${playerNumber}-asset-${p.id}" value="${p.id}" onchange="updateMarketActionState()">
            <label for="${playerNumber}-asset-${p.id}">${escapeHtml(p.name)} ($${p.value})</label>
        </div>
    `).join('');

    document.getElementById(assetsId).innerHTML = assetsHtml || '<p>No properties</p>';
}

function updateMarketActionState() {
    const tradeBtn = document.getElementById('executeTradeBtn');
    const paymentBtn = document.getElementById('makePaymentBtn');
    const player1Id = document.getElementById('player1Select')?.value;
    const player2Id = document.getElementById('player2Select')?.value;
    const fromPlayerId = document.getElementById('paymentFromPlayer')?.value;
    const toPlayerId = document.getElementById('paymentToPlayer')?.value;
    const player1Cash = parseFloat(document.getElementById('player1Cash')?.value) || 0;
    const player2Cash = parseFloat(document.getElementById('player2Cash')?.value) || 0;
    const paymentAmount = parseFloat(document.getElementById('paymentAmount')?.value) || 0;
    const player1Assets = document.querySelectorAll('#player1Assets input:checked').length;
    const player2Assets = document.querySelectorAll('#player2Assets input:checked').length;

    const tradeHasOffer = player1Cash > 0 || player2Cash > 0 || player1Assets > 0 || player2Assets > 0;
    const tradeValid = player1Id && player2Id && player1Id !== player2Id && [player1Id, player2Id].includes(currentUser.id) && tradeHasOffer;
    const paymentValid = fromPlayerId && toPlayerId && fromPlayerId !== toPlayerId && fromPlayerId === currentUser.id && paymentAmount > 0;

    if (tradeBtn) tradeBtn.disabled = !tradeValid;
    if (paymentBtn) paymentBtn.disabled = !paymentValid;
}

function showMarketStatus(message, type = 'info') {
    const el = document.getElementById('market-status');
    if (!el) {
        showToast(message);
        return;
    }
    el.textContent = message;
    el.className = `market-status ${type}`;
}

function renderTradeOffers() {
    const container = document.getElementById('tradeOffersList');
    if (!container || !currentGame) return;
    const offers = (currentGame.game_state.marketOffers || []).filter(offer => offer.status === 'pending');
    if (offers.length === 0) {
        container.innerHTML = '<p class="empty-state">No pending trade offers</p>';
        return;
    }

    container.innerHTML = offers.map(offer => {
        const participant = [offer.player1Id, offer.player2Id].includes(currentUser.id);
        const expired = isTradeOfferExpiredForDisplay(offer);
        const canAccept = !expired && participant && offer.proposedById !== currentUser.id;
        const canCancel = participant;
        const isHost = currentRoom && currentUser.id === currentRoom.host_id;
        const canHostCancel = isHost && !canCancel;
        const canClearExpired = expired && (participant || isHost);
        const hasActions = canAccept || canCancel || canHostCancel;
        return `
            <div class="trade-offer-card${expired ? ' trade-offer-expired' : ''}">
                <div class="trade-offer-header">
                    <strong>${escapeHtml(offer.proposedByName)} proposed a trade</strong>
                    <div class="trade-offer-meta">
                        <span>${escapeHtml(formatTradeOfferAge(offer.createdAt))}</span>
                        ${offer.expiresAt ? `<span>${escapeHtml(formatTradeOfferExpiry(offer.expiresAt))}</span>` : ''}
                    </div>
                </div>
                <div class="trade-offer-sides">
                    <div>
                        <h4>${escapeHtml(offer.player1Name)} gives</h4>
                        ${renderTradeOfferSide(offer.player1Cash, offer.player1AssetIds)}
                    </div>
                    <div>
                        <h4>${escapeHtml(offer.player2Name)} gives</h4>
                        ${renderTradeOfferSide(offer.player2Cash, offer.player2AssetIds)}
                    </div>
                </div>
                ${hasActions ? `
                    <div class="trade-offer-actions">
                        ${canAccept ? `<button class="btn btn-success btn-sm" onclick="acceptTradeOffer('${offer.id}')">Accept</button>` : ''}
                        ${canCancel ? `<button class="btn btn-secondary btn-sm" onclick="cancelTradeOffer('${offer.id}')">${expired ? 'Clear Expired' : (canAccept ? 'Decline' : 'Cancel')}</button>` : ''}
                        ${canHostCancel ? `<button class="btn btn-danger btn-sm" onclick="hostCancelTradeOffer('${offer.id}')">${expired ? 'Clear Expired' : 'Host Cancel'}</button>` : ''}
                    </div>
                ` : `<p class="empty-state">${canClearExpired ? 'Clear this expired offer from the involved player view.' : 'Waiting on the involved players'}</p>`}
            </div>
        `;
    }).join('');
}

function renderTradeOfferSide(cash, assetIds) {
    const assetNames = (assetIds || []).map(id => tradeAssetName(id));
    const lines = [];
    if (Number(cash || 0) > 0) lines.push(`$${Number(cash).toFixed(2)}`);
    lines.push(...assetNames);
    if (lines.length === 0) return '<p class="empty-state">Nothing</p>';
    return `<ul>${lines.map(line => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
}

function tradeAssetName(assetId) {
    const property = currentGame?.game_state?.properties?.find(prop => prop.id === assetId);
    return property ? property.name : assetId;
}

function formatTradeOfferAge(createdAt) {
    if (!createdAt) return 'pending';
    const date = new Date(createdAt);
    if (Number.isNaN(date.getTime())) return 'pending';
    return `sent ${formatTimeAgo(createdAt)}`;
}

function formatTradeOfferExpiry(expiresAt) {
    const expiry = new Date(expiresAt);
    if (Number.isNaN(expiry.getTime())) return '';
    const seconds = Math.max(Math.ceil((expiry.getTime() - Date.now()) / 1000), 0);
    if (seconds <= 0) return 'expired';
    if (seconds < 60) return `expires in ${seconds}s`;
    const minutes = Math.ceil(seconds / 60);
    return `expires in ${minutes}m`;
}

function isTradeOfferExpiredForDisplay(offer) {
    if (!offer?.expiresAt) return false;
    const expiry = new Date(offer.expiresAt);
    return !Number.isNaN(expiry.getTime()) && expiry.getTime() <= Date.now();
}

function actionEventsInclude(result, type) {
    return Array.isArray(result?.events) && result.events.some(event => event.type === type);
}

async function acceptTradeOffer(offerId) {
    try {
        const result = await performGameAction('accept_trade', { offerId });
        if (actionEventsInclude(result, 'trade_offer_expired')) {
            showMarketStatus('Trade offer expired before it could be accepted.', 'error');
        } else {
            showMarketStatus('Trade accepted and executed.', 'success');
        }
    } catch (error) {
        console.error('Error accepting trade offer:', error);
        showMarketStatus(error.message || 'Failed to accept trade offer.', 'error');
    }
}

async function cancelTradeOffer(offerId) {
    try {
        const result = await performGameAction('cancel_trade', { offerId });
        if (actionEventsInclude(result, 'trade_offer_expired')) {
            showMarketStatus('Trade offer expired and was cleared.', 'success');
        } else {
            showMarketStatus('Trade offer updated.', 'success');
        }
    } catch (error) {
        console.error('Error canceling trade offer:', error);
        showMarketStatus(error.message || 'Failed to update trade offer.', 'error');
    }
}

async function hostCancelTradeOffer(offerId) {
    if (!confirm('Cancel this trade offer as host? No cash or properties will move.')) return;
    try {
        const result = await performGameAction('host_cancel_trade_offer', { offerId });
        if (actionEventsInclude(result, 'trade_offer_expired')) {
            showMarketStatus('Trade offer expired and was cleared.', 'success');
        } else {
            showMarketStatus('Trade offer canceled by host.', 'success');
        }
    } catch (error) {
        console.error('Error host-canceling trade offer:', error);
        showMarketStatus(error.message || 'Failed to cancel trade offer.', 'error');
    }
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

    if (player1Id === player2Id) {
        showMarketStatus('Choose two different players for a trade.', 'error');
        return;
    }
    if (![player1Id, player2Id].includes(currentUser.id)) {
        showMarketStatus('Your trade must include you.', 'error');
        return;
    }
    if (player1Cash <= 0 && player2Cash <= 0 && player1Assets.length === 0 && player2Assets.length === 0) {
        showMarketStatus('Add cash or property before executing a trade.', 'error');
        return;
    }

    try {
        await performGameAction('propose_trade', {
            player1Id,
            player2Id,
            player1Cash,
            player2Cash,
            player1AssetIds: player1Assets,
            player2AssetIds: player2Assets,
        });
        showMarketStatus('Trade proposal sent. It will execute when the other player accepts.', 'success');

        // Reset form
        document.getElementById('player1Cash').value = 0;
        document.getElementById('player2Cash').value = 0;
        updatePlayerAssets('player1');
        updatePlayerAssets('player2');
        updateMarketActionState();

    } catch (error) {
        console.error('Error executing transaction:', error);
        showMarketStatus(error.message || 'Failed to execute transaction.', 'error');
    }
}

async function makePayment() {
    const fromPlayerId = document.getElementById('paymentFromPlayer').value;
    const toPlayerId = document.getElementById('paymentToPlayer').value;
    const amount = parseFloat(document.getElementById('paymentAmount').value);

    if (!amount || amount <= 0) {
        showMarketStatus('Enter a payment amount greater than $0.', 'error');
        return;
    }
    if (fromPlayerId === toPlayerId) {
        showMarketStatus('Choose a different recipient.', 'error');
        return;
    }
    if (fromPlayerId !== currentUser.id) {
        showMarketStatus('Payments must be sent from your player.', 'error');
        return;
    }

    try {
        await performGameAction('manual_payment', { fromPlayerId, toPlayerId, amount });
        showMarketStatus('Payment completed successfully.', 'success');
        document.getElementById('paymentAmount').value = '';
        updateMarketActionState();

    } catch (error) {
        console.error('Error making payment:', error);
        showMarketStatus(error.message || 'Failed to make payment.', 'error');
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
