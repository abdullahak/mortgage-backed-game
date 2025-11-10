# Mortgage Backed Monopoly

A Monopoly-style board game with a twist: players can create mortgage-backed securities, issue IPOs, trade equities, and engage in complex financial transactions - just like in 2008!

## Features

### Core Gameplay
- 2-8 player support
- Property buying and ownership tracking
- Building houses and hotels
- Rent collection with all levels
- Pass Go mechanics

### Financial Operations
- Debt issuance with collateral
- Debt settlement with interest
- Interest calculation and payment
- Cash operations (collect, pay bank)
- Net worth tracking

### Corporations & Securities
- Create corporations (IPOs)
- Transfer assets to corporations
- Equity ownership and trading
- Dividend distribution to shareholders
- Chairman management with auto-transfer
- Shareholder list management

### Market Operations
- Property trading between players
- Equity trading with shareholder updates
- Cash trading
- Multi-asset transactions
- Corporation cash management

### Game Management
- Save/Load functionality
- Auto-save every 2 minutes
- Turn-based gameplay
- Bankruptcy with asset liquidation
- Complete transaction logging
- Settings management
- Winner declaration

## Deployment

### Deploy to Netlify

[![Deploy to Netlify](https://www.netlify.com/img/deploy/button.svg)](https://app.netlify.com/start/deploy?repository=https://github.com/YOUR_USERNAME/mortgage-backed-game)

#### Manual Deployment

1. **Connect to Git:**
   - Go to [Netlify](https://netlify.com)
   - Click "Add new site" → "Import an existing project"
   - Connect your Git repository

2. **Configure Build Settings:**
   - Build command: (leave empty - no build needed)
   - Publish directory: `.` (current directory)
   - Click "Deploy site"

3. **Access Your Game:**
   - Netlify will provide a URL like `https://your-site-name.netlify.app`
   - The game will be available immediately!

#### Deploy from CLI

```bash
# Install Netlify CLI
npm install -g netlify-cli

# Login to Netlify
netlify login

# Deploy
netlify deploy --prod
```

### Local Development

Simply open `mortgage_backed_monopoly.html` in a web browser, or run a local server:

```bash
# Python 3
python3 -m http.server 8888

# Python 2
python -m SimpleHTTPServer 8888

# Node.js (if you have http-server installed)
npx http-server -p 8888
```

Then visit `http://localhost:8888/mortgage_backed_monopoly.html`

## How to Play

### Setup
1. Open the game in your browser
2. Choose number of players (2-8)
3. Enter player names
4. Click "Start Game"

### Playing
- **Buy Properties**: Click "Buy Property" to purchase available properties
- **Build**: Click "Build Houses/Hotels" to add buildings to your properties
- **Collect Rent**: When a player lands on your property, use "Collect Rent"
- **Pass Go**: Click when you pass Go to collect $200 (or custom amount)
- **Create IPO**: Bundle properties into a corporation and issue shares
- **Trade**: Use the Market tab to trade properties, equities, and cash
- **Debt**: Issue debt using properties as collateral, pay interest each turn
- **End Turn**: Complete your turn (pays interest if you have debts)

### Advanced Features
- **Corporations**: Create LLCs, manage shareholders, distribute dividends
- **Market Trading**: Trade any combination of cash, properties, and equities
- **Debt Management**: Issue collateralized debt, settle debts over time
- **Save/Load**: Save your game anytime, auto-saves every 2 minutes

## Game Rules

- **Starting Cash**: Each player starts with $1,500
- **Pass Go**: Collect $200 (configurable in settings)
- **Building Cost**: $50 per house, $50 to upgrade to hotel
- **Building Sale**: Sell buildings back for $25
- **Bankruptcy**: Declare bankruptcy if you can't pay debts
- **Win Condition**: Last player standing or highest net worth when game ends

## Technical Details

- **Technology**: Pure HTML, CSS, and JavaScript
- **Storage**: localStorage for save/load functionality
- **No Server Required**: Runs entirely in the browser
- **No Dependencies**: No external libraries needed
- **Mobile Responsive**: Works on all screen sizes

## Browser Compatibility

- Chrome/Edge: ✅ Full support
- Firefox: ✅ Full support
- Safari: ✅ Full support
- Mobile browsers: ✅ Full support

Requires localStorage support for save/load functionality.

## Documentation

- `FIXES_APPLIED.md` - Complete bug fix documentation
- `ADDITIONAL_FEATURES.md` - New features documentation

## License

MIT License - Feel free to use and modify!

## Credits

Created with Claude AI
Inspired by Monopoly and the 2008 financial crisis

---

**Disclaimer**: This is a game for entertainment purposes only. Not financial advice! 😄
