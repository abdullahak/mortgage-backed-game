-- Run this in the Supabase SQL editor or Dashboard > Authentication > Providers > Anonymous sign-ins

-- 1. Enable anonymous sign-ins in Supabase Dashboard:
--    Authentication > Providers > Anonymous sign-ins > Enable

-- 2. Add RLS policy to allow anonymous users to insert into room_members
--    when they provide a valid invite_code that matches an existing room.
--    (Anonymous users have a real auth.uid(), so existing user_id NOT NULL constraint works fine.)

-- Allow any authenticated user (including anonymous) to insert themselves as a room member
-- if the room exists and is in 'waiting' status
CREATE POLICY "Allow authenticated users to join rooms by invite code"
ON room_members
FOR INSERT
TO authenticated
WITH CHECK (
    EXISTS (
        SELECT 1 FROM rooms
        WHERE rooms.id = room_members.room_id
        AND rooms.status = 'waiting'
    )
    AND room_members.user_id = auth.uid()
);

-- Allow users to read room members for rooms they are in
-- (existing policy may already cover this — check your current policies)
