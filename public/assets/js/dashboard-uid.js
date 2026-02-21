/**
 * Dashboard UID Module
 * Handle UID Admin/User dashboard functions
 */

async function loadUIDDashboard() {
    try {
        await loadUIDComprehensiveStats();
        await loadUIDTrendChart();
        await loadUIDComparisonChart();
        await loadUIDConditionChart();
        await loadUIDEntryRealizationChart();
        await loadUIDUnitRecapTable();
        await loadUIDEquipmentIssuesByUnit();
    } catch (error) {
        // Dashboard error
    }
}

async function loadUIDComprehensiveStats() {
    try {
        const client = getSupabaseClient();
        const now = new Date();
        const monthParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        // Panggil RPC function - data sudah diagregasi di database
        const { data, error } = await client.rpc('fn_dashboard_stats', {
            p_month: monthParam
        });

        if (error) throw error;
        const stats = data?.[0] || {};

        // Update DOM dengan data siap pakai
        document.getElementById('uidTotalAssessments').textContent = stats.total_assessments || 0;
        document.getElementById('uidPersonalCount').textContent = `P: ${stats.personal_assessments || 0}`;
        document.getElementById('uidReguCount').textContent = `R: ${stats.regu_assessments || 0}`;
        document.getElementById('uidTotalVendors').textContent = stats.unique_vendors || 0;
        document.getElementById('uidTotalUnits').textContent = stats.unique_units || 0;
        document.getElementById('uidTotalUnitsAll').textContent = stats.total_units || 0;
        document.getElementById('uidAvgScore').textContent = (stats.avg_score || 0).toFixed(2);
        document.getElementById('uidAvgPersonal').textContent = `P: ${(stats.avg_personal || 0).toFixed(2)}`;
        document.getElementById('uidAvgRegu').textContent = `R: ${(stats.avg_regu || 0).toFixed(2)}`;

        document.getElementById('uidTidakLayak').textContent = stats.tidak_layak || 0;
        document.getElementById('uidTidakLayakPersonal').textContent = stats.tidak_layak_personal || 0;
        document.getElementById('uidTidakLayakRegu').textContent = stats.tidak_layak_regu || 0;
        document.getElementById('uidTidakBerfungsi').textContent = stats.tidak_berfungsi || 0;
        document.getElementById('uidTidakBerfungsiPersonal').textContent = stats.tidak_berfungsi_personal || 0;
        document.getElementById('uidTidakBerfungsiRegu').textContent = stats.tidak_berfungsi_regu || 0;
        document.getElementById('uidTotalRegu').textContent = stats.unique_teams || 0;
        document.getElementById('uidTotalPersonil').textContent = stats.unique_personnel || 0;

        // Simpan untuk chart comparison dan condition
        window.uidDashboardData = {
            personalAssessments: { length: stats.personal_assessments || 0 },
            reguAssessments: { length: stats.regu_assessments || 0 },
            totalEquipment: stats.total_equipment || 0,
            totalRusak: stats.total_rusak || 0
        };
    } catch (error) {
        console.error('Error loading dashboard stats:', error);
        ['uidTotalAssessments', 'uidTotalVendors', 'uidTotalUnits', 'uidAvgScore'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = 'Error';
        });
    }
}

/**
 * Load Unit Recap Table menggunakan RPC fn_unit_recap
 * Data sudah diagregasi di database - tidak ada masalah limit
 */
async function loadUIDUnitRecapTable() {
    const tbody = document.querySelector('#uidUnitRecapTable tbody');
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Loading...</td></tr>';

    try {
        const client = getSupabaseClient();
        const now = new Date();
        // Format tanggal untuk parameter RPC (YYYY-MM-DD)
        const monthParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        // Panggil RPC function - data sudah diagregasi di database
        const { data: unitRecap, error } = await client.rpc('fn_unit_recap', {
            p_month: monthParam
        });

        if (error) throw error;

        // Render rows - data sudah siap pakai dari database, urutkan berdasarkan avg_score descending
        const rows = unitRecap
            ?.filter(r => r.total_equipment > 0)
            .sort((a, b) => (b.avg_score || 0) - (a.avg_score || 0))
            .map(r => {
                const avgScore = r.avg_score || 0;
                const avgPersonal = r.avg_personal || 0;
                const avgRegu = r.avg_regu || 0;
                const kontrakPct = r.kontrak_pct || 0;
                const scoreClass = avgScore >= 1.5 ? 'success' : avgScore > 0 ? 'warning' : 'secondary';

                return `<tr style="cursor: pointer;" onclick="showUnitReportModal('${r.unit_code}', '${r.unit_name}')">
                    <td><strong>${r.unit_name}</strong></td>
                    <td class="text-center">${r.total_equipment}</td>
                    <td class="text-center">${r.total_teams || '-'}</td>
                    <td class="text-center">${r.total_personnel || '-'}</td>
                    <td class="text-center"><span class="badge bg-${scoreClass}">${avgScore.toFixed(2)}</span></td>
                    <td class="text-center"><span class="badge bg-info">${avgPersonal > 0 ? avgPersonal.toFixed(2) : '-'}</span></td>
                    <td class="text-center"><span class="badge bg-warning">${avgRegu > 0 ? avgRegu.toFixed(2) : '-'}</span></td>
                    <td class="text-center text-danger">${r.tl_fisik || '-'}</td>
                    <td class="text-center text-warning">${r.tb_fungsi || '-'}</td>
                    <td class="text-center"><div class="progress" style="height: 15px;"><div class="progress-bar ${kontrakPct >= 80 ? 'bg-success' : kontrakPct >= 50 ? 'bg-warning' : 'bg-danger'}" style="width: ${kontrakPct}%">${Math.round(kontrakPct)}%</div></div></td>
                </tr>`;
            }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="10" class="text-center text-muted">Tidak ada data</td></tr>';
    } catch (error) {
        console.error('Error loading unit recap:', error);
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger">Error loading data</td></tr>';
    }
}

// Store equipment issues data globally for modal
window.uidEquipmentIssuesData = {};

/**
 * Load equipment issues by unit - menggunakan RPC fn_equipment_issues
 * Data sudah diagregasi di database - cepat dan tidak ada limit issue
 */
async function loadUIDEquipmentIssuesByUnit() {
    const tbody = document.querySelector('#uidIssuesByUnitTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading...</td></tr>';

    try {
        const client = getSupabaseClient();

        // Panggil RPC function - data sudah diagregasi
        const { data: issues, error } = await client.rpc('fn_equipment_issues');

        if (error) throw error;

        if (!issues || issues.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada equipment bermasalah</td></tr>';
            return;
        }

        const rows = issues.map(data => {
            return `<tr style="cursor: pointer;" onclick="showEquipmentIssuesModal('${data.unit_code}')">
                <td><strong>${data.unit_code}</strong></td>
                <td class="text-center"><span class="badge bg-danger">${data.tl_personal}</span></td>
                <td class="text-center"><span class="badge bg-warning">${data.tb_personal}</span></td>
                <td class="text-center"><span class="badge bg-danger">${data.tl_regu}</span></td>
                <td class="text-center"><span class="badge bg-warning">${data.tb_regu}</span></td>
                <td class="text-center"><strong>${data.total_issues}</strong></td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rows;
    } catch (error) {
        console.error('Error loading equipment issues:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
    }
}

/**
 * Show equipment issues modal - Query detail saat user klik
 * Detail data di-query on-demand (tidak perlu load semua upfront)
 */
async function showEquipmentIssuesModal(unitCode) {
    // Set modal title
    document.getElementById('modalUnitCode').textContent = unitCode;
    document.getElementById('modalTotalItems').textContent = 'Loading...';

    const tbody = document.getElementById('tbody-equipment-issues');
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">Loading detail...</td></tr>';

    // Show modal first
    const modal = new bootstrap.Modal(document.getElementById('equipmentIssuesModal'));
    modal.show();

    try {
        const client = getSupabaseClient();

        // Query detail equipment bermasalah untuk unit ini
        const { data: issueAssets, error } = await client
            .from('vendor_assets')
            .select(`
                id, vendor_id, peruntukan_id, equipment_id,
                kondisi_fisik, kondisi_fungsi, kesesuaian_kontrak, nilai,
                realisasi_qty, last_assessment_date, last_assessment_id,
                vendors!inner(vendor_name, unit_code, unit_name),
                peruntukan(deskripsi),
                teams(nomor_polisi),
                personnel(nama_personil),
                equipment_master(nama_alat, kategori, jenis)
            `)
            .eq('vendors.unit_code', unitCode)
            .or('kondisi_fisik.eq.-1,kondisi_fungsi.eq.-1')
            .not('last_assessment_date', 'is', null)
            .order('last_assessment_date', { ascending: false });

        if (error) throw error;

        // Filter untuk unit yang tepat
        const unitAssets = issueAssets?.filter(a => a.vendors?.unit_code === unitCode) || [];

        document.getElementById('modalTotalItems').textContent = unitAssets.length + ' item';

        if (unitAssets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">Tidak ada equipment bermasalah</td></tr>';
            return;
        }

        // Get assessment_items detail
        const assessmentIds = [...new Set(unitAssets.map(a => a.last_assessment_id).filter(Boolean))];
        let itemsMap = {};
        if (assessmentIds.length > 0) {
            const { data: items } = await client
                .from('assessment_items')
                .select('assessment_id, equipment_id, tidak_layak, tidak_berfungsi')
                .in('assessment_id', assessmentIds);
            (items || []).forEach(item => {
                itemsMap[`${item.assessment_id}_${item.equipment_id}`] = item;
            });
        }

        // Render rows
        const rows = unitAssets.map((asset, index) => {
            const itemKey = `${asset.last_assessment_id}_${asset.equipment_id}`;
            const assessmentItem = itemsMap[itemKey] || {};
            const tidakLayak = assessmentItem.tidak_layak || 0;
            const tidakBerfungsi = assessmentItem.tidak_berfungsi || 0;
            const isPersonal = asset.equipment_master?.jenis === 'Personal';

            const targetName = isPersonal
                ? (asset.personnel?.nama_personil || '-')
                : (asset.teams?.nomor_polisi || '-');

            const kondisiClass = tidakLayak === 0 ? 'success' : 'danger';
            const kondisiText = tidakLayak === 0 ? 'OK' : `${tidakLayak} TL`;
            const fungsiClass = tidakBerfungsi === 0 ? 'success' : 'warning';
            const fungsiText = tidakBerfungsi === 0 ? 'OK' : `${tidakBerfungsi} TB`;
            const kontrakClass = asset.kesesuaian_kontrak >= 2 ? 'success' : 'danger';
            const kontrakText = asset.kesesuaian_kontrak >= 2 ? 'Sesuai' : 'Tidak Sesuai';

            const tanggalDate = new Date(asset.last_assessment_date);
            const tanggal = String(tanggalDate.getDate()).padStart(2, '0') + '-' +
                String(tanggalDate.getMonth() + 1).padStart(2, '0') + '-' +
                tanggalDate.getFullYear();

            return `<tr>
                <td>${index + 1}</td>
                <td>${asset.equipment_master?.nama_alat || '-'}</td>
                <td>${asset.equipment_master?.kategori || '-'}</td>
                <td><span class="badge bg-${isPersonal ? 'info' : 'warning'}">${isPersonal ? 'Personal' : 'Regu'}</span></td>
                <td>${targetName}</td>
                <td class="text-center">${tanggal}</td>
                <td class="text-center">${asset.realisasi_qty || 0}</td>
                <td class="text-center"><span class="badge bg-${kondisiClass}">${kondisiText}</span></td>
                <td class="text-center"><span class="badge bg-${fungsiClass}">${fungsiText}</span></td>
                <td class="text-center"><span class="badge bg-${kontrakClass}">${kontrakText}</span></td>
                <td class="text-center">${asset.nilai !== null ? Number(asset.nilai).toFixed(2) : '-'}</td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rows;
    } catch (error) {
        console.error('Error loading equipment issues detail:', error);
        tbody.innerHTML = '<tr><td colspan="12" class="text-center text-danger">Error loading data</td></tr>';
    }
}

async function loadUIDComparisonChart() {
    const chartEl = document.getElementById('uidComparisonChart');
    if (!chartEl) return;

    try {
        const dashboardData = window.uidDashboardData || {};
        const personalCount = dashboardData.personalAssessments?.length || 0;
        const reguCount = dashboardData.reguAssessments?.length || 0;

        const options = {
            series: [personalCount, reguCount],
            chart: { height: 250, type: 'donut' },
            labels: ['Personal', 'Regu'],
            colors: ['#4154f1', '#ff771d'],
            legend: { position: 'bottom' },
            plotOptions: {
                pie: {
                    donut: {
                        size: '65%',
                        labels: {
                            show: true, name: { show: true }, value: { show: true },
                            total: { show: true, label: 'Total', formatter: (w) => w.globals.seriesTotals.reduce((a, b) => a + b, 0) }
                        }
                    }
                }
            },
            responsive: [{ breakpoint: 480, options: { chart: { width: 280 }, legend: { position: 'bottom' } } }]
        };

        if (window.uidComparisonChart) {
            try { window.uidComparisonChart.destroy(); } catch (e) { }
        }
        window.uidComparisonChart = new ApexCharts(chartEl, options);
        window.uidComparisonChart.render();
    } catch (error) {
        // Chart error
    }
}

/**
 * Load Condition Chart - Kondisi Alat (Baik vs Rusak)
 */
async function loadUIDConditionChart() {
    const chartEl = document.getElementById('uidConditionChart');
    if (!chartEl) return;

    try {
        const dashboardData = window.uidDashboardData || {};
        const totalEquipment = dashboardData.totalEquipment || 0;
        const totalRusak = dashboardData.totalRusak || 0;
        const totalBaik = totalEquipment - totalRusak;

        const options = {
            series: [totalBaik, totalRusak],
            chart: { height: 250, type: 'donut' },
            labels: ['Baik', 'Rusak'],
            colors: ['#2eca6a', '#e74c3c'],
            legend: { position: 'bottom' },
            plotOptions: {
                pie: {
                    donut: {
                        size: '65%',
                        labels: {
                            show: true, name: { show: true }, value: { show: true },
                            total: { show: true, label: 'Total', formatter: (w) => w.globals.seriesTotals.reduce((a, b) => a + b, 0) }
                        }
                    }
                }
            },
            responsive: [{ breakpoint: 480, options: { chart: { width: 280 }, legend: { position: 'bottom' } } }]
        };

        if (window.uidConditionChart) {
            try { window.uidConditionChart.destroy(); } catch (e) { }
        }
        window.uidConditionChart = new ApexCharts(chartEl, options);
        window.uidConditionChart.render();
    } catch (error) {
        // Chart error
    }
}

/**
 * Load Entry Realization Chart - menggunakan RPC fn_entry_realization
 */
async function loadUIDEntryRealizationChart() {
    const chartEl = document.getElementById('uidEntryRealizationChart');
    if (!chartEl) return;

    try {
        const client = getSupabaseClient();
        const now = new Date();
        const monthParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        // Panggil RPC function
        const { data: entryData, error } = await client.rpc('fn_entry_realization', {
            p_month: monthParam
        });

        if (error) throw error;

        const categories = entryData?.map(e => e.unit_code) || [];
        const personalData = entryData?.map(e => e.personal_count) || [];
        const reguData = entryData?.map(e => e.regu_count) || [];

        const options = {
            series: [{ name: 'Personal', data: personalData }, { name: 'Regu', data: reguData }],
            chart: { type: 'bar', height: 280, stacked: true, toolbar: { show: false } },
            plotOptions: { bar: { horizontal: true, borderRadius: 4 } },
            colors: ['#4154f1', '#ff771d'],
            dataLabels: { enabled: true, style: { fontSize: '11px' } },
            xaxis: { categories: categories },
            legend: { position: 'top' },
            tooltip: { y: { formatter: (val) => val + ' penilaian' } }
        };

        if (window.uidEntryRealizationChart) {
            try { window.uidEntryRealizationChart.destroy(); } catch (e) { }
        }
        window.uidEntryRealizationChart = new ApexCharts(chartEl, options);
        window.uidEntryRealizationChart.render();
    } catch (error) {
        console.error('Error loading entry realization chart:', error);
    }
}

/**
 * Load Trend Chart - menggunakan RPC fn_trend_monthly
 */
async function loadUIDTrendChart() {
    const chartEl = document.getElementById('uidTrendChart');
    if (!chartEl) return;

    try {
        const client = getSupabaseClient();

        // Panggil RPC function
        const { data: trendData, error } = await client.rpc('fn_trend_monthly', {
            p_months: 6
        });

        if (error) throw error;

        const labels = trendData?.map(t => t.month_label) || [];
        const monthlyData = trendData?.map(t => t.total_assessments) || [];

        const options = {
            series: [{ name: 'Jumlah Penilaian', data: monthlyData }],
            chart: { height: 250, type: 'area', toolbar: { show: false }, fontFamily: 'inherit' },
            colors: ['#4154f1'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1, stops: [0, 90, 100] } },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            xaxis: { categories: labels },
            yaxis: { min: 0, forceNiceScale: true },
            tooltip: { y: { formatter: (val) => val + ' penilaian' } }
        };

        if (window.uidTrendChart) {
            try { window.uidTrendChart.destroy(); } catch (e) { }
        }
        window.uidTrendChart = new ApexCharts(chartEl, options);
        window.uidTrendChart.render();
    } catch (error) {
        console.error('Error loading trend chart:', error);
        chartEl.innerHTML = '<p class="text-center text-muted py-4">Gagal memuat chart</p>';
    }
}

/**
 * Show Unit Report Modal - Raport detail per unit menggunakan RPC fn_unit_report
 */
async function showUnitReportModal(unitCode, unitName) {
    const modal = new bootstrap.Modal(document.getElementById('unitReportModal'));
    document.getElementById('reportUnitCode').textContent = unitCode;
    document.getElementById('unitReportContent').innerHTML = `
        <div class="text-center py-5">
            <div class="spinner-border text-primary" role="status">
                <span class="visually-hidden">Loading...</span>
            </div>
            <p class="mt-2 text-muted">Memuat data raport...</p>
        </div>
    `;
    modal.show();

    try {
        const client = getSupabaseClient();
        const now = new Date();
        const monthParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
        const periodLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

        // Panggil RPC function
        const { data: report, error } = await client.rpc('fn_unit_report', {
            p_unit_code: unitCode,
            p_month: monthParam
        });

        if (error) throw error;

        const summary = report?.summary || {};
        const peruntukanBreakdown = report?.peruntukan_breakdown || [];
        const vendorBreakdown = report?.vendor_breakdown || [];
        const issuesByCategory = report?.issues_by_category || [];

        // Grade calculation
        const getGrade = (score) => {
            if (score >= 1.5) return { class: 'success' };
            if (score >= 1.0) return { class: 'info' };
            if (score >= 0.5) return { class: 'warning' };
            return { class: 'danger' };
        };

        const overallGrade = getGrade(summary.avg_score || 0);
        const totalIssues = issuesByCategory.reduce((sum, cat) => sum + (cat.total_items || 0), 0);

        // Render report
        const reportHTML = `
            <!-- Print Header -->
            <div class="d-none d-print-block text-center mb-4">
                <h4 class="mb-1">RAPORT PPE HEALTH INDEX</h4>
                <h5 class="mb-3">${unitCode} - ${summary.unit_name || unitName}</h5>
                <p class="text-muted">Periode: ${periodLabel}</p>
                <hr>
            </div>

            <!-- Unit Header -->
            <div class="row mb-3">
                <div class="col-12">
                    <div class="bg-light rounded p-2">
                        <div class="row align-items-center">
                            <div class="col-md-8">
                                <h5 class="mb-0">${unitCode} - ${summary.unit_name || unitName}</h5>
                                <small class="text-muted">Periode: ${periodLabel}</small>
                            </div>
                            <div class="col-md-4 text-end">
                                <div class="h2 mb-0 fw-bold text-${overallGrade.class}">${(summary.avg_score || 0).toFixed(2)}</div>
                                <small class="text-muted">Rata-rata Score</small>
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <!-- Summary Stats - Compact -->
            <div class="row g-2 mb-3">
                <div class="col-12">
                    <h6 class="border-bottom pb-1 mb-2"><i class="bi bi-bar-chart me-2"></i>Ringkasan Penilaian</h6>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Equipment</small>
                        <h5 class="mb-0">${summary.total_equipment || 0}</h5>
                        <small style="font-size: 0.65rem;">&nbsp;</small>
                    </div>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Avg Nilai</small>
                        <h5 class="mb-0 text-${overallGrade.class}">${(summary.avg_score || 0).toFixed(2)}</h5>
                        <small style="font-size: 0.65rem;">&nbsp;</small>
                    </div>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Personal</small>
                        <h5 class="mb-0 text-info">${(summary.avg_personal || 0).toFixed(2)}</h5>
                        <small class="text-muted" style="font-size: 0.65rem;">${summary.total_personal || 0} eq</small>
                    </div>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Regu</small>
                        <h5 class="mb-0 text-warning">${(summary.avg_regu || 0).toFixed(2)}</h5>
                        <small class="text-muted" style="font-size: 0.65rem;">${summary.total_regu || 0} eq</small>
                    </div>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Kontrak</small>
                        <h5 class="mb-0 ${(summary.kontrak_pct || 0) >= 80 ? 'text-success' : (summary.kontrak_pct || 0) >= 50 ? 'text-warning' : 'text-danger'}">${(summary.kontrak_pct || 0).toFixed(0)}%</h5>
                        <small class="text-muted" style="font-size: 0.65rem;">${summary.kontrak_ok || 0}/${summary.total_equipment || 0}</small>
                    </div>
                </div>
                <div class="col-md-1 col-2">
                    <div class="border border-danger rounded p-2 text-center h-100">
                        <small class="text-danger d-block" style="font-size: 0.7rem;">TL</small>
                        <h5 class="mb-0 text-danger">${summary.tl_fisik || 0}</h5>
                        <small style="font-size: 0.65rem;">&nbsp;</small>
                    </div>
                </div>
                <div class="col-md-1 col-2">
                    <div class="border border-warning rounded p-2 text-center h-100">
                        <small class="text-warning d-block" style="font-size: 0.7rem;">TB</small>
                        <h5 class="mb-0 text-warning">${summary.tb_fungsi || 0}</h5>
                        <small style="font-size: 0.65rem;">&nbsp;</small>
                    </div>
                </div>
            </div>

            <!-- Breakdown by Peruntukan -->
            <div class="mb-3">
                <h6 class="border-bottom pb-1 mb-2"><i class="bi bi-list-check me-2"></i>Breakdown per Peruntukan</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-bordered mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>Peruntukan</th>
                                <th class="text-center">Equipment</th>
                                <th class="text-center">Avg Nilai</th>
                                <th class="text-center text-danger">TL</th>
                                <th class="text-center text-warning">TB</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${peruntukanBreakdown.map(p => {
            const avgClass = p.avg_score >= 1.5 ? 'success' : p.avg_score >= 0 ? 'warning' : 'danger';
            return `<tr>
                                    <td>${p.peruntukan}</td>
                                    <td class="text-center">${p.total_equipment}</td>
                                    <td class="text-center"><span class="badge bg-${avgClass}">${p.avg_score.toFixed(2)}</span></td>
                                    <td class="text-center text-danger">${p.tl_fisik || '-'}</td>
                                    <td class="text-center text-warning">${p.tb_fungsi || '-'}</td>
                                </tr>`;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Breakdown by Vendor -->
            <div class="mb-3">
                <h6 class="border-bottom pb-1 mb-2"><i class="bi bi-building me-2"></i>Breakdown per Vendor</h6>
                <div class="table-responsive">
                    <table class="table table-sm table-bordered mb-0">
                        <thead class="table-light">
                            <tr>
                                <th>Vendor</th>
                                <th class="text-center">Equipment</th>
                                <th class="text-center">Avg Nilai</th>
                                <th class="text-center text-danger">TL</th>
                                <th class="text-center text-warning">TB</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${vendorBreakdown.map(v => {
            const avgClass = v.avg_score >= 1.5 ? 'success' : v.avg_score >= 0 ? 'warning' : 'danger';
            return `<tr>
                                    <td>${v.vendor_name}</td>
                                    <td class="text-center">${v.total_equipment}</td>
                                    <td class="text-center"><span class="badge bg-${avgClass}">${v.avg_score.toFixed(2)}</span></td>
                                    <td class="text-center text-danger">${v.tl_fisik || '-'}</td>
                                    <td class="text-center text-warning">${v.tb_fungsi || '-'}</td>
                                </tr>`;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Equipment Issues by Category -->
            ${totalIssues > 0 ? `
            <div class="mb-3">
                <h6 class="border-bottom pb-1 mb-2 text-danger"><i class="bi bi-exclamation-triangle me-2"></i>Daftar Equipment Bermasalah (${totalIssues})</h6>
                ${issuesByCategory.map(cat => `
                    <div class="mb-3">
                        <div class="d-flex justify-content-between align-items-center bg-light px-2 py-1 rounded mb-1">
                            <strong class="small">${cat.category}</strong>
                            <span class="small">
                                <span class="badge bg-danger">${cat.tl_count} TL</span>
                                <span class="badge bg-warning">${cat.tb_count} TB</span>
                                <span class="badge bg-secondary">${cat.total_items} item</span>
                            </span>
                        </div>
                        <div class="table-responsive">
                            <table class="table table-sm table-bordered mb-0 small">
                                <thead class="table-light">
                                    <tr>
                                        <th>#</th>
                                        <th>Peralatan</th>
                                        <th>Vendor</th>
                                        <th>Peruntukan</th>
                                        <th class="text-center">Kondisi</th>
                                        <th class="text-center">Fungsi</th>
                                        <th class="text-center">Nilai</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${cat.items.map((eq, idx) => {
            const kondisiClass = eq.kondisi_fisik === -1 ? 'danger' : 'success';
            const fungsiClass = eq.kondisi_fungsi === -1 ? 'warning' : 'success';
            return `<tr>
                                            <td>${idx + 1}</td>
                                            <td>${eq.nama_alat || '-'}</td>
                                            <td>${eq.vendor_name || '-'}</td>
                                            <td>${eq.peruntukan || '-'}</td>
                                            <td class="text-center"><span class="badge bg-${kondisiClass}">${eq.kondisi_fisik === -1 ? 'TL' : 'OK'}</span></td>
                                            <td class="text-center"><span class="badge bg-${fungsiClass}">${eq.kondisi_fungsi === -1 ? 'TB' : 'OK'}</span></td>
                                            <td class="text-center">${eq.nilai?.toFixed(2) || '-'}</td>
                                        </tr>`;
        }).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                `).join('')}
            </div>
            ` : ''}

            <!-- Footer -->
            <div class="text-center text-muted small mt-3 pt-2 border-top">
                <p class="mb-1">Dicetak pada: ${new Date().toLocaleString('id-ID')}</p>
                <p class="mb-0">PPE Health Index</p>
            </div>
        `;

        document.getElementById('unitReportContent').innerHTML = reportHTML;

    } catch (error) {
        console.error('Error loading unit report:', error);
        document.getElementById('unitReportContent').innerHTML = `
            <div class="text-center py-5 text-danger">
                <i class="bi bi-exclamation-circle" style="font-size: 3rem;"></i>
                <p class="mt-2">Gagal memuat data raport</p>
            </div>
        `;
    }
}

/**
 * Print Unit Report
 */
function printUnitReport() {
    window.print();
}
