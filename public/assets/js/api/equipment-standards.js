/**
 * Equipment Standards API Module
 * Handle equipment standards per vendor/peruntukan
 * Primary Key: id (UUID)
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.EquipmentStandardsAPI === 'undefined') {
    window.EquipmentStandardsAPI = {
        /**
         * Get all equipment standards
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .select(`
                    *,
                    vendors(vendor_name),
                    units:unit_code(unit_name),
                    peruntukan(deskripsi),
                    equipment_master(nama_alat, kategori, satuan, jenis)
                `)
                    .order('created_at', { ascending: false });

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
         * Get equipment standards by vendor
         */
        async getByVendor(vendorId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .select(`
                    *,
                    peruntukan(deskripsi),
                    equipment_master(nama_alat, kategori, satuan, jenis)
                `)
                    .eq('vendor_id', vendorId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch equipment standards by vendor:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching equipment standards:', error);
                return null;
            }
        },

        /**
         * Get equipment standards by vendor and peruntukan
         * Used for assessment form - get list of required equipment
         */
        async getByVendorAndPeruntukan(vendorId, peruntukanId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .select(`
                    *,
                    equipment_master(id, nama_alat, kategori, sub_kategori1, satuan)
                `)
                    .eq('vendor_id', vendorId)
                    .eq('peruntukan_id', peruntukanId)
                    .order('created_at', { ascending: true });

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
         * Get equipment standards by unit
         */
        async getByUnit(unitCode) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .select(`
                    *,
                    vendors(vendor_name),
                    peruntukan(deskripsi),
                    equipment_master(nama_alat, kategori, satuan, jenis)
                `)
                    .eq('unit_code', unitCode)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch equipment standards by unit:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching equipment standards:', error);
                return null;
            }
        },

        /**
         * Create new equipment standard
         */
        async create(standardData) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .insert([standardData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create equipment standard:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating equipment standard:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Create multiple equipment standards (batch)
         */
        async createBatch(standardsList) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .insert(standardsList)
                    .select();

                if (error) {
                    console.error('❌ Failed to create equipment standards batch:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating equipment standards batch:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update equipment standard
         */
        async update(standardId, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .update(updates)
                    .eq('id', standardId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update equipment standard:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error updating equipment standard:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete equipment standard
         */
        async delete(standardId) {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('equipment_standards')
                    .delete()
                    .eq('id', standardId);

                if (error) {
                    console.error('❌ Failed to delete equipment standard:', error);
                    return { success: false, error: error.message };
                }

                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting equipment standard:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete all standards for a vendor
         */
        async deleteByVendor(vendorId) {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('equipment_standards')
                    .delete()
                    .eq('vendor_id', vendorId);

                if (error) {
                    console.error('❌ Failed to delete equipment standards by vendor:', error);
                    return { success: false, error: error.message };
                }

                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting equipment standards:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Get distinct peruntukan that vendor has equipment standards for
         * No jenis filter - returns all peruntukan for this vendor
         * Returns list of peruntukan IDs with their details
         */
        async getDistinctPeruntukanByVendor(vendorId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .select(`
                        peruntukan_id,
                        peruntukan(id, deskripsi)
                    `)
                    .eq('vendor_id', vendorId);

                if (error) {
                    console.error('❌ Failed to fetch distinct peruntukan:', error);
                    return { success: false, error: error.message, data: [] };
                }

                // Extract unique peruntukan (no jenis filter)
                const uniquePeruntukan = new Map();
                data.forEach(item => {
                    if (item.peruntukan) {
                        uniquePeruntukan.set(item.peruntukan_id, item.peruntukan);
                    }
                });

                const result = Array.from(uniquePeruntukan.values());
                return { success: true, data: result };
            } catch (error) {
                console.error('❌ Error fetching distinct peruntukan:', error);
                return { success: false, error: error.message, data: [] };
            }
        },

        /**
         * Get distinct peruntukan that vendor has equipment standards for
         * Filter by jenis to match dropdown flow
         * Returns list of peruntukan IDs with their details
         */
        async getDistinctPeruntukanByVendorAndJenis(vendorId, jenis) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .select(`
                        peruntukan_id,
                        peruntukan(id, deskripsi),
                        equipment_master(jenis)
                    `)
                    .eq('vendor_id', vendorId);

                if (error) {
                    console.error('❌ Failed to fetch distinct peruntukan:', error);
                    return { success: false, error: error.message, data: [] };
                }

                // Extract unique peruntukan and filter by jenis from equipment_master
                const uniquePeruntukan = new Map();
                data.forEach(item => {
                    if (item.peruntukan && item.equipment_master?.jenis === jenis) {
                        uniquePeruntukan.set(item.peruntukan_id, item.peruntukan);
                    }
                });

                const result = Array.from(uniquePeruntukan.values());
                return { success: true, data: result };
            } catch (error) {
                console.error('❌ Error fetching distinct peruntukan:', error);
                return { success: false, error: error.message, data: [] };
            }
        },

        /**
         * Get distinct jenis that vendor has equipment standards for
         * Returns list of unique jenis values
         */
        async getDistinctJenisByVendor(vendorId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('equipment_standards')
                    .select(`
                        peruntukan_id,
                        equipment_master(jenis)
                    `)
                    .eq('vendor_id', vendorId);

                if (error) {
                    console.error('❌ Failed to fetch distinct jenis:', error);
                    return { success: false, error: error.message, data: [] };
                }

                // Extract unique jenis values from equipment_master
                const uniqueJenis = new Set();
                data.forEach(item => {
                    if (item.equipment_master && item.equipment_master.jenis) {
                        uniqueJenis.add(item.equipment_master.jenis);
                    }
                });

                const result = Array.from(uniqueJenis).map(jenis => ({ jenis }));
                return { success: true, data: result };
            } catch (error) {
                console.error('❌ Error fetching distinct jenis:', error);
                return { success: false, error: error.message, data: [] };
            }
        }
    };
}

// Provide global alias using var (not const) to avoid redeclaration errors
var EquipmentStandardsAPI = window.EquipmentStandardsAPI;
