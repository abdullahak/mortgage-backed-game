import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders });
    }

    try {
        const { action, email, inviteCode, roomName } = await req.json();

        const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const SITE_URL = Deno.env.get('SITE_URL') || 'https://your-domain.com';

        if (!RESEND_API_KEY) {
            console.error('RESEND_API_KEY not configured');
            return new Response(JSON.stringify({ error: 'Email service not configured' }), {
                status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
            auth: { autoRefreshToken: false, persistSession: false }
        });

        let subject = '';
        let html = '';

        if (action === 'room_created') {
            // Email room code to the host
            subject = `Your room code: ${inviteCode}`;
            const joinUrl = `${SITE_URL}/waiting.html?code=${inviteCode}`;
            html = `
                <h2>Your game is ready!</h2>
                <p>Share this code with your friends to invite them:</p>
                <div style="font-size: 2em; font-weight: bold; letter-spacing: 0.3em; background: #f0f0f0; padding: 16px; text-align: center; border-radius: 8px; margin: 16px 0;">
                    ${inviteCode}
                </div>
                <p>Or share this link:<br>
                <a href="${joinUrl}">${joinUrl}</a></p>
                <p>Room: <strong>${roomName}</strong></p>
                <p>Keep this email — you'll need the code to resume your game later.</p>
            `;

        } else if (action === 'invite_friend') {
            // Email invite to a friend
            subject = `You're invited to play Mortgage Backed Monopoly!`;
            const joinUrl = `${SITE_URL}/waiting.html?code=${inviteCode}`;
            html = `
                <h2>You've been invited to play!</h2>
                <p>Join the game <strong>${roomName}</strong> using this room code:</p>
                <div style="font-size: 2em; font-weight: bold; letter-spacing: 0.3em; background: #f0f0f0; padding: 16px; text-align: center; border-radius: 8px; margin: 16px 0;">
                    ${inviteCode}
                </div>
                <p><a href="${joinUrl}" style="background: #667eea; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; display: inline-block; margin: 8px 0;">
                    Click to Join Game
                </a></p>
                <p style="color: #999; font-size: 0.9em;">Or go to ${SITE_URL} and enter code <strong>${inviteCode}</strong> under "Resume Existing Game".</p>
            `;

        } else if (action === 'forgot_code') {
            // Targeted email lookup via Admin REST API (O(1) vs listUsers() O(n))
            const authRes = await fetch(
                `${SUPABASE_URL}/auth/v1/admin/users?email=${encodeURIComponent(email)}&page=1&per_page=1`,
                {
                    headers: {
                        apikey: SUPABASE_SERVICE_ROLE_KEY,
                        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
                    }
                }
            );
            if (!authRes.ok) throw new Error('Auth lookup failed');
            const { users: matchedUsers } = await authRes.json();
            const user = matchedUsers?.[0];
            if (!user) {
                // Don't reveal whether email exists — just return success
                return new Response(JSON.stringify({ ok: true }), {
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' }
                });
            }

            // Get rooms where user is host or member
            const { data: memberRows } = await supabase
                .from('room_members')
                .select('room_id, rooms(id, name, invite_code, status)')
                .eq('user_id', user.id);

            const activeRooms = (memberRows || [])
                .map((r: any) => r.rooms)
                .filter((r: any) => r && r.status === 'waiting');

            if (activeRooms.length === 0) {
                subject = 'Your Mortgage Backed Monopoly room codes';
                html = `<p>We couldn't find any active games associated with this email address.</p>
                        <p>Visit <a href="${SITE_URL}">${SITE_URL}</a> to create a new game.</p>`;
            } else {
                subject = `Your room codes (${activeRooms.length} active game${activeRooms.length > 1 ? 's' : ''})`;
                const roomList = activeRooms.map((r: any) => `
                    <div style="margin: 12px 0; padding: 12px; background: #f9f9f9; border-radius: 8px;">
                        <strong>${r.name}</strong><br>
                        Code: <span style="font-size: 1.3em; font-weight: bold; letter-spacing: 0.15em;">${r.invite_code}</span><br>
                        <a href="${SITE_URL}/waiting.html?code=${r.invite_code}">Join this room</a>
                    </div>
                `).join('');
                html = `<h2>Your active games</h2>${roomList}`;
            }

        } else {
            return new Response(JSON.stringify({ error: 'Unknown action' }), {
                status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
            });
        }

        // Send via Resend
        const sendRes = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${RESEND_API_KEY}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                from: 'Mortgage Backed Monopoly <noreply@yourdomain.com>',
                to: [email],
                subject,
                html,
            }),
        });

        if (!sendRes.ok) {
            const err = await sendRes.text();
            console.error('Resend error:', err);
            throw new Error('Failed to send email');
        }

        return new Response(JSON.stringify({ ok: true }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });

    } catch (error) {
        console.error('Edge function error:', error);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
    }
});
