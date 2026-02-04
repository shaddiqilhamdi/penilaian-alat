/**
 * Navbar Profile Handler
 * Standardized navbar profile across all pages
 * Features:
 * - Avatar with initial letter
 * - First word of name display
 * - Role display
 */

// Role labels for display
const ROLE_LABELS = {
    uid_admin: 'UID Admin',
    uid_user: 'UID User',
    up3_admin: 'UP3 Admin',
    up3_user: 'UP3 User',
    vendor_k3: 'Vendor K3'
};

/**
 * Update navbar profile with user data
 * @param {Object} profile - User profile data
 */
function updateNavbarProfile(profile) {
    if (!profile) return;

    const fullName = profile.nama || profile.full_name || profile.username || 'User';
    const firstName = fullName.split(' ')[0];
    const initial = firstName.charAt(0).toUpperCase();
    const roleLabel = ROLE_LABELS[profile.role] || profile.role || '-';

    // Update avatar initial
    const navProfileInitial = document.getElementById('navProfileInitial');
    if (navProfileInitial) {
        navProfileInitial.textContent = initial;
    }

    // Update name display (first word only)
    const navProfileName = document.getElementById('navProfileName');
    if (navProfileName) {
        navProfileName.textContent = firstName;
    }

    // Update full name in dropdown
    const navProfileFullName = document.getElementById('navProfileFullName');
    if (navProfileFullName) {
        navProfileFullName.textContent = fullName;
    }

    // Update role in dropdown
    const navProfileRole = document.getElementById('navProfileRole');
    if (navProfileRole) {
        navProfileRole.textContent = roleLabel;
    }
}

/**
 * Initialize navbar profile on page load
 * Requires getCurrentUser() and ProfilesAPI to be loaded
 */
async function initNavbarProfile() {
    try {
        // Check if required functions exist
        if (typeof getCurrentUser !== 'function') {
            console.warn('⚠️ getCurrentUser not available for navbar');
            return null;
        }

        const user = await getCurrentUser();
        if (!user) {
            console.log('❌ No user for navbar profile');
            return null;
        }

        // Get profile
        if (typeof ProfilesAPI !== 'undefined' && ProfilesAPI.getById) {
            const result = await ProfilesAPI.getById(user.id);
            if (result.success && result.data) {
                updateNavbarProfile(result.data);
                return result.data;
            }
        }

        return null;
    } catch (error) {
        console.error('❌ Error initializing navbar profile:', error);
        return null;
    }
}

// Make functions available globally
window.updateNavbarProfile = updateNavbarProfile;
window.initNavbarProfile = initNavbarProfile;
window.ROLE_LABELS = ROLE_LABELS;
