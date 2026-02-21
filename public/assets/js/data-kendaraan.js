/**
 * Data Kendaraan (Teams) Page
 * Handle teams/regu list display with CRUD operations
 * All users can add/edit/delete
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let teamsList = [];
let vendorsList = [];
let peruntukanList = [];
let dataTable = null;

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
            updateNavbarProfile();
        } else {
            return;
        }

        // Load dropdown data
        await loadVendors();
        await loadPeruntukan();

        // Load teams
        await loadTeams();

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

// Load vendors for dropdown (filtered by role)
async function loadVendors() {
    try {
        let result;
        const role = currentProfile?.role;
        const unitCode = currentProfile?.unit_code;
        const vendorId = currentProfile?.vendor_id;

        // Filter based on role
        if (role === 'uid_admin' || role === 'uid_user') {
            // UID level: load all vendors
            result = await VendorsAPI.getAll();
        } else if (role === 'up3_admin' || role === 'up3_user') {
            // UP3 level: load vendors in their unit only
            result = await VendorsAPI.getByUnitCode(unitCode);
        } else if (role === 'vendor_k3') {
            // Vendor level: load only their vendor
            const vendor = await VendorsAPI.getById(vendorId);
            result = { success: true, data: vendor ? [vendor] : [] };
        } else {
            result = { success: true, data: [] };
        }

        if (result.success && result.data) {
            vendorsList = result.data;
            const select = document.getElementById('vendorKendaraanSelect');
            if (select) {
                select.innerHTML = '<option value="">Pilih Vendor</option>';
                vendorsList.forEach(vendor => {
                    const option = document.createElement('option');
                    option.value = vendor.id;
                    option.textContent = `${vendor.vendor_name} (${vendor.unit_code || '-'})`;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        // Error loading vendors
    }
}

// Load peruntukan for dropdown
async function loadPeruntukan() {
    try {
        const result = await PeruntukanAPI.getAll();

        if (result.success && result.data) {
            peruntukanList = result.data;
            const select = document.getElementById('peruntukanKendaraanSelect');
            if (select) {
                select.innerHTML = '<option value="">Pilih Peruntukan</option>';
                peruntukanList.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.deskripsi || '';
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        // Error loading peruntukan
    }
}

// Load teams from database (filtered by role)
async function loadTeams() {
    try {
        const tableBody = document.getElementById('kendaraan-table-body');
        if (!tableBody) {
            return;
        }

        // Show loading
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Memuat data...</td></tr>';

        let result;
        const role = currentProfile?.role;
        const unitCode = currentProfile?.unit_code;
        const vendorId = currentProfile?.vendor_id;

        // Filter based on role
        if (role === 'uid_admin' || role === 'uid_user') {
            // UID level: load all teams
            result = await TeamsAPI.getAll();
        } else if (role === 'up3_admin' || role === 'up3_user') {
            // UP3 level: load teams from vendors in their unit only
            result = await TeamsAPI.getByUnitCode(unitCode);
        } else if (role === 'vendor_k3') {
            // Vendor level: load only their vendor's teams
            result = await TeamsAPI.getByVendorId(vendorId);
        } else {
            result = { success: true, data: [] };
        }

        if (!result.success) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Gagal memuat data: ' + result.error + '</td></tr>';
            return;
        }

        teamsList = result.data || [];

        if (teamsList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Tidak ada data kendaraan/tim</td></tr>';
            return;
        }

        renderTeamsTable();

    } catch (error) {
        const tableBody = document.getElementById('kendaraan-table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error: ' + error.message + '</td></tr>';
        }
    }
}

// Render teams table
function renderTeamsTable() {
    const tableBody = document.getElementById('kendaraan-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    teamsList.forEach((item, index) => {
        const row = document.createElement('tr');

        const vendorName = item.vendors?.vendor_name || '-';
        const unitCode = item.vendors?.unit_code || '-';
        const peruntukan = item.peruntukan?.deskripsi || '-';

        const description = item.description || '';

        row.innerHTML = `
            <td>${index + 1}</td>
            <td>${vendorName}</td>
            <td>${unitCode}</td>
            <td>${peruntukan}</td>
            <td>${item.category || '-'}</td>
            <td>${item.nomor_polisi || '-'}${description ? '<br><small class="text-muted">' + description + '</small>' : ''}</td>
            <td>
                <button class="btn btn-warning btn-sm edit-btn" 
                    data-id="${item.id}"
                    data-vendor-id="${item.vendor_id || ''}"
                    data-peruntukan-id="${item.peruntukan_id || ''}"
                    data-category="${item.category || ''}"
                    data-nomor-polisi="${item.nomor_polisi || ''}"
                    data-description="${description}"
                    title="Edit">
                    <i class="bi bi-pencil"></i>
                </button>
                <button class="btn btn-danger btn-sm delete-btn" data-id="${item.id}" title="Hapus">
                    <i class="bi bi-trash"></i>
                </button>
            </td>
        `;

        tableBody.appendChild(row);
    });

    // Initialize DataTable
    initDataTable();
}

// Initialize or reinitialize DataTable
function initDataTable() {
    const table = document.getElementById('kendaraan-table');
    if (table && typeof simpleDatatables !== 'undefined') {
        if (dataTable) {
            dataTable.destroy();
            dataTable = null;
        }
        dataTable = new simpleDatatables.DataTable(table, {
            perPage: 10,
            perPageSelect: [5, 10, 25, 50],
            labels: {
                placeholder: "Cari...",
                perPage: "data per halaman",
                noRows: "Tidak ada data",
                info: "Menampilkan {start} sampai {end} dari {rows} data"
            }
        });
    }
}

// Attach event delegation for edit/delete buttons (survives simple-datatables re-rendering)
function attachTableEventDelegation() {
    const table = document.getElementById('kendaraan-table');
    if (!table) return;
    table.addEventListener('click', (event) => {
        const editBtn = event.target.closest('.edit-btn');
        if (editBtn) {
            handleEdit(event);
            return;
        }
        const deleteBtn = event.target.closest('.delete-btn');
        if (deleteBtn) {
            handleDelete(event);
            return;
        }
    });
}

// Setup event listeners
function setupEventListeners() {
    // Event delegation for table buttons (set up once, survives pagination)
    attachTableEventDelegation();

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            if (dataTable) { dataTable.destroy(); dataTable = null; }
            loadTeams();
        });
    }

    // Add button click - reset form
    const addBtn = document.getElementById('addKendaraanBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            resetForm();
            const modalLabel = document.getElementById('kendaraanModalLabel');
            if (modalLabel) modalLabel.textContent = 'Tambah Data Kendaraan';
        });
    }

    // Form submit
    const form = document.getElementById('kendaraanForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Modal hidden - reset form
    const modal = document.getElementById('kendaraanModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', resetForm);
    }

    // Nomor polisi input - uppercase and real-time validation
    const nopolInput = document.getElementById('nopol');
    if (nopolInput) {
        // Auto uppercase as user types
        nopolInput.addEventListener('input', (e) => {
            e.target.value = e.target.value.toUpperCase();
            // Real-time validation
            if (e.target.value && !validateNomorPolisi(e.target.value)) {
                e.target.classList.add('is-invalid');
            } else {
                e.target.classList.remove('is-invalid');
            }
        });

        // Format on blur
        nopolInput.addEventListener('blur', (e) => {
            if (e.target.value && validateNomorPolisi(e.target.value)) {
                e.target.value = formatNomorPolisi(e.target.value);
            }
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
    const form = document.getElementById('kendaraanForm');
    const idInput = document.getElementById('kendaraanId');

    if (form) form.reset();
    if (idInput) idInput.value = '';
}

// Handle edit button click
function handleEdit(event) {
    const btn = event.target.closest('button');
    const id = btn.dataset.id;
    const vendorId = btn.dataset.vendorId;
    const peruntukanId = btn.dataset.peruntukanId;
    const category = btn.dataset.category;
    const nomorPolisi = btn.dataset.nomorPolisi;
    const description = btn.dataset.description;

    // Set form values
    const idInput = document.getElementById('kendaraanId');
    const vendorSelect = document.getElementById('vendorKendaraanSelect');
    const peruntukanSelect = document.getElementById('peruntukanKendaraanSelect');
    const categorySelect = document.getElementById('jenisKendaraan');
    const nopolInput = document.getElementById('nopol');
    const descriptionInput = document.getElementById('descriptionKendaraan');
    const modalLabel = document.getElementById('kendaraanModalLabel');

    if (idInput) idInput.value = id;
    if (vendorSelect) vendorSelect.value = vendorId;
    if (peruntukanSelect) peruntukanSelect.value = peruntukanId;
    if (categorySelect) categorySelect.value = category;
    if (nopolInput) nopolInput.value = nomorPolisi;
    if (descriptionInput) descriptionInput.value = description || '';
    if (modalLabel) modalLabel.textContent = 'Edit Data Kendaraan';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('kendaraanModal'));
    modal.show();
}

// Validate nomor polisi format
// Format: B 1234 XYZ or BB 1234 XYZ (1-2 letters, 1-4 digits, 1-3 letters)
function validateNomorPolisi(nopol) {
    if (!nopol) return false;
    // Remove extra spaces and convert to uppercase
    const cleaned = nopol.toUpperCase().replace(/\s+/g, ' ').trim();
    // Pattern: 1-2 letters, space optional, 1-4 digits, space optional, 1-3 letters
    const pattern = /^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{1,3}$/;
    return pattern.test(cleaned);
}

// Format nomor polisi to standard format
function formatNomorPolisi(nopol) {
    if (!nopol) return '';
    // Remove all spaces and convert to uppercase
    const cleaned = nopol.toUpperCase().replace(/\s+/g, '');
    // Extract parts: prefix (1-2 letters), number (1-4 digits), suffix (1-3 letters)
    const match = cleaned.match(/^([A-Z]{1,2})(\d{1,4})([A-Z]{1,3})$/);
    if (match) {
        return `${match[1]} ${match[2]} ${match[3]}`;
    }
    return cleaned;
}

// Handle form submit
async function handleFormSubmit(event) {
    event.preventDefault();

    const idInput = document.getElementById('kendaraanId');
    const vendorSelect = document.getElementById('vendorKendaraanSelect');
    const peruntukanSelect = document.getElementById('peruntukanKendaraanSelect');
    const categorySelect = document.getElementById('jenisKendaraan');
    const nopolInput = document.getElementById('nopol');
    const descriptionInput = document.getElementById('descriptionKendaraan');

    const teamId = idInput?.value;
    const rawNopol = nopolInput?.value?.trim();

    // Validate nomor polisi format
    if (!validateNomorPolisi(rawNopol)) {
        nopolInput?.classList.add('is-invalid');
        Swal.fire('Validasi Gagal!', 'Format nomor polisi tidak valid. Gunakan format: B 1234 XYZ atau BB 1234 XYZ', 'warning');
        return;
    }
    nopolInput?.classList.remove('is-invalid');

    const teamData = {
        vendor_id: vendorSelect?.value,
        peruntukan_id: peruntukanSelect?.value,
        category: categorySelect?.value,
        nomor_polisi: formatNomorPolisi(rawNopol),
        description: descriptionInput?.value?.trim() || null
    };

    // Validation
    if (!teamData.vendor_id || !teamData.peruntukan_id || !teamData.category || !teamData.nomor_polisi) {
        Swal.fire('Validasi Gagal!', 'Semua field wajib harus diisi.', 'warning');
        return;
    }

    let result;
    if (teamId) {
        // Update
        result = await TeamsAPI.update(teamId, teamData);
    } else {
        // Create
        result = await TeamsAPI.create(teamData);
    }

    if (result.success) {
        // Close modal
        const modalEl = document.getElementById('kendaraanModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        Swal.fire({
            title: 'Berhasil!',
            text: `Data kendaraan berhasil ${teamId ? 'diperbarui' : 'disimpan'}.`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });

        await loadTeams();
    } else {
        Swal.fire('Gagal!', `Terjadi kesalahan: ${result.error || 'Unknown error'}`, 'error');
    }
}

// Handle delete button click
async function handleDelete(event) {
    const btn = event.target.closest('button');
    const teamId = btn.dataset.id;

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
        const deleteResult = await TeamsAPI.delete(teamId);
        if (deleteResult.success) {
            Swal.fire('Dihapus!', 'Data kendaraan telah dihapus.', 'success');
            await loadTeams();
        } else {
            Swal.fire('Gagal!', 'Terjadi kesalahan saat menghapus data: ' + (deleteResult.error || ''), 'error');
        }
    }
}