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

        // Load equipment belum sesuai kontrak
        await loadUP3UnfulfilledContracts();
    } catch (error) {
        // Dashboard error
    }
}

async function loadUP3Stats() {
    try {
        const userUnitCode = window.currentUser?.unit_code;
        const userVendorId = window.currentUser?.vendor_id;

        // Store params for other functions
        window.up3Params = { unit_code: userUnitCode, vendor_id: userVendorId };

        if (!userUnitCode && !userVendorId) {
            document.getElementById('up3TotalAssessments').textContent = '0';
            document.getElementById('up3TotalEquipment').textContent = '0';
            document.getElementById('up3AvgScore').textContent = '0.00';
            document.getElementById('up3PersonalScoreBadge').textContent = 'P: 0.00';
            document.getElementById('up3ReguScoreBadge').textContent = 'R: 0.00';
            document.getElementById('up3KontrakPct').textContent = '0%';
            document.getElementById('up3JumlahKendaraan').textContent = '0';
            document.getElementById('up3JumlahPersonil').textContent = '0';
            renderUP3KondisiDonut(0, 0, { tlPersonal: 0, tlRegu: 0, tbPersonal: 0, tbRegu: 0 });
            return;
        }

        const client = getSupabaseClient();
        const now = new Date();
        const monthParam = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;

        // Single RPC call — data sudah diagregasi di database
        const { data, error } = await client.rpc('fn_up3_stats', {
            p_unit_code: userUnitCode || null,
            p_vendor_id: userVendorId || null,
            p_month: monthParam
        });

        if (error) throw error;
        const s = data?.[0] || {};

        // Update UI dengan data siap pakai
        document.getElementById('up3TotalAssessments').textContent = s.total_assessments || 0;
        document.getElementById('up3TotalEquipment').textContent = s.total_equipment || 0;

        const avgScoreVal = Number(s.avg_score) || 0;
        const avgScoreEl = document.getElementById('up3AvgScore');
        avgScoreEl.textContent = avgScoreVal.toFixed(2);
        avgScoreEl.className = avgScoreVal >= 1.8 ? 'text-success' : avgScoreVal >= 1.5 ? 'text-warning' : 'text-danger';

        document.getElementById('up3PersonalScoreBadge').textContent = 'P: ' + (Number(s.avg_personal) || 0).toFixed(2);
        document.getElementById('up3ReguScoreBadge').textContent = 'R: ' + (Number(s.avg_regu) || 0).toFixed(2);
        document.getElementById('up3KontrakPct').textContent = (Number(s.kontrak_pct) || 0).toFixed(0) + '%';

        document.getElementById('up3JumlahKendaraan').textContent = s.total_kendaraan || 0;
        document.getElementById('up3JumlahPersonil').textContent = s.total_personil || 0;

        // Render Kondisi Equipment donut chart
        const baik = Number(s.total_baik) || 0;
        const bermasalah = Number(s.total_bermasalah) || 0;
        renderUP3KondisiDonut(baik, bermasalah, {
            tlPersonal: Number(s.tidak_layak_personal) || 0,
            tlRegu: Number(s.tidak_layak_regu) || 0,
            tbPersonal: Number(s.tidak_berfungsi_personal) || 0,
            tbRegu: Number(s.tidak_berfungsi_regu) || 0
        });
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
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Loading...</td></tr>';

    try {
        const params = window.up3Params || {};
        if (!params.unit_code && !params.vendor_id) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Tidak ada vendor</td></tr>';
            return;
        }

        const client = getSupabaseClient();

        // Single RPC call — data sudah diagregasi per vendor+peruntukan di database
        // Menggunakan data penilaian terakhir per vendor_asset (tanpa filter bulan)
        const { data: recapData, error } = await client.rpc('fn_up3_vendor_recap', {
            p_unit_code: params.unit_code || null,
            p_vendor_id: params.vendor_id || null
        });

        if (error) throw error;

        // Render table — data sudah siap pakai
        const rows = (recapData || []).map(r => {
            const avgScore = r.equipment_count > 0 ? Number(r.avg_score).toFixed(2) : '-';
            const scoreClass = avgScore >= 1.8 ? 'success' : avgScore >= 1.5 ? 'warning' : 'danger';
            const kontrakPct = Number(r.kontrak_pct) || 0;
            const kontrakClass = kontrakPct >= 80 ? 'success' : kontrakPct >= 50 ? 'warning' : 'danger';

            return `
                <tr>
                    <td><strong>${r.vendor_name || '-'}</strong></td>
                    <td>${r.peruntukan || '-'}</td>
                    <td class="text-center">${r.jumlah || '-'}</td>
                    <td class="text-center">${r.equipment_count || '-'}</td>
                    <td class="text-center">${avgScore !== '-' ? `<span class="badge bg-${scoreClass}">${avgScore}</span>` : '-'}</td>
                    <td class="text-center">${r.tidak_layak || '-'}</td>
                    <td class="text-center">${r.tidak_berfungsi || '-'}</td>
                    <td class="text-center">${r.equipment_count > 0 ? `<span class="badge bg-${kontrakClass}">${kontrakPct.toFixed(0)}%</span>` : '-'}</td>
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
    tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Loading...</td></tr>';

    try {
        const params = window.up3Params || {};
        if (!params.unit_code && !params.vendor_id) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Tidak ada vendor</td></tr>';
            return;
        }

        const client = getSupabaseClient();

        // Single RPC call — data sudah di-join di database
        const { data: issueAssets, error } = await client.rpc('fn_up3_equipment_issues', {
            p_unit_code: params.unit_code || null,
            p_vendor_id: params.vendor_id || null,
            p_limit: 20
        });

        if (error) throw error;

        if (!issueAssets || issueAssets.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Tidak ada equipment bermasalah 🎉</td></tr>';
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

            // Determine Tim/Personil display based on jenis
            let timPersonil = '-';
            if (asset.eq_jenis === 'Regu' && asset.nomor_polisi) {
                timPersonil = `<i class="bi bi-truck"></i> ${asset.nomor_polisi}`;
            } else if (asset.eq_jenis === 'Personal' && asset.nama_personil) {
                timPersonil = `<i class="bi bi-person"></i> ${asset.nama_personil}`;
            }

            return `
                <tr>
                    <td>${tanggal}</td>
                    <td>${asset.vendor_name || '-'}</td>
                    <td>${asset.peruntukan || '-'}</td>
                    <td>${timPersonil}</td>
                    <td>${asset.nama_alat || '-'}</td>
                    <td class="text-muted small">${asset.sub_kategori && asset.sub_kategori !== '-' ? asset.sub_kategori : (asset.kategori || '-')}</td>
                    <td class="text-center">${kondisiFisik}</td>
                    <td class="text-center">${kondisiFungsi}</td>
                    <td class="text-center"><span class="badge bg-${scoreClass}">${nilaiDisplay}</span></td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows || '<tr><td colspan="9" class="text-center text-muted">Tidak ada data</td></tr>';
    } catch (error) {
        console.error('Error loading UP3 equipment issues:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading data</td></tr>';
    }
}

async function loadUP3DailyChart() {
    const chartEl = document.getElementById('up3DailyChart');
    if (!chartEl) return;

    try {
        const params = window.up3Params || {};

        if (!params.unit_code && !params.vendor_id) {
            chartEl.innerHTML = '<p class="text-center text-muted py-4">Tidak ada vendor</p>';
            return;
        }

        const client = getSupabaseClient();

        // Single RPC call — data sudah dihitung per hari di database
        const { data: chartData, error } = await client.rpc('fn_up3_daily_chart', {
            p_unit_code: params.unit_code || null,
            p_vendor_id: params.vendor_id || null
        });

        if (error) throw error;

        const rows = chartData || [];
        const categories = rows.map(r => r.day_label);
        const dailyData = rows.map(r => Number(r.assessment_count) || 0);
        const dailyTarget = rows.length > 0 ? Number(rows[0].daily_target) || 0 : 0;
        const remaining = dailyData.map(count => Math.max(0, dailyTarget - count));

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

async function loadUP3UnfulfilledContracts() {
    const tbody = document.querySelector('#up3UnfulfilledTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Loading...</td></tr>';

    try {
        const params = window.up3Params || {};
        if (!params.unit_code && !params.vendor_id) {
            tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted">Tidak ada vendor</td></tr>';
            return;
        }

        const client = getSupabaseClient();

        // Data penilaian terakhir per vendor_asset (tanpa filter bulan)
        const { data, error } = await client.rpc('fn_up3_unfulfilled_contracts', {
            p_unit_code: params.unit_code || null,
            p_vendor_id: params.vendor_id || null,
            p_limit: 50
        });

        if (error) throw error;

        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="9" class="text-center text-muted">Semua equipment sesuai kontrak ✅</td></tr>';
            return;
        }

        const rows = data.map(r => {
            const ownerIcon = r.owner_type === 'tim'
                ? '<i class="bi bi-truck"></i> '
                : '<i class="bi bi-person"></i> ';
            const tanggal = r.last_assessment_date
                ? new Date(r.last_assessment_date).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' })
                : '-';

            const selisih = Number(r.selisih) || 0;
            const selisihClass = selisih > 0 ? 'text-danger fw-bold' : '';

            return `
                <tr>
                    <td>${tanggal}</td>
                    <td>${r.vendor_name || '-'}</td>
                    <td>${r.peruntukan || '-'}</td>
                    <td>${ownerIcon}${r.owner_label || '-'}</td>
                    <td>${r.nama_alat || '-'}</td>
                    <td class="text-muted small">${r.sub_kategori !== '-' ? r.sub_kategori : (r.kategori || '-')}</td>
                    <td class="text-center">${r.required_qty}</td>
                    <td class="text-center">${r.realisasi_qty}</td>
                    <td class="text-center ${selisihClass}">${selisih > 0 ? '-' + selisih : selisih}</td>
                </tr>
            `;
        }).join('');

        tbody.innerHTML = rows;
    } catch (error) {
        console.error('Error loading UP3 unfulfilled contracts:', error);
        tbody.innerHTML = '<tr><td colspan="9" class="text-center text-danger">Error loading data</td></tr>';
    }
}
