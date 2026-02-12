/**
 * Dashboard UID Module
 * Handle UID Admin/User dashboard functions
 */

async function loadUIDDashboard() {
    try {
        await loadUIDComprehensiveStats();
        await loadUIDTrendChart();
        await loadUIDComparisonChart();
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
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const { data: assessments, error: assessmentsError } = await client
            .from('assessments')
            .select(`
                id, vendor_id, peruntukan_id, team_id, personnel_id,
                vendors(unit_code, unit_name),
                peruntukan(jenis, deskripsi)
            `)
            .gte('tanggal_penilaian', firstDayOfMonth.toISOString())
            .lte('tanggal_penilaian', lastDayOfMonth.toISOString());

        if (assessmentsError) throw assessmentsError;

        const personalAssessments = assessments?.filter(a => a.peruntukan?.jenis === 'Personal') || [];
        const reguAssessments = assessments?.filter(a => a.peruntukan?.jenis === 'Regu') || [];

        const totalAssessments = assessments?.length || 0;
        const uniqueVendors = new Set(assessments?.map(a => a.vendor_id) || []).size;
        const uniqueUnits = new Set(assessments?.map(a => a.vendors?.unit_code).filter(Boolean) || []).size;

        const { data: allUnits } = await client.from('units').select('unit_code');
        const totalUnitsAll = allUnits?.length || 0;

        const uniqueTeams = new Set(assessments?.map(a => a.team_id).filter(Boolean) || []).size;
        const uniquePersonnel = new Set(assessments?.map(a => a.personnel_id).filter(Boolean) || []).size;

        const assessmentIds = assessments?.map(a => a.id) || [];
        let items = [], personalItems = [], reguItems = [];

        if (assessmentIds.length > 0) {
            const { data: itemsData, error: itemsError } = await client
                .from('assessment_items')
                .select('score_item, kondisi_fisik, kondisi_fungsi, assessment_id')
                .in('assessment_id', assessmentIds);

            if (itemsError) throw itemsError;
            items = itemsData || [];

            const personalIds = new Set(personalAssessments.map(a => a.id));
            const reguIds = new Set(reguAssessments.map(a => a.id));

            personalItems = items.filter(i => personalIds.has(i.assessment_id));
            reguItems = items.filter(i => reguIds.has(i.assessment_id));
        }

        const avgScore = items.length > 0 ? (items.reduce((sum, i) => sum + (i.score_item || 0), 0) / items.length) : 0;
        const avgPersonal = personalItems.length > 0 ? (personalItems.reduce((sum, i) => sum + (i.score_item || 0), 0) / personalItems.length) : 0;
        const avgRegu = reguItems.length > 0 ? (reguItems.reduce((sum, i) => sum + (i.score_item || 0), 0) / reguItems.length) : 0;

        const tidakLayak = items.filter(i => i.kondisi_fisik === -1).length;
        const tidakBerfungsi = items.filter(i => i.kondisi_fungsi === -1).length;
        const tidakLayakPersonal = personalItems.filter(i => i.kondisi_fisik === -1).length;
        const tidakLayakRegu = reguItems.filter(i => i.kondisi_fisik === -1).length;
        const tidakBerfungsiPersonal = personalItems.filter(i => i.kondisi_fungsi === -1).length;
        const tidakBerfungsiRegu = reguItems.filter(i => i.kondisi_fungsi === -1).length;

        document.getElementById('uidTotalAssessments').textContent = totalAssessments;
        document.getElementById('uidPersonalCount').textContent = `P: ${personalAssessments.length}`;
        document.getElementById('uidReguCount').textContent = `R: ${reguAssessments.length}`;
        document.getElementById('uidTotalVendors').textContent = uniqueVendors;
        document.getElementById('uidTotalUnits').textContent = uniqueUnits;
        document.getElementById('uidTotalUnitsAll').textContent = totalUnitsAll;
        document.getElementById('uidAvgScore').textContent = avgScore.toFixed(2);
        document.getElementById('uidAvgPersonal').textContent = `P: ${avgPersonal.toFixed(2)}`;
        document.getElementById('uidAvgRegu').textContent = `R: ${avgRegu.toFixed(2)}`;

        document.getElementById('uidTidakLayak').textContent = tidakLayak;
        document.getElementById('uidTidakLayakPersonal').textContent = tidakLayakPersonal;
        document.getElementById('uidTidakLayakRegu').textContent = tidakLayakRegu;
        document.getElementById('uidTidakBerfungsi').textContent = tidakBerfungsi;
        document.getElementById('uidTidakBerfungsiPersonal').textContent = tidakBerfungsiPersonal;
        document.getElementById('uidTidakBerfungsiRegu').textContent = tidakBerfungsiRegu;
        document.getElementById('uidTotalRegu').textContent = uniqueTeams;
        document.getElementById('uidTotalPersonil').textContent = uniquePersonnel;

        window.uidDashboardData = { assessments, personalAssessments, reguAssessments, items, personalItems, reguItems };
    } catch (error) {
        ['uidTotalAssessments', 'uidTotalVendors', 'uidTotalUnits', 'uidAvgScore'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = 'Error';
        });
    }
}

async function loadUIDUnitRecapTable() {
    const tbody = document.querySelector('#uidUnitRecapTable tbody');
    tbody.innerHTML = '<tr><td colspan="10" class="text-center text-muted">Loading...</td></tr>';

    try {
        const client = getSupabaseClient();
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const { data: units } = await client.from('units').select('unit_code, unit_name').order('unit_name');

        const { data: assessments, error } = await client
            .from('assessments')
            .select(`id, vendor_id, peruntukan_id, team_id, personnel_id, vendors(unit_code), peruntukan(jenis, deskripsi)`)
            .gte('tanggal_penilaian', firstDayOfMonth.toISOString())
            .lte('tanggal_penilaian', lastDayOfMonth.toISOString());

        if (error) throw error;

        const assessmentIds = assessments?.map(a => a.id) || [];
        let items = [];
        if (assessmentIds.length > 0) {
            const { data: itemsData } = await client
                .from('assessment_items')
                .select('score_item, kondisi_fisik, kondisi_fungsi, assessment_id, kesesuaian_kontrak')
                .in('assessment_id', assessmentIds);
            items = itemsData || [];
        }

        const unitStats = {};
        units?.forEach(u => {
            unitStats[u.unit_code] = {
                name: u.unit_name, assessments: 0, teams: new Set(), personnel: new Set(),
                personalAssessments: 0, reguAssessments: 0, items: [], personalItems: [], reguItems: []
            };
        });

        assessments?.forEach(a => {
            const unitCode = a.vendors?.unit_code;
            if (unitCode && unitStats[unitCode]) {
                unitStats[unitCode].assessments++;
                if (a.team_id) unitStats[unitCode].teams.add(a.team_id);
                if (a.personnel_id) unitStats[unitCode].personnel.add(a.personnel_id);

                const isPersonal = a.peruntukan?.jenis === 'Personal';
                if (isPersonal) unitStats[unitCode].personalAssessments++;
                else unitStats[unitCode].reguAssessments++;

                const assessmentItems = items.filter(i => i.assessment_id === a.id);
                unitStats[unitCode].items.push(...assessmentItems);
                if (isPersonal) unitStats[unitCode].personalItems.push(...assessmentItems);
                else unitStats[unitCode].reguItems.push(...assessmentItems);
            }
        });

        const rows = Object.entries(unitStats)
            .filter(([_, stats]) => stats.assessments > 0)
            .sort((a, b) => b[1].assessments - a[1].assessments)
            .map(([code, stats]) => {
                const avgScore = stats.items.length > 0 ? (stats.items.reduce((s, i) => s + (i.score_item || 0), 0) / stats.items.length).toFixed(2) : '-';
                const avgPersonal = stats.personalItems.length > 0 ? (stats.personalItems.reduce((s, i) => s + (i.score_item || 0), 0) / stats.personalItems.length).toFixed(2) : '-';
                const avgRegu = stats.reguItems.length > 0 ? (stats.reguItems.reduce((s, i) => s + (i.score_item || 0), 0) / stats.reguItems.length).toFixed(2) : '-';
                const tlFisik = stats.items.filter(i => i.kondisi_fisik === -1).length;
                const tbFungsi = stats.items.filter(i => i.kondisi_fungsi === -1).length;
                const kontrakOk = stats.items.filter(i => i.kesesuaian_kontrak >= 2).length;
                const kontrakPct = stats.items.length > 0 ? ((kontrakOk / stats.items.length) * 100).toFixed(0) : 0;
                const scoreClass = avgScore >= 1.5 ? 'success' : avgScore >= 0 ? 'warning' : 'danger';

                return `<tr>
                    <td><strong>${code}</strong><br><small class="text-muted">${stats.name}</small></td>
                    <td class="text-center">${stats.assessments}</td>
                    <td class="text-center">${stats.teams.size}</td>
                    <td class="text-center">${stats.personnel.size}</td>
                    <td class="text-center"><span class="badge bg-${scoreClass}">${avgScore}</span></td>
                    <td class="text-center"><span class="badge bg-info">${avgPersonal}</span></td>
                    <td class="text-center"><span class="badge bg-warning">${avgRegu}</span></td>
                    <td class="text-center text-danger">${tlFisik || '-'}</td>
                    <td class="text-center text-warning">${tbFungsi || '-'}</td>
                    <td class="text-center"><div class="progress" style="height: 15px;"><div class="progress-bar ${kontrakPct >= 80 ? 'bg-success' : kontrakPct >= 50 ? 'bg-warning' : 'bg-danger'}" style="width: ${kontrakPct}%">${kontrakPct}%</div></div></td>
                </tr>`;
            }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="10" class="text-center text-muted">Tidak ada data</td></tr>';
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="10" class="text-center text-danger">Error loading data</td></tr>';
    }
}

// Store equipment issues data globally for modal
window.uidEquipmentIssuesData = {};

/**
 * Load equipment issues by unit - Query langsung dari vendor_assets
 * Setiap baris di vendor_assets = 1 unit peralatan individual
 * Data ini adalah single source of truth untuk kondisi peralatan
 */
async function loadUIDEquipmentIssuesByUnit() {
    const tbody = document.querySelector('#uidIssuesByUnitTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading...</td></tr>';

    try {
        const client = getSupabaseClient();

        // Query langsung dari vendor_assets yang bermasalah
        // kondisi_fisik = -1 (Tidak Layak) atau kondisi_fungsi = -1 (Tidak Berfungsi)
        const { data: issueAssets, error } = await client
            .from('vendor_assets')
            .select(`
                id,
                vendor_id,
                peruntukan_id,
                team_id,
                personnel_id,
                equipment_id,
                kondisi_fisik,
                kondisi_fungsi,
                kesesuaian_kontrak,
                nilai,
                realisasi_qty,
                last_assessment_date,
                vendors(id, vendor_name, unit_code, unit_name),
                peruntukan(id, jenis, deskripsi),
                teams(id, nomor_polisi, category),
                personnel(id, nama_personil),
                equipment_master(id, nama_alat, kategori, satuan)
            `)
            .or('kondisi_fisik.eq.-1,kondisi_fungsi.eq.-1')
            .not('last_assessment_date', 'is', null)
            .order('last_assessment_date', { ascending: false });

        if (error) throw error;

        if (!issueAssets || issueAssets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada equipment bermasalah</td></tr>';
            window.uidEquipmentIssuesData = {};
            return;
        }

        // Query equipment_standards untuk mendapatkan standar_qty
        // Build unique keys untuk query
        const standardKeys = [...new Set(issueAssets.map(a =>
            `${a.vendor_id}_${a.peruntukan_id}_${a.equipment_id}`
        ))];

        const vendorIds = [...new Set(issueAssets.map(a => a.vendor_id))];
        const peruntukanIds = [...new Set(issueAssets.map(a => a.peruntukan_id))];
        const equipmentIds = [...new Set(issueAssets.map(a => a.equipment_id))];

        const { data: standards } = await client
            .from('equipment_standards')
            .select('vendor_id, peruntukan_id, equipment_id, required_qty')
            .in('vendor_id', vendorIds)
            .in('peruntukan_id', peruntukanIds)
            .in('equipment_id', equipmentIds);

        // Buat map untuk lookup standar
        const standardsMap = {};
        (standards || []).forEach(s => {
            const key = `${s.vendor_id}_${s.peruntukan_id}_${s.equipment_id}`;
            standardsMap[key] = s.required_qty || 0;
        });

        // Group by unit dan hitung
        const unitIssues = {};
        const unitIssuesDetail = {};

        issueAssets.forEach(asset => {
            const unitCode = asset.vendors?.unit_code || 'Unknown';
            const unitName = asset.vendors?.unit_name || 'Unknown';
            const isPersonal = asset.peruntukan?.jenis === 'Personal';

            if (!unitIssues[unitCode]) {
                unitIssues[unitCode] = {
                    name: unitName,
                    tlPersonal: 0,
                    tlRegu: 0,
                    tbPersonal: 0,
                    tbRegu: 0,
                    uniqueItems: 0
                };
                unitIssuesDetail[unitCode] = [];
            }

            // Simpan data lengkap untuk modal
            // Lookup standar dari equipment_standards
            const standardKey = `${asset.vendor_id}_${asset.peruntukan_id}_${asset.equipment_id}`;
            const standarQty = standardsMap[standardKey] || 0;

            unitIssuesDetail[unitCode].push({
                id: asset.id,
                equipmentName: asset.equipment_master?.nama_alat || 'Unknown',
                vendorName: asset.vendors?.vendor_name || 'Unknown',
                unitCode: unitCode,
                unitName: unitName,
                peruntukan: asset.peruntukan?.deskripsi || asset.peruntukan_id || '-',
                isPersonal: isPersonal,
                // Tim/Personil: Nopol untuk Regu, Nama untuk Personal
                targetName: isPersonal
                    ? (asset.personnel?.nama_personil || '-')
                    : (asset.teams?.nomor_polisi || '-'),
                tanggal: asset.last_assessment_date,
                standar: standarQty,
                qty: asset.realisasi_qty || 0,
                kondisiFisik: asset.kondisi_fisik,
                kondisiFungsi: asset.kondisi_fungsi,
                kesesuaianKontrak: asset.kesesuaian_kontrak,
                scoreItem: asset.nilai
            });

            // Hitung item unik
            unitIssues[unitCode].uniqueItems++;

            // Hitung per kategori masalah
            if (asset.kondisi_fisik === -1) {
                if (isPersonal) unitIssues[unitCode].tlPersonal++;
                else unitIssues[unitCode].tlRegu++;
            }
            if (asset.kondisi_fungsi === -1) {
                if (isPersonal) unitIssues[unitCode].tbPersonal++;
                else unitIssues[unitCode].tbRegu++;
            }
        });

        // Simpan data detail ke global variable
        window.uidEquipmentIssuesData = unitIssuesDetail;

        if (Object.keys(unitIssues).length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada equipment bermasalah</td></tr>';
            return;
        }

        const rows = Object.entries(unitIssues)
            .sort((a, b) => b[1].uniqueItems - a[1].uniqueItems)
            .map(([unitId, data]) => {
                return `<tr style="cursor: pointer;" onclick="showEquipmentIssuesModal('${unitId}')">
                    <td><strong>${unitId}</strong></td>
                    <td class="text-center"><span class="badge bg-danger">${data.tlPersonal}</span></td>
                    <td class="text-center"><span class="badge bg-warning">${data.tbPersonal}</span></td>
                    <td class="text-center"><span class="badge bg-danger">${data.tlRegu}</span></td>
                    <td class="text-center"><span class="badge bg-warning">${data.tbRegu}</span></td>
                    <td class="text-center"><strong>${data.uniqueItems}</strong></td>
                </tr>`;
            }).join('');

        tbody.innerHTML = rows;
    } catch (error) {
        console.error('Error loading equipment issues from vendor_assets:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
    }
}

// Function to show equipment issues modal
function showEquipmentIssuesModal(unitCode) {
    const data = window.uidEquipmentIssuesData[unitCode];
    if (!data || data.length === 0) return;

    // Set modal title
    document.getElementById('modalUnitCode').textContent = unitCode;
    document.getElementById('modalTotalItems').textContent = data.length + ' item';

    // Render table rows
    const tbody = document.getElementById('tbody-equipment-issues');

    const rows = data.map((item, index) => {
        const fisikClass = item.kondisiFisik === 0 ? 'success' : 'danger';
        const fisikText = item.kondisiFisik === 0 ? 'Layak' : 'Tidak Layak';
        const fungsiClass = item.kondisiFungsi === 0 ? 'success' : 'warning';
        const fungsiText = item.kondisiFungsi === 0 ? 'Baik' : 'Tidak Baik';
        const kontrakClass = item.kesesuaianKontrak >= 2 ? 'success' : 'danger';
        const kontrakText = item.kesesuaianKontrak >= 2 ? 'Sesuai' : 'Tidak Sesuai';

        // Handle nilai dari vendor_assets (bisa null) - format 2 decimal
        const nilaiScore = item.scoreItem ?? 0;
        const nilaiClass = nilaiScore >= 1 ? 'success' : nilaiScore >= 0 ? 'warning' : 'danger';
        const nilaiDisplay = item.scoreItem !== null && item.scoreItem !== undefined
            ? Number(item.scoreItem).toFixed(2)
            : '-';

        // Format standar dan qty
        const standarDisplay = item.standar !== null && item.standar !== undefined ? item.standar : 0;
        const qtyDisplay = item.qty !== null && item.qty !== undefined ? item.qty : 0;

        const tanggalFormatted = item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        }) : '-';

        return `<tr>
            <td class="text-center">${index + 1}</td>
            <td>${item.peruntukan}</td>
            <td>${item.targetName}</td>
            <td>${item.equipmentName}</td>
            <td class="text-center">${standarDisplay}</td>
            <td class="text-center">${qtyDisplay}</td>
            <td class="text-center"><span class="badge bg-${fisikClass}">${fisikText}</span></td>
            <td class="text-center"><span class="badge bg-${fungsiClass}">${fungsiText}</span></td>
            <td class="text-center"><span class="badge bg-${kontrakClass}">${kontrakText}</span></td>
            <td class="text-center"><span class="badge bg-${nilaiClass}">${nilaiDisplay}</span></td>
            <td class="text-center text-success"><small>${tanggalFormatted}</small></td>
        </tr>`;
    }).join('');

    tbody.innerHTML = rows || '<tr><td colspan="11" class="text-center text-muted py-3">Tidak ada data</td></tr>';

    // Show modal
    const modal = new bootstrap.Modal(document.getElementById('equipmentIssuesModal'));
    modal.show();
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

async function loadUIDEntryRealizationChart() {
    const chartEl = document.getElementById('uidEntryRealizationChart');
    if (!chartEl) return;

    try {
        const client = getSupabaseClient();
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const { data: units } = await client.from('units').select('unit_code, unit_name').order('unit_name');
        const { data: assessments } = await client
            .from('assessments')
            .select('id, vendors(unit_code), peruntukan(jenis, deskripsi)')
            .gte('tanggal_penilaian', firstDayOfMonth.toISOString())
            .lte('tanggal_penilaian', lastDayOfMonth.toISOString());

        const unitCounts = {};
        units?.forEach(u => { unitCounts[u.unit_code] = { name: u.unit_name, personal: 0, regu: 0 }; });

        assessments?.forEach(a => {
            const unitCode = a.vendors?.unit_code;
            if (unitCode && unitCounts[unitCode]) {
                if (a.peruntukan?.jenis === 'Personal') unitCounts[unitCode].personal++;
                else unitCounts[unitCode].regu++;
            }
        });

        const activeUnits = Object.entries(unitCounts)
            .filter(([_, data]) => data.personal + data.regu > 0)
            .sort((a, b) => (b[1].personal + b[1].regu) - (a[1].personal + a[1].regu));

        const categories = activeUnits.map(([code]) => code);
        const personalData = activeUnits.map(([_, data]) => data.personal);
        const reguData = activeUnits.map(([_, data]) => data.regu);

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
        // Chart error
    }
}

async function loadUIDTrendChart() {
    const chartEl = document.getElementById('uidTrendChart');
    if (!chartEl) return;

    try {
        const client = getSupabaseClient();
        const months = [];
        const now = new Date();
        for (let i = 5; i >= 0; i--) {
            const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
            months.push({
                label: date.toLocaleDateString('id-ID', { month: 'short', year: '2-digit' }),
                start: new Date(date.getFullYear(), date.getMonth(), 1),
                end: new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59)
            });
        }

        const monthlyData = await Promise.all(months.map(async (month) => {
            const { data, error } = await client.from('assessments')
                .select('id', { count: 'exact' })
                .gte('tanggal_penilaian', month.start.toISOString())
                .lte('tanggal_penilaian', month.end.toISOString());
            if (error) return 0;
            return data?.length || 0;
        }));

        const options = {
            series: [{ name: 'Jumlah Penilaian', data: monthlyData }],
            chart: { height: 250, type: 'area', toolbar: { show: false }, fontFamily: 'inherit' },
            colors: ['#4154f1'],
            fill: { type: 'gradient', gradient: { shadeIntensity: 1, opacityFrom: 0.4, opacityTo: 0.1, stops: [0, 90, 100] } },
            dataLabels: { enabled: false },
            stroke: { curve: 'smooth', width: 2 },
            xaxis: { categories: months.map(m => m.label) },
            yaxis: { min: 0, forceNiceScale: true },
            tooltip: { y: { formatter: (val) => val + ' penilaian' } }
        };

        new ApexCharts(chartEl, options).render();
    } catch (error) {
        chartEl.innerHTML = '<p class="text-center text-muted py-4">Gagal memuat chart</p>';
    }
}
