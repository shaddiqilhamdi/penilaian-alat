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
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('personnel')
                    .select(`
                        *,
                        vendors(vendor_name, unit_code),
                        teams(nomor_polisi, category),
                        peruntukan(deskripsi)
                    `)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch personnel:', error);
                    return { success: false, error: error.message, data: null };
                }

                console.log('✅ Personnel loaded:', data.length);
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
                        *,
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
        async getByVendor(vendorId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('personnel')
                    .select(`
                        *,
                        teams(nomor_polisi, category),
                        peruntukan(deskripsi)
                    `)
                    .eq('vendor_id', vendorId)
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
                    .select('*')
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
                        *,
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

                console.log('✅ Personnel created:', data.id);
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

                console.log('✅ Personnel batch created:', data.length);
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

                console.log('✅ Personnel updated:', personnelId);
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

                console.log('✅ Personnel deleted:', personnelId);
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
