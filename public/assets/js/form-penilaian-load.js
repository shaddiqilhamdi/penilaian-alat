// form-penilaian-load.js
// Module untuk loading data dan populate dropdowns

// Global variables
let currentUser = null;
let currentProfile = null;
window.currentProfile = null; // Also expose to window for cross-module access

// Role labels for display
const ROLE_LABELS = {
    uid_admin: 'UID Admin',
    uid_user: 'UID User',
    up3_admin: 'UP3 Admin',
    up3_user: 'UP3 User',
    vendor_k3: 'Vendor K3'
};

// Validate nomor polisi format
// Format: B 1234 XYZ or BB 1234 XYZ (1-2 letters, 1-4 digits, 1-3 letters)
function validateNomorPolisiFormat(nopol) {
    if (!nopol) return false;
    // Remove extra spaces and convert to uppercase
    const cleaned = nopol.toUpperCase().replace(/\s+/g, ' ').trim();
    // Pattern: 1-2 letters, space optional, 1-4 digits, space optional, 1-3 letters
    const pattern = /^[A-Z]{1,2}\s?\d{1,4}\s?[A-Z]{1,3}$/;
    return pattern.test(cleaned);
}

// Format nomor polisi to standard format (with spaces)
function formatNomorPolisiStandard(nopol) {
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

document.addEventListener('DOMContentLoaded', async function () {


    // Wait for Supabase and APIs to be available
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries) {
        if (typeof getSupabaseClient !== 'undefined' &&
            typeof UnitsAPI !== 'undefined' &&
            typeof VendorsAPI !== 'undefined' &&
            typeof PeruntukanAPI !== 'undefined') {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 500)); // Wait 500ms
        retryCount++;
    }

    if (retryCount >= maxRetries) {
        console.error('APIs not available after maximum retries');
        showNotification('Gagal memuat konfigurasi sistem. Silakan refresh halaman.', 'error');
        return;
    }

    try {
        // Check authentication first
        currentUser = await getCurrentUser();
        if (!currentUser) {
            window.location.href = 'pages-login.html';
            return;
        }

        // Load profile
        const profileResult = await ProfilesAPI.getById(currentUser.id);
        if (profileResult.success && profileResult.data) {
            currentProfile = profileResult.data;
            window.currentProfile = currentProfile; // Expose to window for cross-module access
            // Save role to localStorage for CSS-based menu visibility
            if (typeof saveUserRoleToStorage === 'function') {
                saveUserRoleToStorage(currentProfile);
            }
            updateNavbarProfile();
        }

        await initializeFormData();
        setupEventListeners();

    } catch (error) {
        console.error('Form Penilaian Load: Initialization error', error);
        showNotification('Gagal memuat data form', 'error');
    }
});

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

// Initialize form data
async function initializeFormData() {
    // Set tanggal ke hari ini dengan max = hari ini
    const today = new Date().toISOString().split('T')[0];
    const tanggalInput = document.getElementById('modalTanggal');
    tanggalInput.value = today;
    tanggalInput.max = today; // Kunci maksimal tanggal hari ini

    // Load dropdown data
    await loadUnitData();
    await loadVendorData();
}

// Load Unit data
async function loadUnitData() {
    try {
        if (typeof UnitsAPI === 'undefined') {
            throw new Error('UnitsAPI is not available');
        }

        const result = await UnitsAPI.getAll();
        const unitSelect = document.getElementById('modalUnit');

        if (!unitSelect) {
            console.error('Unit select element not found');
            return;
        }

        if (!result.success) {
            console.error('Failed to load units:', result.error);
            return;
        }

        const units = result.data || [];

        // Clear existing options except first
        unitSelect.innerHTML = '<option value="">No item selected</option>';

        // Filter units based on user role
        let filteredUnits = units;
        if (!isUIDUser() && currentProfile?.unit_code) {
            filteredUnits = units.filter(u => u.unit_code === currentProfile.unit_code);
        }

        filteredUnits.forEach(unit => {
            const option = document.createElement('option');
            option.value = unit.unit_code;
            option.textContent = unit.unit_name;
            unitSelect.appendChild(option);
        });

        // Auto-select for non-UID users (up3_admin, up3_user, vendor_k3)
        if (!isUIDUser() && currentProfile?.unit_code) {
            unitSelect.value = currentProfile.unit_code;
            unitSelect.disabled = true; // Lock the unit dropdown

            // Trigger vendor filter based on user's unit
            filterVendorsByUnit(currentProfile.unit_code);
        } else if (filteredUnits.length === 1) {
            unitSelect.value = filteredUnits[0].unit_code;
        }

    } catch (error) {
        console.error('Error loading unit data:', error);
        showNotification('Gagal memuat data unit', 'error');
    }
}

// Store all vendors for filtering
let allVendors = [];

// Check if user is vendor-locked role (vendor_k3 or petugas)
function isVendorLockedUser() {
    const role = currentProfile?.role || '';
    return role === 'vendor_k3' || role === 'petugas';
}

// Load Vendor data
async function loadVendorData() {
    try {
        if (typeof VendorsAPI === 'undefined') {
            throw new Error('VendorsAPI is not available');
        }

        const result = await VendorsAPI.getAll();
        const vendorSelect = document.getElementById('modalVendor');

        if (!vendorSelect) {
            console.error('Vendor select element not found');
            return;
        }

        if (!result.success) {
            console.error('Failed to load vendors:', result.error);
            return;
        }

        allVendors = result.data || [];

        // Clear existing options except first
        vendorSelect.innerHTML = '<option value="">No item selected</option>';

        // For vendor_k3 and petugas: lock to their assigned vendor_id
        if (isVendorLockedUser() && currentProfile?.vendor_id) {
            const userVendor = allVendors.find(v => v.id === currentProfile.vendor_id);
            if (userVendor) {
                const option = document.createElement('option');
                option.value = userVendor.id;
                option.textContent = `${userVendor.vendor_name} (${userVendor.unit_code || '-'})`;
                vendorSelect.appendChild(option);
                vendorSelect.value = userVendor.id;
                vendorSelect.disabled = true; // Lock the vendor dropdown

                // Trigger personil and peruntukan load for this vendor
                loadPersonilData(userVendor.id);
                loadPeruntukanData(userVendor.id);
                return;
            }
        }

        // Filter vendors based on user role (for non-UID users, filter by unit)
        let filteredVendors = allVendors;
        if (!isUIDUser() && currentProfile?.unit_code) {
            filteredVendors = allVendors.filter(v => v.unit_code === currentProfile.unit_code);
        }

        filteredVendors.forEach(vendor => {
            const option = document.createElement('option');
            option.value = vendor.id;
            option.textContent = `${vendor.vendor_name} (${vendor.unit_code || '-'})`;
            vendorSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading vendor data:', error);
        showNotification('Gagal memuat data vendor', 'error');
    }
}

// Filter vendors by unit code
function filterVendorsByUnit(unitCode) {
    const vendorSelect = document.getElementById('modalVendor');
    if (!vendorSelect) return;

    vendorSelect.innerHTML = '<option value="">No item selected</option>';

    const filteredVendors = allVendors.filter(v => v.unit_code === unitCode);

    filteredVendors.forEach(vendor => {
        const option = document.createElement('option');
        option.value = vendor.id;
        option.textContent = `${vendor.vendor_name} (${vendor.unit_code || '-'})`;
        vendorSelect.appendChild(option);
    });

}

// Load Peruntukan based on selected Vendor (filtered by equipment_standards)
// Jenis filter removed - show all peruntukan that have equipment_standards for this vendor
async function loadPeruntukanData(vendorId) {
    try {
        const peruntukanSelect = document.getElementById('modalPeruntukan');

        if (!peruntukanSelect) {
            console.error('Peruntukan select element not found');
            return;
        }

        let peruntukanData = [];

        // Get all peruntukan from equipment_standards for this vendor (no jenis filter)
        if (vendorId && typeof EquipmentStandardsAPI !== 'undefined') {
            const result = await EquipmentStandardsAPI.getDistinctPeruntukanByVendor(vendorId);
            if (result.success) {
                peruntukanData = result.data || [];
            }
        } else {
            // Fallback to all peruntukan (legacy behavior)
            if (typeof PeruntukanAPI === 'undefined') {
                throw new Error('PeruntukanAPI is not available');
            }
            const result = await PeruntukanAPI.getAll();
            if (result.success) {
                peruntukanData = result.data || [];
            }
        }

        // Clear existing options except first
        peruntukanSelect.innerHTML = '<option value="">-- Pilih Peruntukan --</option>';

        if (peruntukanData.length === 0) {
            // Show message if no peruntukan available for this vendor
            const option = document.createElement('option');
            option.value = '';
            option.textContent = '(Tidak ada data standar untuk vendor ini)';
            option.disabled = true;
            peruntukanSelect.appendChild(option);
            return;
        }

        peruntukanData.forEach(peruntukan => {
            const option = document.createElement('option');
            option.value = peruntukan.id;
            option.textContent = peruntukan.deskripsi;
            peruntukanSelect.appendChild(option);
        });

    } catch (error) {
        console.error('Error loading peruntukan data:', error);
        showNotification('Gagal memuat data peruntukan', 'error');
    }
}

// Load Equipment data based on selected Vendor and Peruntukan
// STRICT LOGIC - Hanya ambil dari equipment_standards
// Jika tidak ada data, TIDAK tampilkan alat - paksa admin untuk mapping terlebih dahulu
async function loadEquipmentData(vendorId, peruntukanId) {
    try {
        if (!vendorId || !peruntukanId) {
            clearEquipmentTable();
            return;
        }

        let equipmentData = [];
        let vendorAssetsMap = new Map(); // Map equipment_id -> vendor_asset data

        // Step 1: Get vendor_assets data untuk referensi (realisasi sebelumnya)
        // Filtered by vendor_id AND peruntukan_id for accurate tracking
        if (typeof VendorAssetsAPI !== 'undefined') {
            const vendorAssetsResult = await VendorAssetsAPI.getByVendorAndPeruntukan(vendorId, peruntukanId);
            if (vendorAssetsResult.success && vendorAssetsResult.data) {
                vendorAssetsResult.data.forEach(asset => {
                    vendorAssetsMap.set(asset.equipment_id, asset);
                });
            }
        }

        // Step 2: Get equipment_standards sebagai SATU-SATUNYA SUMBER
        // TIDAK ADA FALLBACK - Jika tidak ada data, tampilkan pesan error
        if (typeof EquipmentStandardsAPI !== 'undefined') {
            const standardsResult = await EquipmentStandardsAPI.getByVendorAndPeruntukan(vendorId, peruntukanId);

            if (standardsResult && standardsResult.length > 0) {
                equipmentData = standardsResult.map(standard => {
                    const equipmentId = standard.equipment_id || standard.equipment_master?.id;
                    const vendorAsset = vendorAssetsMap.get(equipmentId);

                    return {
                        ...standard,
                        // Merge dengan vendor_asset jika ada (untuk data historis)
                        vendor_asset_id: vendorAsset?.id || null,
                        last_realisasi: vendorAsset?.realisasi_qty || 0,
                        last_assessment_date: vendorAsset?.last_assessment_date || null,
                        source: 'equipment_standards'
                    };
                });
            }
        }

        // STRICT: Jika tidak ada equipment_standards, tampilkan pesan error - TIDAK ADA FALLBACK
        if (!equipmentData || equipmentData.length === 0) {
            showNoEquipmentStandardsMessage(vendorId, peruntukanId);
            return;
        }

        // Store source info globally for submit logic
        window.equipmentDataSource = 'equipment_standards';
        window.currentEquipmentData = equipmentData;
        window.vendorAssetsMap = vendorAssetsMap;

        renderEquipmentTable(equipmentData, false);

    } catch (error) {
        console.error('Error loading equipment data:', error);
        showNotification('Gagal memuat data peralatan', 'error');
    }
}

// Show message when no equipment_standards found - force admin to setup
function showNoEquipmentStandardsMessage(vendorId, peruntukanId) {
    const tableBody = document.getElementById('equipmentTableBody');
    const countBadge = document.getElementById('equipmentCountBadge');
    const accordion = document.getElementById('equipmentAccordion');

    // Get vendor and peruntukan names for display
    const vendorSelect = document.getElementById('modalVendor');
    const peruntukanSelect = document.getElementById('modalPeruntukan');
    const vendorName = vendorSelect?.options[vendorSelect.selectedIndex]?.text || 'Vendor';
    const peruntukanName = peruntukanSelect?.options[peruntukanSelect.selectedIndex]?.text || 'Peruntukan';

    const messageHtml = `
        <i class="bi bi-exclamation-triangle-fill fs-1 text-warning d-block mb-3"></i>
        <h5 class="text-danger mb-2">Data Standar Peralatan Belum Tersedia</h5>
        <div class="text-muted mb-3">
            <p class="mb-1">
                Belum ada data <strong>Equipment Standards</strong> untuk kombinasi:
            </p>
            <p class="mb-0">
                <span class="badge bg-secondary me-1">${vendorName}</span>
                <span class="badge bg-secondary">${peruntukanName}</span>
            </p>
        </div>
        <div class="alert alert-warning d-inline-block text-start" style="max-width: 500px;">
            <strong><i class="bi bi-info-circle me-1"></i>Langkah yang diperlukan:</strong>
            <ol class="mb-0 mt-2 small">
                <li>Buka menu <strong>Data Master → Peralatan</strong></li>
                <li>Tambahkan daftar standar peralatan untuk vendor dan peruntukan ini</li>
                <li>Tentukan jumlah standar (qty kontrak) untuk setiap alat</li>
                <li>Kembali ke halaman ini dan lakukan penilaian</li>
            </ol>
        </div>
        <div class="mt-3">
            <a href="data-peralatan.html" class="btn btn-primary btn-sm">
                <i class="bi bi-gear me-1"></i>Setup Data Standar Peralatan
            </a>
        </div>
    `;

    tableBody.innerHTML = `
        <tr>
            <td colspan="10" class="text-center py-5">
                ${messageHtml}
            </td>
        </tr>
    `;

    // Also update accordion for mobile
    if (accordion) {
        accordion.innerHTML = `
            <div class="text-center py-4 px-3">
                ${messageHtml}
            </div>
        `;
    }

    if (countBadge) countBadge.textContent = '0 Item';

    // Reset progress and disable submit
    if (typeof FormPenilaianManager !== 'undefined') {
        FormPenilaianManager.updateProgress();
        FormPenilaianManager.calculateTotalScore();
    }
}

// Load Kendaraan (Teams) based on selected Vendor and Peruntukan
// Now supports single select with modal for adding new
async function loadKendaraanData(vendorId, peruntukanId = null) {
    try {
        if (typeof TeamsAPI === 'undefined') {
            console.warn('TeamsAPI is not available, skipping kendaraan load');
            return;
        }

        const nopolSelect = document.getElementById('modalNopolSelect');
        const teamIdInput = document.getElementById('modalTeamId');

        if (!nopolSelect) {
            console.error('Nopol select element not found');
            return;
        }

        let kendaraanData = [];

        // If peruntukan is selected, filter by vendor AND peruntukan
        if (peruntukanId) {
            const result = await TeamsAPI.getByVendorAndPeruntukan(vendorId, peruntukanId);
            if (result.success && result.data) {
                kendaraanData = result.data;
            }
        } else {
            const data = await TeamsAPI.getByVendor(vendorId);
            kendaraanData = data || [];
        }

        // Reset dropdown
        nopolSelect.innerHTML = '<option value="">-- Pilih Kendaraan --</option>';

        // Populate dropdown with existing teams
        kendaraanData.forEach(kendaraan => {
            const option = document.createElement('option');
            option.value = kendaraan.id;
            option.textContent = `${kendaraan.nomor_polisi}${kendaraan.category ? ' - ' + kendaraan.category : ''}`;
            option.dataset.nopol = kendaraan.nomor_polisi;
            option.dataset.category = kendaraan.category || '';
            nopolSelect.appendChild(option);
        });

        // Reset state
        if (teamIdInput) teamIdInput.value = '';

        // Setup event listener for dropdown change
        nopolSelect.onchange = function () {
            if (this.value) {
                if (teamIdInput) teamIdInput.value = this.value;
            } else {
                if (teamIdInput) teamIdInput.value = '';
            }
        };

    } catch (error) {
        console.error('Error loading kendaraan data:', error);
        showNotification('Gagal memuat data kendaraan', 'error');
    }
}

// Load Personil based on selected Vendor
// Single select dropdown with badge system for multiple selection
// Set preserveSelection=true to keep existing selections (e.g., after adding new petugas)
async function loadPersonilData(vendorId, preserveSelection = false) {
    try {
        if (typeof PersonnelAPI === 'undefined') {
            console.warn('PersonnelAPI is not available, skipping personil load');
            return;
        }

        const result = await PersonnelAPI.getByVendor(vendorId);

        const petugasSelect = document.getElementById('modalPetugasSelect');
        const personnelIdInput = document.getElementById('modalPersonnelId');
        const selectedPetugasContainer = document.getElementById('selectedPetugasContainer');

        if (!petugasSelect) {
            console.error('Petugas select element not found');
            return;
        }

        const personilData = result.success ? (result.data || []) : [];

        // Reset dropdown (single select with placeholder)
        petugasSelect.innerHTML = '<option value="">-- Pilih Petugas --</option>';

        // Populate dropdown with existing personnel
        personilData.forEach(personil => {
            const option = document.createElement('option');
            option.value = personil.id;
            option.textContent = personil.nama_personil;
            option.dataset.nama = personil.nama_personil;
            option.dataset.nik = personil.nik || '';
            petugasSelect.appendChild(option);
        });

        // Reset state
        if (personnelIdInput) personnelIdInput.value = '';
        if (selectedPetugasContainer) selectedPetugasContainer.innerHTML = '';

        // Initialize or preserve selected personnel arrays
        if (!preserveSelection) {
            // Clear previous selections when vendor changes
            window.selectedPetugasIds = [];
            window.selectedPetugasNames = {};
            window.newPetugasList = [];
        } else {
            // Preserve existing selections
            window.selectedPetugasIds = window.selectedPetugasIds || [];
            window.selectedPetugasNames = window.selectedPetugasNames || {};
            window.newPetugasList = window.newPetugasList || [];
        }

        // Setup event listener for single select - add to badge on select
        petugasSelect.onchange = function () {
            const selectedValue = this.value;
            const selectedText = this.options[this.selectedIndex]?.text;

            if (selectedValue && !window.selectedPetugasIds.includes(selectedValue)) {
                // Add to selected list
                window.selectedPetugasIds.push(selectedValue);
                window.selectedPetugasNames[selectedValue] = selectedText;
                updateSelectedPetugasDisplay();
            }

            // Reset dropdown to placeholder
            this.value = '';
        };

        // Update display
        updateSelectedPetugasDisplay();

    } catch (error) {
        console.error('Error loading personil data:', error);
        showNotification('Gagal memuat data personil', 'error');
    }
}

// Update selected petugas display with badges
function updateSelectedPetugasDisplay() {
    const selectedPetugasContainer = document.getElementById('selectedPetugasContainer');
    const personnelIdInput = document.getElementById('modalPersonnelId');

    if (!selectedPetugasContainer) return;

    selectedPetugasContainer.innerHTML = '';

    // Add badges for selected petugas from dropdown
    (window.selectedPetugasIds || []).forEach(id => {
        const name = window.selectedPetugasNames[id] || 'Unknown';
        const badge = createPetugasBadge(name, id, false);
        selectedPetugasContainer.appendChild(badge);
    });

    // Add new petugas badges (manually added)
    (window.newPetugasList || []).forEach((petugas, index) => {
        const badge = createPetugasBadge(petugas.name, `new_${index}`, true, petugas.id);
        selectedPetugasContainer.appendChild(badge);
    });

    // Store selected IDs in hidden input
    const allIds = [
        ...(window.selectedPetugasIds || []),
        ...(window.newPetugasList || []).filter(p => p.id).map(p => p.id)
    ];
    if (personnelIdInput) {
        personnelIdInput.value = allIds.join(',');
    }
}

// Create petugas badge element
function createPetugasBadge(name, id, isNew, realId = null) {
    const badge = document.createElement('span');
    badge.className = `badge ${isNew ? 'bg-success' : 'bg-primary'} me-1 mb-1 d-inline-flex align-items-center`;
    badge.style.fontSize = '0.85rem';
    badge.innerHTML = `
        ${isNew ? '<i class="bi bi-person-plus me-1"></i>' : '<i class="bi bi-person me-1"></i>'}
        ${name}
        <button type="button" class="btn-close btn-close-white ms-2" style="font-size: 0.5rem;" 
                onclick="removePetugas('${id}', ${isNew})"></button>
    `;
    if (realId) badge.dataset.realId = realId;
    return badge;
}

// Remove petugas from selection
function removePetugas(id, isNew) {
    if (isNew) {
        // Remove from new list
        const index = parseInt(id.replace('new_', ''));
        if (window.newPetugasList && window.newPetugasList[index] !== undefined) {
            window.newPetugasList.splice(index, 1);
        }
    } else {
        // Remove from selected list
        const idx = window.selectedPetugasIds.indexOf(id);
        if (idx > -1) {
            window.selectedPetugasIds.splice(idx, 1);
            delete window.selectedPetugasNames[id];
        }
    }

    updateSelectedPetugasDisplay();
}

// Helper function to render equipment table from equipment_standards data
function renderEquipmentTableFromFilter(equipmentData) {
    const tableBody = document.querySelector('#evaluationTable tbody');

    if (!tableBody) {
        console.error('Equipment table body not found');
        return;
    }

    // Clear existing rows
    clearEquipmentTableFromFilter();

    if (!equipmentData || equipmentData.length === 0) {
        const emptyRow = `
            <tr>
                <td colspan="8" class="text-center text-muted">
                    Tidak ada peralatan ditemukan untuk kombinasi vendor dan peruntukan yang dipilih
                </td>
            </tr>
        `;
        tableBody.innerHTML = emptyRow;
        return;
    }

    // Sort by kategori first, then by nama_alat
    const sortedData = [...equipmentData].sort((a, b) => {
        const equipA = a.equipment_master || {};
        const equipB = b.equipment_master || {};

        const kategoriA = (equipA.kategori || '').toLowerCase();
        const kategoriB = (equipB.kategori || '').toLowerCase();
        if (kategoriA < kategoriB) return -1;
        if (kategoriA > kategoriB) return 1;

        const namaA = (equipA.nama_alat || '').toLowerCase();
        const namaB = (equipB.nama_alat || '').toLowerCase();
        if (namaA < namaB) return -1;
        if (namaA > namaB) return 1;

        return 0;
    });

    sortedData.forEach((standard, index) => {
        // Get equipment info from nested equipment_master relation
        const equipment = standard.equipment_master || {};
        const row = `
            <tr>
                <td>${index + 1}</td>
                <td>
                    <div class="equipment-info">
                        <strong>${equipment.nama_alat || 'N/A'}</strong>
                        <small class="d-block text-muted">${equipment.kategori || ''} - ${equipment.sub_kategori1 || ''}</small>
                    </div>
                </td>
                <td>
                    <select class="form-control form-control-sm kondisi-select" 
                            data-equipment-id="${equipment.id || standard.equipment_id}" 
                            data-standard-id="${standard.id}"
                            data-equipment-name="${equipment.nama_alat}" 
                            required>
                        <option value="">Pilih</option>
                        <option value="sangat-baik">Sangat Baik</option>
                        <option value="baik">Baik</option>
                        <option value="cukup">Cukup</option>
                        <option value="kurang">Kurang</option>
                        <option value="buruk">Buruk</option>
                    </select>
                </td>
                <td>
                    <input type="number" 
                           class="form-control form-control-sm quantity-input" 
                           data-equipment-id="${equipment.id || standard.equipment_id}"
                           data-standard-qty="${standard.quantity_required || 0}"
                           min="0" 
                           value="0"
                           placeholder="Qty">
                    <small class="text-muted">Standar: ${standard.quantity_required || 0}</small>
                </td>
                <td>
                    <input type="text" 
                           class="form-control form-control-sm notes-input" 
                           data-equipment-id="${equipment.id || standard.equipment_id}"
                           placeholder="Catatan (opsional)">
                </td>
                <td class="text-center">
                    <span class="score-display" data-equipment-id="${equipment.id || standard.equipment_id}">0</span>
                </td>
                <td class="text-center">
                    <input type="file" 
                           class="form-control-file evidence-upload" 
                           data-equipment-id="${equipment.id || standard.equipment_id}"
                           accept="image/*,.pdf"
                           multiple>
                </td>
                <td class="text-center">
                    <div class="btn-group" role="group">
                        <button type="button" 
                                class="btn btn-sm btn-outline-info view-equipment-btn"
                                data-equipment-id="${equipment.id || standard.equipment_id}"
                                title="Lihat Detail">
                            <i class="bi bi-eye"></i>
                        </button>
                        <button type="button" 
                                class="btn btn-sm btn-outline-warning edit-assessment-btn"
                                data-equipment-id="${equipment.id || standard.equipment_id}"
                                title="Edit Penilaian">
                            <i class="bi bi-pencil"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });

    // Reinitialize event listeners for the new table content
    initializeTableEventListeners();
}

// Helper function to clear equipment table
function clearEquipmentTableFromFilter() {
    const tableBody = document.querySelector('#evaluationTable tbody');
    if (tableBody) {
        tableBody.innerHTML = '';
    }
}

// Initialize event listeners for table elements
function initializeTableEventListeners() {
    // Add event listeners for kondisi select changes
    document.querySelectorAll('.kondisi-select').forEach(select => {
        select.addEventListener('change', function () {
            calculateEquipmentScore(this);
            updateOverallProgress();
        });
    });

    // Add event listeners for quantity input changes
    document.querySelectorAll('.quantity-input').forEach(input => {
        input.addEventListener('input', function () {
            calculateEquipmentScore(this);
            updateOverallProgress();
        });
    });

    // Add event listeners for notes input
    document.querySelectorAll('.notes-input').forEach(input => {
        input.addEventListener('input', function () {
            // Optional: Could trigger auto-save functionality here

        });
    });

    // Add event listeners for file uploads
    document.querySelectorAll('.evidence-upload').forEach(input => {
        input.addEventListener('change', function () {
            handleEvidenceUpload(this);
        });
    });

    // Add event listeners for action buttons
    document.querySelectorAll('.view-equipment-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            viewEquipmentDetails(this.dataset.equipmentId);
        });
    });

    document.querySelectorAll('.edit-assessment-btn').forEach(btn => {
        btn.addEventListener('click', function () {
            editEquipmentAssessment(this.dataset.equipmentId);
        });
    });
}// Render equipment table - handles data from vendor_assets or equipment_standards
function renderEquipmentTable(equipmentData, isFromVendorAssets = false) {
    // Get the equipment table body
    const tableBody = document.getElementById('equipmentTableBody');
    const countBadge = document.getElementById('equipmentCountBadge');

    if (!tableBody) {
        console.error('Equipment table body not found');
        return;
    }

    if (!equipmentData || equipmentData.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="10" class="text-center py-5">
                    <i class="bi bi-exclamation-triangle fs-1 text-warning d-block mb-2"></i>
                    <strong class="text-muted">Tidak ada data peralatan standar</strong>
                    <p class="text-muted small mb-0 mt-2">
                        Belum ada standar peralatan untuk kombinasi Vendor dan Peruntukan ini.<br>
                        Hubungi Admin untuk menambahkan data equipment_standards.
                    </p>
                </td>
            </tr>
        `;
        if (countBadge) countBadge.textContent = '0 Item';
        return;
    }

    // Sort equipment by kategori first, then by nama_alat
    const sortedData = [...equipmentData].sort((a, b) => {
        // Get equipment info for each item
        const infoA = a.equipment_master || a;
        const infoB = b.equipment_master || b;

        // First sort by kategori
        const kategoriA = (infoA.kategori || a.kategori || '').toLowerCase();
        const kategoriB = (infoB.kategori || b.kategori || '').toLowerCase();
        if (kategoriA < kategoriB) return -1;
        if (kategoriA > kategoriB) return 1;

        // Then sort by nama_alat
        const namaA = (infoA.nama_alat || a.nama_alat || '').toLowerCase();
        const namaB = (infoB.nama_alat || b.nama_alat || '').toLowerCase();
        if (namaA < namaB) return -1;
        if (namaA > namaB) return 1;

        return 0;
    });

    tableBody.innerHTML = '';
    if (countBadge) countBadge.textContent = `${sortedData.length} Item`;

    sortedData.forEach((item, index) => {
        // Get equipment info - structure differs based on source
        let equipmentInfo, equipmentId, requiredQty, currentQty;
        const dataSource = item.source || (isFromVendorAssets ? 'vendor_assets' : 'equipment_standards');

        if (isFromVendorAssets) {
            // From vendor_assets - equipment_master is nested relation
            equipmentInfo = item.equipment_master || {};
            equipmentId = item.equipment_id || equipmentInfo.id;
            requiredQty = item.required_qty || 1;
            currentQty = item.realisasi_qty || 0;
        } else if (dataSource === 'equipment_master') {
            // Direct from equipment_master (fallback) - show warning qty
            equipmentInfo = item.equipment_master || item;
            equipmentId = item.equipment_id || item.id;
            requiredQty = item.qty_standar || 1; // Default, needs review
            currentQty = 0;
        } else {
            // From equipment_standards - equipment_master is nested relation
            equipmentInfo = item.equipment_master || {};
            equipmentId = item.equipment_id || equipmentInfo.id;
            requiredQty = item.required_qty || item.contract_qty || 1;
            currentQty = 0;
        }

        const namaAlat = equipmentInfo.nama_alat || item.nama_alat || 'N/A';
        const kategori = equipmentInfo.kategori || item.kategori || 'N/A';

        // Always start with empty values for assessment (not pre-filled)
        const inputValue = '';

        // Determine if qty is from actual standards or default fallback
        const isDefaultQty = dataSource === 'equipment_master';
        const qtyClass = isDefaultQty ? 'text-warning' : 'text-dark fw-bold';
        const qtyTitle = isDefaultQty ? 'Qty default - belum ada standar kontrak' : 'Sesuai standar kontrak';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="text-center text-muted">${index + 1}</td>
            <td>
                <div class="fw-semibold">${namaAlat}</div>
            </td>
            <td class="text-center"><span class="badge bg-secondary">${kategori}</span></td>
            <td class="text-center ${qtyClass}" title="${qtyTitle}">
                ${requiredQty}${isDefaultQty ? ' <i class="bi bi-exclamation-circle text-warning"></i>' : ''}
            </td>
            <td class="text-center">
                <input type="number" 
                       class="form-control form-control-sm text-center realisasi-input" 
                       data-equipment-id="${equipmentId}"
                       data-required-qty="${requiredQty}"
                       min="0" 
                       placeholder="-"
                       value="${inputValue}"
                       style="width: 70px; margin: 0 auto;"
                       onchange="FormPenilaianManager.handleRealisasiChange(this)">
            </td>
            <td class="text-center">
                <input type="number" 
                       class="form-control form-control-sm text-center layak-input" 
                       data-equipment-id="${equipmentId}"
                       min="0" 
                       placeholder="-"
                       value="${inputValue}"
                       style="width: 70px; margin: 0 auto;"
                       onchange="FormPenilaianManager.handleLayakChange(this)">
            </td>
            <td class="text-center" style="display: none;">
                <span class="tidak-layak-value">0</span>
            </td>
            <td class="text-center">
                <input type="number" 
                       class="form-control form-control-sm text-center berfungsi-input" 
                       data-equipment-id="${equipmentId}"
                       min="0" 
                       placeholder="-"
                       value="${inputValue}"
                       style="width: 70px; margin: 0 auto;"
                       onchange="FormPenilaianManager.handleBerfungsiChange(this)">
            </td>
            <td class="text-center" style="display: none;">
                <span class="tidak-berfungsi-value">0</span>
            </td>
            <td class="text-center">
                <span class="badge bg-secondary nilai-equipment">-</span>
            </td>
        `;

        // Store equipment data in row for later use
        row.dataset.equipmentId = equipmentId;
        row.dataset.volumePerRegu = requiredQty;
        row.dataset.namaAlat = namaAlat;
        row.dataset.kategori = kategori;
        row.dataset.sourceId = item.id; // Original record ID (vendor_asset, equipment_standard, or equipment_master)
        row.dataset.source = dataSource;

        tableBody.appendChild(row);
    });

    // Also render accordion for mobile view (use sorted data)
    renderEquipmentAccordion(sortedData, isFromVendorAssets);

    // Update progress after rendering
    if (typeof FormPenilaianManager !== 'undefined' && FormPenilaianManager.updateProgress) {
        FormPenilaianManager.updateProgress();
    }
}

// Render equipment accordion for mobile view
function renderEquipmentAccordion(equipmentData, isFromVendorAssets = false) {
    const accordion = document.getElementById('equipmentAccordion');
    const loadingRow = document.getElementById('accordionLoadingRow');

    if (!accordion) return;

    // Clear accordion except loading row
    accordion.innerHTML = '';

    if (!equipmentData || equipmentData.length === 0) {
        accordion.innerHTML = `
            <div class="text-center py-5">
                <i class="bi bi-exclamation-triangle fs-1 text-warning d-block mb-2"></i>
                <strong class="text-muted">Tidak ada data peralatan standar</strong>
                <p class="text-muted small mb-0 mt-2">
                    Belum ada standar peralatan untuk kombinasi ini.
                </p>
            </div>
        `;
        return;
    }

    equipmentData.forEach((item, index) => {
        // Get equipment info - structure differs based on source
        let equipmentInfo, equipmentId, requiredQty;
        const dataSource = item.source || (isFromVendorAssets ? 'vendor_assets' : 'equipment_standards');

        if (isFromVendorAssets) {
            equipmentInfo = item.equipment_master || {};
            equipmentId = item.equipment_id || equipmentInfo.id;
            requiredQty = item.required_qty || 1;
        } else if (dataSource === 'equipment_master') {
            equipmentInfo = item.equipment_master || item;
            equipmentId = item.equipment_id || item.id;
            requiredQty = item.qty_standar || 1;
        } else {
            equipmentInfo = item.equipment_master || {};
            equipmentId = item.equipment_id || equipmentInfo.id;
            requiredQty = item.required_qty || item.contract_qty || 1;
        }

        const namaAlat = equipmentInfo.nama_alat || item.nama_alat || 'N/A';
        const kategori = equipmentInfo.kategori || item.kategori || 'N/A';
        const collapseId = `collapse-${equipmentId}-${index}`;

        const accordionItem = document.createElement('div');
        accordionItem.className = 'accordion-item';
        accordionItem.dataset.equipmentId = equipmentId;
        accordionItem.dataset.volumePerRegu = requiredQty;
        accordionItem.dataset.namaAlat = namaAlat;
        accordionItem.dataset.kategori = kategori;
        accordionItem.dataset.sourceId = item.id;
        accordionItem.dataset.source = dataSource;

        accordionItem.innerHTML = `
            <h2 class="accordion-header">
                <button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#${collapseId}">
                    <div class="accordion-header-content">
                        <span class="accordion-header-title">${namaAlat}</span>
                        <span class="badge bg-secondary nilai-equipment-mobile">-</span>
                    </div>
                </button>
            </h2>
            <div id="${collapseId}" class="accordion-collapse collapse" data-bs-parent="#equipmentAccordion">
                <div class="accordion-body">
                    <div class="equipment-mobile-row">
                        <span class="equipment-mobile-label">Standar Kontrak</span>
                        <span class="equipment-mobile-value">${requiredQty}</span>
                    </div>
                    <div class="equipment-mobile-row">
                        <span class="equipment-mobile-label">Realisasi</span>
                        <input type="number" 
                               class="form-control equipment-mobile-input realisasi-input-mobile" 
                               data-equipment-id="${equipmentId}"
                               data-required-qty="${requiredQty}"
                               min="0" 
                               placeholder="-"
                               value="">
                    </div>
                    <div class="equipment-mobile-row">
                        <span class="equipment-mobile-label">Layak</span>
                        <input type="number" 
                               class="form-control equipment-mobile-input layak-input-mobile" 
                               data-equipment-id="${equipmentId}"
                               min="0" 
                               placeholder="-"
                               value="">
                    </div>
                    <div class="equipment-mobile-row" style="display: none;">
                        <span class="equipment-mobile-label">Tidak Layak</span>
                        <span class="tidak-layak-value-mobile">0</span>
                    </div>
                    <div class="equipment-mobile-row">
                        <span class="equipment-mobile-label">Berfungsi</span>
                        <input type="number" 
                               class="form-control equipment-mobile-input berfungsi-input-mobile" 
                               data-equipment-id="${equipmentId}"
                               min="0" 
                               placeholder="-"
                               value="">
                    </div>
                    <div class="equipment-mobile-row" style="display: none;">
                        <span class="equipment-mobile-label">Tidak Berfungsi</span>
                        <span class="tidak-berfungsi-value-mobile">0</span>
                    </div>
                </div>
            </div>
        `;

        accordion.appendChild(accordionItem);
    });

    // Add event listeners for mobile inputs - sync with table
    setupMobileInputListeners();
}

// Setup mobile input listeners to sync with table
function setupMobileInputListeners() {
    // Realisasi mobile inputs
    document.querySelectorAll('.realisasi-input-mobile').forEach(input => {
        input.addEventListener('change', function () {
            const equipmentId = this.dataset.equipmentId;
            const value = this.value;

            // Sync with table input
            const tableInput = document.querySelector(`#equipmentTableBody .realisasi-input[data-equipment-id="${equipmentId}"]`);
            if (tableInput) {
                tableInput.value = value;
                FormPenilaianManager.handleRealisasiChange(tableInput);
            }

            // Update mobile nilai badge
            updateMobileNilaiBadge(equipmentId);
        });
    });

    // Layak mobile inputs
    document.querySelectorAll('.layak-input-mobile').forEach(input => {
        input.addEventListener('change', function () {
            const equipmentId = this.dataset.equipmentId;
            const value = this.value;

            // Sync with table input
            const tableInput = document.querySelector(`#equipmentTableBody .layak-input[data-equipment-id="${equipmentId}"]`);
            if (tableInput) {
                tableInput.value = value;
                FormPenilaianManager.handleLayakChange(tableInput);
            }

            // Update tidak layak value
            const accordionItem = this.closest('.accordion-item');
            const realisasiInput = accordionItem.querySelector('.realisasi-input-mobile');
            const realisasi = parseInt(realisasiInput?.value) || 0;
            const layak = parseInt(value) || 0;
            const tidakLayak = Math.max(0, realisasi - layak);
            const tidakLayakSpan = accordionItem.querySelector('.tidak-layak-value-mobile');
            if (tidakLayakSpan) tidakLayakSpan.textContent = tidakLayak;

            updateMobileNilaiBadge(equipmentId);
        });
    });

    // Berfungsi mobile inputs
    document.querySelectorAll('.berfungsi-input-mobile').forEach(input => {
        input.addEventListener('change', function () {
            const equipmentId = this.dataset.equipmentId;
            const value = this.value;

            // Sync with table input
            const tableInput = document.querySelector(`#equipmentTableBody .berfungsi-input[data-equipment-id="${equipmentId}"]`);
            if (tableInput) {
                tableInput.value = value;
                FormPenilaianManager.handleBerfungsiChange(tableInput);
            }

            // Update tidak berfungsi value
            const accordionItem = this.closest('.accordion-item');
            const layakInput = accordionItem.querySelector('.layak-input-mobile');
            const layak = parseInt(layakInput?.value) || 0;
            const berfungsi = parseInt(value) || 0;
            const tidakBerfungsi = Math.max(0, layak - berfungsi);
            const tidakBerfungsiSpan = accordionItem.querySelector('.tidak-berfungsi-value-mobile');
            if (tidakBerfungsiSpan) tidakBerfungsiSpan.textContent = tidakBerfungsi;

            updateMobileNilaiBadge(equipmentId);
        });
    });
}

// Update mobile nilai badge based on table calculation
function updateMobileNilaiBadge(equipmentId) {
    const tableRow = document.querySelector(`#equipmentTableBody tr[data-equipment-id="${equipmentId}"]`);
    const accordionItem = document.querySelector(`#equipmentAccordion .accordion-item[data-equipment-id="${equipmentId}"]`);

    if (tableRow && accordionItem) {
        const tableNilai = tableRow.querySelector('.nilai-equipment');
        const mobileNilai = accordionItem.querySelector('.nilai-equipment-mobile');

        if (tableNilai && mobileNilai) {
            mobileNilai.textContent = tableNilai.textContent;
            mobileNilai.className = tableNilai.className.replace('nilai-equipment', 'nilai-equipment-mobile');
        }

        // Update completed state
        if (tableRow.classList.contains('is-complete')) {
            accordionItem.classList.add('is-complete');
        } else {
            accordionItem.classList.remove('is-complete');
        }
    }
}

// Setup event listeners
function setupEventListeners() {
    // Reset Form button
    const resetBtn = document.getElementById('resetFormBtn');
    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            if (confirm('Apakah Anda yakin ingin reset form? Semua data yang belum disimpan akan hilang.')) {
                FormPenilaianManager.resetForm();
            }
        });
    }

    // Unit dropdown change event - filter vendors by unit (for UID users)
    document.getElementById('modalUnit').addEventListener('change', function () {

        if (this.value) {
            filterVendorsByUnit(this.value);
        }
    });

    // Vendor dropdown change event - load personil and peruntukan based on vendor
    document.getElementById('modalVendor').addEventListener('change', function () {
        const selectedVendor = this.value;

        // Reset peruntukan when vendor changes
        const peruntukanSelect = document.getElementById('modalPeruntukan');
        if (peruntukanSelect) {
            peruntukanSelect.innerHTML = '<option value="">-- Pilih Peruntukan --</option>';
        }

        // Clear kendaraan and equipment table
        clearKendaraanField();
        clearEquipmentTable();

        if (selectedVendor) {
            // Load personil data based on selected vendor
            loadPersonilData(selectedVendor);
            // Load peruntukan directly from equipment_standards (no jenis filter)
            loadPeruntukanData(selectedVendor);
        } else {
            // Clear dependent fields when vendor is deselected
            clearVendorDependentFields();
        }
    });

    // Peruntukan change event - load kendaraan by vendor+peruntukan, load equipment
    document.getElementById('modalPeruntukan').addEventListener('change', function () {
        const selectedPeruntukan = this.value;


        // Clear kendaraan and equipment table
        clearKendaraanField();
        clearEquipmentTable();

        if (selectedPeruntukan) {
            const selectedVendor = document.getElementById('modalVendor').value;
            if (selectedVendor) {
                // Load kendaraan filtered by vendor AND peruntukan
                loadKendaraanData(selectedVendor, selectedPeruntukan);
                // Load equipment based on selected vendor and peruntukan
                loadEquipmentData(selectedVendor, selectedPeruntukan);
            } else {

            }
        }
    });

    // Setup modal event listeners for adding new Kendaraan/Petugas
    setupModalEventListeners();
}

// Setup modal event listeners for adding new Kendaraan and Petugas
function setupModalEventListeners() {
    // Modal Tambah Kendaraan - Pre-fill locked fields when modal opens
    const modalKendaraan = document.getElementById('modalTambahKendaraan');
    if (modalKendaraan) {
        modalKendaraan.addEventListener('show.bs.modal', function () {
            // Pre-fill locked fields from form
            const unitSelect = document.getElementById('modalUnit');
            const vendorSelect = document.getElementById('modalVendor');
            const peruntukanSelect = document.getElementById('modalPeruntukan');

            document.getElementById('modalKendaraan_Unit').value =
                unitSelect?.options[unitSelect.selectedIndex]?.text || '-';
            document.getElementById('modalKendaraan_Vendor').value =
                vendorSelect?.options[vendorSelect.selectedIndex]?.text || '-';
            document.getElementById('modalKendaraan_Peruntukan').value =
                peruntukanSelect?.options[peruntukanSelect.selectedIndex]?.text || '-';

            // Clear input fields
            document.getElementById('inputNomorPolisi').value = '';
            document.getElementById('inputKategoriKendaraan').value = '';
            document.getElementById('inputDeskripsiKendaraan').value = '';
            document.getElementById('inputNomorPolisi').classList.remove('is-invalid');
        });

        // Setup nomor polisi input - auto uppercase and validation
        const nopolInput = document.getElementById('inputNomorPolisi');
        if (nopolInput) {
            nopolInput.addEventListener('input', function (e) {
                e.target.value = e.target.value.toUpperCase();
                // Real-time validation
                if (e.target.value && !validateNomorPolisiFormat(e.target.value)) {
                    e.target.classList.add('is-invalid');
                } else {
                    e.target.classList.remove('is-invalid');
                }
            });

            nopolInput.addEventListener('blur', function (e) {
                if (e.target.value && validateNomorPolisiFormat(e.target.value)) {
                    e.target.value = formatNomorPolisiStandard(e.target.value);
                }
            });
        }
    }

    // Modal Tambah Petugas - Pre-fill locked fields when modal opens
    const modalPetugas = document.getElementById('modalTambahPetugas');
    if (modalPetugas) {
        modalPetugas.addEventListener('show.bs.modal', function () {
            // Pre-fill locked fields from form
            const unitSelect = document.getElementById('modalUnit');
            const vendorSelect = document.getElementById('modalVendor');
            const peruntukanSelect = document.getElementById('modalPeruntukan');

            document.getElementById('modalPetugas_Unit').value =
                unitSelect?.options[unitSelect.selectedIndex]?.text || '-';
            document.getElementById('modalPetugas_Vendor').value =
                vendorSelect?.options[vendorSelect.selectedIndex]?.text || '-';
            document.getElementById('modalPetugas_Peruntukan').value =
                peruntukanSelect?.options[peruntukanSelect.selectedIndex]?.text || '-';

            // Clear input fields
            document.getElementById('inputNamaPetugas').value = '';
        });
    }

    // Button Simpan Kendaraan
    const btnSimpanKendaraan = document.getElementById('btnSimpanKendaraan');
    if (btnSimpanKendaraan) {
        btnSimpanKendaraan.addEventListener('click', async function () {
            const nomorPolisi = document.getElementById('inputNomorPolisi').value.trim();
            const kategori = document.getElementById('inputKategoriKendaraan').value;
            const deskripsi = document.getElementById('inputDeskripsiKendaraan')?.value?.trim() || null;
            const vendorId = document.getElementById('modalVendor').value;
            const peruntukanId = document.getElementById('modalPeruntukan').value;

            if (!nomorPolisi) {
                showNotification('Nomor Polisi harus diisi', 'warning');
                return;
            }

            // Validate nomor polisi format
            if (!validateNomorPolisiFormat(nomorPolisi)) {
                document.getElementById('inputNomorPolisi').classList.add('is-invalid');
                showNotification('Format Nomor Polisi tidak valid. Gunakan format: B 1234 XYZ atau BB 1234 XYZ', 'warning');
                return;
            }

            if (!kategori) {
                showNotification('Kategori harus dipilih', 'warning');
                return;
            }

            if (!vendorId || !peruntukanId) {
                showNotification('Vendor dan Peruntukan harus dipilih terlebih dahulu', 'warning');
                return;
            }

            try {
                // Disable button and show loading
                btnSimpanKendaraan.disabled = true;
                btnSimpanKendaraan.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyimpan...';

                // Create new team via API
                const newTeam = {
                    vendor_id: vendorId,
                    peruntukan_id: peruntukanId,
                    nomor_polisi: formatNomorPolisiStandard(nomorPolisi),
                    category: kategori,
                    description: deskripsi
                };

                const result = await TeamsAPI.create(newTeam);

                if (result.success) {
                    showNotification('Kendaraan berhasil ditambahkan', 'success');

                    // Close modal
                    const modal = bootstrap.Modal.getInstance(modalKendaraan);
                    modal.hide();

                    // Reload kendaraan dropdown and auto-select the new one
                    await loadKendaraanData(vendorId, peruntukanId);

                    // Auto-select newly created team
                    const nopolSelect = document.getElementById('modalNopolSelect');
                    if (nopolSelect && result.data?.id) {
                        nopolSelect.value = result.data.id;
                        document.getElementById('modalTeamId').value = result.data.id;
                    }
                } else {
                    showNotification(result.message || 'Gagal menambahkan kendaraan', 'error');
                }
            } catch (error) {
                console.error('Error creating new team:', error);
                showNotification('Gagal menambahkan kendaraan', 'error');
            } finally {
                // Re-enable button
                btnSimpanKendaraan.disabled = false;
                btnSimpanKendaraan.innerHTML = '<i class="bi bi-check-lg me-1"></i>Simpan';
            }
        });
    }

    // Button Simpan Petugas
    const btnSimpanPetugas = document.getElementById('btnSimpanPetugas');
    if (btnSimpanPetugas) {
        btnSimpanPetugas.addEventListener('click', async function () {
            const namaPetugas = document.getElementById('inputNamaPetugas').value.trim();
            const vendorId = document.getElementById('modalVendor').value;
            const peruntukanId = document.getElementById('modalPeruntukan').value;

            if (!namaPetugas) {
                showNotification('Nama Petugas harus diisi', 'warning');
                return;
            }

            if (!vendorId) {
                showNotification('Vendor harus dipilih terlebih dahulu', 'warning');
                return;
            }

            if (!peruntukanId) {
                showNotification('Peruntukan harus dipilih terlebih dahulu', 'warning');
                return;
            }

            try {
                // Disable button and show loading
                btnSimpanPetugas.disabled = true;
                btnSimpanPetugas.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Menyimpan...';

                // Create new personnel via API (including peruntukan_id)
                const newPersonnel = {
                    vendor_id: vendorId,
                    peruntukan_id: peruntukanId,
                    nama_personil: namaPetugas
                };

                const result = await PersonnelAPI.create(newPersonnel);

                if (result.success) {
                    showNotification('Petugas berhasil ditambahkan', 'success');

                    // Close modal
                    const modal = bootstrap.Modal.getInstance(modalPetugas);
                    modal.hide();

                    // Add newly created petugas to newPetugasList for badge display
                    if (!window.newPetugasList) window.newPetugasList = [];
                    window.newPetugasList.push({
                        id: result.data?.id,
                        name: namaPetugas
                    });

                    // Reload petugas dropdown to include new petugas (preserve existing selections)
                    await loadPersonilData(vendorId, true);

                    // Restore the new petugas badges
                    updateSelectedPetugasDisplay();
                } else {
                    showNotification(result.message || 'Gagal menambahkan petugas', 'error');
                }
            } catch (error) {
                console.error('Error creating new personnel:', error);
                showNotification('Gagal menambahkan petugas', 'error');
            } finally {
                // Re-enable button
                btnSimpanPetugas.disabled = false;
                btnSimpanPetugas.innerHTML = '<i class="bi bi-check-lg me-1"></i>Simpan';
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
                    console.error('Logout error:', error);
                }
                window.location.href = 'pages-login.html';
            }
        });
    }
}

// Helper function to clear kendaraan field
function clearKendaraanField() {
    const nopolSelect = document.getElementById('modalNopolSelect');
    const teamIdInput = document.getElementById('modalTeamId');

    if (nopolSelect) {
        nopolSelect.innerHTML = '<option value="">-- Pilih Kendaraan --</option>';
    }
    if (teamIdInput) {
        teamIdInput.value = '';
    }
}

// Helper function to clear vendor-dependent fields
function clearVendorDependentFields() {
    // Clear kendaraan dropdown
    clearKendaraanField();

    // Clear petugas dropdown
    const petugasSelect = document.getElementById('modalPetugasSelect');
    const personnelIdInput = document.getElementById('modalPersonnelId');
    const selectedPetugasContainer = document.getElementById('selectedPetugasContainer');

    if (petugasSelect) {
        petugasSelect.innerHTML = '';
    }
    if (personnelIdInput) {
        personnelIdInput.value = '';
    }
    if (selectedPetugasContainer) {
        selectedPetugasContainer.innerHTML = '';
    }

    // Reset global variables
    window.selectedPetugasIds = [];
    window.newPetugasList = [];

    // Clear equipment table
    clearEquipmentTable();
}

// Clear equipment table
function clearEquipmentTable() {
    const tableBody = document.getElementById('equipmentTableBody');
    const countBadge = document.getElementById('equipmentCountBadge');
    const accordion = document.getElementById('equipmentAccordion');

    tableBody.innerHTML = `
        <tr id="loadingRow">
            <td colspan="10" class="text-center py-5">
                <i class="bi bi-inbox fs-1 text-muted d-block mb-2"></i>
                <div class="text-muted">
                    <strong>Pilih Vendor dan Peruntukan</strong><br>
                    <small>Data peralatan akan dimuat otomatis</small>
                </div>
            </td>
        </tr>
    `;

    // Clear accordion for mobile view
    if (accordion) {
        accordion.innerHTML = `
            <div id="accordionLoadingRow" class="text-center py-5">
                <div class="d-flex flex-column align-items-center">
                    <div class="bg-light rounded-circle p-4 mb-3">
                        <i class="bi bi-inbox fs-1 text-muted"></i>
                    </div>
                    <h6 class="text-muted mb-2">Belum Ada Data Peralatan</h6>
                    <p class="text-muted mb-0 small">
                        <i class="bi bi-arrow-up me-1"></i>
                        Lengkapi <strong>Informasi Sesi</strong> dan <strong>Detail Peruntukan</strong>
                    </p>
                </div>
            </div>
        `;
    }

    if (countBadge) countBadge.textContent = '0 Item';

    // Reset progress and total score
    FormPenilaianManager.updateProgress();
    FormPenilaianManager.calculateTotalScore();
}

// Show notification
function showNotification(message, type = 'info') {
    // Console log for debugging


    try {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = `alert alert-${type === 'error' ? 'danger' : type} alert-dismissible fade show position-fixed`;
        notification.style.cssText = 'top: 20px; right: 20px; z-index: 9999; min-width: 300px;';
        notification.innerHTML = `
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert"></button>
        `;

        document.body.appendChild(notification);

        // Auto remove after 5 seconds
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 5000);
    } catch (error) {
        // Fallback to alert if notification creation fails
        console.error('Failed to create notification:', error);
        if (type === 'error') {
            alert(`Error: ${message}`);
        }
    }
}

// Helper functions for evaluation table interactions
function calculateEquipmentScore(element) {
    const equipmentId = element.dataset.equipmentId;
    const row = element.closest('tr');

    // Get kondisi value
    const kondisiSelect = row.querySelector('.kondisi-select');
    const kondisiValue = kondisiSelect ? kondisiSelect.value : '';

    // Get quantity value
    const quantityInput = row.querySelector('.quantity-input');
    const quantity = quantityInput ? parseInt(quantityInput.value) || 0 : 0;

    // Calculate score based on kondisi and quantity
    let kondisiScore = 0;
    switch (kondisiValue) {
        case 'sangat-baik': kondisiScore = 100; break;
        case 'baik': kondisiScore = 80; break;
        case 'cukup': kondisiScore = 60; break;
        case 'kurang': kondisiScore = 40; break;
        case 'buruk': kondisiScore = 20; break;
        default: kondisiScore = 0;
    }

    // Calculate final score (could include quantity weighting)
    const finalScore = quantity > 0 ? kondisiScore : 0;

    // Update score display
    const scoreDisplay = row.querySelector('.score-display');
    if (scoreDisplay) {
        scoreDisplay.textContent = finalScore;
        scoreDisplay.className = `score-display ${finalScore >= 80 ? 'text-success' : finalScore >= 60 ? 'text-warning' : 'text-danger'}`;
    }


    return finalScore;
}

function updateOverallProgress() {
    const scoreDisplays = document.querySelectorAll('.score-display');
    let totalScore = 0;
    let assessedCount = 0;

    scoreDisplays.forEach(display => {
        const score = parseInt(display.textContent) || 0;
        if (score > 0) {
            totalScore += score;
            assessedCount++;
        }
    });

    const averageScore = assessedCount > 0 ? (totalScore / assessedCount) : 0;
    const totalEquipment = scoreDisplays.length;
    const progressPercentage = totalEquipment > 0 ? (assessedCount / totalEquipment) * 100 : 0;

    // Update progress indicators if they exist
    const progressBar = document.querySelector('.progress-bar');
    if (progressBar) {
        progressBar.style.width = `${progressPercentage}%`;
        progressBar.setAttribute('aria-valuenow', progressPercentage);
    }

    const progressText = document.querySelector('#progressText');
    if (progressText) {
        progressText.textContent = `${assessedCount}/${totalEquipment} peralatan dinilai (${progressPercentage.toFixed(1)}%)`;
    }

    const scoreText = document.querySelector('#averageScoreText');
    if (scoreText) {
        scoreText.textContent = `Rata-rata skor: ${averageScore.toFixed(1)}`;
    }

}

function handleEvidenceUpload(input) {
    const equipmentId = input.dataset.equipmentId;
    const files = Array.from(input.files);


    // Here you would typically upload files to server/storage
    // For now, just show notification
    if (files.length > 0) {
        showNotification(`${files.length} file(s) uploaded for equipment ${equipmentId}`, 'success');
    }
}

function viewEquipmentDetails(equipmentId) {

    // Implement equipment detail view
    showNotification(`Viewing details for equipment ${equipmentId}`, 'info');
}

function editEquipmentAssessment(equipmentId) {

    // Implement equipment assessment editing
    showNotification(`Editing assessment for equipment ${equipmentId}`, 'info');
}