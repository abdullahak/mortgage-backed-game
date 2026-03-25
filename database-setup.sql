-- Mortgage Backed Monopoly Database Setup
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Rooms table
CREATE TABLE IF NOT EXISTS rooms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  invite_code TEXT UNIQUE NOT NULL,
  host_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  status TEXT DEFAULT 'waiting' CHECK (status IN ('waiting', 'in_progress', 'completed')),
  max_players INTEGER DEFAULT 8 CHECK (max_players >= 2 AND max_players <= 8),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Room members table
CREATE TABLE IF NOT EXISTS room_members (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  player_name TEXT NOT NULL,
  joined_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

-- Games table (stores active game state)
CREATE TABLE IF NOT EXISTS games (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id UUID REFERENCES rooms(id) ON DELETE CASCADE UNIQUE NOT NULL,
  game_state JSONB NOT NULL,
  current_player_index INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Game events table (transaction log)
CREATE TABLE IF NOT EXISTS game_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  game_id UUID REFERENCES games(id) ON DELETE CASCADE NOT NULL,
  player_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL,
  event_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_rooms_host_id ON rooms(host_id);
CREATE INDEX IF NOT EXISTS idx_rooms_invite_code ON rooms(invite_code);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status);
CREATE INDEX IF NOT EXISTS idx_room_members_room_id ON room_members(room_id);
CREATE INDEX IF NOT EXISTS idx_room_members_user_id ON room_members(user_id);
CREATE INDEX IF NOT EXISTS idx_games_room_id ON games(room_id);
CREATE INDEX IF NOT EXISTS idx_game_events_game_id ON game_events(game_id);

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add trigger to rooms table
DROP TRIGGER IF EXISTS update_rooms_updated_at ON rooms;
CREATE TRIGGER update_rooms_updated_at
    BEFORE UPDATE ON rooms
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add trigger to games table
DROP TRIGGER IF EXISTS update_games_updated_at ON games;
CREATE TRIGGER update_games_updated_at
    BEFORE UPDATE ON games
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
-- Note: These policies avoid circular references by defining room_members first.
-- If you hit RLS errors on an existing database, run fix-rls-complete.sql which
-- disables/drops/re-creates all policies from scratch.

-- Enable RLS on all tables
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- ROOM_MEMBERS policies (no dependencies — must be defined first)
CREATE POLICY "room_members_select" ON room_members
    FOR SELECT TO authenticated USING (true);

CREATE POLICY "room_members_insert" ON room_members
    FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "room_members_delete" ON room_members
    FOR DELETE TO authenticated USING (user_id = auth.uid());

-- ROOMS policies (safely references room_members)
-- BUG: This policy blocks new anonymous users from looking up a room by invite code
-- (they aren't in room_members yet, so the subquery returns no rows → "Room not found").
-- Fix: run the following in the Supabase SQL editor:
--   DROP POLICY "rooms_select" ON rooms;
--   CREATE POLICY "rooms_select" ON rooms FOR SELECT TO authenticated USING (true);
-- The invite code is the authorization mechanism; room names/codes are not sensitive.
CREATE POLICY "rooms_select" ON rooms
    FOR SELECT TO authenticated
    USING (id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid()));

CREATE POLICY "rooms_insert" ON rooms
    FOR INSERT TO authenticated WITH CHECK (host_id = auth.uid());

CREATE POLICY "rooms_update" ON rooms
    FOR UPDATE TO authenticated USING (host_id = auth.uid());

CREATE POLICY "rooms_delete" ON rooms
    FOR DELETE TO authenticated USING (host_id = auth.uid());

-- GAMES policies
CREATE POLICY "games_select" ON games
    FOR SELECT TO authenticated
    USING (room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid()));

CREATE POLICY "games_insert" ON games
    FOR INSERT TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id AND rooms.host_id = auth.uid()
        )
    );

CREATE POLICY "games_update" ON games
    FOR UPDATE TO authenticated
    USING (room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid()));

-- GAME_EVENTS policies
CREATE POLICY "game_events_select" ON game_events
    FOR SELECT TO authenticated
    USING (
        game_id IN (
            SELECT g.id FROM games g
            WHERE g.room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())
        )
    );

CREATE POLICY "game_events_insert" ON game_events
    FOR INSERT TO authenticated
    WITH CHECK (
        game_id IN (
            SELECT g.id FROM games g
            WHERE g.room_id IN (SELECT room_id FROM room_members WHERE user_id = auth.uid())
        )
    );

-- Grant permissions
GRANT ALL ON rooms TO authenticated;
GRANT ALL ON room_members TO authenticated;
GRANT ALL ON games TO authenticated;
GRANT ALL ON game_events TO authenticated;

-- Create a view for easier room querying with member count
CREATE OR REPLACE VIEW rooms_with_counts AS
SELECT
    r.*,
    COUNT(rm.id) as member_count
FROM rooms r
LEFT JOIN room_members rm ON r.id = rm.room_id
GROUP BY r.id;

GRANT SELECT ON rooms_with_counts TO authenticated;
