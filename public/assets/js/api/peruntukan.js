/**
 * Peruntukan API Module
 * Handle all peruntukan (jenis alat) data operations
 * Primary Key: id (TEXT)
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.PeruntukanAPI === 'undefined') {
    window.PeruntukanAPI = {
        /**
         * Get all peruntukan
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('peruntukan')
                    .select('*')
                    .order('deskripsi', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch peruntukan:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching peruntukan:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get peruntukan by ID
         */
        async getById(peruntukanId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('peruntukan')
                    .select('*')
                    .eq('id', peruntukanId)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch peruntukan:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching peruntukan:', error);
                return { success: false, error: error.message, data: null };
            }
        },



        /**
         * Create new peruntukan
         */
        async create(peruntukanData) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('peruntukan')
                    .insert([peruntukanData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create peruntukan:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating peruntukan:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update peruntukan
         */
        async update(peruntukanId, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('peruntukan')
                    .update(updates)
                    .eq('id', peruntukanId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update peruntukan:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error updating peruntukan:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete peruntukan
         */
        async delete(peruntukanId) {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('peruntukan')
                    .delete()
                    .eq('id', peruntukanId);

                if (error) {
                    console.error('❌ Failed to delete peruntukan:', error);
                    return { success: false, error: error.message };
                }

                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting peruntukan:', error);
                return { success: false, error: error.message };
            }
        }
    };
}

// Provide global alias using var (not const) to avoid redeclaration errors
var PeruntukanAPI = window.PeruntukanAPI;
