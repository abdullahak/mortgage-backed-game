-- Complete RLS fix - removes the circular reference entirely
-- Run this in your Supabase SQL Editor

-- Disable RLS temporarily to clear all policies
ALTER TABLE rooms DISABLE ROW LEVEL SECURITY;
ALTER TABLE room_members DISABLE ROW LEVEL SECURITY;
ALTER TABLE games DISABLE ROW LEVEL SECURITY;
ALTER TABLE game_events DISABLE ROW LEVEL SECURITY;

-- Drop ALL existing policies
DROP POLICY IF EXISTS "Users can view their rooms" ON rooms;
DROP POLICY IF EXISTS "Authenticated users can create rooms" ON rooms;
DROP POLICY IF EXISTS "Room hosts can update their rooms" ON rooms;
DROP POLICY IF EXISTS "Room hosts can delete their rooms" ON rooms;

DROP POLICY IF EXISTS "Users can view room members" ON room_members;
DROP POLICY IF EXISTS "Authenticated users can join rooms" ON room_members;
DROP POLICY IF EXISTS "Users can leave rooms" ON room_members;

DROP POLICY IF EXISTS "Room members can view games" ON games;
DROP POLICY IF EXISTS "Room hosts can create games" ON games;
DROP POLICY IF EXISTS "Room members can update games" ON games;

DROP POLICY IF EXISTS "Room members can view events" ON game_events;
DROP POLICY IF EXISTS "Room members can create events" ON game_events;

-- Re-enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE games ENABLE ROW LEVEL SECURITY;
ALTER TABLE game_events ENABLE ROW LEVEL SECURITY;

-- ROOM_MEMBERS policies (must be first - no dependencies)
CREATE POLICY "room_members_select" ON room_members
    FOR SELECT
    TO authenticated
    USING (true);  -- Allow viewing all room members (simplified for now)

CREATE POLICY "room_members_insert" ON room_members
    FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

CREATE POLICY "room_members_delete" ON room_members
    FOR DELETE
    TO authenticated
    USING (user_id = auth.uid());

-- ROOMS policies (can now reference room_members safely)
CREATE POLICY "rooms_select" ON rooms
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "rooms_insert" ON rooms
    FOR INSERT
    TO authenticated
    WITH CHECK (host_id = auth.uid());

CREATE POLICY "rooms_update" ON rooms
    FOR UPDATE
    TO authenticated
    USING (host_id = auth.uid());

CREATE POLICY "rooms_delete" ON rooms
    FOR DELETE
    TO authenticated
    USING (host_id = auth.uid());

-- GAMES policies
CREATE POLICY "games_select" ON games
    FOR SELECT
    TO authenticated
    USING (
        room_id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

CREATE POLICY "games_insert" ON games
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM rooms
            WHERE rooms.id = room_id
            AND rooms.host_id = auth.uid()
        )
    );

CREATE POLICY "games_update" ON games
    FOR UPDATE
    TO authenticated
    USING (
        room_id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

-- GAME_EVENTS policies
CREATE POLICY "game_events_select" ON game_events
    FOR SELECT
    TO authenticated
    USING (
        game_id IN (
            SELECT g.id FROM games g
            WHERE g.room_id IN (
                SELECT room_id FROM room_members WHERE user_id = auth.uid()
            )
        )
    );

CREATE POLICY "game_events_insert" ON game_events
    FOR INSERT
    TO authenticated
    WITH CHECK (
        game_id IN (
            SELECT g.id FROM games g
            WHERE g.room_id IN (
                SELECT room_id FROM room_members WHERE user_id = auth.uid()
            )
        )
    );

-- Verify policies
SELECT
    schemaname,
    tablename,
    policyname,
    cmd as operation,
    qual as using_expression,
    with_check as with_check_expression
FROM pg_policies
WHERE schemaname = 'public'
ORDER BY tablename, policyname;
