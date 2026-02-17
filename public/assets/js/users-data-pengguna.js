/**
 * Users Data Pengguna Page
 * Handle user list display with role-based filtering and permissions
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let usersList = [];
let selectedUserId = null;
let currentFilter = 'all'; // 'all' or 'pending'

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
            // Save role to localStorage for CSS-based menu visibility
            if (typeof saveUserRoleToStorage === 'function') {
                saveUserRoleToStorage(currentProfile);
            }
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
            updatePendingCount();
            displayUsers(filterUsersList());
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

// Filter users based on current filter
function filterUsersList() {
    if (currentFilter === 'pending') {
        return usersList.filter(u => u.is_active === false);
    }
    return usersList;
}

// Update pending count badge
function updatePendingCount() {
    const pendingUsers = usersList.filter(u => u.is_active === false);
    const pendingCountEl = document.getElementById('pendingCount');
    if (pendingCountEl) {
        pendingCountEl.textContent = pendingUsers.length;
        // Show/hide pending badge based on count
        pendingCountEl.style.display = pendingUsers.length > 0 ? 'inline' : 'none';
    }
}

// Filter users (called from filter buttons)
function filterUsers(filter) {
    currentFilter = filter;

    // Update button states
    const filterAll = document.getElementById('filterAll');
    const filterPending = document.getElementById('filterPending');

    if (filterAll && filterPending) {
        if (filter === 'all') {
            filterAll.classList.add('active');
            filterPending.classList.remove('active');
        } else {
            filterAll.classList.remove('active');
            filterPending.classList.add('active');
        }
    }

    // Display filtered users
    const filteredUsers = filterUsersList();
    if (filteredUsers.length > 0) {
        displayUsers(filteredUsers);
        document.getElementById('usersTableContainer').style.display = 'block';
        document.getElementById('emptyState').style.display = 'none';
    } else {
        document.getElementById('usersTableContainer').style.display = 'none';
        document.getElementById('emptyState').style.display = 'block';
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

        // Status badge
        const isActive = user.is_active !== false; // Default to true if undefined
        const statusBadge = isActive
            ? '<span class="badge bg-success">Aktif</span>'
            : '<span class="badge bg-warning text-dark">Pending</span>';

        // Action buttons based on permissions and status
        const role = currentProfile.role;
        const canApprove = ['uid_admin', 'uid_user', 'up3_admin'].includes(role);

        let actionButtons = `
            <button class="btn btn-info btn-sm" onclick="viewUser('${user.id}')" title="Lihat Detail">
                <i class="bi bi-eye"></i>
            </button>`;

        // Show approve button for pending users
        if (!isActive && canApprove && user.id !== currentProfile.id) {
            actionButtons += `
            <button class="btn btn-success btn-sm" onclick="approveUser('${user.id}')" title="Approve">
                <i class="bi bi-check-lg"></i>
            </button>`;
        }

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
      <td>${statusBadge}</td>
      <td>
        <div class="action-buttons">
          ${actionButtons}
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
    document.getElementById('modalUserSubBidang').textContent = user.sub_bidang || '-';

    // Status display
    const isActive = user.is_active !== false;
    const statusEl = document.getElementById('modalUserStatus');
    if (statusEl) {
        statusEl.innerHTML = isActive
            ? '<span class="badge bg-success">Aktif</span>'
            : '<span class="badge bg-warning text-dark">Pending Approval</span>';
    }

    // Show/hide edit and delete buttons based on role
    const editBtn = document.getElementById('modalEditBtn');
    const deleteBtn = document.getElementById('modalDeleteBtn');

    // Permission rules:
    // - Setiap user BISA edit profil sendiri
    // - uid_admin: bisa edit dan delete siapa saja
    // - uid_user: bisa edit siapa saja, tidak bisa delete
    // - up3_admin: bisa edit dan delete (di unitnya)
    // - up3_user: bisa edit (vendor_k3 di unitnya), tidak bisa delete
    // - vendor_k3: hanya bisa edit profil sendiri
    const role = currentProfile.role;
    const isOwnProfile = userId === currentProfile.id;

    let canEdit = false;
    let canDelete = false;

    // Setiap user bisa edit profil sendiri
    if (isOwnProfile) {
        canEdit = true;
        canDelete = false; // Tidak bisa hapus diri sendiri
    } else if (role === 'uid_admin') {
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

    // Show/hide approve/reject buttons for pending users
    const approveBtn = document.getElementById('modalApproveBtn');
    const rejectBtn = document.getElementById('modalRejectBtn');
    const canApprove = ['uid_admin', 'uid_user', 'up3_admin'].includes(role);
    const isPending = user.is_active === false;

    if (approveBtn) approveBtn.style.display = (canApprove && isPending && !isOwnProfile) ? 'inline-block' : 'none';
    if (rejectBtn) rejectBtn.style.display = (canApprove && isPending && !isOwnProfile) ? 'inline-block' : 'none';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('userDetailModal'));
    modal.show();
}

// Edit user from modal
function editUserFromModal() {
    if (selectedUserId) {
        // Close detail modal first
        const detailModal = bootstrap.Modal.getInstance(document.getElementById('userDetailModal'));
        if (detailModal) detailModal.hide();

        // Open edit modal
        openEditModal(selectedUserId);
    }
}

// Open edit modal and populate data
function openEditModal(userId) {
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    selectedUserId = userId;

    // Populate form fields
    document.getElementById('editUserId').value = user.id;
    document.getElementById('editNama').value = user.nama || '';
    document.getElementById('editEmail').value = user.email || '';
    document.getElementById('editNip').value = user.nip || '';
    document.getElementById('editJabatan').value = user.jabatan || '';
    document.getElementById('editBidang').value = user.bidang || '';
    document.getElementById('editSubBidang').value = user.sub_bidang || '';

    // Check if editing own profile
    const isOwnProfile = user.id === currentProfile.id;

    // Set is_active toggle
    const isActiveContainer = document.getElementById('editIsActiveContainer');
    const isActiveCheckbox = document.getElementById('editIsActive');
    const isActiveLabel = document.getElementById('editIsActiveLabel');

    // Show is_active toggle only for admins editing others (not self)
    const canToggleActive = ['uid_admin', 'uid_user', 'up3_admin'].includes(currentProfile.role) && !isOwnProfile;
    if (isActiveContainer) {
        isActiveContainer.style.display = canToggleActive ? 'block' : 'none';
    }
    if (isActiveCheckbox) {
        isActiveCheckbox.checked = user.is_active !== false;
    }
    if (isActiveLabel) {
        isActiveLabel.textContent = user.is_active !== false ? 'Aktif' : 'Tidak Aktif';
    }

    // Update label on checkbox change
    if (isActiveCheckbox) {
        isActiveCheckbox.onchange = function () {
            if (isActiveLabel) {
                isActiveLabel.textContent = this.checked ? 'Aktif' : 'Tidak Aktif';
            }
        };
    }

    // Populate role dropdown based on current user's role
    populateRoleDropdown(user.role, isOwnProfile);

    // Clear any previous alerts
    document.getElementById('editAlertContainer').innerHTML = '';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('editUserModal'));
    modal.show();
}

// Populate role dropdown based on current user's permission
function populateRoleDropdown(targetUserRole, isOwnProfile = false) {
    const roleSelect = document.getElementById('editRole');
    roleSelect.innerHTML = '';

    const myRole = currentProfile.role;
    let allowedRoles = [];

    // Role assignment permissions:
    // - Jika edit profil sendiri: role tidak bisa diubah (kecuali uid_admin)
    // - uid_admin: can assign any role
    // - uid_user: can assign any role except uid_admin
    // - up3_admin: can assign up3_user, vendor_k3
    // - up3_user: can assign vendor_k3 only
    // - vendor_k3: cannot assign roles (hanya bisa edit data sendiri, bukan role)

    // Jika edit profil sendiri dan bukan uid_admin, role di-lock
    if (isOwnProfile && myRole !== 'uid_admin') {
        allowedRoles = [
            { value: targetUserRole, label: formatRole(targetUserRole) }
        ];
        roleSelect.disabled = true;
    } else {
        roleSelect.disabled = false;

        if (myRole === 'uid_admin') {
            allowedRoles = [
                { value: 'uid_admin', label: 'UID Admin' },
                { value: 'uid_user', label: 'UID User' },
                { value: 'up3_admin', label: 'UP3 Admin' },
                { value: 'up3_user', label: 'UP3 User' },
                { value: 'vendor_k3', label: 'Vendor K3' }
            ];
        } else if (myRole === 'uid_user') {
            allowedRoles = [
                { value: 'uid_user', label: 'UID User' },
                { value: 'up3_admin', label: 'UP3 Admin' },
                { value: 'up3_user', label: 'UP3 User' },
                { value: 'vendor_k3', label: 'Vendor K3' }
            ];
        } else if (myRole === 'up3_admin') {
            allowedRoles = [
                { value: 'up3_user', label: 'UP3 User' },
                { value: 'vendor_k3', label: 'Vendor K3' }
            ];
        } else if (myRole === 'up3_user') {
            allowedRoles = [
                { value: 'vendor_k3', label: 'Vendor K3' }
            ];
        }
    }

    allowedRoles.forEach(role => {
        const option = document.createElement('option');
        option.value = role.value;
        option.textContent = role.label;
        if (role.value === targetUserRole) {
            option.selected = true;
        }
        roleSelect.appendChild(option);
    });
}

// Save user edit
async function saveUserEdit() {
    const userId = document.getElementById('editUserId').value;
    const nama = document.getElementById('editNama').value.trim();
    const nip = document.getElementById('editNip').value.trim();
    const jabatan = document.getElementById('editJabatan').value.trim();
    const bidang = document.getElementById('editBidang').value.trim();
    const subBidang = document.getElementById('editSubBidang').value.trim();
    const role = document.getElementById('editRole').value;

    // Get is_active if the container is visible
    const isActiveContainer = document.getElementById('editIsActiveContainer');
    const isActiveCheckbox = document.getElementById('editIsActive');
    const isActiveVisible = isActiveContainer && isActiveContainer.style.display !== 'none';

    // Validation
    if (!nama) {
        showEditAlert('Nama tidak boleh kosong', 'danger');
        return;
    }

    // Disable save button
    const saveBtn = document.getElementById('btnSaveEdit');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyimpan...';

    try {
        const updates = {
            nama: nama,
            nip: nip || null,
            jabatan: jabatan || null,
            bidang: bidang || null,
            sub_bidang: subBidang || null,
            role: role
        };

        // Include is_active only if admin is editing others
        if (isActiveVisible && isActiveCheckbox) {
            updates.is_active = isActiveCheckbox.checked;
        }

        const result = await ProfilesAPI.update(userId, updates);

        if (result.success) {
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('editUserModal'));
            if (modal) modal.hide();

            // Show success message
            showAlert('alertContainer', 'Data pengguna berhasil diperbarui', 'success');

            // Reload users list
            await loadUsers();
        } else {
            showEditAlert('Gagal menyimpan: ' + (result.error || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Error saving user:', error);
        showEditAlert('Terjadi kesalahan: ' + error.message, 'danger');
    } finally {
        // Re-enable save button
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check-lg me-1"></i>Simpan';
    }
}

// Show alert in edit modal
function showEditAlert(message, type) {
    const container = document.getElementById('editAlertContainer');
    if (!container) return;
    container.innerHTML = `
        <div class="alert alert-${type} alert-dismissible fade show py-2" role="alert" style="font-size: 12px;">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" style="padding: 8px;"></button>
        </div>
    `;
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

// Approve user (activate account)
async function approveUser(userId) {
    const user = usersList.find(u => u.id === userId);
    if (!user) return;

    const result = await Swal.fire({
        title: 'Aktifkan Akun?',
        html: `Approve pengguna <strong>${user.nama}</strong>?<br><small class="text-muted">Pengguna akan bisa login setelah diapprove.</small>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#28a745',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Approve',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    try {
        const updateResult = await ProfilesAPI.update(userId, { is_active: true });

        if (updateResult.success) {
            showAlert('alertContainer', `Pengguna "${user.nama}" berhasil diaktifkan`, 'success');
            await loadUsers();
        } else {
            showAlert('alertContainer', 'Gagal mengaktifkan pengguna: ' + (updateResult.error || 'Unknown error'), 'danger');
        }
    } catch (error) {
        console.error('Error approving user:', error);
        showAlert('alertContainer', 'Terjadi kesalahan: ' + error.message, 'danger');
    }
}

// Approve user from modal
async function approveUserFromModal() {
    if (!selectedUserId) return;

    // Close modal first
    const modal = bootstrap.Modal.getInstance(document.getElementById('userDetailModal'));
    if (modal) modal.hide();

    await approveUser(selectedUserId);
}

// Reject user (delete pending account)
async function rejectUserFromModal() {
    const user = usersList.find(u => u.id === selectedUserId);
    if (!user) return;

    const result = await Swal.fire({
        title: 'Tolak Pendaftaran?',
        html: `Tolak pendaftaran <strong>${user.nama}</strong>?<br><small class="text-muted">Akun akan dihapus dan pengguna harus mendaftar ulang.</small>`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Tolak',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    // Close modal first
    const modal = bootstrap.Modal.getInstance(document.getElementById('userDetailModal'));
    if (modal) modal.hide();

    // Delete the user
    await deleteUser(selectedUserId, user.nama);
}

// Edit user (opens edit modal)
function editUser(userId) {
    openEditModal(userId);
}

// Delete user (uses database function to delete from both profiles and auth.users)
async function deleteUser(userId, userName) {
    try {
        const client = getSupabaseClient();

        // Call the delete_user RPC function
        const { data, error } = await client.rpc('delete_user', {
            target_user_id: userId
        });

        if (error) {
            showAlert('alertContainer', 'Gagal menghapus pengguna: ' + error.message, 'danger');
            return;
        }

        // Check result from function
        if (data && data.success) {
            showAlert('alertContainer', `Pengguna "${userName}" berhasil dihapus`, 'success');
            // Reload users
            await loadUsers();
        } else {
            showAlert('alertContainer', 'Gagal menghapus pengguna: ' + (data?.error || 'Unknown error'), 'danger');
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
