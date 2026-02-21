/**
 * Data Standar Peralatan Page - Table View
 * Manage equipment standards per vendor/peruntukan
 * Table display with View modal for details
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let standardsList = [];
let vendorsList = [];
let peruntukanList = [];
let equipmentList = [];
let selectedVendorId = null;
let currentViewData = null; // Store current view data for edit/delete
let equipmentRowCounter = 0;
let dataTable = null;

// Initialize page
document.addEventListener('DOMContentLoaded', async function () {
    await checkAuthAndLoad();
    setupEventListeners();
});

// Check authentication and load data
async function checkAuthAndLoad() {
    try {
        currentUser = await getCurrentUser();

        if (!currentUser) {
            window.location.href = 'pages-login.html';
            return;
        }

        // Get profile
        const profileResult = await ProfilesAPI.getById(currentUser.id);
        if (profileResult.success && profileResult.data) {
            currentProfile = profileResult.data;
            saveUserRoleToStorage(currentProfile);
            updateHeaderProfile(currentProfile);
            applyRoleBasedControl();
        }

        // Load filter dropdowns
        await loadFilterDropdowns();

    } catch (error) {
        console.error('Auth error:', error);
        window.location.href = 'pages-login.html';
    }
}

// Update header profile display
function updateHeaderProfile(profile) {
    const initial = profile.nama ? profile.nama.charAt(0).toUpperCase() : '?';
    const navInitial = document.getElementById('navProfileInitial');
    const navName = document.getElementById('navProfileName');
    const navFullName = document.getElementById('navProfileFullName');
    const navRole = document.getElementById('navProfileRole');

    // Get first word only for navbar display
    const firstName = profile.nama ? profile.nama.split(' ')[0] : 'User';

    if (navInitial) navInitial.textContent = initial;
    if (navName) navName.textContent = firstName;
    if (navFullName) navFullName.textContent = profile.nama || 'User';
    if (navRole) navRole.textContent = formatRole(profile.role);
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

// Apply role-based control
function applyRoleBasedControl() {
    const role = currentProfile?.role;
    const addBtn = document.getElementById('addStandardBtn');
    const copyBtn = document.getElementById('copyStandardBtn');
    const editBtn = document.getElementById('btnEditFromDetail');
    const deleteBtn = document.getElementById('btnDeleteFromDetail');

    // Permission rules:
    // uid_admin, uid_user: full access
    // up3_admin: CRUD for vendors in their unit
    // up3_user: view only
    // vendor_k3: view only

    // Copy standard: hanya uid_admin
    if (role !== 'uid_admin') {
        if (copyBtn) copyBtn.style.display = 'none';
    }

    if (role === 'up3_user' || role === 'vendor_k3') {
        if (addBtn) addBtn.style.display = 'none';
        if (editBtn) editBtn.style.display = 'none';
        if (deleteBtn) deleteBtn.style.display = 'none';
    }
}

// Check if user can edit/delete
function canEdit() {
    const role = currentProfile?.role;
    return ['uid_admin', 'uid_user', 'up3_admin'].includes(role);
}

// Load filter dropdowns (vendors and peruntukan)
async function loadFilterDropdowns() {
    try {
        const role = currentProfile?.role;
        const unitCode = currentProfile?.unit_code;

        // Load vendors based on role
        if (role === 'uid_admin' || role === 'uid_user') {
            const result = await VendorsAPI.getAll();
            vendorsList = result?.success ? result.data : [];
        } else if (role === 'up3_admin' || role === 'up3_user') {
            const result = await VendorsAPI.getByUnitCode(unitCode);
            vendorsList = result?.success ? result.data : [];
        } else if (role === 'vendor_k3') {
            const vendor = await VendorsAPI.getById(currentProfile.vendor_id);
            vendorsList = vendor ? [vendor] : [];
        }

        // Load all peruntukan
        const peruntukanResult = await PeruntukanAPI.getAll();
        peruntukanList = peruntukanResult?.success ? peruntukanResult.data : [];

        // Load all equipment
        const equipmentResult = await EquipmentAPI.getAll();
        equipmentList = equipmentResult?.success ? equipmentResult.data : [];

        // Populate filter dropdown
        populateVendorDropdown('filterVendor', vendorsList);

        // Populate form dropdowns
        populateVendorDropdown('vendorSelect', vendorsList);
        populatePeruntukanDropdown('peruntukanSelect', peruntukanList);

        // Auto-select first vendor and load data
        if (vendorsList.length > 0) {
            const firstVendorId = vendorsList[0].id;
            document.getElementById('filterVendor').value = firstVendorId;
            await loadStandardsByVendor(firstVendorId);
        }

    } catch (error) {
        console.error('Error loading dropdowns:', error);
    }
}

// Populate vendor dropdown
function populateVendorDropdown(elementId, vendors) {
    const select = document.getElementById(elementId);
    if (!select) return;

    select.innerHTML = '<option value="">-- Pilih Vendor --</option>';

    vendors.forEach(vendor => {
        const option = document.createElement('option');
        option.value = vendor.id;
        option.textContent = `[${vendor.unit_code || '-'}] ${vendor.vendor_name}`;
        select.appendChild(option);
    });
}

// Populate peruntukan dropdown
function populatePeruntukanDropdown(elementId, peruntukan) {
    const select = document.getElementById(elementId);
    if (!select) return;

    select.innerHTML = '<option value="">Pilih Peruntukan</option>';

    peruntukan.forEach(p => {
        const option = document.createElement('option');
        option.value = p.id;
        option.textContent = `${p.deskripsi}`;
        select.appendChild(option);
    });
}

// Load standards by vendor
async function loadStandardsByVendor(vendorId) {
    if (!vendorId) {
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('tableContainer').style.display = 'none';
        return;
    }

    try {
        showLoading(true);
        selectedVendorId = vendorId;

        const data = await EquipmentStandardsAPI.getByVendor(vendorId);
        standardsList = data || [];

        // Group by peruntukan
        const grouped = groupByPeruntukan(standardsList);
        displayTable(grouped);

    } catch (error) {
        console.error('Error loading standards:', error);
        showAlert('Gagal memuat data', 'error');
    } finally {
        showLoading(false);
    }
}

// Group standards by peruntukan
function groupByPeruntukan(standards) {
    const grouped = {};

    standards.forEach(item => {
        const peruntukanId = item.peruntukan_id;
        if (!grouped[peruntukanId]) {
            grouped[peruntukanId] = {
                peruntukan: item.peruntukan,
                items: []
            };
        }
        grouped[peruntukanId].items.push(item);
    });

    return grouped;
}

// Display table view
function displayTable(grouped) {
    // Destroy existing DataTable before re-render (must happen before querying DOM)
    if (dataTable) {
        dataTable.destroy();
        dataTable = null;
    }

    const tableContainer = document.getElementById('tableContainer');
    const table = document.getElementById('standardsTable');
    const tbody = table ? table.querySelector('tbody') : null;
    const emptyState = document.getElementById('emptyState');

    if (!tbody) {
        console.error('Table body not found');
        return;
    }

    tbody.innerHTML = '';

    const keys = Object.keys(grouped);

    if (keys.length === 0) {
        emptyState.innerHTML = `
            <i class="bi bi-inbox" style="font-size: 48px; color: #ccc;"></i>
            <p class="mt-2 text-muted">Belum ada data peralatan untuk vendor ini</p>
        `;
        emptyState.style.display = 'block';
        tableContainer.style.display = 'none';
        return;
    }

    emptyState.style.display = 'none';
    tableContainer.style.display = 'block';

    // Get selected vendor info
    const selectedVendor = vendorsList.find(v => v.id === selectedVendorId);
    const vendorName = selectedVendor?.vendor_name || '-';
    const unitCode = selectedVendor?.unit_code || '-';

    // Sort keys by deskripsi
    const sortedKeys = keys.sort((a, b) => {
        const pA = grouped[a].peruntukan;
        const pB = grouped[b].peruntukan;
        const deskA = pA?.deskripsi || '';
        const deskB = pB?.deskripsi || '';

        return deskA.localeCompare(deskB);
    });

    sortedKeys.forEach((peruntukanId, index) => {
        const group = grouped[peruntukanId];
        const peruntukan = group.peruntukan;
        const items = group.items;
        const totalItems = items.length;

        const row = document.createElement('tr');
        row.innerHTML = `
            <td>${index + 1}</td>
            <td><span class="badge bg-secondary">${unitCode}</span></td>
            <td>${vendorName}</td>
            <td>${peruntukan?.deskripsi || '-'}</td>
            <td class="text-center">${totalItems}</td>
            <td class="text-center">
                <button class="btn btn-primary btn-sm" onclick="viewDetail('${peruntukanId}')" title="Lihat Detail">
                    <i class="bi bi-eye"></i>
                </button>
            </td>
        `;
        tbody.appendChild(row);
    });

    // Initialize DataTable
    initDataTable();
}

// Initialize or reinitialize DataTable
function initDataTable() {
    const table = document.getElementById('standardsTable');
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

// View detail modal
function viewDetail(peruntukanId) {
    const items = standardsList.filter(s => s.peruntukan_id === peruntukanId);
    if (items.length === 0) return;

    const peruntukan = items[0].peruntukan;
    const selectedVendor = vendorsList.find(v => v.id === selectedVendorId);

    // Store current data for edit/delete
    currentViewData = {
        vendorId: selectedVendorId,
        peruntukanId: peruntukanId,
        items: items
    };

    // Get team count from vendor (default to 1 if not available)
    const teamCount = selectedVendor?.jumlah_tim || selectedVendor?.team_count || 1;

    // Count APD and Peralatan
    const apdCount = items.filter(i => i.equipment_master?.kategori === 'APD').length;
    const peralatanCount = items.filter(i => i.equipment_master?.kategori === 'Peralatan').length;

    // Update modal content - Info section
    document.getElementById('detailUnitName').textContent = selectedVendor?.unit_code || '-';
    document.getElementById('detailVendorName').textContent = selectedVendor?.vendor_name || '-';
    document.getElementById('detailJenis').textContent = peruntukan?.deskripsi || '-';
    document.getElementById('detailPeruntukanName').textContent = peruntukan?.deskripsi || '-';
    document.getElementById('detailApdCount').textContent = apdCount + ' APD';
    document.getElementById('detailPeralatanCount').textContent = peralatanCount + ' Peralatan';

    // Sort items by kategori (APD first, then Peralatan)
    const sortedItems = [...items].sort((a, b) => {
        const katA = a.equipment_master?.kategori || '';
        const katB = b.equipment_master?.kategori || '';
        if (katA === 'APD' && katB !== 'APD') return -1;
        if (katA !== 'APD' && katB === 'APD') return 1;
        return katA.localeCompare(katB);
    });

    // Build equipment table
    const listContainer = document.getElementById('detailEquipmentList');
    listContainer.innerHTML = sortedItems.map((item, idx) => {
        const qty = item.required_qty || 1;
        const totalStandar = qty * teamCount;
        const contractQty = item.contract_qty || '-';
        const totalContract = item.contract_qty ? (item.contract_qty * teamCount) : '-';

        return `
            <tr>
                <td>${idx + 1}</td>
                <td>${item.equipment_master?.nama_alat || '-'}</td>
                <td><span class="badge ${item.equipment_master?.kategori === 'APD' ? 'bg-success' : 'bg-info'}">${item.equipment_master?.kategori || '-'}</span></td>
                <td class="text-center">${qty}</td>
                <td class="text-center"><strong>${totalStandar}</strong></td>
                <td class="text-center">${totalContract}</td>
            </tr>
        `;
    }).join('');

    // Show/hide action buttons based on permission
    const editBtn = document.getElementById('btnEditFromDetail');
    const deleteBtn = document.getElementById('btnDeleteFromDetail');
    if (canEdit()) {
        editBtn.style.display = 'inline-block';
        deleteBtn.style.display = 'inline-block';
    } else {
        editBtn.style.display = 'none';
        deleteBtn.style.display = 'none';
    }

    // Ensure we're in view mode
    setModalMode('view');

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('viewDetailModal'));
    modal.show();
}

// Set modal mode (view or edit)
function setModalMode(mode) {
    const viewContent = document.getElementById('viewModeContent');
    const editContent = document.getElementById('editModeContent');
    const viewButtons = document.getElementById('viewModeButtons');
    const editButtons = document.getElementById('editModeButtons');
    const iconView = document.getElementById('modalIconView');
    const iconEdit = document.getElementById('modalIconEdit');
    const titleText = document.getElementById('modalTitleText');
    const infoViewMode = document.getElementById('infoViewMode');
    const infoEditMode = document.getElementById('infoEditMode');

    if (mode === 'edit') {
        viewContent.style.display = 'none';
        editContent.style.display = 'block';
        viewButtons.style.display = 'none';
        editButtons.style.display = 'block';
        iconView.style.display = 'none';
        iconEdit.style.display = 'inline';
        titleText.textContent = 'Edit Peralatan';
        infoViewMode.style.display = 'none';
        infoEditMode.style.display = 'flex';
    } else {
        viewContent.style.display = 'block';
        editContent.style.display = 'none';
        viewButtons.style.display = 'block';
        editButtons.style.display = 'none';
        iconView.style.display = 'inline';
        iconEdit.style.display = 'none';
        titleText.textContent = 'Detail Peralatan';
        infoViewMode.style.display = 'flex';
        infoEditMode.style.display = 'none';
    }
}

// Edit from detail modal - switch to inline edit mode
function editFromDetail() {
    if (!currentViewData) return;

    // Get current peruntukan info
    const peruntukan = currentViewData.items[0]?.peruntukan;
    const currentPeruntukanId = currentViewData.peruntukanId;

    // Populate Peruntukan dropdown directly (no jenis filter)
    populateEditPeruntukanDropdown(currentPeruntukanId);

    // Set current Peruntukan
    document.getElementById('editPeruntukanSelect').value = currentPeruntukanId;

    // Update counts
    const apdCount = currentViewData.items.filter(i => i.equipment_master?.kategori === 'APD').length;
    const peralatanCount = currentViewData.items.filter(i => i.equipment_master?.kategori === 'Peralatan').length;
    document.getElementById('editApdCount').textContent = apdCount + ' APD';
    document.getElementById('editPeralatanCount').textContent = peralatanCount + ' Peralatan';

    // Populate edit table
    const editList = document.getElementById('editEquipmentList');
    editList.innerHTML = '';
    editRowCounter = 0;

    // Sort items by kategori (APD first, then Peralatan)
    const sortedItems = [...currentViewData.items].sort((a, b) => {
        const katA = a.equipment_master?.kategori || '';
        const katB = b.equipment_master?.kategori || '';
        if (katA === 'APD' && katB !== 'APD') return -1;
        if (katA !== 'APD' && katB === 'APD') return 1;
        return katA.localeCompare(katB);
    });

    sortedItems.forEach((item, idx) => {
        addEditRowWithData(item.equipment_id, item.required_qty, item.contract_qty, item.id);
    });

    // Switch to edit mode
    setModalMode('edit');
}

// Populate Jenis dropdown (kept for backward compatibility - now hidden)
function populateJenisDropdown(selectedJenis) {
    const jenisSelect = document.getElementById('editJenisSelect');
    if (jenisSelect) jenisSelect.value = selectedJenis || '';
}

// Populate edit peruntukan dropdown directly (no jenis filter)
function populateEditPeruntukanDropdown(selectedPeruntukanId) {
    const peruntukanSelect = document.getElementById('editPeruntukanSelect');

    peruntukanSelect.innerHTML = '<option value="">Pilih Peruntukan</option>' +
        peruntukanList.map(p => `<option value="${p.id}" ${p.id === selectedPeruntukanId ? 'selected' : ''}>${p.deskripsi}</option>`).join('');
}

// Filter Peruntukan dropdown by Jenis (kept for backward compatibility)
function filterPeruntukanByJenis() {
    const peruntukanSelect = document.getElementById('editPeruntukanSelect');
    const currentValue = peruntukanSelect.value;

    peruntukanSelect.innerHTML = '<option value="">Pilih Peruntukan</option>' +
        peruntukanList.map(p => `<option value="${p.id}">${p.deskripsi}</option>`).join('');

    // Try to restore previous value if still valid
    if (peruntukanList.some(p => p.id === currentValue)) {
        peruntukanSelect.value = currentValue;
    }
}

// Add edit row counter
let editRowCounter = 0;

// Add empty edit row
function addEditRow() {
    addEditRowWithData('', 1, '', '');
}

// Add edit row with data
function addEditRowWithData(equipmentId, requiredQty, contractQty, standardId) {
    const tbody = document.getElementById('editEquipmentList');
    editRowCounter++;

    // Get kategori for selected equipment
    const selectedEquip = equipmentList.find(eq => eq.id === equipmentId);
    const kategori = selectedEquip?.kategori || '-';

    const row = document.createElement('tr');
    row.setAttribute('data-row-id', editRowCounter);
    row.setAttribute('data-standard-id', standardId || '');
    row.innerHTML = `
        <td class="text-center">${editRowCounter}</td>
        <td>
            <select class="form-select form-select-sm edit-equipment-select" onchange="updateKategori(this)" required>
                <option value="">Pilih Peralatan</option>
                ${equipmentList.map(eq => `
                    <option value="${eq.id}" data-kategori="${eq.kategori || '-'}" ${eq.id === equipmentId ? 'selected' : ''}>
                        ${eq.nama_alat}
                    </option>
                `).join('')}
            </select>
        </td>
        <td class="kategori-cell"><span class="badge ${kategori === 'APD' ? 'bg-success' : 'bg-info'}">${kategori}</span></td>
        <td>
            <input type="number" class="form-control form-control-sm text-center edit-required-qty" 
                   min="1" value="${requiredQty || 1}" required>
        </td>
        <td>
            <input type="number" class="form-control form-control-sm text-center edit-contract-qty" 
                   min="0" value="${contractQty || ''}">
        </td>
        <td class="text-center">
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeEditRow(${editRowCounter})" title="Hapus">
                <i class="bi bi-trash"></i>
            </button>
        </td>
    `;
    tbody.appendChild(row);
}

// Update kategori badge when equipment selection changes
function updateKategori(selectEl) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const kategori = selectedOption.getAttribute('data-kategori') || '-';
    const kategoriCell = selectEl.closest('tr').querySelector('.kategori-cell');
    kategoriCell.innerHTML = `<span class="badge ${kategori === 'APD' ? 'bg-success' : 'bg-info'}">${kategori}</span>`;
}

// Remove edit row
function removeEditRow(rowId) {
    const row = document.querySelector(`#editEquipmentList tr[data-row-id="${rowId}"]`);
    if (row) {
        row.remove();
        // Re-number rows
        const rows = document.querySelectorAll('#editEquipmentList tr');
        rows.forEach((r, idx) => {
            r.querySelector('td:first-child').textContent = idx + 1;
        });
    }
}

// Cancel edit - return to view mode
function cancelEdit() {
    setModalMode('view');
}

// Save inline edit
async function saveInlineEdit() {
    if (!currentViewData) return;

    const rows = document.querySelectorAll('#editEquipmentList tr');
    if (rows.length === 0) {
        showAlert('Tambahkan minimal 1 peralatan', 'warning');
        return;
    }

    const equipmentData = [];
    let hasError = false;

    rows.forEach(row => {
        const equipmentId = row.querySelector('.edit-equipment-select').value;
        const requiredQty = parseInt(row.querySelector('.edit-required-qty').value) || 1;
        const contractQty = row.querySelector('.edit-contract-qty').value
            ? parseInt(row.querySelector('.edit-contract-qty').value)
            : null;
        const standardId = row.getAttribute('data-standard-id') || '';

        if (!equipmentId) {
            hasError = true;
            return;
        }

        equipmentData.push({
            id: standardId,
            equipment_id: equipmentId,
            required_qty: requiredQty,
            contract_qty: contractQty
        });
    });

    if (hasError) {
        showAlert('Harap pilih peralatan untuk semua baris', 'warning');
        return;
    }

    // Get new peruntukan from edit dropdown
    const newPeruntukanId = document.getElementById('editPeruntukanSelect').value;
    if (!newPeruntukanId) {
        showAlert('Harap pilih peruntukan', 'warning');
        return;
    }

    // Get vendor's unit_code
    const vendor = vendorsList.find(v => v.id === currentViewData.vendorId);
    const unitCode = vendor?.unit_code || currentProfile?.unit_code;

    // Show loading on save button
    const saveBtn = document.querySelector('#editModeButtons .btn-success');
    const originalText = saveBtn.innerHTML;
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyimpan...';

    try {
        // Delete existing items for this peruntukan first
        for (const item of currentViewData.items) {
            await EquipmentStandardsAPI.delete(item.id);
        }

        // Create all new items with new peruntukan
        const createData = equipmentData.map(item => ({
            vendor_id: currentViewData.vendorId,
            unit_code: unitCode,
            peruntukan_id: newPeruntukanId,
            equipment_id: item.equipment_id,
            required_qty: item.required_qty,
            contract_qty: item.contract_qty
        }));

        const result = await EquipmentStandardsAPI.createBatch(createData);

        if (result.success) {
            showAlert('Data berhasil disimpan', 'success');

            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('viewDetailModal'));
            if (modal) modal.hide();

            // Reload data
            await loadStandardsByVendor(selectedVendorId);
        } else {
            showAlert('Gagal menyimpan: ' + (result.error || 'Unknown error'), 'error');
        }

    } catch (error) {
        console.error('Error saving:', error);
        showAlert('Terjadi kesalahan: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = originalText;
    }
}

// Edit peruntukan (edit all equipment in this peruntukan) - kept for add modal
function editPeruntukan(peruntukanId) {
    if (!selectedVendorId) return;

    // Get all items for this peruntukan
    const items = standardsList.filter(s => s.peruntukan_id === peruntukanId);
    if (items.length === 0) return;

    // Set form values
    document.getElementById('editMode').value = 'edit';
    document.getElementById('editPeruntukanId').value = peruntukanId;
    document.getElementById('vendorSelect').value = selectedVendorId;
    document.getElementById('vendorSelect').disabled = true;
    document.getElementById('peruntukanSelect').value = peruntukanId;
    document.getElementById('peruntukanSelect').disabled = true;

    // Clear and populate equipment rows
    const container = document.getElementById('equipmentListContainer');
    container.innerHTML = '';
    equipmentRowCounter = 0;

    items.forEach(item => {
        addEquipmentRowWithData(item.equipment_id, item.required_qty, item.contract_qty, item.id);
    });

    // Update modal title
    document.getElementById('standardModalLabel').textContent = 'Edit Peralatan Peruntukan';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('standardModal'));
    modal.show();
}

// Delete from detail modal
async function deleteFromDetail() {
    if (!currentViewData) return;

    // Close view modal first
    const viewModal = bootstrap.Modal.getInstance(document.getElementById('viewDetailModal'));
    if (viewModal) viewModal.hide();

    // Wait for modal to close
    setTimeout(async () => {
        await deletePeruntukan(currentViewData.peruntukanId);
    }, 300);
}

// Delete all equipment for a peruntukan
async function deletePeruntukan(peruntukanId) {
    if (!selectedVendorId) return;

    const items = standardsList.filter(s => s.peruntukan_id === peruntukanId);
    const peruntukan = items[0]?.peruntukan;
    const peruntukanName = peruntukan ? `${peruntukan.deskripsi}` : peruntukanId;

    const result = await Swal.fire({
        title: 'Hapus Peruntukan?',
        html: `Apakah Anda yakin ingin menghapus semua peralatan untuk peruntukan:<br><strong>${peruntukanName}</strong>?<br><br>Total ${items.length} item akan dihapus.`,
        icon: 'warning',
        showCancelButton: true,
        confirmButtonColor: '#d33',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Hapus Semua',
        cancelButtonText: 'Batal'
    });

    if (!result.isConfirmed) return;

    try {
        // Delete all items one by one
        let hasError = false;
        for (const item of items) {
            const deleteResult = await EquipmentStandardsAPI.delete(item.id);
            if (!deleteResult.success) {
                hasError = true;
            }
        }

        if (hasError) {
            showAlert('Beberapa item gagal dihapus', 'warning');
        } else {
            showAlert('Peruntukan berhasil dihapus', 'success');
        }

        // Reload data
        await loadStandardsByVendor(selectedVendorId);

    } catch (error) {
        console.error('Error deleting peruntukan:', error);
        showAlert('Terjadi kesalahan: ' + error.message, 'error');
    }
}

// Add equipment row to modal
function addEquipmentRow() {
    addEquipmentRowWithData('', 1, '', '');
}

// Add equipment row with data (table format matching edit mode)
function addEquipmentRowWithData(equipmentId, requiredQty, contractQty, standardId) {
    const container = document.getElementById('equipmentListContainer');
    equipmentRowCounter++;

    // Get kategori for selected equipment
    const selectedEquip = equipmentList.find(eq => eq.id === equipmentId);
    const kategori = selectedEquip?.kategori || '-';

    const row = document.createElement('tr');
    row.className = 'equipment-row';
    row.setAttribute('data-row-id', equipmentRowCounter);
    row.setAttribute('data-standard-id', standardId || '');
    row.innerHTML = `
        <td class="text-center">${equipmentRowCounter}</td>
        <td>
            <select class="form-select form-select-sm equipment-select" onchange="updateAddKategori(this)" required>
                <option value="">Pilih Peralatan</option>
                ${equipmentList.map(eq => `
                    <option value="${eq.id}" data-kategori="${eq.kategori || '-'}" ${eq.id === equipmentId ? 'selected' : ''}>
                        ${eq.nama_alat}
                    </option>
                `).join('')}
            </select>
        </td>
        <td class="kategori-cell"><span class="badge ${kategori === 'APD' ? 'bg-success' : 'bg-info'}">${kategori}</span></td>
        <td>
            <input type="number" class="form-control form-control-sm text-center required-qty" 
                   min="1" value="${requiredQty || 1}" required>
        </td>
        <td>
            <input type="number" class="form-control form-control-sm text-center contract-qty" 
                   min="0" value="${contractQty || ''}">
        </td>
        <td class="text-center">
            <button type="button" class="btn btn-outline-danger btn-sm" onclick="removeEquipmentRow(${equipmentRowCounter})" title="Hapus">
                <i class="bi bi-trash"></i>
            </button>
        </td>
    `;
    container.appendChild(row);
}

// Update kategori badge when equipment selection changes in Add modal
function updateAddKategori(selectEl) {
    const selectedOption = selectEl.options[selectEl.selectedIndex];
    const kategori = selectedOption.getAttribute('data-kategori') || '-';
    const kategoriCell = selectEl.closest('tr').querySelector('.kategori-cell');
    kategoriCell.innerHTML = `<span class="badge ${kategori === 'APD' ? 'bg-success' : 'bg-info'}">${kategori}</span>`;
}

// Remove equipment row
function removeEquipmentRow(rowId) {
    const row = document.querySelector(`.equipment-row[data-row-id="${rowId}"]`);
    if (row) {
        row.remove();
        // Re-number rows
        const rows = document.querySelectorAll('#equipmentListContainer tr.equipment-row');
        rows.forEach((r, idx) => {
            r.querySelector('td:first-child').textContent = idx + 1;
        });
    }
}

// Save all equipment for peruntukan
async function saveStandard() {
    const editMode = document.getElementById('editMode').value;
    const vendorId = document.getElementById('vendorSelect').value;
    const peruntukanId = document.getElementById('peruntukanSelect').value;

    if (!vendorId || !peruntukanId) {
        showAlert('Harap pilih vendor dan peruntukan', 'warning');
        return;
    }

    // Collect all equipment rows
    const rows = document.querySelectorAll('.equipment-row');
    if (rows.length === 0) {
        showAlert('Tambahkan minimal 1 peralatan', 'warning');
        return;
    }

    const equipmentData = [];
    let hasError = false;

    rows.forEach(row => {
        const equipmentId = row.querySelector('.equipment-select').value;
        const requiredQty = parseInt(row.querySelector('.required-qty').value) || 1;
        const contractQty = row.querySelector('.contract-qty').value
            ? parseInt(row.querySelector('.contract-qty').value)
            : null;
        const standardId = row.dataset.standardId || '';

        if (!equipmentId) {
            hasError = true;
            return;
        }

        equipmentData.push({
            id: standardId,
            equipment_id: equipmentId,
            required_qty: requiredQty,
            contract_qty: contractQty
        });
    });

    if (hasError) {
        showAlert('Harap pilih peralatan untuk semua baris', 'warning');
        return;
    }

    // Get vendor's unit_code
    const vendor = vendorsList.find(v => v.id === vendorId);
    const unitCode = vendor?.unit_code || currentProfile?.unit_code;

    // Disable save button
    const saveBtn = document.getElementById('btnSaveStandard');
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyimpan...';

    try {
        if (editMode === 'edit') {
            // Delete existing items for this peruntukan first
            const existingItems = standardsList.filter(s => s.peruntukan_id === peruntukanId);
            for (const item of existingItems) {
                await EquipmentStandardsAPI.delete(item.id);
            }
        }

        // Create all new items
        const createData = equipmentData.map(item => ({
            vendor_id: vendorId,
            unit_code: unitCode,
            peruntukan_id: peruntukanId,
            equipment_id: item.equipment_id,
            required_qty: item.required_qty,
            contract_qty: item.contract_qty
        }));

        const result = await EquipmentStandardsAPI.createBatch(createData);

        if (result.success) {
            // Close modal
            const modal = bootstrap.Modal.getInstance(document.getElementById('standardModal'));
            if (modal) modal.hide();

            showAlert('Data berhasil disimpan', 'success');

            // Reload data
            await loadStandardsByVendor(vendorId);

            // Set filter to this vendor
            document.getElementById('filterVendor').value = vendorId;
        } else {
            showAlert('Gagal menyimpan: ' + (result.error || 'Unknown error'), 'error');
        }

    } catch (error) {
        console.error('Error saving:', error);
        showAlert('Terjadi kesalahan: ' + error.message, 'error');
    } finally {
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<i class="bi bi-check-lg"></i> Simpan';
    }
}

// Reset modal form
function resetModalForm() {
    document.getElementById('standardForm').reset();
    document.getElementById('editMode').value = 'add';
    document.getElementById('editPeruntukanId').value = '';
    document.getElementById('vendorSelect').disabled = false;
    document.getElementById('peruntukanSelect').disabled = false;
    document.getElementById('equipmentListContainer').innerHTML = '';
    document.getElementById('standardModalLabel').innerHTML = '<i class="bi bi-plus-circle me-2"></i>Tambah Peralatan Peruntukan';
    equipmentRowCounter = 0;

    // Pre-select vendor if one is selected in filter
    if (selectedVendorId) {
        document.getElementById('vendorSelect').value = selectedVendorId;
    }

    // Populate Peruntukan dropdown for Add modal
    populateAddPeruntukanDropdown();
}

// Populate Peruntukan dropdown for Add modal (no jenis filter)
function populateAddPeruntukanDropdown() {
    const peruntukanSelect = document.getElementById('peruntukanSelect');
    if (!peruntukanSelect) return;

    peruntukanSelect.innerHTML = '<option value="">Pilih Peruntukan</option>' +
        peruntukanList.map(p => `<option value="${p.id}">${p.deskripsi}</option>`).join('');
}

// Kept for backward compatibility (now hidden)
function populateAddJenisDropdown() {
    populateAddPeruntukanDropdown();
}

// Kept for backward compatibility
function filterAddPeruntukanByJenis() {
    populateAddPeruntukanDropdown();
}

// Show/hide loading state
function showLoading(show) {
    const loadingState = document.getElementById('loadingState');
    const tableContainer = document.getElementById('tableContainer');
    const emptyState = document.getElementById('emptyState');

    if (show) {
        loadingState.style.display = 'block';
        tableContainer.style.display = 'none';
        emptyState.style.display = 'none';
    } else {
        loadingState.style.display = 'none';
    }
}

// Show alert
function showAlert(message, type) {
    Swal.fire({
        toast: true,
        position: 'top-end',
        icon: type === 'danger' ? 'error' : type,
        title: message,
        showConfirmButton: false,
        timer: 3000
    });
}

// Setup event listeners
function setupEventListeners() {
    // Filter change event
    document.getElementById('filterVendor')?.addEventListener('change', function () {
        loadStandardsByVendor(this.value);
    });

    // Reset filter button
    document.getElementById('resetFilterBtn')?.addEventListener('click', function () {
        document.getElementById('filterVendor').value = '';
        selectedVendorId = null;
        if (dataTable) { dataTable.destroy(); dataTable = null; }
        document.getElementById('emptyState').style.display = 'block';
        document.getElementById('tableContainer').style.display = 'none';
        document.getElementById('emptyState').innerHTML = `
            <i class="bi bi-inbox" style="font-size: 48px; color: #ccc;"></i>
            <p class="mt-2 text-muted">Pilih vendor untuk melihat data peralatan</p>
        `;
    });

    // Add equipment row button
    document.getElementById('addEquipmentRow')?.addEventListener('click', addEquipmentRow);

    // Save button
    document.getElementById('btnSaveStandard')?.addEventListener('click', saveStandard);

    // Edit from detail button
    document.getElementById('btnEditFromDetail')?.addEventListener('click', editFromDetail);

    // Delete from detail button
    document.getElementById('btnDeleteFromDetail')?.addEventListener('click', deleteFromDetail);

    // Modal hidden - reset form
    document.getElementById('standardModal')?.addEventListener('hidden.bs.modal', resetModalForm);

    // Modal shown - add first row if empty
    document.getElementById('standardModal')?.addEventListener('shown.bs.modal', function () {
        if (document.querySelectorAll('.equipment-row').length === 0) {
            addEquipmentRow();
        }
    });

    // Copy Standard Modal events
    setupCopyStandardEvents();

    // Logout button
    document.getElementById('logoutBtn')?.addEventListener('click', async (e) => {
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
            await logout();
            window.location.href = 'pages-login.html';
        }
    });
}

// ============================================================================
// COPY STANDARD FEATURE - Salin standar dari vendor lain
// ============================================================================

let copySourceData = []; // Grouped source data for copy

function setupCopyStandardEvents() {
    // Reset copy modal when hidden
    document.getElementById('copyStandardModal')?.addEventListener('hidden.bs.modal', resetCopyModal);

    // Populate source vendor dropdown when modal shown
    document.getElementById('copyStandardModal')?.addEventListener('show.bs.modal', function () {
        populateCopySourceVendor();
    });

    // Preview button
    document.getElementById('btnPreviewSource')?.addEventListener('click', previewSourceVendor);

    // Select all source checkbox
    document.getElementById('copySelectAll')?.addEventListener('change', function () {
        const checkboxes = document.querySelectorAll('#copyPreviewList input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = this.checked);
    });

    // Select all target checkbox
    document.getElementById('copyTargetSelectAll')?.addEventListener('change', function () {
        const checkboxes = document.querySelectorAll('#copyTargetList input[type="checkbox"]');
        checkboxes.forEach(cb => cb.checked = this.checked);
    });

    // Execute copy button
    document.getElementById('btnExecuteCopy')?.addEventListener('click', executeCopyStandard);
}

function populateCopySourceVendor() {
    const select = document.getElementById('copySourceVendor');
    if (!select) return;

    select.innerHTML = '<option value="">-- Pilih Vendor Sumber --</option>';
    vendorsList.forEach(vendor => {
        const option = document.createElement('option');
        option.value = vendor.id;
        option.textContent = `[${vendor.unit_code || '-'}] ${vendor.vendor_name}`;
        select.appendChild(option);
    });
}

async function previewSourceVendor() {
    const sourceVendorId = document.getElementById('copySourceVendor').value;
    if (!sourceVendorId) {
        showAlert('Pilih vendor sumber terlebih dahulu', 'warning');
        return;
    }

    const btn = document.getElementById('btnPreviewSource');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Memuat...';

    try {
        // Load standards for source vendor
        const data = await EquipmentStandardsAPI.getByVendor(sourceVendorId);
        if (!data || data.length === 0) {
            showAlert('Vendor ini belum memiliki data standar peralatan', 'warning');
            return;
        }

        // Group by peruntukan
        const grouped = {};
        data.forEach(item => {
            const pid = item.peruntukan_id;
            if (!grouped[pid]) {
                grouped[pid] = {
                    peruntukan: item.peruntukan,
                    peruntukan_id: pid,
                    items: []
                };
            }
            grouped[pid].items.push(item);
        });

        copySourceData = Object.values(grouped);
        const sourceVendor = vendorsList.find(v => v.id === sourceVendorId);

        // Update info
        document.getElementById('copySourceInfo').textContent = sourceVendor?.vendor_name || '-';
        document.getElementById('copySourceTotal').textContent = copySourceData.length;

        // Build preview table
        const previewList = document.getElementById('copyPreviewList');
        previewList.innerHTML = copySourceData.map((group, idx) => {
            const apdCount = group.items.filter(i => i.equipment_master?.kategori === 'APD').length;
            const peralatanCount = group.items.filter(i => i.equipment_master?.kategori === 'Peralatan').length;
            return `
                <tr>
                    <td class="text-center">
                        <input type="checkbox" class="copy-peruntukan-cb" data-index="${idx}" checked>
                    </td>
                    <td>${group.peruntukan?.deskripsi || '-'}</td>
                    <td class="text-center">${group.items.length}</td>
                    <td class="text-center"><span class="badge bg-success">${apdCount}</span></td>
                    <td class="text-center"><span class="badge bg-info">${peralatanCount}</span></td>
                </tr>
            `;
        }).join('');

        // Show preview and step 2
        document.getElementById('copyPreviewContainer').style.display = 'block';
        document.getElementById('copySeparator').style.display = 'block';
        document.getElementById('copyStep2').style.display = 'block';
        document.getElementById('btnExecuteCopy').style.display = 'inline-block';

        // Populate target vendor list (exclude source vendor)
        populateCopyTargetVendors(sourceVendorId);

    } catch (error) {
        console.error('Error previewing source vendor:', error);
        showAlert('Gagal memuat data vendor sumber', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-eye me-1"></i>Preview Standar';
    }
}

function populateCopyTargetVendors(sourceVendorId) {
    const targetList = document.getElementById('copyTargetList');
    if (!targetList) return;

    // Include all vendors (termasuk vendor sumber, untuk salin peruntukan berbeda)
    targetList.innerHTML = vendorsList.map(vendor => {
        const isSame = vendor.id === sourceVendorId;
        return `
        <tr>
            <td width="40">
                <input type="checkbox" class="copy-target-cb" value="${vendor.id}" data-unit-code="${vendor.unit_code || ''}">
            </td>
            <td>
                <span class="badge bg-secondary me-1">${vendor.unit_code || '-'}</span>
                ${vendor.vendor_name}
                ${isSame ? '<span class="badge bg-warning text-dark ms-1">Sumber</span>' : ''}
            </td>
        </tr>
    `;
    }).join('');
}

async function executeCopyStandard() {
    // Get selected source peruntukan
    const selectedPeruntukan = [];
    document.querySelectorAll('#copyPreviewList input.copy-peruntukan-cb:checked').forEach(cb => {
        const idx = parseInt(cb.dataset.index);
        selectedPeruntukan.push(copySourceData[idx]);
    });

    if (selectedPeruntukan.length === 0) {
        showAlert('Pilih minimal 1 peruntukan untuk disalin', 'warning');
        return;
    }

    // Get selected target vendors
    const targetVendorIds = [];
    const targetVendorUnits = {};
    document.querySelectorAll('#copyTargetList input.copy-target-cb:checked').forEach(cb => {
        targetVendorIds.push(cb.value);
        targetVendorUnits[cb.value] = cb.dataset.unitCode || '';
    });

    if (targetVendorIds.length === 0) {
        showAlert('Pilih minimal 1 vendor tujuan', 'warning');
        return;
    }

    // Confirm
    const totalOps = selectedPeruntukan.length * targetVendorIds.length;
    const confirm = await Swal.fire({
        title: 'Konfirmasi Salin Standar',
        html: `Salin <strong>${selectedPeruntukan.length}</strong> peruntukan ke <strong>${targetVendorIds.length}</strong> vendor?<br>
               <small class="text-muted">(Total ${totalOps} operasi, peruntukan yang sudah ada akan dilewati)</small>`,
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#198754',
        cancelButtonColor: '#6c757d',
        confirmButtonText: 'Ya, Salin',
        cancelButtonText: 'Batal'
    });

    if (!confirm.isConfirmed) return;

    const btn = document.getElementById('btnExecuteCopy');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyalin...';

    let successCount = 0;
    let skippedCount = 0;
    let errorCount = 0;

    try {
        for (const targetVendorId of targetVendorIds) {
            // Get existing standards for this target vendor to check duplicates
            const existingData = await EquipmentStandardsAPI.getByVendor(targetVendorId);
            const existingPeruntukanIds = new Set((existingData || []).map(d => d.peruntukan_id));
            const targetUnitCode = targetVendorUnits[targetVendorId] ||
                vendorsList.find(v => v.id === targetVendorId)?.unit_code || '';

            for (const group of selectedPeruntukan) {
                // Skip if this peruntukan already exists for target vendor
                if (existingPeruntukanIds.has(group.peruntukan_id)) {
                    skippedCount++;
                    continue;
                }

                // Build batch insert data
                const batchData = group.items.map(item => ({
                    vendor_id: targetVendorId,
                    unit_code: targetUnitCode,
                    peruntukan_id: group.peruntukan_id,
                    equipment_id: item.equipment_id,
                    required_qty: item.required_qty || 1,
                    contract_qty: item.contract_qty || null
                }));

                const result = await EquipmentStandardsAPI.createBatch(batchData);
                if (result.success) {
                    successCount++;
                } else {
                    errorCount++;
                    console.error(`Failed to copy peruntukan ${group.peruntukan_id} to vendor ${targetVendorId}:`, result.error);
                }
            }
        }

        // Show results
        let message = `<strong>${successCount}</strong> peruntukan berhasil disalin`;
        if (skippedCount > 0) message += `<br><strong>${skippedCount}</strong> dilewati (sudah ada)`;
        if (errorCount > 0) message += `<br><strong>${errorCount}</strong> gagal`;

        await Swal.fire({
            title: 'Selesai',
            html: message,
            icon: errorCount > 0 ? 'warning' : 'success'
        });

        // Close modal
        const modal = bootstrap.Modal.getInstance(document.getElementById('copyStandardModal'));
        if (modal) modal.hide();

        // Reload current view
        if (selectedVendorId) {
            await loadStandardsByVendor(selectedVendorId);
        }

    } catch (error) {
        console.error('Error executing copy:', error);
        showAlert('Terjadi kesalahan: ' + error.message, 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-clipboard-check me-1"></i>Salin Standar';
    }
}

function resetCopyModal() {
    copySourceData = [];
    document.getElementById('copySourceVendor').value = '';
    document.getElementById('copyPreviewContainer').style.display = 'none';
    document.getElementById('copyPreviewList').innerHTML = '';
    document.getElementById('copySeparator').style.display = 'none';
    document.getElementById('copyStep2').style.display = 'none';
    document.getElementById('copyTargetList').innerHTML = '';
    document.getElementById('btnExecuteCopy').style.display = 'none';
    document.getElementById('copyTargetSelectAll').checked = false;
    document.getElementById('copySelectAll').checked = true;
}
