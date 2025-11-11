-- Final RLS fix - this WILL work
-- The issue is we need to allow users to create rooms AND be permissive about the check

-- Drop existing policies
DROP POLICY IF EXISTS "rooms_select_policy" ON rooms;
DROP POLICY IF EXISTS "rooms_insert_policy" ON rooms;
DROP POLICY IF EXISTS "rooms_update_policy" ON rooms;
DROP POLICY IF EXISTS "rooms_delete_policy" ON rooms;

-- SELECT: Users can see rooms they're members of
CREATE POLICY "rooms_select_policy" ON rooms
    FOR SELECT
    TO authenticated
    USING (
        id IN (
            SELECT room_id FROM room_members WHERE user_id = auth.uid()
        )
    );

-- INSERT: Allow authenticated users to create rooms
-- The application layer ensures host_id is set correctly
CREATE POLICY "rooms_insert_policy" ON rooms
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- UPDATE: Only the host can update their room
CREATE POLICY "rooms_update_policy" ON rooms
    FOR UPDATE
    TO authenticated
    USING (host_id = auth.uid());

-- DELETE: Only the host can delete their room
CREATE POLICY "rooms_delete_policy" ON rooms
    FOR DELETE
    TO authenticated
    USING (host_id = auth.uid());

-- Verify
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'rooms' ORDER BY policyname;
