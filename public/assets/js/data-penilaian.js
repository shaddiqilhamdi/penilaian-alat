/**
 * Data Penilaian Module
 * Handle assessment data display and detail modal
 */

// Global variables
let currentUser = null;
let currentProfile = null;
let assessmentsData = [];
let dataTable = null;

// Role labels for display
const ROLE_LABELS = {
    uid_admin: 'UID Admin',
    uid_user: 'UID User',
    up3_admin: 'UP3 Admin',
    up3_user: 'UP3 User',
    vendor_k3: 'Vendor K3'
};

// Status badge colors
const STATUS_COLORS = {
    'Draft': 'bg-secondary',
    'Submitted': 'bg-primary',
    'Revised': 'bg-warning',
    'Approved': 'bg-success'
};

document.addEventListener('DOMContentLoaded', async function () {
    // Wait for APIs to be available
    let retryCount = 0;
    const maxRetries = 5;

    while (retryCount < maxRetries) {
        if (typeof getSupabaseClient !== 'undefined' &&
            typeof AssessmentsAPI !== 'undefined') {
            break;
        }

        await new Promise(resolve => setTimeout(resolve, 500));
        retryCount++;
    }

    if (retryCount >= maxRetries) {
        showNotification('Gagal memuat konfigurasi sistem', 'error');
        return;
    }

    try {
        // Check authentication
        currentUser = await getCurrentUser();
        if (!currentUser) {
            window.location.href = 'pages-login.html';
            return;
        }

        // Load profile
        const profileResult = await ProfilesAPI.getById(currentUser.id);
        if (profileResult.success && profileResult.data) {
            currentProfile = profileResult.data;
            updateNavbarProfile();
        }

        // Load assessments data
        await loadAssessmentsData();

        // Setup event listeners
        setupEventListeners();

    } catch (error) {
        showNotification('Gagal memuat data', 'error');
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

// Load assessments data
async function loadAssessmentsData() {
    try {
        showLoadingState(true);

        // Build filters based on user role
        const filters = {};

        // Non-UID users can only see their unit's data
        if (!isUIDUser() && currentProfile?.unit_code) {
            filters.unitCode = currentProfile.unit_code;
        }

        // Vendor users can only see their own vendor's data
        if (currentProfile?.role === 'vendor_k3' && currentProfile?.vendor_id) {
            filters.vendorId = currentProfile.vendor_id;
        }

        const result = await AssessmentsAPI.getAll(filters);

        if (!result.success) {
            showNotification('Gagal memuat data penilaian', 'error');
            return;
        }

        assessmentsData = result.data || [];
        renderAssessmentsTable(assessmentsData);

    } catch (error) {
        showNotification('Gagal memuat data penilaian', 'error');
    } finally {
        showLoadingState(false);
    }
}

// Render assessments table
function renderAssessmentsTable(data) {
    const tableBody = document.getElementById('assessmentsTableBody');

    if (!tableBody) {
        return;
    }

    if (!data || data.length === 0) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">
                    <i class="bi bi-inbox fs-1 text-muted d-block mb-2"></i>
                    <span class="text-muted">Belum ada data penilaian</span>
                </td>
            </tr>
        `;
        return;
    }

    tableBody.innerHTML = data.map((assessment, index) => {
        const vendorName = assessment.vendors?.vendor_name || 'N/A';
        const unitCode = assessment.vendors?.unit_code || '-';
        const peruntukanDesc = assessment.peruntukan?.deskripsi || 'N/A';
        const peruntukanJenis = assessment.peruntukan?.jenis || '-';
        const assessorName = assessment.profiles?.nama || 'N/A';
        const tanggal = formatDate(assessment.tanggal_penilaian);
        const shift = assessment.shift || '-';
        const totalItems = assessment.jumlah_item_peralatan || 0;
        const totalScore = assessment.total_score?.toFixed(2) || '0.00';
        const status = assessment.status || 'Draft';
        const statusColor = STATUS_COLORS[status] || 'bg-secondary';

        return `
            <tr data-id="${assessment.id}" style="cursor: pointer;" onclick="showAssessmentDetail('${assessment.id}')">
                <td>${index + 1}</td>
                <td>${tanggal}</td>
                <td>
                    <span class="badge bg-info">${shift}</span>
                </td>
                <td>
                    <strong>${vendorName}</strong>
                    <br><small class="text-muted">${unitCode}</small>
                </td>
                <td>
                    ${peruntukanDesc}
                    <br><small class="text-muted">${peruntukanJenis}</small>
                </td>
                <td class="text-center">${totalItems}</td>
                <td class="text-center">
                    <strong class="${parseFloat(totalScore) >= 1.5 ? 'text-success' : parseFloat(totalScore) >= 0 ? 'text-warning' : 'text-danger'}">${totalScore}</strong>
                </td>
                <td class="text-center">
                    <span class="badge ${statusColor}">${status}</span>
                </td>
            </tr>
        `;
    }).join('');

    // Initialize DataTable if not already done
    initDataTable();
}

// Initialize DataTable
function initDataTable() {
    const table = document.querySelector('.datatable');
    if (table && !dataTable) {
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

// Show assessment detail modal
async function showAssessmentDetail(assessmentId) {
    try {
        // Show loading in modal
        const modalContent = document.getElementById('detailModalContent');
        modalContent.innerHTML = `
            <div class="text-center py-5">
                <div class="spinner-border text-primary" role="status">
                    <span class="visually-hidden">Loading...</span>
                </div>
                <p class="mt-2">Memuat detail penilaian...</p>
            </div>
        `;

        // Show modal
        const modal = new bootstrap.Modal(document.getElementById('assessmentDetailModal'));
        modal.show();

        // Fetch assessment detail
        const result = await AssessmentsAPI.getById(assessmentId);

        if (!result.success) {
            modalContent.innerHTML = `
                <div class="alert alert-danger">
                    <i class="bi bi-exclamation-triangle me-2"></i>
                    Gagal memuat detail penilaian: ${result.error}
                </div>
            `;
            return;
        }

        const assessment = result.data;
        renderAssessmentDetail(assessment);

    } catch (error) {
        document.getElementById('detailModalContent').innerHTML = `
            <div class="alert alert-danger">
                <i class="bi bi-exclamation-triangle me-2"></i>
                Terjadi kesalahan saat memuat detail
            </div>
        `;
    }
}

// Render assessment detail in modal
function renderAssessmentDetail(assessment) {
    const modalContent = document.getElementById('detailModalContent');

    const vendorName = assessment.vendors?.vendor_name || 'N/A';
    const unitCode = assessment.vendors?.unit_code || '-';
    const unitName = assessment.vendors?.unit_name || '-';
    const peruntukanDesc = assessment.peruntukan?.deskripsi || 'N/A';
    const peruntukanJenis = assessment.peruntukan?.jenis || '-';
    const teamNopol = assessment.teams?.nomor_polisi || '-';
    const teamCategory = assessment.teams?.category || '-';
    const assessorName = assessment.profiles?.nama || 'N/A';
    const tanggal = formatDate(assessment.tanggal_penilaian);
    const shift = assessment.shift || '-';
    const status = assessment.status || 'Draft';
    const statusColor = STATUS_COLORS[status] || 'bg-secondary';
    const totalScore = assessment.total_score?.toFixed(2) || '0.00';

    // Build items table
    const items = assessment.assessment_items || [];
    const itemsTableRows = items.map((item, index) => {
        const equipmentName = item.equipment_master?.nama_alat || 'N/A';
        const kategori = item.equipment_master?.kategori || '-';
        const requiredQty = item.required_qty || 0;
        const actualQty = item.actual_qty || 0;
        const layak = item.layak || 0;
        const tidakLayak = item.tidak_layak || 0;
        const berfungsi = item.berfungsi || 0;
        const tidakBerfungsi = item.tidak_berfungsi || 0;
        const scoreItem = item.score_item ?? 0;

        return `
            <tr>
                <td>${index + 1}</td>
                <td>
                    ${equipmentName}
                    <br><small class="text-muted">${kategori}</small>
                </td>
                <td class="text-center">${requiredQty}</td>
                <td class="text-center">${actualQty}</td>
                <td class="text-center">
                    <span class="text-success">${layak}</span> /
                    <span class="text-danger">${tidakLayak}</span>
                </td>
                <td class="text-center">
                    <span class="text-success">${berfungsi}</span> /
                    <span class="text-danger">${tidakBerfungsi}</span>
                </td>
                <td class="text-center">
                    <strong class="${scoreItem >= 1.5 ? 'text-success' : scoreItem >= 0 ? 'text-warning' : 'text-danger'}">${scoreItem.toFixed(2)}</strong>
                </td>
            </tr>
        `;
    }).join('');

    modalContent.innerHTML = `
        <!-- Header Info -->
        <div class="row mb-4">
            <div class="col-md-6">
                <div class="card bg-light">
                    <div class="card-body">
                        <h6 class="card-subtitle mb-2 text-muted">Informasi Penilaian</h6>
                        <table class="table table-sm table-borderless mb-0">
                            <tr>
                                <td width="120"><strong>Tanggal</strong></td>
                                <td>${tanggal}</td>
                            </tr>
                            <tr>
                                <td><strong>Shift</strong></td>
                                <td><span class="badge bg-info">${shift}</span></td>
                            </tr>
                            <tr>
                                <td><strong>Status</strong></td>
                                <td><span class="badge ${statusColor}">${status}</span></td>
                            </tr>
                            <tr>
                                <td><strong>Penilai</strong></td>
                                <td>${assessorName}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
            <div class="col-md-6">
                <div class="card bg-light">
                    <div class="card-body">
                        <h6 class="card-subtitle mb-2 text-muted">Vendor & Peruntukan</h6>
                        <table class="table table-sm table-borderless mb-0">
                            <tr>
                                <td width="120"><strong>Vendor</strong></td>
                                <td>${vendorName}</td>
                            </tr>
                            <tr>
                                <td><strong>Unit</strong></td>
                                <td>${unitCode} - ${unitName}</td>
                            </tr>
                            <tr>
                                <td><strong>Peruntukan</strong></td>
                                <td>${peruntukanDesc} (${peruntukanJenis})</td>
                            </tr>
                            <tr>
                                <td><strong>Kendaraan</strong></td>
                                <td>${teamNopol} ${teamCategory !== '-' ? '(' + teamCategory + ')' : ''}</td>
                            </tr>
                        </table>
                    </div>
                </div>
            </div>
        </div>

        <!-- Summary Stats -->
        <div class="row mb-4">
            <div class="col-md-3">
                <div class="card border-primary">
                    <div class="card-body text-center py-2">
                        <h4 class="mb-0 text-primary">${assessment.jumlah_item_peralatan || 0}</h4>
                        <small class="text-muted">Total Item</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card border-success">
                    <div class="card-body text-center py-2">
                        <h4 class="mb-0 text-success">${assessment.jumlah_peralatan_layak || 0}</h4>
                        <small class="text-muted">Layak</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card border-info">
                    <div class="card-body text-center py-2">
                        <h4 class="mb-0 text-info">${assessment.jumlah_peralatan_berfungsi || 0}</h4>
                        <small class="text-muted">Berfungsi</small>
                    </div>
                </div>
            </div>
            <div class="col-md-3">
                <div class="card ${parseFloat(totalScore) >= 1.5 ? 'border-success' : parseFloat(totalScore) >= 0 ? 'border-warning' : 'border-danger'}">
                    <div class="card-body text-center py-2">
                        <h4 class="mb-0 ${parseFloat(totalScore) >= 1.5 ? 'text-success' : parseFloat(totalScore) >= 0 ? 'text-warning' : 'text-danger'}">${totalScore}</h4>
                        <small class="text-muted">Total Skor</small>
                    </div>
                </div>
            </div>
        </div>

        <!-- Items Table -->
        <h6 class="mb-3"><i class="bi bi-list-check me-2"></i>Detail Penilaian Peralatan</h6>
        <div class="table-responsive">
            <table class="table table-sm table-striped table-hover">
                <thead class="table-dark">
                    <tr>
                        <th width="40">No</th>
                        <th>Nama Alat</th>
                        <th class="text-center" width="80">Standar</th>
                        <th class="text-center" width="80">Realisasi</th>
                        <th class="text-center" width="100">Layak/Tidak</th>
                        <th class="text-center" width="120">Fungsi/Tidak</th>
                        <th class="text-center" width="70">Skor</th>
                    </tr>
                </thead>
                <tbody>
                    ${itemsTableRows || '<tr><td colspan="7" class="text-center">Tidak ada data item</td></tr>'}
                </tbody>
            </table>
        </div>
    `;
}

// Setup event listeners
function setupEventListeners() {
    // Refresh button
    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', loadAssessmentsData);
    }

    // Filter buttons (if any)
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', function (e) {
            e.preventDefault();
            applyFilters();
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

// Apply filters
async function applyFilters() {
    const filters = {};

    const vendorFilter = document.getElementById('filterVendor')?.value;
    const statusFilter = document.getElementById('filterStatus')?.value;
    const startDate = document.getElementById('filterStartDate')?.value;
    const endDate = document.getElementById('filterEndDate')?.value;

    if (vendorFilter) filters.vendorId = vendorFilter;
    if (statusFilter) filters.status = statusFilter;
    if (startDate) filters.startDate = startDate;
    if (endDate) filters.endDate = endDate;

    // Non-UID users can only see their unit's data
    if (!isUIDUser() && currentProfile?.unit_code) {
        filters.unitCode = currentProfile.unit_code;
    }

    if (currentProfile?.role === 'vendor_k3' && currentProfile?.vendor_id) {
        filters.vendorId = currentProfile.vendor_id;
    }

    showLoadingState(true);
    const result = await AssessmentsAPI.getAll(filters);
    showLoadingState(false);

    if (result.success) {
        assessmentsData = result.data || [];

        // Destroy existing datatable before re-rendering
        if (dataTable) {
            dataTable.destroy();
            dataTable = null;
        }

        renderAssessmentsTable(assessmentsData);
    }
}

// Show loading state
function showLoadingState(show) {
    const tableBody = document.getElementById('assessmentsTableBody');
    if (show && tableBody) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="8" class="text-center py-4">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                    <p class="mt-2 mb-0">Memuat data penilaian...</p>
                </td>
            </tr>
        `;
    }
}

// Format date helper
function formatDate(dateString) {
    if (!dateString) return '-';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', {
            year: 'numeric',
            month: 'short',
            day: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

// Show notification
function showNotification(message, type = 'info') {
    // Simple alert for now, can be replaced with toast
    const alertClass = type === 'error' ? 'alert-danger' : type === 'success' ? 'alert-success' : 'alert-info';

    const alertHtml = `
        <div class="alert ${alertClass} alert-dismissible fade show position-fixed" 
             style="top: 80px; right: 20px; z-index: 9999; min-width: 300px;" role="alert">
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', alertHtml);

    // Auto dismiss after 5 seconds
    setTimeout(() => {
        const alert = document.querySelector('.alert.position-fixed');
        if (alert) alert.remove();
    }, 5000);
}

// Export function for global access
window.showAssessmentDetail = showAssessmentDetail;
