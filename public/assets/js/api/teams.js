/**
 * Teams API Module
 * Handle all team/regu data operations
 * Primary Key: id (UUID)
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.TeamsAPI === 'undefined') {
    window.TeamsAPI = {
        /**
         * Get all teams
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .select(`
                        *,
                        vendors(vendor_name, unit_code),
                        peruntukan(deskripsi)
                    `)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch teams:', error);
                    return { success: false, error: error.message, data: null };
                }

                console.log('✅ Teams loaded:', data.length);
                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching teams:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get team by ID
         */
        async getById(teamId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .select(`
                    *,
                    vendors(vendor_name),
                    peruntukan(deskripsi)
                `)
                    .eq('id', teamId)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch team:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching team:', error);
                return null;
            }
        },

        /**
         * Get teams by vendor ID
         */
        async getByVendor(vendorId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .select(`
                    *,
                    peruntukan(deskripsi)
                `)
                    .eq('vendor_id', vendorId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch teams by vendor:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching teams:', error);
                return null;
            }
        },

        /**
         * Get teams by peruntukan
         */
        async getByPeruntukan(peruntukanId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .select(`
                    *,
                    vendors(vendor_name)
                `)
                    .eq('peruntukan_id', peruntukanId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch teams by peruntukan:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching teams:', error);
                return null;
            }
        },

        /**
         * Get teams by vendor AND peruntukan
         */
        async getByVendorAndPeruntukan(vendorId, peruntukanId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .select(`
                    *,
                    peruntukan(deskripsi)
                `)
                    .eq('vendor_id', vendorId)
                    .eq('peruntukan_id', peruntukanId)
                    .order('created_at', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch teams by vendor and peruntukan:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching teams:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get team by access token
         */
        async getByToken(accessToken) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .select(`
                    *,
                    vendors(vendor_name, unit_code, unit_name),
                    peruntukan(deskripsi)
                `)
                    .eq('access_token', accessToken)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch team by token:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching team:', error);
                return null;
            }
        },

        /**
         * Create new team
         */
        async create(teamData) {
            try {
                const client = getSupabaseClient();

                // Auto-generate access token if not provided
                if (!teamData.access_token) {
                    teamData.access_token = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
                }

                const { data, error } = await client
                    .from('teams')
                    .insert([teamData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create team:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Team created:', data.id);
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating team:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update team
         */
        async update(teamId, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .update(updates)
                    .eq('id', teamId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update team:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Team updated:', teamId);
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error updating team:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete team
         */
        async delete(teamId) {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('teams')
                    .delete()
                    .eq('id', teamId);

                if (error) {
                    console.error('❌ Failed to delete team:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Team deleted:', teamId);
                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting team:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Regenerate access token
         */
        async regenerateToken(teamId) {
            const newToken = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
            return this.update(teamId, { access_token: newToken });
        },

        /**
         * Get teams by unit code (via vendors)
         */
        async getByUnitCode(unitCode) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .select(`
                        *,
                        vendors!inner(vendor_name, unit_code),
                        peruntukan(deskripsi)
                    `)
                    .eq('vendors.unit_code', unitCode)
                    .order('created_at', { ascending: false });

                if (error) {
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get teams by vendor ID with full relations
         */
        async getByVendorId(vendorId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('teams')
                    .select(`
                        *,
                        vendors(vendor_name, unit_code),
                        peruntukan(deskripsi)
                    `)
                    .eq('vendor_id', vendorId)
                    .order('created_at', { ascending: false });

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

// Provide global alias
var TeamsAPI = window.TeamsAPI;
