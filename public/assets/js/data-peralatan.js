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
        tableBody.innerHTML = '<tr><td colspan="7" class="text-center"><div class="spinner-border spinner-border-sm" role="status"></div> Memuat data...</td></tr>';

        const result = await EquipmentAPI.getAll();

        if (!result.success) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Gagal memuat data: ' + result.error + '</td></tr>';
            return;
        }

        equipmentList = result.data || [];

        if (equipmentList.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center">Tidak ada data peralatan</td></tr>';
            return;
        }

        renderEquipmentTable();

    } catch (error) {
        const tableBody = document.getElementById('peralatan-table-body');
        if (tableBody) {
            tableBody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error: ' + error.message + '</td></tr>';
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
            <td>${item.sub_kategori1 || '-'}</td>
            <td>${item.jenis || '-'}</td>
            <td>${item.satuan || '-'}</td>
            <td>${actionButtons}</td>
        `;

        tableBody.appendChild(row);
    });

    // Initialize DataTable
    initDataTable();
}

// Initialize or reinitialize DataTable
function initDataTable() {
    const table = document.getElementById('peralatan-table');
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
    const table = document.getElementById('peralatan-table');
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
            loadEquipment();
        });
    }

    // Add button click
    const addBtn = document.getElementById('addPeralatanBtn');
    if (addBtn) {
        addBtn.addEventListener('click', () => {
            // Clear form for new entry
            document.getElementById('peralatanId').value = '';
            document.getElementById('namaAlat').value = '';
            document.getElementById('kategori').value = '';
            document.getElementById('subKategori').value = '';
            document.getElementById('jenisSelect').value = '';
            document.getElementById('satuan').value = '';
            document.getElementById('peralatanModalLabel').textContent = 'Tambah Data Peralatan';
        });
    }

    // Save button click
    const saveBtn = document.getElementById('savePeralatanBtn');
    if (saveBtn) {
        saveBtn.addEventListener('click', handleSave);
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

    // Find equipment data
    const equipment = equipmentList.find(e => e.id === id);
    if (!equipment) {
        Swal.fire('Error', 'Data peralatan tidak ditemukan', 'error');
        return;
    }

    // Fill form with data
    document.getElementById('peralatanId').value = equipment.id;
    document.getElementById('namaAlat').value = equipment.nama_alat || '';
    document.getElementById('kategori').value = equipment.kategori || '';
    document.getElementById('subKategori').value = equipment.sub_kategori1 || '';
    document.getElementById('jenisSelect').value = equipment.jenis || '';
    document.getElementById('satuan').value = equipment.satuan || '';
    document.getElementById('peralatanModalLabel').textContent = 'Edit Data Peralatan';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('peralatanModal'));
    modal.show();
}

// Handle save (create/update)
async function handleSave() {
    const id = document.getElementById('peralatanId').value;
    const namaAlat = document.getElementById('namaAlat').value.trim();
    const jenis = document.getElementById('jenisSelect').value;

    // Validate required fields
    if (!namaAlat) {
        Swal.fire('Error', 'Nama alat harus diisi', 'error');
        return;
    }
    if (!jenis) {
        Swal.fire('Error', 'Jenis harus dipilih', 'error');
        return;
    }

    const data = {
        nama_alat: namaAlat,
        kategori: document.getElementById('kategori').value.trim() || null,
        sub_kategori1: document.getElementById('subKategori').value.trim() || null,
        jenis: jenis,
        satuan: document.getElementById('satuan').value.trim() || null
    };

    let result;
    if (id) {
        // Update existing
        result = await EquipmentAPI.update(id, data);
    } else {
        // Create new
        result = await EquipmentAPI.create(data);
    }

    if (result.success) {
        // Close modal
        bootstrap.Modal.getInstance(document.getElementById('peralatanModal')).hide();
        Swal.fire('Sukses', id ? 'Data berhasil diupdate' : 'Data berhasil ditambahkan', 'success');
        await loadEquipment();
    } else {
        Swal.fire('Error', 'Gagal menyimpan data: ' + result.error, 'error');
    }
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
