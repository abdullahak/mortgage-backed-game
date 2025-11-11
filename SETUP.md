# Mortgage Backed Monopoly - Setup Instructions

This guide will help you set up the multiplayer version of Mortgage Backed Monopoly with Supabase backend.

## Prerequisites

- A Supabase account (free tier is fine)
- A Netlify account (for hosting)
- Git installed on your computer

## Step 1: Create a Supabase Project

1. Go to [https://supabase.com](https://supabase.com) and sign up/login
2. Click "New Project"
3. Fill in your project details:
   - Name: `mortgage-backed-game` (or your preferred name)
   - Database Password: (generate a strong password and save it)
   - Region: Choose the closest region to you
4. Click "Create new project" and wait for it to finish setting up (takes about 2 minutes)

## Step 2: Set Up the Database

1. In your Supabase project dashboard, click on the **SQL Editor** in the left sidebar
2. Click "New query"
3. Copy the entire contents of `database-setup.sql` from this repository
4. Paste it into the SQL editor
5. Click "Run" to execute the SQL
6. You should see a success message. This creates all the necessary tables and security policies.

## Step 3: Configure Authentication

1. In your Supabase dashboard, go to **Authentication** > **Providers**
2. Make sure **Email** is enabled (it should be by default)
3. Optional: Configure email templates
   - Go to **Authentication** > **Email Templates**
   - Customize the confirmation and password reset emails if desired

## Step 4: Get Your Supabase Credentials

1. In your Supabase dashboard, click on **Project Settings** (gear icon in sidebar)
2. Click on **API** in the settings menu
3. You'll see two important values:
   - **Project URL** (looks like `https://xxxxx.supabase.co`)
   - **anon/public** key (starts with `eyJhbGci...`)
4. Keep this page open, you'll need these values in the next step

## Step 5: Configure the Application

1. Open the file `src/js/config.js` in your code editor
2. Replace the placeholder values with your actual Supabase credentials:

```javascript
const SUPABASE_URL = 'https://your-project.supabase.co'; // Your Project URL
const SUPABASE_ANON_KEY = 'your-anon-key-here'; // Your anon/public key
```

3. Save the file

## Step 6: Test Locally (Optional but Recommended)

1. Install a local web server if you don't have one:
   ```bash
   npm install -g http-server
   ```

2. Run the server from your project directory:
   ```bash
   http-server
   ```

3. Open your browser to `http://localhost:8080`
4. Test the authentication flow:
   - Sign up with a test email
   - Check your email for the confirmation link (if email confirmation is enabled)
   - Try logging in
   - Create a test game room

## Step 7: Deploy to Netlify

1. Make sure all your changes are committed to Git:
   ```bash
   git add .
   git commit -m "Configure Supabase backend"
   git push
   ```

2. Netlify should automatically deploy your changes
3. Wait for the deployment to complete
4. Visit your site at `https://mortgagebacked.netlify.app`

## Step 8: Test the Live Site

1. Go to your deployed site
2. Create an account
3. Create a game room
4. Copy the invite code
5. Open an incognito window or another browser
6. Sign up with a different account
7. Join the game using the invite code
8. Both windows should now show the waiting room

## Architecture Overview

### Pages

- **auth.html** - Login and signup page
- **lobby.html** - View and manage your game rooms
- **waiting.html** - Wait for players to join before starting (to be created)
- **game.html** - The actual game interface (to be created)

### Database Tables

- **rooms** - Game sessions with invite codes
- **room_members** - Players in each room
- **games** - Active game state (JSONB)
- **game_events** - Transaction log of all game actions

### Real-time Features

- Players joining/leaving rooms (via Supabase Realtime)
- Game state updates (via Supabase Realtime)
- Turn notifications

## Supabase Dashboard Quick Links

After setup, you can access these useful pages:

- **Table Editor**: View and edit data in your tables
- **Authentication**: Manage users
- **Database**: Run SQL queries
- **Storage**: For future features (player avatars, etc.)
- **Logs**: Debug issues

## Security

The database is protected by Row Level Security (RLS) policies that ensure:
- Users can only see rooms they are members of
- Only room hosts can start games
- Players can only update game state for rooms they're in
- All queries are automatically filtered by user authentication

## Troubleshooting

### "Invalid API key" error
- Double-check that you copied the correct anon/public key from Supabase
- Make sure there are no extra spaces or quotes

### Email confirmation not received
- Check your spam folder
- In Supabase, go to Authentication > Settings and disable "Enable email confirmations" for testing

### "Row Level Security policy violation"
- Make sure you ran the complete `database-setup.sql` file
- Check the Supabase logs for more details

### Real-time updates not working
- Make sure you have Realtime enabled in your Supabase project
- Go to Database > Replication and enable replication for the tables

## Next Steps

The basic multiplayer infrastructure is now set up! Next features to implement:

1. ✅ Authentication system
2. ✅ Room creation and joining
3. ⏳ Waiting room with real-time player list
4. ⏳ Game start functionality
5. ⏳ Multiplayer game board with state sync
6. ⏳ Turn-based gameplay
7. ⏳ Transaction history log

## Support

If you encounter any issues, check:
1. Browser console for JavaScript errors
2. Supabase logs (Database > Logs)
3. Network tab in browser dev tools

## Cost Estimates

**Supabase Free Tier Includes:**
- 500MB database
- 2GB bandwidth
- 50,000 monthly active users
- Unlimited API requests

This should be more than enough for personal use and testing with friends!
