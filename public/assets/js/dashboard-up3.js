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
            document.getElementById('up3TidakLayak').textContent = '0';
            document.getElementById('up3TidakBerfungsi').textContent = '0';
            document.getElementById('up3KontrakPct').textContent = '0%';
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
                peruntukan(jenis)
            `)
            .in('vendor_id', vendorIds)
            .gte('last_assessment_date', firstDayOfMonth.toISOString())
            .lte('last_assessment_date', lastDayOfMonth.toISOString());

        if (assetsError) throw assetsError;

        const totalEquipment = vendorAssets?.length || 0;
        const avgScore = totalEquipment > 0
            ? (vendorAssets.reduce((sum, asset) => sum + (asset.nilai || 0), 0) / totalEquipment)
            : 0;

        // Calculate Personal vs Regu scores
        const personalAssets = vendorAssets?.filter(a => a.peruntukan?.jenis === 'Personal') || [];
        const reguAssets = vendorAssets?.filter(a => a.peruntukan?.jenis === 'Regu') || [];
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
        document.getElementById('up3AvgScore').textContent = avgScore.toFixed(2);
        document.getElementById('up3PersonalScoreBadge').textContent = 'P: ' + avgPersonal.toFixed(2);
        document.getElementById('up3ReguScoreBadge').textContent = 'R: ' + avgRegu.toFixed(2);
        document.getElementById('up3TidakLayak').textContent = tidakLayak;
        document.getElementById('up3TidakBerfungsi').textContent = tidakBerfungsi;
        document.getElementById('up3KontrakPct').textContent = kontrakPct.toFixed(0) + '%';
    } catch (error) {
        console.error('Error loading UP3 stats:', error);
        document.getElementById('up3TotalAssessments').textContent = 'Error';
        document.getElementById('up3TotalEquipment').textContent = 'Error';
        document.getElementById('up3AvgScore').textContent = 'Error';
        document.getElementById('up3PersonalScoreBadge').textContent = 'P: -';
        document.getElementById('up3ReguScoreBadge').textContent = 'R: -';
        document.getElementById('up3TidakLayak').textContent = '-';
        document.getElementById('up3TidakBerfungsi').textContent = '-';
        document.getElementById('up3KontrakPct').textContent = '-';
    }
}

async function loadUP3VendorRecap() {
    const tbody = document.querySelector('#up3VendorRecapTable tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Loading...</td></tr>';

    try {
        const vendorIds = window.up3VendorIds || [];
        console.log('VendorRecap - vendorIds:', vendorIds);
        if (vendorIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Tidak ada vendor</td></tr>';
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
                peruntukan(jenis, deskripsi)
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
            .lte('last_assessment_date', lastDayOfMonth.toISOString());

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
                    jenis: std.peruntukan?.jenis || '-',
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
                const scoreClass = avgScore >= 1.5 ? 'success' : avgScore >= 0 ? 'warning' : 'danger';
                const kontrakPct = r.equipmentCount > 0 ? (r.kontrakOk / r.equipmentCount * 100).toFixed(0) : 0;
                const kontrakClass = kontrakPct >= 80 ? 'success' : kontrakPct >= 50 ? 'warning' : 'danger';
                const jenisClass = r.jenis === 'Personal' ? 'info' : 'warning';

                return `
                    <tr>
                        <td><strong>${r.vendorName}</strong></td>
                        <td><span class="badge bg-${jenisClass}">${r.jenis}</span></td>
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

        tbody.innerHTML = rows || '<tr><td colspan="9" class="text-center text-muted">Tidak ada data</td></tr>';
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
                equipment_master(nama_alat),
                peruntukan(jenis),
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
            const scoreClass = nilaiScore >= 1 ? 'success' : nilaiScore >= 0 ? 'warning' : 'danger';
            const nilaiDisplay = asset.nilai !== null && asset.nilai !== undefined ? asset.nilai : '-';

            // Determine Tim/Personil display based on peruntukan type
            let timPersonil = '-';
            if (asset.peruntukan?.jenis === 'Regu' && asset.teams?.nomor_polisi) {
                timPersonil = `<i class="bi bi-truck"></i> ${asset.teams.nomor_polisi}`;
            } else if (asset.peruntukan?.jenis === 'Personal' && asset.personnel?.nama_personil) {
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

        // Get all assessments for vendor IDs in last 30 days
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);
        thirtyDaysAgo.setHours(0, 0, 0, 0);

        const { data: assessments, error } = await client
            .from('assessments')
            .select('id, tanggal_penilaian')
            .in('vendor_id', vendorIds)
            .gte('tanggal_penilaian', thirtyDaysAgo.toISOString())
            .lte('tanggal_penilaian', now.toISOString());

        if (error) throw error;

        // Count assessments per day
        const dailyData = days.map(day => {
            return assessments?.filter(a => {
                const assessDate = new Date(a.tanggal_penilaian);
                return assessDate >= day.start && assessDate <= day.end;
            }).length || 0;
        });

        const options = {
            series: [{ name: 'Entri Penilaian', data: dailyData }],
            chart: {
                height: 200,
                type: 'bar',
                toolbar: { show: false },
                fontFamily: 'inherit',
                sparkline: { enabled: false }
            },
            colors: ['#4154f1'],
            plotOptions: {
                bar: { borderRadius: 2, columnWidth: '60%' }
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories: days.map(d => d.label),
                labels: {
                    rotate: -45,
                    rotateAlways: true,
                    style: { fontSize: '9px' }
                },
                tickAmount: 10
            },
            yaxis: {
                min: 0,
                forceNiceScale: true,
                labels: { style: { fontSize: '10px' } }
            },
            tooltip: {
                y: { formatter: (val) => val + ' penilaian' }
            },
            grid: { padding: { left: 10, right: 10 } }
        };

        // Destroy existing chart to prevent memory leak
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
