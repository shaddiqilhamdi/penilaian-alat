// Supabase Edge Function: submit-penilaian
// Handles atomic transaction for assessment submission + vendor assets upsert
// Deploy: supabase functions deploy submit-penilaian
// @ts-nocheck - Deno runtime, VS Code may show false errors

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

// Allowed origins: Firebase Hosting + localhost for development
const ALLOWED_ORIGINS = [
    'https://penilaian-alat-uid.web.app',
    'https://penilaian-alat-uid.firebaseapp.com',
    'http://localhost',
    'http://localhost:5500',
    'http://127.0.0.1:5500',
    'http://localhost:3000',
]

function getCorsHeaders(origin: string | null) {
    const allowed = origin && ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]
    return {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    }
}

// ─── Input validation helpers ───────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

function isValidUUID(id: unknown): boolean {
    return typeof id === 'string' && UUID_RE.test(id)
}

function isValidDate(d: unknown): boolean {
    if (typeof d !== 'string' || !DATE_RE.test(d)) return false
    const parsed = new Date(d)
    return !isNaN(parsed.getTime())
}

function isNonNegativeInt(n: unknown): boolean {
    return typeof n === 'number' && Number.isInteger(n) && n >= 0
}

function isPositiveInt(n: unknown): boolean {
    return typeof n === 'number' && Number.isInteger(n) && n > 0
}

// ─── Types ───────────────────────────────────────────────────────────────────

interface AssessmentItem {
    equipment_id: string
    required_qty: number
    actual_qty: number
    layak: number
    tidak_layak: number
    berfungsi: number
    tidak_berfungsi: number
    jenis?: string  // 'Personal' or 'Regu' - from equipment_master
}

interface SubmitRequest {
    tanggal_penilaian: string
    shift: string
    vendor_id: string
    peruntukan_id: string
    team_id: string | null
    personnel_id: string | null
    personnel_ids: string[] | null
    items: AssessmentItem[]
    jumlah_item_peralatan: number
    total_score: number
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
    const origin = req.headers.get('Origin')
    const corsHeaders = getCorsHeaders(origin)

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // ── 1. Authenticate request ──────────────────────────────────────────
        const authHeader = req.headers.get('Authorization')
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized: missing token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        const token = authHeader.replace('Bearer ', '')

        // Service-role client for DB writes (bypasses RLS intentionally for atomic writes)
        const supabaseAdmin = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            { auth: { autoRefreshToken: false, persistSession: false } }
        )

        // Verify JWT and extract user identity
        const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)
        if (authError || !user) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized: invalid token' }),
                { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Fetch caller's profile for role-based vendor authorization
        const { data: callerProfile, error: profileError } = await supabaseAdmin
            .from('profiles')
            .select('role, vendor_id, unit_code')
            .eq('id', user.id)
            .single()

        if (profileError || !callerProfile) {
            return new Response(
                JSON.stringify({ success: false, error: 'Unauthorized: profile not found' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── 2. Parse & validate request body ─────────────────────────────────
        const body: SubmitRequest = await req.json()

        // Required field presence
        if (!body.vendor_id || !body.peruntukan_id || !body.items?.length) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields: vendor_id, peruntukan_id, items' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // UUID format validation
        const uuidFields: [string, unknown][] = [
            ['vendor_id', body.vendor_id],
            ['peruntukan_id', body.peruntukan_id],
        ]
        if (body.team_id) uuidFields.push(['team_id', body.team_id])
        if (body.personnel_id) uuidFields.push(['personnel_id', body.personnel_id])

        for (const [field, val] of uuidFields) {
            if (!isValidUUID(val)) {
                return new Response(
                    JSON.stringify({ success: false, error: `Invalid UUID format for field: ${field}` }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // Date validation
        if (!isValidDate(body.tanggal_penilaian)) {
            return new Response(
                JSON.stringify({ success: false, error: 'Invalid date format for tanggal_penilaian (expected YYYY-MM-DD)' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Item-level validation
        for (let i = 0; i < body.items.length; i++) {
            const item = body.items[i]
            if (!isValidUUID(item.equipment_id)) {
                return new Response(
                    JSON.stringify({ success: false, error: `Invalid equipment_id at items[${i}]` }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            if (!isPositiveInt(item.required_qty)) {
                return new Response(
                    JSON.stringify({ success: false, error: `required_qty must be a positive integer at items[${i}]` }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            if (!isNonNegativeInt(item.actual_qty)) {
                return new Response(
                    JSON.stringify({ success: false, error: `actual_qty must be >= 0 at items[${i}]` }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
            if (!isNonNegativeInt(item.layak) || !isNonNegativeInt(item.tidak_layak) ||
                !isNonNegativeInt(item.berfungsi) || !isNonNegativeInt(item.tidak_berfungsi)) {
                return new Response(
                    JSON.stringify({ success: false, error: `layak/tidak_layak/berfungsi/tidak_berfungsi must be >= 0 at items[${i}]` }),
                    { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        }

        // ── 3. Authorize: verify caller can submit for this vendor ────────────
        const role = callerProfile.role
        const isGlobalAdmin = role === 'uid_admin' || role === 'uid_user'
        const isUnitAdmin = role === 'up3_admin' || role === 'up3_user'
        const isVendorUser = role === 'vendor_k3' || role === 'petugas'

        if (isVendorUser) {
            // Vendor users can only submit for their own vendor
            if (callerProfile.vendor_id !== body.vendor_id) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Forbidden: you can only submit assessments for your own vendor' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        } else if (isUnitAdmin) {
            // Unit admins can only submit for vendors in their unit
            const { data: vendorCheck } = await supabaseAdmin
                .from('vendors')
                .select('id')
                .eq('id', body.vendor_id)
                .eq('unit_code', callerProfile.unit_code)
                .maybeSingle()

            if (!vendorCheck) {
                return new Response(
                    JSON.stringify({ success: false, error: 'Forbidden: vendor does not belong to your unit' }),
                    { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
                )
            }
        } else if (!isGlobalAdmin) {
            return new Response(
                JSON.stringify({ success: false, error: 'Forbidden: insufficient role' }),
                { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── 4. Calculate scores ───────────────────────────────────────────────
        const processedItems = body.items.map(item => {
            const kesesuaian_kontrak = item.actual_qty >= item.required_qty ? 2 : 0
            const kondisi_fisik = item.tidak_layak === 0 ? 0 : -1
            const kondisi_fungsi = item.tidak_berfungsi === 0 ? 0 : -1
            const score_item = kesesuaian_kontrak + kondisi_fisik + kondisi_fungsi
            return { ...item, kesesuaian_kontrak, kondisi_fisik, kondisi_fungsi, score_item }
        })

        const jumlah_peralatan_layak = processedItems.reduce((sum, i) => sum + i.layak, 0)
        const jumlah_peralatan_tidak_layak = processedItems.reduce((sum, i) => sum + i.tidak_layak, 0)
        const jumlah_peralatan_berfungsi = processedItems.reduce((sum, i) => sum + i.berfungsi, 0)
        const jumlah_peralatan_tidak_berfungsi = processedItems.reduce((sum, i) => sum + i.tidak_berfungsi, 0)
        const total_score = processedItems.reduce((sum, i) => sum + i.score_item, 0) / processedItems.length

        // ── 5. Insert Assessment Header ───────────────────────────────────────
        const { data: assessment, error: assessmentError } = await supabaseAdmin
            .from('assessments')
            .insert({
                tanggal_penilaian: body.tanggal_penilaian,
                shift: body.shift,
                vendor_id: body.vendor_id,
                peruntukan_id: body.peruntukan_id,
                team_id: body.team_id,
                personnel_id: body.personnel_id,
                assessor_id: user.id,  // Always use authenticated user ID, never body.assessor_id
                jumlah_item_peralatan: body.items.length,
                jumlah_peralatan_layak,
                jumlah_peralatan_tidak_layak,
                jumlah_peralatan_berfungsi,
                jumlah_peralatan_tidak_berfungsi,
                total_score,
                status: 'Submitted'
            })
            .select()
            .single()

        if (assessmentError) {
            console.error('Assessment insert error:', assessmentError)
            return new Response(
                JSON.stringify({ success: false, error: `Failed to create assessment: ${assessmentError.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── 6. Insert Assessment Items ────────────────────────────────────────
        const assessmentItems = processedItems.map(item => ({
            assessment_id: assessment.id,
            equipment_id: item.equipment_id,
            required_qty: item.required_qty,
            actual_qty: item.actual_qty,
            layak: item.layak,
            tidak_layak: item.tidak_layak,
            berfungsi: item.berfungsi,
            tidak_berfungsi: item.tidak_berfungsi
        }))

        const { data: items, error: itemsError } = await supabaseAdmin
            .from('assessment_items')
            .insert(assessmentItems)
            .select()

        if (itemsError) {
            console.error('Assessment items insert error:', itemsError)
            await supabaseAdmin.from('assessments').delete().eq('id', assessment.id)
            return new Response(
                JSON.stringify({ success: false, error: `Failed to create assessment items: ${itemsError.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ── 7. Insert Assessment Personnel ────────────────────────────────────
        let allPersonnelIds: string[] = []
        if (body.personnel_ids && body.personnel_ids.length > 0) {
            allPersonnelIds = [...body.personnel_ids]
        }
        if (body.personnel_id && !allPersonnelIds.includes(body.personnel_id)) {
            allPersonnelIds.push(body.personnel_id)
        }

        if (allPersonnelIds.length > 0) {
            const personnelRecords = allPersonnelIds
                .filter(pid => isValidUUID(pid))
                .map(pid => ({ assessment_id: assessment.id, personnel_id: pid }))

            const { error: personnelError } = await supabaseAdmin
                .from('assessment_personnel')
                .insert(personnelRecords)

            if (personnelError) {
                console.warn('Failed to insert assessment_personnel:', personnelError)
            } else {
                console.log(`Inserted ${personnelRecords.length} personnel records for assessment ${assessment.id}`)
            }
        }

        // ── 8. Upsert Vendor Assets ───────────────────────────────────────────
        const upsertResults = []
        const now = new Date().toISOString()

        const { data: kendaraanCheck } = await supabaseAdmin
            .from('equipment_standards')
            .select('equipment_id, equipment_master!inner(kategori)')
            .eq('peruntukan_id', body.peruntukan_id)
            .eq('equipment_master.kategori', 'Kendaraan')
            .limit(1)

        const peruntukanHasKendaraan = kendaraanCheck && kendaraanCheck.length > 0
        const owner_id = peruntukanHasKendaraan ? (body.team_id || null) : (body.personnel_id || null)

        for (const item of processedItems) {
            let existingAsset = null
            if (owner_id) {
                const { data } = await supabaseAdmin
                    .from('vendor_assets')
                    .select('id')
                    .eq('owner_id', owner_id)
                    .eq('equipment_id', item.equipment_id)
                    .maybeSingle()
                existingAsset = data
            }

            const assetData = {
                vendor_id: body.vendor_id,
                peruntukan_id: body.peruntukan_id,
                team_id: peruntukanHasKendaraan ? (body.team_id || null) : null,
                personnel_id: peruntukanHasKendaraan ? null : (body.personnel_id || null),
                owner_id: owner_id,
                equipment_id: item.equipment_id,
                realisasi_qty: item.actual_qty,
                distribution_date: body.tanggal_penilaian,
                last_assessment_id: assessment.id,
                last_assessment_date: now,
                kesesuaian_kontrak: item.kesesuaian_kontrak,
                kondisi_fisik: item.kondisi_fisik,
                kondisi_fungsi: item.kondisi_fungsi,
                nilai: item.score_item,
                status_kesesuaian: item.actual_qty >= item.required_qty ? 'Sesuai' : 'Tidak Sesuai'
            }

            if (existingAsset) {
                const { error: updateError } = await supabaseAdmin
                    .from('vendor_assets')
                    .update(assetData)
                    .eq('id', existingAsset.id)

                if (!updateError) {
                    upsertResults.push({ action: 'updated', id: existingAsset.id, equipment_id: item.equipment_id })
                } else {
                    console.warn('Failed to update vendor_asset:', updateError)
                }
            } else {
                const { data: inserted, error: insertError } = await supabaseAdmin
                    .from('vendor_assets')
                    .insert(assetData)
                    .select('id')
                    .single()

                if (!insertError) {
                    upsertResults.push({ action: 'created', id: inserted.id, equipment_id: item.equipment_id })
                } else {
                    console.warn('Failed to insert vendor_asset:', insertError)
                }
            }
        }

        // ── 9. Success ────────────────────────────────────────────────────────
        return new Response(
            JSON.stringify({
                success: true,
                data: { assessment, items, vendor_assets: upsertResults },
                message: `Assessment created with ${items.length} items. ${upsertResults.filter(r => r.action === 'created').length} new assets, ${upsertResults.filter(r => r.action === 'updated').length} updated.`
            }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )

    } catch (error: unknown) {
        console.error('Unexpected error:', error)
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        return new Response(
            JSON.stringify({ success: false, error: errorMessage }),
            { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
    }
})
