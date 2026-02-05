/**
 * Data Unit Page
 * Handle unit list display with role-based CRUD permissions
 * Only uid_admin and uid_user can perform CRUD operations
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let unitsList = [];
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

            // Save role to localStorage for CSS-based menu visibility
            if (typeof saveUserRoleToStorage === 'function') {
                saveUserRoleToStorage(currentProfile);
            }

            // Only UID roles can access this page
            const role = currentProfile.role;
            if (!role || !role.startsWith('uid_')) {
                Swal.fire({
                    icon: 'warning',
                    title: 'Akses Ditolak',
                    text: 'Halaman ini hanya dapat diakses oleh UID Admin/User',
                    confirmButtonText: 'Kembali ke Dashboard'
                }).then(() => {
                    window.location.href = 'index.html';
                });
                return;
            }

            updateNavbarProfile();
            applyRoleBasedControl();
        } else {
            return;
        }

        // Load units
        await loadUnits();

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

    const addBtn = document.getElementById('addUnitBtn');
    if (addBtn) {
        addBtn.style.display = canCRUD ? 'inline-block' : 'none';
    }
}

// Load units from database
async function loadUnits() {
    try {
        const tableBody = document.getElementById('unit-table-body');
        if (!tableBody) {
            return;
        }

        tableBody.innerHTML = '<tr><td colspan="5" class="text-center"><div class="spinner-border spinner-border-sm"></div> Memuat data...</td></tr>';

        const result = await UnitsAPI.getAll();

        if (result.success && result.data) {
            unitsList = result.data;
            displayUnits(unitsList);
        } else {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Tidak ada data unit</td></tr>';
        }

    } catch (error) {
        const tableBody = document.getElementById('unit-table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Gagal memuat data</td></tr>';
        }
    }
}

// Display units in table
function displayUnits(units) {
    const tableBody = document.getElementById('unit-table-body');
    tableBody.innerHTML = '';

    if (!units || units.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Tidak ada data unit</td></tr>';
        return;
    }

    units.forEach((unit, index) => {
        const row = document.createElement('tr');

        // Tipe badge
        const tipeBadge = unit.unit_tipe === 'UID'
            ? '<span class="badge bg-primary">UID</span>'
            : '<span class="badge bg-success">UP3</span>';

        // Action buttons (only show if canCRUD)
        const actionButtons = canCRUD
            ? `<button class="btn btn-warning btn-sm me-1" onclick="editUnit('${unit.unit_code}')" title="Edit">
                   <i class="bi bi-pencil"></i>
               </button>
               <button class="btn btn-danger btn-sm" onclick="deleteUnit('${unit.unit_code}')" title="Hapus">
                   <i class="bi bi-trash"></i>
               </button>`
            : '<span class="text-muted">-</span>';

        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${unit.unit_code}</strong></td>
            <td>${unit.unit_name}</td>
            <td>${tipeBadge}</td>
            <td>${actionButtons}</td>
        `;

        tableBody.appendChild(row);
    });
}

// Setup event listeners
function setupEventListeners() {
    // Form submit
    const form = document.getElementById('unitForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Reset form when modal is hidden
    const modal = document.getElementById('unitModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', resetForm);
    }

    // Add button click - reset form for new entry
    const addBtn = document.getElementById('addUnitBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            resetForm();
            document.getElementById('unitModalLabel').textContent = 'Tambah Unit Baru';
            document.getElementById('kodeUnit').disabled = false;
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

// Reset form
function resetForm() {
    const form = document.getElementById('unitForm');
    if (form) form.reset();
    document.getElementById('originalKodeUnit').value = '';
    document.getElementById('kodeUnit').disabled = false;
}

// Edit unit
function editUnit(unitCode) {
    const unit = unitsList.find(u => u.unit_code === unitCode);
    if (!unit) return;

    document.getElementById('unitModalLabel').textContent = 'Edit Unit';
    document.getElementById('originalKodeUnit').value = unit.unit_code;
    document.getElementById('kodeUnit').value = unit.unit_code;
    document.getElementById('kodeUnit').disabled = true; // Disable editing kode unit
    document.getElementById('namaUnit').value = unit.unit_name;
    document.getElementById('tipeUnit').value = unit.unit_tipe || '';

    const modal = new bootstrap.Modal(document.getElementById('unitModal'));
    modal.show();
}

// Delete unit
async function deleteUnit(unitCode) {
    const result = await Swal.fire({
        title: 'Hapus Unit?',
        text: `Apakah Anda yakin ingin menghapus unit "${unitCode}"?`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus!',
        cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        try {
            const deleteResult = await UnitsAPI.delete(unitCode);

            if (deleteResult.success) {
                Swal.fire('Berhasil!', 'Unit telah dihapus.', 'success');
                await loadUnits();
            } else {
                Swal.fire('Gagal!', deleteResult.error || 'Gagal menghapus unit.', 'error');
            }
        } catch (error) {
            Swal.fire('Error!', 'Terjadi kesalahan: ' + error.message, 'error');
        }
    }
}

// Handle form submit
async function handleFormSubmit(e) {
    e.preventDefault();

    const originalKode = document.getElementById('originalKodeUnit').value;
    const kodeUnit = document.getElementById('kodeUnit').value.trim();
    const namaUnit = document.getElementById('namaUnit').value.trim();
    const tipeUnit = document.getElementById('tipeUnit').value;

    if (!kodeUnit || !namaUnit || !tipeUnit) {
        Swal.fire('Peringatan', 'Semua field harus diisi!', 'warning');
        return;
    }

    const unitData = {
        unit_code: kodeUnit,
        unit_name: namaUnit,
        unit_tipe: tipeUnit
    };

    try {
        let result;

        if (originalKode) {
            // Update existing
            result = await UnitsAPI.update(originalKode, {
                unit_name: namaUnit,
                unit_tipe: tipeUnit
            });
        } else {
            // Create new
            result = await UnitsAPI.create(unitData);
        }

        if (result.success) {
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('unitModal'));
            if (modal) modal.hide();

            Swal.fire('Berhasil!', originalKode ? 'Unit berhasil diperbarui.' : 'Unit berhasil ditambahkan.', 'success');
            await loadUnits();
        } else {
            Swal.fire('Gagal!', result.error || 'Gagal menyimpan unit.', 'error');
        }

    } catch (error) {
        Swal.fire('Error!', 'Terjadi kesalahan: ' + error.message, 'error');
    }
}
