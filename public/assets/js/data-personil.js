/**
 * Data Personil (Personnel) Page
 * Handle personnel list display with CRUD operations
 * All users can add/edit/delete
 * Filter by unit (UID sees all, others see their unit only)
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let personnelList = [];
let vendorsList = [];
let peruntukanList = [];
let teamsList = [];

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
        await loadTeams();

        // Load personnel
        await loadPersonnel();

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

// Check if user is UID (can see all data)
function isUIDUser() {
    const role = currentProfile?.role || '';
    return role.startsWith('uid_');
}

// Check if user is Vendor K3
function isVendorUser() {
    return currentProfile?.role === 'vendor_k3';
}

// Load vendors for dropdown (filtered by role)
async function loadVendors() {
    try {
        const result = await VendorsAPI.getAll();

        if (result.success && result.data) {
            // Filter based on role
            if (isUIDUser()) {
                vendorsList = result.data;
            } else if (isVendorUser()) {
                // Vendor K3: only their vendor
                vendorsList = result.data.filter(v => v.id === currentProfile.vendor_id);
            } else {
                // UP3: filter by unit_code
                vendorsList = result.data.filter(v => v.unit_code === currentProfile.unit_code);
            }

            const select = document.getElementById('vendorPersonilSelect');
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
            const select = document.getElementById('peruntukanPersonilSelect');
            if (select) {
                select.innerHTML = '<option value="">Pilih Peruntukan</option>';
                peruntukanList.forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = `${item.jenis} - ${item.deskripsi || ''}`;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        // Error loading peruntukan
    }
}

// Load teams for dropdown (optional assignment)
async function loadTeams() {
    try {
        const result = await TeamsAPI.getAll();

        if (result.success && result.data) {
            // Filter based on role
            if (isUIDUser()) {
                teamsList = result.data;
            } else if (isVendorUser()) {
                // Vendor K3: only their vendor's teams
                teamsList = result.data.filter(t => t.vendor_id === currentProfile.vendor_id);
            } else {
                // UP3: filter by unit_code
                teamsList = result.data.filter(t => t.vendors?.unit_code === currentProfile.unit_code);
            }

            const select = document.getElementById('teamPersonilSelect');
            if (select) {
                select.innerHTML = '<option value="">Tidak Ada / Belum Ditentukan</option>';
                teamsList.forEach(team => {
                    const option = document.createElement('option');
                    option.value = team.id;
                    option.textContent = `${team.nomor_polisi || '-'} (${team.category || '-'}) - ${team.vendors?.vendor_name || '-'}`;
                    select.appendChild(option);
                });
            }
        }
    } catch (error) {
        // Error loading teams
    }
}

// Load personnel from database (filtered by unit)
async function loadPersonnel() {
    try {
        const tableBody = document.getElementById('personil-table-body');
        if (!tableBody) {
            return;
        }

        // Show loading
        tableBody.innerHTML = '<tr><td colspan="6" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Memuat data...</td></tr>';

        const result = await PersonnelAPI.getAll();

        if (!result.success) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Gagal memuat data: ' + result.error + '</td></tr>';
            return;
        }

        let data = result.data || [];

        // Filter based on role
        if (isVendorUser() && currentProfile?.vendor_id) {
            // Vendor K3: only their vendor's personnel
            data = data.filter(p => p.vendor_id === currentProfile.vendor_id);
        } else if (!isUIDUser() && currentProfile?.unit_code) {
            // UP3: filter by unit_code
            data = data.filter(p => p.vendors?.unit_code === currentProfile.unit_code);
        }

        personnelList = data;

        if (personnelList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center">Tidak ada data personil</td></tr>';
            return;
        }

        renderPersonnelTable();

    } catch (error) {
        const tableBody = document.getElementById('personil-table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error: ' + error.message + '</td></tr>';
        }
    }
}

// Render personnel table
function renderPersonnelTable() {
    const tableBody = document.getElementById('personil-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    personnelList.forEach((item, index) => {
        const row = document.createElement('tr');

        const vendorName = item.vendors?.vendor_name || '-';
        const unitCode = item.vendors?.unit_code || '-';
        const peruntukanJenis = item.peruntukan?.jenis || '-';
        const peruntukanDesc = item.peruntukan?.deskripsi || '';
        const peruntukan = peruntukanDesc ? `${peruntukanJenis} - ${peruntukanDesc}` : peruntukanJenis;
        const teamInfo = item.teams ? `${item.teams.nomor_polisi || '-'} (${item.teams.category || '-'})` : '-';

        row.innerHTML = `
            <td>${index + 1}</td>
            <td><strong>${item.nama_personil || '-'}</strong></td>
            <td>${vendorName}</td>
            <td>${unitCode}</td>
            <td>${peruntukan}</td>
            <td>
                <button class="btn btn-warning btn-sm edit-btn" 
                    data-id="${item.id}"
                    data-vendor-id="${item.vendor_id || ''}"
                    data-team-id="${item.team_id || ''}"
                    data-peruntukan-id="${item.peruntukan_id || ''}"
                    data-nama="${item.nama_personil || ''}"
                    data-nik="${item.nik || ''}"
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
    // Add button click - reset form
    const addBtn = document.getElementById('addPersonilBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            resetForm();
            const modalLabel = document.getElementById('personilModalLabel');
            if (modalLabel) modalLabel.textContent = 'Tambah Data Personil';
        });
    }

    // Form submit
    const form = document.getElementById('personilForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Modal hidden - reset form
    const modal = document.getElementById('personilModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', resetForm);
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
    const form = document.getElementById('personilForm');
    const idInput = document.getElementById('personilId');

    if (form) form.reset();
    if (idInput) idInput.value = '';
}

// Handle edit button click
function handleEdit(event) {
    const btn = event.target.closest('button');
    const id = btn.dataset.id;
    const vendorId = btn.dataset.vendorId;
    const teamId = btn.dataset.teamId;
    const peruntukanId = btn.dataset.peruntukanId;
    const nama = btn.dataset.nama;
    const nik = btn.dataset.nik;

    // Set form values
    const idInput = document.getElementById('personilId');
    const vendorSelect = document.getElementById('vendorPersonilSelect');
    const teamSelect = document.getElementById('teamPersonilSelect');
    const peruntukanSelect = document.getElementById('peruntukanPersonilSelect');
    const namaInput = document.getElementById('namaPersonil');
    const nikInput = document.getElementById('nikPersonil');
    const modalLabel = document.getElementById('personilModalLabel');

    if (idInput) idInput.value = id;
    if (vendorSelect) vendorSelect.value = vendorId;
    if (teamSelect) teamSelect.value = teamId || '';
    if (peruntukanSelect) peruntukanSelect.value = peruntukanId;
    if (namaInput) namaInput.value = nama;
    if (nikInput) nikInput.value = nik;
    if (modalLabel) modalLabel.textContent = 'Edit Data Personil';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('personilModal'));
    modal.show();
}

// Handle form submit
async function handleFormSubmit(event) {
    event.preventDefault();

    const idInput = document.getElementById('personilId');
    const vendorSelect = document.getElementById('vendorPersonilSelect');
    const teamSelect = document.getElementById('teamPersonilSelect');
    const peruntukanSelect = document.getElementById('peruntukanPersonilSelect');
    const namaInput = document.getElementById('namaPersonil');
    const nikInput = document.getElementById('nikPersonil');

    const personnelId = idInput?.value;
    const personnelData = {
        vendor_id: vendorSelect?.value || null,
        team_id: teamSelect?.value || null,
        peruntukan_id: peruntukanSelect?.value || null,
        nama_personil: namaInput?.value?.trim(),
        nik: nikInput?.value?.trim()
    };

    // Validation
    if (!personnelData.vendor_id || !personnelData.peruntukan_id || !personnelData.nama_personil) {
        Swal.fire('Validasi Gagal!', 'Vendor, Peruntukan, dan Nama harus diisi.', 'warning');
        return;
    }

    // Set default NIK if empty
    if (!personnelData.nik) {
        personnelData.nik = '-';
    }

    // Remove empty team_id
    if (!personnelData.team_id) {
        personnelData.team_id = null;
    }

    let result;
    if (personnelId) {
        // Update
        result = await PersonnelAPI.update(personnelId, personnelData);
    } else {
        // Create
        result = await PersonnelAPI.create(personnelData);
    }

    if (result.success) {
        // Close modal
        const modalEl = document.getElementById('personilModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        Swal.fire({
            title: 'Berhasil!',
            text: `Data personil berhasil ${personnelId ? 'diperbarui' : 'disimpan'}.`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });

        await loadPersonnel();
    } else {
        Swal.fire('Gagal!', `Terjadi kesalahan: ${result.error || 'Unknown error'}`, 'error');
    }
}

// Handle delete button click
async function handleDelete(event) {
    const btn = event.target.closest('button');
    const personnelId = btn.dataset.id;

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
        const deleteResult = await PersonnelAPI.delete(personnelId);
        if (deleteResult.success) {
            Swal.fire('Dihapus!', 'Data personil telah dihapus.', 'success');
            await loadPersonnel();
        } else {
            Swal.fire('Gagal!', 'Terjadi kesalahan saat menghapus data: ' + (deleteResult.error || ''), 'error');
        }
    }
}
