/**
 * Users Tambah Pengguna Page - Add New User
 * Requires: supabase-client.js, API modules (profiles.js, units.js, vendors.js)
 */

// Role definitions with permissions
const ROLE_PERMISSIONS = {
    uid_admin: ['uid_admin', 'uid_user', 'up3_admin', 'up3_user', 'vendor_k3'],
    uid_user: ['uid_user', 'up3_admin', 'up3_user', 'vendor_k3'],
    up3_admin: ['up3_user', 'vendor_k3'],
    up3_user: ['vendor_k3'],
    vendor_k3: [] // vendor_k3 cannot add users
};

const ROLE_LABELS = {
    uid_admin: 'UID Admin',
    uid_user: 'UID User',
    up3_admin: 'UP3 Admin',
    up3_user: 'UP3 User',
    vendor_k3: 'Vendor K3'
};

// Global variables
let currentUser = null;
let currentProfile = null;
let unitsList = [];
let vendorsList = [];

// Initialize page
document.addEventListener('DOMContentLoaded', async () => {
    await checkAuthAndInitialize();
});

// Check authentication and initialize form
async function checkAuthAndInitialize() {
    try {
        showLoading(true);

        // Get current user
        currentUser = await getCurrentUser();

        if (!currentUser) {
            window.location.href = 'pages-login.html';
            return;
        }

        // Get current profile with relations
        const profileResult = await ProfilesAPI.getById(currentUser.id);

        if (!profileResult.success) {
            showAlert('error', 'Gagal memuat profil pengguna: ' + (profileResult.error || 'Unknown error'));
            return;
        }

        currentProfile = profileResult.data;

        // Save role to localStorage for CSS-based menu visibility
        if (typeof saveUserRoleToStorage === 'function') {
            saveUserRoleToStorage(currentProfile);
        }

        // Check if user has permission to add users
        const allowedRoles = Object.keys(ROLE_PERMISSIONS).filter(role =>
            ROLE_PERMISSIONS[role].length > 0
        );

        if (!allowedRoles.includes(currentProfile.role)) {
            showAlert('error', 'Anda tidak memiliki akses untuk menambah pengguna');
            setTimeout(() => {
                window.location.href = 'users-data-pengguna.html';
            }, 2000);
            return;
        }

        // Load data and setup form
        await loadUnits();
        await loadVendors();
        setupRoleDropdown();
        setupFormHandlers();
        updateNavbarProfile();

        showLoading(false);

    } catch (error) {
        showAlert('error', 'Terjadi kesalahan saat memuat halaman: ' + error.message);
        showLoading(false);
    }
}

// Load units from database
async function loadUnits() {
    const result = await UnitsAPI.getAll();
    if (result.success) {
        unitsList = result.data || [];
        populateUnitDropdown();
    } else {
        showAlert('warning', 'Gagal memuat data unit');
    }
}

// Populate unit dropdown
function populateUnitDropdown() {
    const unitSelect = document.getElementById('unit_code');
    if (!unitSelect) return;

    unitSelect.innerHTML = '<option value="">Pilih Unit</option>';

    unitsList.forEach(unit => {
        const option = document.createElement('option');
        option.value = unit.unit_code;
        option.textContent = `${unit.unit_name} (${unit.unit_tipe})`;
        unitSelect.appendChild(option);
    });
}

// Load vendors from database
async function loadVendors() {
    const result = await VendorsAPI.getAll();
    if (result.success) {
        vendorsList = result.data || [];
        populateVendorDropdown();
    } else {
        showAlert('warning', 'Gagal memuat data vendor');
    }
}

// Populate vendor dropdown
function populateVendorDropdown() {
    const vendorSelect = document.getElementById('vendor_id');
    if (!vendorSelect) return;

    vendorSelect.innerHTML = '<option value="">Pilih Vendor</option>';

    vendorsList.forEach(vendor => {
        const option = document.createElement('option');
        option.value = vendor.id;
        option.textContent = `${vendor.vendor_name} (${vendor.unit_name})`;
        vendorSelect.appendChild(option);
    });
}

// Setup role dropdown based on current user permissions
function setupRoleDropdown() {
    const roleSelect = document.getElementById('role');
    if (!roleSelect) return;

    const allowedRoles = ROLE_PERMISSIONS[currentProfile.role] || [];

    roleSelect.innerHTML = '<option value="">Pilih Role</option>';

    allowedRoles.forEach(roleValue => {
        const option = document.createElement('option');
        option.value = roleValue;
        option.textContent = ROLE_LABELS[roleValue];
        roleSelect.appendChild(option);
    });
}

// Setup form event handlers
function setupFormHandlers() {
    const form = document.getElementById('addUserForm');
    const roleSelect = document.getElementById('role');
    const passwordInput = document.getElementById('password');
    const confirmPasswordInput = document.getElementById('confirmPassword');

    // Handle role change to show/hide vendor field
    if (roleSelect) {
        roleSelect.addEventListener('change', (e) => {
            handleRoleChange(e.target.value);
        });
    }

    // Password confirmation validation
    if (confirmPasswordInput) {
        confirmPasswordInput.addEventListener('input', () => {
            validatePasswordMatch();
        });
    }

    if (passwordInput) {
        passwordInput.addEventListener('input', () => {
            validatePasswordMatch();
        });
    }

    // Form submit handler
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            e.stopPropagation();

            // Validate form
            if (!form.checkValidity()) {
                form.classList.add('was-validated');
                return;
            }

            // Validate password match
            if (!validatePasswordMatch()) {
                return;
            }

            await handleFormSubmit(form);
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
                    console.error('Logout error:', error);
                }
                window.location.href = 'pages-login.html';
            }
        });
    }
}

// Handle role change to show/hide vendor field
function handleRoleChange(selectedRole) {
    const vendorFieldContainer = document.getElementById('vendorFieldContainer');
    const vendorSelect = document.getElementById('vendor_id');

    if (selectedRole === 'vendor_k3') {
        vendorFieldContainer.style.display = 'block';
        vendorSelect.setAttribute('required', 'required');
    } else {
        vendorFieldContainer.style.display = 'none';
        vendorSelect.removeAttribute('required');
        vendorSelect.value = '';
    }
}

// Validate password match
function validatePasswordMatch() {
    const password = document.getElementById('password').value;
    const confirmPassword = document.getElementById('confirmPassword').value;
    const confirmInput = document.getElementById('confirmPassword');

    if (confirmPassword && password !== confirmPassword) {
        confirmInput.setCustomValidity('Password tidak sama');
        confirmInput.classList.add('is-invalid');
        return false;
    } else {
        confirmInput.setCustomValidity('');
        confirmInput.classList.remove('is-invalid');
        return true;
    }
}

// Handle form submission
async function handleFormSubmit(form) {
    try {
        const submitBtn = document.getElementById('btnSubmit');
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span class="spinner-border spinner-border-sm me-2"></span>Menyimpan...';

        // Get form data
        const formData = new FormData(form);
        const userData = {
            email: formData.get('email'),
            password: formData.get('password'),
            nama: formData.get('nama'),
            nip: formData.get('nip'),
            unit_code: formData.get('unit_code'),
            bidang: formData.get('bidang') || null,
            sub_bidang: formData.get('sub_bidang') || null,
            jabatan: formData.get('jabatan'),
            role: formData.get('role'),
            vendor_id: formData.get('vendor_id') || null
        };

        // Get supabase client
        const supabase = getSupabaseClient();

        // Save current admin session before creating new user
        const { data: currentSession } = await supabase.auth.getSession();
        const adminSession = currentSession.session;

        // Create auth user (this will auto-login the new user)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: userData.email,
            password: userData.password,
            options: {
                data: {
                    nama: userData.nama,
                    nip: userData.nip
                }
            }
        });

        if (authError) {
            throw new Error(`Gagal membuat akun: ${authError.message}`);
        }

        // Create profile record
        const profileData = {
            id: authData.user.id,
            email: userData.email,
            nama: userData.nama,
            nip: userData.nip,
            unit_code: userData.unit_code,
            bidang: userData.bidang,
            sub_bidang: userData.sub_bidang,
            jabatan: userData.jabatan,
            role: userData.role,
            vendor_id: userData.vendor_id
        };

        const profileResult = await ProfilesAPI.upsert(profileData);

        if (!profileResult.success) {
            throw new Error(`Gagal membuat profil: ${profileResult.error}`);
        }

        // Restore admin session - important to keep admin logged in
        if (adminSession) {
            await supabase.auth.setSession({
                access_token: adminSession.access_token,
                refresh_token: adminSession.refresh_token
            });
        }

        showAlert('success', 'Pengguna berhasil ditambahkan!');

        // Reset form and redirect after 2 seconds
        form.reset();
        form.classList.remove('was-validated');

        setTimeout(() => {
            window.location.href = 'users-data-pengguna.html';
        }, 2000);

    } catch (error) {
        showAlert('error', error.message || 'Gagal menambahkan pengguna');

        const submitBtn = document.getElementById('btnSubmit');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="bi bi-check-circle me-1"></i>Simpan Pengguna';
    }
}

// Show/hide loading spinner
function showLoading(show) {
    const loadingDiv = document.getElementById('loadingForm');
    const form = document.getElementById('addUserForm');

    if (loadingDiv) {
        loadingDiv.style.display = show ? 'flex' : 'none';
    }

    if (form) {
        form.style.display = show ? 'none' : 'block';
    }
}

// Show alert message
function showAlert(type, message) {
    const alertContainer = document.getElementById('alertContainer');
    if (!alertContainer) return;

    const alertClass = type === 'success' ? 'alert-success' :
        type === 'error' ? 'alert-danger' : 'alert-warning';

    const iconClass = type === 'success' ? 'bi-check-circle-fill' :
        type === 'error' ? 'bi-exclamation-triangle-fill' : 'bi-info-circle-fill';

    const alertHtml = `
        <div class="alert ${alertClass} alert-dismissible fade show" role="alert">
            <i class="bi ${iconClass} me-2"></i>
            ${message}
            <button type="button" class="btn-close" data-bs-dismiss="alert" aria-label="Close"></button>
        </div>
    `;

    alertContainer.innerHTML = alertHtml;

    // Auto dismiss after 5 seconds
    setTimeout(() => {
        const alertElement = alertContainer.querySelector('.alert');
        if (alertElement) {
            alertElement.classList.remove('show');
            setTimeout(() => {
                alertContainer.innerHTML = '';
            }, 150);
        }
    }, 5000);
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
