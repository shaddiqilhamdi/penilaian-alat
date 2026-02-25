// Supabase Edge Function: submit-penilaian
// Handles atomic transaction for assessment submission + vendor assets upsert
// Deploy: supabase functions deploy submit-penilaian
// @ts-nocheck - Deno runtime, VS Code may show false errors

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

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
    // Assessment header
    tanggal_penilaian: string
    shift: string
    vendor_id: string
    peruntukan_id: string
    team_id: string | null
    personnel_id: string | null           // Single personnel (backward compatibility)
    personnel_ids: string[] | null        // Multiple personnel for regu
    assessor_id: string

    // Assessment items
    items: AssessmentItem[]

    // Calculated totals (can be recalculated server-side for validation)
    jumlah_item_peralatan: number
    total_score: number
}

serve(async (req) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        return new Response('ok', { headers: corsHeaders })
    }

    try {
        // Get auth header (optional - will use service role if not provided)
        const authHeader = req.headers.get('Authorization')

        // Create Supabase client - use service role for database operations
        const supabaseClient = createClient(
            Deno.env.get('SUPABASE_URL') ?? '',
            Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
            {
                auth: {
                    autoRefreshToken: false,
                    persistSession: false
                }
            }
        )

        // Parse request body
        const body: SubmitRequest = await req.json()

        // Validate required fields
        if (!body.vendor_id || !body.peruntukan_id || !body.items?.length) {
            return new Response(
                JSON.stringify({ success: false, error: 'Missing required fields: vendor_id, peruntukan_id, items' }),
                { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // Calculate scores for each item
        const processedItems = body.items.map(item => {
            const kesesuaian_kontrak = item.actual_qty >= item.required_qty ? 2 : 0
            const kondisi_fisik = item.tidak_layak === 0 ? 0 : -1
            const kondisi_fungsi = item.tidak_berfungsi === 0 ? 0 : -1
            const score_item = kesesuaian_kontrak + kondisi_fisik + kondisi_fungsi

            return {
                ...item,
                kesesuaian_kontrak,
                kondisi_fisik,
                kondisi_fungsi,
                score_item
            }
        })

        // Calculate totals
        const jumlah_peralatan_layak = processedItems.reduce((sum, i) => sum + i.layak, 0)
        const jumlah_peralatan_tidak_layak = processedItems.reduce((sum, i) => sum + i.tidak_layak, 0)
        const jumlah_peralatan_berfungsi = processedItems.reduce((sum, i) => sum + i.berfungsi, 0)
        const jumlah_peralatan_tidak_berfungsi = processedItems.reduce((sum, i) => sum + i.tidak_berfungsi, 0)
        const total_score = processedItems.reduce((sum, i) => sum + i.score_item, 0) / processedItems.length

        // ========== STEP 1: Insert Assessment Header ==========
        const { data: assessment, error: assessmentError } = await supabaseClient
            .from('assessments')
            .insert({
                tanggal_penilaian: body.tanggal_penilaian,
                shift: body.shift,
                vendor_id: body.vendor_id,
                peruntukan_id: body.peruntukan_id,
                team_id: body.team_id,
                personnel_id: body.personnel_id,
                assessor_id: body.assessor_id,
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

        // ========== STEP 2: Insert Assessment Items ==========
        const assessmentItems = processedItems.map(item => ({
            assessment_id: assessment.id,
            equipment_id: item.equipment_id,
            required_qty: item.required_qty,
            actual_qty: item.actual_qty,
            layak: item.layak,
            tidak_layak: item.tidak_layak,
            berfungsi: item.berfungsi,
            tidak_berfungsi: item.tidak_berfungsi
            // Note: kesesuaian_kontrak, kondisi_fisik, kondisi_fungsi, score_item 
            // are generated columns - calculated by database
        }))

        const { data: items, error: itemsError } = await supabaseClient
            .from('assessment_items')
            .insert(assessmentItems)
            .select()

        if (itemsError) {
            console.error('Assessment items insert error:', itemsError)
            // Rollback: delete the assessment header
            await supabaseClient.from('assessments').delete().eq('id', assessment.id)

            return new Response(
                JSON.stringify({ success: false, error: `Failed to create assessment items: ${itemsError.message}` }),
                { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
            )
        }

        // ========== STEP 2.5: Insert Assessment Personnel (for multiple personnel/regu) ==========
        // Combine personnel_ids array with single personnel_id for backward compatibility
        let allPersonnelIds: string[] = []
        if (body.personnel_ids && body.personnel_ids.length > 0) {
            allPersonnelIds = [...body.personnel_ids]
        }
        if (body.personnel_id && !allPersonnelIds.includes(body.personnel_id)) {
            allPersonnelIds.push(body.personnel_id)
        }

        // Insert into assessment_personnel junction table
        if (allPersonnelIds.length > 0) {
            const personnelRecords = allPersonnelIds.map(pid => ({
                assessment_id: assessment.id,
                personnel_id: pid
            }))

            const { error: personnelError } = await supabaseClient
                .from('assessment_personnel')
                .insert(personnelRecords)

            if (personnelError) {
                console.warn('Failed to insert assessment_personnel:', personnelError)
                // Not a critical error, continue
            } else {
                console.log(`Inserted ${personnelRecords.length} personnel records for assessment ${assessment.id}`)
            }
        }

        // ========== STEP 3: Upsert Vendor Assets ==========
        // LOGIC: owner_id ditentukan per PERUNTUKAN, bukan per item.
        // Jika peruntukan punya salah satu alat berkategori 'Kendaraan' → owner_id = team_id
        // Jika tidak → owner_id = personnel_id
        const upsertResults = []
        const now = new Date().toISOString()

        // Cek apakah peruntukan ini punya equipment berkategori 'Kendaraan'
        const { data: kendaraanCheck } = await supabaseClient
            .from('equipment_standards')
            .select('equipment_id, equipment_master!inner(kategori)')
            .eq('peruntukan_id', body.peruntukan_id)
            .eq('equipment_master.kategori', 'Kendaraan')
            .limit(1)

        const peruntukanHasKendaraan = kendaraanCheck && kendaraanCheck.length > 0
        const owner_id = peruntukanHasKendaraan ? (body.team_id || null) : (body.personnel_id || null)

        for (const item of processedItems) {

            // Lookup by owner_id + equipment_id (unique key)
            let existingAsset = null
            if (owner_id) {
                const { data } = await supabaseClient
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
                team_id: body.team_id || null,
                personnel_id: body.personnel_id || null,
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
                // Update existing
                const { data: updated, error: updateError } = await supabaseClient
                    .from('vendor_assets')
                    .update(assetData)
                    .eq('id', existingAsset.id)
                    .select()
                    .single()

                if (!updateError) {
                    upsertResults.push({ action: 'updated', id: existingAsset.id, equipment_id: item.equipment_id })
                } else {
                    console.warn('Failed to update vendor_asset:', updateError)
                }
            } else {
                // Insert new
                const { data: inserted, error: insertError } = await supabaseClient
                    .from('vendor_assets')
                    .insert(assetData)
                    .select()
                    .single()

                if (!insertError) {
                    upsertResults.push({ action: 'created', id: inserted.id, equipment_id: item.equipment_id })
                } else {
                    console.warn('Failed to insert vendor_asset:', insertError)
                }
            }
        }

        // ========== SUCCESS RESPONSE ==========
        return new Response(
            JSON.stringify({
                success: true,
                data: {
                    assessment: assessment,
                    items: items,
                    vendor_assets: upsertResults
                },
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
