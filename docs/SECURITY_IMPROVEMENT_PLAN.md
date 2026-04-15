# Rencana Perbaikan Keamanan — SIGAP

**Tanggal Audit:** 15 April 2026  
**Tanggal Implementasi:** 15 April 2026  
**Status:** Fase 1 & 3 selesai — Fase 2 (XSS) tersisa

---

## Ringkasan Eksekutif

Audit mendalam menemukan **16 masalah** (12 dari review awal + 4 temuan baru kritis).  
**12 sudah diperbaiki** pada sesi ini. **4 tersisa** (XSS innerHTML, audit logging, server-side role verification, rate limiting).

---

## Status per Item

| # | Item | Severity | Status |
|---|------|----------|--------|
| 1 | Edge Function JWT Verification | CRITICAL | ✅ Fixed |
| NEW-1 | Edge Function auth header diabaikan | CRITICAL | ✅ Fixed |
| NEW-2 | `assessor_id` dikontrol client | CRITICAL | ✅ Fixed |
| NEW-3 | 12 RPC functions accessible by anon | CRITICAL | ✅ Fixed |
| 2 | RLS Personnel terlalu longgar | HIGH | ✅ Fixed |
| 3 | Input Validation Edge Function | HIGH | ✅ Fixed |
| 5 | XSS via innerHTML | HIGH | ⏳ Tersisa |
| 6 | Rate Limiting | HIGH | ⏳ Tersisa |
| 7 | CORS terlalu permissive | MEDIUM | ✅ Fixed |
| 8 | Data sensitif di localStorage | MEDIUM | ✅ Fixed |
| 9 | Audit Logging | MEDIUM | ⏳ Tersisa |
| 4 | Client-Side Authorization | MEDIUM | ⏳ Tersisa |
| 10 | Security Headers | LOW | ✅ Fixed |
| NEW-4 | fn_unit_report tanpa otorisasi unit | HIGH | ✅ Mitigated (anon revoked) |

---

## CRITICAL — Temuan Baru (Ditemukan Audit 15 April 2026)

### NEW-1: Edge Function MEMBACA tapi MENGABAIKAN auth header ✅ FIXED

**File:** `supabase/functions/submit-penilaian/index.ts`  
**Kondisi lama:** Auth header dibaca tapi tidak pernah divalidasi. Fungsi lanjut menggunakan service role key tanpa peduli apakah caller terautentikasi.

**Yang sudah diperbaiki:**
1. `verify_jwt = true` di `config.toml` — gateway Supabase menolak request tanpa JWT
2. Di dalam fungsi: validasi header `Authorization`, verifikasi token via `supabaseAdmin.auth.getUser(token)`, return 401 jika invalid

---

### NEW-2: `assessor_id` sepenuhnya dikontrol client ✅ FIXED

**File:** `supabase/functions/submit-penilaian/index.ts`  
**Kondisi lama:** `body.assessor_id` dipakai langsung — siapapun bisa mengklaim assessment atas nama orang lain.

**Yang sudah diperbaiki:**  
`assessor_id: user.id` — selalu menggunakan ID dari JWT yang terverifikasi, bukan dari request body. Field `assessor_id` di interface `SubmitRequest` sekarang diabaikan.

---

### NEW-3: 12 SECURITY DEFINER Functions accessible tanpa login ✅ FIXED

**Kondisi lama:** Semua fungsi dashboard punya `GRANT EXECUTE ... TO anon` — data lengkap bisa diambil tanpa login menggunakan anon key yang terbuka di file JS.

**Yang sudah diperbaiki:**  
Migration `20260415100000_revoke_anon_rpc_grants.sql` — REVOKE EXECUTE dari `anon` untuk semua 12 fungsi:
- `fn_dashboard_stats`, `fn_equipment_issues`, `fn_trend_monthly`, `fn_entry_realization`
- `fn_unit_recap`, `fn_unit_report`, `fn_daily_entry_per_unit`
- `fn_up3_stats`, `fn_up3_vendor_recap`, `fn_up3_equipment_issues`, `fn_up3_daily_chart`, `fn_up3_unfulfilled_contracts`

---

## CRITICAL — Item Lama

### 1. Edge Function JWT Verification ✅ FIXED

**File:** `supabase/config.toml` → `verify_jwt = true`

---

### 2. RLS Personnel Terlalu Longgar ✅ FIXED

**Migration:** `20260415110000_fix_personnel_rls.sql`

Policy baru menggunakan helper function `personnel_access_check(vendor_id)` yang memfilter akses berdasarkan role:
- `uid_admin/uid_user`: akses semua
- `up3_admin/up3_user`: hanya vendor dalam unit mereka
- `vendor_k3/petugas`: hanya vendor milik mereka sendiri

---

## HIGH — Sudah Diperbaiki

### 3. Input Validation di Edge Function ✅ FIXED

**File:** `supabase/functions/submit-penilaian/index.ts`

Validasi yang ditambahkan:
- UUID format regex untuk semua ID field (vendor_id, peruntukan_id, equipment_id, team_id, personnel_id)
- Range check: `required_qty > 0`, `actual_qty >= 0`, `layak/tidak_layak/berfungsi/tidak_berfungsi >= 0`
- Format tanggal `YYYY-MM-DD` + validasi parseable
- Personnel IDs divalidasi UUID sebelum diinsert

---

### 5. XSS via innerHTML ⏳ TERSISA

**File yang terdampak:** 19 file JS, 209 occurrences

**Rencana (belum dikerjakan):**
1. Buat helper `escapeHtml(text)` global di `main.js`
2. Ganti `innerHTML = \`...${data}...\`` dengan `textContent` atau `createElement`
3. Prioritas: data-personil.js, data-vendor.js, data-peralatan.js, form-penilaian-load.js

---

## MEDIUM — Sudah Diperbaiki

### 7. CORS Terlalu Permissive ✅ FIXED

**File:** `supabase/functions/submit-penilaian/index.ts`

CORS sekarang hanya mengizinkan:
- `https://penilaian-alat-uid.web.app`
- `https://penilaian-alat-uid.firebaseapp.com`

---

### 8. Data Sensitif di localStorage ✅ FIXED

**File:** `public/assets/js/auth/supabase-auth.js` + `public/assets/js/main.js`

Semua operasi `localStorage` untuk `user_role`, `user_unit_code`, `user_vendor_id` diganti ke `sessionStorage`. Data hilang otomatis saat tab/browser ditutup.

---

### 9. Audit Logging ⏳ TERSISA

**Rencana (belum dikerjakan):**
1. Buat tabel `audit_logs`
2. Buat trigger untuk INSERT/UPDATE/DELETE di tabel: `assessments`, `personnel`, `vendor_assets`
3. Catat: user_id, aksi, tabel, data lama, data baru, timestamp

---

### 4. Client-Side Authorization ⏳ TERSISA (partial mitigation)

**Kondisi saat ini:** Role masih disimpan di sessionStorage untuk UI.  
**Mitigasi yang sudah ada:** RLS di database adalah perlindungan nyata. sessionStorage lebih aman dari localStorage.  
**Yang masih perlu dikerjakan:** Tambah verifikasi role via Supabase session untuk halaman sensitif, bukan hanya dari storage.

---

## LOW — Sudah Diperbaiki

### 10. Security Headers ✅ FIXED

**File:** `firebase.json`

Headers yang ditambahkan:
- `X-Frame-Options: DENY` — cegah clickjacking
- `X-Content-Type-Options: nosniff` — cegah MIME sniffing
- `Strict-Transport-Security: max-age=31536000; includeSubDomains` — enforce HTTPS
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()`

---

## File yang Dimodifikasi

| File | Perubahan |
|------|-----------|
| `supabase/config.toml` | `verify_jwt = true` |
| `supabase/functions/submit-penilaian/index.ts` | Auth validation, vendor authorization, input validation, CORS fix, assessor_id dari JWT |
| `supabase/migrations/20260415100000_revoke_anon_rpc_grants.sql` | REVOKE anon dari 12 RPC functions |
| `supabase/migrations/20260415110000_fix_personnel_rls.sql` | RLS personnel per vendor/unit |
| `public/assets/js/auth/supabase-auth.js` | localStorage → sessionStorage |
| `public/assets/js/main.js` | localStorage → sessionStorage |
| `firebase.json` | Security headers |

---

## Deployment Steps

```bash
# 1. Deploy Edge Function (wajib — ada perubahan verify_jwt di config.toml)
supabase functions deploy submit-penilaian

# 2. Apply migrations
supabase db push

# 3. Deploy Firebase Hosting (untuk security headers)
firebase deploy --only hosting
```

---

## Checklist Verifikasi Post-Deploy

- [ ] `curl -X POST [edge-function-url]` tanpa Authorization → harus 401
- [ ] Login sebagai vendor A, submit assessment dengan vendor_id vendor B → harus 403
- [ ] Panggil `fn_dashboard_stats` via curl dengan hanya anon key → harus 401/403
- [ ] Login sebagai vendor A, query personnel → hanya personil vendor A yang muncul
- [ ] Buka browser, tutup tab, buka kembali → menu kembali ke default (sessionStorage cleared)
- [ ] Cek Network tab: response headers harus include `X-Frame-Options: DENY`

---

## Yang Masih Perlu Dikerjakan (Backlog)

| Prioritas | Item | Estimasi |
|-----------|------|----------|
| HIGH | Fix XSS innerHTML (19 files, 209 occurrences) | 3-4 jam |
| MEDIUM | Audit logging (trigger + tabel) | 2-3 jam |
| MEDIUM | Server-side role verification di halaman sensitif | 2-3 jam |
| MEDIUM | Rate limiting di Edge Function | 1-2 jam |
