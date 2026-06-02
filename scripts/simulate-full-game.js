#!/usr/bin/env node
'use strict';

const DEFAULT_API_BASE = 'http://127.0.0.1:3111/api';

const args = parseArgs(process.argv.slice(2));
const apiBase = (args.apiBase || process.env.GAME_SIM_API_BASE || DEFAULT_API_BASE).replace(/\/$/, '');
const allowProduction = args.allowProduction || process.env.GAME_SIM_ALLOW_PRODUCTION === '1';
const strict = args.strict || process.env.GAME_SIM_STRICT === '1';

const PRODUCTION_MARKERS = [
    'mortgage.abdlh.com',
    '127.0.0.1:3010',
    'localhost:3010',
    ':3010/api',
];

if (!allowProduction && PRODUCTION_MARKERS.some(marker => apiBase.includes(marker))) {
    console.error(`Refusing to run gameplay simulator against production-looking API: ${apiBase}`);
    console.error('Use a dev backend, for example: PORT=3111 DB_PATH=/mnt/ssd/dev-data/mortgage-backed/gameplay-sim.db npm --prefix backend run start');
    console.error('Override only if you really mean it with --allow-production.');
    process.exit(2);
}

const MONOPOLY_PROPERTIES = [
    { name: 'Mediterranean Avenue', color: 'Brown', price: 60, rent: [2, 10, 30, 90, 160, 250] },
    { name: 'Baltic Avenue', color: 'Brown', price: 60, rent: [4, 20, 60, 180, 320, 450] },
    { name: 'Oriental Avenue', color: 'Light Blue', price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { name: 'Vermont Avenue', color: 'Light Blue', price: 100, rent: [6, 30, 90, 270, 400, 550] },
    { name: 'Connecticut Avenue', color: 'Light Blue', price: 120, rent: [8, 40, 100, 300, 450, 600] },
    { name: 'St. Charles Place', color: 'Pink', price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { name: 'Electric Company', color: 'Utility', price: 150, rent: [4, 10] },
    { name: 'States Avenue', color: 'Pink', price: 140, rent: [10, 50, 150, 450, 625, 750] },
    { name: 'Virginia Avenue', color: 'Pink', price: 160, rent: [12, 60, 180, 500, 700, 900] },
    { name: 'Reading Railroad', color: 'Railroad', price: 200, rent: [25, 50, 100, 200] },
    { name: 'St. James Place', color: 'Orange', price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { name: 'Tennessee Avenue', color: 'Orange', price: 180, rent: [14, 70, 200, 550, 750, 950] },
    { name: 'New York Avenue', color: 'Orange', price: 200, rent: [16, 80, 220, 600, 800, 1000] },
    { name: 'Kentucky Avenue', color: 'Red', price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { name: 'Indiana Avenue', color: 'Red', price: 220, rent: [18, 90, 250, 700, 875, 1050] },
    { name: 'Illinois Avenue', color: 'Red', price: 240, rent: [20, 100, 300, 750, 925, 1100] },
    { name: 'Pennsylvania Railroad', color: 'Railroad', price: 200, rent: [25, 50, 100, 200] },
    { name: 'Atlantic Avenue', color: 'Yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { name: 'Ventnor Avenue', color: 'Yellow', price: 260, rent: [22, 110, 330, 800, 975, 1150] },
    { name: 'Water Works', color: 'Utility', price: 150, rent: [4, 10] },
    { name: 'Marvin Gardens', color: 'Yellow', price: 280, rent: [24, 120, 360, 850, 1025, 1200] },
    { name: 'Pacific Avenue', color: 'Green', price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { name: 'North Carolina Avenue', color: 'Green', price: 300, rent: [26, 130, 390, 900, 1100, 1275] },
    { name: 'Pennsylvania Avenue', color: 'Green', price: 320, rent: [28, 150, 450, 1000, 1200, 1400] },
    { name: 'Short Line', color: 'Railroad', price: 200, rent: [25, 50, 100, 200] },
    { name: 'Park Place', color: 'Dark Blue', price: 350, rent: [35, 175, 500, 1100, 1300, 1500] },
    { name: 'Boardwalk', color: 'Dark Blue', price: 400, rent: [50, 200, 600, 1400, 1700, 2000] },
    { name: 'B. & O. Railroad', color: 'Railroad', price: 200, rent: [25, 50, 100, 200] },
];

const HOUSE_COSTS = {
    Brown: 50,
    'Light Blue': 50,
    Pink: 100,
    Orange: 100,
    Red: 150,
    Yellow: 150,
    Green: 200,
    'Dark Blue': 200,
};

const CHANCE_CARDS = [
    { id: 'sim-ch-1', text: 'Advance to GO. Collect $200.', action: { type: 'advance_to', position: 0 } },
    { id: 'sim-ch-2', text: 'Bank pays you a dividend of $50.', action: { type: 'collect', amount: 50 } },
    { id: 'sim-ch-3', text: 'Go to Jail. Do not pass GO.', action: { type: 'go_to_jail' } },
];

const COMMUNITY_CHEST_CARDS = [
    { id: 'sim-cc-1', text: 'Doctor fee. Pay $50.', action: { type: 'pay', amount: 50 } },
    { id: 'sim-cc-2', text: 'Holiday fund matures. Collect $100.', action: { type: 'collect', amount: 100 } },
    { id: 'sim-cc-3', text: 'Grand Opera Night. Collect $50 from every other player.', action: { type: 'collect_from_each', amount: 50 } },
];

const report = [];
let context = null;

main().catch(err => {
    fail('simulator crashed', err.message);
    printReport();
    process.exit(1);
});

async function main() {
    note(`Gameplay simulator using ${apiBase}`);
    await assertApiHealth();

    context = await createFourPlayerGame();
    await assertRoomBasics(context.room);
    await assertGameCanBeFetched();

    await expectNonHostCannotStartAnotherGame();
    await expectDuplicateGameStartHandled();
    await expectOutsiderCannotPatchGame();
    await expectInvalidRoomStatusRejected();
    await expectStaleStateRejected();
    await expectWrongTurnActionRejected();
    await expectMarketActionMustInvolveActor();

    await step('Host buys Mediterranean Avenue', () =>
        buyProperty('Alice', 'prop-0', 60, { position: 1 }));
    await step('Host buys Baltic Avenue', () =>
        buyProperty('Alice', 'prop-1', 60, { position: 3 }));
    await step('Build houses on a complete color group', () =>
        buyHouses('Alice', { 'prop-0': 2, 'prop-1': 2 }));
    await step('Bob pays rent to Alice', () =>
        payRent('Bob', 'Alice', 'prop-0', 30));
    await step('Carol buys Reading Railroad', () =>
        buyProperty('Carol', 'prop-9', 200, { position: 5 }));
    await step('Dave pays railroad rent to Carol', () =>
        payRent('Dave', 'Carol', 'prop-9', 25));
    await step('Bob buys Electric Company', () =>
        buyProperty('Bob', 'prop-6', 150, { position: 12 }));
    await step('Carol pays utility rent to Bob', () =>
        payRent('Carol', 'Bob', 'prop-6', 28));
    await step('Alice passes GO and collects salary', () =>
        passGo('Alice', 200, { from: 39, to: 4 }));
    await step('Dave pays income tax', () =>
        payBank('Dave', 200, 'Income Tax'));
    await step('Bob issues collateralized debt', () =>
        issueDebt('Bob', 300, 7, ['prop-6']));
    await step('Bob settles part of the debt', () =>
        settleDebt('Bob', 125));
    await step('Alice creates IPO backed by Brown group', () =>
        createIPO('Alice', 'BROWN', ['prop-0', 'prop-1'], 8, 100));
    await step('Carol buys shares in BROWN', () =>
        buyShares('Carol', 'BROWN', 2));
    await step('Dave and Bob execute a property/cash trade', () =>
        trade({
            fromA: 'Dave',
            fromB: 'Bob',
            cashA: 100,
            cashB: 0,
            propsA: [],
            propsB: ['prop-6'],
        }));
    await step('Carol draws a collect card', () =>
        applyCard('Carol', CHANCE_CARDS[1]));
    await step('Dave draws a pay card', () =>
        applyCard('Dave', COMMUNITY_CHEST_CARDS[0]));
    await step('Bob goes to jail by card', () =>
        applyCard('Bob', CHANCE_CARDS[2]));
    await step('Turn order skips a bankrupt player', () =>
        markBankruptAndAdvance('Dave'));
    await step('Host ends the game', () =>
        completeGame('Host ended gameplay simulation'));

    await fetchAndValidateFinalState();
    printReport();

    const failures = report.filter(entry => entry.level === 'FAIL');
    process.exitCode = failures.length && strict ? 1 : 0;
}

async function createFourPlayerGame() {
    const players = [];
    for (const name of ['Alice', 'Bob', 'Carol', 'Dave']) {
        const auth = await api('/auth/anonymous', { method: 'POST' });
        players.push({ name, token: auth.token, userId: auth.user.id });
    }

    const room = await api('/rooms', {
        method: 'POST',
        token: players[0].token,
        body: {
            name: `Gameplay Sim ${new Date().toISOString()}`,
            player_name: players[0].name,
            max_players: 4,
        },
    });

    for (const player of players.slice(1)) {
        await api(`/rooms/${room.id}/join`, {
            method: 'POST',
            token: player.token,
            body: { player_name: player.name },
        });
    }

    const joinedRoom = await api(`/rooms/${room.id}`);
    const gameState = buildInitialGameState(joinedRoom.room_members);
    const game = await api('/games', {
        method: 'POST',
        token: players[0].token,
        body: { room_id: room.id, game_state: gameState },
    });

    await api(`/rooms/${room.id}/status`, {
        method: 'PATCH',
        token: players[0].token,
        body: { status: 'in_progress' },
    });

    await logEvent(game.id, players[0].token, 'game_started', {
        player_count: players.length,
        players: players.map(p => p.name),
    });

    const outsider = await api('/auth/anonymous', { method: 'POST' });
    return {
        room: joinedRoom,
        game,
        players,
        outsider: { token: outsider.token, userId: outsider.user.id, name: 'Mallory' },
    };
}

function buildInitialGameState(members) {
    return {
        players: members.map(member => ({
            userId: member.user_id,
            name: member.player_name,
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
        settings: { interestRate: 5, passGoAmount: 200 },
        chanceCards: shuffleDeck(CHANCE_CARDS),
        communityChestCards: shuffleDeck(COMMUNITY_CHEST_CARDS),
        lastDiceRoll: null,
        lastCardDrawn: null,
    };
}

async function assertApiHealth() {
    const health = await api('/health');
    check(health.ok === true, 'API health endpoint returned ok');
}

async function assertRoomBasics(room) {
    check(room.room_members.length === 4, 'room has all four simulated players');
    check(room.max_players === 4, 'room max_players is 4');
    check(/^[A-Z0-9]{6}$/.test(room.invite_code), 'invite code looks valid');
}

async function assertGameCanBeFetched() {
    const fetched = await api(`/games/by-room/${context.room.id}`);
    check(fetched.id === context.game.id, 'game can be fetched by room id');
    check(fetched.game_state.players.length === 4, 'game state has four players');
}

async function expectNonHostCannotStartAnotherGame() {
    const res = await rawApi('/games', {
        method: 'POST',
        token: context.players[1].token,
        body: { room_id: context.room.id, game_state: context.game.game_state },
    });
    check(res.status === 403, 'non-host cannot create a game for the room', res);
}

async function expectDuplicateGameStartHandled() {
    const res = await rawApi('/games', {
        method: 'POST',
        token: context.players[0].token,
        body: { room_id: context.room.id, game_state: context.game.game_state },
    });
    check(res.status !== 500, 'duplicate game start is handled without a server 500', res);
}

async function expectOutsiderCannotPatchGame() {
    const tampered = clone(context.game.game_state);
    tampered.currentPlayerIndex = 2;
    tampered.gameLog.push({ timestamp: new Date().toISOString(), message: 'outsider tried to change turn' });
    const res = await rawApi(`/games/${context.game.id}/state`, {
        method: 'PATCH',
        token: context.outsider.token,
        body: {
            game_state: tampered,
            action_type: 'turn_end',
            expected_version: context.game.state_version,
        },
    });
    check(res.status === 401 || res.status === 403, 'outsider cannot patch game state', res);

    if (res.status >= 200 && res.status < 300) {
        context.game = await api(`/games/${context.game.id}`);
        await patchGameState(buildInitialGameState(context.room.room_members), 'host_state_repair');
    }
}

async function expectInvalidRoomStatusRejected() {
    const res = await rawApi(`/rooms/${context.room.id}/status`, {
        method: 'PATCH',
        token: context.players[0].token,
        body: { status: 'banana' },
    });
    check(res.status === 400, 'invalid room status is rejected', res);

    if (res.status >= 200 && res.status < 300) {
        await api(`/rooms/${context.room.id}/status`, {
            method: 'PATCH',
            token: context.players[0].token,
            body: { status: 'in_progress' },
        });
    }
}

async function expectStaleStateRejected() {
    const staleVersion = context.game.state_version;
    const gs = clone(context.game.game_state);
    gs.gameLog.push({ timestamp: new Date().toISOString(), message: 'valid version bump' });
    await patchGameState(gs, 'transaction');

    const staleGs = clone(context.game.game_state);
    staleGs.gameLog.push({ timestamp: new Date().toISOString(), message: 'stale write' });
    const res = await rawApi(`/games/${context.game.id}/state`, {
        method: 'PATCH',
        token: context.players[0].token,
        body: { game_state: staleGs, action_type: 'transaction', expected_version: staleVersion },
    });
    check(res.status === 409, 'stale game state patch is rejected', res);
}

async function expectWrongTurnActionRejected() {
    const gs = clone(context.game.game_state);
    gs.currentPlayerIndex = 1;
    const res = await rawApi(`/games/${context.game.id}/state`, {
        method: 'PATCH',
        token: context.players[1].token,
        body: { game_state: gs, action_type: 'turn_end', expected_version: context.game.state_version },
    });
    check(res.status === 403, 'non-current player cannot submit turn action', res);
}

async function expectMarketActionMustInvolveActor() {
    const gs = clone(context.game.game_state);
    const bob = playerByName(gs, 'Bob');
    const carol = playerByName(gs, 'Carol');
    bob.cash -= 10;
    carol.cash += 10;

    const res = await rawApi(`/games/${context.game.id}/state`, {
        method: 'PATCH',
        token: tokenFor('Alice'),
        body: { game_state: gs, action_type: 'transaction', expected_version: context.game.state_version },
    });
    check(res.status === 403, 'market action cannot mutate uninvolved players only', res);
}

async function buyProperty(playerName, propId, price, opts = {}) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const player = playerByName(gs, playerName);
    const prop = propertyById(gs, propId);
    if (opts.position !== undefined) player.position = opts.position;
    invariant(!prop.ownerId, `${prop.name} should be unowned before purchase`);
    invariant(player.cash >= price, `${playerName} has enough cash to buy ${prop.name}`);

    player.cash -= price;
    player.properties.push({ id: prop.id, name: prop.name, color: prop.color, value: price });
    prop.ownerId = player.userId;
    prop.ownerName = player.name;
    pushLog(gs, `${player.name} purchased ${prop.name} for $${price}`);

    await saveStateAndEvent(gs, tokenFor(player.name), 'property_purchase', {
        buyer: player.name,
        property: prop.name,
        price,
    });

    const saved = await refreshGame();
    const savedPlayer = playerByName(saved.game_state, playerName);
    const savedProp = propertyById(saved.game_state, propId);
    check(savedPlayer.cash === player.cash, `${playerName} cash persisted after buying ${prop.name}`);
    check(savedProp.ownerId === savedPlayer.userId, `${prop.name} owner persisted`);
}

async function buyHouses(playerName, deltas) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const player = playerByName(gs, playerName);
    let totalCost = 0;
    for (const [propId, delta] of Object.entries(deltas)) {
        const prop = propertyById(gs, propId);
        invariant(prop.ownerId === player.userId, `${playerName} owns ${prop.name}`);
        invariant(prop.houses + delta <= 5, `${prop.name} does not exceed hotel limit`);
        const cost = delta * (HOUSE_COSTS[prop.color] || 0);
        totalCost += cost;
        prop.houses += delta;
        const playerProp = player.properties.find(p => p.id === propId);
        if (playerProp) playerProp.value = prop.price + prop.houses * (HOUSE_COSTS[prop.color] || 0);
    }
    invariant(player.cash >= totalCost, `${playerName} has cash for houses`);
    player.cash -= totalCost;
    pushLog(gs, `${player.name} bought houses/hotels for $${totalCost}`);
    await saveStateAndEvent(gs, tokenFor(player.name), 'house_purchase', { player: player.name, cost: totalCost });
}

async function payRent(fromName, toName, propId, amount) {
    await ensureTurn(fromName);
    const gs = clone(context.game.game_state);
    const from = playerByName(gs, fromName);
    const to = playerByName(gs, toName);
    const prop = propertyById(gs, propId);
    invariant(prop.ownerId === to.userId, `${toName} owns rent property ${prop.name}`);
    from.cash -= amount;
    to.cash += amount;
    pushLog(gs, `${from.name} paid $${amount} rent to ${to.name}`);
    await saveStateAndEvent(gs, tokenFor(from.name), 'forced_payment', { from: from.name, to: to.name, amount });
}

async function payBank(playerName, amount, reason) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const player = playerByName(gs, playerName);
    player.cash -= amount;
    pushLog(gs, `${player.name} paid $${amount} to the Bank for ${reason}`);
    await saveStateAndEvent(gs, tokenFor(player.name), 'tax_payment', { from: player.name, to: 'the Bank', amount, reason });
}

async function passGo(playerName, amount, movement) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const player = playerByName(gs, playerName);
    player.position = movement.to;
    player.cash += amount;
    pushLog(gs, `${player.name} passed GO and collected $${amount}`);
    await saveStateAndEvent(gs, tokenFor(player.name), 'pass_go', { player: player.name, amount, from: movement.from, to: movement.to });
}

async function issueDebt(playerName, amount, interestRate, collateralIds) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const player = playerByName(gs, playerName);
    const collateral = collateralIds.map(id => {
        const prop = propertyById(gs, id);
        invariant(prop.ownerId === player.userId, `${playerName} owns collateral ${prop.name}`);
        return { id: prop.id, name: prop.name, value: prop.price };
    });
    player.cash += amount;
    player.debts.push({
        id: `sim-debt-${Date.now()}`,
        principal: amount,
        interestRate,
        collateral,
        issueDate: new Date().toISOString(),
    });
    pushLog(gs, `${player.name} issued debt: $${amount} at ${interestRate}%`);
    await saveStateAndEvent(gs, tokenFor(player.name), 'debt_issued', { issuer: player.name, amount, interestRate });
}

async function settleDebt(playerName, amount) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const player = playerByName(gs, playerName);
    invariant(player.debts.length > 0, `${playerName} has debt to settle`);
    invariant(player.cash >= amount, `${playerName} has cash to settle debt`);
    player.cash -= amount;
    player.debts[0].principal -= amount;
    if (player.debts[0].principal <= 0) player.debts.shift();
    pushLog(gs, `${player.name} paid $${amount} toward debt`);
    await saveStateAndEvent(gs, tokenFor(player.name), 'debt_payment', { payer: player.name, amount });
}

async function createIPO(playerName, ticker, propIds, shares, pricePerShare) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const founder = playerByName(gs, playerName);
    const assets = propIds.map(propId => {
        const prop = propertyById(gs, propId);
        invariant(prop.ownerId === founder.userId, `${playerName} owns IPO asset ${prop.name}`);
        return { id: prop.id, name: prop.name, color: prop.color, value: prop.price };
    });
    const corporation = {
        id: `corp-${ticker.toLowerCase()}-${Date.now()}`,
        ticker,
        name: `${ticker} Corporation`,
        founderId: founder.userId,
        founderName: founder.name,
        totalShares: shares,
        pricePerShare,
        assets,
        shareholders: [],
        founderShares: shares,
        availableShares: shares,
        founderHoldings: [{ userId: founder.userId, name: founder.name, shares }],
    };
    gs.corporations.push(corporation);
    for (const asset of assets) {
        founder.properties = founder.properties.filter(p => p.id !== asset.id);
        const prop = propertyById(gs, asset.id);
        prop.ownerId = corporation.id;
        prop.ownerName = `[${ticker}]`;
    }
    founder.corporations.push({ ticker, sharesOwned: 0, totalShares: shares, pricePerShare });
    pushLog(gs, `${founder.name} created ${ticker} IPO`);
    await saveStateAndEvent(gs, tokenFor(founder.name), 'ipo_created', { founder: founder.name, ticker, shares, pricePerShare });
}

async function buyShares(playerName, ticker, shares) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const buyer = playerByName(gs, playerName);
    const corp = gs.corporations.find(c => c.ticker === ticker);
    invariant(corp, `${ticker} corporation exists`);
    const founder = gs.players.find(p => p.userId === corp.founderId);
    const cost = shares * corp.pricePerShare;
    invariant(buyer.cash >= cost, `${playerName} has cash to buy ${ticker}`);

    buyer.cash -= cost;
    if (founder) founder.cash += cost;
    const existing = corp.shareholders.find(s => s.userId === buyer.userId);
    if (existing) existing.shares += shares;
    else corp.shareholders.push({ userId: buyer.userId, name: buyer.name, shares });
    corp.availableShares = Math.max(0, (typeof corp.availableShares === 'number' ? corp.availableShares : corp.totalShares) - shares);

    const buyerCorp = buyer.corporations.find(c => c.ticker === ticker);
    if (buyerCorp) buyerCorp.sharesOwned += shares;
    else buyer.corporations.push({ ticker, sharesOwned: shares, totalShares: corp.totalShares, pricePerShare: corp.pricePerShare });

    pushLog(gs, `${buyer.name} bought ${shares} shares of ${ticker}`);
    await saveStateAndEvent(gs, tokenFor(buyer.name), 'share_purchase', { buyer: buyer.name, ticker, shares, totalCost: cost });
}

async function trade({ fromA, fromB, cashA, cashB, propsA, propsB }) {
    const gs = clone(context.game.game_state);
    const a = playerByName(gs, fromA);
    const b = playerByName(gs, fromB);
    invariant(a.cash >= cashA, `${fromA} has trade cash`);
    invariant(b.cash >= cashB, `${fromB} has trade cash`);

    a.cash = a.cash - cashA + cashB;
    b.cash = b.cash - cashB + cashA;
    moveProperties(gs, a, b, propsA);
    moveProperties(gs, b, a, propsB);
    pushLog(gs, `${a.name} and ${b.name} executed a trade`);
    await saveStateAndEvent(gs, tokenFor(a.name), 'transaction', {
        player1: a.name,
        player2: b.name,
        player1Cash: cashA,
        player2Cash: cashB,
        player1Assets: propsA.length,
        player2Assets: propsB.length,
    });
}

async function applyCard(playerName, card) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const player = playerByName(gs, playerName);
    const activePlayerIndex = gs.players.indexOf(player);
    applyCardEffect(card, gs, activePlayerIndex);
    gs.lastCardDrawn = card;
    pushLog(gs, `${player.name} drew ${card.text}`);
    await saveStateAndEvent(gs, tokenFor(player.name), 'card_draw', { player: player.name, card: card.text });
}

async function markBankruptAndAdvance(playerName) {
    await ensureTurn(playerName);
    const gs = clone(context.game.game_state);
    const player = playerByName(gs, playerName);
    player.cash = -50;
    player.bankrupt = true;
    gs.currentPlayerIndex = gs.players.findIndex(p => p.name === playerName);
    let nextIndex = (gs.currentPlayerIndex + 1) % gs.players.length;
    let attempts = 0;
    while (gs.players[nextIndex].bankrupt && attempts < gs.players.length) {
        nextIndex = (nextIndex + 1) % gs.players.length;
        attempts++;
    }
    gs.currentPlayerIndex = nextIndex;
    pushLog(gs, `${player.name} went bankrupt; turn advanced to ${gs.players[nextIndex].name}`);
    await saveStateAndEvent(gs, tokenFor(player.name), 'bankruptcy', { player: player.name });
    check(!context.game.game_state.players[context.game.game_state.currentPlayerIndex].bankrupt, 'current turn is held by a non-bankrupt player');
}

async function completeGame(reason) {
    const gs = clone(context.game.game_state);
    const standings = gs.players.map(player => {
        const propertyValue = player.properties.reduce((sum, prop) => sum + (prop.value || 0), 0);
        const corpValue = player.corporations.reduce((sum, corp) => sum + corp.sharesOwned * (corp.pricePerShare || 0), 0);
        const debtTotal = player.debts.reduce((sum, debt) => sum + debt.principal, 0);
        return {
            name: player.name,
            cash: player.cash,
            propertyValue,
            corpValue,
            debtTotal,
            netWorth: player.cash + propertyValue + corpValue - debtTotal,
            bankrupt: player.bankrupt,
        };
    }).sort((a, b) => b.netWorth - a.netWorth);

    await api(`/rooms/${context.room.id}/status`, {
        method: 'PATCH',
        token: context.players[0].token,
        body: { status: 'completed' },
    });
    await logEvent(context.game.id, context.players[0].token, 'game_ended', { reason, standings });
    note(`simulated winner: ${standings[0].name} with net worth $${standings[0].netWorth.toFixed(2)}`);
}

async function ensureTurn(playerName) {
    const current = context.game.game_state.players[context.game.game_state.currentPlayerIndex];
    if (current && current.name === playerName) return;

    const gs = clone(context.game.game_state);
    const nextIndex = gs.players.findIndex(player => player.name === playerName);
    invariant(nextIndex !== -1, `can set turn for ${playerName}`);
    gs.currentPlayerIndex = nextIndex;
    await patchGameState(gs, 'host_state_repair', context.players[0].token);
}

async function saveStateAndEvent(gs, token, eventType, eventData) {
    validateState(gs);
    await patchGameState(gs, eventType, token);
    const loggedEventType = eventType === 'manual_payment' || eventType === 'forced_payment' || eventType === 'tax_payment'
        ? 'payment'
        : eventType;
    await logEvent(context.game.id, token, loggedEventType, eventData);
    await refreshGame();
}

async function patchGameState(gameState, actionType, token = context.players[0].token) {
    const updatedGame = await api(`/games/${context.game.id}/state`, {
        method: 'PATCH',
        token,
        body: {
            game_state: gameState,
            action_type: actionType,
            expected_version: context.game.state_version,
        },
    });
    context.game = updatedGame;
    note(`saved state: ${actionType}`);
}

async function logEvent(gameId, token, eventType, eventData) {
    await api(`/games/${gameId}/events`, {
        method: 'POST',
        token,
        body: { event_type: eventType, event_data: eventData },
    });
}

async function refreshGame() {
    context.game = await api(`/games/${context.game.id}`);
    validateState(context.game.game_state);
    return context.game;
}

async function fetchAndValidateFinalState() {
    const room = await api(`/rooms/${context.room.id}`);
    const game = await refreshGame();
    const events = await api(`/games/${context.game.id}/events`);

    check(room.status === 'completed', 'room ended as completed');
    check(events.length >= 15, 'event log contains many gameplay events');
    check(game.game_state.players.some(player => player.bankrupt), 'final game has at least one bankrupt player');
    check(game.game_state.corporations.length >= 1, 'final game has at least one corporation');
    check(game.game_state.players.some(player => player.debts.length > 0), 'final game keeps outstanding debt state');
}

function validateState(gs) {
    invariant(Array.isArray(gs.players) && gs.players.length >= 2, 'game has at least two players');
    invariant(Number.isInteger(gs.currentPlayerIndex), 'currentPlayerIndex is an integer');
    invariant(gs.currentPlayerIndex >= 0 && gs.currentPlayerIndex < gs.players.length, 'currentPlayerIndex is in range');

    const playerIds = new Set();
    for (const player of gs.players) {
        invariant(player.userId, `player ${player.name} has a userId`);
        invariant(!playerIds.has(player.userId), `player ${player.name} has a unique userId`);
        playerIds.add(player.userId);
        invariant(Number.isFinite(player.cash), `${player.name} has finite cash`);
        invariant(Array.isArray(player.properties), `${player.name} properties is an array`);
        invariant(Array.isArray(player.corporations), `${player.name} corporations is an array`);
        invariant(Array.isArray(player.debts), `${player.name} debts is an array`);
    }

    const propertyOwners = new Map();
    for (const prop of gs.properties) {
        invariant(prop.id, `property ${prop.name} has id`);
        invariant(!propertyOwners.has(prop.id), `property ${prop.id} appears once in master list`);
        propertyOwners.set(prop.id, prop.ownerId);
        invariant(Number.isFinite(prop.price), `${prop.name} has finite price`);
        invariant(Number.isInteger(prop.houses) && prop.houses >= 0 && prop.houses <= 5, `${prop.name} house count is 0-5`);
    }

    const playerPropIds = new Set();
    for (const player of gs.players) {
        for (const prop of player.properties) {
            invariant(!playerPropIds.has(prop.id), `${prop.name} is not duplicated across player portfolios`);
            playerPropIds.add(prop.id);
            invariant(propertyOwners.get(prop.id) === player.userId, `${prop.name} master owner matches ${player.name}`);
        }
    }

    for (const corp of gs.corporations) {
        invariant(corp.id && corp.ticker, 'corporation has id and ticker');
        const shareholderTotal = corp.shareholders.reduce((sum, s) => sum + s.shares, 0);
        invariant(shareholderTotal <= corp.totalShares, `${corp.ticker} shareholder count does not exceed total shares`);
        for (const asset of corp.assets) {
            invariant(propertyOwners.get(asset.id) === corp.id, `${corp.ticker} asset ${asset.name} is owned by corporation`);
            invariant(!playerPropIds.has(asset.id), `${corp.ticker} asset ${asset.name} is not also in a player portfolio`);
        }
    }
}

function applyCardEffect(card, gs, activePlayerIndex) {
    const player = gs.players[activePlayerIndex];
    const action = card.action;
    switch (action.type) {
        case 'advance_to':
            if (action.position < player.position || (action.position === 0 && player.position !== 0)) {
                player.cash += gs.settings.passGoAmount || 200;
            }
            player.position = action.position;
            break;
        case 'collect':
            player.cash += action.amount;
            break;
        case 'pay':
            player.cash -= action.amount;
            break;
        case 'collect_from_each': {
            let collected = 0;
            gs.players.forEach((other, i) => {
                if (i !== activePlayerIndex && !other.bankrupt) {
                    other.cash -= action.amount;
                    collected += action.amount;
                }
            });
            player.cash += collected;
            break;
        }
        case 'go_to_jail':
            player.position = 10;
            player.inJail = true;
            player.jailTurns = 0;
            player.doubleCount = 0;
            break;
        default:
            throw new Error(`Unhandled simulation card action: ${action.type}`);
    }
}

function moveProperties(gs, from, to, propIds) {
    for (const propId of propIds) {
        const idx = from.properties.findIndex(prop => prop.id === propId);
        invariant(idx !== -1, `${from.name} owns ${propId} before trade`);
        const [propEntry] = from.properties.splice(idx, 1);
        to.properties.push(propEntry);
        const prop = propertyById(gs, propId);
        prop.ownerId = to.userId;
        prop.ownerName = to.name;
    }
}

function playerByName(gs, name) {
    const player = gs.players.find(p => p.name === name);
    invariant(player, `player exists: ${name}`);
    return player;
}

function propertyById(gs, propId) {
    const prop = gs.properties.find(p => p.id === propId);
    invariant(prop, `property exists: ${propId}`);
    return prop;
}

function tokenFor(playerName) {
    const player = context.players.find(p => p.name === playerName);
    invariant(player, `token exists for ${playerName}`);
    return player.token;
}

function pushLog(gs, message) {
    gs.gameLog.push({ timestamp: new Date().toISOString(), message });
}

async function step(label, fn) {
    try {
        await fn();
        pass(label);
    } catch (err) {
        fail(label, err.message);
    }
}

function invariant(condition, message) {
    if (!condition) throw new Error(message);
}

function check(condition, message, detail) {
    if (condition) pass(message);
    else fail(message, formatDetail(detail));
}

function pass(message) {
    report.push({ level: 'PASS', message });
}

function fail(message, detail) {
    report.push({ level: 'FAIL', message, detail });
}

function note(message) {
    report.push({ level: 'NOTE', message });
}

function printReport() {
    const counts = report.reduce((acc, entry) => {
        acc[entry.level] = (acc[entry.level] || 0) + 1;
        return acc;
    }, {});

    console.log('\nGameplay Simulation Report');
    console.log('==========================');
    for (const entry of report) {
        const suffix = entry.detail ? `\n      ${entry.detail}` : '';
        console.log(`[${entry.level}] ${entry.message}${suffix}`);
    }
    console.log('--------------------------');
    console.log(`PASS: ${counts.PASS || 0}  FAIL: ${counts.FAIL || 0}  NOTE: ${counts.NOTE || 0}`);
    if ((counts.FAIL || 0) > 0 && !strict) {
        console.log('Run with --strict to exit non-zero when failures are found.');
    }
}

async function api(path, options = {}) {
    const res = await rawApi(path, options);
    if (res.status < 200 || res.status >= 300) {
        throw new Error(`${options.method || 'GET'} ${path} returned ${res.status}: ${formatDetail(res.body)}`);
    }
    return res.body;
}

async function rawApi(path, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (options.token) headers.Authorization = `Bearer ${options.token}`;
    const res = await fetch(apiBase + path, {
        method: options.method || 'GET',
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
    });
    const text = await res.text();
    let body = text;
    try {
        body = text ? JSON.parse(text) : null;
    } catch {}
    return { status: res.status, body };
}

function parseArgs(argv) {
    const parsed = {};
    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        if (arg === '--api-base') parsed.apiBase = argv[++i];
        else if (arg.startsWith('--api-base=')) parsed.apiBase = arg.slice('--api-base='.length);
        else if (arg === '--allow-production') parsed.allowProduction = true;
        else if (arg === '--strict') parsed.strict = true;
    }
    return parsed;
}

function shuffleDeck(arr) {
    return arr.slice().reverse();
}

function clone(value) {
    return JSON.parse(JSON.stringify(value));
}

function formatDetail(detail) {
    if (!detail) return '';
    if (typeof detail === 'string') return detail.replace(/\s+/g, ' ').slice(0, 500);
    return JSON.stringify(detail).slice(0, 500);
}
