// Supabase helper functions

// Generate random invite code
function generateInviteCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Removed similar looking characters
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

// Check authentication status
async function requireAuth() {
    const { data: { session } } = await supabase.auth.getSession();

    if (!session) {
        window.location.href = 'auth.html';
        return null;
    }

    return session;
}

// Get current user
async function getCurrentUser() {
    const { data: { user } } = await supabase.auth.getUser();
    return user;
}

// Handle logout
async function handleLogout() {
    try {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;

        window.location.href = 'auth.html';
    } catch (error) {
        console.error('Logout error:', error);
        alert('Error logging out: ' + error.message);
    }
}

// Room management functions

async function createNewRoom(roomName, maxPlayers, playerName) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const inviteCode = generateInviteCode();

        // Create room
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .insert({
                invite_code: inviteCode,
                host_id: user.id,
                name: roomName,
                max_players: maxPlayers,
                status: 'waiting'
            })
            .select()
            .single();

        if (roomError) throw roomError;

        // Add host as first member
        const { error: memberError } = await supabase
            .from('room_members')
            .insert({
                room_id: room.id,
                user_id: user.id,
                player_name: playerName
            });

        if (memberError) throw memberError;

        return room;
    } catch (error) {
        console.error('Error creating room:', error);
        throw error;
    }
}

async function joinRoomByCode(inviteCode, playerName) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        // Find room by invite code
        const { data: room, error: roomError } = await supabase
            .from('rooms')
            .select('*, room_members(*)')
            .eq('invite_code', inviteCode.toUpperCase())
            .single();

        if (roomError) throw new Error('Room not found');

        // Check if room is full
        if (room.room_members.length >= room.max_players) {
            throw new Error('Room is full');
        }

        // Check if user already in room
        const alreadyJoined = room.room_members.some(member => member.user_id === user.id);
        if (alreadyJoined) {
            return room; // Already in room, just return it
        }

        // Check if room has started
        if (room.status !== 'waiting') {
            throw new Error('Game has already started');
        }

        // Add member to room
        const { error: memberError } = await supabase
            .from('room_members')
            .insert({
                room_id: room.id,
                user_id: user.id,
                player_name: playerName
            });

        if (memberError) throw memberError;

        return room;
    } catch (error) {
        console.error('Error joining room:', error);
        throw error;
    }
}

async function getUserRooms() {
    try {
        const user = await getCurrentUser();
        if (!user) return [];

        const { data, error } = await supabase
            .from('room_members')
            .select(`
                *,
                rooms (
                    *,
                    room_members (*)
                )
            `)
            .eq('user_id', user.id)
            .order('joined_at', { ascending: false });

        if (error) throw error;

        return data.map(member => member.rooms).filter(room => room !== null);
    } catch (error) {
        console.error('Error fetching user rooms:', error);
        return [];
    }
}

async function getRoomById(roomId) {
    try {
        const { data, error } = await supabase
            .from('rooms')
            .select(`
                *,
                room_members (
                    *,
                    users:user_id (email)
                )
            `)
            .eq('id', roomId)
            .single();

        if (error) throw error;

        return data;
    } catch (error) {
        console.error('Error fetching room:', error);
        throw error;
    }
}

async function startGame(roomId, initialGameState) {
    try {
        const user = await getCurrentUser();
        if (!user) throw new Error('Not authenticated');

        const room = await getRoomById(roomId);

        // Check if user is host
        if (room.host_id !== user.id) {
            throw new Error('Only the host can start the game');
        }

        // Update room status
        const { error: roomError } = await supabase
            .from('rooms')
            .update({ status: 'in_progress' })
            .eq('id', roomId);

        if (roomError) throw roomError;

        // Create game record
        const { data: game, error: gameError } = await supabase
            .from('games')
            .insert({
                room_id: roomId,
                game_state: initialGameState,
                current_player_index: 0
            })
            .select()
            .single();

        if (gameError) throw gameError;

        // Log game start event
        await logGameEvent(game.id, user.id, 'game_start', {
            player_count: room.room_members.length,
            players: room.room_members.map(m => m.player_name)
        });

        return game;
    } catch (error) {
        console.error('Error starting game:', error);
        throw error;
    }
}

async function updateGameState(gameId, newState) {
    try {
        const { error } = await supabase
            .from('games')
            .update({
                game_state: newState,
                updated_at: new Date().toISOString()
            })
            .eq('id', gameId);

        if (error) throw error;

        return true;
    } catch (error) {
        console.error('Error updating game state:', error);
        throw error;
    }
}

async function getGameByRoomId(roomId) {
    try {
        const { data, error } = await supabase
            .from('games')
            .select('*')
            .eq('room_id', roomId)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                // No game found
                return null;
            }
            throw error;
        }

        return data;
    } catch (error) {
        console.error('Error fetching game:', error);
        throw error;
    }
}

async function logGameEvent(gameId, playerId, eventType, eventData) {
    try {
        const { error } = await supabase
            .from('game_events')
            .insert({
                game_id: gameId,
                player_id: playerId,
                event_type: eventType,
                event_data: eventData
            });

        if (error) throw error;

        return true;
    } catch (error) {
        console.error('Error logging game event:', error);
        return false;
    }
}

// Subscribe to room updates
function subscribeToRoom(roomId, callback) {
    return supabase
        .channel(`room:${roomId}`)
        .on(
            'postgres_changes',
            {
                event: '*',
                schema: 'public',
                table: 'room_members',
                filter: `room_id=eq.${roomId}`
            },
            callback
        )
        .subscribe();
}

// Subscribe to game updates
function subscribeToGame(gameId, callback) {
    return supabase
        .channel(`game:${gameId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'games',
                filter: `id=eq.${gameId}`
            },
            callback
        )
        .subscribe();
}

// Unsubscribe from channel
async function unsubscribeChannel(channel) {
    if (channel) {
        await supabase.removeChannel(channel);
    }
}
