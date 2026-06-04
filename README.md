# Mortgage Backed Monopoly

> *"Play Monopoly Like Wall Street — If they did it in 2008, it's fair game"*

Mortgage Backed Monopoly is a browser-based multiplayer parody of Monopoly with Wall Street-style financial mechanics layered on top: corporations, IPOs, mortgage-backed securities, share trading, and compound interest. The app runs the board, dice, payments, turn order, and financial state in real time.

---

## What You Need

- 2–8 players
- Internet access and a browser
- An account on the hosted app (or self-host — see `SETUP.md`)

---

## Setup

1. Create an account and sign in
2. One player creates a room and becomes the host
3. Share the invite code with other players
4. All players join, then the host clicks **Start Game**

For hosting and database setup, see `SETUP.md`.

For the production-readiness plan, see `documents/production-roadmap.md`.

---

## Game Overview

All players start with **$1,500**. The app handles dice rolling, board movement, rent, taxes, cards, turn order, and bankruptcy checks. The financial layer adds corporations, debt instruments, share prices, and interest.

On your turn, roll in the app, resolve the square you landed on, take any optional actions, then click **End Turn** when done.

---

## The Properties

| Color | Properties | Price |
|-------|-----------|-------|
| Brown | Mediterranean Ave, Baltic Ave | $60 |
| Light Blue | Oriental Ave, Vermont Ave, Connecticut Ave | $100–$120 |
| Pink | St. Charles Place, States Ave, Virginia Ave | $140–$160 |
| Orange | St. James Place, Tennessee Ave, New York Ave | $180–$200 |
| Red | Kentucky Ave, Indiana Ave, Illinois Ave | $220–$240 |
| Yellow | Atlantic Ave, Ventnor Ave, Marvin Gardens | $260–$280 |
| Green | Pacific Ave, North Carolina Ave, Pennsylvania Ave | $300–$320 |
| Dark Blue | Park Place, Boardwalk | $350–$400 |
| Railroads | Pennsylvania RR, B&O RR, Short Line | $200 |
| Utilities | Electric Company, Water Works | $150 |

Full rent ladders are tracked in the app.

---

## Actions

### Buy Property

Tap **Buy Property** after landing on an unowned property. Cash is deducted immediately and the property appears on your player card.

---

### Create an IPO

Requires owning at least one property.

Tap **Create IPO** and select which properties to bundle into a corporation. Set a **ticker symbol**, **number of shares** (1–12), and **listing price per share**. The selected properties move out of your personal holdings into the corporation, you receive all founder shares, and those founder-held shares are listed for other players to buy on their turns.

---

### Issue Debt (Mortgage-Backed Securities)

Tap **Manage Debt → Issue New Debt**. Set a **loan amount** (you receive this cash immediately) and optional collateral properties. The current game uses the room's debt rate, shown in the modal.

Interest accrues automatically every time you end your turn:

```
new principal = principal × (1 + interestRate / 100)
```

The difference is deducted from your cash. Default rate: **5% per turn**.

---

### Settle Debt

Tap **Manage Debt → Settle Existing Debt**. Select the debt and enter a payment amount. Cash is deducted and the principal reduced. Debt is removed when fully paid.

---

### Buy Shares

Tap **Corporations** during your turn. Any corporation with listed shares shows a **Buy** button. Enter the number of shares; cost is `shares × listingPrice`. Normal IPO purchases transfer cash to the founder and move those shares from the founder to the buyer. If bankruptcy returned shares to the corporation treasury, those treasury shares can also be bought; that cash goes into the corporation treasury.

Player net worth values corporation stakes by net asset value, not listing price: corporation-owned property value plus treasury cash minus corporation debt, divided by total shares. Share value is floored at $0 if the corporation's net asset value is negative.

If corporate debt interest pushes a corporation below $0 treasury cash, the corporation becomes insolvent. Its properties return to the bank, houses/hotels are cleared, corporation debts and shareholder positions are wiped, the chairman seat closes, and no further shares/debt/governance actions are available for that corporation.

---

### Trade (Secondary Market)

Open the **Market** tab. Pick two players and enter what each side offers — any combination of cash and properties. Click **Propose Transaction** to send a pending trade offer. The other involved player must accept before cash or properties move.

Pending trade offers expire after the configured trade-offer timeout. Expired offers never move cash or property; the next game action clears them. The host can also cancel abandoned pending trade offers. Host cancellation does not move cash or properties.

### Auctions

If you land on an unowned property and do not buy it, click **Start Auction** from the purchase modal. Active players can bid or pass from the Game tab. The high bidder pays the winning bid and receives the property once every other active player has passed; if everyone passes before a bid, the property remains unowned. Auctions have a two-minute idle timeout that refreshes on bids and passes; the next game action resolves an expired auction to the high bidder, or no sale if there were no bids.

The host can cancel a stuck auction. Canceling an auction does not move cash or property.

### Host Pause and Cleanup

The host can pause a live game from the game screen. While paused, normal player actions are blocked for everyone until the host resumes. The host can still resume, end the game, or clear stuck auctions and trade offers.

---

### Pay a Player

Also in the **Market** tab under **Payment System**. Choose a recipient and amount. Payments are sent from your player.

---

## End of Turn

Click **End Turn** after rolling and resolving your square. The UI disables End Turn until you roll, and the server rejects end-turn actions from an unrolled state. The app will automatically:

1. Apply interest on all your outstanding debts
2. Check for bankruptcy (cash below $0) — bankrupt players are skipped in future turns
3. Pass the turn to the next active player

---

## Win Conditions

**Last player solvent:** When all other players go bankrupt, the remaining player wins automatically.

**Host-triggered end:** The host can click **End Game** at any time. The app ranks all players by net worth:

```
Net Worth = Cash + Property Values + (Shares Owned × Share Price) − Outstanding Debt
```

Highest net worth wins.

---

## Bankruptcy

Falling below $0 cash or ending the turn with unpaid rent triggers final bankruptcy. Bankrupt players can no longer act, their turns are skipped, and pending trade offers involving them are canceled. If bankruptcy is caused by unpaid rent to a player, directly owned properties and player-held corporation shares transfer to that creditor with houses/hotels cleared. If rent is owed to a corporation, directly owned properties transfer to that corporation while player-held shares return to the issuing corporation's treasury share pool. Bank, tax, card, and interest bankruptcies return direct properties to the bank and return player-held shares to the issuing corporation's treasury share pool. Corporation-owned properties remain with the corporation unless the corporation itself becomes insolvent.

---

## Strategy Tips

- **Leverage early.** Issue debt while interest is manageable to buy more properties before others do.
- **IPO fast.** Bundle your cheapest color groups to raise capital through share sales without giving up valuable assets.
- **Watch the interest clock.** Every turn-end drains cash. Over-leveraging compounds quickly and is usually fatal.
- **Use the market tab.** Negotiate trades and package deals — the secondary market is where fortunes shift.

---

## Disclaimer

This is a parody game, not affiliated with Hasbro. Don't try any of this in real life.
