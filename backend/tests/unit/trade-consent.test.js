'use strict';

const {
    MONOPOLY_PROPERTIES,
    applyAction,
    normalizeState,
    GameRuleError,
} = require('../../domain/gameRules');

function makeState() {
    const state = normalizeState({
        currentPlayerIndex: 0,
        players: [
            player('alice', 'Alice'),
            player('bob', 'Bob'),
        ],
        properties: MONOPOLY_PROPERTIES.map((prop, index) => ({
            ...prop,
            id: `prop-${index}`,
            ownerId: null,
            ownerName: null,
            houses: 0,
        })),
        corporations: [],
        marketOffers: [],
        gameLog: [],
        settings: { passGoAmount: 200, startingCash: 1500, interestRate: 5 },
        chanceCards: [],
        communityChestCards: [],
        lastDiceRoll: null,
        lastCardDrawn: null,
        ended: false,
    });
    ownProperty(state, 'prop-1', 'bob', 'Bob');
    return state;
}

function player(userId, name) {
    return {
        userId,
        name,
        cash: 1500,
        position: 0,
        bankrupt: false,
        inJail: false,
        jailTurns: 0,
        hasGetOutOfJailCard: false,
        doubleCount: 0,
        diceRolled: false,
        properties: [],
        corporations: [],
        debts: [],
    };
}

function ownProperty(state, propertyId, ownerId, ownerName) {
    const property = state.properties.find(prop => prop.id === propertyId);
    property.ownerId = ownerId;
    property.ownerName = ownerName;
}

function proposeCashForProperty(state) {
    return applyAction(state, 'alice', {
        type: 'propose_trade',
        payload: {
            player1Id: 'alice',
            player2Id: 'bob',
            player1Cash: 100,
            player2Cash: 0,
            player1AssetIds: [],
            player2AssetIds: ['prop-1'],
        },
    });
}

describe('trade consent rules', () => {
    test('proposing a trade creates a pending offer without transferring assets', () => {
        const result = proposeCashForProperty(makeState());
        const state = result.state;

        expect(state.marketOffers).toHaveLength(1);
        expect(state.marketOffers[0].status).toBe('pending');
        expect(state.marketOffers[0].proposedById).toBe('alice');
        expect(state.marketOffers[0].recipientId).toBe('bob');
        expect(new Date(state.marketOffers[0].expiresAt).getTime()).toBeGreaterThan(new Date(state.marketOffers[0].createdAt).getTime());
        expect(state.players.find(p => p.userId === 'alice').cash).toBe(1500);
        expect(state.players.find(p => p.userId === 'bob').cash).toBe(1500);
        expect(state.properties.find(prop => prop.id === 'prop-1').ownerId).toBe('bob');
        expect(result.events.some(event => event.type === 'trade_offer_proposed')).toBe(true);
    });

    test('recipient acceptance executes the proposed transfer', () => {
        const proposed = proposeCashForProperty(makeState());
        const offerId = proposed.state.marketOffers[0].id;

        const accepted = applyAction(proposed.state, 'bob', {
            type: 'accept_trade',
            payload: { offerId },
        });

        expect(accepted.state.marketOffers[0].status).toBe('accepted');
        expect(accepted.state.players.find(p => p.userId === 'alice').cash).toBe(1400);
        expect(accepted.state.players.find(p => p.userId === 'bob').cash).toBe(1600);
        expect(accepted.state.properties.find(prop => prop.id === 'prop-1').ownerId).toBe('alice');
        expect(accepted.events.some(event => event.type === 'trade_offer_accepted')).toBe(true);
    });

    test('accepting an expired trade offer clears it without transferring assets', () => {
        const proposed = proposeCashForProperty(makeState());
        const offerId = proposed.state.marketOffers[0].id;
        proposed.state.marketOffers[0].expiresAt = '2000-01-01T00:00:00.000Z';

        const expired = applyAction(proposed.state, 'bob', {
            type: 'accept_trade',
            payload: { offerId },
        });

        expect(expired.state.marketOffers[0].status).toBe('expired');
        expect(expired.state.marketOffers[0].cancelReason).toBe('timeout');
        expect(expired.state.players.find(p => p.userId === 'alice').cash).toBe(1500);
        expect(expired.state.players.find(p => p.userId === 'bob').cash).toBe(1500);
        expect(expired.state.properties.find(prop => prop.id === 'prop-1').ownerId).toBe('bob');
        expect(expired.events.some(event => event.type === 'trade_offer_expired')).toBe(true);
        expect(expired.events.some(event => event.type === 'trade_offer_accepted')).toBe(false);
    });

    test('expired pending offers are cleared on the next normal action', () => {
        const proposed = proposeCashForProperty(makeState());
        proposed.state.players.find(p => p.userId === 'alice').diceRolled = true;
        proposed.state.marketOffers[0].expiresAt = '2000-01-01T00:00:00.000Z';

        const ended = applyAction(proposed.state, 'alice', {
            type: 'end_turn',
            payload: {},
        });

        expect(ended.state.marketOffers[0].status).toBe('expired');
        expect(ended.state.marketOffers[0].cancelReason).toBe('timeout');
        expect(ended.events.some(event => event.type === 'trade_offer_expired')).toBe(true);
        expect(ended.events.some(event => event.type === 'turn_end')).toBe(true);
    });

    test('proposer cannot accept their own trade offer', () => {
        const proposed = proposeCashForProperty(makeState());
        const offerId = proposed.state.marketOffers[0].id;

        expect(() => applyAction(proposed.state, 'alice', {
            type: 'accept_trade',
            payload: { offerId },
        })).toThrow(GameRuleError);
    });

    test('bankrupt player cannot propose or accept trade offers', () => {
        const bankruptProposer = makeState();
        bankruptProposer.players.find(p => p.userId === 'alice').bankrupt = true;

        expect(() => proposeCashForProperty(bankruptProposer)).toThrow('Bankrupt player cannot act');

        const proposed = proposeCashForProperty(makeState());
        const offerId = proposed.state.marketOffers[0].id;
        proposed.state.players.find(p => p.userId === 'bob').bankrupt = true;

        expect(() => applyAction(proposed.state, 'bob', {
            type: 'accept_trade',
            payload: { offerId },
        })).toThrow('Bankrupt player cannot act');
    });

    test('stale property ownership rejects the offer at accept time', () => {
        const proposed = proposeCashForProperty(makeState());
        const offerId = proposed.state.marketOffers[0].id;
        ownProperty(proposed.state, 'prop-1', 'alice', 'Alice');

        expect(() => applyAction(proposed.state, 'bob', {
            type: 'accept_trade',
            payload: { offerId },
        })).toThrow('Can only transfer owned property');
    });

    test('recipient can decline without transferring assets', () => {
        const proposed = proposeCashForProperty(makeState());
        const offerId = proposed.state.marketOffers[0].id;

        const declined = applyAction(proposed.state, 'bob', {
            type: 'cancel_trade',
            payload: { offerId },
        });

        expect(declined.state.marketOffers[0].status).toBe('declined');
        expect(declined.state.players.find(p => p.userId === 'alice').cash).toBe(1500);
        expect(declined.state.properties.find(prop => prop.id === 'prop-1').ownerId).toBe('bob');
        expect(declined.events.some(event => event.type === 'trade_offer_canceled')).toBe(true);
    });

    test('host can cancel any pending trade offer and non-host cannot', () => {
        const proposed = proposeCashForProperty(makeState());
        const offerId = proposed.state.marketOffers[0].id;

        expect(() => applyAction(proposed.state, 'bob', {
            type: 'host_cancel_trade_offer',
            payload: { offerId },
        }, { hostId: 'alice' })).toThrow('Not the host');

        const canceled = applyAction(proposed.state, 'alice', {
            type: 'host_cancel_trade_offer',
            payload: { offerId },
        }, { hostId: 'alice' });

        expect(canceled.state.marketOffers[0].status).toBe('canceled');
        expect(canceled.state.marketOffers[0].cancelReason).toBe('host');
        expect(canceled.state.players.find(p => p.userId === 'alice').cash).toBe(1500);
        expect(canceled.state.properties.find(prop => prop.id === 'prop-1').ownerId).toBe('bob');
        expect(canceled.events.some(event =>
            event.type === 'trade_offer_canceled' &&
            event.data.reason === 'host'
        )).toBe(true);
    });
});
