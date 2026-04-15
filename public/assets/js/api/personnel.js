/**
 * Personnel API Module
 * Handle all personnel/pekerja data operations
 * Primary Key: id (UUID)
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.PersonnelAPI === 'undefined') {
    window.PersonnelAPI = {
        /**
         * Get all personnel
         * @param {boolean} activeOnly - filter active only (default true)
         * @param {object} filters - optional server-side filters { vendor_id, vendor_ids }
         */
        async getAll(activeOnly = true, filters = {}) {
            try {
                const client = getSupabaseClient();
                let query = client
                    .from('personnel')
                    .select(`
                        id, vendor_id, team_id, peruntukan_id,
                        nama_personil, nik, is_active,
                        vendors(vendor_name, unit_code),
                        teams(nomor_polisi, category),
                        peruntukan(deskripsi)
                    `);

                if (activeOnly) {
                    query = query.eq('is_active', true);
                }

                // Server-side filters
                if (filters.vendor_id) {
                    // Single vendor (vendor_k3)
                    query = query.eq('vendor_id', filters.vendor_id);
                } else if (filters.vendor_ids && filters.vendor_ids.length > 0) {
                    // Multiple vendors (UP3 - all vendors in their unit)
                    query = query.in('vendor_id', filters.vendor_ids);
                }

                const { data, error } = await query
                    .order('nama_personil', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch personnel:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching personnel:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get personnel by ID
         */
        async getById(personnelId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('personnel')
                    .select(`
                        id, vendor_id, team_id, peruntukan_id,
                        nama_personil, nik, is_active,
                        vendors(vendor_name, unit_code),
                        teams(nomor_polisi, category),
                        peruntukan(deskripsi)
                    `)
                    .eq('id', personnelId)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch personnel:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching personnel:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get personnel by vendor ID
         */
        async getByVendor(vendorId, activeOnly = true) {
            try {
                const client = getSupabaseClient();
                let query = client
                    .from('personnel')
                    .select(`
                        id, vendor_id, team_id, peruntukan_id,
                        nama_personil, nik, is_active,
                        teams(nomor_polisi, category),
                        peruntukan(deskripsi)
                    `)
                    .eq('vendor_id', vendorId);

                if (activeOnly) {
                    query = query.eq('is_active', true);
                }

                const { data, error } = await query
                    .order('nama_personil', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch personnel by vendor:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching personnel:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get personnel by team ID
         */
        async getByTeam(teamId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('personnel')
                    .select('id, vendor_id, team_id, peruntukan_id, nama_personil, nik, is_active')
                    .eq('team_id', teamId)
                    .order('nama_personil', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch personnel by team:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching personnel:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get personnel by NIK
         */
        async getByNIK(nik) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('personnel')
                    .select(`
                        id, vendor_id, team_id, peruntukan_id,
                        nama_personil, nik, is_active,
                        vendors(vendor_name, unit_code),
                        teams(nomor_polisi, category)
                    `)
                    .eq('nik', nik)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch personnel by NIK:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching personnel:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Create new personnel
         */
        async create(personnelData) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('personnel')
                    .insert([personnelData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create personnel:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error creating personnel:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Create multiple personnel (batch)
         */
        async createBatch(personnelList) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('personnel')
                    .insert(personnelList)
                    .select();

                if (error) {
                    console.error('❌ Failed to create personnel batch:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error creating personnel batch:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Update personnel
         */
        async update(personnelId, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('personnel')
                    .update(updates)
                    .eq('id', personnelId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update personnel:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error updating personnel:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Assign personnel to team
         */
        async assignToTeam(personnelId, teamId) {
            return this.update(personnelId, { team_id: teamId });
        },

        /**
         * Delete personnel
         */
        async delete(personnelId) {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('personnel')
                    .delete()
                    .eq('id', personnelId);

                if (error) {
                    console.error('❌ Failed to delete personnel:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, error: null };
            } catch (error) {
                console.error('❌ Error deleting personnel:', error);
                return { success: false, error: error.message };
            }
        }
    };
}

// Global alias
const PersonnelAPI = window.PersonnelAPI;
