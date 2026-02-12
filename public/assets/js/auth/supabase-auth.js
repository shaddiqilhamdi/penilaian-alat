/**
 * Supabase Authentication Module
 * Handle login, logout, and user management
 * Requires: supabase-client.js
 */

/**
 * Login with email and password
 */
async function login(email, password) {
    try {
        const client = getSupabaseClient();

        const { data, error } = await client.auth.signInWithPassword({
            email,
            password
        });

        if (error) {
            console.error('❌ Login failed:', error.message);
            return { success: false, error: error.message };
        }

        console.log('✅ Login successful:', data.user.email);
        return { success: true, user: data.user, session: data.session };
    } catch (error) {
        console.error('❌ Login error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Logout
 */
async function logout() {
    try {
        const client = getSupabaseClient();

        const { error } = await client.auth.signOut();

        // Clear role from localStorage
        localStorage.removeItem('user_role');
        localStorage.removeItem('user_unit_code');
        localStorage.removeItem('user_vendor_id');

        if (error) {
            console.error('❌ Logout failed:', error.message);
            return { success: false, error: error.message };
        }

        console.log('✅ Logout successful');
        return { success: true };
    } catch (error) {
        console.error('❌ Logout error:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Get current user with profile
 */
async function getCurrentUserWithProfile() {
    try {
        const client = getSupabaseClient();

        // Get auth user
        const { data: { user }, error: userError } = await client.auth.getUser();

        console.log('Auth check - user:', user ? user.email : 'null', 'error:', userError?.message || 'none');

        if (userError || !user) {
            console.log('No authenticated user found');
            return null;
        }

        // Get profile data
        const { data: profile, error: profileError } = await client
            .from('profiles')
            .select('*')
            .eq('id', user.id)
            .single();

        if (profileError) {
            // PGRST116 = Row not found (profile doesn't exist yet)
            if (profileError.code === 'PGRST116') {
                console.warn('Profile not found for user, returning user without profile');
                return {
                    ...user,
                    profile: null
                };
            }
            console.error('❌ Failed to fetch profile:', profileError);
            // Still return user even if profile fetch fails (might be RLS issue)
            return {
                ...user,
                profile: null
            };
        }

        console.log('✅ User with profile loaded:', user.email);
        return {
            ...user,
            profile: profile || null
        };
    } catch (error) {
        console.error('❌ Error getting user profile:', error);
        return null;
    }
}

/**
 * Get user by email (for testing)
 */
async function getUserByEmail(email) {
    try {
        const client = getSupabaseClient();

        const { data: profile, error } = await client
            .from('profiles')
            .select('*')
            .eq('email', email)
            .single();

        if (error) {
            console.error('❌ User not found:', error);
            return null;
        }

        return profile;
    } catch (error) {
        console.error('❌ Error fetching user:', error);
        return null;
    }
}

/**
 * Update user profile
 */
async function updateUserProfile(userId, updates) {
    try {
        const client = getSupabaseClient();

        const { data, error } = await client
            .from('profiles')
            .update(updates)
            .eq('id', userId)
            .select()
            .single();

        if (error) {
            console.error('❌ Failed to update profile:', error);
            return { success: false, error: error.message };
        }

        console.log('✅ Profile updated');
        return { success: true, profile: data };
    } catch (error) {
        console.error('❌ Error updating profile:', error);
        return { success: false, error: error.message };
    }
}

/**
 * Listen to auth state changes
 */
function subscribeToAuthChanges(callback) {
    const client = getSupabaseClient();
    const { data } = client.auth.onAuthStateChange((event, session) => {
        callback(event, session);
    });

    return data; // subscription object for cleanup
}

/**
 * Get current user (without profile)
 */
async function getCurrentUser() {
    try {
        const client = getSupabaseClient();
        const { data: { user }, error } = await client.auth.getUser();

        if (error || !user) {
            return null;
        }

        return user;
    } catch (error) {
        console.error('❌ Error getting user:', error);
        return null;
    }
}

/**
 * Save user role to localStorage for CSS-based menu visibility
 * Call this after successful login and profile load
 */
function saveUserRoleToStorage(profile) {
    if (profile) {
        localStorage.setItem('user_role', profile.role || '');
        localStorage.setItem('user_unit_code', profile.unit_code || '');
        localStorage.setItem('user_vendor_id', profile.vendor_id || '');
    }
}

/**
 * Get user role from localStorage (for quick CSS-based checks)
 */
function getUserRoleFromStorage() {
    return localStorage.getItem('user_role') || '';
}

/**
 * Role Guard: Check if current user is 'petugas' and redirect to form only page
 * Call this on pages that petugas should NOT access
 * @param {string} allowedPage - The only page petugas can access (default: 'forms-penilaian.html')
 */
function checkPetugasRoleGuard(allowedPage = 'forms-penilaian.html') {
    const role = getUserRoleFromStorage();
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';

    // If user is petugas and not on allowed page, redirect
    if (role === 'petugas' && currentPage !== allowedPage) {
        console.log('🚫 Petugas role detected - redirecting to form penilaian');
        window.location.href = allowedPage;
        return true; // Redirecting
    }
    return false; // Not redirecting
}

/**
 * Check if current user has access to a page based on role
 * @param {string[]} allowedRoles - Array of roles allowed to access this page
 * @param {string} redirectTo - Where to redirect if not allowed
 */
function checkRoleAccess(allowedRoles, redirectTo = 'pages-login.html') {
    const role = getUserRoleFromStorage();

    if (!role) {
        // Not logged in
        window.location.href = redirectTo;
        return false;
    }

    if (!allowedRoles.includes(role)) {
        // Role not allowed
        if (role === 'petugas') {
            window.location.href = 'forms-penilaian.html';
        } else {
            window.location.href = 'index.html';
        }
        return false;
    }

    return true;
}

/**
 * Export functions
 */
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        login,
        logout,
        getCurrentUser,
        getCurrentUserWithProfile,
        getUserByEmail,
        updateUserProfile,
        subscribeToAuthChanges
    };
}
