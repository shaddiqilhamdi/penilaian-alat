/**
 * Supabase Client Configuration
 * Centralized Supabase initialization
 * Requires: @supabase/supabase-js loaded via script tag
 */

if (typeof SUPABASE_URL === 'undefined') {
    const SUPABASE_URL = 'https://wkkottkbmwlsoeysixet.supabase.co';
    const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Indra290dGtibXdsc29leXNpeGV0Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjkzMTYzNzAsImV4cCI6MjA4NDg5MjM3MH0.G4p_y93QhhWLD3We3l7A_NzH5E2vCmgtT08c_6s29Fw';

    // Initialize Supabase client
    let supabaseClient = null;

    /**
     * Initialize Supabase client
     * Uses global supabase object loaded via CDN
     */
    function initSupabaseClient() {
        if (supabaseClient) return supabaseClient;

        try {
            // Check if supabase is available globally (loaded via script tag)
            if (typeof window.supabase === 'undefined') {
                throw new Error('Supabase library not loaded. Make sure @supabase/supabase-js is included.');
            }

            const { createClient } = window.supabase;
            supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

            return supabaseClient;
        } catch (error) {
            console.error('❌ Failed to initialize Supabase:', error);
            throw error;
        }
    }

    /**
     * Get Supabase client (initialize if needed)
     */
    function getSupabaseClient() {
        if (!supabaseClient) {
            initSupabaseClient();
        }
        return supabaseClient;
    }

    /**
     * Get current session
     */
    function getCurrentSession() {
        try {
            const client = getSupabaseClient();
            return client.auth.getSession();
        } catch (error) {
            console.error('❌ Failed to get session:', error);
            return null;
        }
    }

    /**
     * Get current user
     */
    async function getCurrentUser() {
        try {
            const client = getSupabaseClient();
            const { data: { user }, error } = await client.auth.getUser();

            if (error) throw error;
            return user;
        } catch (error) {
            console.error('❌ Failed to get current user:', error);
            return null;
        }
    }

    /**
     * Check if user is authenticated
     */
    async function isAuthenticated() {
        const user = await getCurrentUser();
        return !!user;
    }

    /**
     * Listen to auth state changes
     */
    function onAuthStateChange(callback) {
        const client = getSupabaseClient();
        const { data } = client.auth.onAuthStateChange((event, session) => {
            callback(event, session);
        });

        return data; // subscription object for cleanup
    }

    // Export to window for browser usage
    window.getSupabaseClient = getSupabaseClient;
    window.getCurrentSession = getCurrentSession;
    window.getCurrentUser = getCurrentUser;
    window.isAuthenticated = isAuthenticated;
    window.onAuthStateChange = onAuthStateChange;
    window.initSupabaseClient = initSupabaseClient;
}
// End of SUPABASE_URL check wrapper

// Create global aliases
var getSupabaseClient = window.getSupabaseClient;
var getCurrentSession = window.getCurrentSession;
var getCurrentUser = window.getCurrentUser;
var isAuthenticated = window.isAuthenticated;
var onAuthStateChange = window.onAuthStateChange;
var initSupabaseClient = window.initSupabaseClient;

