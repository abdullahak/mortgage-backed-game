// Backend API base URL (proxied through nginx)
window.API_BASE = '/api';

// Initialize Socket.io client
// window.io is set by the Socket.io CDN script loaded before this file
// We defer the actual connection until after auth is known (done in supabase.js)
