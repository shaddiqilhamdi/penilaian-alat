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

        // ========== DATA DARI ASSESSMENTS (untuk Total Penilaian, Vendor, Unit, Kendaraan, Personil) ==========
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

        // ========== DATA DARI VENDOR_ASSETS (untuk Rata-rata, Tidak Layak, Tidak Berfungsi) ==========
        const { data: assets, error: assetsError } = await client
            .from('vendor_assets')
            .select(`
                id, nilai, kondisi_fisik, kondisi_fungsi,
                peruntukan(jenis)
            `)
            .gte('last_assessment_date', firstDayOfMonth.toISOString())
            .lte('last_assessment_date', lastDayOfMonth.toISOString());

        if (assetsError) throw assetsError;

        const personalAssets = assets?.filter(a => a.peruntukan?.jenis === 'Personal') || [];
        const reguAssets = assets?.filter(a => a.peruntukan?.jenis === 'Regu') || [];

        // Hitung rata-rata dari vendor_assets.nilai
        const avgScore = assets?.length > 0
            ? (assets.reduce((sum, a) => sum + (a.nilai || 0), 0) / assets.length)
            : 0;
        const avgPersonal = personalAssets.length > 0
            ? (personalAssets.reduce((sum, a) => sum + (a.nilai || 0), 0) / personalAssets.length)
            : 0;
        const avgRegu = reguAssets.length > 0
            ? (reguAssets.reduce((sum, a) => sum + (a.nilai || 0), 0) / reguAssets.length)
            : 0;

        // Hitung tidak layak dan tidak berfungsi dari vendor_assets
        const tidakLayak = assets?.filter(a => a.kondisi_fisik === -1).length || 0;
        const tidakBerfungsi = assets?.filter(a => a.kondisi_fungsi === -1).length || 0;
        const tidakLayakPersonal = personalAssets.filter(a => a.kondisi_fisik === -1).length;
        const tidakLayakRegu = reguAssets.filter(a => a.kondisi_fisik === -1).length;
        const tidakBerfungsiPersonal = personalAssets.filter(a => a.kondisi_fungsi === -1).length;
        const tidakBerfungsiRegu = reguAssets.filter(a => a.kondisi_fungsi === -1).length;

        // Update DOM
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

        window.uidDashboardData = { assessments, personalAssessments, reguAssessments, assets, personalAssets, reguAssets };
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

        // Get all units
        const { data: units } = await client.from('units').select('unit_code, unit_name').order('unit_name');

        // Query dari vendor_assets dengan filter last_assessment_date bulan ini
        const { data: assets, error } = await client
            .from('vendor_assets')
            .select(`
                id,
                vendor_id,
                team_id,
                personnel_id,
                peruntukan_id,
                kondisi_fisik,
                kondisi_fungsi,
                kesesuaian_kontrak,
                nilai,
                last_assessment_date,
                vendors(unit_code, unit_name),
                peruntukan(jenis)
            `)
            .gte('last_assessment_date', firstDayOfMonth.toISOString())
            .lte('last_assessment_date', lastDayOfMonth.toISOString());

        if (error) throw error;

        // Initialize stats per unit
        const unitStats = {};
        units?.forEach(u => {
            unitStats[u.unit_code] = {
                name: u.unit_name,
                totalEquipment: 0,
                teams: new Set(),
                personnel: new Set(),
                personalItems: [],
                reguItems: [],
                allItems: []
            };
        });

        // Process vendor_assets data
        assets?.forEach(asset => {
            const unitCode = asset.vendors?.unit_code;
            if (unitCode && unitStats[unitCode]) {
                unitStats[unitCode].totalEquipment++;

                if (asset.team_id) unitStats[unitCode].teams.add(asset.team_id);
                if (asset.personnel_id) unitStats[unitCode].personnel.add(asset.personnel_id);

                const isPersonal = asset.peruntukan?.jenis === 'Personal';
                const itemData = {
                    nilai: asset.nilai,
                    kondisi_fisik: asset.kondisi_fisik,
                    kondisi_fungsi: asset.kondisi_fungsi,
                    kesesuaian_kontrak: asset.kesesuaian_kontrak
                };

                unitStats[unitCode].allItems.push(itemData);
                if (isPersonal) unitStats[unitCode].personalItems.push(itemData);
                else unitStats[unitCode].reguItems.push(itemData);
            }
        });

        // Render rows
        const rows = Object.entries(unitStats)
            .filter(([_, stats]) => stats.totalEquipment > 0)
            .sort((a, b) => b[1].totalEquipment - a[1].totalEquipment)
            .map(([code, stats]) => {
                const avgScore = stats.allItems.length > 0
                    ? (stats.allItems.reduce((s, i) => s + (i.nilai || 0), 0) / stats.allItems.length).toFixed(2)
                    : '-';
                const avgPersonal = stats.personalItems.length > 0
                    ? (stats.personalItems.reduce((s, i) => s + (i.nilai || 0), 0) / stats.personalItems.length).toFixed(2)
                    : '-';
                const avgRegu = stats.reguItems.length > 0
                    ? (stats.reguItems.reduce((s, i) => s + (i.nilai || 0), 0) / stats.reguItems.length).toFixed(2)
                    : '-';

                const tlFisik = stats.allItems.filter(i => i.kondisi_fisik === -1).length;
                const tbFungsi = stats.allItems.filter(i => i.kondisi_fungsi === -1).length;
                const kontrakOk = stats.allItems.filter(i => i.kesesuaian_kontrak >= 2).length;
                const kontrakPct = stats.allItems.length > 0 ? ((kontrakOk / stats.allItems.length) * 100).toFixed(0) : 0;
                const scoreClass = avgScore >= 1.5 ? 'success' : avgScore >= 0 ? 'warning' : 'danger';

                return `<tr style="cursor: pointer;" onclick="showUnitReportModal('${code}', '${stats.name}')">
                    <td><strong>${code}</strong><br><small class="text-muted">${stats.name}</small></td>
                    <td class="text-center">${stats.totalEquipment}</td>
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
        console.error('Error loading unit recap:', error);
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
                last_assessment_id,
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
                kategori: asset.equipment_master?.kategori || '-',
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
                scoreItem: asset.nilai,
                // Untuk detail jumlah tidak layak/tidak berfungsi
                last_assessment_id: asset.last_assessment_id,
                equipment_id: asset.equipment_id
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
async function showEquipmentIssuesModal(unitCode) {
    const data = window.uidEquipmentIssuesData[unitCode];
    if (!data || data.length === 0) return;

    // Set modal title
    document.getElementById('modalUnitCode').textContent = unitCode;
    document.getElementById('modalTotalItems').textContent = data.length + ' item';

    const tbody = document.getElementById('tbody-equipment-issues');
    tbody.innerHTML = '<tr><td colspan="12" class="text-center text-muted">Loading detail...</td></tr>';

    // Show modal first
    const modal = new bootstrap.Modal(document.getElementById('equipmentIssuesModal'));
    modal.show();

    try {
        // Fetch assessment_items untuk mendapatkan detail jumlah tidak layak/tidak berfungsi
        const client = getSupabaseClient();
        const assessmentIds = [...new Set(data.map(d => d.last_assessment_id).filter(Boolean))];

        let itemsMap = {};
        if (assessmentIds.length > 0) {
            const { data: items } = await client
                .from('assessment_items')
                .select('assessment_id, equipment_id, tidak_layak, tidak_berfungsi, layak, berfungsi')
                .in('assessment_id', assessmentIds);

            (items || []).forEach(item => {
                const key = `${item.assessment_id}_${item.equipment_id}`;
                itemsMap[key] = item;
            });
        }

        // Render table rows
        const rows = data.map((item, index) => {
            // Get detail dari assessment_items
            const itemKey = `${item.last_assessment_id}_${item.equipment_id}`;
            const assessmentItem = itemsMap[itemKey] || {};

            const tidakLayak = assessmentItem.tidak_layak || 0;
            const tidakBerfungsi = assessmentItem.tidak_berfungsi || 0;
            const layak = assessmentItem.layak || 0;
            const berfungsi = assessmentItem.berfungsi || 0;

            // Kondisi Fisik: tampilkan jumlah tidak layak
            const kondisiClass = tidakLayak === 0 ? 'success' : 'danger';
            const kondisiText = tidakLayak === 0 ? 'OK' : `${tidakLayak} TL`;

            // Fungsi: tampilkan jumlah tidak berfungsi
            const fungsiClass = tidakBerfungsi === 0 ? 'success' : 'warning';
            const fungsiText = tidakBerfungsi === 0 ? 'OK' : `${tidakBerfungsi} TB`;

            // Kontrak: Sesuai / Tidak Sesuai
            const kontrakClass = item.kesesuaianKontrak >= 2 ? 'success' : 'danger';
            const kontrakText = item.kesesuaianKontrak >= 2 ? 'Sesuai' : 'Tidak Sesuai';

            // Handle nilai
            const nilaiScore = item.scoreItem ?? 0;
            const nilaiClass = nilaiScore >= 1 ? 'success' : nilaiScore >= 0 ? 'warning' : 'danger';
            const nilaiDisplay = item.scoreItem !== null && item.scoreItem !== undefined
                ? Number(item.scoreItem).toFixed(2)
                : '-';

            // Format standar dan qty
            const standarDisplay = item.standar ?? 0;
            const qtyDisplay = item.qty ?? 0;

            const tanggalFormatted = item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID', {
                day: '2-digit', month: '2-digit', year: 'numeric',
                hour: '2-digit', minute: '2-digit'
            }) : '-';

            return `<tr>
                <td class="text-center">${index + 1}</td>
                <td>${item.peruntukan}</td>
                <td>${item.targetName}</td>
                <td>${item.equipmentName}</td>
                <td class="text-center"><small>${item.kategori}</small></td>
                <td class="text-center">${standarDisplay}</td>
                <td class="text-center">${qtyDisplay}</td>
                <td class="text-center"><span class="badge bg-${kondisiClass}">${kondisiText}</span></td>
                <td class="text-center"><span class="badge bg-${fungsiClass}">${fungsiText}</span></td>
                <td class="text-center"><span class="badge bg-${kontrakClass}">${kontrakText}</span></td>
                <td class="text-center"><span class="badge bg-${nilaiClass}">${nilaiDisplay}</span></td>
                <td class="text-center"><small>${tanggalFormatted}</small></td>
            </tr>`;
        }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="12" class="text-center text-muted py-3">Tidak ada data</td></tr>';
    } catch (error) {
        console.error('Error loading assessment items detail:', error);
        // Fallback: render tanpa detail assessment_items
        const rows = data.map((item, index) => {
            const kondisiClass = item.kondisiFisik === 0 ? 'success' : 'danger';
            const kondisiText = item.kondisiFisik === 0 ? 'OK' : 'TL';
            const fungsiClass = item.kondisiFungsi === 0 ? 'success' : 'warning';
            const fungsiText = item.kondisiFungsi === 0 ? 'OK' : 'TB';
            const kontrakClass = item.kesesuaianKontrak >= 2 ? 'success' : 'danger';
            const kontrakText = item.kesesuaianKontrak >= 2 ? 'Sesuai' : 'Tidak Sesuai';
            const nilaiScore = item.scoreItem ?? 0;
            const nilaiClass = nilaiScore >= 1 ? 'success' : nilaiScore >= 0 ? 'warning' : 'danger';
            const nilaiDisplay = item.scoreItem !== null ? Number(item.scoreItem).toFixed(2) : '-';
            const tanggalFormatted = item.tanggal ? new Date(item.tanggal).toLocaleDateString('id-ID', {
                day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
            }) : '-';

            return `<tr>
                <td class="text-center">${index + 1}</td>
                <td>${item.peruntukan}</td>
                <td>${item.targetName}</td>
                <td>${item.equipmentName}</td>
                <td class="text-center"><small>${item.kategori}</small></td>
                <td class="text-center">${item.standar ?? 0}</td>
                <td class="text-center">${item.qty ?? 0}</td>
                <td class="text-center"><span class="badge bg-${kondisiClass}">${kondisiText}</span></td>
                <td class="text-center"><span class="badge bg-${fungsiClass}">${fungsiText}</span></td>
                <td class="text-center"><span class="badge bg-${kontrakClass}">${kontrakText}</span></td>
                <td class="text-center"><span class="badge bg-${nilaiClass}">${nilaiDisplay}</span></td>
                <td class="text-center"><small>${tanggalFormatted}</small></td>
            </tr>`;
        }).join('');
        tbody.innerHTML = rows || '<tr><td colspan="12" class="text-center text-muted py-3">Tidak ada data</td></tr>';
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

        // Destroy existing chart to prevent memory leak
        if (window.uidTrendChart) {
            try { window.uidTrendChart.destroy(); } catch (e) { }
        }
        window.uidTrendChart = new ApexCharts(chartEl, options);
        window.uidTrendChart.render();
    } catch (error) {
        chartEl.innerHTML = '<p class="text-center text-muted py-4">Gagal memuat chart</p>';
    }
}

/**
 * Show Unit Report Modal - Raport detail per unit
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
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
        const periodLabel = now.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

        // Query vendor_assets untuk unit ini
        const { data: assets, error } = await client
            .from('vendor_assets')
            .select(`
                id, vendor_id, team_id, personnel_id, peruntukan_id, equipment_id,
                kondisi_fisik, kondisi_fungsi, kesesuaian_kontrak, nilai, realisasi_qty,
                last_assessment_date,
                vendors(id, vendor_name, unit_code),
                peruntukan(id, jenis, deskripsi),
                equipment_master(id, nama_alat, kategori)
            `)
            .eq('vendors.unit_code', unitCode)
            .gte('last_assessment_date', firstDayOfMonth.toISOString())
            .lte('last_assessment_date', lastDayOfMonth.toISOString());

        if (error) throw error;

        // Filter karena eq pada relasi bisa tidak bekerja sempurna
        const unitAssets = assets?.filter(a => a.vendors?.unit_code === unitCode) || [];

        // Hitung statistik
        const totalEquipment = unitAssets.length;
        const personalAssets = unitAssets.filter(a => a.peruntukan?.jenis === 'Personal');
        const reguAssets = unitAssets.filter(a => a.peruntukan?.jenis === 'Regu');

        const avgScore = totalEquipment > 0 ? (unitAssets.reduce((s, a) => s + (a.nilai || 0), 0) / totalEquipment) : 0;
        const avgPersonal = personalAssets.length > 0 ? (personalAssets.reduce((s, a) => s + (a.nilai || 0), 0) / personalAssets.length) : 0;
        const avgRegu = reguAssets.length > 0 ? (reguAssets.reduce((s, a) => s + (a.nilai || 0), 0) / reguAssets.length) : 0;

        const tlFisik = unitAssets.filter(a => a.kondisi_fisik === -1).length;
        const tbFungsi = unitAssets.filter(a => a.kondisi_fungsi === -1).length;
        const kontrakOk = unitAssets.filter(a => a.kesesuaian_kontrak >= 2).length;
        const kontrakPct = totalEquipment > 0 ? ((kontrakOk / totalEquipment) * 100) : 0;

        const uniqueTeams = new Set(unitAssets.map(a => a.team_id).filter(Boolean)).size;
        const uniquePersonnel = new Set(unitAssets.map(a => a.personnel_id).filter(Boolean)).size;

        // Group by Peruntukan
        const peruntukanStats = {};
        unitAssets.forEach(a => {
            const key = a.peruntukan?.deskripsi || a.peruntukan_id || 'Lainnya';
            if (!peruntukanStats[key]) {
                peruntukanStats[key] = { jenis: a.peruntukan?.jenis || '-', count: 0, totalNilai: 0, tlFisik: 0, tbFungsi: 0 };
            }
            peruntukanStats[key].count++;
            peruntukanStats[key].totalNilai += a.nilai || 0;
            if (a.kondisi_fisik === -1) peruntukanStats[key].tlFisik++;
            if (a.kondisi_fungsi === -1) peruntukanStats[key].tbFungsi++;
        });

        // Group by Vendor
        const vendorStats = {};
        unitAssets.forEach(a => {
            const vendorName = a.vendors?.vendor_name || 'Unknown';
            if (!vendorStats[vendorName]) {
                vendorStats[vendorName] = { count: 0, totalNilai: 0, tlFisik: 0, tbFungsi: 0 };
            }
            vendorStats[vendorName].count++;
            vendorStats[vendorName].totalNilai += a.nilai || 0;
            if (a.kondisi_fisik === -1) vendorStats[vendorName].tlFisik++;
            if (a.kondisi_fungsi === -1) vendorStats[vendorName].tbFungsi++;
        });

        // Equipment bermasalah
        const issueEquipments = unitAssets.filter(a => a.kondisi_fisik === -1 || a.kondisi_fungsi === -1);

        // Grade calculation
        const getGrade = (score) => {
            if (score >= 1.5) return { grade: 'A', class: 'success', label: 'Sangat Baik' };
            if (score >= 1.0) return { grade: 'B', class: 'info', label: 'Baik' };
            if (score >= 0.5) return { grade: 'C', class: 'warning', label: 'Cukup' };
            if (score >= 0) return { grade: 'D', class: 'warning', label: 'Kurang' };
            return { grade: 'E', class: 'danger', label: 'Buruk' };
        };

        const overallGrade = getGrade(avgScore);

        // Render report
        const reportHTML = `
            <!-- Print Header -->
            <div class="d-none d-print-block text-center mb-4">
                <h4 class="mb-1">RAPORT PENILAIAN ALAT KERJA</h4>
                <h5 class="mb-3">${unitCode} - ${unitName}</h5>
                <p class="text-muted">Periode: ${periodLabel}</p>
                <hr>
            </div>

            <!-- Unit Header -->
            <div class="row mb-3">
                <div class="col-12">
                    <div class="bg-light rounded p-2">
                        <div class="row align-items-center">
                            <div class="col-md-8">
                                <h5 class="mb-0">${unitCode} - ${unitName}</h5>
                                <small class="text-muted">Periode: ${periodLabel}</small>
                            </div>
                            <div class="col-md-4 text-end">
                                <div class="h2 mb-0 fw-bold text-${overallGrade.class}">${avgScore.toFixed(2)}</div>
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
                        <h5 class="mb-0">${totalEquipment}</h5>
                        <small style="font-size: 0.65rem;">&nbsp;</small>
                    </div>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Avg Nilai</small>
                        <h5 class="mb-0 text-${overallGrade.class}">${avgScore.toFixed(2)}</h5>
                        <small style="font-size: 0.65rem;">&nbsp;</small>
                    </div>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Personal</small>
                        <h5 class="mb-0 text-info">${avgPersonal.toFixed(2)}</h5>
                        <small class="text-muted" style="font-size: 0.65rem;">${personalAssets.length} eq</small>
                    </div>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Regu</small>
                        <h5 class="mb-0 text-warning">${avgRegu.toFixed(2)}</h5>
                        <small class="text-muted" style="font-size: 0.65rem;">${reguAssets.length} eq</small>
                    </div>
                </div>
                <div class="col-md-2 col-4">
                    <div class="border rounded p-2 text-center h-100">
                        <small class="text-muted d-block" style="font-size: 0.7rem;">Kontrak</small>
                        <h5 class="mb-0 ${kontrakPct >= 80 ? 'text-success' : kontrakPct >= 50 ? 'text-warning' : 'text-danger'}">${kontrakPct.toFixed(0)}%</h5>
                        <small class="text-muted" style="font-size: 0.65rem;">${kontrakOk}/${totalEquipment}</small>
                    </div>
                </div>
                <div class="col-md-1 col-2">
                    <div class="border border-danger rounded p-2 text-center h-100">
                        <small class="text-danger d-block" style="font-size: 0.7rem;">TL</small>
                        <h5 class="mb-0 text-danger">${tlFisik}</h5>
                        <small style="font-size: 0.65rem;">&nbsp;</small>
                    </div>
                </div>
                <div class="col-md-1 col-2">
                    <div class="border border-warning rounded p-2 text-center h-100">
                        <small class="text-warning d-block" style="font-size: 0.7rem;">TB</small>
                        <h5 class="mb-0 text-warning">${tbFungsi}</h5>
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
                                <th class="text-center">Jenis</th>
                                <th class="text-center">Equipment</th>
                                <th class="text-center">Avg Nilai</th>
                                <th class="text-center text-danger">TL</th>
                                <th class="text-center text-warning">TB</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${Object.entries(peruntukanStats).map(([name, stat]) => {
            const avg = stat.count > 0 ? (stat.totalNilai / stat.count).toFixed(2) : '-';
            const avgClass = avg >= 1.5 ? 'success' : avg >= 0 ? 'warning' : 'danger';
            return `<tr>
                                    <td>${name}</td>
                                    <td class="text-center"><span class="badge bg-${stat.jenis === 'Personal' ? 'info' : 'warning'}">${stat.jenis}</span></td>
                                    <td class="text-center">${stat.count}</td>
                                    <td class="text-center"><span class="badge bg-${avgClass}">${avg}</span></td>
                                    <td class="text-center text-danger">${stat.tlFisik || '-'}</td>
                                    <td class="text-center text-warning">${stat.tbFungsi || '-'}</td>
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
                            ${Object.entries(vendorStats).sort((a, b) => b[1].count - a[1].count).map(([name, stat]) => {
            const avg = stat.count > 0 ? (stat.totalNilai / stat.count).toFixed(2) : '-';
            const avgClass = avg >= 1.5 ? 'success' : avg >= 0 ? 'warning' : 'danger';
            return `<tr>
                                    <td>${name}</td>
                                    <td class="text-center">${stat.count}</td>
                                    <td class="text-center"><span class="badge bg-${avgClass}">${avg}</span></td>
                                    <td class="text-center text-danger">${stat.tlFisik || '-'}</td>
                                    <td class="text-center text-warning">${stat.tbFungsi || '-'}</td>
                                </tr>`;
        }).join('')}
                        </tbody>
                    </table>
                </div>
            </div>

            <!-- Equipment Issues List -->
            ${issueEquipments.length > 0 ? `
            <div class="mb-3">
                <h6 class="border-bottom pb-1 mb-2 text-danger"><i class="bi bi-exclamation-triangle me-2"></i>Daftar Equipment Bermasalah (${issueEquipments.length})</h6>
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
                            ${issueEquipments.slice(0, 20).map((eq, idx) => {
            const kondisiClass = eq.kondisi_fisik === -1 ? 'danger' : 'success';
            const fungsiClass = eq.kondisi_fungsi === -1 ? 'warning' : 'success';
            return `<tr>
                                    <td>${idx + 1}</td>
                                    <td>${eq.equipment_master?.nama_alat || '-'}</td>
                                    <td>${eq.vendors?.vendor_name || '-'}</td>
                                    <td>${eq.peruntukan?.deskripsi || '-'}</td>
                                    <td class="text-center"><span class="badge bg-${kondisiClass}">${eq.kondisi_fisik === -1 ? 'TL' : 'OK'}</span></td>
                                    <td class="text-center"><span class="badge bg-${fungsiClass}">${eq.kondisi_fungsi === -1 ? 'TB' : 'OK'}</span></td>
                                    <td class="text-center">${eq.nilai?.toFixed(2) || '-'}</td>
                                </tr>`;
        }).join('')}
                            ${issueEquipments.length > 20 ? `<tr><td colspan="7" class="text-center text-muted">... dan ${issueEquipments.length - 20} item lainnya</td></tr>` : ''}
                        </tbody>
                    </table>
                </div>
            </div>
            ` : ''}

            <!-- Footer -->
            <div class="text-center text-muted small mt-3 pt-2 border-top">
                <p class="mb-1">Dicetak pada: ${new Date().toLocaleString('id-ID')}</p>
                <p class="mb-0">Sistem Penilaian Alat Kerja</p>
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
