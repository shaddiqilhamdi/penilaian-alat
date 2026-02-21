/**
 * Data Peruntukan Page
 * Handle peruntukan list display with role-based CRUD permissions
 * Only uid_admin and uid_user can perform CRUD operations
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let peruntukanList = [];
let canCRUD = false;
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
            applyRoleBasedControl();
        } else {
            return;
        }

        // Load peruntukan
        await loadPeruntukan();

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

    const addBtn = document.getElementById('addPeruntukanBtn');
    if (addBtn) {
        addBtn.style.display = canCRUD ? 'inline-block' : 'none';
    }
}

// Load peruntukan from database
async function loadPeruntukan() {
    try {
        const tableBody = document.getElementById('peruntukan-table-body');
        if (!tableBody) {
            return;
        }

        // Show loading
        tableBody.innerHTML = '<tr><td colspan="3" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Memuat data...</td></tr>';

        const result = await PeruntukanAPI.getAll();

        if (!result.success) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Gagal memuat data: ' + result.error + '</td></tr>';
            return;
        }

        peruntukanList = result.data || [];

        // Sort by deskripsi
        peruntukanList.sort((a, b) => {
            const deskripsiA = (a.deskripsi || '').toLowerCase();
            const deskripsiB = (b.deskripsi || '').toLowerCase();
            if (deskripsiA < deskripsiB) return -1;
            if (deskripsiA > deskripsiB) return 1;
            return 0;
        });

        if (peruntukanList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center">Tidak ada data peruntukan</td></tr>';
            return;
        }

        renderPeruntukanTable();

    } catch (error) {
        const tableBody = document.getElementById('peruntukan-table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="3" class="text-center text-danger">Error: ' + error.message + '</td></tr>';
        }
    }
}

// Render peruntukan table
function renderPeruntukanTable() {
    const tableBody = document.getElementById('peruntukan-table-body');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    peruntukanList.forEach((item, index) => {
        const row = document.createElement('tr');

        // Action buttons based on permission
        let actionButtons = '';
        if (canCRUD) {
            actionButtons = `
                <button class="btn btn-warning btn-sm edit-btn" 
                    data-id="${item.id}"
                    data-deskripsi="${item.deskripsi || ''}"
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
            <td>${item.deskripsi || '-'}</td>
            <td>${actionButtons}</td>
        `;

        tableBody.appendChild(row);
    });

    // Initialize DataTable
    initDataTable();
}

// Initialize or reinitialize DataTable
function initDataTable() {
    const table = document.getElementById('peruntukan-table');
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
    const table = document.getElementById('peruntukan-table');
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
            loadPeruntukan();
        });
    }

    // Add button click
    const addBtn = document.getElementById('addPeruntukanBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            const modalLabel = document.getElementById('peruntukanModalLabel');
            const form = document.getElementById('peruntukanForm');
            if (modalLabel) modalLabel.textContent = 'Tambah Data Peruntukan';
            if (form) {
                form.reset();
                delete form.dataset.peruntukanId;
            }
        });
    }

    // Form submit
    const form = document.getElementById('peruntukanForm');
    if (form) {
        form.addEventListener('submit', handleFormSubmit);
    }

    // Modal hidden - reset form
    const modal = document.getElementById('peruntukanModal');
    if (modal) {
        modal.addEventListener('hidden.bs.modal', () => {
            const modalLabel = document.getElementById('peruntukanModalLabel');
            const form = document.getElementById('peruntukanForm');
            if (modalLabel) modalLabel.textContent = 'Form Data Peruntukan';
            if (form) {
                form.reset();
                delete form.dataset.peruntukanId;
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

// Handle edit button click
function handleEdit(event) {
    const btn = event.target.closest('button');
    const id = btn.dataset.id;
    const deskripsi = btn.dataset.deskripsi;

    const modalLabel = document.getElementById('peruntukanModalLabel');
    const form = document.getElementById('peruntukanForm');
    const deskripsiInput = document.getElementById('deskripsi');

    if (modalLabel) modalLabel.textContent = 'Edit Data Peruntukan';
    if (form) form.dataset.peruntukanId = id;
    if (deskripsiInput) deskripsiInput.value = deskripsi;

    const modal = new bootstrap.Modal(document.getElementById('peruntukanModal'));
    modal.show();
}

// Handle delete button click
async function handleDelete(event) {
    const btn = event.target.closest('button');
    const peruntukanId = btn.dataset.id;

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
        const deleteResult = await PeruntukanAPI.delete(peruntukanId);
        if (deleteResult.success) {
            Swal.fire('Dihapus!', 'Data peruntukan telah dihapus.', 'success');
            await loadPeruntukan();
        } else {
            Swal.fire('Gagal!', 'Terjadi kesalahan saat menghapus data: ' + (deleteResult.error || ''), 'error');
        }
    }
}

// Handle form submit
async function handleFormSubmit(event) {
    event.preventDefault();

    const form = document.getElementById('peruntukanForm');
    const peruntukanId = form.dataset.peruntukanId;
    const deskripsiInput = document.getElementById('deskripsi');

    const peruntukanData = {
        deskripsi: deskripsiInput.value.trim()
    };

    // Validation
    if (!peruntukanData.deskripsi) {
        Swal.fire('Validasi Gagal!', 'Deskripsi harus diisi.', 'warning');
        return;
    }

    let result;
    if (peruntukanId) {
        // Update
        result = await PeruntukanAPI.update(peruntukanId, peruntukanData);
    } else {
        // Create
        result = await PeruntukanAPI.create(peruntukanData);
    }

    if (result.success) {
        // Close modal
        const modalEl = document.getElementById('peruntukanModal');
        const modal = bootstrap.Modal.getInstance(modalEl);
        if (modal) modal.hide();

        Swal.fire({
            title: 'Berhasil!',
            text: `Data peruntukan berhasil ${peruntukanId ? 'diperbarui' : 'disimpan'}.`,
            icon: 'success',
            timer: 2000,
            showConfirmButton: false
        });

        await loadPeruntukan();
    } else {
        Swal.fire('Gagal!', `Terjadi kesalahan saat ${peruntukanId ? 'memperbarui' : 'menyimpan'} data: ` + (result.error || ''), 'error');
    }
}
