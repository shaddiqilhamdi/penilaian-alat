/**
 * Dashboard UP3 Module
 * Handle UP3 Admin/User and Vendor K3 dashboard functions
 */

async function loadUP3Dashboard() {
    try {
        // Load basic stats
        await loadUP3Stats();

        // Load vendor recap per peruntukan
        await loadUP3VendorRecap();

        // Load equipment issues for this unit
        await loadUP3EquipmentIssues();

        // Load recent assessments
        await loadUP3RecentAssessments();

        // Load teams with assessments
        await loadUP3TeamsWithAssessments();
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
            document.getElementById('up3TotalVendors').textContent = '0';
            document.getElementById('up3TotalEquipment').textContent = '0';
            document.getElementById('up3AvgScore').textContent = '0.00';
            return;
        }

        // Query assessments for vendors and current month
        const { data: assessments, error: assessmentsError } = await client
            .from('assessments')
            .select('id, vendor_id')
            .in('vendor_id', vendorIds)
            .gte('tanggal_penilaian', firstDayOfMonth.toISOString())
            .lte('tanggal_penilaian', lastDayOfMonth.toISOString());

        if (assessmentsError) throw assessmentsError;

        // Calculate stats
        const totalAssessments = assessments?.length || 0;
        const uniqueVendors = new Set(assessments?.map(a => a.vendor_id) || []).size;

        // Get assessment items for this month
        const assessmentIds = assessments?.map(a => a.id) || [];

        let items = [];
        if (assessmentIds.length > 0) {
            const { data: itemsData, error: itemsError } = await client
                .from('assessment_items')
                .select('id, score_item')
                .in('assessment_id', assessmentIds);

            if (itemsError) throw itemsError;
            items = itemsData || [];
        }

        const totalEquipment = items.length;
        const avgScore = items.length > 0
            ? (items.reduce((sum, item) => sum + (item.score_item || 0), 0) / items.length)
            : 0;

        // Update UI
        document.getElementById('up3TotalAssessments').textContent = totalAssessments;
        document.getElementById('up3TotalVendors').textContent = uniqueVendors;
        document.getElementById('up3TotalEquipment').textContent = totalEquipment;
        document.getElementById('up3AvgScore').textContent = avgScore.toFixed(2);

        // Store for other functions
        window.up3VendorIds = vendorIds;
    } catch (error) {
        document.getElementById('up3TotalAssessments').textContent = 'Error';
        document.getElementById('up3TotalVendors').textContent = 'Error';
        document.getElementById('up3TotalEquipment').textContent = 'Error';
        document.getElementById('up3AvgScore').textContent = 'Error';
    }
}

async function loadUP3VendorRecap() {
    const tbody = document.querySelector('#up3VendorRecapTable tbody');
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Loading...</td></tr>';

    try {
        const vendorIds = window.up3VendorIds || [];
        if (vendorIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Tidak ada vendor</td></tr>';
            return;
        }

        const client = getSupabaseClient();
        const now = new Date();
        const firstDayOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDayOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

        // Get assessments with vendor and peruntukan info
        const { data: assessments, error: assessError } = await client
            .from('assessments')
            .select(`
                id, vendor_id, peruntukan_id,
                vendors(vendor_name),
                peruntukan(jenis, deskripsi)
            `)
            .in('vendor_id', vendorIds)
            .gte('tanggal_penilaian', firstDayOfMonth.toISOString())
            .lte('tanggal_penilaian', lastDayOfMonth.toISOString());

        if (assessError) throw assessError;

        if (!assessments || assessments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Tidak ada penilaian bulan ini</td></tr>';
            return;
        }

        // Get all assessment items
        const assessmentIds = assessments.map(a => a.id);
        const { data: items, error: itemsError } = await client
            .from('assessment_items')
            .select('assessment_id, score_item, kondisi_fisik, kondisi_fungsi, layak, tidak_layak, berfungsi, tidak_berfungsi')
            .in('assessment_id', assessmentIds);

        if (itemsError) throw itemsError;

        // Group by vendor + peruntukan
        const recap = {};
        assessments.forEach(a => {
            const key = `${a.vendor_id}_${a.peruntukan_id}`;
            if (!recap[key]) {
                recap[key] = {
                    vendorName: a.vendors?.vendor_name || '-',
                    peruntukan: a.peruntukan?.deskripsi || a.peruntukan?.jenis || '-',
                    assessmentCount: 0,
                    equipmentCount: 0,
                    totalScore: 0,
                    layak: 0,
                    tidakLayak: 0,
                    berfungsi: 0,
                    tidakBerfungsi: 0
                };
            }
            recap[key].assessmentCount++;

            // Add items for this assessment
            const assessmentItems = items?.filter(i => i.assessment_id === a.id) || [];
            assessmentItems.forEach(item => {
                recap[key].equipmentCount++;
                recap[key].totalScore += item.score_item || 0;
                recap[key].layak += item.layak || 0;
                recap[key].tidakLayak += item.tidak_layak || 0;
                recap[key].berfungsi += item.berfungsi || 0;
                recap[key].tidakBerfungsi += item.tidak_berfungsi || 0;
            });
        });

        // Render table
        const rows = Object.values(recap).map(r => {
            const avgScore = r.equipmentCount > 0 ? (r.totalScore / r.equipmentCount).toFixed(2) : '-';
            const scoreClass = avgScore >= 1.5 ? 'success' : avgScore >= 0 ? 'warning' : 'danger';

            return `
                <tr>
                    <td><strong>${r.vendorName}</strong></td>
                    <td>${r.peruntukan}</td>
                    <td class="text-center">${r.assessmentCount}</td>
                    <td class="text-center">${r.equipmentCount}</td>
                    <td class="text-center"><span class="badge bg-${scoreClass}">${avgScore}</span></td>
                    <td class="text-center text-success">${r.layak || 0}</td>
                    <td class="text-center text-danger">${r.tidakLayak || 0}</td>
                    <td class="text-center text-success">${r.berfungsi || 0}</td>
                    <td class="text-center text-warning">${r.tidakBerfungsi || 0}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="9" class="text-center text-muted">Tidak ada data</td></tr>';
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading data</td></tr>';
    }
}

async function loadUP3EquipmentIssues() {
    const tbody = document.querySelector('#up3IssuesTable tbody');
    tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Loading...</td></tr>';

    try {
        const vendorIds = window.up3VendorIds || [];
        if (vendorIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada vendor</td></tr>';
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
                equipment_master(nama_alat)
            `)
            .in('vendor_id', vendorIds)
            .or('kondisi_fisik.eq.-1,kondisi_fungsi.eq.-1')
            .not('last_assessment_date', 'is', null)
            .order('last_assessment_date', { ascending: false })
            .limit(20);

        if (error) throw error;

        if (!issueAssets || issueAssets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="text-center text-muted">Tidak ada equipment bermasalah 🎉</td></tr>';
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

            return `
                <tr>
                    <td>${tanggal}</td>
                    <td>${asset.vendors?.vendor_name || '-'}</td>
                    <td>${asset.equipment_master?.nama_alat || '-'}</td>
                    <td class="text-center">${kondisiFisik}</td>
                    <td class="text-center">${kondisiFungsi}</td>
                    <td class="text-center"><span class="badge bg-${scoreClass}">${nilaiDisplay}</span></td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="6" class="text-center text-muted">Tidak ada data</td></tr>';
    } catch (error) {
        console.error('Error loading UP3 equipment issues:', error);
        tbody.innerHTML = '<tr><td colspan="6" class="text-center text-danger">Error loading data</td></tr>';
    }
}

async function loadUP3RecentAssessments() {
    const tbody = document.querySelector('#up3RecentTable tbody');
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Loading...</td></tr>';

    try {
        const vendorIds = window.up3VendorIds || [];
        if (vendorIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Tidak ada vendor</td></tr>';
            return;
        }

        const client = getSupabaseClient();

        // Get recent assessments with all needed info
        const { data: assessments, error } = await client
            .from('assessments')
            .select(`
                id, tanggal_penilaian, vendor_id, peruntukan_id,
                vendors(vendor_name),
                peruntukan(jenis, deskripsi)
            `)
            .in('vendor_id', vendorIds)
            .order('tanggal_penilaian', { ascending: false })
            .limit(10);

        if (error) throw error;

        if (!assessments || assessments.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Belum ada penilaian</td></tr>';
            return;
        }

        // Get scores for each assessment
        const assessmentIds = assessments.map(a => a.id);
        const { data: items } = await client
            .from('assessment_items')
            .select('assessment_id, score_item')
            .in('assessment_id', assessmentIds);

        // Calculate avg score per assessment
        const scoreMap = {};
        assessmentIds.forEach(id => {
            const assessmentItems = items?.filter(i => i.assessment_id === id) || [];
            if (assessmentItems.length > 0) {
                scoreMap[id] = assessmentItems.reduce((sum, i) => sum + (i.score_item || 0), 0) / assessmentItems.length;
            } else {
                scoreMap[id] = 0;
            }
        });

        const rows = assessments.map(item => {
            const tanggalDate = new Date(item.tanggal_penilaian);
            const tanggal = String(tanggalDate.getDate()).padStart(2, '0') + '-' + String(tanggalDate.getMonth() + 1).padStart(2, '0') + '-' + tanggalDate.getFullYear();
            const avgScore = scoreMap[item.id]?.toFixed(2) || '0.00';
            const scoreClass = avgScore >= 1.5 ? 'success' : avgScore >= 0 ? 'warning' : 'danger';
            const status = avgScore >= 1.5 ? 'Baik' : avgScore >= 0 ? 'Cukup' : 'Buruk';
            const statusClass = avgScore >= 1.5 ? 'success' : avgScore >= 0 ? 'warning' : 'danger';

            return `
                <tr>
                    <td>${tanggal}</td>
                    <td>${item.vendors?.vendor_name || '-'}</td>
                    <td>${item.peruntukan?.deskripsi || item.peruntukan?.jenis || '-'}</td>
                    <td class="text-center"><span class="badge bg-${scoreClass}">${avgScore}</span></td>
                    <td class="text-center"><span class="badge bg-${statusClass}">${status}</span></td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error loading data</td></tr>';
    }
}

async function loadUP3TeamsWithAssessments() {
    const tbody = document.querySelector('#up3TeamsTable tbody');
    tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">Loading...</td></tr>';

    try {
        const vendorIds = window.up3VendorIds || [];
        if (vendorIds.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">Tidak ada vendor</td></tr>';
            return;
        }

        const client = getSupabaseClient();

        // Get teams for these vendors
        const { data: teams, error: teamsError } = await client
            .from('teams')
            .select('id, nomor_polisi, category, vendor_id, vendors(vendor_name)')
            .in('vendor_id', vendorIds)
            .order('nomor_polisi');

        if (teamsError) throw teamsError;

        if (!teams || teams.length === 0) {
            tbody.innerHTML = '<tr><td colspan="11" class="text-center text-muted">Tidak ada kendaraan terdaftar</td></tr>';
            return;
        }

        // Get assessments for these teams
        const teamIds = teams.map(t => t.id);
        const { data: assessments, error: assessError } = await client
            .from('assessments')
            .select('id, team_id, tanggal_penilaian')
            .in('team_id', teamIds)
            .order('tanggal_penilaian', { ascending: false });

        if (assessError) throw assessError;

        // Get assessment items for scores
        const assessmentIds = assessments?.map(a => a.id) || [];
        let items = [];
        if (assessmentIds.length > 0) {
            const { data: itemsData } = await client
                .from('assessment_items')
                .select('assessment_id, score_item, layak, tidak_layak, berfungsi, tidak_berfungsi')
                .in('assessment_id', assessmentIds);
            items = itemsData || [];
        }

        // Build team stats
        const teamStats = {};
        teams.forEach(t => {
            teamStats[t.id] = {
                ...t,
                assessmentCount: 0,
                totalScore: 0,
                itemCount: 0,
                layak: 0,
                tidakLayak: 0,
                berfungsi: 0,
                tidakBerfungsi: 0,
                lastAssessment: null
            };
        });

        assessments?.forEach(a => {
            if (teamStats[a.team_id]) {
                // Only take the latest (first) assessment per team
                if (teamStats[a.team_id].lastAssessment) return;

                teamStats[a.team_id].assessmentCount = 1;
                teamStats[a.team_id].lastAssessment = a.tanggal_penilaian;

                // Add items from latest assessment only
                const assessmentItems = items.filter(i => i.assessment_id === a.id);
                assessmentItems.forEach(item => {
                    teamStats[a.team_id].itemCount++;
                    teamStats[a.team_id].totalScore += item.score_item || 0;
                    teamStats[a.team_id].layak += item.layak || 0;
                    teamStats[a.team_id].tidakLayak += item.tidak_layak || 0;
                    teamStats[a.team_id].berfungsi += item.berfungsi || 0;
                    teamStats[a.team_id].tidakBerfungsi += item.tidak_berfungsi || 0;
                });
            }
        });

        // Render table
        const rows = Object.values(teamStats).map(t => {
            const avgScore = t.itemCount > 0 ? (t.totalScore / t.itemCount).toFixed(2) : '-';
            const scoreClass = avgScore >= 1.5 ? 'success' : avgScore >= 0 ? 'warning' : 'danger';
            let lastDate = '-';
            if (t.lastAssessment) {
                const lastDateObj = new Date(t.lastAssessment);
                lastDate = String(lastDateObj.getDate()).padStart(2, '0') + '-' + String(lastDateObj.getMonth() + 1).padStart(2, '0') + '-' + lastDateObj.getFullYear();
            }
            const status = t.assessmentCount > 0
                ? (avgScore >= 1.5 ? 'Baik' : avgScore >= 0 ? 'Cukup' : 'Buruk')
                : 'Belum Dinilai';
            const statusClass = t.assessmentCount > 0
                ? (avgScore >= 1.5 ? 'success' : avgScore >= 0 ? 'warning' : 'danger')
                : 'secondary';

            return `
                <tr>
                    <td><strong>${t.nomor_polisi || '-'}</strong></td>
                    <td>${t.category || '-'}</td>
                    <td>${t.vendors?.vendor_name || '-'}</td>
                    <td class="text-center">${t.assessmentCount}</td>
                    <td class="text-center"><span class="badge bg-${scoreClass}">${avgScore}</span></td>
                    <td class="text-center text-success">${t.layak || 0}</td>
                    <td class="text-center text-danger">${t.tidakLayak || 0}</td>
                    <td class="text-center text-success">${t.berfungsi || 0}</td>
                    <td class="text-center text-danger">${t.tidakBerfungsi || 0}</td>
                    <td class="text-center">${lastDate}</td>
                    <td class="text-center"><span class="badge bg-${statusClass}">${status}</span></td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="11" class="text-center text-muted">Tidak ada data</td></tr>';
    } catch (error) {
        tbody.innerHTML = '<tr><td colspan="11" class="text-center text-danger">Error loading data</td></tr>';
    }
}
