// Supabase configuration
// You'll need to replace these with your actual Supabase project credentials
// Get these from: https://app.supabase.com/project/_/settings/api

const SUPABASE_URL = 'YOUR_SUPABASE_URL_HERE'; // e.g., 'https://xxxxx.supabase.co'
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY_HERE'; // Your anon/public key

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
