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
            // Save role to localStorage for CSS-based menu visibility
            if (typeof saveUserRoleToStorage === 'function') {
                saveUserRoleToStorage(currentProfile);
            }
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
    const teamNopol = assessment.teams?.nomor_polisi || '-';
    const teamCategory = assessment.teams?.category || '-';
    const assessorName = assessment.profiles?.nama || 'N/A';
    const tanggal = formatDate(assessment.tanggal_penilaian);
    const shift = assessment.shift || '-';
    const status = assessment.status || 'Draft';
    const statusColor = STATUS_COLORS[status] || 'bg-secondary';
    const totalScore = assessment.total_score?.toFixed(2) || '0.00';

    // Build personnel list for "Personal/Regu" type assessments
    const personnelList = assessment.assessment_personnel || [];
    const personnelNames = personnelList
        .map(ap => ap.personnel?.nama_personil)
        .filter(name => name) // Remove null/undefined
        .join(', ') || '-';

    // Show personnel row only if there are personnel
    const petugasRow = personnelList.length > 0 ? `
        <tr>
            <td><strong>Petugas</strong></td>
            <td>${personnelNames}</td>
        </tr>
    ` : '';

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
                                <td>${peruntukanDesc}</td>
                            </tr>
                            <tr>
                                <td><strong>Kendaraan</strong></td>
                                <td>${teamNopol} ${teamCategory !== '-' ? '(' + teamCategory + ')' : ''}</td>
                            </tr>
                            ${petugasRow}
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

    // Download Excel button
    const downloadExcelBtn = document.getElementById('downloadExcelBtn');
    if (downloadExcelBtn) {
        downloadExcelBtn.addEventListener('click', downloadExcel);
    }

    // Filter form
    const filterForm = document.getElementById('filterForm');
    if (filterForm) {
        filterForm.addEventListener('submit', function (e) {
            e.preventDefault();
            applyFilters();
        });
    }

    // Clear filter button
    const clearFilterBtn = document.getElementById('clearFilterBtn');
    if (clearFilterBtn) {
        clearFilterBtn.addEventListener('click', function () {
            const startEl = document.getElementById('filterStartDate');
            const endEl = document.getElementById('filterEndDate');
            if (startEl) startEl.value = '';
            if (endEl) endEl.value = '';
            // Reload all data without date filters
            if (dataTable) { dataTable.destroy(); dataTable = null; }
            loadAssessmentsData();
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

// =============================================
// Download Excel (Sheet 1: Rekap, Sheet 2: Detail)
// =============================================
async function downloadExcel() {
    if (!assessmentsData || assessmentsData.length === 0) {
        showNotification('Tidak ada data untuk di-download', 'error');
        return;
    }

    if (typeof XLSX === 'undefined') {
        showNotification('Library Excel belum dimuat, coba refresh halaman', 'error');
        return;
    }

    const btn = document.getElementById('downloadExcelBtn');
    const origHTML = btn.innerHTML;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm"></span>';
    btn.disabled = true;

    try {
        const client = getSupabaseClient();
        const assessmentIds = assessmentsData.map(a => a.id);

        // Fetch all assessment details with items & personnel in bulk
        const { data: fullData, error } = await client
            .from('assessments')
            .select(`
                *,
                vendors(vendor_name, unit_code),
                peruntukan(deskripsi),
                teams(nomor_polisi),
                profiles!assessments_assessor_id_fkey(nama),
                assessment_items(
                    *,
                    equipment_master(nama_alat, kategori, jenis)
                ),
                assessment_personnel(
                    id,
                    personnel(nama_personil)
                )
            `)
            .in('id', assessmentIds)
            .order('tanggal_penilaian', { ascending: false });

        if (error) throw error;

        // ---- Sheet 1: Rekap Penilaian ----
        const sheet1Data = fullData.map((a, idx) => {
            const items = a.assessment_items || [];
            const personnel = (a.assessment_personnel || [])
                .map(ap => ap.personnel?.nama_personil).filter(Boolean).join(', ') || '-';

            const totalItem = items.length;
            const kontrak = items.reduce((s, i) => s + (i.required_qty || 0), 0);
            const realisasi = items.reduce((s, i) => s + (i.actual_qty || 0), 0);
            const layak = items.reduce((s, i) => s + (i.layak || 0), 0);
            const tidakLayak = items.reduce((s, i) => s + (i.tidak_layak || 0), 0);
            const berfungsi = items.reduce((s, i) => s + (i.berfungsi || 0), 0);
            const tidakBerfungsi = items.reduce((s, i) => s + (i.tidak_berfungsi || 0), 0);

            // Score sums from items (kesesuaian: 2|0, fisik: 0|-1, fungsi: 0|-1)
            const kesesuaian = items.reduce((s, i) => s + (i.kesesuaian_kontrak || 0), 0);
            const kondisiFisik = items.reduce((s, i) => s + (i.kondisi_fisik || 0), 0);
            const kondisiFungsi = items.reduce((s, i) => s + (i.kondisi_fungsi || 0), 0);

            return {
                'No': idx + 1,
                'Tanggal': formatDateExcel(a.tanggal_penilaian),
                'Shift': a.shift || '-',
                'Vendor': a.vendors?.vendor_name || '-',
                'Unit': a.vendors?.unit_code || '-',
                'Peruntukan': a.peruntukan?.deskripsi || '-',
                'Kendaraan': a.teams?.nomor_polisi || '-',
                'Petugas': personnel,
                'Total Item': totalItem,
                'Kontrak': kontrak,
                'Realisasi': realisasi,
                'Layak': layak,
                'Tidak Layak': tidakLayak,
                'Berfungsi': berfungsi,
                'Tidak Berfungsi': tidakBerfungsi,
                'Kesesuaian': kesesuaian,
                'Kondisi Fisik': kondisiFisik,
                'Kondisi Fungsi': kondisiFungsi,
                'Skor': Math.round((a.total_score || 0) * 100) / 100
            };
        });

        // ---- Sheet 2: Detail Peralatan ----
        const sheet2Data = [];
        let detailNo = 1;
        fullData.forEach(a => {
            const items = a.assessment_items || [];
            items.forEach(item => {
                sheet2Data.push({
                    'No': detailNo++,
                    'Tanggal': formatDateExcel(a.tanggal_penilaian),
                    'Vendor': a.vendors?.vendor_name || '-',
                    'Peruntukan': a.peruntukan?.deskripsi || '-',
                    'Kendaraan': a.teams?.nomor_polisi || '-',
                    'Nama Alat': item.equipment_master?.nama_alat || '-',
                    'Kategori': item.equipment_master?.kategori || '-',
                    'Jenis': item.equipment_master?.jenis || '-',
                    'Standar': item.required_qty || 0,
                    'Realisasi': item.actual_qty || 0,
                    'Layak': item.layak || 0,
                    'Tidak Layak': item.tidak_layak || 0,
                    'Berfungsi': item.berfungsi || 0,
                    'Tidak Berfungsi': item.tidak_berfungsi || 0,
                    'Kesesuaian': item.kesesuaian_kontrak ?? 0,
                    'Kondisi Fisik': item.kondisi_fisik ?? 0,
                    'Kondisi Fungsi': item.kondisi_fungsi ?? 0,
                    'Skor': item.score_item ?? 0
                });
            });
        });

        // Build workbook
        const wb = XLSX.utils.book_new();

        const ws1 = XLSX.utils.json_to_sheet(sheet1Data);
        const ws2 = XLSX.utils.json_to_sheet(sheet2Data);

        // Set column widths for Sheet 1
        ws1['!cols'] = [
            { wch: 4 },  // No
            { wch: 12 }, // Tanggal
            { wch: 6 },  // Shift
            { wch: 25 }, // Vendor
            { wch: 10 }, // Unit
            { wch: 18 }, // Peruntukan
            { wch: 14 }, // Kendaraan
            { wch: 25 }, // Petugas
            { wch: 8 },  // Total Item
            { wch: 8 },  // Kontrak
            { wch: 9 },  // Realisasi
            { wch: 7 },  // Layak
            { wch: 10 }, // Tidak Layak
            { wch: 9 },  // Berfungsi
            { wch: 13 }, // Tidak Berfungsi
            { wch: 10 }, // Kesesuaian
            { wch: 12 }, // Kondisi Fisik
            { wch: 13 }, // Kondisi Fungsi
            { wch: 7 }   // Skor
        ];

        // Set column widths for Sheet 2
        ws2['!cols'] = [
            { wch: 4 },  // No
            { wch: 12 }, // Tanggal
            { wch: 25 }, // Vendor
            { wch: 18 }, // Peruntukan
            { wch: 14 }, // Kendaraan
            { wch: 25 }, // Nama Alat
            { wch: 15 }, // Kategori
            { wch: 10 }, // Jenis
            { wch: 8 },  // Standar
            { wch: 9 },  // Realisasi
            { wch: 7 },  // Layak
            { wch: 10 }, // Tidak Layak
            { wch: 9 },  // Berfungsi
            { wch: 13 }, // Tidak Berfungsi
            { wch: 12 }, // Kesesuaian
            { wch: 12 }, // Kondisi Fisik
            { wch: 13 }, // Kondisi Fungsi
            { wch: 7 }   // Skor
        ];

        XLSX.utils.book_append_sheet(wb, ws1, 'Rekap Penilaian');
        XLSX.utils.book_append_sheet(wb, ws2, 'Detail Peralatan');

        // Generate filename with date range
        const now = new Date();
        const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`;
        const fileName = `Riwayat_Penilaian_${dateStr}.xlsx`;

        XLSX.writeFile(wb, fileName);
        showNotification(`File ${fileName} berhasil di-download`, 'success');

    } catch (error) {
        console.error('Error downloading Excel:', error);
        showNotification('Gagal mengunduh Excel: ' + error.message, 'error');
    } finally {
        btn.innerHTML = origHTML;
        btn.disabled = false;
    }
}

function formatDateExcel(dateString) {
    if (!dateString) return '-';
    try {
        const d = new Date(dateString);
        return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`;
    } catch {
        return dateString;
    }
}
