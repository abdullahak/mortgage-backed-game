// Supabase configuration
const SUPABASE_URL = 'https://scpkafqiooxfvycwzqla.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNjcGthZnFpb294ZnZ5Y3d6cWxhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI4MTU1MTksImV4cCI6MjA3ODM5MTUxOX0.nl__3JFaZWIDPc8zAo4LQ0JQC-3gdQGErjqAURNHSwM';

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
