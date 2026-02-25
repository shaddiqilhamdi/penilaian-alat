/**
 * Equipment API Module
 * Handle all equipment data operations
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.EquipmentAPI === 'undefined') {
    window.EquipmentAPI = {
        /**
         * Get all equipment
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_master')
                    .select('*')
                    .order('kategori', { ascending: true })
                    .order('nama_alat', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch equipment:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching equipment:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get equipment by kategori (jenis)
         * Used as fallback when no equipment_standards exist
         */
        async getByKategori(kategori) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_master')
                    .select('*')
                    .ilike('kategori', `%${kategori}%`)
                    .order('nama_alat', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch equipment by kategori:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching equipment:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get equipment by ID
         */
        async getById(equipmentId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_master')
                    .select('*')
                    .eq('id', equipmentId)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch equipment:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching equipment:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get equipment standards
         */
        async getStandards() {
            try {
                const client = await getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .select('*')
                    .order('equipment_id', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch equipment standards:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching equipment standards:', error);
                return null;
            }
        },

        /**
         * Create new equipment
         */
        async create(equipmentData) {
            try {
                const client = await getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_master')
                    .insert([equipmentData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create equipment:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating equipment:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update equipment
         */
        async update(equipmentId, updates) {
            try {
                const client = await getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_master')
                    .update(updates)
                    .eq('id', equipmentId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update equipment:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error updating equipment:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete equipment
         */
        async delete(equipmentId) {
            try {
                const client = await getSupabaseClient();
                const { error } = await client
                    .from('equipment_master')
                    .delete()
                    .eq('id', equipmentId);

                if (error) {
                    console.error('❌ Failed to delete equipment:', error);
                    return { success: false, error: error.message };
                }

                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting equipment:', error);
                return { success: false, error: error.message };
            }
        }
    };
}

// Provide global alias
var EquipmentAPI = window.EquipmentAPI;
