// form-penilaian-mobile.js
// Mobile-optimized equipment assessment with card-based status buttons + stepper inputs
// Works alongside form-penilaian-manager.js, form-penilaian-load.js, form-penilaian-submit.js

(function () {
    'use strict';

    // =========================================================================
    // STATE
    // =========================================================================
    let currentStep = 1;
    const totalSteps = 4;

    // Per-equipment card state: { equipmentId: { status, realisasi, layak, berfungsi } }
    const cardStates = new Map();

    // =========================================================================
    // INITIALIZATION
    // =========================================================================
    document.addEventListener('DOMContentLoaded', function () {
        initStepNavigation();
        initMobileUserDisplay();
        initQuickActions();
        initIntegrity();
        hookEquipmentRender();
    });

    // =========================================================================
    // STEP WIZARD NAVIGATION
    // =========================================================================
    function initStepNavigation() {
        const btnNext = document.getElementById('btnNext');
        const btnPrev = document.getElementById('btnPrev');
        const btnSubmit = document.getElementById('submitEvaluationBtn');

        btnNext?.addEventListener('click', () => goToStep(currentStep + 1));
        btnPrev?.addEventListener('click', () => goToStep(currentStep - 1));

        // Custom submit for mobile
        btnSubmit?.removeEventListener('click', handleFormSubmission); // remove desktop listener
        btnSubmit?.addEventListener('click', handleMobileSubmit);

        updateBottomBar();
    }

    function goToStep(step) {
        if (step < 1 || step > totalSteps) return;

        // Validate before advancing
        if (step > currentStep && !validateStep(currentStep)) return;

        // If going to step 4 (review), populate review data
        if (step === 4) populateReview();

        currentStep = step;

        // Update sections
        document.querySelectorAll('.mobile-step-section').forEach(s => s.classList.remove('active'));
        document.getElementById(`step${step}`)?.classList.add('active');

        // Update dots
        document.querySelectorAll('.step-dot').forEach(dot => {
            const ds = parseInt(dot.dataset.step);
            dot.classList.remove('active', 'completed');
            if (ds === step) dot.classList.add('active');
            else if (ds < step) dot.classList.add('completed');
        });

        updateBottomBar();

        // Scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    function updateBottomBar() {
        const btnPrev = document.getElementById('btnPrev');
        const btnNext = document.getElementById('btnNext');
        const btnSubmit = document.getElementById('submitEvaluationBtn');

        if (btnPrev) btnPrev.style.display = currentStep > 1 ? 'flex' : 'none';
        if (btnNext) btnNext.style.display = currentStep < totalSteps ? 'flex' : 'none';
        if (btnSubmit) {
            btnSubmit.style.display = currentStep === totalSteps ? 'flex' : 'none';
            updateMobileSubmitButton();
        }
    }

    function validateStep(step) {
        if (step === 1) {
            const tanggal = document.getElementById('modalTanggal')?.value;
            const shift = document.getElementById('modalShift')?.value;
            const unit = document.getElementById('modalUnit')?.value;
            const vendor = document.getElementById('modalVendor')?.value;

            if (!tanggal || !shift || !unit || !vendor) {
                showMobileToast('Lengkapi semua informasi sesi', 'warning');
                return false;
            }
            return true;
        }
        if (step === 2) {
            const peruntukan = document.getElementById('modalPeruntukan')?.value;
            const hasPetugas = (window.selectedPetugasIds?.length > 0) || (window.newPetugasList?.length > 0);

            if (!peruntukan) {
                showMobileToast('Pilih peruntukan terlebih dahulu', 'warning');
                return false;
            }
            if (!hasPetugas) {
                showMobileToast('Pilih minimal satu petugas penilai', 'warning');
                return false;
            }
            return true;
        }
        if (step === 3) {
            // Check if all equipment rated
            const total = cardStates.size;
            let rated = 0;
            cardStates.forEach(s => { if (s.status) rated++; });
            if (total === 0) {
                showMobileToast('Belum ada data peralatan', 'warning');
                return false;
            }
            if (rated < total) {
                showMobileToast(`Masih ada ${total - rated} item belum dinilai`, 'warning');
                return false;
            }
            return true;
        }
        return true;
    }

    // =========================================================================
    // USER DISPLAY
    // =========================================================================
    function initMobileUserDisplay() {
        // Poll for profile availability
        const poll = setInterval(() => {
            const profile = window.currentProfile;
            if (profile) {
                clearInterval(poll);
                const name = (profile.nama || 'User').split(' ')[0];
                const initial = name.charAt(0).toUpperCase();
                const el = document.getElementById('mobileUserInitial');
                const nameEl = document.getElementById('mobileUserName');
                if (el) el.textContent = initial;
                if (nameEl) nameEl.textContent = name;
            }
        }, 500);
    }

    // =========================================================================
    // HOOK INTO EQUIPMENT RENDERING
    // =========================================================================
    function hookEquipmentRender() {
        // Override renderEquipmentTable to also render mobile cards after default render
        const originalRender = window.renderEquipmentTable;
        if (typeof originalRender === 'function') {
            window.renderEquipmentTable = function (data, isFromVendorAssets) {
                // Call original (populates hidden #equipmentTableBody for FormPenilaianManager)
                originalRender(data, isFromVendorAssets);
                // Then render mobile cards
                renderMobileEquipmentCards(data, isFromVendorAssets);
            };
        } else {
            // If renderEquipmentTable isn't available yet, wait and retry
            const retryInterval = setInterval(() => {
                if (typeof window.renderEquipmentTable === 'function' && window.renderEquipmentTable !== hookEquipmentRender) {
                    // Wrap it
                    const orig = window.renderEquipmentTable;
                    window.renderEquipmentTable = function (data, isFromVendorAssets) {
                        orig(data, isFromVendorAssets);
                        renderMobileEquipmentCards(data, isFromVendorAssets);
                    };
                    clearInterval(retryInterval);
                }
            }, 300);
        }

        // Also hook clearEquipmentTable
        const originalClear = window.clearEquipmentTable;
        if (typeof originalClear === 'function') {
            window.clearEquipmentTable = function () {
                originalClear();
                clearMobileCards();
            };
        }
    }

    // =========================================================================
    // RENDER MOBILE EQUIPMENT CARDS
    // =========================================================================
    function renderMobileEquipmentCards(equipmentData, isFromVendorAssets) {
        const container = document.getElementById('equipmentCardsContainer');
        const emptyState = document.getElementById('equipmentEmptyState');

        if (!container) return;

        // Clear
        container.innerHTML = '';
        cardStates.clear();

        if (!equipmentData || equipmentData.length === 0) {
            container.innerHTML = `
                <div class="empty-state" id="equipmentEmptyState">
                    <div class="empty-icon"><i class="bi bi-inbox"></i></div>
                    <h6>Belum Ada Data Peralatan</h6>
                    <p><i class="bi bi-arrow-left me-1"></i>Lengkapi langkah sebelumnya</p>
                </div>`;
            return;
        }

        // Sort by kategori, then nama_alat (same as original)
        const sortedData = [...equipmentData].sort((a, b) => {
            const infoA = a.equipment_master || a;
            const infoB = b.equipment_master || b;
            const kA = (infoA.kategori || a.kategori || '').toLowerCase();
            const kB = (infoB.kategori || b.kategori || '').toLowerCase();
            if (kA < kB) return -1;
            if (kA > kB) return 1;
            const nA = (infoA.nama_alat || a.nama_alat || '').toLowerCase();
            const nB = (infoB.nama_alat || b.nama_alat || '').toLowerCase();
            if (nA < nB) return -1;
            if (nA > nB) return 1;
            return 0;
        });

        sortedData.forEach((item, index) => {
            const dataSource = item.source || (isFromVendorAssets ? 'vendor_assets' : 'equipment_standards');
            let eInfo, eId, reqQty;

            if (isFromVendorAssets) {
                eInfo = item.equipment_master || {};
                eId = item.equipment_id || eInfo.id;
                reqQty = item.required_qty || 1;
            } else if (dataSource === 'equipment_master') {
                eInfo = item.equipment_master || item;
                eId = item.equipment_id || item.id;
                reqQty = item.qty_standar || 1;
            } else {
                eInfo = item.equipment_master || {};
                eId = item.equipment_id || eInfo.id;
                reqQty = item.required_qty || item.contract_qty || 1;
            }

            const namaAlat = eInfo.nama_alat || item.nama_alat || 'N/A';
            const kategori = eInfo.kategori || item.kategori || '';

            // Initialize card state
            cardStates.set(eId, {
                status: null,
                realisasi: reqQty,
                layak: reqQty,
                berfungsi: reqQty,
                reqQty: reqQty,
                namaAlat: namaAlat,
                kategori: kategori,
                index: index
            });

            const card = createEquipmentCard(eId, namaAlat, kategori, reqQty, index + 1);
            container.appendChild(card);
        });

        updateMobileProgress();
    }

    function createEquipmentCard(eId, namaAlat, kategori, reqQty, num) {
        const card = document.createElement('div');
        card.className = 'eq-card';
        card.dataset.equipmentId = eId;

        card.innerHTML = `
            <div class="eq-card-header">
                <div class="eq-info">
                    <span class="eq-number">${String(num).padStart(2, '0')}</span>
                    <span class="eq-name" title="${namaAlat}">${namaAlat}</span>
                    <span class="eq-std">Std: ${reqQty}</span>
                </div>
                <span class="eq-score score-none" data-score-id="${eId}">-</span>
            </div>
            <div class="eq-status-row">
                <button type="button" class="eq-status-btn" data-eq-id="${eId}" data-status="ok"
                    onclick="MobilePenilaian.setStatus('${eId}','ok')">
                    <i class="bi bi-check-circle"></i> OK
                </button>
                <button type="button" class="eq-status-btn" data-eq-id="${eId}" data-status="kurang"
                    onclick="MobilePenilaian.setStatus('${eId}','kurang')">
                    <i class="bi bi-exclamation-triangle"></i> Kurang
                </button>
                <button type="button" class="eq-status-btn" data-eq-id="${eId}" data-status="tidak-ada"
                    onclick="MobilePenilaian.setStatus('${eId}','tidak-ada')">
                    <i class="bi bi-x-circle"></i> Tidak Ada
                </button>
            </div>
            <div class="eq-detail-panel" data-detail-id="${eId}">
                <div class="eq-detail-grid">
                    <div class="eq-detail-field">
                        <label>Realisasi</label>
                        <div class="stepper-group">
                            <button type="button" class="stepper-btn minus" onclick="MobilePenilaian.step('${eId}','realisasi',-1)">
                                <i class="bi bi-dash"></i>
                            </button>
                            <input type="number" class="stepper-value" data-eq-id="${eId}" data-field="realisasi"
                                value="${reqQty}" min="0" max="99"
                                onchange="MobilePenilaian.onInputChange('${eId}','realisasi',this.value)">
                            <button type="button" class="stepper-btn plus" onclick="MobilePenilaian.step('${eId}','realisasi',1)">
                                <i class="bi bi-plus"></i>
                            </button>
                        </div>
                    </div>
                    <div class="eq-detail-field">
                        <label>Layak</label>
                        <div class="stepper-group">
                            <button type="button" class="stepper-btn minus" onclick="MobilePenilaian.step('${eId}','layak',-1)">
                                <i class="bi bi-dash"></i>
                            </button>
                            <input type="number" class="stepper-value" data-eq-id="${eId}" data-field="layak"
                                value="${reqQty}" min="0" max="99"
                                onchange="MobilePenilaian.onInputChange('${eId}','layak',this.value)">
                            <button type="button" class="stepper-btn plus" onclick="MobilePenilaian.step('${eId}','layak',1)">
                                <i class="bi bi-plus"></i>
                            </button>
                        </div>
                    </div>
                    <div class="eq-detail-field">
                        <label>Fungsi</label>
                        <div class="stepper-group">
                            <button type="button" class="stepper-btn minus" onclick="MobilePenilaian.step('${eId}','berfungsi',-1)">
                                <i class="bi bi-dash"></i>
                            </button>
                            <input type="number" class="stepper-value" data-eq-id="${eId}" data-field="berfungsi"
                                value="${reqQty}" min="0" max="99"
                                onchange="MobilePenilaian.onInputChange('${eId}','berfungsi',this.value)">
                            <button type="button" class="stepper-btn plus" onclick="MobilePenilaian.step('${eId}','berfungsi',1)">
                                <i class="bi bi-plus"></i>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        `;

        return card;
    }

    function clearMobileCards() {
        const container = document.getElementById('equipmentCardsContainer');
        if (container) {
            container.innerHTML = `
                <div class="empty-state" id="equipmentEmptyState">
                    <div class="empty-icon"><i class="bi bi-inbox"></i></div>
                    <h6>Belum Ada Data Peralatan</h6>
                    <p><i class="bi bi-arrow-left me-1"></i>Lengkapi langkah sebelumnya</p>
                </div>`;
        }
        cardStates.clear();
        updateMobileProgress();
    }

    // =========================================================================
    // STATUS HANDLING (The core mobile UX)
    // =========================================================================
    function setStatus(eqId, status) {
        const state = cardStates.get(eqId);
        if (!state) return;

        const card = document.querySelector(`.eq-card[data-equipment-id="${eqId}"]`);
        if (!card) return;

        const reqQty = state.reqQty;

        // Toggle if same status clicked
        if (state.status === status) {
            state.status = null;
            state.realisasi = reqQty;
            state.layak = reqQty;
            state.berfungsi = reqQty;
        } else {
            state.status = status;

            switch (status) {
                case 'ok':
                    state.realisasi = reqQty;
                    state.layak = reqQty;
                    state.berfungsi = reqQty;
                    break;
                case 'kurang':
                    // Keep current values (default = standar), user adjusts
                    break;
                case 'tidak-ada':
                    state.realisasi = 0;
                    state.layak = 0;
                    state.berfungsi = 0;
                    break;
            }
        }

        // Update UI
        updateCardUI(eqId);

        // Sync to hidden table row for FormPenilaianManager
        syncToTableRow(eqId);

        // Recalculate
        updateMobileProgress();
    }

    function updateCardUI(eqId) {
        const state = cardStates.get(eqId);
        if (!state) return;

        const card = document.querySelector(`.eq-card[data-equipment-id="${eqId}"]`);
        if (!card) return;

        // Reset card classes
        card.classList.remove('status-ok', 'status-kurang', 'status-tidak-ada');

        // Reset buttons
        card.querySelectorAll('.eq-status-btn').forEach(btn => {
            btn.classList.remove('active-ok', 'active-kurang', 'active-tidak');
        });

        // Detail panel
        const detailPanel = card.querySelector(`.eq-detail-panel[data-detail-id="${eqId}"]`);

        if (state.status) {
            // Apply status class
            card.classList.add(`status-${state.status}`);

            // Activate button
            const activeBtn = card.querySelector(`.eq-status-btn[data-status="${state.status}"]`);
            if (activeBtn) {
                const activeClass = state.status === 'ok' ? 'active-ok' :
                    state.status === 'kurang' ? 'active-kurang' : 'active-tidak';
                activeBtn.classList.add(activeClass);
            }

            // Show detail panel only for "kurang"
            if (detailPanel) {
                if (state.status === 'kurang') {
                    detailPanel.classList.add('show');
                } else {
                    detailPanel.classList.remove('show');
                }
            }
        } else {
            if (detailPanel) detailPanel.classList.remove('show');
        }

        // Update stepper values
        const inputs = card.querySelectorAll('.stepper-value');
        inputs.forEach(inp => {
            const field = inp.dataset.field;
            if (field && state[field] !== undefined) {
                inp.value = state[field];
            }
        });

        // Update score badge
        updateScoreBadge(eqId);
    }

    // =========================================================================
    // STEPPER +/- BUTTONS
    // =========================================================================
    function stepValue(eqId, field, delta) {
        const state = cardStates.get(eqId);
        if (!state) return;

        let val = (state[field] || 0) + delta;
        if (val < 0) val = 0;

        // Validate: layak & berfungsi <= realisasi
        if (field === 'layak' && val > state.realisasi) val = state.realisasi;
        if (field === 'berfungsi' && val > state.realisasi) val = state.realisasi;

        // If realisasi changes, cap layak and berfungsi
        if (field === 'realisasi') {
            if (state.layak > val) state.layak = val;
            if (state.berfungsi > val) state.berfungsi = val;
        }

        state[field] = val;

        updateCardUI(eqId);
        syncToTableRow(eqId);
        updateMobileProgress();
    }

    function onInputChange(eqId, field, rawValue) {
        const state = cardStates.get(eqId);
        if (!state) return;

        let val = parseInt(rawValue) || 0;
        if (val < 0) val = 0;

        if (field === 'layak' && val > state.realisasi) val = state.realisasi;
        if (field === 'berfungsi' && val > state.realisasi) val = state.realisasi;
        if (field === 'realisasi') {
            if (state.layak > val) state.layak = val;
            if (state.berfungsi > val) state.berfungsi = val;
        }

        state[field] = val;

        updateCardUI(eqId);
        syncToTableRow(eqId);
        updateMobileProgress();
    }

    // =========================================================================
    // SCORING  (Same formula as FormPenilaianManager.calculateEquipmentScore)
    // =========================================================================
    function calculateScore(eqId) {
        const state = cardStates.get(eqId);
        if (!state || !state.status) return null;

        const reqQty = state.reqQty || 0;
        const realisasi = state.realisasi || 0;
        const layak = state.layak || 0;
        const berfungsi = state.berfungsi || 0;

        const tidakLayak = Math.max(0, realisasi - layak);
        const tidakBerfungsi = Math.max(0, realisasi - berfungsi);

        // kesesuaian_kontrak: realisasi >= volume_per_regu ? 2 : 0
        const kesesuaian = realisasi >= reqQty ? 2 : 0;
        // kondisi_fisik: tidak_layak == 0 ? 0 : -1
        const fisik = tidakLayak === 0 ? 0 : -1;
        // kondisi_fungsi: tidak_berfungsi == 0 ? 0 : -1
        const fungsi = tidakBerfungsi === 0 ? 0 : -1;

        return kesesuaian + fisik + fungsi; // Range: -2 to +2
    }

    function updateScoreBadge(eqId) {
        const scoreEl = document.querySelector(`.eq-score[data-score-id="${eqId}"]`);
        if (!scoreEl) return;

        const score = calculateScore(eqId);

        if (score === null) {
            scoreEl.textContent = '-';
            scoreEl.className = 'eq-score score-none';
            return;
        }

        scoreEl.textContent = score.toFixed(2);
        scoreEl.className = 'eq-score ';

        if (score >= 2) scoreEl.classList.add('score-perfect');
        else if (score >= 1) scoreEl.classList.add('score-good');
        else if (score >= 0) scoreEl.classList.add('score-warning');
        else scoreEl.classList.add('score-danger');
    }

    function calculateTotalScore() {
        let total = 0;
        let count = 0;

        cardStates.forEach(state => {
            if (state.status) {
                const s = calculateScoreFromState(state);
                total += s;
                count++;
            }
        });

        return count > 0 ? total / count : 0;
    }

    function calculateScoreFromState(state) {
        const reqQty = state.reqQty || 0;
        const realisasi = state.realisasi || 0;
        const layak = state.layak || 0;
        const berfungsi = state.berfungsi || 0;
        const tidakLayak = Math.max(0, realisasi - layak);
        const tidakBerfungsi = Math.max(0, realisasi - berfungsi);
        const kesesuaian = realisasi >= reqQty ? 2 : 0;
        const fisik = tidakLayak === 0 ? 0 : -1;
        const fungsi = tidakBerfungsi === 0 ? 0 : -1;
        return kesesuaian + fisik + fungsi;
    }

    // =========================================================================
    // SYNC MOBILE CARD → HIDDEN TABLE ROW
    // (FormPenilaianManager reads from #equipmentTableBody for submission)
    // =========================================================================
    function syncToTableRow(eqId) {
        const state = cardStates.get(eqId);
        if (!state) return;

        const row = document.querySelector(`#equipmentTableBody tr[data-equipment-id="${eqId}"]`);
        if (!row) return;

        const realisasiInput = row.querySelector('.realisasi-input');
        const layakInput = row.querySelector('.layak-input');
        const berfungsiInput = row.querySelector('.berfungsi-input');

        if (state.status) {
            if (realisasiInput) realisasiInput.value = state.realisasi;
            if (layakInput) layakInput.value = state.layak;
            if (berfungsiInput) berfungsiInput.value = state.berfungsi;

            // Trigger FormPenilaianManager calculation on the hidden table
            if (realisasiInput) {
                FormPenilaianManager.handleRealisasiChange(realisasiInput);
            }
        } else {
            // Clear
            if (realisasiInput) realisasiInput.value = '';
            if (layakInput) layakInput.value = '';
            if (berfungsiInput) berfungsiInput.value = '';
        }
    }

    // =========================================================================
    // PROGRESS
    // =========================================================================
    function updateMobileProgress() {
        const total = cardStates.size;
        let completed = 0;

        cardStates.forEach(s => {
            if (s.status) completed++;
        });

        // Progress text
        const progressText = document.getElementById('progressText');
        if (progressText) progressText.textContent = `${completed}/${total}`;

        // Progress bar
        const pct = total > 0 ? (completed / total) * 100 : 0;
        const bar = document.getElementById('progressBar');
        if (bar) {
            bar.style.width = `${pct}%`;
            bar.classList.toggle('complete', pct === 100);
        }

        // Total score
        const avgScore = calculateTotalScore();
        const scoreEl = document.getElementById('totalScore');
        if (scoreEl) scoreEl.textContent = avgScore.toFixed(2);

        // Also update the mobile submit button
        updateMobileSubmitButton();
    }

    function updateMobileSubmitButton() {
        const btn = document.getElementById('submitEvaluationBtn');
        if (!btn) return;

        const total = cardStates.size;
        let completed = 0;
        cardStates.forEach(s => { if (s.status) completed++; });

        const integrityChecked = document.getElementById('integrityCheckbox')?.checked || false;

        const hasPetugas = (window.selectedPetugasIds?.length > 0) || (window.newPetugasList?.length > 0);
        const sessionValid = document.getElementById('modalTanggal')?.value &&
            document.getElementById('modalShift')?.value &&
            document.getElementById('modalUnit')?.value &&
            document.getElementById('modalVendor')?.value &&
            document.getElementById('modalPeruntukan')?.value &&
            hasPetugas;

        const isReady = sessionValid && completed === total && total > 0 && integrityChecked;

        btn.disabled = !isReady;

        if (isReady) {
            btn.innerHTML = `<i class="bi bi-check-circle me-1"></i> Simpan Penilaian (${completed}/${total})`;
        } else if (!integrityChecked && completed === total && total > 0) {
            btn.innerHTML = `<i class="bi bi-check2-square me-1"></i> Centang Integritas`;
        } else {
            btn.innerHTML = `<i class="bi bi-clock me-1"></i> Belum Lengkap (${completed}/${total})`;
        }
    }

    // =========================================================================
    // QUICK ACTIONS
    // =========================================================================
    function initQuickActions() {
        document.getElementById('btnMarkAllOK')?.addEventListener('click', function () {
            cardStates.forEach((state, eqId) => {
                state.status = 'ok';
                state.realisasi = state.reqQty;
                state.layak = state.reqQty;
                state.berfungsi = state.reqQty;
                updateCardUI(eqId);
                syncToTableRow(eqId);
            });
            updateMobileProgress();
            showMobileToast('Semua item ditandai OK', 'success');
        });

        document.getElementById('btnResetEquipment')?.addEventListener('click', function () {
            cardStates.forEach((state, eqId) => {
                state.status = null;
                state.realisasi = state.reqQty;
                state.layak = state.reqQty;
                state.berfungsi = state.reqQty;
                updateCardUI(eqId);
                syncToTableRow(eqId);
            });
            updateMobileProgress();
            showMobileToast('Penilaian di-reset', 'warning');
        });
    }

    // =========================================================================
    // INTEGRITY CHECKBOX
    // =========================================================================
    function initIntegrity() {
        const cb = document.getElementById('integrityCheckbox');
        const wrapper = document.getElementById('integritySectionWrapper');

        cb?.addEventListener('change', function () {
            wrapper?.classList.toggle('is-checked', this.checked);
            updateMobileSubmitButton();
        });
    }

    // =========================================================================
    // REVIEW (STEP 4)
    // =========================================================================
    function populateReview() {
        const getText = (id) => {
            const el = document.getElementById(id);
            if (!el) return '-';
            if (el.tagName === 'SELECT') return el.options[el.selectedIndex]?.text || '-';
            return el.value || '-';
        };

        document.getElementById('reviewTanggal').textContent = getText('modalTanggal');
        document.getElementById('reviewShift').textContent = `Shift ${getText('modalShift')}`;
        document.getElementById('reviewUnit').textContent = getText('modalUnit');
        document.getElementById('reviewVendor').textContent = getText('modalVendor');
        document.getElementById('reviewPeruntukan').textContent = getText('modalPeruntukan');
        document.getElementById('reviewKendaraan').textContent = getText('modalNopolSelect') || '-';

        // Petugas
        const names = [];
        if (window.selectedPetugasNames) Object.values(window.selectedPetugasNames).forEach(n => { if (n) names.push(n); });
        if (window.newPetugasList) window.newPetugasList.forEach(p => { if (p.name) names.push(p.name); });
        document.getElementById('reviewPetugas').textContent = names.length > 0 ? names.join(', ') : '-';

        // Counts
        let okCount = 0, kurangCount = 0, tidakCount = 0, belumCount = 0;
        cardStates.forEach(s => {
            if (s.status === 'ok') okCount++;
            else if (s.status === 'kurang') kurangCount++;
            else if (s.status === 'tidak-ada') tidakCount++;
            else belumCount++;
        });

        document.getElementById('reviewItemCount').textContent = cardStates.size;
        document.getElementById('reviewTotalScore').textContent = calculateTotalScore().toFixed(2);
        document.getElementById('reviewCountOK').textContent = okCount;
        document.getElementById('reviewCountKurang').textContent = kurangCount;
        document.getElementById('reviewCountTidak').textContent = tidakCount;
        document.getElementById('reviewCountBelum').textContent = belumCount;
    }

    // =========================================================================
    // MOBILE SUBMIT (delegates to form-penilaian-submit.js handleFormSubmission)
    // =========================================================================
    async function handleMobileSubmit(event) {
        event.preventDefault();

        // Ensure all card data is synced to hidden table
        cardStates.forEach((state, eqId) => syncToTableRow(eqId));

        // Let FormPenilaianManager recalculate
        FormPenilaianManager.updateProgress();
        FormPenilaianManager.calculateTotalScore();

        // Show loading
        const overlay = document.getElementById('mobileLoadingOverlay');
        if (overlay) overlay.classList.add('show');

        try {
            // Call the existing submit handler (from form-penilaian-submit.js)
            await handleFormSubmission(event);
        } catch (err) {
            console.error('Mobile submit error:', err);
            showMobileToast('Gagal menyimpan: ' + (err.message || 'Unknown error'), 'error');
        } finally {
            if (overlay) overlay.classList.remove('show');
        }
    }

    // =========================================================================
    // TOAST NOTIFICATION
    // =========================================================================
    function showMobileToast(message, type = 'warning') {
        // Remove existing
        document.querySelectorAll('.mobile-toast').forEach(t => t.remove());

        const toast = document.createElement('div');
        toast.className = `mobile-toast toast-${type}`;
        toast.innerHTML = `<i class="bi bi-${type === 'success' ? 'check-circle' : type === 'error' ? 'x-circle' : 'exclamation-triangle'} me-1"></i>${message}`;
        document.body.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.3s';
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }

    // =========================================================================
    // EXPOSE TO GLOBAL SCOPE (for onclick handlers in HTML)
    // =========================================================================
    window.MobilePenilaian = {
        setStatus: setStatus,
        step: stepValue,
        onInputChange: onInputChange,
        goToStep: goToStep
    };

})();
