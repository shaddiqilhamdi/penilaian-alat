/**
 * Dashboard Module
 * Handle dashboard initialization and role-based dashboard loading
 */

document.addEventListener('DOMContentLoaded', async function () {
    // Wait for Supabase client to be ready
    let retryCount = 0;
    const maxRetries = 10;

    while (retryCount < maxRetries) {
        if (typeof getSupabaseClient !== 'undefined' && typeof getCurrentUserWithProfile !== 'undefined') {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        retryCount++;
    }

    if (retryCount >= maxRetries) {
        return;
    }

    checkAuthAndLoadUser();

    async function checkAuthAndLoadUser() {
        try {
            const client = getSupabaseClient();
            const { data: { session }, error: sessionError } = await client.auth.getSession();

            if (!session || !session.user) {
                window.location.href = 'pages-login.html';
                return;
            }

            const userWithProfile = await getCurrentUserWithProfile();
            const user = userWithProfile || { ...session.user, profile: null };

            displayUserInfo(user);
            setupLogoutButton();

        } catch (error) {
            if (error.message?.includes('JWT') || error.message?.includes('session') || error.message?.includes('auth')) {
                window.location.href = 'pages-login.html';
            }
        }
    }

    function displayUserInfo(userWithProfile) {
        const user = userWithProfile;
        const profile = userWithProfile.profile;

        const fullName = profile?.nama_lengkap || profile?.nama || user.email.split('@')[0];
        const firstName = fullName.split(' ')[0];
        const initial = firstName.charAt(0).toUpperCase();
        const role = profile?.role || 'User';

        const roleLabels = {
            uid_admin: 'UID Admin',
            uid_user: 'UID User',
            up3_admin: 'UP3 Admin',
            up3_user: 'UP3 User',
            vendor_k3: 'Vendor K3'
        };
        const roleLabel = roleLabels[role] || role;

        const navProfileInitial = document.getElementById('navProfileInitial');
        if (navProfileInitial) navProfileInitial.textContent = initial;

        const navProfileName = document.getElementById('navProfileName');
        if (navProfileName) navProfileName.textContent = firstName;

        const navProfileFullName = document.getElementById('navProfileFullName');
        if (navProfileFullName) navProfileFullName.textContent = fullName;

        const navProfileRole = document.getElementById('navProfileRole');
        if (navProfileRole) navProfileRole.textContent = roleLabel;

        const welcomeMessage = document.getElementById('welcomeMessage');
        if (welcomeMessage) welcomeMessage.innerHTML = `Selamat Datang, <strong>${fullName}</strong>`;

        const roleDisplay = document.getElementById('roleDisplay');
        if (roleDisplay) roleDisplay.textContent = roleLabel;

        window.currentUser = { ...user, ...profile, fullName, roleLabel };

        loadDashboardByRole(role);
    }

    function loadDashboardByRole(role) {
        const uidDashboard = document.getElementById('uidDashboard');
        const up3Dashboard = document.getElementById('up3Dashboard');
        const defaultDashboard = document.getElementById('defaultDashboard');

        if (uidDashboard) uidDashboard.style.display = 'none';
        if (up3Dashboard) up3Dashboard.style.display = 'none';
        if (defaultDashboard) defaultDashboard.style.display = 'none';

        if (role === 'uid_admin' || role === 'uid_user') {
            if (uidDashboard) uidDashboard.style.display = 'block';
            if (typeof loadUIDDashboard === 'function') {
                loadUIDDashboard();
            }
        } else if (role === 'up3_admin' || role === 'up3_user' || role === 'vendor_k3') {
            if (up3Dashboard) up3Dashboard.style.display = 'block';
            if (typeof loadUP3Dashboard === 'function') {
                loadUP3Dashboard();
            }
        } else {
            if (defaultDashboard) defaultDashboard.style.display = 'block';
        }
    }

    function setupLogoutButton() {
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async function (e) {
                e.preventDefault();
                const result = await Swal.fire({
                    title: 'Konfirmasi Logout',
                    text: 'Apakah Anda yakin ingin keluar?',
                    icon: 'question',
                    showCancelButton: true,
                    confirmButtonColor: '#3085d6',
                    cancelButtonColor: '#6c757d',
                    confirmButtonText: 'Ya, Logout',
                    cancelButtonText: 'Batal'
                });
                if (result.isConfirmed) {
                    try {
                        await logout();
                    } catch (error) {
                        // Logout error
                    }
                    window.location.href = 'pages-login.html';
                }
            });
        }
    }
});
