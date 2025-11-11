-- Re-enable RLS on rooms table with proper policies
-- This fixes the security while maintaining functionality

-- First, re-enable RLS
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "rooms_insert" ON rooms;

-- Create proper policies for rooms table

-- SELECT: Users can see rooms they are members of
-- This is safe because it queries room_members which has RLS enabled
CREATE POLICY "rooms_select_policy" ON rooms
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

-- INSERT: Users can create rooms where they are the host
-- We need to allow the user to specify themselves as host
CREATE POLICY "rooms_insert_policy" ON rooms
    FOR INSERT
    TO authenticated
    WITH CHECK (
        host_id = auth.uid()
    );

-- UPDATE: Only the host can update their room
CREATE POLICY "rooms_update_policy" ON rooms
    FOR UPDATE
    TO authenticated
    USING (host_id = auth.uid())
    WITH CHECK (host_id = auth.uid());

-- DELETE: Only the host can delete their room
CREATE POLICY "rooms_delete_policy" ON rooms
    FOR DELETE
    TO authenticated
    USING (host_id = auth.uid());

-- Verify all policies are in place
SELECT
    tablename,
    policyname,
    cmd as operation,
    CASE
        WHEN qual IS NOT NULL THEN 'USING: ' || qual
        ELSE ''
    END as using_clause,
    CASE
        WHEN with_check IS NOT NULL THEN 'CHECK: ' || with_check
        ELSE ''
    END as check_clause
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'rooms'
ORDER BY policyname;

-- Test that RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE schemaname = 'public' AND tablename IN ('rooms', 'room_members', 'games', 'game_events');
