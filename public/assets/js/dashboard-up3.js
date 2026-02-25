/**
 * Dashboard UP3 Module
 * Handle UP3 Admin/User and Vendor K3 dashboard functions
 */

async function loadUP3Dashboard() {
    try {
        // Load basic stats
        await loadUP3Stats();

        // Load daily entry chart
        await loadUP3DailyChart();

        // Load vendor recap per peruntukan
        await loadUP3VendorRecap();

        // Load equipment issues for this unit
        await loadUP3EquipmentIssues();
    } catch (error) {
        // Dashboard error
    }
}

async function loadUP3Stats() {
    try {
        const userUnitCode = window.currentUser?.unit_code;
        const userVendorId = window.currentUser?.vendor_id;

        const client = getSupabaseClient();

        // Get current month date range
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        let vendorIds = [];

        // For vendor_k3: filter by their vendor only
        if (userVendorId) {
            vendorIds = [userVendorId];
        } else if (userUnitCode) {
            // For up3_admin/up3_user: get all vendors in this unit
            const { data: unitVendors, error: vendorError } = await client
                .from('vendors')
                .select('id')
                .eq('unit_code', userUnitCode);

            if (vendorError) throw vendorError;
            vendorIds = unitVendors?.map(v => v.id) || [];
        }

        if (vendorIds.length === 0) {
            document.getElementById('up3TotalAssessments').textContent = '0';
            document.getElementById('up3TotalEquipment').textContent = '0';
            document.getElementById('up3AvgScore').textContent = '0.00';
            document.getElementById('up3PersonalScoreBadge').textContent = 'P: 0.00';
            document.getElementById('up3ReguScoreBadge').textContent = 'R: 0.00';
            document.getElementById('up3KontrakPct').textContent = '0%';
            document.getElementById('up3JumlahKendaraan').textContent = '0';
            document.getElementById('up3JumlahPersonil').textContent = '0';
            renderUP3KondisiDonut(0, 0, { tlPersonal: 0, tlRegu: 0, tbPersonal: 0, tbRegu: 0 });
            window.up3VendorIds = [];
            return;
        }

        // Store vendorIds early for other functions
        window.up3VendorIds = vendorIds;
        console.log('UP3 vendorIds set:', vendorIds);

        // Query assessments for vendors and current month (for assessment count)
        const { data: assessments, error: assessmentsError } = await client
            .from('assessments')
            .select('id, vendor_id')
            .in('vendor_id', vendorIds)
            .gte('tanggal_penilaian', firstDayOfMonth.toISOString())
            .lte('tanggal_penilaian', lastDayOfMonth.toISOString());

        if (assessmentsError) throw assessmentsError;

        // Calculate assessment stats
        const totalAssessments = assessments?.length || 0;

        // Get vendor_assets for equipment stats (current month) with peruntukan info
        const { data: vendorAssets, error: assetsError } = await client
            .from('vendor_assets')
            .select(`
                id, nilai, kondisi_fisik, kondisi_fungsi, kesesuaian_kontrak,
                equipment_master(jenis)
            `)
            .in('vendor_id', vendorIds)
            .gte('last_assessment_date', firstDayOfMonth.toISOString())
            .lte('last_assessment_date', lastDayOfMonth.toISOString())
            .range(0, 9999);

        if (assetsError) throw assetsError;

        const totalEquipment = vendorAssets?.length || 0;
        const avgScore = totalEquipment > 0
            ? (vendorAssets.reduce((sum, asset) => sum + (asset.nilai || 0), 0) / totalEquipment)
            : 0;

        // Calculate Personal vs Regu scores
        const personalAssets = vendorAssets?.filter(a => a.equipment_master?.jenis === 'Personal') || [];
        const reguAssets = vendorAssets?.filter(a => a.equipment_master?.jenis === 'Regu') || [];
        const avgPersonal = personalAssets.length > 0
            ? (personalAssets.reduce((sum, a) => sum + (a.nilai || 0), 0) / personalAssets.length)
            : 0;
        const avgRegu = reguAssets.length > 0
            ? (reguAssets.reduce((sum, a) => sum + (a.nilai || 0), 0) / reguAssets.length)
            : 0;

        // Calculate TL and TB counts
        const tidakLayak = vendorAssets?.filter(a => a.kondisi_fisik === -1).length || 0;
        const tidakBerfungsi = vendorAssets?.filter(a => a.kondisi_fungsi === -1).length || 0;

        // Calculate contract fulfillment percentage
        const kontrakOk = vendorAssets?.filter(a => a.kesesuaian_kontrak === 2).length || 0;
        const kontrakPct = totalEquipment > 0 ? (kontrakOk / totalEquipment * 100) : 0;

        // Update UI
        document.getElementById('up3TotalAssessments').textContent = totalAssessments;
        document.getElementById('up3TotalEquipment').textContent = totalEquipment;

        const avgScoreEl = document.getElementById('up3AvgScore');
        avgScoreEl.textContent = avgScore.toFixed(2);
        avgScoreEl.className = avgScore >= 1.8 ? 'text-success' : avgScore >= 1.5 ? 'text-warning' : 'text-danger';

        document.getElementById('up3PersonalScoreBadge').textContent = 'P: ' + avgPersonal.toFixed(2);
        document.getElementById('up3ReguScoreBadge').textContent = 'R: ' + avgRegu.toFixed(2);
        document.getElementById('up3KontrakPct').textContent = kontrakPct.toFixed(0) + '%';

        // Render Kondisi Alat donut chart
        const bermasalah = new Set([
            ...vendorAssets.filter(a => a.kondisi_fisik === -1).map(a => a.id),
            ...vendorAssets.filter(a => a.kondisi_fungsi === -1).map(a => a.id)
        ]).size;
        const baik = totalEquipment - bermasalah;

        // Breakdown TL/TB by jenis
        const tlPersonal = vendorAssets.filter(a => a.kondisi_fisik === -1 && a.equipment_master?.jenis === 'Personal').length;
        const tlRegu = vendorAssets.filter(a => a.kondisi_fisik === -1 && a.equipment_master?.jenis === 'Regu').length;
        const tbPersonal = vendorAssets.filter(a => a.kondisi_fungsi === -1 && a.equipment_master?.jenis === 'Personal').length;
        const tbRegu = vendorAssets.filter(a => a.kondisi_fungsi === -1 && a.equipment_master?.jenis === 'Regu').length;

        renderUP3KondisiDonut(baik, bermasalah, { tlPersonal, tlRegu, tbPersonal, tbRegu });

        // Load Kendaraan (teams) and Personil counts
        const [teamsResult, personnelResult] = await Promise.all([
            client.from('teams').select('id', { count: 'exact', head: true }).in('vendor_id', vendorIds),
            client.from('personnel').select('id', { count: 'exact', head: true }).in('vendor_id', vendorIds)
        ]);
        document.getElementById('up3JumlahKendaraan').textContent = teamsResult.count || 0;
        document.getElementById('up3JumlahPersonil').textContent = personnelResult.count || 0;
    } catch (error) {
        console.error('Error loading UP3 stats:', error);
        document.getElementById('up3TotalAssessments').textContent = 'Error';
        document.getElementById('up3TotalEquipment').textContent = 'Error';
        document.getElementById('up3AvgScore').textContent = 'Error';
        document.getElementById('up3PersonalScoreBadge').textContent = 'P: -';
        document.getElementById('up3ReguScoreBadge').textContent = 'R: -';
        document.getElementById('up3KontrakPct').textContent = '-';
        document.getElementById('up3JumlahKendaraan').textContent = '-';
        document.getElementById('up3JumlahPersonil').textContent = '-';
    }
}

function renderUP3KondisiDonut(baik, bermasalah, breakdown) {
    const el = document.getElementById('up3KondisiDonut');
    if (!el) return;

    el.innerHTML = '';
    if (window.up3KondisiChart) {
        try { window.up3KondisiChart.destroy(); } catch (e) { }
    }

    const total = baik + bermasalah;
    const options = {
        series: [baik, bermasalah],
        chart: { type: 'donut', height: 220 },
        labels: ['Baik', 'Bermasalah'],
        colors: ['#2eca6a', '#ff771d'],
        plotOptions: {
            pie: {
                donut: {
                    size: '70%',
                    labels: {
                        show: true,
                        name: { show: true, fontSize: '13px', offsetY: -4 },
                        value: { show: true, fontSize: '18px', fontWeight: 700, offsetY: 4 },
                        total: {
                            show: true,
                            label: 'Total',
                            fontSize: '12px',
                            formatter: () => total
                        }
                    }
                }
            }
        },
        dataLabels: { enabled: false },
        legend: {
            position: 'bottom',
            fontSize: '11px',
            markers: { width: 8, height: 8, fillColors: ['#2eca6a', '#ff771d'] },
            itemMargin: { horizontal: 8 }
        },
        tooltip: {
            y: {
                formatter: function (val) {
                    const pct = total > 0 ? (val / total * 100).toFixed(1) : 0;
                    return val + ' (' + pct + '%)';
                }
            }
        }
    };

    window.up3KondisiChart = new ApexCharts(el, options);
    window.up3KondisiChart.render();

    // Render breakdown detail
    const detailEl = document.getElementById('up3KondisiDetail');
    if (detailEl && breakdown) {
        const { tlPersonal, tlRegu, tbPersonal, tbRegu } = breakdown;
        const tlTotal = tlPersonal + tlRegu;
        const tbTotal = tbPersonal + tbRegu;

        const item = (label, val) => val > 0 ? `<span class="text-muted">${label}</span> <b>${val}</b>` : '';
        const sep = (a, b) => (a && b) ? '&nbsp;&middot;&nbsp;' : '';

        const tlP = item('Personal', tlPersonal);
        const tlR = item('Regu', tlRegu);
        const tbP = item('Personal', tbPersonal);
        const tbR = item('Regu', tbRegu);

        let html = `<div class="d-flex justify-content-center gap-4 mt-1" style="font-size:.78rem">`;
        html += `<div class="text-center">`;
        html += `<div class="text-danger fw-semibold mb-1">Tdk Layak: ${tlTotal}</div>`;
        html += `<div>${tlP}${sep(tlP, tlR)}${tlR}${tlTotal === 0 ? '<span class="text-muted">-</span>' : ''}</div>`;
        html += `</div>`;
        html += `<div class="text-center">`;
        html += `<div class="text-warning fw-semibold mb-1">Tdk Fungsi: ${tbTotal}</div>`;
        html += `<div>${tbP}${sep(tbP, tbR)}${tbR}${tbTotal === 0 ? '<span class="text-muted">-</span>' : ''}</div>`;
        html += `</div>`;
        html += `</div>`;
        detailEl.innerHTML = html;
    }
}

async function loadUP3VendorRecap() {
    const tbody = document.querySelector('#up3VendorRecapTable tbody');
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Loading...</td></tr>';

    try {
        const vendorIds = window.up3VendorIds || [];
        console.log('VendorRecap - vendorIds:', vendorIds);
        if (vendorIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Tidak ada vendor</td></tr>';
            return;
        }

        const client = getSupabaseClient();
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Get equipment_standards for these vendors (to show all peruntukan that should exist)
        const { data: standards, error: standardsError } = await client
            .from('equipment_standards')
            .select(`
                id, vendor_id, peruntukan_id, required_qty, contract_qty,
                vendors(vendor_name),
                peruntukan(deskripsi),
                equipment_master(jenis)
            `)
            .in('vendor_id', vendorIds);

        if (standardsError) throw standardsError;

        // Get count of teams per vendor+peruntukan
        const { data: teams, error: teamsError } = await client
            .from('teams')
            .select('id, vendor_id, peruntukan_id')
            .in('vendor_id', vendorIds);

        if (teamsError) throw teamsError;

        // Get count of personnel per vendor+peruntukan
        const { data: personnel, error: personnelError } = await client
            .from('personnel')
            .select('id, vendor_id, peruntukan_id')
            .in('vendor_id', vendorIds);

        if (personnelError) throw personnelError;

        // Get vendor_assets for current month
        const { data: vendorAssets, error: assetsError } = await client
            .from('vendor_assets')
            .select(`
                id, vendor_id, peruntukan_id, nilai, kondisi_fisik, kondisi_fungsi, kesesuaian_kontrak
            `)
            .in('vendor_id', vendorIds)
            .not('last_assessment_date', 'is', null)
            .gte('last_assessment_date', firstDayOfMonth.toISOString())
            .lte('last_assessment_date', lastDayOfMonth.toISOString())
            .range(0, 9999);

        if (assetsError) throw assetsError;

        // Group standards by vendor + peruntukan
        const recap = {};
        standards?.forEach(std => {
            const key = `${std.vendor_id}_${std.peruntukan_id}`;
            if (!recap[key]) {
                recap[key] = {
                    vendorId: std.vendor_id,
                    vendorName: std.vendors?.vendor_name || '-',
                    peruntukanId: std.peruntukan_id,
                    jenis: std.equipment_master?.jenis || '-',
                    peruntukan: std.peruntukan?.deskripsi || '-',
                    jumlah: 0,
                    equipmentCount: 0,
                    totalNilai: 0,
                    tidakLayak: 0,
                    tidakBerfungsi: 0,
                    kontrakOk: 0
                };
            }
        });

        // Count teams per vendor+peruntukan
        teams?.forEach(team => {
            const key = `${team.vendor_id}_${team.peruntukan_id}`;
            if (recap[key]) {
                recap[key].jumlah++;
            }
        });

        // Count personnel per vendor+peruntukan (for Personal type)
        personnel?.forEach(person => {
            const key = `${person.vendor_id}_${person.peruntukan_id}`;
            if (recap[key] && recap[key].jenis === 'Personal') {
                recap[key].jumlah++;
            }
        });

        // Aggregate vendor_assets data
        vendorAssets?.forEach(asset => {
            const key = `${asset.vendor_id}_${asset.peruntukan_id}`;
            if (recap[key]) {
                recap[key].equipmentCount++;
                recap[key].totalNilai += asset.nilai || 0;
                if (asset.kondisi_fisik === -1) recap[key].tidakLayak++;
                if (asset.kondisi_fungsi === -1) recap[key].tidakBerfungsi++;
                if (asset.kesesuaian_kontrak === 2) recap[key].kontrakOk++;
            }
        });

        // Render table
        const rows = Object.values(recap)
            .sort((a, b) => a.vendorName.localeCompare(b.vendorName) || a.jenis.localeCompare(b.jenis))
            .map(r => {
                const avgScore = r.equipmentCount > 0 ? (r.totalNilai / r.equipmentCount).toFixed(2) : '-';
                const scoreClass = avgScore >= 1.8 ? 'success' : avgScore >= 1.5 ? 'warning' : 'danger';
                const kontrakPct = r.equipmentCount > 0 ? (r.kontrakOk / r.equipmentCount * 100).toFixed(0) : 0;
                const kontrakClass = kontrakPct >= 80 ? 'success' : kontrakPct >= 50 ? 'warning' : 'danger';

                return `
                    <tr>
                        <td><strong>${r.vendorName}</strong></td>
                        <td>${r.peruntukan}</td>
                        <td class="text-center">${r.jumlah || '-'}</td>
                        <td class="text-center">${r.equipmentCount || '-'}</td>
                        <td class="text-center">${avgScore !== '-' ? `<span class="badge bg-${scoreClass}">${avgScore}</span>` : '-'}</td>
                        <td class="text-center">${r.tidakLayak || '-'}</td>
                        <td class="text-center">${r.tidakBerfungsi || '-'}</td>
                        <td class="text-center">${r.equipmentCount > 0 ? `<span class="badge bg-${kontrakClass}">${kontrakPct}%</span>` : '-'}</td>
                    </tr>
                `;
            }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="8" class="text-center text-muted">Tidak ada data</td></tr>';
    } catch (error) {
        console.error('Error loading UP3 vendor recap:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading data</td></tr>';
    }
}

async function loadUP3EquipmentIssues() {
    const tbody = document.querySelector('#up3IssuesTable tbody');
    tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Loading...</td></tr>';

    try {
        const vendorIds = window.up3VendorIds || [];
        if (vendorIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Tidak ada vendor</td></tr>';
            return;
        }

        const client = getSupabaseClient();

        // Query langsung dari vendor_assets yang bermasalah untuk vendor di UP3 ini
        const { data: issueAssets, error } = await client
            .from('vendor_assets')
            .select(`
                id,
                vendor_id,
                equipment_id,
                kondisi_fisik,
                kondisi_fungsi,
                nilai,
                last_assessment_date,
                vendors(vendor_name),
                equipment_master(nama_alat, jenis),
                teams(nomor_polisi),
                personnel(nama_personil)
            `)
            .in('vendor_id', vendorIds)
            .or('kondisi_fisik.eq.-1,kondisi_fungsi.eq.-1')
            .not('last_assessment_date', 'is', null)
            .order('last_assessment_date', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!issueAssets || issueAssets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="7" class="text-center text-muted">Tidak ada equipment bermasalah 🎉</td></tr>';
            return;
        }

        const rows = issueAssets.map(asset => {
            const tanggalDate = new Date(asset.last_assessment_date);
            const tanggal = String(tanggalDate.getDate()).padStart(2, '0') + '-' +
                String(tanggalDate.getMonth() + 1).padStart(2, '0') + '-' +
                tanggalDate.getFullYear();

            const kondisiFisik = asset.kondisi_fisik === -1 ?
                '<span class="badge bg-danger">TL</span>' :
                '<span class="badge bg-success">L</span>';
            const kondisiFungsi = asset.kondisi_fungsi === -1 ?
                '<span class="badge bg-warning">TB</span>' :
                '<span class="badge bg-success">B</span>';

            const nilaiScore = asset.nilai ?? 0;
            const scoreClass = nilaiScore >= 1.8 ? 'success' : nilaiScore >= 1.5 ? 'warning' : 'danger';
            const nilaiDisplay = asset.nilai !== null && asset.nilai !== undefined ? asset.nilai : '-';

            // Determine Tim/Personil display based on peruntukan type
            let timPersonil = '-';
            if (asset.equipment_master?.jenis === 'Regu' && asset.teams?.nomor_polisi) {
                timPersonil = `<i class="bi bi-truck"></i> ${asset.teams.nomor_polisi}`;
            } else if (asset.equipment_master?.jenis === 'Personal' && asset.personnel?.nama_personil) {
                timPersonil = `<i class="bi bi-person"></i> ${asset.personnel.nama_personil}`;
            }

            return `
                <tr>
                    <td>${tanggal}</td>
                    <td>${asset.vendors?.vendor_name || '-'}</td>
                    <td>${timPersonil}</td>
                    <td>${asset.equipment_master?.nama_alat || '-'}</td>
                    <td class="text-center">${kondisiFisik}</td>
                    <td class="text-center">${kondisiFungsi}</td>
                    <td class="text-center"><span class="badge bg-${scoreClass}">${nilaiDisplay}</span></td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="7" class="text-center text-muted">Tidak ada data</td></tr>';
    } catch (error) {
        console.error('Error loading UP3 equipment issues:', error);
        tbody.innerHTML = '<tr><td colspan="7" class="text-center text-danger">Error loading data</td></tr>';
    }
}

async function loadUP3DailyChart() {
    const chartEl = document.getElementById('up3DailyChart');
    if (!chartEl) return;

    try {
        const vendorIds = window.up3VendorIds || [];
        const userUnitCode = window.currentUser?.unit_code;

        if (vendorIds.length === 0) {
            chartEl.innerHTML = '<p class="text-center text-muted py-4">Tidak ada vendor</p>';
            return;
        }

        const client = getSupabaseClient();
        const now = new Date();
        const days = [];

        // Generate last 30 days
        for (let i = 29; i >= 0; i--) {
            const date = new Date(now);
            date.setDate(date.getDate() - i);
            date.setHours(0, 0, 0, 0);
            const endDate = new Date(date);
            endDate.setHours(23, 59, 59, 999);
            days.push({
                label: String(date.getDate()).padStart(2, '0') + '/' + String(date.getMonth() + 1).padStart(2, '0'),
                start: date,
                end: endDate
            });
        }

        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        // Load assessments and target in parallel
        const [assessResult, targetResult] = await Promise.all([
            client
                .from('assessments')
                .select('id, tanggal_penilaian')
                .in('vendor_id', vendorIds)
                .gte('tanggal_penilaian', thirtyDaysAgo.toISOString())
                .lte('tanggal_penilaian', now.toISOString()),
            userUnitCode
                ? client.from('target_penilaian')
                    .select('target_harian')
                    .eq('unit_code', userUnitCode)
                : Promise.resolve({ data: [] })
        ]);

        if (assessResult.error) throw assessResult.error;

        const assessments = assessResult.data || [];
        const targets = targetResult.data || [];

        // Sum all target_harian for this unit = daily target
        const dailyTarget = targets.reduce((sum, t) => sum + (t.target_harian || 0), 0);

        // Count assessments per day
        const dailyData = days.map(day => {
            return assessments.filter(a => {
                const assessDate = new Date(a.tanggal_penilaian);
                return assessDate >= day.start && assessDate <= day.end;
            }).length;
        });

        // Remaining to target per day (faded bar on top)
        const remaining = dailyData.map(count => Math.max(0, dailyTarget - count));
        const categories = days.map(d => d.label);

        const options = {
            series: [
                { name: 'Realisasi', data: dailyData },
                { name: 'Target', data: remaining }
            ],
            chart: { type: 'bar', height: 320, toolbar: { show: false }, stacked: true },
            plotOptions: {
                bar: { borderRadius: 2, columnWidth: '60%' }
            },
            colors: ['#4154f1', 'rgba(65,84,241,0.15)'],
            fill: { opacity: [1, 1] },
            stroke: { show: false },
            dataLabels: {
                enabled: true,
                enabledOnSeries: [0],
                formatter: function (val) { return val > 0 ? val : ''; },
                style: { fontSize: '10px' }
            },
            xaxis: {
                categories: categories,
                labels: { rotate: 0, rotateAlways: false, style: { fontSize: '9px' } },
                tickAmount: 15
            },
            yaxis: { min: 0, forceNiceScale: true, labels: { formatter: (val) => Math.floor(val) } },
            legend: {
                show: true,
                position: 'top',
                horizontalAlign: 'right',
                fontSize: '11px',
                markers: { fillColors: ['#4154f1', 'rgba(65,84,241,0.15)'] }
            },
            tooltip: {
                shared: true,
                intersect: false,
                custom: function ({ series, seriesIndex, dataPointIndex, w }) {
                    const realisasi = series[0][dataPointIndex];
                    const cat = categories[dataPointIndex];
                    return `<div class="apexcharts-tooltip-title" style="font-size:12px">${cat}</div>` +
                        `<div style="padding:4px 8px;font-size:12px">` +
                        `<span style="color:#4154f1">●</span> Realisasi: <b>${realisasi}</b><br>` +
                        `<span style="color:rgba(65,84,241,0.3)">●</span> Target: <b>${dailyTarget}</b>` +
                        `</div>`;
                }
            },
            grid: { padding: { left: 10, right: 10 } }
        };

        chartEl.innerHTML = '';
        if (window.up3DailyChart) {
            try { window.up3DailyChart.destroy(); } catch (e) { }
        }
        window.up3DailyChart = new ApexCharts(chartEl, options);
        window.up3DailyChart.render();
    } catch (error) {
        console.error('Error loading UP3 daily chart:', error);
        chartEl.innerHTML = '<p class="text-center text-muted py-4">Gagal memuat chart</p>';
    }
}
