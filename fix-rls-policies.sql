-- Fix infinite recursion in RLS policies
-- Run this in your Supabase SQL Editor to fix the policies

-- Drop existing problematic policies
DROP POLICY IF EXISTS "Users can view rooms they are members of" ON rooms;
DROP POLICY IF EXISTS "Users can view members of rooms they are in" ON room_members;
DROP POLICY IF EXISTS "Room members can view game" ON games;
DROP POLICY IF EXISTS "Room members can update game state" ON games;
DROP POLICY IF EXISTS "Room members can view game events" ON game_events;
DROP POLICY IF EXISTS "Room members can create game events" ON game_events;

-- Create fixed policies for rooms
-- Allow users to see rooms where they are a member (using simple subquery)
CREATE POLICY "Users can view their rooms" ON rooms
    FOR SELECT USING (
        id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

-- Create fixed policies for room_members
-- Users can see members in the same rooms they are in
CREATE POLICY "Users can view room members" ON room_members
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

-- Create fixed policies for games
-- Users can view games for rooms they're in
CREATE POLICY "Room members can view games" ON games
    FOR SELECT USING (
        room_id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

-- Users can update games for rooms they're in
CREATE POLICY "Room members can update games" ON games
    FOR UPDATE USING (
        room_id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

-- Create fixed policies for game_events
-- Users can view events for games in their rooms
CREATE POLICY "Room members can view events" ON game_events
    FOR SELECT USING (
        game_id IN (
            SELECT g.id FROM games g
            WHERE g.room_id IN (
                SELECT room_id FROM room_members WHERE user_id = auth.uid()
            )
        )
    );

-- Users can create events for games in their rooms
CREATE POLICY "Room members can create events" ON game_events
    FOR INSERT WITH CHECK (
        game_id IN (
            SELECT g.id FROM games g
            WHERE g.room_id IN (
                SELECT room_id FROM room_members WHERE user_id = auth.uid()
            )
        )
    );

-- Verify policies are working
SELECT tablename, policyname FROM pg_policies WHERE schemaname = 'public' ORDER BY tablename, policyname;
