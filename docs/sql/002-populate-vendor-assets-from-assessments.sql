-- ============================================================================
-- SQL Script: Populate vendor_assets from existing assessment data
-- Description: Mengisi tabel vendor_assets berdasarkan data assessment yang sudah ada
--              Script ini dibutuhkan karena edge function dibuat setelah beberapa
--              assessment sudah masuk ke database
-- Author: System
-- Date: 2026-02-12
-- ============================================================================

-- ============================================================================
-- KONSEP:
-- 1. Assessment = 1 sesi penilaian untuk 1 target (team/personnel) di 1 peruntukan
-- 2. Setiap kombinasi (vendor + peruntukan + team/personnel) punya banyak assessment
-- 3. Kita ambil assessment TERBARU untuk setiap kombinasi unik
-- 4. Dari assessment terbaru tersebut, ambil SEMUA assessment_items
-- 5. Sync ke vendor_assets
-- ============================================================================

-- ============================================================================
-- STEP 1A: Lihat semua kombinasi unik (vendor + peruntukan + target)
-- ============================================================================

SELECT DISTINCT
    a.vendor_id,
    v.vendor_name,
    a.peruntukan_id,
    p.deskripsi as peruntukan,
    p.jenis,
    a.team_id,
    t.nomor_polisi as team_nopol,
    a.personnel_id,
    pr.nama_personil,
    COUNT(DISTINCT a.id) as jumlah_assessment
FROM assessments a
JOIN vendors v ON a.vendor_id = v.id
JOIN peruntukan p ON a.peruntukan_id = p.id
LEFT JOIN teams t ON a.team_id = t.id
LEFT JOIN personnel pr ON a.personnel_id = pr.id
GROUP BY 
    a.vendor_id, v.vendor_name,
    a.peruntukan_id, p.deskripsi, p.jenis,
    a.team_id, t.nomor_polisi,
    a.personnel_id, pr.nama_personil
ORDER BY v.vendor_name, p.deskripsi;

-- ============================================================================
-- STEP 1B: Ambil assessment TERBARU per kombinasi unik
-- ============================================================================

SELECT DISTINCT ON (a.vendor_id, a.peruntukan_id, COALESCE(a.team_id::text, ''), COALESCE(a.personnel_id::text, ''))
    a.id as assessment_id,
    a.vendor_id,
    v.vendor_name,
    a.peruntukan_id,
    p.deskripsi as peruntukan,
    p.jenis,
    a.team_id,
    t.nomor_polisi as team_nopol,
    a.personnel_id,
    pr.nama_personil,
    a.tanggal_penilaian
FROM assessments a
JOIN vendors v ON a.vendor_id = v.id
JOIN peruntukan p ON a.peruntukan_id = p.id
LEFT JOIN teams t ON a.team_id = t.id
LEFT JOIN personnel pr ON a.personnel_id = pr.id
ORDER BY 
    a.vendor_id, 
    a.peruntukan_id, 
    COALESCE(a.team_id::text, ''), 
    COALESCE(a.personnel_id::text, ''),
    a.tanggal_penilaian DESC;

-- ============================================================================
-- STEP 1C: Preview LENGKAP - Assessment terbaru + semua items-nya
-- Ini adalah data yang akan di-insert ke vendor_assets
-- ============================================================================

WITH latest_assessment_per_target AS (
    -- Ambil assessment terbaru untuk setiap kombinasi unik
    SELECT DISTINCT ON (a.vendor_id, a.peruntukan_id, COALESCE(a.team_id::text, ''), COALESCE(a.personnel_id::text, ''))
        a.id as assessment_id,
        a.vendor_id,
        a.peruntukan_id,
        a.team_id,
        a.personnel_id,
        a.tanggal_penilaian
    FROM assessments a
    ORDER BY 
        a.vendor_id, 
        a.peruntukan_id, 
        COALESCE(a.team_id::text, ''), 
        COALESCE(a.personnel_id::text, ''),
        a.tanggal_penilaian DESC
)
SELECT 
    la.assessment_id,
    la.vendor_id,
    v.vendor_name,
    la.peruntukan_id,
    p.deskripsi as peruntukan,
    la.team_id,
    t.nomor_polisi as team_nopol,
    la.personnel_id,
    pr.nama_personil,
    ai.equipment_id,
    em.nama_alat,
    ai.actual_qty as realisasi_qty,
    ai.kondisi_fisik,
    ai.kondisi_fungsi,
    ai.kesesuaian_kontrak,
    ai.score_item as nilai,
    CASE WHEN ai.kesesuaian_kontrak >= 2 THEN 'Sesuai' ELSE 'Tidak Sesuai' END as status_kesesuaian,
    la.tanggal_penilaian as last_assessment_date
FROM latest_assessment_per_target la
JOIN assessment_items ai ON ai.assessment_id = la.assessment_id
JOIN vendors v ON la.vendor_id = v.id
JOIN peruntukan p ON la.peruntukan_id = p.id
JOIN equipment_master em ON ai.equipment_id = em.id
LEFT JOIN teams t ON la.team_id = t.id
LEFT JOIN personnel pr ON la.personnel_id = pr.id
ORDER BY v.vendor_name, p.deskripsi, em.nama_alat;

-- ============================================================================
-- STEP 2: POPULATE vendor_assets (JALANKAN SETELAH STEP 1 DIVERIFIKASI)
-- ============================================================================

-- ============================================================================
-- OPTION A: Fresh INSERT (untuk database baru / vendor_assets kosong)
-- ============================================================================

/*
-- Backup dulu jika ada data
-- CREATE TABLE vendor_assets_backup AS SELECT * FROM vendor_assets;

-- Clear existing data (HATI-HATI!)
-- TRUNCATE vendor_assets;

-- Insert dari assessment terbaru per target
WITH latest_assessment_per_target AS (
    SELECT DISTINCT ON (a.vendor_id, a.peruntukan_id, COALESCE(a.team_id::text, ''), COALESCE(a.personnel_id::text, ''))
        a.id as assessment_id,
        a.vendor_id,
        a.peruntukan_id,
        a.team_id,
        a.personnel_id,
        a.tanggal_penilaian
    FROM assessments a
    ORDER BY 
        a.vendor_id, 
        a.peruntukan_id, 
        COALESCE(a.team_id::text, ''), 
        COALESCE(a.personnel_id::text, ''),
        a.tanggal_penilaian DESC
)
INSERT INTO vendor_assets (
    vendor_id,
    peruntukan_id,
    team_id,
    personnel_id,
    equipment_id,
    realisasi_qty,
    kondisi_fisik,
    kondisi_fungsi,
    kesesuaian_kontrak,
    nilai,
    status_kesesuaian,
    last_assessment_id,
    last_assessment_date,
    created_at
)
SELECT 
    la.vendor_id,
    la.peruntukan_id,
    la.team_id,
    la.personnel_id,
    ai.equipment_id,
    ai.actual_qty,
    ai.kondisi_fisik,
    ai.kondisi_fungsi,
    ai.kesesuaian_kontrak,
    ai.score_item,
    CASE WHEN ai.kesesuaian_kontrak >= 2 THEN 'Sesuai' ELSE 'Tidak Sesuai' END,
    la.assessment_id,
    la.tanggal_penilaian,
    NOW()
FROM latest_assessment_per_target la
JOIN assessment_items ai ON ai.assessment_id = la.assessment_id;
*/

-- ============================================================================
-- OPTION B: MERGE/UPSERT (RECOMMENDED - Update existing, insert new)
-- ============================================================================

-- Step 2B.1: Update existing vendor_assets yang sudah ada
WITH latest_assessment_per_target AS (
    SELECT DISTINCT ON (a.vendor_id, a.peruntukan_id, COALESCE(a.team_id::text, ''), COALESCE(a.personnel_id::text, ''))
        a.id as assessment_id,
        a.vendor_id,
        a.peruntukan_id,
        a.team_id,
        a.personnel_id,
        a.tanggal_penilaian
    FROM assessments a
    ORDER BY 
        a.vendor_id, 
        a.peruntukan_id, 
        COALESCE(a.team_id::text, ''), 
        COALESCE(a.personnel_id::text, ''),
        a.tanggal_penilaian DESC
),
assessment_data AS (
    SELECT 
        la.vendor_id,
        la.peruntukan_id,
        la.team_id,
        la.personnel_id,
        ai.equipment_id,
        ai.actual_qty as realisasi_qty,
        ai.kondisi_fisik,
        ai.kondisi_fungsi,
        ai.kesesuaian_kontrak,
        ai.score_item as nilai,
        CASE WHEN ai.kesesuaian_kontrak >= 2 THEN 'Sesuai' ELSE 'Tidak Sesuai' END as status_kesesuaian,
        la.assessment_id as last_assessment_id,
        la.tanggal_penilaian as last_assessment_date
    FROM latest_assessment_per_target la
    JOIN assessment_items ai ON ai.assessment_id = la.assessment_id
)
UPDATE vendor_assets va
SET 
    realisasi_qty = ad.realisasi_qty,
    kondisi_fisik = ad.kondisi_fisik,
    kondisi_fungsi = ad.kondisi_fungsi,
    kesesuaian_kontrak = ad.kesesuaian_kontrak,
    nilai = ad.nilai,
    status_kesesuaian = ad.status_kesesuaian,
    last_assessment_id = ad.last_assessment_id,
    last_assessment_date = ad.last_assessment_date
FROM assessment_data ad
WHERE va.vendor_id = ad.vendor_id
  AND va.peruntukan_id = ad.peruntukan_id
  AND COALESCE(va.team_id::text, '') = COALESCE(ad.team_id::text, '')
  AND COALESCE(va.personnel_id::text, '') = COALESCE(ad.personnel_id::text, '')
  AND va.equipment_id = ad.equipment_id
  AND (va.last_assessment_date IS NULL OR va.last_assessment_date < ad.last_assessment_date);

-- Step 2B.2: Insert baru yang belum ada di vendor_assets
WITH latest_assessment_per_target AS (
    SELECT DISTINCT ON (a.vendor_id, a.peruntukan_id, COALESCE(a.team_id::text, ''), COALESCE(a.personnel_id::text, ''))
        a.id as assessment_id,
        a.vendor_id,
        a.peruntukan_id,
        a.team_id,
        a.personnel_id,
        a.tanggal_penilaian
    FROM assessments a
    ORDER BY 
        a.vendor_id, 
        a.peruntukan_id, 
        COALESCE(a.team_id::text, ''), 
        COALESCE(a.personnel_id::text, ''),
        a.tanggal_penilaian DESC
),
assessment_data AS (
    SELECT 
        la.vendor_id,
        la.peruntukan_id,
        la.team_id,
        la.personnel_id,
        ai.equipment_id,
        ai.actual_qty as realisasi_qty,
        ai.kondisi_fisik,
        ai.kondisi_fungsi,
        ai.kesesuaian_kontrak,
        ai.score_item as nilai,
        CASE WHEN ai.kesesuaian_kontrak >= 2 THEN 'Sesuai' ELSE 'Tidak Sesuai' END as status_kesesuaian,
        la.assessment_id as last_assessment_id,
        la.tanggal_penilaian as last_assessment_date
    FROM latest_assessment_per_target la
    JOIN assessment_items ai ON ai.assessment_id = la.assessment_id
)
INSERT INTO vendor_assets (
    vendor_id,
    peruntukan_id,
    team_id,
    personnel_id,
    equipment_id,
    realisasi_qty,
    kondisi_fisik,
    kondisi_fungsi,
    kesesuaian_kontrak,
    nilai,
    status_kesesuaian,
    last_assessment_id,
    last_assessment_date,
    created_at
)
SELECT 
    ad.vendor_id,
    ad.peruntukan_id,
    ad.team_id,
    ad.personnel_id,
    ad.equipment_id,
    ad.realisasi_qty,
    ad.kondisi_fisik,
    ad.kondisi_fungsi,
    ad.kesesuaian_kontrak,
    ad.nilai,
    ad.status_kesesuaian,
    ad.last_assessment_id,
    ad.last_assessment_date,
    NOW()
FROM assessment_data ad
WHERE NOT EXISTS (
    SELECT 1 FROM vendor_assets va
    WHERE va.vendor_id = ad.vendor_id
      AND va.peruntukan_id = ad.peruntukan_id
      AND COALESCE(va.team_id::text, '') = COALESCE(ad.team_id::text, '')
      AND COALESCE(va.personnel_id::text, '') = COALESCE(ad.personnel_id::text, '')
      AND va.equipment_id = ad.equipment_id
);

-- ============================================================================
-- STEP 3: VERIFIKASI HASIL
-- ============================================================================

-- Cek jumlah data yang berhasil di-populate
SELECT 
    'vendor_assets' as table_name,
    COUNT(*) as total_records,
    COUNT(CASE WHEN last_assessment_id IS NOT NULL THEN 1 END) as with_assessment,
    COUNT(CASE WHEN kondisi_fisik = -1 THEN 1 END) as tidak_layak,
    COUNT(CASE WHEN kondisi_fungsi = -1 THEN 1 END) as tidak_berfungsi
FROM vendor_assets;

-- Cek per vendor
SELECT 
    v.vendor_name,
    COUNT(va.id) as total_assets,
    COUNT(CASE WHEN va.kondisi_fisik = -1 THEN 1 END) as tidak_layak,
    COUNT(CASE WHEN va.kondisi_fungsi = -1 THEN 1 END) as tidak_berfungsi
FROM vendor_assets va
JOIN vendors v ON va.vendor_id = v.id
WHERE va.last_assessment_id IS NOT NULL
GROUP BY v.vendor_name
ORDER BY v.vendor_name;

-- Bandingkan: Total assessment_items vs vendor_assets
SELECT 
    'assessment_items (dari assessment terbaru)' as source,
    COUNT(*) as total
FROM (
    SELECT DISTINCT ON (a.vendor_id, a.peruntukan_id, COALESCE(a.team_id::text, ''), COALESCE(a.personnel_id::text, ''))
        a.id as assessment_id
    FROM assessments a
    ORDER BY a.vendor_id, a.peruntukan_id, COALESCE(a.team_id::text, ''), COALESCE(a.personnel_id::text, ''), a.tanggal_penilaian DESC
) latest
JOIN assessment_items ai ON ai.assessment_id = latest.assessment_id

UNION ALL

SELECT 
    'vendor_assets (with assessment)' as source,
    COUNT(*) as total
FROM vendor_assets
WHERE last_assessment_id IS NOT NULL;

-- ============================================================================
-- STEP 4: ROLLBACK (Jika ada masalah)
-- ============================================================================

/*
-- Restore dari backup
TRUNCATE vendor_assets;
INSERT INTO vendor_assets SELECT * FROM vendor_assets_backup;

-- Hapus backup setelah selesai
DROP TABLE IF EXISTS vendor_assets_backup;
*/
