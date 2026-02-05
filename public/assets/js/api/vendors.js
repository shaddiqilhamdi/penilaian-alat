/**
 * Vendors API Module
 * Handle all vendor data operations
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.VendorsAPI === 'undefined') {
    window.VendorsAPI = {
        /**
         * Get all vendors
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('vendors')
                    .select('*')
                    .order('vendor_name', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch vendors:', error);
                    return { success: false, error: error.message, data: null };
                }

                console.log('✅ Vendors loaded:', data.length);
                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching vendors:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get vendor by ID
         */
        async getById(vendorId) {
            try {
                const client = await getSupabaseClient();
                const { data, error } = await client
                    .from('vendors')
                    .select('*')
                    .eq('id', vendorId)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch vendor:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching vendor:', error);
                return null;
            }
        },

        /**
         * Create new vendor
         */
        async create(vendorData) {
            try {
                const client = await getSupabaseClient();
                const { data, error } = await client
                    .from('vendors')
                    .insert([vendorData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create vendor:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Vendor created:', data);
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating vendor:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update vendor
         */
        async update(vendorId, updates) {
            try {
                const client = await getSupabaseClient();
                const { data, error } = await client
                    .from('vendors')
                    .update(updates)
                    .eq('id', vendorId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update vendor:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Vendor updated');
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error updating vendor:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete vendor
         */
        async delete(vendorId) {
            try {
                const client = await getSupabaseClient();
                const { error } = await client
                    .from('vendors')
                    .delete()
                    .eq('id', vendorId);

                if (error) {
                    console.error('❌ Failed to delete vendor:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Vendor deleted');
                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting vendor:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Get vendors by unit code
         */
        async getByUnitCode(unitCode) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('vendors')
                    .select('*')
                    .eq('unit_code', unitCode)
                    .order('vendor_name', { ascending: true });

                if (error) {
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                return { success: false, error: error.message, data: null };
            }
        }
    };
}
// Provide global alias using var (not const) to avoid redeclaration errors
var VendorsAPI = window.VendorsAPI;
