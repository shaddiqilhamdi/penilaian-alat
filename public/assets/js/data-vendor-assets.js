/**
 * Data Vendor Assets Page
 * Display and filter vendor_assets data
 */

// Global variables
let allAssets = [];
let vendors = [];
let peruntukanList = [];
let currentUserProfile = null;

document.addEventListener('DOMContentLoaded', async function () {
    // Wait for Supabase client
    let retryCount = 0;
    const maxRetries = 10;

    while (retryCount < maxRetries) {
        if (typeof getSupabaseClient !== 'undefined' && typeof getCurrentUserWithProfile !== 'undefined') {
            break;
        }
        await new Promise(resolve => setTimeout(resolve, 300));
        retryCount++;
    }

    if (retryCount >= maxRetries) {
        console.error('Supabase client not available');
        return;
    }

    // Check authentication
    await checkAuth();

    // Load initial data
    await Promise.all([
        loadVendors(),
        loadPeruntukan(),
        loadAllAssets()
    ]);

    // Setup logout
    setupLogout();
});

// Check authentication
async function checkAuth() {
    try {
        const client = getSupabaseClient();
        const { data: { session } } = await client.auth.getSession();

        if (!session) {
            window.location.href = 'pages-login.html';
            return;
        }

        // Load profile for navbar
        const userWithProfile = await getCurrentUserWithProfile();
        if (userWithProfile?.profile) {
            currentUserProfile = userWithProfile.profile;
            updateNavbar(userWithProfile.profile);
        }
    } catch (error) {
        console.error('Auth check error:', error);
        window.location.href = 'pages-login.html';
    }
}

// Update navbar with user info
function updateNavbar(profile) {
    const fullName = profile.nama_lengkap || profile.nama || profile.email?.split('@')[0] || 'User';
    const firstName = fullName.split(' ')[0];
    const initial = firstName.charAt(0).toUpperCase();

    const roleLabels = {
        uid_admin: 'UID Admin',
        uid_user: 'UID User',
        up3_admin: 'UP3 Admin',
        up3_user: 'UP3 User',
        vendor_k3: 'Vendor K3',
        petugas: 'Petugas'
    };
    const roleLabel = roleLabels[profile.role] || profile.role;

    document.getElementById('navProfileInitial').textContent = initial;
    document.getElementById('navProfileName').textContent = firstName;
    document.getElementById('navProfileFullName').textContent = fullName;
    document.getElementById('navProfileRole').textContent = roleLabel;
}

// Load vendors for filter dropdown
async function loadVendors() {
    try {
        const result = await VendorsAPI.getAll();
        if (result.success && result.data) {
            vendors = result.data;

            // Filter by unit_code for UP3 users
            if (currentUserProfile) {
                const role = currentUserProfile.role;
                const unitCode = currentUserProfile.unit_code;

                if ((role === 'up3_admin' || role === 'up3_user') && unitCode) {
                    vendors = vendors.filter(v => v.unit_code === unitCode);
                }
            }

            // Sort by unit_code then vendor_name
            vendors.sort((a, b) => {
                const unitCompare = (a.unit_code || '').localeCompare(b.unit_code || '');
                if (unitCompare !== 0) return unitCompare;
                return (a.vendor_name || '').localeCompare(b.vendor_name || '');
            });
            const select = document.getElementById('filterVendor');
            select.innerHTML = '<option value="">Semua Vendor</option>';
            vendors.forEach(v => {
                select.innerHTML += `<option value="${v.id}">${v.unit_code} - ${v.vendor_name}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading vendors:', error);
    }
}

// Load peruntukan for filter dropdown
async function loadPeruntukan() {
    try {
        const result = await PeruntukanAPI.getAll();
        if (result.success && result.data) {
            peruntukanList = result.data;
            const select = document.getElementById('filterPeruntukan');
            select.innerHTML = '<option value="">Semua Peruntukan</option>';
            peruntukanList.forEach(p => {
                select.innerHTML += `<option value="${p.id}">${p.deskripsi || p.jenis}</option>`;
            });
        }
    } catch (error) {
        console.error('Error loading peruntukan:', error);
    }
}

// Load all vendor assets
async function loadAllAssets() {
    showLoading();

    try {
        const result = await VendorAssetsAPI.getAll();

        if (!result.success) {
            throw new Error(result.error || 'Failed to load assets');
        }

        let assets = result.data || [];

        // Filter by unit_code for UP3 users
        if (currentUserProfile) {
            const role = currentUserProfile.role;
            const unitCode = currentUserProfile.unit_code;

            if ((role === 'up3_admin' || role === 'up3_user') && unitCode) {
                assets = assets.filter(a => a.vendors?.unit_code === unitCode);
            }
        }

        allAssets = assets;
        renderAssets(allAssets);

    } catch (error) {
        console.error('Error loading assets:', error);
        showEmpty();
    }
}

// Render assets table
function renderAssets(assets) {
    const tbody = document.getElementById('assetsTableBody');
    const tableContainer = document.getElementById('tableContainer');
    const loadingState = document.getElementById('loadingState');
    const emptyState = document.getElementById('emptyState');

    loadingState.style.display = 'none';

    if (!assets || assets.length === 0) {
        tableContainer.style.display = 'none';
        emptyState.style.display = 'block';
        return;
    }

    emptyState.style.display = 'none';
    tableContainer.style.display = 'block';

    tbody.innerHTML = assets.map((asset, index) => {
        const vendorName = asset.vendors?.vendor_name || '-';
        const peruntukanName = asset.peruntukan?.deskripsi || asset.peruntukan?.jenis || '-';
        const equipmentName = asset.equipment_master?.nama_alat || '-';
        const teamInfo = asset.teams?.nomor_polisi || asset.personnel?.nama_personil || '-';

        // Scores
        const fisik = asset.kondisi_fisik;
        const fungsi = asset.kondisi_fungsi;
        const kontrak = asset.kesesuaian_kontrak;

        // Score badges
        const fisikBadge = fisik === 0
            ? '<span class="badge bg-success">Layak</span>'
            : '<span class="badge bg-danger">TL</span>';
        const fungsiBadge = fungsi === 0
            ? '<span class="badge bg-success">Baik</span>'
            : '<span class="badge bg-warning">TB</span>';
        const kontrakBadge = kontrak === 2
            ? '<span class="badge bg-success">Sesuai</span>'
            : '<span class="badge bg-danger">Tidak</span>';

        // Last assessment date
        const lastDate = asset.last_assessment_date
            ? formatDate(asset.last_assessment_date)
            : '-';

        return `
            <tr>
                <td>${index + 1}</td>
                <td>${vendorName}</td>
                <td>${peruntukanName}</td>
                <td>${teamInfo}</td>
                <td>${equipmentName}</td>
                <td class="text-center">${asset.realisasi_qty || 0}</td>
                <td class="text-center">${fisikBadge}</td>
                <td class="text-center">${fungsiBadge}</td>
                <td class="text-center">${kontrakBadge}</td>
                <td><small>${lastDate}</small></td>
            </tr>
        `;
    }).join('');
}

// Apply filters
function applyFilters() {
    const vendorId = document.getElementById('filterVendor').value;
    const peruntukanId = document.getElementById('filterPeruntukan').value;
    const kondisi = document.getElementById('filterKondisi').value;

    let filtered = [...allAssets];

    if (vendorId) {
        filtered = filtered.filter(a => a.vendor_id === vendorId);
    }

    if (peruntukanId) {
        filtered = filtered.filter(a => a.peruntukan_id === peruntukanId);
    }

    if (kondisi) {
        filtered = filtered.filter(a => {
            const fisik = a.kondisi_fisik ?? 0;
            const fungsi = a.kondisi_fungsi ?? 0;
            if (kondisi === 'good') return fisik === 0 && fungsi === 0;
            if (kondisi === 'warning') return fisik === 0 && fungsi === -1;
            if (kondisi === 'bad') return fisik === -1;
            return true;
        });
    }

    renderAssets(filtered);
}

// Clear filters
function clearFilters() {
    document.getElementById('filterVendor').value = '';
    document.getElementById('filterPeruntukan').value = '';
    document.getElementById('filterKondisi').value = '';
    renderAssets(allAssets);
}

// Show loading state
function showLoading() {
    document.getElementById('loadingState').style.display = 'block';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'none';
}

// Show empty state
function showEmpty() {
    document.getElementById('loadingState').style.display = 'none';
    document.getElementById('tableContainer').style.display = 'none';
    document.getElementById('emptyState').style.display = 'block';
}

// Format date
function formatDate(dateString) {
    if (!dateString) return '-';
    try {
        const date = new Date(dateString);
        const day = String(date.getDate()).padStart(2, '0');
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const year = date.getFullYear();
        const hours = String(date.getHours()).padStart(2, '0');
        const minutes = String(date.getMinutes()).padStart(2, '0');
        return `${day}-${month}-${year} ${hours}:${minutes}`;
    } catch {
        return dateString;
    }
}

// Setup logout button
function setupLogout() {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', async function (e) {
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
                    // ignore
                }
                window.location.href = 'pages-login.html';
            }
        });
    }
}
