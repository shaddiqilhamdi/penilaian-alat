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

async function loadUIDEquipmentIssuesByUnit() {
    const tbody = document.querySelector('#uidIssuesByUnitTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading...</td></tr>';

    try {
        const client = getSupabaseClient();
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        const { data: recentAssessments, error: assessError } = await client
            .from('assessments')
            .select('id, vendor_id, peruntukan_id, vendors(unit_code, unit_name), peruntukan(jenis, deskripsi)')
            .gte('tanggal_penilaian', firstDayOfMonth.toISOString())
            .lte('tanggal_penilaian', lastDayOfMonth.toISOString());

        if (assessError) throw assessError;

        if (!recentAssessments || recentAssessments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada penilaian bulan ini</td></tr>';
            return;
        }

        const assessmentIds = recentAssessments.map(a => a.id);
        const { data: items, error } = await client
            .from('assessment_items')
            .select('id, kondisi_fisik, kondisi_fungsi, assessment_id')
            .in('assessment_id', assessmentIds)
            .or('kondisi_fisik.eq.-1,kondisi_fungsi.eq.-1');

        if (error) throw error;

        const unitIssues = {};
        items.forEach(item => {
            const assessment = recentAssessments.find(a => a.id === item.assessment_id);
            if (!assessment) return;

            const unitCode = assessment.vendors?.unit_code || 'Unknown';
            const unitName = assessment.vendors?.unit_name || unitCode;
            const isPersonal = assessment.peruntukan?.jenis === 'Personal';

            if (!unitIssues[unitCode]) {
                unitIssues[unitCode] = { name: unitName, tlPersonal: 0, tlRegu: 0, tbPersonal: 0, tbRegu: 0 };
            }

            if (item.kondisi_fisik === -1) {
                if (isPersonal) unitIssues[unitCode].tlPersonal++;
                else unitIssues[unitCode].tlRegu++;
            }
            if (item.kondisi_fungsi === -1) {
                if (isPersonal) unitIssues[unitCode].tbPersonal++;
                else unitIssues[unitCode].tbRegu++;
            }
        });

        if (Object.keys(unitIssues).length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada equipment bermasalah</td></tr>';
            return;
        }

        const rows = Object.entries(unitIssues)
            .sort((a, b) => {
                const totalA = a[1].tlPersonal + a[1].tlRegu + a[1].tbPersonal + a[1].tbRegu;
                const totalB = b[1].tlPersonal + b[1].tlRegu + b[1].tbPersonal + b[1].tbRegu;
                return totalB - totalA;
            })
            .map(([unitId, data]) => {
                const total = data.tlPersonal + data.tlRegu + data.tbPersonal + data.tbRegu;
                return `<tr>
                    <td><strong>${unitId}</strong></td>
                    <td class="text-center"><span class="badge bg-danger">${data.tlPersonal}</span></td>
                    <td class="text-center"><span class="badge bg-danger">${data.tlRegu}</span></td>
                    <td class="text-center"><span class="badge bg-warning">${data.tbPersonal}</span></td>
                    <td class="text-center"><span class="badge bg-warning">${data.tbRegu}</span></td>
                    <td class="text-center"><strong>${total}</strong></td>
                </tr>`;
            }).join('');

        tbody.innerHTML = rows;
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
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

        new ApexCharts(chartEl, options).render();
    } catch (error) {
        chartEl.innerHTML = '<p class="text-center text-muted py-4">Gagal memuat chart</p>';
    }
}
