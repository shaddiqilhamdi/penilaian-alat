/**
 * Vendor Assets API Module
 * Handle vendor inventory/assets tracking
 * Primary Key: id (UUID)
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.VendorAssetsAPI === 'undefined') {
    window.VendorAssetsAPI = {
        /**
         * Get all vendor assets
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('vendor_assets')
                    .select(`
                        *,
                        vendors(vendor_name, unit_code),
                        peruntukan(jenis, deskripsi),
                        teams(nomor_polisi, category),
                        personnel(nama_personil),
                        equipment_master(nama_alat, kategori, satuan)
                    `)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch vendor assets:', error);
                    return { success: false, error: error.message, data: null };
                }

                console.log('✅ Vendor assets loaded:', data.length);
                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching vendor assets:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get vendor assets by vendor ID
         */
        async getByVendor(vendorId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('vendor_assets')
                    .select(`
                        *,
                        peruntukan(jenis, deskripsi),
                        teams(nomor_polisi, category),
                        personnel(nama_personil),
                        equipment_master(nama_alat, kategori, satuan)
                    `)
                    .eq('vendor_id', vendorId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch vendor assets:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching vendor assets:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get vendor assets by vendor ID and peruntukan ID
         * Now filters directly by peruntukan_id column in vendor_assets
         * Used for assessment form - get list of equipment to assess
         */
        async getByVendorAndPeruntukan(vendorId, peruntukanId) {
            try {
                const client = getSupabaseClient();

                // Direct query with peruntukan_id
                const { data, error } = await client
                    .from('vendor_assets')
                    .select(`
                        *,
                        peruntukan(jenis, deskripsi),
                        equipment_master(id, nama_alat, kategori, sub_kategori1, satuan)
                    `)
                    .eq('vendor_id', vendorId)
                    .eq('peruntukan_id', peruntukanId)
                    .order('created_at', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch vendor assets by peruntukan:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data: data || [], error: null };
            } catch (error) {
                console.error('❌ Error fetching vendor assets:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Check if vendor asset exists for equipment
         * Now includes peruntukan_id for more precise matching
         */
        async checkExists(vendorId, equipmentId, peruntukanId = null, teamId = null) {
            try {
                const client = getSupabaseClient();
                let query = client
                    .from('vendor_assets')
                    .select('id')
                    .eq('vendor_id', vendorId)
                    .eq('equipment_id', equipmentId);

                if (peruntukanId) {
                    query = query.eq('peruntukan_id', peruntukanId);
                }

                if (teamId) {
                    query = query.eq('team_id', teamId);
                }

                const { data, error } = await query.maybeSingle();

                if (error) {
                    console.error('❌ Failed to check vendor asset:', error);
                    return { success: false, exists: false, data: null };
                }

                return { success: true, exists: !!data, data };
            } catch (error) {
                console.error('❌ Error checking vendor asset:', error);
                return { success: false, exists: false, data: null };
            }
        },

        /**
         * Bulk create vendor assets (for first-time assessment)
         * Note: vendor_assets table requires: vendor_id, equipment_id, peruntukan_id
         * Optional: team_id, personnel_id
         */
        async createBatch(assetsList) {
            try {
                const client = getSupabaseClient();

                // Filter out any invalid fields that don't exist in the table
                const cleanedAssets = assetsList.map(asset => ({
                    vendor_id: asset.vendor_id,
                    equipment_id: asset.equipment_id,
                    peruntukan_id: asset.peruntukan_id || null,
                    team_id: asset.team_id || null,
                    personnel_id: asset.personnel_id || null,
                    realisasi_qty: asset.realisasi_qty || 0,
                    distribution_date: asset.distribution_date || new Date().toISOString().split('T')[0]
                }));

                const { data, error } = await client
                    .from('vendor_assets')
                    .insert(cleanedAssets)
                    .select();

                if (error) {
                    console.error('❌ Failed to create vendor assets batch:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Vendor assets batch created:', data.length);
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating vendor assets batch:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Get vendor assets by team
         */
        async getByTeam(teamId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('vendor_assets')
                    .select(`
                    *,
                    equipment_master(nama_alat, kategori, satuan)
                `)
                    .eq('team_id', teamId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch vendor assets by team:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching vendor assets:', error);
                return null;
            }
        },

        /**
         * Get vendor assets by personnel
         */
        async getByPersonnel(personnelId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('vendor_assets')
                    .select(`
                    *,
                    equipment_master(nama_alat, kategori, satuan)
                `)
                    .eq('personnel_id', personnelId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch vendor assets by personnel:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching vendor assets:', error);
                return null;
            }
        },

        /**
         * Get assets that need reassessment (older than X days)
         */
        async getNeedingReassessment(days = 30) {
            try {
                const client = getSupabaseClient();
                const cutoffDate = new Date();
                cutoffDate.setDate(cutoffDate.getDate() - days);

                const { data, error } = await client
                    .from('vendor_assets')
                    .select(`
                    *,
                    vendors(vendor_name),
                    equipment_master(nama_alat, kategori)
                `)
                    .or(`last_assessment_date.is.null,last_assessment_date.lt.${cutoffDate.toISOString()}`)
                    .order('last_assessment_date', { ascending: true, nullsFirst: true });

                if (error) {
                    console.error('❌ Failed to fetch assets needing reassessment:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching assets:', error);
                return null;
            }
        },

        /**
         * Create new vendor asset
         */
        async create(assetData) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('vendor_assets')
                    .insert([assetData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create vendor asset:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Vendor asset created:', data.id);
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating vendor asset:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update vendor asset
         */
        async update(assetId, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('vendor_assets')
                    .update(updates)
                    .eq('id', assetId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update vendor asset:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Vendor asset updated:', assetId);
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error updating vendor asset:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update asset after assessment
         * Called after assessment is submitted to update latest scores
         */
        async updateFromAssessment(assetId, assessmentData) {
            const updates = {
                last_assessment_id: assessmentData.assessment_id,
                last_assessment_date: new Date().toISOString(),
                kesesuaian_kontrak: assessmentData.kesesuaian_kontrak,
                kondisi_fisik: assessmentData.kondisi_fisik,
                kondisi_fungsi: assessmentData.kondisi_fungsi,
                realisasi_qty: assessmentData.actual_qty,
                nilai: assessmentData.score_item,
                status_kesesuaian: assessmentData.actual_qty >= assessmentData.required_qty ? 'Sesuai' : 'Tidak Sesuai'
            };

            return this.update(assetId, updates);
        },

        /**
         * Delete vendor asset
         */
        async delete(assetId) {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('vendor_assets')
                    .delete()
                    .eq('id', assetId);

                if (error) {
                    console.error('❌ Failed to delete vendor asset:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Vendor asset deleted:', assetId);
                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting vendor asset:', error);
                return { success: false, error: error.message };
            }
        }
    };
}

// Provide global alias using var (not const) to avoid redeclaration errors
var VendorAssetsAPI = window.VendorAssetsAPI;
