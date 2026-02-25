/**
 * Data Target Penilaian Page
 * Inline-editable target penilaian per unit per peruntukan
 * UID admin can manage all units, UP3 admin can manage own unit only
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let unitsList = [];
let peruntukanList = [];
let targetMap = {}; // keyed by peruntukan_id
let selectedUnit = null;
let currentUnitIndex = 0;
let saveTimers = {};

// Role labels
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
        currentUser = await getCurrentUser();
        if (!currentUser) {
            window.location.href = 'pages-login.html';
            return;
        }

        const profileResult = await ProfilesAPI.getById(currentUser.id);
        if (profileResult.success && profileResult.data) {
            currentProfile = profileResult.data;
            if (typeof saveUserRoleToStorage === 'function') {
                saveUserRoleToStorage(currentProfile);
            }
            updateNavbarProfile();
        } else {
            window.location.href = 'pages-login.html';
            return;
        }

        // Only admin roles can access this page
        const allowedRoles = ['uid_admin', 'uid_user', 'up3_admin'];
        if (!allowedRoles.includes(currentProfile.role)) {
            Swal.fire('Akses Ditolak', 'Anda tidak memiliki akses ke halaman ini.', 'warning')
                .then(() => window.location.href = 'index.html');
            return;
        }

        // Load units & peruntukan
        await Promise.all([loadUnits(), loadPeruntukan()]);

        // Setup unit filter
        setupUnitFilter();

        // Load targets for the selected unit
        await loadTargets();

    } catch (error) {
        console.error('Error loading page:', error);
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

// Load units list
async function loadUnits() {
    try {
        const client = getSupabaseClient();
        const { data, error } = await client
            .from('units')
            .select('unit_code, unit_name')
            .order('unit_code');

        if (error) throw error;
        unitsList = data || [];
    } catch (error) {
        console.error('Error loading units:', error);
        unitsList = [];
    }
}

// Load peruntukan list
async function loadPeruntukan() {
    try {
        const client = getSupabaseClient();
        const { data, error } = await client
            .from('peruntukan')
            .select('id, deskripsi')
            .order('deskripsi');

        if (error) throw error;
        peruntukanList = data || [];
    } catch (error) {
        console.error('Error loading peruntukan:', error);
        peruntukanList = [];
    }
}

// Setup unit filter / pagination
function setupUnitFilter() {
    const role = currentProfile.role;

    if (role === 'uid_admin' || role === 'uid_user') {
        // UID: show pagination
        const paginationEl = document.getElementById('unitPagination');
        paginationEl.style.display = 'flex';
        paginationEl.classList.add('d-flex');

        if (unitsList.length > 0) {
            currentUnitIndex = 0;
            updateUnitPagination();
        }
    } else if (role === 'up3_admin') {
        // UP3 admin: show locked label
        const labelEl = document.getElementById('up3UnitLabel');
        labelEl.style.display = 'inline-block';
        const myUnit = currentProfile.unit_code;
        const unitObj = unitsList.find(u => u.unit_code === myUnit);
        labelEl.textContent = unitObj ? `${unitObj.unit_code} - ${unitObj.unit_name}` : myUnit;
        selectedUnit = myUnit;
    }
}

// Update unit pagination display
function updateUnitPagination() {
    if (unitsList.length === 0) return;

    const unit = unitsList[currentUnitIndex];
    selectedUnit = unit.unit_code;

    const label = document.getElementById('currentUnitLabel');
    label.textContent = `${unit.unit_code} - ${unit.unit_name}`;

    // Update button states
    document.getElementById('prevUnitBtn').disabled = (currentUnitIndex === 0);
    document.getElementById('nextUnitBtn').disabled = (currentUnitIndex === unitsList.length - 1);
}

// Load targets for selected unit
async function loadTargets() {
    if (!selectedUnit) {
        renderEmptyState('Pilih unit terlebih dahulu untuk mengatur target penilaian.');
        return;
    }

    try {
        const client = getSupabaseClient();
        const { data, error } = await client
            .from('target_penilaian')
            .select('*')
            .eq('unit_code', selectedUnit);

        if (error) throw error;

        // Build map: peruntukan_id -> target record
        targetMap = {};
        (data || []).forEach(t => {
            targetMap[t.peruntukan_id] = t;
        });

        renderTargetTable();

    } catch (error) {
        console.error('Error loading targets:', error);
        Swal.fire('Error', 'Gagal memuat target: ' + error.message, 'error');
    }
}

// Render the target table
function renderTargetTable() {
    const tbody = document.getElementById('target-table-body');

    if (peruntukanList.length === 0) {
        renderEmptyState('Tidak ada data peruntukan.');
        return;
    }

    const isReadOnly = currentProfile.role === 'uid_user';

    let html = '';
    let totalRegu = 0;
    let totalTarget = 0;

    peruntukanList.forEach((p, idx) => {
        const target = targetMap[p.id] || null;
        const regu = target ? target.jumlah_regu : 0;
        const perhari = target ? target.penilaian_perhari : 0;
        const harian = regu * perhari;

        totalRegu += regu;
        totalTarget += harian;

        html += `<tr data-peruntukan-id="${p.id}">
            <td class="text-center">${idx + 1}</td>
            <td>${escapeHtml(p.deskripsi)}</td>
            <td class="text-center">
                <input type="number" class="form-control form-control-sm input-target" 
                       data-field="jumlah_regu" data-peruntukan-id="${p.id}"
                       value="${regu}" min="0" max="999"
                       ${isReadOnly ? 'disabled' : ''}>
            </td>
            <td class="text-center">
                <input type="number" class="form-control form-control-sm input-target"
                       data-field="penilaian_perhari" data-peruntukan-id="${p.id}"
                       value="${perhari}" min="0" max="999"
                       ${isReadOnly ? 'disabled' : ''}>
            </td>
            <td class="text-center target-computed" id="target-${p.id}">${harian}</td>
            <td class="text-center">
                <span class="save-indicator text-success" id="saved-${p.id}">
                    <i class="bi bi-check-circle-fill"></i>
                </span>
            </td>
        </tr>`;
    });

    tbody.innerHTML = html;

    // Update footer totals
    document.getElementById('totalRegu').textContent = totalRegu;
    document.getElementById('totalTarget').textContent = totalTarget;

    // Attach input event listeners for auto-save
    if (!isReadOnly) {
        tbody.querySelectorAll('.input-target').forEach(input => {
            input.addEventListener('input', handleInputChange);
            input.addEventListener('focus', function () { this.select(); });
        });
    }
}

// Handle input change - recalculate and auto-save with debounce
function handleInputChange(e) {
    const input = e.target;
    const peruntukanId = input.dataset.peruntukanId;
    const row = input.closest('tr');

    // Get both values from the row
    const reguInput = row.querySelector('[data-field="jumlah_regu"]');
    const perhariInput = row.querySelector('[data-field="penilaian_perhari"]');
    const regu = parseInt(reguInput.value) || 0;
    const perhari = parseInt(perhariInput.value) || 0;
    const harian = regu * perhari;

    // Update computed target display
    document.getElementById(`target-${peruntukanId}`).textContent = harian;

    // Update footer totals
    updateTotals();

    // Debounce save (500ms)
    if (saveTimers[peruntukanId]) {
        clearTimeout(saveTimers[peruntukanId]);
    }
    saveTimers[peruntukanId] = setTimeout(() => {
        saveTarget(peruntukanId, regu, perhari);
    }, 500);
}

// Update footer totals
function updateTotals() {
    let totalRegu = 0;
    let totalTarget = 0;

    document.querySelectorAll('#target-table-body tr').forEach(row => {
        const reguInput = row.querySelector('[data-field="jumlah_regu"]');
        const perhariInput = row.querySelector('[data-field="penilaian_perhari"]');
        if (reguInput && perhariInput) {
            const regu = parseInt(reguInput.value) || 0;
            const perhari = parseInt(perhariInput.value) || 0;
            totalRegu += regu;
            totalTarget += regu * perhari;
        }
    });

    document.getElementById('totalRegu').textContent = totalRegu;
    document.getElementById('totalTarget').textContent = totalTarget;
}

// Save target to database (upsert)
async function saveTarget(peruntukanId, jumlahRegu, penilaianPerhari) {
    try {
        const client = getSupabaseClient();

        const { data, error } = await client
            .from('target_penilaian')
            .upsert({
                unit_code: selectedUnit,
                peruntukan_id: peruntukanId,
                jumlah_regu: jumlahRegu,
                penilaian_perhari: penilaianPerhari
            }, {
                onConflict: 'unit_code,peruntukan_id'
            })
            .select()
            .single();

        if (error) throw error;

        // Update local map
        targetMap[peruntukanId] = data;

        // Show saved indicator
        showSavedIndicator(peruntukanId);

    } catch (error) {
        console.error('Error saving target:', error);
        // Show error indicator
        const indicator = document.getElementById(`saved-${peruntukanId}`);
        if (indicator) {
            indicator.innerHTML = '<i class="bi bi-exclamation-circle-fill"></i>';
            indicator.classList.remove('text-success');
            indicator.classList.add('text-danger', 'show');
            setTimeout(() => {
                indicator.classList.remove('show');
                indicator.classList.remove('text-danger');
                indicator.classList.add('text-success');
                indicator.innerHTML = '<i class="bi bi-check-circle-fill"></i>';
            }, 3000);
        }
    }
}

// Show saved indicator briefly
function showSavedIndicator(peruntukanId) {
    const indicator = document.getElementById(`saved-${peruntukanId}`);
    if (indicator) {
        indicator.classList.add('show');
        setTimeout(() => {
            indicator.classList.remove('show');
        }, 1500);
    }
}

// Render empty state
function renderEmptyState(message) {
    const tbody = document.getElementById('target-table-body');
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-3">${message}</td></tr>`;
    document.getElementById('totalRegu').textContent = 0;
    document.getElementById('totalTarget').textContent = 0;
}

// Navigate to previous unit
function prevUnit() {
    if (currentUnitIndex > 0) {
        currentUnitIndex--;
        updateUnitPagination();
        loadTargets();
    }
}

// Navigate to next unit
function nextUnit() {
    if (currentUnitIndex < unitsList.length - 1) {
        currentUnitIndex++;
        updateUnitPagination();
        loadTargets();
    }
}

// Setup event listeners
function setupEventListeners() {
    // Unit pagination buttons
    const prevBtn = document.getElementById('prevUnitBtn');
    const nextBtn = document.getElementById('nextUnitBtn');
    if (prevBtn) prevBtn.addEventListener('click', prevUnit);
    if (nextBtn) nextBtn.addEventListener('click', nextUnit);

    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadTargets);
    }

    // Logout
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async (e) => {
            e.preventDefault();
            const result = await Swal.fire({
                title: 'Konfirmasi Logout',
                text: 'Apakah Anda yakin ingin keluar?',
                icon: 'question',
                showCancelButton: true,
                confirmButtonColor: '#d33',
                cancelButtonColor: '#3085d6',
                confirmButtonText: 'Ya, Logout',
                cancelButtonText: 'Batal'
            });

            if (result.isConfirmed) {
                await logout();
                window.location.href = 'pages-login.html';
            }
        });
    }
}

// Escape HTML helper
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text));
    return div.innerHTML;
}
