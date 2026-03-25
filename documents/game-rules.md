# Mortgage Backed Monopoly — Game Rules

> *"If they did it in 2008, it's fair game."*

---

## 1. Overview

Mortgage Backed Monopoly is a fully-digital, multiplayer parody of Monopoly layered with Wall Street financial mechanics. On top of buying properties and collecting rent, players can:

- **IPO their properties** — bundle them into corporations, issue shares, and sell equity to other players
- **Issue debt** — borrow cash against any interest rate you set, with compounding interest
- **Trade freely** — swap cash and properties with any player via the Market tab

The game runs entirely in the browser; there are no physical components, no banker, and no manual bookkeeping. All state is shared in real time.

This document assumes you already know standard Monopoly. It focuses on the new mechanics and the app's UI flow.

---

## 2. Getting Started

### Logging In

Navigate to the site and enter your email address. A magic link will be sent to that address — click it to authenticate. No password required. You can also join a room anonymously without logging in (limited features).

### Creating a Room

1. After logging in, click **Create Room** on the lobby page.
2. Share the invite code shown on screen with the other players.
3. Wait in the lobby until all players have joined.

### Joining a Room

1. Enter the invite code a friend shared with you and click **Join Room**.
2. You will appear in the lobby player list.

### Starting the Game

Only the host (room creator) can start the game. Once at least two players have joined, the host clicks **Start Game**. All players are redirected to the game screen automatically.

### Starting Cash

Each player begins with **$1,500**.

---

## 3. Standard Monopoly Rules

The following standard rules apply as normal:

- **Movement**: On your turn, roll two dice and move your token clockwise that many spaces.
- **GO**: Collect **$200** each time you pass or land on GO.
- **Taxes**: Landing on Income Tax costs $200; Luxury Tax costs $100.
- **Chance & Community Chest**: Draw a card and follow its instructions. Effects are applied automatically.
- **Free Parking**: No effect — just a rest square.

Differences or additions are noted in the sections below.

---

## 4. UI Tabs

The game screen has four tabs accessible via the top navigation bar:

| Tab | Purpose |
|-----|---------|
| **Game** | Main action hub — player cards, turn status, action buttons |
| **Market** | Execute trades and direct payments between players |
| **Log** | Full timestamped history of every game event |
| **Board** | Visual board — roll dice, move your token, buy houses/hotels |

**Board** is where movement happens. **Game** is where you manage assets (buy property, create IPOs, manage debt). Most turns involve switching between the two.

---

## 5. Movement & the Board Tab

1. Switch to the **Board** tab on your turn.
2. Click **Roll Dice** — your token moves automatically.
3. A toast notification describes what happened (e.g., "unowned — buy it via the Game tab", "rent owed", "Chance card drawn").
4. If you owe rent or taxes, a prompt will appear. Click **Pay** to confirm.
5. You can roll again only if you rolled doubles; otherwise, complete your actions and click **End Turn** in the **Game** tab.

**Rolling three consecutive doubles** sends you directly to Jail.

---

## 6. Buying Property

When you land on an unowned property:

1. A toast shows: *"[Property] is unowned — buy it via the Game tab."*
2. Switch to the **Game** tab and click **Buy Property**.
3. Select the property from the list. The purchase price is pre-filled but can be adjusted (useful for negotiated off-market deals).
4. Click **Confirm Purchase** — the price is deducted from your cash immediately.

You cannot buy property when it is not your turn.

---

## 7. Houses & Hotels

You may buy houses or a hotel on any property where you own the **complete color group** (all properties of that color).

1. Switch to the **Board** tab on your turn.
2. If you own a complete group, the **Buy Houses** button appears.
3. Use the **+/−** controls to select how many houses to add to each property in the group.
4. Click **Confirm** — the total cost is deducted from your cash.

### House Costs per Color Group

| Color Group | Cost per House |
|------------|---------------|
| Brown | $50 |
| Light Blue | $50 |
| Pink | $100 |
| Orange | $100 |
| Red | $150 |
| Yellow | $150 |
| Green | $200 |
| Dark Blue | $200 |

A **hotel** is the 5th improvement on a property (displayed as "H" on the board). Hotels cost the same per step as houses.

---

## 8. Rent

### Regular Properties

| Improvements | Rent |
|-------------|------|
| Unimproved, no monopoly | Base rent (printed on property) |
| Unimproved, monopoly | 2× base rent |
| 1 House | Rent table index 1 |
| 2 Houses | Rent table index 2 |
| 3 Houses | Rent table index 3 |
| 4 Houses | Rent table index 4 |
| Hotel | Rent table index 5 |

Owning all properties of a color (a **monopoly**) doubles the base rent even without houses.

### Railroads

Rent scales with how many railroads you own:

| Railroads Owned | Rent |
|----------------|------|
| 1 | $25 |
| 2 | $50 |
| 3 | $100 |
| 4 | $200 |

### Utilities

Rent = dice roll × multiplier:

| Utilities Owned | Multiplier |
|----------------|-----------|
| 1 | ×4 |
| 2 | ×10 |

### Paying Rent

When you land on an owned property, a **rent prompt** appears automatically. It shows the amount owed and your cash before and after. Click **Pay** to transfer funds to the owner. Rent is not automatically deducted — you must confirm.

---

## 9. IPOs (Corporations)

Any player may bundle one or more of their properties into a corporation and sell shares to other players.

### Creating an IPO

1. On your turn, go to the **Game** tab and click **Create IPO**.
2. Select the properties to include as corporate assets.
3. Set a **ticker symbol** (e.g., `MBS`), the **number of shares** to issue, and the **price per share**.
4. Click **Create** — the selected properties transfer into the corporation and you start with all shares.

### Selling Shares

Other players can buy available shares from the **View Corporations** modal (accessible via the **Game** tab during their turn). When a player buys shares:

- Their cash is deducted by `shares × price per share`.
- The **founder receives the payment directly** — corporations are not a separate treasury.
- The buyer's shareholding is recorded on the corporation ledger.

### Founder Mechanics

The founder retains all shares initially. They can sell as many as they choose (simply by setting the total share count high). The founder cannot buy shares in their own corporation.

### Corporation Value in Net Worth

A player's stake in any corporation contributes `sharesOwned × pricePerShare` to their net worth at game end.

---

## 10. Debt & Interest

Players can issue themselves debt at any interest rate they choose — simulating leveraged buyouts, margin loans, or mortgage-backed instruments.

### Issuing Debt

1. Go to the **Game** tab → **Manage Debt** → select **Issue New Debt**.
2. Enter the loan amount and interest rate (%). Optionally select collateral properties (informational only — collateral is not seized automatically).
3. Click **Confirm** — cash is added to your balance immediately.

### Interest Accrual

Interest compounds **every time you end your turn**:

```
New principal = principal × (1 + interestRate / 100)
Interest charged = new principal − old principal
```

The interest charged is deducted from your cash at turn end, before bankruptcy is checked. This means a high-interest loan can spiral quickly.

The default rate shown in the UI is **5%**, but you set the actual rate when issuing debt.

### Repaying Debt

1. Go to **Manage Debt** → select **Settle Debt**.
2. Choose the loan from the dropdown and enter a payment amount.
3. The payment reduces the principal. If the principal reaches $0 or below, the debt is fully cleared.

Partial payments are allowed.

---

## 11. Bankruptcy

Bankruptcy is triggered automatically when your **cash drops below $0 at the end of your turn** (after interest accrual).

- A `BANKRUPT` flag is set on your account.
- The game log shows a bankruptcy announcement.
- **You remain in the game** — you keep your properties and corporations — but you are **skipped** in the turn order until you recover.

There is no forced liquidation. Bankrupt players can still receive rent, dividends (if others buy their corporation shares), or card windfalls that restore positive cash.

---

## 12. Trading & Payments

### Player-to-Player Trades

Trades let two players exchange any combination of cash and properties simultaneously.

1. Go to the **Market** tab.
2. Select **Player 1** and **Player 2** from the dropdowns.
3. Enter how much cash each player contributes to the swap.
4. Check the properties each player is transferring.
5. Click **Execute Transaction** — all transfers happen atomically.

Trades can be done at any time, not only on your turn. There is no built-in negotiation UI — arrange the terms in chat or voice first.

### Direct Payments

For simple cash transfers (rent side-deals, fines, gifts):

1. Go to the **Market** tab → **Direct Payment** section.
2. Select the payer, the recipient, and the amount.
3. Click **Pay** — funds move instantly.

---

## 13. Jail

### Getting Sent to Jail

- Landing on the **Go to Jail** square (position 30).
- Drawing a "Go to Jail" Chance or Community Chest card.
- Rolling **three consecutive doubles** in one turn.

### Escaping Jail

On each turn while in Jail, roll the dice:

- **Roll doubles** → released immediately; move that many spaces.
- **No doubles, turns 1–2** → still in Jail; turn ends.
- **No doubles, turn 3** → forced to pay **$50 bail**, then move.

If you hold a **Get Out of Jail Free** card (from a Chance or Community Chest draw), it is used automatically on your next jail turn.

While in Jail you can still buy properties, create IPOs, manage debt, and trade via the Market tab.

---

## 14. Winning

### Automatic Win

If all players except one are bankrupt, the game ends automatically and that player is declared the winner.

### Host-Ended Game

At any point, the **host** can click **End Game** (visible only to them during their turn). The game ends immediately and winners are ranked by net worth.

---

## 15. Net Worth Formula

When the game ends, final standings are determined by:

```
Net Worth = Cash
          + Sum of owned property values
          + Sum of (sharesOwned × pricePerShare) across all corporations
          − Total outstanding debt principal
```

Property value is recorded at purchase price. There is no market appreciation or depreciation of individual properties — their book value stays at what you paid (or what was set when transferred in a trade).

---

## Quick Reference

| Thing | Value |
|-------|-------|
| Starting cash | $1,500 |
| Pass GO | $200 |
| Income Tax | $200 |
| Luxury Tax | $100 |
| Jail bail (forced, turn 3) | $50 |
| Interest timing | End of your turn |
| Bankruptcy trigger | Cash < $0 at turn end |
| Win condition | Last solvent player OR host ends game |
