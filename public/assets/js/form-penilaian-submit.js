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
        console.log('Submitting form data:', formData);

        // ========== GET TEAM (KENDARAAN) - dari dropdown atau modal ==========
        const nopolSelect = document.getElementById('modalNopolSelect');
        const teamIdInput = document.getElementById('modalTeamId');
        const nopolBadge = document.getElementById('nopolBadge');

        // Priority: 1) nopolSelect.value (existing), 2) teamIdInput.value (newly created)
        let teamId = nopolSelect?.value || teamIdInput?.value || null;
        console.log('🚗 Team/Kendaraan - nopolSelect.value:', nopolSelect?.value, ', teamIdInput.value:', teamIdInput?.value, '-> teamId:', teamId);

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

        // Untuk vendor_assets, simpan personnel pertama (atau null)
        const personnelId = personnelIds.length > 0 ? personnelIds[0] : null;
        console.log('👤 Personnel/Petugas - selected:', personnelIds, '-> personnelId:', personnelId);

        // Check if data came from equipment_standards (needs to be upserted to vendor_assets)
        const dataSource = window.equipmentDataSource || 'equipment_standards';
        const vendorAssetsMap = window.vendorAssetsMap || new Map();
        console.log(`Data source: ${dataSource}, existing vendor_assets: ${vendorAssetsMap.size}`);

        // Prepare assessment data for API
        const assessmentData = {
            tanggal_penilaian: formData.tanggal,
            shift: formData.shift,
            vendor_id: formData.vendor_id,
            peruntukan_id: formData.peruntukan_id,
            team_id: teamId || null,
            personnel_id: personnelId || null,
            assessor_id: currentUser?.id,
            jumlah_item_peralatan: formData.evaluations.length,
            jumlah_peralatan_layak: formData.evaluations.reduce((sum, e) => sum + e.layak, 0),
            jumlah_peralatan_tidak_layak: formData.evaluations.reduce((sum, e) => sum + e.tidak_layak, 0),
            jumlah_peralatan_berfungsi: formData.evaluations.reduce((sum, e) => sum + e.berfungsi, 0),
            jumlah_peralatan_tidak_berfungsi: formData.evaluations.reduce((sum, e) => sum + e.tidak_berfungsi, 0),
            total_score: formData.total_score,
            status: 'Submitted'
        };

        // Prepare assessment items
        // Note: kesesuaian_kontrak, kondisi_fisik, kondisi_fungsi, and score_item 
        // are generated columns in the database - they will be calculated automatically
        const assessmentItems = formData.evaluations.map(eval => {
            return {
                equipment_id: eval.peralatan_id,
                required_qty: eval.volume_per_regu,
                actual_qty: eval.realisasi,
                layak: eval.layak,
                tidak_layak: eval.tidak_layak,
                berfungsi: eval.berfungsi,
                tidak_berfungsi: eval.tidak_berfungsi
                // Generated columns (calculated by database):
                // - kesesuaian_kontrak: actual_qty >= required_qty ? 2 : 0
                // - kondisi_fisik: tidak_layak = 0 ? 0 : -1
                // - kondisi_fungsi: tidak_berfungsi = 0 ? 0 : -1
                // - score_item: kesesuaian_kontrak + kondisi_fisik + kondisi_fungsi
            };
        });

        // Step 1: Submit assessment first to get assessment ID
        const result = await AssessmentsAPI.createWithItems(assessmentData, assessmentItems);
        console.log('Assessment submission result:', result);

        if (!result.success) {
            throw new Error(result.error || 'Gagal menyimpan data');
        }

        // Step 2: Upsert vendor_assets (insert new or update existing)
        if (typeof VendorAssetsAPI !== 'undefined' && result.data && result.items) {
            console.log('📦 Processing vendor_assets upsert...');
            console.log('📦 vendor_id:', formData.vendor_id);
            console.log('📦 peruntukan_id:', formData.peruntukan_id);
            console.log('📦 team_id:', teamId);
            console.log('📦 personnel_id:', personnelId);

            for (const item of result.items) {
                try {
                    const existingAsset = vendorAssetsMap.get(item.equipment_id);

                    // Calculate scores for vendor_assets
                    const kesesuaianKontrak = item.actual_qty >= item.required_qty ? 2 : 0;
                    const kondisiFisik = item.tidak_layak === 0 ? 0 : -1;
                    const kondisiFungsi = item.tidak_berfungsi === 0 ? 0 : -1;
                    const scoreItem = kesesuaianKontrak + kondisiFisik + kondisiFungsi;

                    const assetData = {
                        vendor_id: formData.vendor_id,
                        equipment_id: item.equipment_id,
                        peruntukan_id: formData.peruntukan_id,
                        team_id: teamId || null,
                        personnel_id: personnelId || null,
                        realisasi_qty: item.actual_qty,
                        distribution_date: formData.tanggal,
                        last_assessment_id: result.data.id,
                        last_assessment_date: new Date().toISOString(),
                        kesesuaian_kontrak: kesesuaianKontrak,
                        kondisi_fisik: kondisiFisik,
                        kondisi_fungsi: kondisiFungsi,
                        nilai: scoreItem,
                        status_kesesuaian: item.actual_qty >= item.required_qty ? 'Sesuai' : 'Tidak Sesuai'
                    };

                    if (existingAsset) {
                        // Update existing vendor_asset
                        console.log('📦 Updating vendor_asset:', existingAsset.id, 'with data:', assetData);
                        await VendorAssetsAPI.update(existingAsset.id, assetData);
                        console.log(`✅ Updated vendor_asset for equipment ${item.equipment_id}`);
                    } else {
                        // Create new vendor_asset
                        console.log('📦 Creating new vendor_asset with data:', assetData);
                        await VendorAssetsAPI.create(assetData);
                        console.log(`✅ Created new vendor_asset for equipment ${item.equipment_id}`);
                    }
                } catch (assetError) {
                    console.warn('Failed to upsert vendor_asset:', assetError);
                    // Continue with other items even if one fails
                }
            }
        }

        // Show success message
        showSuccessModal(result.data);

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
                        <button type="button" class="btn btn-primary" onclick="goToDataPenilaian()">
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

// Export functions for global access
window.FormSubmissionHandler = {
    handleFormSubmission,
    showSuccessModal,
    goToDataPenilaian,
    startNewAssessment
};