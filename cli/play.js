'use strict';

// ============================================================
// 1. IMPORTS & CONFIG
// ============================================================
const { createClient } = require('@supabase/supabase-js');
const readline = require('readline');

const SUPABASE_URL = 'https://scpkafqiooxfvycwzqla.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcGthZnFpb294ZnZ5Y3d6cWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MTU1MTksImV4cCI6MjA3ODM5MTUxOX0.nl__3JFaZWIDPc8zAo4LQ0JQC-3gdQGErjqAURNHSwM';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ============================================================
// 2. GAME CONSTANTS  (ported from board.js / waiting.js)
// ============================================================
const BOARD_SQUARES = [
  { position: 0,  name: 'GO',                  type: 'go',              propertyId: null,      taxAmount: 0   },
  { position: 1,  name: 'Mediterranean Ave',    type: 'property',        propertyId: 'prop-0',  taxAmount: 0   },
  { position: 2,  name: 'Community Chest',      type: 'community_chest', propertyId: null,      taxAmount: 0   },
  { position: 3,  name: 'Baltic Ave',           type: 'property',        propertyId: 'prop-1',  taxAmount: 0   },
  { position: 4,  name: 'Income Tax',           type: 'tax',             propertyId: null,      taxAmount: 200 },
  { position: 5,  name: 'Penn. Railroad',       type: 'railroad',        propertyId: 'prop-9',  taxAmount: 0   },
  { position: 6,  name: 'Oriental Ave',         type: 'property',        propertyId: 'prop-2',  taxAmount: 0   },
  { position: 7,  name: 'Chance',               type: 'chance',          propertyId: null,      taxAmount: 0   },
  { position: 8,  name: 'Vermont Ave',          type: 'property',        propertyId: 'prop-3',  taxAmount: 0   },
  { position: 9,  name: 'Connecticut Ave',      type: 'property',        propertyId: 'prop-4',  taxAmount: 0   },
  { position: 10, name: 'Jail/Just Visiting',   type: 'jail',            propertyId: null,      taxAmount: 0   },
  { position: 11, name: 'St. Charles Pl.',      type: 'property',        propertyId: 'prop-5',  taxAmount: 0   },
  { position: 12, name: 'Electric Company',     type: 'utility',         propertyId: 'prop-6',  taxAmount: 0   },
  { position: 13, name: 'States Ave',           type: 'property',        propertyId: 'prop-7',  taxAmount: 0   },
  { position: 14, name: 'Virginia Ave',         type: 'property',        propertyId: 'prop-8',  taxAmount: 0   },
  { position: 15, name: 'B.&O. Railroad',       type: 'railroad',        propertyId: 'prop-16', taxAmount: 0   },
  { position: 16, name: 'St. James Place',      type: 'property',        propertyId: 'prop-10', taxAmount: 0   },
  { position: 17, name: 'Community Chest',      type: 'community_chest', propertyId: null,      taxAmount: 0   },
  { position: 18, name: 'Tennessee Ave',        type: 'property',        propertyId: 'prop-11', taxAmount: 0   },
  { position: 19, name: 'New York Ave',         type: 'property',        propertyId: 'prop-12', taxAmount: 0   },
  { position: 20, name: 'Free Parking',         type: 'free_parking',    propertyId: null,      taxAmount: 0   },
  { position: 21, name: 'Kentucky Ave',         type: 'property',        propertyId: 'prop-13', taxAmount: 0   },
  { position: 22, name: 'Chance',               type: 'chance',          propertyId: null,      taxAmount: 0   },
  { position: 23, name: 'Indiana Ave',          type: 'property',        propertyId: 'prop-14', taxAmount: 0   },
  { position: 24, name: 'Illinois Ave',         type: 'property',        propertyId: 'prop-15', taxAmount: 0   },
  { position: 25, name: 'Chance',               type: 'chance',          propertyId: null,      taxAmount: 0   },
  { position: 26, name: 'Atlantic Ave',         type: 'property',        propertyId: 'prop-17', taxAmount: 0   },
  { position: 27, name: 'Ventnor Ave',          type: 'property',        propertyId: 'prop-18', taxAmount: 0   },
  { position: 28, name: 'Water Works',          type: 'utility',         propertyId: 'prop-19', taxAmount: 0   },
  { position: 29, name: 'Marvin Gardens',       type: 'property',        propertyId: 'prop-20', taxAmount: 0   },
  { position: 30, name: 'Go to Jail',           type: 'go_to_jail',      propertyId: null,      taxAmount: 0   },
  { position: 31, name: 'Pacific Ave',          type: 'property',        propertyId: 'prop-21', taxAmount: 0   },
  { position: 32, name: 'N. Carolina Ave',      type: 'property',        propertyId: 'prop-22', taxAmount: 0   },
  { position: 33, name: 'Community Chest',      type: 'community_chest', propertyId: null,      taxAmount: 0   },
  { position: 34, name: 'Pennsylvania Ave',     type: 'property',        propertyId: 'prop-23', taxAmount: 0   },
  { position: 35, name: 'Short Line RR',        type: 'railroad',        propertyId: 'prop-24', taxAmount: 0   },
  { position: 36, name: 'Chance',               type: 'chance',          propertyId: null,      taxAmount: 0   },
  { position: 37, name: 'Park Place',           type: 'property',        propertyId: 'prop-25', taxAmount: 0   },
  { position: 38, name: 'Luxury Tax',           type: 'tax',             propertyId: null,      taxAmount: 100 },
  { position: 39, name: 'Boardwalk',            type: 'property',        propertyId: 'prop-26', taxAmount: 0   },
];

const MONOPOLY_PROPERTIES = [
  { name: 'Mediterranean Avenue',  color: 'Brown',     price: 60,  rent: [2,  10,  30,   90,  160,  250] },
  { name: 'Baltic Avenue',         color: 'Brown',     price: 60,  rent: [4,  20,  60,  180,  320,  450] },
  { name: 'Oriental Avenue',       color: 'Light Blue',price: 100, rent: [6,  30,  90,  270,  400,  550] },
  { name: 'Vermont Avenue',        color: 'Light Blue',price: 100, rent: [6,  30,  90,  270,  400,  550] },
  { name: 'Connecticut Avenue',    color: 'Light Blue',price: 120, rent: [8,  40, 100,  300,  450,  600] },
  { name: 'St. Charles Place',     color: 'Pink',      price: 140, rent: [10, 50, 150,  450,  625,  750] },
  { name: 'Electric Company',      color: 'Utility',   price: 150, rent: [4,  10] },
  { name: 'States Avenue',         color: 'Pink',      price: 140, rent: [10, 50, 150,  450,  625,  750] },
  { name: 'Virginia Avenue',       color: 'Pink',      price: 160, rent: [12, 60, 180,  500,  700,  900] },
  { name: 'Pennsylvania Railroad', color: 'Railroad',  price: 200, rent: [25, 50, 100,  200] },
  { name: 'St. James Place',       color: 'Orange',    price: 180, rent: [14, 70, 200,  550,  750,  950] },
  { name: 'Tennessee Avenue',      color: 'Orange',    price: 180, rent: [14, 70, 200,  550,  750,  950] },
  { name: 'New York Avenue',       color: 'Orange',    price: 200, rent: [16, 80, 220,  600,  800, 1000] },
  { name: 'Kentucky Avenue',       color: 'Red',       price: 220, rent: [18, 90, 250,  700,  875, 1050] },
  { name: 'Indiana Avenue',        color: 'Red',       price: 220, rent: [18, 90, 250,  700,  875, 1050] },
  { name: 'Illinois Avenue',       color: 'Red',       price: 240, rent: [20,100, 300,  750,  925, 1100] },
  { name: 'B. & O. Railroad',      color: 'Railroad',  price: 200, rent: [25, 50, 100,  200] },
  { name: 'Atlantic Avenue',       color: 'Yellow',    price: 260, rent: [22,110, 330,  800,  975, 1150] },
  { name: 'Ventnor Avenue',        color: 'Yellow',    price: 260, rent: [22,110, 330,  800,  975, 1150] },
  { name: 'Water Works',           color: 'Utility',   price: 150, rent: [4,  10] },
  { name: 'Marvin Gardens',        color: 'Yellow',    price: 280, rent: [24,120, 360,  850, 1025, 1200] },
  { name: 'Pacific Avenue',        color: 'Green',     price: 300, rent: [26,130, 390,  900, 1100, 1275] },
  { name: 'North Carolina Avenue', color: 'Green',     price: 300, rent: [26,130, 390,  900, 1100, 1275] },
  { name: 'Pennsylvania Avenue',   color: 'Green',     price: 320, rent: [28,150, 450, 1000, 1200, 1400] },
  { name: 'Short Line',            color: 'Railroad',  price: 200, rent: [25, 50, 100,  200] },
  { name: 'Park Place',            color: 'Dark Blue', price: 350, rent: [35,175, 500, 1100, 1300, 1500] },
  { name: 'Boardwalk',             color: 'Dark Blue', price: 400, rent: [50,200, 600, 1400, 1700, 2000] },
];

const CHANCE_CARDS = [
  { id: 'ch-1',  text: 'Advance to GO. Collect $200.',                                         action: { type: 'advance_to', position: 0 } },
  { id: 'ch-2',  text: 'Advance to Illinois Ave.',                                             action: { type: 'advance_to', position: 24 } },
  { id: 'ch-3',  text: 'Advance to St. Charles Place.',                                        action: { type: 'advance_to', position: 11 } },
  { id: 'ch-4',  text: 'Advance to nearest Utility. If owned, pay 10x your dice roll.',        action: { type: 'advance_nearest', nearestType: 'utility' } },
  { id: 'ch-5',  text: 'Advance to nearest Railroad. Pay owner twice the normal rent.',        action: { type: 'advance_nearest', nearestType: 'railroad' } },
  { id: 'ch-6',  text: 'Bank pays you a dividend of $50.',                                     action: { type: 'collect', amount: 50 } },
  { id: 'ch-7',  text: 'Get Out of Jail Free.',                                                action: { type: 'get_out_of_jail' } },
  { id: 'ch-8',  text: 'Go Back 3 Spaces.',                                                    action: { type: 'back_3' } },
  { id: 'ch-9',  text: 'Go to Jail. Do not pass GO.',                                          action: { type: 'go_to_jail' } },
  { id: 'ch-10', text: 'Make general repairs — $25 per house, $100 per hotel.',                action: { type: 'repairs', perHouse: 25, perHotel: 100 } },
  { id: 'ch-11', text: 'Pay a poor tax of $15.',                                               action: { type: 'pay', amount: 15 } },
  { id: 'ch-12', text: 'Take a trip to Reading Railroad (Pennsylvania RR).',                   action: { type: 'advance_to', position: 5 } },
  { id: 'ch-13', text: 'Take a walk on the Boardwalk.',                                        action: { type: 'advance_to', position: 39 } },
  { id: 'ch-14', text: 'You have been elected Chairman of the Board — pay each player $50.',   action: { type: 'pay_to_each', amount: 50 } },
  { id: 'ch-15', text: 'Your building and loan matures — collect $150.',                       action: { type: 'collect', amount: 150 } },
  { id: 'ch-16', text: 'You have won a crossword competition — collect $100.',                 action: { type: 'collect', amount: 100 } },
];

const COMMUNITY_CHEST_CARDS = [
  { id: 'cc-1',  text: 'Advance to GO. Collect $200.',                                               action: { type: 'advance_to', position: 0 } },
  { id: 'cc-2',  text: 'Bank error in your favor — collect $200.',                                   action: { type: 'collect', amount: 200 } },
  { id: 'cc-3',  text: "Doctor's fee — pay $50.",                                                    action: { type: 'pay', amount: 50 } },
  { id: 'cc-4',  text: 'From sale of stock — collect $50.',                                          action: { type: 'collect', amount: 50 } },
  { id: 'cc-5',  text: 'Get Out of Jail Free.',                                                      action: { type: 'get_out_of_jail' } },
  { id: 'cc-6',  text: 'Go to Jail. Do not pass GO.',                                                action: { type: 'go_to_jail' } },
  { id: 'cc-7',  text: 'Grand Opera Night — collect $50 from every other player.',                   action: { type: 'collect_from_each', amount: 50 } },
  { id: 'cc-8',  text: 'Holiday fund matures — collect $100.',                                       action: { type: 'collect', amount: 100 } },
  { id: 'cc-9',  text: 'Income tax refund — collect $20.',                                           action: { type: 'collect', amount: 20 } },
  { id: 'cc-10', text: 'It is your birthday — collect $10 from every other player.',                 action: { type: 'collect_from_each', amount: 10 } },
  { id: 'cc-11', text: 'Life insurance matures — collect $100.',                                     action: { type: 'collect', amount: 100 } },
  { id: 'cc-12', text: 'Pay hospital fees of $100.',                                                 action: { type: 'pay', amount: 100 } },
  { id: 'cc-13', text: 'Pay school fees of $150.',                                                   action: { type: 'pay', amount: 150 } },
  { id: 'cc-14', text: 'Receive $25 consultancy fee.',                                               action: { type: 'collect', amount: 25 } },
  { id: 'cc-15', text: 'You are assessed for street repairs — $40 per house, $115 per hotel.',       action: { type: 'repairs', perHouse: 40, perHotel: 115 } },
  { id: 'cc-16', text: 'You have won second prize in a beauty contest — collect $10.',               action: { type: 'collect', amount: 10 } },
];

const HOUSE_COSTS = {
  'Brown': 50, 'Light Blue': 50, 'Pink': 100, 'Orange': 100,
  'Red': 150, 'Yellow': 150, 'Green': 200, 'Dark Blue': 200,
};

const TOKEN_CHARS = ['@', '#', '$', '%', '&', '*', '+', '='];

// ============================================================
// 3. STATE VARIABLES
// ============================================================
let currentUser    = null;
let currentSession = null;
let currentRoom    = null;
let currentGame    = null;

// ============================================================
// 4. CONSOLE HELPERS
// ============================================================
function clr() { process.stdout.write('\x1Bc'); }

function c(text, code) { return `\x1b[${code}m${text}\x1b[0m`; }
const red    = t => c(t, 31);
const green  = t => c(t, 32);
const yellow = t => c(t, 33);
const cyan   = t => c(t, 36);
const bold   = t => c(t, 1);

function hr(char = '=') { return char.repeat(60); }

function ask(prompt) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise(resolve => {
    rl.question(prompt, answer => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function askPassword(prompt) {
  return new Promise(resolve => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    const wasPaused = stdin.isPaused();
    if (wasPaused) stdin.resume();
    stdin.setRawMode(true);
    stdin.setEncoding('utf8');
    let password = '';
    const onData = ch => {
      if (ch === '\r' || ch === '\n') {
        stdin.setRawMode(false);
        stdin.removeListener('data', onData);
        if (wasPaused) stdin.pause();
        process.stdout.write('\n');
        resolve(password);
      } else if (ch === '\u0003') {
        process.exit();
      } else if (ch === '\u007f' || ch === '\b') {
        if (password.length > 0) {
          password = password.slice(0, -1);
          process.stdout.write('\b \b');
        }
      } else {
        password += ch;
        process.stdout.write('*');
      }
    };
    stdin.on('data', onData);
  });
}

async function pause(msg) {
  await ask(msg || 'Press Enter to continue...');
}

// Append a timestamped entry to the in-memory game log
function logEntry(gs, message) {
  gs.gameLog.push({ timestamp: new Date().toISOString(), message });
}

// ============================================================
// 5. PURE GAME LOGIC  (ported from board.js / game.js)
// ============================================================
function shuffleDeck(arr) {
  const deck = arr.slice();
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

function findNearestType(currentPos, type) {
  for (let i = 1; i <= 40; i++) {
    const candidate = (currentPos + i) % 40;
    if (BOARD_SQUARES[candidate].type === type) return candidate;
  }
  return currentPos;
}

function calculateRent(property, gameState, diceTotal) {
  if (property.color === 'Railroad') {
    const owned = gameState.properties.filter(
      p => p.color === 'Railroad' && p.ownerId === property.ownerId
    ).length;
    return property.rent[owned - 1];
  }
  if (property.color === 'Utility') {
    const owned = gameState.properties.filter(
      p => p.color === 'Utility' && p.ownerId === property.ownerId
    ).length;
    return diceTotal * (owned === 2 ? 10 : 4);
  }
  if (property.houses > 0) return property.rent[property.houses];
  const colorGroup = gameState.properties.filter(p => p.color === property.color);
  const monopoly = colorGroup.length > 0 && colorGroup.every(p => p.ownerId === property.ownerId);
  return monopoly ? property.rent[0] * 2 : property.rent[0];
}

function applyCardEffect(card, gameState, activePlayerIndex) {
  const player = gameState.players[activePlayerIndex];
  const action = card.action;
  let message = '';
  switch (action.type) {
    case 'advance_to': {
      const oldPos = player.position;
      const target = action.position;
      const passGo = (target < oldPos) || (target === 0 && oldPos !== 0);
      player.position = target;
      if (passGo) {
        player.cash += (gameState.settings.passGoAmount || 200);
        message = `Moved to ${BOARD_SQUARES[target].name} — collected $${gameState.settings.passGoAmount || 200} passing GO`;
      } else {
        message = `Moved to ${BOARD_SQUARES[target].name}`;
      }
      break;
    }
    case 'advance_nearest': {
      const oldPos = player.position;
      const nearest = findNearestType(oldPos, action.nearestType);
      const passGo = nearest < oldPos;
      player.position = nearest;
      if (passGo) player.cash += (gameState.settings.passGoAmount || 200);
      message = `Moved to nearest ${action.nearestType}: ${BOARD_SQUARES[nearest].name}${passGo ? ` — collected $${gameState.settings.passGoAmount || 200} passing GO` : ''}`;
      break;
    }
    case 'go_to_jail':
      player.position = 10;
      player.inJail = true;
      player.jailTurns = 0;
      player.doubleCount = 0;
      message = 'Go to Jail!';
      break;
    case 'back_3':
      player.position = (player.position - 3 + 40) % 40;
      message = `Moved back 3 spaces to ${BOARD_SQUARES[player.position].name}`;
      break;
    case 'collect':
      player.cash += action.amount;
      message = `Collected $${action.amount}`;
      break;
    case 'pay':
      player.cash -= action.amount;
      message = `Paid $${action.amount}`;
      break;
    case 'collect_from_each': {
      let collected = 0;
      gameState.players.forEach((p, i) => {
        if (i !== activePlayerIndex && !p.bankrupt) {
          p.cash -= action.amount;
          collected += action.amount;
        }
      });
      player.cash += collected;
      message = `Collected $${action.amount} from each player ($${collected} total)`;
      break;
    }
    case 'pay_to_each': {
      let paid = 0;
      gameState.players.forEach((p, i) => {
        if (i !== activePlayerIndex && !p.bankrupt) {
          p.cash += action.amount;
          paid += action.amount;
        }
      });
      player.cash -= paid;
      message = `Paid $${action.amount} to each player ($${paid} total)`;
      break;
    }
    case 'get_out_of_jail':
      player.hasGetOutOfJailCard = true;
      message = 'Got Out of Jail Free card!';
      break;
    case 'repairs': {
      let houses = 0, hotels = 0;
      gameState.properties.forEach(p => {
        if (p.ownerId === player.userId) {
          if (p.houses === 5) hotels++;
          else houses += (p.houses || 0);
        }
      });
      const cost = action.perHouse * houses + action.perHotel * hotels;
      player.cash -= cost;
      message = `Paid $${cost} for repairs (${houses} house(s), ${hotels} hotel(s))`;
      break;
    }
    default:
      message = 'Card applied';
  }
  return { gameState, message };
}

function hasCompleteColorGroup(userId, gameState) {
  const colors = [...new Set(
    gameState.properties
      .filter(p => p.color !== 'Railroad' && p.color !== 'Utility')
      .map(p => p.color)
  )];
  return colors.some(color => {
    const group = gameState.properties.filter(p => p.color === color);
    return group.length > 0 && group.every(p => p.ownerId === userId);
  });
}

function getCompleteGroupProperties(userId, gameState) {
  const colors = [...new Set(
    gameState.properties
      .filter(p => p.color !== 'Railroad' && p.color !== 'Utility')
      .map(p => p.color)
  )];
  const result = [];
  colors.forEach(color => {
    const group = gameState.properties.filter(p => p.color === color);
    if (group.length > 0 && group.every(p => p.ownerId === userId)) result.push(...group);
  });
  return result;
}

function buildInitialGameState(members) {
  return {
    players: members.map(member => ({
      userId:              member.user_id,
      name:                member.player_name,
      cash:                1500,
      properties:          [],
      equities:            [],
      corporations:        [],
      debts:               [],
      interestOwed:        0,
      netWorth:            1500,
      bankrupt:            false,
      position:            0,
      inJail:              false,
      jailTurns:           0,
      hasGetOutOfJailCard: false,
      doubleCount:         0,
      diceRolled:          false,
    })),
    currentPlayerIndex:   0,
    properties: MONOPOLY_PROPERTIES.map((prop, i) => ({
      ...prop,
      id:        `prop-${i}`,
      ownerId:   null,
      ownerName: null,
      houses:    0,
      available: true,
    })),
    corporations:         [],
    gameLog:              [],
    settings:             { interestRate: 5, passGoAmount: 200 },
    chanceCards:          shuffleDeck(CHANCE_CARDS),
    communityChestCards:  shuffleDeck(COMMUNITY_CHEST_CARDS),
    lastDiceRoll:         null,
    lastCardDrawn:        null,
  };
}

// ============================================================
// 6. SUPABASE DB HELPERS
// ============================================================
async function dbSignUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email, password,
    options: { data: { display_name: displayName } },
  });
  if (error) throw error;
  return data;
}

async function dbLogin(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function dbCreateRoom(name, maxPlayers, playerName) {
  const CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const inviteCode = Array.from({ length: 6 }, () => CHARS[Math.floor(Math.random() * CHARS.length)]).join('');
  const { data: room, error: roomErr } = await supabase
    .from('rooms')
    .insert({ name, max_players: maxPlayers, invite_code: inviteCode, host_id: currentUser.id, status: 'waiting' })
    .select()
    .single();
  if (roomErr) throw roomErr;

  const { error: memberErr } = await supabase
    .from('room_members')
    .insert({ room_id: room.id, user_id: currentUser.id, player_name: playerName });
  if (memberErr) throw memberErr;

  return room;
}

async function dbJoinRoom(inviteCode, playerName) {
  const { data: rooms, error: findErr } = await supabase
    .from('rooms')
    .select('*, room_members(*)')
    .eq('invite_code', inviteCode.toUpperCase())
    .single();
  if (findErr) {
    if (findErr.code !== 'PGRST116') console.error('DB error:', findErr.code, findErr.message);
    throw new Error('Room not found — check the invite code');
  }

  const alreadyMember = rooms.room_members.some(m => m.user_id === currentUser.id);
  if (!alreadyMember) {
    const { error: memberErr } = await supabase
      .from('room_members')
      .insert({ room_id: rooms.id, user_id: currentUser.id, player_name: playerName });
    if (memberErr) throw memberErr;
  }
  return rooms;
}

async function dbGetRoom(roomId) {
  const { data, error } = await supabase
    .from('rooms')
    .select('*, room_members(*)')
    .eq('id', roomId)
    .single();
  if (error) throw error;
  return data;
}

async function dbStartGame(room) {
  const { error: updateErr } = await supabase
    .from('rooms')
    .update({ status: 'in_progress' })
    .eq('id', room.id);
  if (updateErr) throw updateErr;

  const initialState = buildInitialGameState(room.room_members);
  const { data: game, error: gameErr } = await supabase
    .from('games')
    .insert({ room_id: room.id, game_state: initialState })
    .select()
    .single();
  if (gameErr) throw gameErr;

  return game;
}

async function dbSaveGame(gameId, gameState) {
  const { error } = await supabase
    .from('games')
    .update({ game_state: gameState })
    .eq('id', gameId);
  if (error) throw error;
}

async function dbLogEvent(gameId, eventType, eventData) {
  const { error } = await supabase
    .from('game_events')
    .insert({ game_id: gameId, player_id: currentUser.id, event_type: eventType, event_data: eventData });
  if (error) console.error('Log error:', error.message);
}

async function dbLoadGame(roomId) {
  const { data, error } = await supabase
    .from('games')
    .select('*')
    .eq('room_id', roomId)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();
  if (error) throw error;
  return data;
}

async function dbGetGameLog(gameId) {
  const { data, error } = await supabase
    .from('game_events')
    .select('*')
    .eq('game_id', gameId)
    .order('created_at', { ascending: false })
    .limit(10);
  if (error) throw error;
  return data;
}

// ============================================================
// 7. ASCII BOARD RENDERER
// ============================================================
function renderBoard(gs) {
  if (!gs) return;
  const myId = currentUser.id;
  const currentPlayer = gs.players[gs.currentPlayerIndex];
  const isMyTurn = currentPlayer && currentPlayer.userId === myId;
  const myPlayer = gs.players.find(p => p.userId === myId);

  console.log(hr());
  console.log(bold(' MORTGAGE BACKED MONOPOLY'));
  const turnLabel = currentPlayer
    ? ` Round — ${bold(currentPlayer.name + "'s turn")}${isMyTurn ? yellow(' (YOU)') : ''}`
    : '';
  console.log(turnLabel);
  console.log(hr());

  // Players
  console.log(bold(' PLAYERS'));
  gs.players.forEach((p, idx) => {
    const token = TOKEN_CHARS[idx] || '?';
    const sq = BOARD_SQUARES[p.position] || BOARD_SQUARES[0];
    const tag = p.userId === myId ? yellow(' (YOU)') : '';
    const jail = p.inJail ? red(' [JAIL]') : '';
    const bust = p.bankrupt ? red(' [BANKRUPT]') : '';
    const rolled = p.diceRolled ? ' [rolled]' : '';
    const active = idx === gs.currentPlayerIndex ? green(' <') : '';
    console.log(`  ${token} ${p.name}${tag}${jail}${bust}  pos ${p.position}: ${sq.name}   $${Math.round(p.cash)}${rolled}${active}`);
  });

  // Position map (compact)
  console.log('');
  console.log(bold(' POSITION MAP'));
  const chunks = [];
  for (let i = 0; i < 40; i += 10) {
    const row = BOARD_SQUARES.slice(i, i + 10).map(sq => {
      const tokens = gs.players
        .filter(p => !p.bankrupt && p.position === sq.position)
        .map(p => TOKEN_CHARS[gs.players.indexOf(p)] || '?')
        .join('');
      return `${sq.position}:${sq.name.substring(0, 8)}${tokens ? '[' + tokens + ']' : ''}`;
    });
    chunks.push('  ' + row.join('  '));
  }
  chunks.forEach(r => console.log(r));

  // Properties
  console.log('');
  console.log(bold(' PROPERTIES OWNED'));
  gs.players.forEach((p, idx) => {
    const token = TOKEN_CHARS[idx] || '?';
    const owned = gs.properties.filter(prop => prop.ownerId === p.userId);
    if (owned.length === 0) {
      console.log(`  ${token} ${p.name}: none`);
    } else {
      const list = owned.map(prop => {
        const h = prop.houses > 0 ? (prop.houses === 5 ? 'H' : prop.houses + 'h') : '';
        return `${prop.name}[$${prop.price}]${h}`;
      }).join('  ');
      console.log(`  ${token} ${p.name}: ${list}`);
    }
  });

  // Dice & last card
  console.log('');
  const dice = gs.lastDiceRoll;
  const diceStr = dice ? `[${dice[0]}][${dice[1]}]=${dice[0] + dice[1]}` : '?';
  const card = gs.lastCardDrawn ? gs.lastCardDrawn.text : '—';
  console.log(bold(` DICE  ${diceStr}   LAST CARD: `) + card.substring(0, 50));

  // Corporations
  if (gs.corporations && gs.corporations.length > 0) {
    console.log('');
    console.log(bold(' CORPORATIONS'));
    gs.corporations.forEach(corp => {
      const sold = corp.shareholders.reduce((s, sh) => s + sh.shares, 0);
      console.log(`  ${corp.ticker} (${corp.founderName}) — ${sold}/${corp.totalShares} shares @ $${corp.pricePerShare}/share`);
    });
  }

  console.log(hr());

  // My player detail
  if (myPlayer) {
    const debtTotal = myPlayer.debts.reduce((s, d) => s + d.principal, 0);
    console.log(bold(` YOUR STATUS`));
    console.log(`  Cash: $${Math.round(myPlayer.cash)}   Debts: $${debtTotal.toFixed(0)}`);
    if (myPlayer.hasGetOutOfJailCard) console.log(green('  ** You have a Get Out of Jail Free card **'));
  }
  console.log(hr());
}

// ============================================================
// 8. AUTH MENU
// ============================================================
async function authMenu() {
  while (!currentUser) {
    clr();
    console.log(bold('=== MORTGAGE BACKED MONOPOLY — CLI ==='));
    console.log('');
    console.log('[1] Login');
    console.log('[2] Sign up');
    console.log('[q] Quit');
    console.log('');
    const choice = await ask('> ');
    if (choice === 'q') process.exit(0);

    if (choice === '1') {
      const email    = await ask('Email: ');
      const password = await askPassword('Password: ');
      try {
        const data = await dbLogin(email, password);
        currentUser    = data.user;
        currentSession = data.session;
        console.log(green(`Logged in as ${currentUser.email}`));
        await pause();
      } catch (err) {
        console.log(red('Login failed: ' + err.message));
        await pause();
      }

    } else if (choice === '2') {
      const name     = await ask('Display name: ');
      const email    = await ask('Email: ');
      const password = await askPassword('Password: ');
      try {
        const data = await dbSignUp(email, password, name);
        if (data.session) {
          currentUser    = data.user;
          currentSession = data.session;
          console.log(green('Account created and logged in!'));
        } else {
          console.log(yellow('Account created — check your email to confirm, then log in.'));
        }
        await pause();
      } catch (err) {
        console.log(red('Sign up failed: ' + err.message));
        await pause();
      }
    }
  }
}

// ============================================================
// 9. LOBBY MENU
// ============================================================
async function lobbyMenu() {
  while (true) {
    clr();
    console.log(bold(`=== LOBBY  [${currentUser.email}] ===`));
    console.log('');
    console.log('[1] Create room');
    console.log('[2] Join room by invite code');
    console.log('[3] List my rooms');
    console.log('[4] Switch user / logout');
    console.log('[q] Quit');
    console.log('');
    const choice = await ask('> ');

    if (choice === 'q') process.exit(0);

    if (choice === '1') {
      const roomName  = await ask('Room name: ');
      const playerName = await ask('Your player name: ');
      const maxStr    = await ask('Max players (2–8) [4]: ');
      const maxPlayers = parseInt(maxStr) || 4;
      try {
        const room = await dbCreateRoom(roomName, maxPlayers, playerName);
        console.log(green(`Room created! Invite code: ${bold(room.invite_code)}`));
        currentRoom = room;
        await pause('Share the code above, then press Enter to enter waiting room...');
        await waitingRoom(room.id);
      } catch (err) {
        console.log(red('Error: ' + err.message));
        await pause();
      }

    } else if (choice === '2') {
      const code       = await ask('Invite code: ');
      const playerName = await ask('Your player name: ');
      try {
        const room = await dbJoinRoom(code, playerName);
        currentRoom = room;
        console.log(green(`Joined room "${room.name}"`));
        await pause();
        await waitingRoom(room.id);
      } catch (err) {
        console.log(red('Error: ' + err.message));
        await pause();
      }

    } else if (choice === '3') {
      try {
        const { data, error } = await supabase
          .from('room_members')
          .select('room_id, rooms(id, name, status, invite_code, max_players, room_members(count))')
          .eq('user_id', currentUser.id);
        if (error) throw error;
        clr();
        console.log(bold('MY ROOMS'));
        if (!data || data.length === 0) {
          console.log('No rooms yet.');
        } else {
          data.forEach(m => {
            const r = m.rooms;
            if (!r) return;
            console.log(`  ${r.name} [${r.invite_code}] — ${r.status}`);
          });
        }
        await pause();
      } catch (err) {
        console.log(red('Error: ' + err.message));
        await pause();
      }

    } else if (choice === '4') {
      await supabase.auth.signOut();
      currentUser = null;
      currentSession = null;
      return; // back to authMenu
    }
  }
}

// ============================================================
// 10. WAITING ROOM
// ============================================================
async function waitingRoom(roomId) {
  while (true) {
    const room = await dbGetRoom(roomId);
    currentRoom = room;
    const isHost = room.host_id === currentUser.id;

    // If game already started, jump into game loop
    if (room.status === 'in_progress') {
      console.log(green('Game is in progress — entering game loop...'));
      await pause();
      const game = await dbLoadGame(roomId);
      currentGame = game;
      await gameLoop(roomId);
      return;
    }

    clr();
    console.log(bold(`=== WAITING ROOM — ${room.name} [${room.invite_code}] ===`));
    console.log(`Players (${room.room_members.length}/${room.max_players}):`);
    room.room_members.forEach(m => {
      const hostTag = m.user_id === room.host_id ? ' (host)' : '';
      const youTag  = m.user_id === currentUser.id ? yellow(' (you)') : '';
      console.log(`  · ${m.player_name}${hostTag}${youTag}`);
    });
    console.log('');
    if (isHost) console.log('[s] Start game');
    console.log('[r] Refresh   [q] Back to lobby');
    console.log('');
    const choice = await ask('> ');

    if (choice === 'q') return;
    if (choice === 'r') continue;

    if (choice === 's') {
      if (!isHost) {
        console.log(red('Only the host can start the game.'));
        await pause();
        continue;
      }
      if (room.room_members.length < 2) {
        console.log(red('Need at least 2 players to start.'));
        await pause();
        continue;
      }
      try {
        const game = await dbStartGame(room);
        currentGame = game;
        console.log(green('Game started!'));
        await pause();
        await gameLoop(roomId);
        return;
      } catch (err) {
        console.log(red('Error starting game: ' + err.message));
        await pause();
      }
    }
  }
}

// ============================================================
// 11. GAME LOOP
// ============================================================
async function gameLoop(roomId) {
  while (true) {
    // Reload state
    try {
      currentGame = await dbLoadGame(roomId);
    } catch (err) {
      console.log(red('Failed to load game: ' + err.message));
      await pause();
      continue;
    }

    const gs = currentGame.game_state;
    const myId = currentUser.id;
    const currentPlayer = gs.players[gs.currentPlayerIndex];
    const isMyTurn = currentPlayer && currentPlayer.userId === myId;
    const myPlayer = gs.players.find(p => p.userId === myId);

    clr();
    renderBoard(gs);

    // Check win condition
    const activePlayers = gs.players.filter(p => !p.bankrupt);
    if (activePlayers.length === 1) {
      console.log(green(`\nGame over! ${activePlayers[0].name} wins — last player standing!`));
      await handleEndGame(gs);
      return;
    }

    if (isMyTurn) {
      console.log(bold('YOUR TURN'));
      if (!myPlayer.diceRolled) {
        console.log('[r] Roll dice   [e] End turn   [g] Game log   [q] Quit');
      } else {
        console.log('[b] Buy property   [h] Buy houses   [d] Manage debt');
        console.log('[i] Create IPO     [m] Market       [c] View corps');
        console.log('[e] End turn       [g] Game log     [q] Quit');
      }
    } else {
      const name = currentPlayer ? currentPlayer.name : 'someone';
      console.log(yellow(`Waiting for ${name}'s turn...`));
      console.log('[r] Refresh   [g] Game log   [q] Quit');
    }
    console.log('');

    const choice = await ask('> ');

    if (choice === 'q') {
      const confirm = await ask('Quit to lobby? (y/n): ');
      if (confirm === 'y') return;
      continue;
    }

    if (choice === 'g') {
      await showGameLog();
      continue;
    }

    if (!isMyTurn) {
      if (choice === 'r') continue;
      console.log(yellow('Not your turn. Press [r] to refresh.'));
      await pause();
      continue;
    }

    // My turn actions
    try {
      if (choice === 'r' && !myPlayer.diceRolled) {
        await handleRoll(gs, myPlayer);
      } else if (choice === 'e') {
        await handleEndTurn(gs, myPlayer);
      } else if (choice === 'b' && myPlayer.diceRolled) {
        await handleBuyProperty(gs, myPlayer);
      } else if (choice === 'h' && myPlayer.diceRolled) {
        await handleBuyHouses(gs, myPlayer);
      } else if (choice === 'd' && myPlayer.diceRolled) {
        await handleDebt(gs, myPlayer);
      } else if (choice === 'i' && myPlayer.diceRolled) {
        await handleIPO(gs, myPlayer);
      } else if (choice === 'm' && myPlayer.diceRolled) {
        await handleMarket(gs);
      } else if (choice === 'c' && myPlayer.diceRolled) {
        await handleViewCorps(gs, myPlayer);
      } else {
        console.log(yellow('Invalid action.'));
        await pause();
      }
    } catch (err) {
      console.log(red('Action failed: ' + err.message));
      await pause();
    }
  }
}

// ============================================================
// 12. ACTION HANDLERS
// ============================================================

// --- Roll dice ---
async function handleRoll(gs, player) {
  if (player.diceRolled) {
    console.log(yellow('You already rolled this turn.'));
    await pause();
    return;
  }

  const die1 = Math.floor(Math.random() * 6) + 1;
  const die2 = Math.floor(Math.random() * 6) + 1;
  const total = die1 + die2;
  const isDoubles = die1 === die2;

  gs.lastDiceRoll = [die1, die2];
  console.log(`\nRolled [${die1}][${die2}] = ${total}${isDoubles ? yellow(' DOUBLES!') : ''}`);

  if (isDoubles) {
    player.doubleCount = (player.doubleCount || 0) + 1;
    if (player.doubleCount >= 3) {
      player.inJail = true;
      player.position = 10;
      player.doubleCount = 0;
      player.diceRolled = true;
      console.log(red('Three doubles in a row — Go to Jail!'));
      logEntry(gs, `${player.name} rolled doubles 3 times — sent to Jail!`);

      await dbSaveGame(currentGame.id, gs);
      await dbLogEvent(currentGame.id, 'dice_roll', { player: player.name, die1, die2, jailed: true });
      await pause();
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
      console.log(green('Rolled doubles — released from Jail!'));
    } else {
      player.jailTurns = (player.jailTurns || 0) + 1;
      if (player.jailTurns >= 3) {
        player.cash -= 50;
        player.inJail = false;
        player.jailTurns = 0;
        console.log(yellow('Paid $50 bail — released from Jail.'));
      } else {
        player.diceRolled = true;
        console.log(yellow(`In Jail (turn ${player.jailTurns}/3). Rolled ${die1}+${die2}. End your turn.`));
        logEntry(gs, `${player.name} is in Jail (turn ${player.jailTurns}/3). Rolled ${die1}+${die2}.`);

        await dbSaveGame(currentGame.id, gs);
        await pause();
        return;
      }
    }
  }

  // Move
  const oldPos = player.position || 0;
  const newPos = (oldPos + total) % 40;

  if (newPos < oldPos) {
    player.cash += (gs.settings.passGoAmount || 200);
    console.log(green(`Passed GO — collected $${gs.settings.passGoAmount || 200}!`));
    logEntry(gs, `${player.name} passed GO — collected $${gs.settings.passGoAmount || 200}!`);

  }

  player.position = newPos;
  const sq = BOARD_SQUARES[newPos];
  console.log(`Moved to ${bold(sq.name)} (position ${newPos})`);

  // Doubles = roll again (leave diceRolled false); otherwise lock
  if (!isDoubles) {
    player.diceRolled = true;
  } else {
    console.log(yellow('Doubles! You can roll again after resolving this space.'));
  }

  logEntry(gs, `${player.name} rolled ${die1}+${die2}=${total} — moved to ${sq.name}${isDoubles ? ' (doubles!)' : ''}`);


  // Process landing
  const landingMsg = await processLanding(player, newPos, gs, total);
  if (landingMsg) console.log(landingMsg);

  await dbSaveGame(currentGame.id, gs);
  await dbLogEvent(currentGame.id, 'dice_roll', { player: player.name, die1, die2, newPos, square: sq.name });
  await pause();
}

// --- Process landing ---
async function processLanding(player, position, gs, diceTotal) {
  const square = BOARD_SQUARES[position];
  switch (square.type) {
    case 'go':
      return green('Welcome back to GO!');

    case 'property':
    case 'railroad':
    case 'utility': {
      const prop = gs.properties.find(p => p.id === square.propertyId);
      if (!prop) return '';
      if (!prop.ownerId) {
        return yellow(`${square.name} is unowned (price $${prop.price}). Use [b] to buy after rolling.`);
      } else if (prop.ownerId === player.userId) {
        return green(`You own ${square.name}.`);
      } else {
        const owner = gs.players.find(p => p.userId === prop.ownerId);
        if (owner && !owner.bankrupt) {
          const rent = calculateRent(prop, gs, diceTotal);
          console.log(red(`You owe $${rent} rent to ${owner.name} for ${square.name}!`));
          const confirm = await ask(`Pay $${rent} rent to ${owner.name}? (y/n): `);
          if (confirm === 'y') {
            player.cash -= rent;
            owner.cash  += rent;
            logEntry(gs, `${player.name} paid $${rent} rent to ${owner.name} for ${square.name}`);

            await dbLogEvent(currentGame.id, 'payment', { from: player.name, to: owner.name, amount: rent });
            return green(`Paid $${rent} rent to ${owner.name}.`);
          }
        }
      }
      return '';
    }

    case 'tax': {
      console.log(red(`Tax! You owe $${square.taxAmount} for ${square.name}.`));
      const confirm = await ask(`Pay $${square.taxAmount}? (y/n): `);
      if (confirm === 'y') {
        player.cash -= square.taxAmount;
        logEntry(gs, `${player.name} paid $${square.taxAmount} tax (${square.name})`);

        await dbLogEvent(currentGame.id, 'payment', { from: player.name, to: 'Bank', amount: square.taxAmount });
        return green(`Paid $${square.taxAmount} tax.`);
      }
      return '';
    }

    case 'chance': {
      if (!gs.chanceCards || gs.chanceCards.length === 0) gs.chanceCards = shuffleDeck(CHANCE_CARDS);
      const card = gs.chanceCards.shift();
      gs.lastCardDrawn = card;
      console.log(cyan(`\n--- CHANCE CARD ---`));
      console.log(cyan(`"${card.text}"`));
      const { message } = applyCardEffect(card, gs, gs.players.indexOf(player));
      logEntry(gs, `${player.name} drew Chance: "${card.text}" — ${message}`);

      return green(`Applied: ${message}`);
    }

    case 'community_chest': {
      if (!gs.communityChestCards || gs.communityChestCards.length === 0) gs.communityChestCards = shuffleDeck(COMMUNITY_CHEST_CARDS);
      const card = gs.communityChestCards.shift();
      gs.lastCardDrawn = card;
      console.log(cyan(`\n--- COMMUNITY CHEST ---`));
      console.log(cyan(`"${card.text}"`));
      const { message } = applyCardEffect(card, gs, gs.players.indexOf(player));
      logEntry(gs, `${player.name} drew Community Chest: "${card.text}" — ${message}`);

      return green(`Applied: ${message}`);
    }

    case 'go_to_jail':
      player.inJail = true;
      player.position = 10;
      player.doubleCount = 0;
      player.diceRolled = true;
      logEntry(gs, `${player.name} landed on Go to Jail!`);

      return red('Go to Jail!');

    case 'jail':
      return green('Just visiting!');

    case 'free_parking':
      return green('Free Parking — enjoy the rest!');

    default:
      return '';
  }
}

// --- Buy property ---
async function handleBuyProperty(gs, player) {
  // Show properties that are on board squares the player could buy
  const unowned = gs.properties.filter(p => !p.ownerId);
  if (unowned.length === 0) {
    console.log(yellow('No unowned properties left.'));
    await pause();
    return;
  }

  // Group by color for readability
  console.log('');
  console.log(bold('UNOWNED PROPERTIES'));
  unowned.forEach((p, i) => {
    const hcost = HOUSE_COSTS[p.color] ? ` (house cost $${HOUSE_COSTS[p.color]})` : '';
    console.log(`  [${i + 1}] ${p.name} (${p.color}) — Price: $${p.price}  Base rent: $${p.rent[0]}${hcost}`);
  });
  console.log('  [0] Cancel');
  console.log('');

  const idxStr = await ask('Buy which property? ');
  const idx = parseInt(idxStr) - 1;
  if (isNaN(idx) || idx < 0 || idx >= unowned.length) return;

  const prop = unowned[idx];
  if (player.cash < prop.price) {
    console.log(red(`Insufficient funds. You have $${Math.round(player.cash)}, need $${prop.price}.`));
    await pause();
    return;
  }

  const confirm = await ask(`Buy ${prop.name} for $${prop.price}? (y/n): `);
  if (confirm !== 'y') return;

  player.cash -= prop.price;
  prop.ownerId   = player.userId;
  prop.ownerName = player.name;
  player.properties.push({ id: prop.id, name: prop.name, color: prop.color, value: prop.price });

  logEntry(gs, `${player.name} purchased ${prop.name} for $${prop.price}`);

  await dbSaveGame(currentGame.id, gs);
  await dbLogEvent(currentGame.id, 'property_purchase', { buyer: player.name, property: prop.name, price: prop.price });
  console.log(green(`Purchased ${prop.name}!`));
  await pause();
}

// --- Buy houses ---
async function handleBuyHouses(gs, player) {
  const myProps = getCompleteGroupProperties(player.userId, gs);
  if (myProps.length === 0) {
    console.log(yellow('You have no complete colour groups to build on.'));
    await pause();
    return;
  }

  console.log('');
  console.log(bold('YOUR COMPLETE COLOUR GROUPS'));
  myProps.forEach((p, i) => {
    const hcost = HOUSE_COSTS[p.color] || 0;
    console.log(`  [${i + 1}] ${p.name} (${p.color}) — current houses: ${p.houses}/5  cost: $${hcost}/house`);
  });
  console.log('');

  let totalCost = 0;
  const purchases = [];

  for (let i = 0; i < myProps.length; i++) {
    const prop = myProps[i];
    const maxBuy = 5 - prop.houses;
    if (maxBuy === 0) { console.log(`  ${prop.name} is maxed out.`); continue; }
    const hcost = HOUSE_COSTS[prop.color] || 0;
    const numStr = await ask(`Houses to add on ${prop.name} (0-${maxBuy}, $${hcost} each): `);
    const num = parseInt(numStr) || 0;
    if (num < 0 || num > maxBuy) { console.log(yellow('Invalid number — skipped.')); continue; }
    totalCost += num * hcost;
    purchases.push({ prop, num });
  }

  if (purchases.length === 0 || totalCost === 0) return;

  if (player.cash < totalCost) {
    console.log(red(`Insufficient funds. Cost: $${totalCost}, You have: $${Math.round(player.cash)}.`));
    await pause();
    return;
  }

  const confirm = await ask(`Buy houses for total $${totalCost}? (y/n): `);
  if (confirm !== 'y') return;

  player.cash -= totalCost;
  purchases.forEach(({ prop, num }) => { prop.houses += num; });

  logEntry(gs, `${player.name} bought houses/hotels for $${totalCost}`);

  await dbSaveGame(currentGame.id, gs);
  await dbLogEvent(currentGame.id, 'house_purchase', { player: player.name, cost: totalCost });
  console.log(green(`Houses purchased!`));
  await pause();
}

// --- Manage debt ---
async function handleDebt(gs, player) {
  console.log('');
  console.log(bold('DEBT MANAGEMENT'));
  console.log('[1] Issue new debt   [2] Settle existing debt   [0] Cancel');
  console.log('');
  const choice = await ask('> ');

  if (choice === '1') {
    const amtStr  = await ask('Loan amount: $');
    const rateStr = await ask('Interest rate (%): ');
    const amount  = parseFloat(amtStr);
    const rate    = parseFloat(rateStr);
    if (isNaN(amount) || amount <= 0 || isNaN(rate) || rate < 0) {
      console.log(red('Invalid values.'));
      await pause();
      return;
    }
    const debt = { id: `debt-${Date.now()}`, principal: amount, interestRate: rate, issueDate: new Date().toISOString() };
    player.debts.push(debt);
    player.cash += amount;
    logEntry(gs, `${player.name} issued debt: $${amount} @ ${rate}%`);

    await dbSaveGame(currentGame.id, gs);
    await dbLogEvent(currentGame.id, 'debt_issued', { issuer: player.name, amount, interestRate: rate });
    console.log(green(`Debt of $${amount} issued. Cash now $${Math.round(player.cash)}.`));
    await pause();

  } else if (choice === '2') {
    if (player.debts.length === 0) {
      console.log(yellow('No debts to settle.'));
      await pause();
      return;
    }
    player.debts.forEach((d, i) => {
      console.log(`  [${i + 1}] $${d.principal.toFixed(2)} @ ${d.interestRate}% (issued ${d.issueDate ? d.issueDate.substring(0, 10) : '?'})`);
    });
    const idxStr    = await ask('Settle which debt? ');
    const payStr    = await ask('Payment amount: $');
    const idx       = parseInt(idxStr) - 1;
    const payment   = parseFloat(payStr);
    if (isNaN(idx) || idx < 0 || idx >= player.debts.length || isNaN(payment) || payment <= 0) {
      console.log(red('Invalid input.'));
      await pause();
      return;
    }
    if (player.cash < payment) {
      console.log(red('Insufficient funds.'));
      await pause();
      return;
    }
    player.cash -= payment;
    player.debts[idx].principal -= payment;
    if (player.debts[idx].principal <= 0) {
      player.debts.splice(idx, 1);
      console.log(green('Debt fully settled!'));
    } else {
      console.log(green(`Paid $${payment}. Remaining: $${player.debts[idx].principal.toFixed(2)}`));
    }
    logEntry(gs, `${player.name} paid $${payment} towards debt`);

    await dbSaveGame(currentGame.id, gs);
    await dbLogEvent(currentGame.id, 'debt_payment', { payer: player.name, amount: payment });
    await pause();
  }
}

// --- Create IPO ---
async function handleIPO(gs, player) {
  if (player.properties.length === 0) {
    console.log(yellow('You need at least one property to create an IPO.'));
    await pause();
    return;
  }

  console.log('');
  console.log(bold('CREATE IPO'));
  const ticker    = (await ask('Ticker symbol (e.g. MBM): ')).toUpperCase();
  const sharesStr = await ask('Number of shares: ');
  const priceStr  = await ask('Price per share: $');

  const numShares    = parseInt(sharesStr);
  const pricePerShare = parseFloat(priceStr);

  if (!ticker || isNaN(numShares) || numShares < 1 || isNaN(pricePerShare) || pricePerShare <= 0) {
    console.log(red('Invalid values.'));
    await pause();
    return;
  }

  console.log('');
  console.log(bold('YOUR PROPERTIES (include in corporation?):'));
  player.properties.forEach((p, i) => {
    console.log(`  [${i + 1}] ${p.name} ($${p.value})`);
  });
  const selStr = await ask('Enter comma-separated numbers (e.g. 1,3): ');
  const selected = selStr.split(',')
    .map(s => parseInt(s.trim()) - 1)
    .filter(i => i >= 0 && i < player.properties.length);

  if (selected.length === 0) {
    console.log(red('No assets selected.'));
    await pause();
    return;
  }

  const assets = selected.map(i => player.properties[i]);
  const confirm = await ask(`Create ${ticker} with ${numShares} shares @ $${pricePerShare}/share? (y/n): `);
  if (confirm !== 'y') return;

  // Remove from player properties; update gs.properties ownership
  selected.sort((a, b) => b - a).forEach(i => {
    const asset = player.properties[i];
    const gsProp = gs.properties.find(p => p.id === asset.id);
    if (gsProp) { gsProp.ownerId = null; gsProp.ownerName = null; }
    player.properties.splice(i, 1);
  });

  const corp = {
    id: `corp-${Date.now()}`,
    ticker,
    name: `${ticker} Corporation`,
    founderId:    player.userId,
    founderName:  player.name,
    totalShares:  numShares,
    pricePerShare,
    assets,
    shareholders: [{ userId: player.userId, name: player.name, shares: numShares }],
  };
  gs.corporations.push(corp);
  player.corporations.push({ ticker, sharesOwned: numShares, totalShares: numShares, pricePerShare });

  logEntry(gs, `${player.name} created ${ticker} IPO — ${numShares} shares @ $${pricePerShare}`);

  await dbSaveGame(currentGame.id, gs);
  await dbLogEvent(currentGame.id, 'ipo_created', { founder: player.name, ticker, shares: numShares, pricePerShare });
  console.log(green(`${ticker} IPO created!`));
  await pause();
}

// --- Market ---
async function handleMarket(gs) {
  console.log('');
  console.log(bold('MARKET'));
  console.log('[1] Trade properties   [2] Make payment   [0] Cancel');
  console.log('');
  const choice = await ask('> ');

  if (choice === '1') {
    // Pick player1
    console.log('Players:');
    gs.players.forEach((p, i) => { if (!p.bankrupt) console.log(`  [${i + 1}] ${p.name}  $${Math.round(p.cash)}`); });
    const p1IdxStr = await ask('Player 1 index: ');
    const p2IdxStr = await ask('Player 2 index: ');
    const p1 = gs.players[parseInt(p1IdxStr) - 1];
    const p2 = gs.players[parseInt(p2IdxStr) - 1];
    if (!p1 || !p2 || p1 === p2) { console.log(red('Invalid players.')); await pause(); return; }

    const p1CashStr = await ask(`Cash from ${p1.name}: $`);
    const p2CashStr = await ask(`Cash from ${p2.name}: $`);
    const p1Cash = parseFloat(p1CashStr) || 0;
    const p2Cash = parseFloat(p2CashStr) || 0;

    // Props from p1
    if (p1.properties.length > 0) {
      console.log(`\n${p1.name}'s properties:`);
      p1.properties.forEach((p, i) => console.log(`  [${i + 1}] ${p.name}`));
    }
    const p1selStr = await ask(`Properties from ${p1.name} (comma-separated indices, or blank): `);
    const p1selected = p1selStr ? p1selStr.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < p1.properties.length) : [];

    // Props from p2
    if (p2.properties.length > 0) {
      console.log(`\n${p2.name}'s properties:`);
      p2.properties.forEach((p, i) => console.log(`  [${i + 1}] ${p.name}`));
    }
    const p2selStr = await ask(`Properties from ${p2.name} (comma-separated indices, or blank): `);
    const p2selected = p2selStr ? p2selStr.split(',').map(s => parseInt(s.trim()) - 1).filter(i => i >= 0 && i < p2.properties.length) : [];

    const confirm = await ask('Execute trade? (y/n): ');
    if (confirm !== 'y') return;

    // Transfer cash
    p1.cash += p2Cash - p1Cash;
    p2.cash += p1Cash - p2Cash;

    // Transfer p1 assets → p2
    p1selected.sort((a, b) => b - a).forEach(i => {
      const asset = p1.properties.splice(i, 1)[0];
      p2.properties.push(asset);
      const gsProp = gs.properties.find(p => p.id === asset.id);
      if (gsProp) { gsProp.ownerId = p2.userId; gsProp.ownerName = p2.name; }
    });
    // Transfer p2 assets → p1
    p2selected.sort((a, b) => b - a).forEach(i => {
      const asset = p2.properties.splice(i, 1)[0];
      p1.properties.push(asset);
      const gsProp = gs.properties.find(p => p.id === asset.id);
      if (gsProp) { gsProp.ownerId = p1.userId; gsProp.ownerName = p1.name; }
    });

    logEntry(gs, `Trade: ${p1.name} <-> ${p2.name}`);

    await dbSaveGame(currentGame.id, gs);
    await dbLogEvent(currentGame.id, 'transaction', { player1: p1.name, player2: p2.name, player1Cash: p1Cash, player2Cash: p2Cash, player1Assets: p1selected.length, player2Assets: p2selected.length });
    console.log(green('Trade completed.'));
    await pause();

  } else if (choice === '2') {
    console.log('Players:');
    gs.players.forEach((p, i) => { if (!p.bankrupt) console.log(`  [${i + 1}] ${p.name}  $${Math.round(p.cash)}`); });
    const fromIdxStr = await ask('From player index: ');
    const toIdxStr   = await ask('To player index: ');
    const amtStr     = await ask('Amount: $');
    const fromPlayer = gs.players[parseInt(fromIdxStr) - 1];
    const toPlayer   = gs.players[parseInt(toIdxStr) - 1];
    const amount     = parseFloat(amtStr);

    if (!fromPlayer || !toPlayer || isNaN(amount) || amount <= 0) {
      console.log(red('Invalid input.'));
      await pause();
      return;
    }
    if (fromPlayer.cash < amount) {
      console.log(red('Insufficient funds.'));
      await pause();
      return;
    }
    fromPlayer.cash -= amount;
    toPlayer.cash   += amount;
    logEntry(gs, `${fromPlayer.name} paid $${amount} to ${toPlayer.name}`);

    await dbSaveGame(currentGame.id, gs);
    await dbLogEvent(currentGame.id, 'payment', { from: fromPlayer.name, to: toPlayer.name, amount });
    console.log(green(`Paid $${amount} from ${fromPlayer.name} to ${toPlayer.name}.`));
    await pause();
  }
}

// --- View / buy into corporations ---
async function handleViewCorps(gs, player) {
  if (!gs.corporations || gs.corporations.length === 0) {
    console.log(yellow('No corporations have been created yet.'));
    await pause();
    return;
  }

  console.log('');
  console.log(bold('CORPORATIONS'));
  gs.corporations.forEach((corp, i) => {
    const sold = corp.shareholders.reduce((s, sh) => s + sh.shares, 0);
    const avail = corp.totalShares - sold;
    const myShares = (corp.shareholders.find(s => s.userId === player.userId) || {}).shares || 0;
    console.log(`  [${i + 1}] ${corp.ticker} — ${corp.founderName} — ${avail} of ${corp.totalShares} shares available @ $${corp.pricePerShare}/share`);
    console.log(`       Assets: ${corp.assets.map(a => a.name).join(', ')}`);
    if (myShares) console.log(green(`       You own: ${myShares} shares`));
  });
  console.log('  [0] Done');
  console.log('');

  const choiceStr = await ask('Buy into which corporation? ');
  const corpIdx = parseInt(choiceStr) - 1;
  if (isNaN(corpIdx) || corpIdx < 0 || corpIdx >= gs.corporations.length) return;

  const corp = gs.corporations[corpIdx];
  if (corp.founderId === player.userId) {
    console.log(yellow('You are the founder — you already hold all initial shares.'));
    await pause();
    return;
  }
  const sold = corp.shareholders.reduce((s, sh) => s + sh.shares, 0);
  const avail = corp.totalShares - sold;
  if (avail === 0) { console.log(yellow('No shares available.')); await pause(); return; }

  const numStr = await ask(`How many shares? (max ${avail}): `);
  const num    = parseInt(numStr);
  if (isNaN(num) || num < 1 || num > avail) { console.log(red('Invalid number.')); await pause(); return; }

  const totalCost = num * corp.pricePerShare;
  if (player.cash < totalCost) {
    console.log(red(`Insufficient funds. Cost: $${totalCost}, You have: $${Math.round(player.cash)}.`));
    await pause();
    return;
  }

  const confirm = await ask(`Buy ${num} shares of ${corp.ticker} for $${totalCost}? (y/n): `);
  if (confirm !== 'y') return;

  player.cash -= totalCost;

  // Pay founder
  const founder = gs.players.find(p => p.userId === corp.founderId);
  if (founder) founder.cash += totalCost;

  const existing = corp.shareholders.find(s => s.userId === player.userId);
  if (existing) existing.shares += num;
  else corp.shareholders.push({ userId: player.userId, name: player.name, shares: num });

  const myCorpEntry = player.corporations.find(c => c.ticker === corp.ticker);
  if (myCorpEntry) myCorpEntry.sharesOwned += num;
  else player.corporations.push({ ticker: corp.ticker, sharesOwned: num, totalShares: corp.totalShares, pricePerShare: corp.pricePerShare });

  logEntry(gs, `${player.name} bought ${num} shares of ${corp.ticker} for $${totalCost}`);

  await dbSaveGame(currentGame.id, gs);
  await dbLogEvent(currentGame.id, 'share_purchase', { buyer: player.name, ticker: corp.ticker, shares: num, totalCost });
  console.log(green(`Bought ${num} shares of ${corp.ticker}!`));
  await pause();
}

// --- End turn ---
async function handleEndTurn(gs, player) {
  if (!player.diceRolled && (player.position || 0) !== 0) {
    const confirm = await ask('You have not rolled yet. End turn anyway? (y/n): ');
    if (confirm !== 'y') return;
    logEntry(gs, `Note: ${player.name} ended turn without rolling.`);

  }

  // Reset turn fields
  player.diceRolled  = false;
  player.doubleCount = 0;

  // Interest accrual
  let totalInterest = 0;
  player.debts.forEach(debt => {
    const interest = debt.principal * (debt.interestRate / 100);
    debt.principal += interest;
    totalInterest  += interest;
  });
  if (totalInterest > 0) {
    player.cash -= totalInterest;
    console.log(yellow(`Interest charged: $${totalInterest.toFixed(2)}`));
    logEntry(gs, `${player.name} was charged $${totalInterest.toFixed(2)} in interest.`);

    await dbLogEvent(currentGame.id, 'interest_accrual', { player: player.name, interestCharged: totalInterest });
  }

  // Bankruptcy check
  if (player.cash < 0 && !player.bankrupt) {
    player.bankrupt = true;
    console.log(red(`${player.name} has gone BANKRUPT!`));
    logEntry(gs, `${player.name} has gone BANKRUPT!`);

    await dbLogEvent(currentGame.id, 'bankruptcy', { player: player.name });
  }

  // Advance to next non-bankrupt player
  const total = gs.players.length;
  let nextIndex = (gs.currentPlayerIndex + 1) % total;
  let safety = 0;
  while (gs.players[nextIndex].bankrupt && safety < total) {
    nextIndex = (nextIndex + 1) % total;
    safety++;
  }
  gs.currentPlayerIndex = nextIndex;
  const nextPlayer = gs.players[nextIndex];

  logEntry(gs, `${player.name} ended their turn. It's now ${nextPlayer.name}'s turn.`);


  await dbSaveGame(currentGame.id, gs);
  await dbLogEvent(currentGame.id, 'turn_end', { player: player.name, nextPlayer: nextPlayer.name });

  console.log(green(`Turn ended. It's now ${nextPlayer.name}'s turn.`));

  // Check if only 1 active player remains
  const activePlayers = gs.players.filter(p => !p.bankrupt);
  if (activePlayers.length === 1) {
    console.log(green(`\nGame over! ${activePlayers[0].name} wins!`));
    await handleEndGame(gs);
  }

  await pause();
}

// --- End game ---
async function handleEndGame(gs) {
  const isHost = currentRoom && currentRoom.host_id === currentUser.id;

  // Anyone can view standings, but only host triggers the DB update
  const standings = gs.players.map(player => {
    const propertyValue = gs.properties
      .filter(p => p.ownerId === player.userId)
      .reduce((s, p) => s + (p.price || 0), 0);
    const corpValue = (player.corporations || []).reduce((s, c) => s + (c.sharesOwned * (c.pricePerShare || 0)), 0);
    const debtTotal = player.debts.reduce((s, d) => s + d.principal, 0);
    const netWorth  = player.cash + propertyValue + corpValue - debtTotal;
    return { name: player.name, cash: player.cash, propertyValue, corpValue, debtTotal, netWorth, bankrupt: player.bankrupt };
  });
  standings.sort((a, b) => b.netWorth - a.netWorth);

  console.log('');
  console.log(bold(hr('=')));
  console.log(bold('  FINAL STANDINGS'));
  console.log(bold(hr('=')));
  standings.forEach((p, i) => {
    const medal = i === 0 ? yellow('[1st]') : i === 1 ? '[2nd]' : `[${i + 1}th]`;
    const bust  = p.bankrupt ? red(' (bankrupt)') : '';
    console.log(`  ${medal} ${p.name}${bust}  Net Worth: $${p.netWorth.toFixed(0)}  (cash $${Math.round(p.cash)}, props $${p.propertyValue}, corps $${p.corpValue}, debts -$${p.debtTotal.toFixed(0)})`);
  });
  console.log(bold(hr('=')));

  if (isHost) {
    const confirm = await ask('Mark game as completed in database? (y/n): ');
    if (confirm === 'y') {
      await supabase.from('rooms').update({ status: 'completed' }).eq('id', currentRoom.id);
      await dbLogEvent(currentGame.id, 'game_ended', { reason: 'Host ended the game.', standings });
      console.log(green('Room marked as completed.'));
    }
  }

  await pause('Press Enter to return to lobby...');
}

// --- Show game log ---
async function showGameLog() {
  if (!currentGame) return;
  try {
    const events = await dbGetGameLog(currentGame.id);
    clr();
    console.log(bold('GAME LOG (last 10 events)'));
    console.log(hr());
    events.forEach(ev => {
      const ts = new Date(ev.created_at).toLocaleTimeString();
      console.log(`  [${ts}] ${ev.event_type}: ${JSON.stringify(ev.event_data).substring(0, 80)}`);
    });
    console.log(hr());
  } catch (err) {
    console.log(red('Failed to load log: ' + err.message));
  }
  await pause();
}

// ============================================================
// MAIN ENTRY POINT
// ============================================================
async function main() {
  clr();
  console.log(bold(''));
  console.log(bold('  ==================================='));
  console.log(bold('   MORTGAGE BACKED MONOPOLY — CLI'));
  console.log(bold('  ==================================='));
  console.log('');
  console.log('  A terminal client for the browser game.');
  console.log('  All game state is shared via Supabase.');
  console.log('');
  await pause('Press Enter to continue...');

  while (true) {
    await authMenu();
    await lobbyMenu();
    // If lobbyMenu returns (user logged out), authMenu runs again
    currentRoom = null;
    currentGame = null;
  }
}

main().catch(err => {
  console.error(red('Fatal error: ' + err.message));
  process.exit(1);
});
