// form-penilaian-manager.js
// Module untuk mengelola logic form penilaian

const FormPenilaianManager = {
    // Initialize all dropdown event listeners
    initializeDropdownEvents() {
        // Initialize Bootstrap tooltips
        const tooltipTriggerList = document.querySelectorAll('[data-bs-toggle="tooltip"]');
        tooltipTriggerList.forEach(tooltipTriggerEl => {
            new bootstrap.Tooltip(tooltipTriggerEl);
        });

        // Initialize integrity checkbox visual feedback
        const integrityCheckbox = document.getElementById('integrityCheckbox');
        const integritySectionWrapper = document.getElementById('integritySectionWrapper');
        if (integrityCheckbox && integritySectionWrapper) {
            integrityCheckbox.addEventListener('change', function () {
                if (this.checked) {
                    integritySectionWrapper.classList.add('is-checked');
                } else {
                    integritySectionWrapper.classList.remove('is-checked');
                }
                FormPenilaianManager.updateSubmitButton();
            });
        }

        // Vendor change event - load kendaraan and personil
        const vendorSelect = document.getElementById('modalVendor');
        if (vendorSelect) {
            vendorSelect.addEventListener('change', function () {
                const selectedVendor = this.value;

                if (selectedVendor) {
                    // Load kendaraan and personil data
                    if (typeof loadKendaraanData === 'function') {
                        loadKendaraanData(selectedVendor);
                    }
                    if (typeof loadPersonilData === 'function') {
                        loadPersonilData(selectedVendor);
                    }

                    // Load equipment if peruntukan is already selected
                    const selectedPeruntukan = document.getElementById('modalPeruntukan').value;
                    if (selectedPeruntukan && typeof loadEquipmentData === 'function') {
                        loadEquipmentData(selectedVendor, selectedPeruntukan);
                    }
                } else {
                    FormPenilaianManager.clearVendorDependentFields();
                }
            });
        }

        // Peruntukan change event - load equipment with vendor filter
        const peruntukanSelect = document.getElementById('modalPeruntukan');
        if (peruntukanSelect) {
            peruntukanSelect.addEventListener('change', function () {
                const selectedPeruntukan = this.value;
                const selectedVendor = document.getElementById('modalVendor').value;

                if (selectedPeruntukan) {
                    if (selectedVendor && typeof loadEquipmentData === 'function') {
                        loadEquipmentData(selectedVendor, selectedPeruntukan);
                    }
                }
            });
        }
    },

    // Clear vendor-dependent fields
    clearVendorDependentFields() {
        // Clear kendaraan field
        const nopolInput = document.getElementById('modalNopol');
        if (nopolInput && nopolInput.tagName === 'SELECT') {
            nopolInput.outerHTML = '<input type="text" class="form-control form-control-sm" id="modalNopol" placeholder="Nomor Polisi">';
        }

        // Clear personil field
        const petugasInput = document.getElementById('modalPetugas');
        if (petugasInput && petugasInput.tagName === 'SELECT') {
            petugasInput.outerHTML = '<input type="text" class="form-control form-control-sm" id="modalPetugas" placeholder="Nama Petugas" required>';
        }

        // Clear equipment table
        if (typeof clearEquipmentTable === 'function') {
            clearEquipmentTable();
        }
    },

    // Handle realisasi input change
    handleRealisasiChange(input) {
        const equipmentId = input.dataset.equipmentId;
        const realisasi = parseInt(input.value) || 0;
        const row = input.closest('tr');

        // Auto-update layak field if it's still blank/empty
        const layakInput = row.querySelector('.layak-input');
        if (layakInput.value === '' || layakInput.value === null) {
            layakInput.value = realisasi;
        }

        // Auto-update berfungsi field if it's still blank/empty
        const berfungsiInput = row.querySelector('.berfungsi-input');
        if (berfungsiInput.value === '' || berfungsiInput.value === null) {
            berfungsiInput.value = realisasi;
        }

        // Recalculate tidak_layak and tidak_berfungsi based on current values
        const layak = parseInt(layakInput.value) || 0;
        const berfungsi = parseInt(berfungsiInput.value) || 0;

        // Validate: layak and berfungsi cannot exceed realisasi
        if (layak > realisasi) {
            layakInput.value = realisasi;
        }
        if (berfungsi > realisasi) {
            berfungsiInput.value = realisasi;
        }

        // Update tidak_layak and tidak_berfungsi values
        const tidakLayak = realisasi - (parseInt(layakInput.value) || 0);
        const tidakBerfungsi = realisasi - (parseInt(berfungsiInput.value) || 0);
        row.querySelector('.tidak-layak-value').textContent = tidakLayak;
        row.querySelector('.tidak-berfungsi-value').textContent = tidakBerfungsi;

        this.updateProgress();
        this.calculateEquipmentScore(row);
        this.calculateTotalScore();
        this.updateSubmitButton();
    },

    // Handle layak input change
    handleLayakChange(input) {
        const row = input.closest('tr');
        const realisasi = parseInt(row.querySelector('.realisasi-input').value) || 0;
        const layak = parseInt(input.value) || 0;

        // Validate layak <= realisasi
        if (layak > realisasi) {
            input.value = realisasi;
            this.showValidationMessage('Jumlah layak tidak boleh lebih dari realisasi', 'warning');
        }

        // Calculate tidak layak
        const tidakLayak = realisasi - (parseInt(input.value) || 0);
        row.querySelector('.tidak-layak-value').textContent = tidakLayak;

        this.calculateEquipmentScore(row);
        this.calculateTotalScore();
        this.updateSubmitButton();
    },

    // Handle berfungsi input change
    handleBerfungsiChange(input) {
        const row = input.closest('tr');
        const realisasi = parseInt(row.querySelector('.realisasi-input').value) || 0;
        const berfungsi = parseInt(input.value) || 0;

        // Validate berfungsi <= realisasi
        if (berfungsi > realisasi) {
            input.value = realisasi;
            this.showValidationMessage('Jumlah berfungsi tidak boleh lebih dari realisasi', 'warning');
        }

        // Calculate tidak berfungsi
        const tidakBerfungsi = realisasi - (parseInt(input.value) || 0);
        row.querySelector('.tidak-berfungsi-value').textContent = tidakBerfungsi;

        this.calculateEquipmentScore(row);
        this.calculateTotalScore();
        this.updateSubmitButton();
    },

    // Calculate score for individual equipment
    // Formula (skala max 2.00):
    // - kesesuaian_kontrak: realisasi >= volume_per_regu ? 2 : 0
    // - kondisi_fisik: tidak_layak == 0 ? 0 : -1
    // - kondisi_fungsi: tidak_berfungsi == 0 ? 0 : -1
    // - score_item = kesesuaian_kontrak + kondisi_fisik + kondisi_fungsi (range: -2 to 2)
    calculateEquipmentScore(row) {
        const volumePerRegu = parseInt(row.dataset.volumePerRegu) || 0;
        const realisasi = parseInt(row.querySelector('.realisasi-input').value) || 0;
        const tidakLayak = parseInt(row.querySelector('.tidak-layak-value')?.textContent) || 0;
        const tidakBerfungsi = parseInt(row.querySelector('.tidak-berfungsi-value')?.textContent) || 0;

        // Calculate score components
        const kesesuaian_kontrak = (realisasi >= volumePerRegu) ? 2 : 0;
        const kondisi_fisik = (tidakLayak === 0) ? 0 : -1;
        const kondisi_fungsi = (tidakBerfungsi === 0) ? 0 : -1;

        // Calculate total score (range: -2 to 2)
        const score = kesesuaian_kontrak + kondisi_fisik + kondisi_fungsi;

        // Update score display with colored badge
        const scoreEl = row.querySelector('.nilai-equipment');
        scoreEl.textContent = score.toFixed(2);

        // Update badge color based on score
        scoreEl.className = 'badge nilai-equipment ';
        if (score >= 2) {
            scoreEl.className += 'bg-success'; // Perfect
        } else if (score >= 1) {
            scoreEl.className += 'bg-primary'; // Good
        } else if (score >= 0) {
            scoreEl.className += 'bg-warning text-dark'; // Average
        } else {
            scoreEl.className += 'bg-danger'; // Poor
        }

        return score;
    },

    // Calculate total score (average of all equipment scores)
    calculateTotalScore() {
        const equipmentRows = document.querySelectorAll('#equipmentTableBody tr:not(#loadingRow)');
        let totalScore = 0;
        let equipmentCount = 0;

        equipmentRows.forEach(row => {
            if (row.dataset.equipmentId) {
                const scoreText = row.querySelector('.nilai-equipment').textContent;
                const score = parseFloat(scoreText) || 0;
                totalScore += score;
                equipmentCount++;
            }
        });

        // Calculate average score (dalam skala 2.00)
        const averageScore = equipmentCount > 0 ? totalScore / equipmentCount : 0;

        // Update total score display
        document.getElementById('totalScore').textContent = averageScore.toFixed(2);

        return averageScore;
    },

    // Update progress bar
    updateProgress() {
        const equipmentRows = document.querySelectorAll('#equipmentTableBody tr:not(#loadingRow)');
        let totalEquipment = 0;
        let completedEquipment = 0;

        equipmentRows.forEach(row => {
            if (row.dataset.equipmentId) {
                totalEquipment++;

                const realisasiInput = row.querySelector('.realisasi-input');
                const layakInput = row.querySelector('.layak-input');
                const berfungsiInput = row.querySelector('.berfungsi-input');

                // Check if fields are filled (not blank)
                const realisasiFilled = realisasiInput.value !== '';
                const layakFilled = layakInput.value !== '';
                const berfungsiFilled = berfungsiInput.value !== '';

                const realisasi = parseInt(realisasiInput.value) || 0;
                const layak = parseInt(layakInput.value) || 0;
                const berfungsi = parseInt(berfungsiInput.value) || 0;

                // Consider completed if all fields are filled and valid
                // Allow realisasi = 0 (means equipment not available)
                if (realisasiFilled && layakFilled && berfungsiFilled &&
                    layak <= realisasi && berfungsi <= realisasi) {
                    completedEquipment++;
                    row.classList.add('is-complete');
                } else {
                    row.classList.remove('is-complete');
                }
            }
        });

        // Update progress bar
        const progressPercentage = totalEquipment > 0 ? (completedEquipment / totalEquipment) * 100 : 0;
        const progressBar = document.getElementById('progressBar');
        if (progressBar) {
            progressBar.style.width = `${progressPercentage}%`;
            progressBar.setAttribute('aria-valuenow', progressPercentage);

            // Add complete class when 100%
            if (progressPercentage === 100) {
                progressBar.classList.add('complete');
            } else {
                progressBar.classList.remove('complete');
            }
        }

        // Update progress text (simplified format)
        const progressText = document.getElementById('progressText');
        if (progressText) {
            progressText.textContent = `${completedEquipment}/${totalEquipment}`;
        }

        return { total: totalEquipment, completed: completedEquipment, percentage: progressPercentage };
    },

    // Update submit button state
    updateSubmitButton() {
        const progress = this.updateProgress();
        const submitBtn = document.getElementById('submitEvaluationBtn');
        const integrityCheckbox = document.getElementById('integrityCheckbox');
        const isIntegrityChecked = integrityCheckbox ? integrityCheckbox.checked : false;

        const isFormValid = this.validateSessionInfo() && progress.completed === progress.total && progress.total > 0 && isIntegrityChecked;

        if (isFormValid) {
            submitBtn.disabled = false;
            submitBtn.className = 'btn btn-success btn-lg';
            submitBtn.innerHTML = `<i class="bi bi-check-circle"></i> Simpan Penilaian (${progress.completed}/${progress.total})`;
        } else {
            submitBtn.disabled = true;
            submitBtn.className = 'btn btn-secondary btn-lg';

            if (progress.total === 0) {
                submitBtn.innerHTML = `<i class="bi bi-clock"></i> Pilih Peruntukan Dahulu`;
            } else if (!this.validateSessionInfo()) {
                submitBtn.innerHTML = `<i class="bi bi-exclamation-triangle"></i> Lengkapi Info Sesi`;
            } else if (progress.completed !== progress.total) {
                submitBtn.innerHTML = `<i class="bi bi-clock"></i> Lengkapi Penilaian (${progress.completed}/${progress.total})`;
            } else if (!isIntegrityChecked) {
                submitBtn.innerHTML = `<i class="bi bi-check2-square"></i> Centang Pernyataan Integritas`;
            }
        }
    },

    // Validate session information
    validateSessionInfo() {
        const tanggal = document.getElementById('modalTanggal').value;
        const shift = document.getElementById('modalShift').value;
        const unit = document.getElementById('modalUnit').value;
        const vendor = document.getElementById('modalVendor').value;
        const peruntukan = document.getElementById('modalPeruntukan').value;

        // Check petugas - from badge system (window.selectedPetugasIds and window.newPetugasList)
        const hasSelectedPetugas = window.selectedPetugasIds && window.selectedPetugasIds.length > 0;
        const hasNewPetugas = window.newPetugasList && window.newPetugasList.length > 0;
        const hasPetugas = hasSelectedPetugas || hasNewPetugas;

        return tanggal && shift && unit && vendor && peruntukan && hasPetugas;
    },

    // Get form data for submission
    getFormData() {
        // Get selected petugas IDs from badge system
        const selectedPetugasIds = window.selectedPetugasIds || [];
        const newPetugasList = window.newPetugasList || [];

        // Get kendaraan info
        const nopolSelect = document.getElementById('modalNopolSelect');
        const isNewKendaraan = nopolSelect?.value === '__ADD_NEW__';

        const formData = {
            // Session info
            tanggal: document.getElementById('modalTanggal').value,
            shift: document.getElementById('modalShift').value,
            unit_id: document.getElementById('modalUnit').value,
            vendor_id: document.getElementById('modalVendor').value,
            peruntukan_id: document.getElementById('modalPeruntukan').value,

            // Kendaraan info
            team_id: isNewKendaraan ? null : (nopolSelect?.value || null),
            nopol: isNewKendaraan ? document.getElementById('modalNopol')?.value?.trim() : null,
            keterangan: document.getElementById('modalKeterangan')?.value?.trim() || '',
            is_new_kendaraan: isNewKendaraan,

            // Petugas info (multiple)
            personnel_ids: selectedPetugasIds,
            new_petugas_names: newPetugasList,

            // Equipment evaluations
            evaluations: [],

            // Summary
            total_score: parseFloat(document.getElementById('totalScore').textContent) || 0,
            created_at: new Date().toISOString()
        };

        // Collect equipment evaluations
        const equipmentRows = document.querySelectorAll('#equipmentTableBody tr:not(#loadingRow)');
        equipmentRows.forEach(row => {
            if (row.dataset.equipmentId) {
                const evaluation = {
                    peralatan_id: row.dataset.equipmentId,
                    volume_per_regu: parseInt(row.dataset.volumePerRegu) || 0,
                    realisasi: parseInt(row.querySelector('.realisasi-input').value) || 0,
                    layak: parseInt(row.querySelector('.layak-input').value) || 0,
                    tidak_layak: parseInt(row.querySelector('.tidak-layak-value').textContent) || 0,
                    berfungsi: parseInt(row.querySelector('.berfungsi-input').value) || 0,
                    tidak_berfungsi: parseInt(row.querySelector('.tidak-berfungsi-value').textContent) || 0,
                    nilai: parseFloat(row.querySelector('.nilai-equipment').textContent) || 0
                };
                formData.evaluations.push(evaluation);
            }
        });

        return formData;
    },

    // Reset form
    resetForm() {
        // Reset session info
        document.getElementById('modalTanggal').value = new Date().toISOString().split('T')[0];
        document.getElementById('modalShift').value = '';

        // For Unit: Keep locked value for non-UID users
        const unitSelect = document.getElementById('modalUnit');
        const vendorSelect = document.getElementById('modalVendor');
        const profile = window.currentProfile;
        const isNonUIDUser = profile && profile.role && !profile.role.startsWith('uid_');
        const isVendorLockedUser = profile && (profile.role === 'vendor_k3' || profile.role === 'petugas');

        if (isNonUIDUser && profile.unit_code) {
            // Non-UID users: Keep unit locked, reload vendors filtered by unit
            unitSelect.value = profile.unit_code;

            // Reload vendors filtered by user's unit
            if (typeof filterVendorsByUnit === 'function') {
                filterVendorsByUnit(profile.unit_code);
            }
        } else {
            // UID users: Reset unit normally
            unitSelect.value = '';
        }

        // For vendor_k3 and petugas: Keep vendor locked
        if (isVendorLockedUser && profile.vendor_id && vendorSelect) {
            // Keep the vendor value (it's already set and disabled)
            // Just trigger personil reload
            if (typeof loadPersonilData === 'function') {
                loadPersonilData(profile.vendor_id);
            }
        } else {
            // Other roles: Reset vendor
            if (vendorSelect) vendorSelect.value = '';
        }

        document.getElementById('modalJenis').value = '';
        document.getElementById('modalPeruntukan').value = '';

        // Reset kendaraan
        const nopolSelect = document.getElementById('modalNopolSelect');
        if (nopolSelect) nopolSelect.value = '';
        const nopolInput = document.getElementById('modalNopol');
        if (nopolInput) nopolInput.value = '';
        const keteranganInput = document.getElementById('modalKeterangan');
        if (keteranganInput) keteranganInput.value = '';
        const newKendaraanContainer = document.getElementById('newKendaraanContainer');
        if (newKendaraanContainer) newKendaraanContainer.style.display = 'none';

        // Reset petugas
        const petugasSelect = document.getElementById('modalPetugasSelect');
        if (petugasSelect) {
            Array.from(petugasSelect.options).forEach(opt => opt.selected = false);
        }
        const petugasInput = document.getElementById('modalPetugas');
        if (petugasInput) petugasInput.value = '';
        const selectedPetugasContainer = document.getElementById('selectedPetugasContainer');
        if (selectedPetugasContainer) selectedPetugasContainer.innerHTML = '';
        const newPetugasContainer = document.getElementById('newPetugasContainer');
        if (newPetugasContainer) newPetugasContainer.style.display = 'none';

        // Reset global petugas state
        window.selectedPetugasIds = [];
        window.selectedPetugasNames = {};
        window.newPetugasList = [];

        // Reset integrity checkbox
        const integrityCheckbox = document.getElementById('integrityCheckbox');
        if (integrityCheckbox) integrityCheckbox.checked = false;
        const integritySectionWrapper = document.getElementById('integritySectionWrapper');
        if (integritySectionWrapper) integritySectionWrapper.classList.remove('is-checked');

        // Clear equipment table
        const tableBody = document.getElementById('equipmentTableBody');
        tableBody.innerHTML = `
            <tr id="loadingRow">
                <td colspan="10" class="text-center py-5">
                    <div class="d-flex flex-column align-items-center">
                        <div class="bg-light rounded-circle p-4 mb-3">
                            <i class="bi bi-inbox fs-1 text-muted"></i>
                        </div>
                        <h6 class="text-muted mb-2">Belum Ada Data Peralatan</h6>
                        <p class="text-muted mb-0 small">
                            <i class="bi bi-arrow-up me-1"></i>
                            Lengkapi <strong>Informasi Sesi</strong> dan <strong>Detail Peruntukan</strong> di atas
                            <br>untuk memuat daftar peralatan yang akan dinilai
                        </p>
                    </div>
                </td>
            </tr>
        `;

        // Clear equipment accordion for mobile
        const accordion = document.getElementById('equipmentAccordion');
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

        // Reset count badge
        const countBadge = document.getElementById('equipmentCountBadge');
        if (countBadge) countBadge.innerHTML = '<i class="bi bi-box-seam me-1"></i>0 Item';

        // Reset progress bar styling
        const progressBar = document.getElementById('progressBar');
        if (progressBar) progressBar.classList.remove('complete');
        const progressText = document.getElementById('progressText');
        if (progressText) progressText.textContent = '0/0';

        // Reset progress and score
        this.updateProgress();
        this.calculateTotalScore();
        this.updateSubmitButton();
    },

    // Show validation message
    showValidationMessage(message, type = 'info') {
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
    }
};

// Setup form validation listeners
document.addEventListener('DOMContentLoaded', function () {
    // Initialize dropdown events for vendor-based loading
    FormPenilaianManager.initializeDropdownEvents();

    // Session info change listeners
    const sessionFields = ['modalTanggal', 'modalShift', 'modalUnit', 'modalVendor', 'modalPeruntukan', 'modalPetugas'];
    sessionFields.forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
            field.addEventListener('change', () => {
                FormPenilaianManager.updateSubmitButton();
            });

            if (field.tagName === 'INPUT' && field.type === 'text') {
                field.addEventListener('input', () => {
                    FormPenilaianManager.updateSubmitButton();
                });
            }
        }
    });

    // Integrity checkbox listener
    const integrityCheckbox = document.getElementById('integrityCheckbox');
    if (integrityCheckbox) {
        integrityCheckbox.addEventListener('change', () => {
            FormPenilaianManager.updateSubmitButton();
        });
    }

    // Initial button state
    FormPenilaianManager.updateSubmitButton();
});