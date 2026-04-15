# SIGAP — Penilaian APD Admin

## Gambaran Proyek

Aplikasi web admin untuk penilaian APD (Alat Pelindung Diri) vendor/kontraktor listrik. Digunakan oleh PLN UID/UP3 untuk menilai kelengkapan dan kondisi APD pekerja lapangan.

- **Frontend:** Static HTML/CSS/JS di `public/` — deploy ke Firebase Hosting
- **Backend:** Supabase (PostgreSQL + Auth + Edge Functions)
- **Deploy URL:** `https://safetytools-uid.web.app`
- **Supabase Project:** `wkkottkbmwlsoeysixet.supabase.co`
- **Git Remote:** `https://github.com/shaddiqilhamdi/penilaian-alat.git`

## Stack Teknis

| Komponen | Teknologi |
|----------|-----------|
| Hosting | Firebase Hosting (`firebase deploy --only hosting`) |
| Database | Supabase PostgreSQL |
| Auth | Supabase Auth (JWT) |
| Edge Function | Supabase Edge Functions (Deno) |
| Frontend | Vanilla JS + Bootstrap 5 + NiceAdmin template |
| CLI Supabase | `npx supabase` (tidak terinstall global) |

## Struktur File Penting

```
public/
  assets/js/
    config/supabase-client.js     ← Singleton Supabase client
    auth/supabase-auth.js         ← Login, logout, role storage (sessionStorage)
    main.js                       ← Shared UI (menu permissions, datatables, dll)
    api/                          ← API wrappers per tabel (vendors, personnel, dll)
    form-penilaian-load.js        ← Init form & auth check (redirect ke login jika tidak auth)
    form-penilaian-submit.js      ← Submit via Edge Function
    form-penilaian-manager.js     ← State management form
    data-*.js                     ← Halaman data CRUD
    dashboard-up3.js              ← Dashboard UP3
  forms-penilaian.html            ← Form penilaian utama (petugas/vendor_k3)
  forms-penilaian-mobile.html     ← Versi mobile
  index.html                      ← Dashboard UID
  pages-login.html                ← Login page

supabase/
  config.toml                     ← verify_jwt = true untuk submit-penilaian
  functions/submit-penilaian/     ← Edge Function utama
  migrations/                     ← SQL migrations (sudah applied ke production)

docs/
  SECURITY_IMPROVEMENT_PLAN.md   ← Status perbaikan keamanan lengkap
  DATA_BASE.md                    ← Skema database lengkap
```

## Role System

| Role | Akses |
|------|-------|
| `uid_admin` | Semua fitur seluruh sistem |
| `uid_user` | Semua fitur seluruh sistem (non-admin) |
| `up3_admin` | Fitur UP3, hanya vendor dalam unitnya |
| `up3_user` | Fitur UP3, hanya vendor dalam unitnya |
| `vendor_k3` | Data vendor sendiri + form penilaian |
| `petugas` | Hanya form penilaian |

Role disimpan di `sessionStorage` (bukan localStorage) setelah login. **RLS di database adalah pertahanan nyata** — client-side role check hanya untuk UI.

## Deployment Commands

```bash
# Edge Function
npx supabase functions deploy submit-penilaian --project-ref wkkottkbmwlsoeysixet

# Firebase Hosting
firebase deploy --only hosting

# DB Migrations
npx supabase db push --project-ref wkkottkbmwlsoeysixet
```

## Status Keamanan (per 15 April 2026)

Lihat `docs/SECURITY_IMPROVEMENT_PLAN.md` untuk detail lengkap.

**Sudah diperbaiki (12 item):**
- `verify_jwt = false` di Edge Function gateway (karena ES256 JWT tidak didukung gateway; auth dilakukan di dalam function via `supabaseUser.auth.getUser()`)
- Auth validation dengan user-scoped client di dalam Edge Function
- `assessor_id` selalu dari JWT (tidak dari request body)
- 12 dashboard RPC functions: REVOKE EXECUTE dari role `anon`
- RLS personnel: per vendor/unit (bukan hanya `auth.uid() IS NOT NULL`)
- Input validation (UUID, date, qty range) di Edge Function
- CORS dibatasi ke domain Firebase + localhost dev
- localStorage → sessionStorage untuk user_role, user_unit_code, user_vendor_id
- Security headers di Firebase Hosting (X-Frame-Options, HSTS, dll)

**Belum dikerjakan (backlog):**
- XSS via innerHTML — 209 occurrences di 19 file JS (HIGH)
- Audit logging (tabel + trigger) (MEDIUM)
- Server-side role verification di halaman sensitif (MEDIUM)
- Rate limiting di Edge Function (MEDIUM)

## Bug Aktif (per 15 April 2026)

### Form Submit 401 Unauthorized — RESOLVED 15 April 2026

**Root cause:** Supabase Auth sekarang menerbitkan JWT dengan algoritma ES256 (asimetris), tapi gateway Edge Function (`verify_jwt = true`) hanya support HS256. Token ditolak gateway sebelum sampai ke function code.

**Error message:** `{code: 'UNAUTHORIZED_UNSUPPORTED_TOKEN_ALGORITHM', message: 'Unsupported JWT algorithm ES256'}`

**Fix:** Set `verify_jwt = false` di `supabase/config.toml`. Auth tetap aman karena function code sudah melakukan verifikasi via `supabaseUser.auth.getUser()` (server-side token validation).

## Edge Function Pattern

```typescript
// BENAR — user-scoped client untuk auth
const supabaseUser = createClient(URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { autoRefreshToken: false, persistSession: false }
})
const { data: { user } } = await supabaseUser.auth.getUser()

// BENAR — service role untuk DB writes (setelah user terverifikasi)
const supabaseAdmin = createClient(URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
})

// SALAH — jangan pakai admin.auth.getUser(token) untuk verifikasi user
// const { data: { user } } = await supabaseAdmin.auth.getUser(token)  // ← ini bermasalah
```

## Catatan Penting

- **Supabase CLI:** gunakan `npx supabase`, bukan `supabase` langsung (tidak terinstall global)
- **Docker warning:** `WARNING: Docker is not running` saat deploy function = normal, deploy tetap berhasil
- **CORS domains:** pastikan domain baru ditambahkan ke `ALLOWED_ORIGINS` di edge function jika hosting pindah
- **inline script di forms-penilaian.html (line 393):** masih baca `localStorage.getItem('user_role')` — ini hanya untuk CSS class, tidak mempengaruhi auth. Perlu diupdate ke sessionStorage suatu saat.
- **forms-penilaian.html tidak punya auth check inline** — auth check ada di `form-penilaian-load.js` via `getCurrentUser()` yang redirect ke login jika tidak auth.
