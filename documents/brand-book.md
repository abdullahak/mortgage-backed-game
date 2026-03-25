# Mortgage Backed Monopoly — Brand Book

## Brand Identity & Philosophy

### Game Name
**Mortgage Backed Monopoly**

### Tagline
*"If they did it in 2008, it's fair game."*

### Positioning
A satirical financial board game that lets players recreate — and profit from — the mechanics of the 2008 housing crisis. Securitization, overleveraging, collateral fraud, and regulatory capture are not bugs; they're features.

### The "Green = Money" Thematic Rationale

Green was the obvious choice in retrospect. Dollar bills are green. Monopoly houses are green. "Greenbacks" is what they called American currency. The 2008 crisis was, at its core, about the relentless pursuit of green — and the catastrophic consequences when the music stopped.

The color palette leans into this symbolism hard:
- **Deep forest greens** signal authority and old money — the kind that writes the rules
- **Bright emerald and jade** are the interactive, clickable world — money in motion
- **Gold accents** are Wall Street excess — bonuses, fees, and premium moments
- **White** is the clean surface everything pretends to be
- **Red** is reserved for bankruptcy and ruin — the only honest color in the room

The old purple/blue gradient read as "generic fintech SaaS." This palette reads as *money*.

### Brand Personality
- **Irreverent** — never earnest about finance, always slightly winking
- **Satirical** — the mechanics are a joke about real events that weren't funny
- **Sharp** — clear, direct, no filler; like a well-structured CDO pitch deck (that's actually a ticking bomb)
- **Confident** — doesn't explain the joke, trusts the player to get it

---

## Color System

### Design Principle
Use greens with hierarchy: dark greens carry authority, mid greens carry interaction, light greens carry support. Gold appears sparingly for premium and warning moments. Red appears only for genuine danger states (bankruptcy, debt due). Never use the old purple tones.

### Primary Greens

| Token | Hex | Usage |
|---|---|---|
| `--color-forest` | `#1B4332` | Deep authority green — headings, nav dominant, gradient end |
| `--color-emerald` | `#2D6A4F` | Rich interactive green — primary buttons, active states |
| `--color-jade` | `#40916C` | Mid-tone interactive — secondary buttons, borders, focus rings |
| `--color-sage` | `#52B788` | Lighter support — hover tints, secondary elements |
| `--color-mint` | `#74C69D` | Accent highlights |
| `--color-pale` | `#B7E4C7` | Background tints, badge fills |
| `--color-ghost` | `#D8F3DC` | Very light section backgrounds |
| `--color-surface` | `#F0FBF4` | Page/card surface (replaces off-white) |

### Gold Accents (Wall Street money)

| Token | Hex | Usage |
|---|---|---|
| `--color-gold-dark` | `#92680A` | Premium text, icons, gradient start |
| `--color-gold` | `#D4A017` | Warning states, "Chance" squares, highlights |
| `--color-gold-pale` | `#FFF8DC` | Gold-tinted card backgrounds |

### Neutrals

| Token | Hex | Usage |
|---|---|---|
| `--color-ink` | `#0D1F2D` | Primary text (near-black with green undertone) |
| `--color-slate` | `#374151` | Secondary text |
| `--color-mist` | `#6B7280` | Tertiary / disabled text |
| `--color-border` | `#D1FAE5` | Default borders (green-tinted) |
| `--color-divider` | `#E5E7EB` | Dividers |
| `--color-white` | `#FFFFFF` | Pure white |

### Semantic Colors

| Purpose | Color |
|---|---|
| Success | `--color-emerald` (`#2D6A4F`) |
| Danger | `#DC2626` / `#B91C1C` (bankruptcy, rent due) |
| Warning | `--color-gold` (`#D4A017`) |
| Info | `#0EA5E9` (minimal — only for info badges) |

### Gradients

| Name | Value | Usage |
|---|---|---|
| Primary | `linear-gradient(135deg, #1B4332, #40916C)` | Nav active tab, primary gradient elements |
| Accent | `linear-gradient(135deg, #2D6A4F, #52B788)` | Buttons, interactive gradient |
| Hero BG | `linear-gradient(135deg, #0D1F2D 0%, #1B4332 50%, #2D6A4F 100%)` | Landing page hero background |
| Gold shimmer | `linear-gradient(135deg, #92680A, #D4A017)` | Premium elements, Chance card accents |

---

## Typography

### Font Stack
```css
font-family: 'Arial', sans-serif;
```
System fonts keep it fast and unpretentious — ironic for a game about financial engineering.

### Weight Scale
- **400** — body copy
- **600** — labels, nav tabs, button text
- **700** — headings, player names, stat values

### Size Scale
- `0.85em` — small labels, footnotes
- `0.9em` — secondary text, timestamps
- `1em` — base body
- `1.1em` — nav tabs, slightly elevated labels
- `1.2em` — stat values, modest emphasis
- `1.5em` — modal headers, player names
- `1.8em` — mobile h1
- `2em` — rent amounts, winner names
- `2.5em` — desktop h1

### Gradient Text
When text uses a gradient (decorative headings), use the Primary gradient:
```css
background: linear-gradient(135deg, #1B4332, #40916C);
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;
```

---

## Component Rules

### Buttons

| Variant | Style |
|---|---|
| `.btn` (primary) | `linear-gradient(45deg, #2D6A4F, #40916C)` — emerald to jade |
| `.btn-primary` | Same as `.btn` |
| `.btn-secondary` | `linear-gradient(45deg, #95a5a6, #7f8c8d)` — unchanged |
| `.btn-danger` | `linear-gradient(45deg, #e74c3c, #c0392b)` — unchanged |
| `.btn-success` | `linear-gradient(45deg, #2ecc71, #27ae60)` — unchanged |
| Hover shadow | `rgba(64, 145, 108, 0.3)` — jade rgba |
| Disabled | `#95a5a6` — unchanged |

### Nav Tabs
- Default: transparent, gray text
- Hover: `rgba(64, 145, 108, 0.1)` tint
- Active: `linear-gradient(45deg, #2D6A4F, #40916C)`, white text

### Form Inputs
- Default border: `#ecf0f1`
- Focus border: `#40916C` (jade)
- No purple focus ring

### Player Card (Current Turn)
- Border: `#40916C` (jade)
- Glow: `0 0 20px rgba(64, 145, 108, 0.2)` — jade rgba

### Board Standings
- Active turn row background: `rgba(64, 145, 108, 0.15)`
- Rank number color: `#40916C` (jade)
- Standings border-left: `#40916C` (jade)

### Game Log Entries
- `turn-start`: `rgba(64, 145, 108, 0.1)` background, `4px solid #40916C` left border
- `transaction`: green tint (unchanged — already green)
- `bankruptcy`: red tint (unchanged — red is correct here)

### Spinner
- `border-top: 4px solid #40916C` (jade)

### Invite Code Display
- Text color: `#2D6A4F` (emerald)
- Background tint: `rgba(64, 145, 108, 0.1)`

### Auth Help Links
- Color: `#40916C` (jade)

### Board Card Text (Last Card Drawn)
- Left border: `#40916C` (jade)

### Winner Name (Game Over)
- Color: `#2D6A4F` (emerald)

### Card Modal Effect Text
- Color: `#2D6A4F` (emerald)

### Player Badge
- `linear-gradient(45deg, #2D6A4F, #40916C)` — emerald to jade

### Room Card Hover
- Border: `#40916C` (jade)
- Shadow: `rgba(64, 145, 108, 0.2)`

### Room Invite Code Chip
- Background: `rgba(64, 145, 108, 0.1)`
- Text: `#40916C` (jade)

### Board Center Panel
- Background: `#d4edda` (keep — already green-tinted, works)

---

## Voice & Tone

### Core Voice
The game voice is a financial professional who knows the whole thing is a joke but maintains a straight face just long enough to make you uncomfortable.

### Principles
- **Jargon as punchline** — use finance terms correctly, but in absurd contexts
- **Understatement** — "a minor liquidity event" for bankruptcy
- **No hand-holding** — trust that players understand what they've signed up for
- **Never earnest** — sincerity would ruin it

### Examples

| Situation | Bad | Good |
|---|---|---|
| Player goes bankrupt | "You lost!" | "Liquidity event. Positions unwound." |
| Rent collection | "Pay $200 rent" | "Market rate. Non-negotiable." |
| Chance card | "Draw a chance card" | "The market has spoken." |
| Game over | "Congratulations, you won!" | "Last one standing. Probably fraud involved." |

---

## Icons & Imagery

### Emoji-Based Icon System
The game uses emoji for all icons — fast, no dependencies, thematically appropriate for a game running on a Raspberry Pi.

Key emoji usage:
- 🏠 — standard property / house
- 🏦 — bank / financial institution
- 💰 — cash / payment
- 📈 — market / IPO
- 💀 — bankruptcy
- 🎲 — dice / chance
- 🚂 — railroad / utility

### Board Square Colors
Board color bands preserve game clarity over brand purity — the Monopoly color system (brown, light blue, pink, orange, red, yellow, green, dark blue) remains intact. Brand greens do not replace board property colors.

---

## Do's and Don'ts

### DO
- ✅ Use dark greens (`#1B4332`, `#2D6A4F`) for authority and structure
- ✅ Use mid greens (`#40916C`, `#52B788`) for interactive elements
- ✅ Use light greens (`#D8F3DC`, `#F0FBF4`) for backgrounds and surfaces
- ✅ Use gold sparingly for premium / warning moments
- ✅ Keep red (`#DC2626`, `#e74c3c`) for all danger / bankruptcy states
- ✅ Use `#0D1F2D` (ink) instead of pure `#000000` for primary text
- ✅ Maintain sufficient contrast (WCAG AA minimum)

### DON'T
- ❌ Use purple (`#667eea`, `#764ba2`) anywhere — it's gone
- ❌ Use green for danger states — red is always danger
- ❌ Use pure black (`#000000`) for body text — use `--color-ink`
- ❌ Use gold as a primary color — it's an accent
- ❌ Stack multiple green gradients in the same visual region
- ❌ Use light greens for text — contrast will fail
- ❌ Introduce new brand colors without updating this document

---

## Rationale: Why Green Beats Purple

The previous purple/blue gradient (`#667eea → #764ba2`) is the default palette for approximately 40% of fintech dashboards. It communicates "SaaS product" not "satirical financial game."

Green communicates:
1. **Money** — culturally universal in American context ("the green," "greenbacks")
2. **Greed** — the thematic engine of the 2008 crisis
3. **Go** — Monopoly's most important square
4. **Growth** — what everyone was pretending was happening in 2006-2007
5. **Monopoly itself** — the game's houses and park squares have always been green

The satirical edge comes from using the color of prosperity to represent a game about its collapse.
