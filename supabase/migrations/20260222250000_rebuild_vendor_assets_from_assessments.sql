-- Migration: Rebuild vendor_assets dari assessments + assessment_items
-- Mengisi kembali data yang terhapus saat cleansing sebelumnya
-- Hanya INSERT yang belum ada (berdasarkan UNIQUE owner_id + equipment_id)
-- Ambil data dari assessment TERBARU per owner per equipment

-- CTE: Tentukan owner_id per assessment-item dari assessment header
-- Kendaraan → team_id, Non-Kendaraan → personnel_id (dari assessments, bukan assessment_personnel)
INSERT INTO vendor_assets (
    vendor_id,
    peruntukan_id,
    team_id,
    personnel_id,
    owner_id,
    equipment_id,
    realisasi_qty,
    distribution_date,
    last_assessment_id,
    last_assessment_date,
    kesesuaian_kontrak,
    kondisi_fisik,
    kondisi_fungsi,
    nilai,
    status_kesesuaian
)
SELECT 
    sub.vendor_id,
    sub.peruntukan_id,
    sub.team_id,
    sub.personnel_id,
    sub.owner_id,
    sub.equipment_id,
    sub.actual_qty,
    sub.tanggal_penilaian,
    sub.assessment_id,
    sub.tanggal_penilaian,
    sub.kesesuaian_kontrak,
    sub.kondisi_fisik,
    sub.kondisi_fungsi,
    sub.score_item,
    CASE WHEN sub.actual_qty >= sub.required_qty THEN 'Sesuai' ELSE 'Tidak Sesuai' END
FROM (
    SELECT DISTINCT ON (owner_id, equipment_id)
        a.vendor_id,
        a.peruntukan_id,
        a.team_id,
        a.personnel_id,
        CASE 
            WHEN em.kategori = 'Kendaraan' THEN a.team_id
            ELSE a.personnel_id
        END AS owner_id,
        ai.equipment_id,
        ai.actual_qty,
        ai.required_qty,
        a.tanggal_penilaian,
        a.id AS assessment_id,
        ai.kesesuaian_kontrak,
        ai.kondisi_fisik,
        ai.kondisi_fungsi,
        ai.score_item
    FROM assessment_items ai
    INNER JOIN assessments a ON a.id = ai.assessment_id
    INNER JOIN equipment_master em ON em.id = ai.equipment_id
    WHERE 
        -- Pastikan owner_id bisa ditentukan
        CASE 
            WHEN em.kategori = 'Kendaraan' THEN a.team_id
            ELSE a.personnel_id
        END IS NOT NULL
    ORDER BY 
        -- DISTINCT ON key
        CASE 
            WHEN em.kategori = 'Kendaraan' THEN a.team_id
            ELSE a.personnel_id
        END,
        ai.equipment_id,
        -- Ambil assessment terbaru
        a.tanggal_penilaian DESC,
        a.created_at DESC
) sub
-- Skip yang sudah ada di vendor_assets
WHERE NOT EXISTS (
    SELECT 1 FROM vendor_assets va
    WHERE va.owner_id = sub.owner_id
      AND va.equipment_id = sub.equipment_id
);
