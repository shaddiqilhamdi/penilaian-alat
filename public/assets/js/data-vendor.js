/**
 * Data Vendor Page Handler
 * Features:
 * - Display vendors from vendors table
 * - Role-based data filtering:
 *   - UID roles (uid_admin, uid_user): see all vendors
 *   - UP3 roles (up3_admin, up3_user): see vendors in same unit only
 *   - vendor_k3: view only
 * - CRUD operations with role-based permissions
 */

document.addEventListener('DOMContentLoaded', () => {
    // Check auth and load data
    checkAuthAndLoadData();
});

// Global variables
let currentUser = null;
let currentProfile = null;
let vendorModal = null;

/**
 * Check authentication and load data
 */
async function checkAuthAndLoadData() {
    try {
        // Get current user
        currentUser = await getCurrentUser();

        if (!currentUser) {
            window.location.href = 'pages-login.html';
            return;
        }

        // Get user profile
        const profileResult = await ProfilesAPI.getById(currentUser.id);
        if (profileResult.success && profileResult.data) {
            currentProfile = profileResult.data;
        } else {
            Swal.fire('Error', 'Gagal memuat profil pengguna', 'error');
            return;
        }

        // Initialize modal
        const modalElement = document.getElementById('vendorModal');
        if (modalElement) {
            vendorModal = new bootstrap.Modal(modalElement);
        }

        // Update navbar profile
        updateNavbarProfile();

        // Apply role-based control
        applyRoleBasedControl();

        // Load units for dropdown
        await loadUnitsDropdown();

        // Load vendors data
        await loadVendors();

        // Setup event listeners
        setupEventListeners();

    } catch (error) {
        Swal.fire('Error', 'Terjadi kesalahan saat memuat data', 'error');
    }
}

/**
 * Update navbar profile display
 */
function updateNavbarProfile() {
    if (!currentProfile) return;

    const fullName = currentProfile.nama || currentProfile.full_name || currentProfile.username || currentUser?.email || 'User';
    const shortName = fullName.split(' ')[0];
    const initial = shortName.charAt(0).toUpperCase();

    const navProfileInitial = document.getElementById('navProfileInitial');
    const navProfileName = document.getElementById('navProfileName');
    const navProfileFullName = document.getElementById('navProfileFullName');
    const navProfileRole = document.getElementById('navProfileRole');

    if (navProfileInitial) navProfileInitial.textContent = initial;
    if (navProfileName) navProfileName.textContent = shortName;
    if (navProfileFullName) navProfileFullName.textContent = fullName;
    if (navProfileRole) navProfileRole.textContent = formatRole(currentProfile.role);
}

/**
 * Format role for display
 */
function formatRole(role) {
    const roleMap = {
        'uid_admin': 'UID Admin',
        'uid_user': 'UID User',
        'up3_admin': 'UP3 Admin',
        'up3_user': 'UP3 User',
        'vendor_k3': 'Vendor K3'
    };
    return roleMap[role] || role;
}

/**
 * Apply role-based UI control
 * - UID roles: can CRUD all vendors
 * - UP3 roles: can view vendors in same unit only
 * - vendor_k3: view only
 */
function applyRoleBasedControl() {
    const addVendorBtn = document.getElementById('addVendorBtn');
    const role = currentProfile?.role;

    // Only uid_admin and uid_user can add vendors
    const canModify = ['uid_admin', 'uid_user'].includes(role);

    if (addVendorBtn) {
        if (canModify) {
            addVendorBtn.style.display = 'inline-block';
        } else {
            addVendorBtn.style.display = 'none';
        }
    }
}

/**
 * Load units for dropdown
 */
async function loadUnitsDropdown() {
    const kodeUnitSelect = document.getElementById('kodeUnit');
    if (!kodeUnitSelect) return;

    try {
        const result = await UnitsAPI.getAll();
        if (result.success && result.data) {
            kodeUnitSelect.innerHTML = '<option value="">Pilih Unit</option>';
            result.data.forEach(unit => {
                const option = document.createElement('option');
                option.value = unit.unit_code;
                option.textContent = `${unit.unit_code} - ${unit.unit_name}`;
                kodeUnitSelect.appendChild(option);
            });
        }
    } catch (error) {
        // Error loading units
    }
}

/**
 * Load vendors based on user role
 */
async function loadVendors() {
    try {
        const result = await VendorsAPI.getAll();

        if (result.success && result.data) {
            let vendors = result.data;
            const role = currentProfile?.role;

            // Filter based on role
            if (role === 'vendor_k3') {
                // Vendor K3: only their own vendor
                vendors = vendors.filter(v => v.id === currentProfile?.vendor_id);
            } else if (['up3_admin', 'up3_user'].includes(role)) {
                // UP3: filter by unit_code
                const userUnit = currentProfile?.unit_code;
                if (userUnit) {
                    vendors = vendors.filter(v => v.unit_code === userUnit);
                }
            }

            displayVendors(vendors);
        } else {
            displayVendors([]);
        }
    } catch (error) {
        displayVendors([]);
    }
}

/**
 * Display vendors in table
 */
function displayVendors(vendors) {
    const tbody = document.getElementById('vendor-table-body');
    if (!tbody) return;

    const role = currentProfile?.role;
    const canModify = ['uid_admin', 'uid_user'].includes(role);

    if (vendors.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="5" class="text-center text-muted">Tidak ada data vendor</td>
            </tr>
        `;
    } else {
        tbody.innerHTML = vendors.map((vendor, index) => {
            const actionButtons = canModify
                ? `
                    <button class="btn btn-warning btn-sm edit-btn" onclick="editVendor('${vendor.id}')"
                        data-id="${vendor.id}"
                        data-unit-code="${vendor.unit_code || ''}"
                        data-class="${vendor.class || ''}"
                        data-vendor-name="${vendor.vendor_name || ''}">
                        <i class="bi bi-pencil"></i>
                    </button>
                    <button class="btn btn-danger btn-sm delete-btn" onclick="deleteVendor('${vendor.id}')">
                        <i class="bi bi-trash"></i>
                    </button>
                `
                : '<span class="text-muted">-</span>';

            return `
                <tr>
                    <td>${index + 1}</td>
                    <td>${vendor.unit_code || '-'}</td>
                    <td>${vendor.vendor_name || '-'}</td>
                    <td>${vendor.class || '-'}</td>
                    <td>${actionButtons}</td>
                </tr>
            `;
        }).join('');
    }
}

/**
 * Setup event listeners
 */
function setupEventListeners() {
    const vendorForm = document.getElementById('vendorForm');
    const addVendorBtn = document.getElementById('addVendorBtn');
    const modalElement = document.getElementById('vendorModal');

    // Form submit handler
    if (vendorForm) {
        vendorForm.addEventListener('submit', handleFormSubmit);
    }

    // Add vendor button
    if (addVendorBtn) {
        addVendorBtn.addEventListener('click', () => {
            const vendorModalLabel = document.getElementById('vendorModalLabel');
            if (vendorModalLabel) vendorModalLabel.textContent = 'Tambah Data Vendor';
            if (vendorForm) {
                vendorForm.reset();
                delete vendorForm.dataset.vendorId;
            }
        });
    }

    // Reset modal on hide
    if (modalElement) {
        modalElement.addEventListener('hidden.bs.modal', () => {
            const vendorModalLabel = document.getElementById('vendorModalLabel');
            if (vendorModalLabel) vendorModalLabel.textContent = 'Form Data Vendor';
            if (vendorForm) {
                vendorForm.reset();
                delete vendorForm.dataset.vendorId;
            }
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
                    // Logout error
                }
                window.location.href = 'pages-login.html';
            }
        });
    }
}

/**
 * Edit vendor - populate form
 */
function editVendor(vendorId) {
    const button = document.querySelector(`.edit-btn[data-id="${vendorId}"]`);
    if (!button) return;

    const vendorForm = document.getElementById('vendorForm');
    const vendorModalLabel = document.getElementById('vendorModalLabel');

    if (vendorModalLabel) vendorModalLabel.textContent = 'Edit Data Vendor';
    if (vendorForm) vendorForm.dataset.vendorId = vendorId;

    // Populate form fields
    const kodeUnitSelect = document.getElementById('kodeUnit');
    const kelompokSelect = document.getElementById('kelompok');
    const vendorNameInput = document.getElementById('vendorName');

    if (kodeUnitSelect) kodeUnitSelect.value = button.dataset.unitCode || '';
    if (kelompokSelect) kelompokSelect.value = button.dataset.class || '';
    if (vendorNameInput) vendorNameInput.value = button.dataset.vendorName || '';

    if (vendorModal) vendorModal.show();
}

/**
 * Delete vendor
 */
async function deleteVendor(vendorId) {
    const result = await Swal.fire({
        title: 'Anda yakin?',
        text: "Data yang dihapus tidak dapat dikembalikan!",
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#3085d6',
        cancelButtonColor: '#d33',
        confirmButtonText: 'Ya, hapus!',
        cancelButtonText: 'Batal'
    });

    if (result.isConfirmed) {
        try {
            const deleteResult = await VendorsAPI.delete(vendorId);
            if (deleteResult.success) {
                Swal.fire({
                    title: 'Dihapus!',
                    text: 'Data vendor telah dihapus.',
                    icon: 'success',
                    timer: 2000,
                    showConfirmButton: false
                });
                await loadVendors();
            } else {
                Swal.fire('Gagal!', deleteResult.error || 'Terjadi kesalahan saat menghapus data.', 'error');
            }
        } catch (error) {
            Swal.fire('Gagal!', 'Terjadi kesalahan saat menghapus data.', 'error');
        }
    }
}

/**
 * Handle form submission
 */
async function handleFormSubmit(event) {
    event.preventDefault();

    const vendorForm = document.getElementById('vendorForm');
    const vendorId = vendorForm?.dataset.vendorId;

    const vendorData = {
        unit_code: document.getElementById('kodeUnit')?.value || '',
        class: document.getElementById('kelompok')?.value || '',
        vendor_name: document.getElementById('vendorName')?.value || ''
    };

    try {
        let result;
        if (vendorId) {
            // Update existing vendor
            result = await VendorsAPI.update(vendorId, vendorData);
        } else {
            // Create new vendor
            result = await VendorsAPI.create(vendorData);
        }

        if (result.success) {
            if (vendorModal) vendorModal.hide();
            Swal.fire({
                title: 'Berhasil!',
                text: `Data vendor berhasil ${vendorId ? 'diperbarui' : 'disimpan'}.`,
                icon: 'success',
                timer: 2000,
                showConfirmButton: false
            });
            await loadVendors();
        } else {
            Swal.fire('Gagal!', result.error || `Terjadi kesalahan saat ${vendorId ? 'memperbarui' : 'menyimpan'} data.`, 'error');
        }
    } catch (error) {
        Swal.fire('Gagal!', `Terjadi kesalahan saat ${vendorId ? 'memperbarui' : 'menyimpan'} data.`, 'error');
    }
}

// Make functions available globally for onclick handlers
window.editVendor = editVendor;
window.deleteVendor = deleteVendor;
