/**
 * Profiles API Module
 * Handle all user profile data operations
 * Primary Key: id (UUID) - linked to auth.users
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.ProfilesAPI === 'undefined') {
    window.ProfilesAPI = {
        /**
         * Get all profiles
         */
        async getAll() {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .select(`
                    *,
                    units:unit_code(unit_name, unit_tipe),
                    vendors(vendor_name)
                `)
                    .order('nama', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch profiles:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching profiles:', error);
                return null;
            }
        },

        /**
         * Get profile by ID (auth user id)
         */
        async getById(profileId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .select(`
                    *,
                    units:unit_code(unit_name, unit_tipe),
                    vendors(vendor_name)
                `)
                    .eq('id', profileId)
                    .single();

                if (error) {
                    // PGRST116 means no rows found - not necessarily an error
                    if (error.code === 'PGRST116') {
                        return { success: false, data: null, notFound: true };
                    }
                    console.error('❌ Failed to fetch profile:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error fetching profile:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Get profile by email
         */
        async getByEmail(email) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .select(`
                    *,
                    units:unit_code(unit_name, unit_tipe),
                    vendors(vendor_name)
                `)
                    .eq('email', email)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch profile by email:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching profile:', error);
                return null;
            }
        },

        /**
         * Get profile by NIP
         */
        async getByNIP(nip) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .select(`
                    *,
                    units:unit_code(unit_name, unit_tipe),
                    vendors(vendor_name)
                `)
                    .eq('nip', nip)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch profile by NIP:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching profile:', error);
                return null;
            }
        },

        /**
         * Get profiles by role
         */
        async getByRole(role) {
            try {
                const client = getSupabaseClient();

                let query = client
                    .from('profiles')
                    .select(`
                    *,
                    units:unit_code(unit_name, unit_tipe),
                    vendors(vendor_name)
                `);

                // If role is 'all', fetch all profiles without filter
                if (role !== 'all') {
                    query = query.eq('role', role);
                }

                const { data, error } = await query.order('nama', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch profiles by role:', error);
                    return { success: false, error: error.message, data: [] };
                }

                return { success: true, data: data || [] };
            } catch (error) {
                console.error('❌ Error fetching profiles:', error);
                return { success: false, error: error.message, data: [] };
            }
        },

        /**
         * Get profiles by unit
         */
        async getByUnit(unitCode) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .select(`
                    *,
                    units:unit_code(unit_name, unit_tipe),
                    vendors(vendor_name)
                `)
                    .eq('unit_code', unitCode)
                    .order('nama', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch profiles by unit:', error);
                    return { success: false, error: error.message, data: [] };
                }

                return { success: true, data: data || [] };
            } catch (error) {
                console.error('❌ Error fetching profiles:', error);
                return { success: false, error: error.message, data: [] };
            }
        },

        /**
         * Get profiles by vendor
         */
        async getByVendor(vendorId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .select('*')
                    .eq('vendor_id', vendorId)
                    .order('nama', { ascending: true });

                if (error) {
                    console.error('❌ Failed to fetch profiles by vendor:', error);
                    return null;
                }

                return data;
            } catch (error) {
                console.error('❌ Error fetching profiles:', error);
                return null;
            }
        },

        /**
         * Create new profile
         * Note: Profile ID should match auth.users ID
         */
        async create(profileData) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .insert([profileData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create profile:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating profile:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update profile
         */
        async update(profileId, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .update(updates)
                    .eq('id', profileId)
                    .select();

                if (error) {
                    console.error('❌ Failed to update profile:', error);
                    return { success: false, error: error.message };
                }

                // Check if any row was updated
                if (!data || data.length === 0) {
                    console.error('❌ No profile updated - check RLS policies or if profile exists');
                    return { success: false, error: 'Profile not found or no permission to update' };
                }

                return { success: true, data: data[0] };
            } catch (error) {
                console.error('❌ Error updating profile:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Upsert profile (insert if not exists, update if exists)
         */
        async upsert(profileData) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('profiles')
                    .upsert(profileData, {
                        onConflict: 'id',
                        ignoreDuplicates: false
                    })
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to upsert profile:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error upserting profile:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update current user's profile
         */
        async updateCurrentUser(updates) {
            try {
                const user = await getCurrentUser();
                if (!user) {
                    return { success: false, error: 'User not authenticated' };
                }
                return this.update(user.id, updates);
            } catch (error) {
                console.error('❌ Error updating current user profile:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete profile
         */
        async delete(profileId) {
            try {
                const client = getSupabaseClient();
                const { error } = await client
                    .from('profiles')
                    .delete()
                    .eq('id', profileId);

                if (error) {
                    console.error('❌ Failed to delete profile:', error);
                    return { success: false, error: error.message };
                }

                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting profile:', error);
                return { success: false, error: error.message };
            }
        }
    };
}
// Provide global alias using var (not const) to avoid redeclaration errors
var ProfilesAPI = window.ProfilesAPI;
