# DATABASE SCHEMA - Penilaian APD

## 📊 Tabel yang Sudah Ada

### 1. Table 'units'
**Primary Key:** `unit_code`
- `unit_code` (TEXT) - Kode unik: UID, BDG, BLG, BTR, dll
- `unit_name` (TEXT) - Nama lengkap: UID Jakarta Raya, UP3 Bandengan, dll
- `unit_tipe` (TEXT) - Tipe unit: 'UID' atau 'UP3'
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Sudah populated (18 units)

---

### 2. Table 'vendors'
**Primary Key:** `id (UUID)`
**Foreign Keys:** `unit_code` → `units(unit_code)`

- `id` (UUID) - Primary key
- `class` (TEXT) - Kelompok: 'HP' atau 'NON HP'
- `vendor_name` (TEXT) - Nama perusahaan
- `unit_code` (TEXT) - FK ke units.unit_code
- `unit_name` (TEXT) - Nama unit (denormalisasi)
- `class_code` (TEXT) - Kode kelompok (opsional)
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada

---

### 3. Table 'peruntukan'
**Primary Key:** `id (TEXT)`

- `id` (TEXT) - Kode unik peruntukan
- `jenis` (TEXT) - Jenis alat
- `deskripsi` (TEXT) - Deskripsi peruntukan

**Status:** ✅ Tabel sudah ada

---

### 4. Table 'profiles' (Auth Users)
**Primary Key:** `id (UUID)`
**Foreign Keys:** 
- `id` → `auth.users(id)`
- `unit_code` → `units(unit_code)`
- `vendor_id` → `vendors(id)`

- `id` (UUID) - FK ke auth.users.id
- `nama` (TEXT) - Nama lengkap
- `email` (TEXT) - Email unik
- `nip` (TEXT) - NIP unik
- `unit_code` (TEXT) - FK ke units.unit_code
- `bidang` (TEXT) - Bidang/departemen
- `sub_bidang` (TEXT) - Sub bidang
- `jabatan` (TEXT) - Jabatan
- `role` (USER-DEFINED) - Role: 'uid_admin', 'uid_user', 'up3_admin', 'up3_user', 'vendor_k3', 'petugas'
- `vendor_id` (UUID) - FK ke vendors.id
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada

---

### 5. Table 'teams' (Regu/Tim Kerja)
**Primary Key:** `id (UUID)`
**Foreign Keys:** 
- `vendor_id` → `vendors(id)`
- `peruntukan_id` → `peruntukan(id)`

- `id` (UUID) - Primary key
- `vendor_id` (UUID) - FK ke vendors.id
- `peruntukan_id` (TEXT) - FK ke peruntukan.id
- `category` (TEXT) - Kategori: 'Roda 2', 'Roda 4', 'Roda 6', 'Lainnya'
- `nomor_polisi` (TEXT) - Nomor polisi (identitas kendaraan)
- `access_token` (TEXT) - Token akses unik (auto-generate)
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada

---

### 6. Table 'personnel' (Pekerja/Personil)
**Primary Key:** `id (UUID)`
**Foreign Keys:**
- `vendor_id` → `vendors(id)`
- `team_id` → `teams(id)`
- `peruntukan_id` → `peruntukan(id)`

- `id` (UUID) - Primary key
- `vendor_id` (UUID) - FK ke vendors.id
- `team_id` (UUID) - FK ke teams.id (nullable)
- `nama_personil` (TEXT) - Nama lengkap
- `peruntukan_id` (TEXT) - FK ke peruntukan.id
- `nik` (TEXT) - NIK unik
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada

---

### 7. Table 'equipment_master' (Master Data Alat/APD)
**Primary Key:** `id (UUID)`

- `id` (UUID) - Primary key
- `nama_alat` (TEXT) - Nama alat/APD (UNIQUE)
- `kategori` (TEXT) - Kategori: APD, Kendaraan, dll
- `sub_kategori1` (TEXT) - Sub kategori (opsional)
- `satuan` (TEXT) - Satuan (default: 'Pcs')
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada

---

### 8. Table 'equipment_standards' (Standar Alat per Vendor)
**Primary Key:** `id (UUID)`
**Foreign Keys:**
- `vendor_id` → `vendors(id)`
- `unit_code` → `units(unit_code)`
- `peruntukan_id` → `peruntukan(id)`
- `equipment_id` → `equipment_master(id)`

- `id` (UUID) - Primary key
- `vendor_id` (UUID) - FK ke vendors.id
- `unit_code` (TEXT) - FK ke units.unit_code
- `peruntukan_id` (TEXT) - FK ke peruntukan.id
- `equipment_id` (UUID) - FK ke equipment_master.id
- `required_qty` (INTEGER) - Jumlah yang diperlukan (default: 1)
- `contract_qty` (INTEGER) - Jumlah dalam kontrak (opsional)
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada

**Fungsi:** Master data jumlah alat standar yang harus dimiliki vendor per peruntukan & unit

---

### 9. Table 'vendor_assets' (Asset Vendor - Tracking Alat)
**Primary Key:** `id (UUID)`
**Foreign Keys:**
- `vendor_id` → `vendors(id)`
- `peruntukan_id` → `peruntukan(id)`
- `team_id` → `teams(id)`
- `personnel_id` → `personnel(id)`
- `equipment_id` → `equipment_master(id)`

- `id` (UUID) - Primary key
- `vendor_id` (UUID) - FK ke vendors.id
- `peruntukan_id` (TEXT) - FK ke peruntukan.id (**BARU** - untuk tracking per peruntukan)
- `team_id` (UUID) - FK ke teams.id (nullable)
- `personnel_id` (UUID) - FK ke personnel.id (nullable)
- `equipment_id` (UUID) - FK ke equipment_master.id
- `distribution_date` (DATE) - Tanggal distribusi alat
- `usia_ekonomis_bulan` (INTEGER) - Umur ekonomis dalam bulan
- `last_assessment_id` (UUID) - Penilaian terakhir
- `last_assessment_date` (TIMESTAMP) - Tanggal penilaian terakhir
- `kesesuaian_kontrak` (INTEGER) - Score kesesuaian kontrak (0-2)
- `kondisi_fungsi` (INTEGER) - Score kondisi fungsi (0 atau -1)
- `kondisi_fisik` (INTEGER) - Score kondisi fisik (0 atau -1)
- `realisasi_qty` (INTEGER) - Jumlah aktual yang ada
- `nilai` (NUMERIC) - Nilai/score hasil penilaian
- `status_kesesuaian` (TEXT) - Status: Sesuai/Tidak Sesuai
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada (perlu ALTER untuk tambah peruntukan_id)

**Fungsi:** Tracking inventory alat vendor per peruntukan, update setelah penilaian dilakukan

**SQL untuk ALTER (jika kolom belum ada):**
```sql
ALTER TABLE vendor_assets 
ADD COLUMN peruntukan_id TEXT REFERENCES peruntukan(id);
```

---

### 10. Table 'assessments' (Hasil Penilaian - Header)
**Primary Key:** `id (UUID)`
**Foreign Keys:**
- `vendor_id` → `vendors(id)`
- `team_id` → `teams(id)`
- `personnel_id` → `personnel(id)`
- `assessor_id` → `profiles(id)`
- `peruntukan_id` → `peruntukan(id)`

- `id` (UUID) - Primary key
- `vendor_id` (UUID) - FK ke vendors.id
- `team_id` (UUID) - FK ke teams.id (nullable)
- `personnel_id` (UUID) - FK ke personnel.id (nullable)
- `assessor_id` (UUID) - FK ke profiles.id (user yang melakukan penilaian)
- `peruntukan_id` (TEXT) - FK ke peruntukan.id
- `tanggal_penilaian` (TIMESTAMP) - Tanggal & waktu penilaian
- `shift` (TEXT) - Shift kerja (Pagi, Siang, Malam)
- `jumlah_item_peralatan` (INTEGER) - Total jumlah item peralatan
- `jumlah_peralatan_layak` (INTEGER) - Jumlah peralatan layak
- `jumlah_peralatan_tidak_layak` (INTEGER) - Jumlah peralatan tidak layak
- `jumlah_peralatan_berfungsi` (INTEGER) - Jumlah peralatan berfungsi
- `jumlah_peralatan_tidak_berfungsi` (INTEGER) - Jumlah peralatan tidak berfungsi
- `total_score` (NUMERIC) - Total score penilaian (0-100)
- `status` (TEXT) - Status: 'Draft', 'Submitted', 'Revised', 'Approved'
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada

**Fungsi:** Header/induk dari assessment_items, menyimpan summary hasil penilaian

---

### 11. Table 'assessment_items' (Detail Penilaian - Per Equipment)
**Primary Key:** `id (UUID)`
**Foreign Keys:**
- `assessment_id` → `assessments(id)`
- `equipment_id` → `equipment_master(id)`

- `id` (UUID) - Primary key
- `assessment_id` (UUID) - FK ke assessments.id
- `equipment_id` (UUID) - FK ke equipment_master.id
- `required_qty` (INTEGER) - Jumlah yang seharusnya ada (dari equipment_standards)
- `actual_qty` (INTEGER) - Jumlah aktual yang ada (realisasi)
- `layak` (INTEGER) - Jumlah yang layak
- `tidak_layak` (INTEGER) - Jumlah yang tidak layak
- `berfungsi` (INTEGER) - Jumlah yang berfungsi
- `tidak_berfungsi` (INTEGER) - Jumlah yang tidak berfungsi
- `photo_url` (TEXT) - URL foto dokumentasi (opsional)
- `keterangan` (TEXT) - Catatan/deskripsi
- `kesesuaian_kontrak` (INTEGER) - Score: 2 (sesuai) atau 0 (tidak sesuai)
- `kondisi_fisik` (INTEGER) - Score: 0 (layak) atau -1 (tidak layak)
- `kondisi_fungsi` (INTEGER) - Score: 0 (berfungsi) atau -1 (tidak berfungsi)
- `score_item` (INTEGER) - Total score item (sum dari 3 score)
- `created_at` (TIMESTAMP) - Waktu pembuatan

**Status:** ✅ Tabel sudah ada

**Scoring Formula:**
```
kesesuaian_kontrak = IF (actual_qty >= required_qty) THEN 2 ELSE 0
kondisi_fisik = IF (tidak_layak == 0) THEN 0 ELSE -1
kondisi_fungsi = IF (tidak_berfungsi == 0) THEN 0 ELSE -1
score_item = kesesuaian_kontrak + kondisi_fisik + kondisi_fungsi
```

---

## 🔗 Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────┐
│                      units                              │
│  (UID Jakarta Raya + 17 UP3)                            │
└──────────────────────┬──────────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
    ┌──────────┐ ┌──────────┐ ┌──────────────────┐
    │ vendors  │ │profiles  │ │equipment_standards
    │          │ │(users)   │ └────────┬─────────┘
    └────┬─────┘ └──────────┘          │
         │                              ▼
    ┌────┼──────────────┐     ┌──────────────────────┐
    │    │              │     │ equipment_master     │
    │    ▼              ▼     │ (Master Data Alat)   │
    │ ┌────────┐    ┌──────────┐ └──────┬───────────┘
    │ │ teams  │    │personnel │       │
    │ │(Regu) │    │(Pekerja) │       │
    │ └───┬────┘    └────┬─────┘       │
    │     │              │             │
    │     └──────┬───────┘             │
    │            │                     │
    │            ▼                     │
    │     ┌────────────────┐           │
    │     │ vendor_assets  │◄──────────┘
    │     │(Inventory)     │
    │     └────────────────┘
    │
    └─────────┬─────────────────────────────┐
              │                             │
              ▼                             ▼
        ┌──────────────────┐      ┌──────────────────┐
        │  assessments     │      │  peruntukan      │
        │  (Header)        │◄─────│ (Alokasi Alat)   │
        └────────┬─────────┘      └──────────────────┘
                 │
                 ▼
        ┌──────────────────┐
        │assessment_items  │
        │(Detail)          │
        └──────────────────┘
```

---

## 📊 Alur Penilaian Sistem Scoring

### **Input Data Penilaian:**

```
User mengisi form penilaian:
├─ Tanggal & Shift
├─ Unit & Vendor
├─ Jenis Penilaian (APD/Kendaraan)
├─ Untuk setiap equipment:
│  ├─ Required Qty (dari equipment_standards)
│  ├─ Actual Qty (Realisasi)
│  ├─ Layak
│  ├─ Berfungsi
│  └─ Keterangan
└─ Submit
```

### **Proses Scoring Otomatis:**

```
Untuk setiap equipment_item:

1️⃣ Kesesuaian Kontrak
   Score = IF (Actual_Qty >= Required_Qty) THEN 2 ELSE 0
   
   Contoh:
   - Required: 10, Actual: 10 → Score: 2 ✅
   - Required: 10, Actual: 8 → Score: 0 ❌

2️⃣ Kondisi Fisik
   Score = IF (Tidak_Layak == 0) THEN 0 ELSE -1
   
   Contoh:
   - Layak: 10, Tidak_Layak: 0 → Score: 0 ✅
   - Layak: 8, Tidak_Layak: 2 → Score: -1 ❌

3️⃣ Kondisi Fungsi
   Score = IF (Tidak_Berfungsi == 0) THEN 0 ELSE -1
   
   Contoh:
   - Berfungsi: 10, Tidak_Berfungsi: 0 → Score: 0 ✅
   - Berfungsi: 8, Tidak_Berfungsi: 2 → Score: -1 ❌

4️⃣ Total Score Item
   Score = Kesesuaian_Kontrak + Kondisi_Fisik + Kondisi_Fungsi
   
   Range: -2 (terburuk) sampai 2 (terbaik)
   
   Contoh:
   - 2 + 0 + 0 = 2 (Sempurna) ⭐⭐
   - 2 + (-1) + (-1) = 0 (Ada masalah) ⚠️
   - 0 + (-1) + (-1) = -2 (Sangat bermasalah) ❌
```

### **Aggregasi ke Assessment Header:**

```
Setelah semua items diisi:

1. Sum semua jumlah:
   ├─ Jumlah_Item_Peralatan = COUNT(items)
   ├─ Jumlah_Layak = SUM(layak)
   ├─ Jumlah_Tidak_Layak = SUM(tidak_layak)
   ├─ Jumlah_Berfungsi = SUM(berfungsi)
   └─ Jumlah_Tidak_Berfungsi = SUM(tidak_berfungsi)

2. Total Score:
   total_score = (SUM(score_item) / COUNT(items) + 2) / 4 × 100
   
   Normalisasi ke skala 0-100:
   - Range raw score: -2 sampai 2
   - Shift ke: 0 sampai 4
   - Normalize ke: 0-100
   
   Contoh:
   - Avg raw score: 2 → (2+2)/4 × 100 = 100 ⭐ Sempurna
   - Avg raw score: 0 → (0+2)/4 × 100 = 50 ⚠️ Cukup
   - Avg raw score: -2 → (-2+2)/4 × 100 = 0 ❌ Buruk
```

---

## 📋 User Roles & Permissions

### **Role Hierarchy & Permissions**

#### 1. **uid_admin** (UID Pusat - Full Access)
- **Level:** Pusat (UID)
- **Scope:** Semua Unit & Vendor
- **Akses Data:** Full Access
- **Permissions:**
  - Manage master data (equipment_standards)
  - Create/Edit/Delete standards
  - Review & Approve/Reject assessments
  - Audit Log & laporan komprehensif
  - Manage users & roles
  - Download all reports
- **Use Cases:** System Admin, Master Data Manager, Central Auditor

#### 2. **uid_user** (UID Pusat - Read Only)
- **Level:** Pusat (UID)
- **Scope:** Semua Unit & Vendor
- **Akses Data:** Read Only
- **Permissions:**
  - View Dashboard Jakarta Raya
  - Download rekap nasional
  - Analisis trend data (historis)
  - View semua assessments
  - Export laporan
- **Use Cases:** Business Analyst, Central Monitor, Executive Report

#### 3. **up3_admin** (Cabang UP3 - Read/Write)
- **Level:** Cabang (UP3)
- **Scope:** Unit sendiri + Vendor dibawahnya
- **Akses Data:** Read/Write
- **Permissions:**
  - Manage data teams & personnel
  - Review penilaian vendor (Verify)
  - Manage vendor_assets (inventory)
  - Create equipment_standards (unit sendiri)
  - Download rekap unit
- **Use Cases:** Unit Manager, Warehouse Manager

#### 4. **up3_user** (Cabang UP3 - Read Only)
- **Level:** Cabang (UP3)
- **Scope:** Unit sendiri
- **Akses Data:** Read Only
- **Permissions:**
  - Verifikasi lapangan (Spot-Check)
  - View dashboard unit
  - View assessments sendiri
  - Download rekap unit
- **Use Cases:** Field Verifier, Unit Monitor

#### 5. **vendor_k3** (Vendor - Create/Edit)
- **Level:** Vendor
- **Scope:** Hanya vendor mereka
- **Akses Data:** Create/Edit
- **Permissions:**
  - Input assessments (Create Draft)
  - Input assessment_items
  - Upload foto dokumentasi
  - Edit draft assessments
  - Submit untuk review
- **Use Cases:** Vendor APD, Assessment Creator

#### 6. **petugas** (Petugas Lapangan - Form Only)
- **Level:** Lapangan
- **Scope:** Hanya form penilaian
- **Akses Data:** Create Only
- **Permissions:**
  - Input assessments (Create Draft)
  - Input assessment_items
  - Upload foto dokumentasi
- **UI Behavior:**
  - Login langsung redirect ke halaman form penilaian
  - Semua menu/halaman lain disembunyikan
  - Tidak ada akses ke dashboard, reports, atau master data
- **Use Cases:** Petugas Lapangan, Field Worker, Data Entry

### **Database Access Control (RLS Policies)**

```sql
-- uid_admin: Full Access
SELECT: TRUE
INSERT: TRUE
UPDATE: TRUE
DELETE: TRUE

-- uid_user: Read Only Everything
SELECT: TRUE
INSERT: FALSE
UPDATE: FALSE
DELETE: FALSE

-- up3_admin: Own Unit + Vendors under them
SELECT: WHERE unit_code = auth.user.unit_code
INSERT: WHERE unit_code = auth.user.unit_code
UPDATE: WHERE unit_code = auth.user.unit_code
DELETE: WHERE unit_code = auth.user.unit_code

-- up3_user: Own Unit Only
SELECT: WHERE unit_code = auth.user.unit_code
INSERT: FALSE
UPDATE: FALSE
DELETE: FALSE

-- vendor_k3: Own Vendor Only
SELECT: WHERE vendor_id = auth.user.vendor_id
INSERT: WHERE vendor_id = auth.user.vendor_id
UPDATE: WHERE vendor_id = auth.user.vendor_id AND status = 'Draft'
DELETE: WHERE vendor_id = auth.user.vendor_id AND status = 'Draft'

-- petugas: Form Only (Most Restricted)
SELECT: WHERE vendor_id = auth.user.vendor_id AND table IN ('assessments', 'assessment_items', 'equipment_standards', 'equipment_master')
INSERT: WHERE vendor_id = auth.user.vendor_id AND table IN ('assessments', 'assessment_items')
UPDATE: FALSE
DELETE: FALSE
```

### **Feature Access Matrix**

| Feature | uid_admin | uid_user | up3_admin | up3_user | vendor_k3 | petugas |
|---------|-----------|----------|-----------|----------|-----------|----------|
| Dashboard | ✅ Full | ✅ National | ✅ Unit | ✅ Unit | ✅ Vendor | ❌ |
| Master Data (Equipment) | ✅ CRUD | ❌ | ❌ | ❌ | ❌ | ❌ |
| Equipment Standards | ✅ CRUD | ❌ | ✅ Own Unit | ❌ | ❌ | ❌ |
| Teams Management | ✅ R | ❌ | ✅ Own Unit | ❌ | ❌ | ❌ |
| Personnel Management | ✅ R | ❌ | ✅ Own Unit | ❌ | ❌ | ❌ |
| Create Assessment | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Input Assessment Items | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ |
| Review Assessment | ✅ Approve | ❌ | ✅ Verify | ✅ Spot-Check | ❌ | ❌ |
| Submit Assessment | ✅ | ❌ | ❌ | ❌ | ✅ | ❌ |
| Edit Draft | ✅ | ❌ | ❌ | ❌ | ✅ Own | ❌ |
| View Reports | ✅ All | ✅ All | ✅ Unit | ✅ Unit | ✅ Own | ❌ |
| Download Reports | ✅ All | ✅ All | ✅ Unit | ✅ Unit | ✅ Own | ❌ |
| Audit Log | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| User Management | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Form Penilaian Only | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ |

---

## 🚀 Database Schema Summary

| Tabel | Fungsi | Status |
|-------|--------|--------|
| `units` | Master unit (UID + UP3) | ✅ Ada |
| `vendors` | Master vendor per unit | ✅ Ada |
| `teams` | Regu kerja per vendor | ✅ Ada |
| `personnel` | Pekerja per vendor | ✅ Ada |
| `peruntukan` | Master jenis alat (APD, Kendaraan) | ✅ Ada |
| `equipment_master` | Master daftar alat spesifik | ✅ Ada |
| `equipment_standards` | Standar alat per vendor/peruntukan | ✅ Ada |
| `profiles` | Auth users | ✅ Ada |
| `vendor_assets` | Tracking inventory alat vendor | ✅ Ada |
| `assessments` | Header hasil penilaian | ✅ Ada |
| `assessment_items` | Detail hasil penilaian per equipment | ✅ Ada |

---

## 🔑 Key Features

✅ **Denormalisasi Terkontrol**
- equipment_standards: menyimpan required_qty agar mudah validasi
- vendor_assets: menyimpan realisasi_qty terbaru dari assessment terakhir

✅ **Automatic Scoring**
- Semua kalkulasi score ada computed field di database
- Client hanya kirim raw data (qty, kondisi), DB yang hitung score

✅ **Audit Trail**
- Setiap assessment disimpan lengkap dengan assessor_id & timestamp
- Bisa lihat history penilaian vendor

✅ **Flexibility**
- Bisa penilaian untuk team atau personnel secara terpisah
- Equipment_standards bisa berbeda per vendor

---

## 🚀 Next Steps

1. ✅ Verify semua tabel sudah ada & struktur sesuai
2. ⏳ Seed data untuk testing:
   - peruntukan (APD, Kendaraan)
   - equipment_master (helm, rompi, sepatu, dll)
   - equipment_standards (standar per vendor)
3. ⏳ Setup RLS (Row Level Security) policies
4. ⏳ Create API functions/procedures
5. ⏳ Update form-penilaian untuk integrasi Supabase
6. ⏳ Dokumentasi API endpoints

---

## 📌 Catatan Penting

- **Scoring Logic**: Sudah tersimpan di computed fields (CASE statements)
- **Foreign Keys**: Semua sudah ada dengan ON DELETE CASCADE/SET NULL
- **Unique Constraints**: equipment_master.nama_alat UNIQUE
- **Default Values**: assessments.status default 'Draft'
- **Timestamps**: created_at di semua tabel, assessment juga bisa track last_assessment_date

---

## 🔧 Edge Function: submit-penilaian

### Deskripsi
Edge function untuk atomic transaction saat submit penilaian. Memastikan data assessment dan vendor_assets tersimpan secara konsisten.

### Endpoint
```
POST /functions/v1/submit-penilaian
```

### Request Payload
```json
{
  "tanggal_penilaian": "2026-02-11",
  "shift": "Pagi",
  "vendor_id": "uuid-vendor",
  "peruntukan_id": "APD-001",
  "team_id": "uuid-team-or-null",
  "personnel_id": "uuid-personnel-or-null",
  "assessor_id": "uuid-user",
  "items": [
    {
      "equipment_id": "uuid-equipment",
      "required_qty": 10,
      "actual_qty": 10,
      "layak": 10,
      "tidak_layak": 0,
      "berfungsi": 10,
      "tidak_berfungsi": 0
    }
  ],
  "jumlah_item_peralatan": 1,
  "total_score": 2.0
}
```

### Response
```json
{
  "success": true,
  "data": {
    "assessment": { "id": "uuid", ... },
    "items": [...],
    "vendor_assets": [
      { "action": "created", "id": "uuid", "equipment_id": "uuid" },
      { "action": "updated", "id": "uuid", "equipment_id": "uuid" }
    ]
  },
  "message": "Assessment created with 5 items. 3 new assets, 2 updated."
}
```

### Proses Atomic
1. **INSERT assessments** - Buat header penilaian
2. **INSERT assessment_items** (batch) - Buat detail penilaian
3. **UPSERT vendor_assets** - Insert baru atau update existing
4. Return result atau rollback jika error

### Deploy
```bash
supabase functions deploy submit-penilaian
```

---

## 🔒 Vendor Assets Unique Constraint

### Tujuan
Memastikan setiap alat fisik memiliki ID unik berdasarkan kombinasi:
- `vendor_id` - Vendor mana
- `peruntukan_id` - Untuk peruntukan apa
- `team_id` - Untuk kendaraan/regu mana (nullable)
- `personnel_id` - Untuk personil mana (nullable)
- `equipment_id` - Jenis alat apa

### Index
```sql
CREATE UNIQUE INDEX idx_vendor_assets_unique_combination 
ON vendor_assets (
    vendor_id, 
    peruntukan_id, 
    COALESCE(team_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(personnel_id, '00000000-0000-0000-0000-000000000000'::uuid),
    equipment_id
);
```

### Konsep
```
Vendor A + Peruntukan Inspeksi JTR + Mobil B-1234 + Helm = 1 Record Unik
Vendor A + Peruntukan Inspeksi JTR + Mobil B-5678 + Helm = 1 Record Unik (BERBEDA)
Vendor A + Peruntukan Admin + Personil Budi + Seragam = 1 Record Unik
```

### SQL Migration
Lihat: `docs/sql/001-vendor-assets-constraint.sql`
