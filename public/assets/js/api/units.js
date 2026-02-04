/**
 * Units API Module
 * Handle all unit data operations
 * Primary Key: unit_code (TEXT)
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.UnitsAPI === 'undefined') {
    window.UnitsAPI = {
        /**
         * Get all units
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('units')
                    .select('*')
                    .order('unit_code', { ascending: true });

                if (error) {
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get unit by code (primary key)
         */
        async getByCode(unitCode) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('units')
                    .select('*')
                    .eq('unit_code', unitCode)
                    .single();

                if (error) {
                    return null;
                }

                return data;
            } catch (error) {
                return null;
            }
        },

        /**
         * Get units by type (UID or UP3)
         */
        async getByType(unitTipe) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('units')
                    .select('*')
                    .eq('unit_tipe', unitTipe)
                    .order('unit_code', { ascending: true });

                if (error) {
                    return null;
                }

                return data;
            } catch (error) {
                return null;
            }
        },

        /**
         * Get only UP3 units
         */
        async getUP3Units() {
            return this.getByType('UP3');
        },

        /**
         * Create new unit
         */
        async create(unitData) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('units')
                    .insert([unitData])
                    .select()
                    .single();

                if (error) {
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Update unit
         */
        async update(unitCode, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('units')
                    .update(updates)
                    .eq('unit_code', unitCode)
                    .select()
                    .single();

                if (error) {
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete unit
         */
        async delete(unitCode) {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('units')
                    .delete()
                    .eq('unit_code', unitCode);

                if (error) {
                    return { success: false, error: error.message };
                }

                return { success: true };
            } catch (error) {
                return { success: false, error: error.message };
            }
        }
    };
}
// Provide global alias using var (not const) to avoid redeclaration errors
var UnitsAPI = window.UnitsAPI;
