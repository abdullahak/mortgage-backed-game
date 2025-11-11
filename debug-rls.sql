-- Debug RLS - temporarily make room creation more permissive

-- Drop and recreate rooms insert policy to be more permissive
DROP POLICY IF EXISTS "rooms_insert" ON rooms;

CREATE POLICY "rooms_insert" ON rooms
    FOR INSERT
    TO authenticated
    WITH CHECK (true);  -- Temporarily allow all inserts for testing

-- Verify
SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename = 'rooms';
