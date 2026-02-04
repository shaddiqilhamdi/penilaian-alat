/**
 * Data Peralatan Page
 * Handle equipment master list display with role-based CRUD permissions
 * Only uid_admin and uid_user can perform CRUD operations
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let equipmentList = [];
let canCRUD = false;

// Role labels for display
const ROLE_LABELS = {
    uid_admin: 'UID Admin',
    uid_user: 'UID User',
    up3_admin: 'UP3 Admin',
    up3_user: 'UP3 User',
    vendor_k3: 'Vendor K3'
};

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthAndLoadData();
    setupEventListeners();
});

// Check authentication and load data
async function checkAuthAndLoadData() {
    try {
        // Check if user is logged in
        currentUser = await getCurrentUser();

        if (!currentUser) {
            window.location.href = 'pages-login.html';
            return;
        }

        // Load current user's profile
        const profileResult = await ProfilesAPI.getById(currentUser.id);
        if (profileResult.success && profileResult.data) {
            currentProfile = profileResult.data;
            updateNavbarProfile();
            applyRoleBasedControl();
        } else {
            return;
        }

        // Load equipment
        await loadEquipment();

    } catch (error) {
        Swal.fire('Error', 'Gagal memuat halaman: ' + error.message, 'error');
    }
}

// Update navbar profile display
function updateNavbarProfile() {
    if (!currentProfile) return;

    const fullName = currentProfile.nama || 'User';
    const shortName = fullName.split(' ')[0];
    const initial = shortName.charAt(0).toUpperCase();
    const roleLabel = ROLE_LABELS[currentProfile.role] || currentProfile.role;

    const navProfileInitial = document.getElementById('navProfileInitial');
    const navProfileName = document.getElementById('navProfileName');
    const navProfileFullName = document.getElementById('navProfileFullName');
    const navProfileRole = document.getElementById('navProfileRole');

    if (navProfileInitial) navProfileInitial.textContent = initial;
    if (navProfileName) navProfileName.textContent = shortName;
    if (navProfileFullName) navProfileFullName.textContent = fullName;
    if (navProfileRole) navProfileRole.textContent = roleLabel;
}

// Apply role-based control
function applyRoleBasedControl() {
    const role = currentProfile.role;

    // Only uid_admin and uid_user can CRUD
    canCRUD = ['uid_admin', 'uid_user'].includes(role);

    const addBtn = document.getElementById('addPeralatanBtn');
    if (addBtn) {
        addBtn.style.display = canCRUD ? 'inline-block' : 'none';
    }
}

// Load equipment from database
async function loadEquipment() {
    try {
        const tableBody = document.getElementById('peralatan-table-body');
        if (!tableBody) {
            return;
        }

        // Show loading
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Memuat data...</td></tr>';

        const result = await EquipmentAPI.getAll();

        if (!result.success) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Gagal memuat data: ' + result.error + '</td></tr>';
            return;
        }

        equipmentList = result.data || [];

        if (equipmentList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data peralatan</td></tr>';
            return;
        }

        renderEquipmentTable();

    } catch (error) {
        const tableBody = document.getElementById('peralatan-table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error: ' + error.message + '</td></tr>';
        }
    }
}

// Render equipment table
function renderEquipmentTable() {
    const tableBody = document.getElementById('peralatan-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    equipmentList.forEach((item, index) => {
        const row = document.createElement('tr');

        // Action buttons based on permission
        let actionButtons = '';
        if (canCRUD) {
            actionButtons = `
                <button class="btn btn-warning btn-sm edit-btn" 
                    data-id="${item.id}"
                    title="Edit">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-danger btn-sm delete-btn" data-id="${item.id}" title="Hapus">
                    <i class="bi bi-trash"></i>
                </button>
            `;
        } else {
            actionButtons = '<span class="text-muted">-</span>';
        }

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${item.nama_alat || '-'}</td>
            <td>${item.kategori || '-'}</td>
            <td>${item['sub-kategori1'] || '-'}</td>
            <td>${item.satuan || '-'}</td>
            <td>${actionButtons}</td>
        `;

        tableBody.appendChild(row);
    });

    // Attach event listeners to buttons
    attachButtonListeners();
}

// Attach event listeners to edit/delete buttons
function attachButtonListeners() {
    // Edit buttons
    document.querySelectorAll('.edit-btn').forEach(btn => {
        btn.addEventListener('click', handleEdit);
    });

    // Delete buttons
    document.querySelectorAll('.delete-btn').forEach(btn => {
        btn.addEventListener('click', handleDelete);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Add button click
    const addBtn = document.getElementById('addPeralatanBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            // TODO: Implement add equipment modal
            Swal.fire('Info', 'Fitur tambah peralatan akan segera tersedia', 'info');
        });
    }

    // Logout button
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
                    // Logout error
                }
                window.location.href = 'pages-login.html';
            }
        });
    }
}

// Handle edit button click
function handleEdit(event) {
    const btn = event.target.closest('button');
    const id = btn.dataset.id;

    // TODO: Implement edit equipment modal
    Swal.fire('Info', 'Fitur edit peralatan akan segera tersedia', 'info');
}

// Handle delete button click
async function handleDelete(event) {
    const btn = event.target.closest('button');
    const equipmentId = btn.dataset.id;

    const result = await Swal.fire({
        title: 'Anda yakin?',
        text: 'Data yang dihapus tidak dapat dikembalikan!',
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Ya, hapus!',
        cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        const deleteResult = await EquipmentAPI.delete(equipmentId);
        if (deleteResult.success) {
            Swal.fire('Dihapus!', 'Data peralatan telah dihapus.', 'success');
            await loadEquipment();
        } else {
            Swal.fire('Gagal!', 'Terjadi kesalahan saat menghapus data: ' + (deleteResult.error || ''), 'error');
        }
    }
}
