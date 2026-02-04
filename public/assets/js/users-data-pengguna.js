/**
 * Users Data Pengguna Page
 * Handle user list display with role-based filtering and permissions
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let usersList = [];
let selectedUserId = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async function () {
    await checkAuthAndLoadUsers();
    setupEventListeners();
});

// Check auth and load users
async function checkAuthAndLoadUsers() {
    try {
        // Check if user is logged in
        currentUser = await getCurrentUser();

        if (!currentUser) {
            window.location.href = 'pages-login.html';
            return;
        }

        // Load current user's profile for navbar and role-based control
        const profileResult = await ProfilesAPI.getById(currentUser.id);

        if (profileResult.success && profileResult.data) {
            currentProfile = profileResult.data;
            updateHeaderProfile(currentProfile);
            applyRoleBasedControl(currentProfile.role);
        } else {
            showAlert('alertContainer', 'Gagal memuat profil pengguna', 'danger');
            return;
        }

        // Load users from database
        await loadUsers();

    } catch (error) {
        showAlert('alertContainer', 'Gagal memuat halaman: ' + error.message, 'danger');
    }
}

// Update header profile display
function updateHeaderProfile(profile) {
    if (!profile) return;

    const fullName = profile.nama || profile.email || 'User';
    const shortName = fullName.split(' ')[0];
    const initial = shortName.charAt(0).toUpperCase();

    const navProfileInitial = document.getElementById('navProfileInitial');
    const navProfileName = document.getElementById('navProfileName');
    const navProfileFullName = document.getElementById('navProfileFullName');
    const navProfileRole = document.getElementById('navProfileRole');

    if (navProfileInitial) navProfileInitial.textContent = initial;
    if (navProfileName) navProfileName.textContent = shortName;
    if (navProfileFullName) navProfileFullName.textContent = fullName;
    if (navProfileRole) navProfileRole.textContent = formatRole(profile.role);
}

// Apply role-based control
function applyRoleBasedControl(role) {
    const addUserBtn = document.getElementById('btnAddUser');
    const body = document.body;

    // Permission to add new user:
    // uid_admin, uid_user, up3_admin, up3_user dapat menambah user
    // vendor_k3 tidak bisa menambah user
    const canAddUser = ['uid_admin', 'uid_user', 'up3_admin', 'up3_user'].includes(role);

    // Show/hide add user button based on role
    if (addUserBtn) {
        addUserBtn.style.display = canAddUser ? 'inline-block' : 'none';
    }

    // Add class for CSS-based visibility control
    if (canAddUser) {
        body.classList.add('admin-visible');
    } else {
        body.classList.remove('admin-visible');
    }
}

// Logout handler
async function handleLogout() {
    try {
        await logout();
        window.location.href = 'pages-login.html';
    } catch (error) {
        console.error('Logout error:', error);
        showAlert('alertContainer', 'Gagal logout: ' + error.message, 'danger');
    }
}

// Load users from database with role-based filtering
async function loadUsers() {
    try {
        // Safe element access with null checks
        const loadingEl = document.getElementById('loadingUsers');
        const tableContainerEl = document.getElementById('usersTableContainer');
        const emptyStateEl = document.getElementById('emptyState');

        if (loadingEl) loadingEl.style.display = 'flex';
        if (tableContainerEl) tableContainerEl.style.display = 'none';
        if (emptyStateEl) emptyStateEl.style.display = 'none';

        // Check if currentProfile exists
        if (!currentProfile) {
            if (emptyStateEl) emptyStateEl.style.display = 'block';
            if (loadingEl) loadingEl.style.display = 'none';
            return;
        }

        let usersToDisplay = [];
        const role = currentProfile.role || 'uid_admin';
        const unitCode = currentProfile.unit_code;
        const vendorId = currentProfile.vendor_id;

        // Role-based filtering:
        // uid_admin: semua user, bisa CRUD
        // uid_user: semua user, tidak bisa delete
        // up3_admin: user di unit yang sama
        // up3_user: user di unit yang sama dengan role vendor_k3 saja
        // vendor_k3: user vendor_k3 di unit & vendor yang sama (hanya view)

        if (role === 'uid_admin' || role === 'uid_user') {
            // UID roles: tampilkan semua pengguna
            const result = await ProfilesAPI.getByRole('all');
            if (result.success) {
                usersToDisplay = result.data || [];
            }

        } else if (role === 'up3_admin') {
            // UP3 Admin: tampilkan semua user di unit yang sama
            const result = await ProfilesAPI.getByUnit(unitCode);
            if (result.success) {
                usersToDisplay = result.data || [];
            }

        } else if (role === 'up3_user') {
            // UP3 User: tampilkan user di unit sama dengan role vendor_k3 saja
            const result = await ProfilesAPI.getByUnit(unitCode);
            if (result.success) {
                usersToDisplay = (result.data || []).filter(u => u.role === 'vendor_k3');
            }

        } else if (role === 'vendor_k3') {
            // Vendor K3: tampilkan user vendor_k3 di unit & vendor yang sama
            const result = await ProfilesAPI.getByUnit(unitCode);
            if (result.success) {
                usersToDisplay = (result.data || []).filter(u =>
                    u.role === 'vendor_k3' && u.vendor_id === vendorId
                );
            }
        }

        if (usersToDisplay.length > 0) {
            usersList = usersToDisplay;
            displayUsers(usersList);
            if (tableContainerEl) tableContainerEl.style.display = 'block';
        } else {
            if (emptyStateEl) emptyStateEl.style.display = 'block';
        }

    } catch (error) {
        console.error('Error loading users:', error);
        showAlert('alertContainer', 'Gagal memuat data pengguna: ' + error.message, 'danger');
        const emptyStateEl = document.getElementById('emptyState');
        if (emptyStateEl) emptyStateEl.style.display = 'block';
    } finally {
        const loadingEl = document.getElementById('loadingUsers');
        if (loadingEl) loadingEl.style.display = 'none';
    }
}

// Display users in table
function displayUsers(users) {
    const tbody = document.getElementById('usersTableBody');

    if (!tbody) {
        return;
    }

    tbody.innerHTML = '';

    users.forEach(user => {
        const row = document.createElement('tr');

        // Avatar initial
        const initial = user.nama ? user.nama.charAt(0).toUpperCase() : '-';

        // Role label
        const roleLabel = formatRole(user.role);
        const roleBadgeClass = getRoleBadgeClass(user.role);

        // Get unit name from units relation (if available)
        const unitName = user.units?.unit_name || user.unit_code || '-';

        row.innerHTML = `
      <td>
        <div class="d-flex align-items-center">
          <div class="user-avatar">${initial}</div>
          <div class="ms-2">
            <p class="mb-0"><strong>${user.nama || '-'}</strong></p>
          </div>
        </div>
      </td>
      <td>${user.nip || '-'}</td>
      <td>${user.email || '-'}</td>
      <td>${unitName}</td>
      <td>${user.jabatan || '-'}</td>
      <td>
        <span class="badge ${roleBadgeClass} badge-role">${roleLabel}</span>
      </td>
      <td>
        <div class="action-buttons">
          <button class="btn btn-info btn-sm" onclick="viewUser('${user.id}')" title="Lihat Detail">
            <i class="bi bi-eye"></i>
          </button>
        </div>
      </td>
    `;

        tbody.appendChild(row);
    });
}

// Format role for display
function formatRole(role) {
    const roles = {
        'uid_admin': 'UID Admin',
        'uid_user': 'UID User',
        'up3_admin': 'UP3 Admin',
        'up3_user': 'UP3 User',
        'vendor_k3': 'Vendor K3'
    };
    return roles[role] || role || '-';
}

// Get badge class for role
function getRoleBadgeClass(role) {
    const classes = {
        'uid_admin': 'bg-danger',
        'uid_user': 'bg-info',
        'up3_admin': 'bg-warning',
        'up3_user': 'bg-secondary',
        'vendor_k3': 'bg-success'
    };
    return classes[role] || 'bg-secondary';
}

// View user details with modal
function viewUser(userId) {
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    selectedUserId = userId;

    // Populate modal
    const initial = user.nama ? user.nama.charAt(0).toUpperCase() : '?';
    const roleLabel = formatRole(user.role);
    const roleBadgeClass = getRoleBadgeClass(user.role);
    const unitName = user.units?.unit_name || user.unit_code || '-';

    document.getElementById('modalUserAvatar').textContent = initial;
    document.getElementById('modalUserName').textContent = user.nama || '-';

    const roleEl = document.getElementById('modalUserRole');
    roleEl.textContent = roleLabel;
    roleEl.className = `badge ${roleBadgeClass}`;

    document.getElementById('modalUserEmail').textContent = user.email || '-';
    document.getElementById('modalUserNip').textContent = user.nip || '-';
    document.getElementById('modalUserUnit').textContent = unitName;
    document.getElementById('modalUserJabatan').textContent = user.jabatan || '-';
    document.getElementById('modalUserBidang').textContent = user.bidang || '-';
    document.getElementById('modalUserPhone').textContent = user.no_hp || '-';

    // Show/hide edit and delete buttons based on role
    const editBtn = document.getElementById('modalEditBtn');
    const deleteBtn = document.getElementById('modalDeleteBtn');

    // Permission rules:
    // uid_admin: bisa edit dan delete
    // uid_user: bisa edit, tidak bisa delete
    // up3_admin: bisa edit dan delete (di unitnya)
    // up3_user: bisa edit (vendor_k3 di unitnya), tidak bisa delete
    // vendor_k3: tidak bisa edit atau delete (hanya view)
    const role = currentProfile.role;

    let canEdit = false;
    let canDelete = false;

    if (role === 'uid_admin') {
        canEdit = true;
        canDelete = true;
    } else if (role === 'uid_user') {
        canEdit = true;
        canDelete = false;
    } else if (role === 'up3_admin') {
        canEdit = true;
        canDelete = true;
    } else if (role === 'up3_user') {
        canEdit = true;
        canDelete = false;
    } else if (role === 'vendor_k3') {
        canEdit = false;
        canDelete = false;
    }

    if (editBtn) editBtn.style.display = canEdit ? 'inline-block' : 'none';
    if (deleteBtn) deleteBtn.style.display = canDelete ? 'inline-block' : 'none';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('userDetailModal'));
    modal.show();
}

// Edit user from modal
function editUserFromModal() {
    if (selectedUserId) {
        // Close modal first
        const modal = bootstrap.Modal.getInstance(document.getElementById('userDetailModal'));
        if (modal) modal.hide();

        // Redirect to edit page or show edit form
        window.location.href = `users-profile.html?id=${selectedUserId}`;
    }
}

// Delete user from modal
async function deleteUserFromModal() {
    const user = usersList.find(u => u.id === selectedUserId);
    if (!user) return;

    const result = await Swal.fire({
        title: 'Hapus Pengguna?',
        text: `Apakah Anda yakin ingin menghapus pengguna "${user.nama}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    // Close modal first
    const modal = bootstrap.Modal.getInstance(document.getElementById('userDetailModal'));
    if (modal) modal.hide();

    // Call delete
    await deleteUser(selectedUserId, user.nama);
}

// Edit user
function editUser(userId) {
    window.location.href = `users-profile.html?id=${userId}`;
}

// Delete user
async function deleteUser(userId, userName) {
    try {
        const client = getSupabaseClient();
        const { error } = await client
            .from('profiles')
            .delete()
            .eq('id', userId);

        if (error) {
            showAlert('alertContainer', 'Gagal menghapus pengguna: ' + error.message, 'danger');
        } else {
            showAlert('alertContainer', 'Pengguna berhasil dihapus', 'success');
            // Reload users
            await loadUsers();
        }

    } catch (error) {
        console.error('Error deleting user:', error);
        showAlert('alertContainer', 'Terjadi kesalahan: ' + error.message, 'danger');
    }
}

// Setup event listeners
function setupEventListeners() {
    const addBtn = document.getElementById('btnAddUser');
    if (addBtn) {
        addBtn.addEventListener('click', function () {
            window.location.href = 'users-tambah-pengguna.html';
        });
    }

    // Logout handler
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
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
                    console.error('Logout error:', error);
                }
                window.location.href = 'pages-login.html';
            }
        });
    }
}

// Show alert helper
function showAlert(containerId, message, type) {
    const container = document.getElementById(containerId);
    if (!container) {
        console.warn('Alert container not found:', containerId);
        return;
    }
    container.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show" role="alert">
      ${message}
      <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
    </div>
  `;
}
