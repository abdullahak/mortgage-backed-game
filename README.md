# Mortgage Backed Monopoly

> *"Play Monopoly Like Wall Street — If they did it in 2008, it's fair game"*

Mortgage Backed Monopoly is an extension pack for the classic Monopoly board game. It layers Wall Street-style financial mechanics on top of the base game — corporations, IPOs, mortgage-backed securities, share trading, and compound interest. The app tracks everything the cardboard can't.

---

## What You Need

- A standard Monopoly board game (physical)
- 2–8 players
- Internet access to run the app
- An account on the hosted app (or self-host — see `SETUP.md`)

---

## Setup

1. Create an account and sign in
2. One player creates a room and becomes the host
3. Share the invite code with other players
4. All players join, then the host clicks **Start Game**

For hosting and database setup, see `SETUP.md`.

---

## Game Overview

All players start with **$1,500**. Standard Monopoly rules govern dice rolling, movement, and rent collection. The app adds the financial layer on top: corporations, debt instruments, share prices, and interest.

On your turn, take your actions in the app — buy property, issue debt, run an IPO, trade — then click **End Turn** when done. The app handles the rest.

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

Tap **Buy Property** on your turn. Choose an unowned property and confirm the price. Cash is deducted immediately and the property appears on your player card. Any price negotiation happens outside the app — just adjust the input field before confirming.

---

### Create an IPO

Requires owning at least one property.

Tap **Create IPO** and select which properties to bundle into a corporation. Set a **ticker symbol**, **number of shares** (1–12), and **price per share**. The selected properties move out of your personal holdings into the corporation — you automatically hold all shares at founding. Other players can now buy shares on their turns.

---

### Issue Debt (Mortgage-Backed Securities)

Tap **Manage Debt → Issue New Debt**. Set a **loan amount** (you receive this cash immediately), an **interest rate (%)**, and optional collateral properties.

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

Tap **View Corporations** during your turn. Any corporation with available shares shows a **Buy** button (not visible to the founder). Enter the number of shares; cost is `shares × pricePerShare`. Cash transfers from your wallet to the founder's wallet immediately.

---

### Trade (Secondary Market)

Open the **Market** tab. Pick two players and enter what each side offers — any combination of cash and properties. Click **Execute Transaction** and all transfers happen atomically. Trades can happen any time; coordinate verbally with the other player first.

---

### Pay a Player

Also in the **Market** tab under **Payment System**. Choose a sender, a recipient, and an amount. Use this for rent, fines, or any payment the base game requires.

---

## End of Turn

Click **End Turn** when done with your actions. The app will automatically:

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

Falling below $0 cash triggers bankruptcy, checked automatically at each turn end. Bankrupt players can no longer act and their turns are skipped. Their properties and corporations remain in the game and can be acquired through trades if both parties agree outside the app.

---

## Strategy Tips

- **Leverage early.** Issue debt while interest is manageable to buy more properties before others do.
- **IPO fast.** Bundle your cheapest color groups to raise capital through share sales without giving up valuable assets.
- **Watch the interest clock.** Every turn-end drains cash. Over-leveraging compounds quickly and is usually fatal.
- **Use the market tab.** Negotiate trades and package deals — the secondary market is where fortunes shift.

---

## Disclaimer

This is a parody game, not affiliated with Hasbro. Don't try any of this in real life.
