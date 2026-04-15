// form-penilaian-submit.js
// Module untuk submission form penilaian

document.addEventListener('DOMContentLoaded', function () {
    const submitBtn = document.getElementById('submitEvaluationBtn');
    const loadingIndicator = document.getElementById('submitLoadingIndicator');

    if (submitBtn) {
        submitBtn.addEventListener('click', handleFormSubmission);
    }
});

// Handle form submission
async function handleFormSubmission(event) {
    event.preventDefault();

    const submitBtn = document.getElementById('submitEvaluationBtn');
    const loadingIndicator = document.getElementById('submitLoadingIndicator');

    try {
        // Validate form data
        if (!FormPenilaianManager.validateSessionInfo()) {
            // Check specific reason
            if (FormPenilaianManager.hasKendaraanEquipment()) {
                const nopolSelect = document.getElementById('modalNopolSelect');
                const teamIdInput = document.getElementById('modalTeamId');
                const hasNopol = (nopolSelect?.value && nopolSelect.value !== '' && nopolSelect.value !== '__ADD_NEW__') || (teamIdInput?.value && teamIdInput.value !== '');
                if (!hasNopol) {
                    FormPenilaianManager.showValidationMessage('Peruntukan ini memiliki item Kendaraan. Mohon pilih Nomor Polisi terlebih dahulu.', 'warning');
                    return;
                }
            }
            FormPenilaianManager.showValidationMessage('Mohon lengkapi semua informasi sesi penilaian', 'warning');
            return;
        }

        const progress = FormPenilaianManager.updateProgress();
        if (progress.completed !== progress.total || progress.total === 0) {
            FormPenilaianManager.showValidationMessage('Mohon lengkapi semua penilaian peralatan', 'warning');
            return;
        }

        // Validate integrity checkbox
        const integrityCheckbox = document.getElementById('integrityCheckbox');
        if (!integrityCheckbox || !integrityCheckbox.checked) {
            FormPenilaianManager.showValidationMessage('Mohon centang pernyataan integritas sebelum menyimpan', 'warning');
            return;
        }

        // Show loading state
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="bi bi-hourglass-split"></i> Menyimpan...';
        loadingIndicator.style.display = 'block';

        // Get form data
        const formData = FormPenilaianManager.getFormData();

        // ========== GET TEAM (KENDARAAN) - dari dropdown atau modal ==========
        const nopolSelect = document.getElementById('modalNopolSelect');
        const teamIdInput = document.getElementById('modalTeamId');
        const nopolBadge = document.getElementById('nopolBadge');

        // Priority: 1) nopolSelect.value (existing), 2) teamIdInput.value (newly created)
        let teamId = nopolSelect?.value || teamIdInput?.value || null;

        // Note: Kendaraan baru sudah dibuat di modal dan disimpan ke database
        // teamId sudah diambil dari dropdown atau hidden input di atas
        // Tidak perlu create lagi di sini

        // ========== GET PERSONNEL (PETUGAS) - dari badge system ==========
        // Menggunakan window.selectedPetugasIds dan window.newPetugasList
        let personnelIds = [];

        // Get IDs from existing selected petugas (dari dropdown)
        if (window.selectedPetugasIds && window.selectedPetugasIds.length > 0) {
            personnelIds = [...window.selectedPetugasIds];
        }

        // Get IDs from newly added petugas (dari modal tambah petugas)
        if (window.newPetugasList && window.newPetugasList.length > 0) {
            const newIds = window.newPetugasList.filter(p => p.id).map(p => p.id);
            personnelIds = [...new Set([...personnelIds, ...newIds])];
        }

        // For backward compatibility with single personnel_id (first one)
        const personnelId = personnelIds.length > 0 ? personnelIds[0] : null;

        // Prepare items for edge function
        const items = formData.evaluations.map(eval => ({
            equipment_id: eval.peralatan_id,
            required_qty: eval.volume_per_regu,
            actual_qty: eval.realisasi,
            layak: eval.layak,
            tidak_layak: eval.tidak_layak,
            berfungsi: eval.berfungsi,
            tidak_berfungsi: eval.tidak_berfungsi
        }));

        // Prepare request payload for edge function
        const requestPayload = {
            tanggal_penilaian: formData.tanggal,
            shift: formData.shift,
            vendor_id: formData.vendor_id,
            peruntukan_id: formData.peruntukan_id,
            team_id: teamId || null,
            personnel_id: personnelId || null,        // Single personnel (backward compatibility)
            personnel_ids: personnelIds || [],        // All personnel for regu
            assessor_id: currentUser?.id,
            items: items,
            jumlah_item_peralatan: items.length,
            total_score: formData.total_score
        };

        // Call edge function for atomic transaction
        const result = await submitPenilaianEdgeFunction(requestPayload);

        if (!result.success) {
            throw new Error(result.error || 'Gagal menyimpan data');
        }

        // Show success message
        showSuccessModal(result.data.assessment);

        // Reset form and global state
        window.equipmentDataSource = null;
        window.currentEquipmentData = null;
        window.vendorAssetsMap = null;
        FormPenilaianManager.resetForm();

    } catch (error) {
        console.error('Form submission error:', error);

        let errorMessage = 'Terjadi kesalahan saat menyimpan data penilaian';

        if (error.message) {
            errorMessage += ': ' + error.message;
        }

        FormPenilaianManager.showValidationMessage(errorMessage, 'error');

    } finally {
        // Hide loading state
        loadingIndicator.style.display = 'none';
        FormPenilaianManager.updateSubmitButton();
    }
}

// Show success modal
function showSuccessModal(result) {
    // Get tanggal from form input
    const tanggalValue = document.getElementById('modalTanggal')?.value || '';

    // Get petugas names from the badge system (window.selectedPetugasNames and window.newPetugasList)
    let petugasNames = '';
    const selectedNames = [];

    // Get names from existing selected petugas
    if (window.selectedPetugasNames) {
        Object.values(window.selectedPetugasNames).forEach(name => {
            if (name) selectedNames.push(name);
        });
    }

    // Get names from newly added petugas
    if (window.newPetugasList && window.newPetugasList.length > 0) {
        window.newPetugasList.forEach(petugas => {
            if (petugas.name) selectedNames.push(petugas.name);
        });
    }

    petugasNames = selectedNames.length > 0 ? selectedNames.join(', ') : 'N/A';

    // Create success modal
    const modalHtml = `
        <div class="modal fade" id="successModal" tabindex="-1" aria-labelledby="successModalLabel" aria-hidden="true">
            <div class="modal-dialog modal-dialog-centered">
                <div class="modal-content">
                    <div class="modal-header bg-success text-white">
                        <h5 class="modal-title" id="successModalLabel">
                            <i class="bi bi-check-circle me-2"></i>Penilaian Berhasil Disimpan
                        </h5>
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal" aria-label="Close"></button>
                    </div>
                    <div class="modal-body">
                        <div class="text-center mb-3">
                            <i class="bi bi-check-circle-fill text-success" style="font-size: 4rem;"></i>
                        </div>
                        <div class="alert alert-success">
                            <h6 class="alert-heading">Data penilaian berhasil disimpan!</h6>
                            <p class="mb-2">
                                <strong>ID Penilaian:</strong> ${result.id || 'N/A'}<br>
                                <strong>Total Skor:</strong> ${result.total_score?.toFixed(2) || '0.00'}<br>
                                <strong>Tanggal:</strong> ${formatDate(tanggalValue) || formatDate(result.tanggal_penilaian) || 'N/A'}<br>
                                <strong>Petugas:</strong> ${petugasNames || 'N/A'}
                            </p>
                        </div>
                        <div class="text-muted">
                            <small>Anda dapat melanjutkan untuk melakukan penilaian berikutnya atau melihat hasil penilaian di halaman data penilaian.</small>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">
                            <i class="bi bi-arrow-left me-1"></i>Tutup
                        </button>
                        <button type="button" class="btn btn-primary btn-lihat-data-penilaian" onclick="goToDataPenilaian()">
                            <i class="bi bi-table me-1"></i>Lihat Data Penilaian
                        </button>
                        <button type="button" class="btn btn-success" data-bs-dismiss="modal" onclick="startNewAssessment()">
                            <i class="bi bi-plus-circle me-1"></i>Penilaian Baru
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;

    // Remove existing modal if any
    const existingModal = document.getElementById('successModal');
    if (existingModal) {
        existingModal.remove();
    }

    // Add modal to DOM
    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('successModal'));
    modal.show();

    // Clean up modal after hide
    document.getElementById('successModal').addEventListener('hidden.bs.modal', function () {
        this.remove();
    });
}

// Navigate to data penilaian page
function goToDataPenilaian() {
    window.location.href = 'forms-data-penilaian.html';
}

// Start new assessment
function startNewAssessment() {
    // Modal will close automatically, form is already reset
    FormPenilaianManager.showValidationMessage('Form siap untuk penilaian baru', 'success');
}

// Format date for display
function formatDate(dateString) {
    if (!dateString) return '';

    try {
        const date = new Date(dateString);
        return date.toLocaleDateString('id-ID', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
    } catch (error) {
        return dateString;
    }
}

// ========== EDGE FUNCTION HELPER ==========
// Submit penilaian via Supabase Edge Function for atomic transaction
async function submitPenilaianEdgeFunction(payload) {
    const client = getSupabaseClient();

    async function doInvoke() {
        return await client.functions.invoke('submit-penilaian', { body: payload });
    }

    try {
        let { data, error } = await doInvoke();

        // If 401, force-refresh session and retry once
        if (error && error.context?.status === 401) {
            console.warn('[submit] Got 401, attempting session refresh...');
            const { data: refreshed, error: refreshError } = await client.auth.refreshSession();
            if (refreshError || !refreshed?.session) {
                console.error('[submit] Session refresh failed:', refreshError?.message);
                return { success: false, error: 'Sesi Anda telah berakhir. Silakan logout lalu login kembali.' };
            }
            console.log('[submit] Session refreshed, retrying...');
            ({ data, error } = await doInvoke());
        }

        if (error) {
            const status = error.context?.status;
            // Log full error body for diagnostics
            try {
                const body = await error.context?.clone()?.json();
                console.error('[submit] Edge function error - status:', status, 'body:', body);
            } catch (_) {
                console.error('[submit] Edge function error - status:', status, error.message);
            }
            if (status === 401) {
                return { success: false, error: 'Autentikasi gagal. Silakan logout lalu login kembali.' };
            }
            if (status === 403) {
                return { success: false, error: 'Anda tidak memiliki izin untuk submit penilaian ini.' };
            }
            return { success: false, error: error.message || 'Edge Function error' };
        }

        return data;
    } catch (err) {
        console.error('[submit] Submit penilaian error:', err);
        return { success: false, error: err.message };
    }
}

// Export functions for global access
window.FormSubmissionHandler = {
    handleFormSubmission,
    showSuccessModal,
    goToDataPenilaian,
    startNewAssessment,
    submitPenilaianEdgeFunction
};