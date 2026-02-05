/**
 * Assessments API Module
 * Handle all assessment data operations
 * Requires: supabase-client.js
 */

// Store in window to avoid redeclaration errors
if (typeof window.AssessmentsAPI === 'undefined') {
    window.AssessmentsAPI = {
        /**
         * Get all assessments with relations
         */
        async getAll(filters = {}) {
            try {
                const client = getSupabaseClient();
                let query = client
                    .from('assessments')
                    .select(`
                        *,
                        vendors!inner(id, vendor_name, unit_code),
                        peruntukan(id, jenis, deskripsi),
                        teams(id, nomor_polisi, category),
                        profiles!assessments_assessor_id_fkey(id, nama)
                    `);

                // Apply filters
                if (filters.unitCode) {
                    // Filter by vendor's unit_code using inner join
                    query = query.eq('vendors.unit_code', filters.unitCode);
                }
                if (filters.vendorId) {
                    query = query.eq('vendor_id', filters.vendorId);
                }
                if (filters.status) {
                    query = query.eq('status', filters.status);
                }
                if (filters.startDate) {
                    query = query.gte('tanggal_penilaian', filters.startDate);
                }
                if (filters.endDate) {
                    query = query.lte('tanggal_penilaian', filters.endDate);
                }

                const { data, error } = await query.order('tanggal_penilaian', { ascending: false });

                if (error) {
                    console.error('❌ Failed to fetch assessments:', error);
                    return { success: false, error: error.message, data: null };
                }

                console.log('✅ Assessments loaded:', data.length);
                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching assessments:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Get assessment by ID with items and relations
         */
        async getById(assessmentId) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('assessments')
                    .select(`
                        *,
                        vendors(id, vendor_name, unit_code, unit_name),
                        peruntukan(id, jenis, deskripsi),
                        teams(id, nomor_polisi, category),
                        profiles!assessments_assessor_id_fkey(id, nama),
                        assessment_items(
                            *,
                            equipment_master(id, nama_alat, kategori, satuan)
                        )
                    `)
                    .eq('id', assessmentId)
                    .single();

                if (error) {
                    console.error('❌ Failed to fetch assessment:', error);
                    return { success: false, error: error.message, data: null };
                }

                return { success: true, data, error: null };
            } catch (error) {
                console.error('❌ Error fetching assessment:', error);
                return { success: false, error: error.message, data: null };
            }
        },

        /**
         * Create new assessment
         */
        async create(assessmentData) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('assessments')
                    .insert([assessmentData])
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to create assessment:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Assessment created:', data);
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error creating assessment:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Create assessment with items
         */
        async createWithItems(assessmentData, items) {
            try {
                const client = getSupabaseClient();

                // Create assessment
                const { data: assessment, error: assessmentError } = await client
                    .from('assessments')
                    .insert([assessmentData])
                    .select()
                    .single();

                if (assessmentError) {
                    console.error('❌ Failed to create assessment:', assessmentError);
                    return { success: false, error: assessmentError.message };
                }

                // Create items
                const itemsWithAssessmentId = items.map(item => ({
                    ...item,
                    assessment_id: assessment.id
                }));

                const { data: createdItems, error: itemsError } = await client
                    .from('assessment_items')
                    .insert(itemsWithAssessmentId)
                    .select();

                if (itemsError) {
                    console.error('❌ Failed to create assessment items:', itemsError);
                    // Assessment created but items failed - may need rollback handling
                    return { success: false, error: itemsError.message };
                }

                console.log('✅ Assessment with items created');
                return { success: true, data: assessment, items: createdItems };
            } catch (error) {
                console.error('❌ Error creating assessment:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update assessment
         */
        async update(assessmentId, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('assessments')
                    .update(updates)
                    .eq('id', assessmentId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update assessment:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Assessment updated');
                return { success: true, data };
            } catch (error) {
                console.error('❌ Error updating assessment:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Update assessment item
         */
        async updateItem(itemId, updates) {
            try {
                const client = getSupabaseClient();
                const { data, error } = await client
                    .from('assessment_items')
                    .update(updates)
                    .eq('id', itemId)
                    .select()
                    .single();

                if (error) {
                    console.error('❌ Failed to update assessment item:', error);
                    return { success: false, error: error.message };
                }

                return { success: true, data };
            } catch (error) {
                console.error('❌ Error updating assessment item:', error);
                return { success: false, error: error.message };
            }
        },

        /**
         * Delete assessment and related items
         */
        async delete(assessmentId) {
            try {
                const client = getSupabaseClient();

                // Delete items first (due to foreign key)
                const { error: itemsError } = await client
                    .from('assessment_items')
                    .delete()
                    .eq('assessment_id', assessmentId);

                if (itemsError) {
                    console.error('❌ Failed to delete assessment items:', itemsError);
                    return { success: false, error: itemsError.message };
                }

                // Delete assessment
                const { error } = await client
                    .from('assessments')
                    .delete()
                    .eq('id', assessmentId);

                if (error) {
                    console.error('❌ Failed to delete assessment:', error);
                    return { success: false, error: error.message };
                }

                console.log('✅ Assessment deleted');
                return { success: true };
            } catch (error) {
                console.error('❌ Error deleting assessment:', error);
                return { success: false, error: error.message };
            }
        }
    };
}

// Provide global alias using var (not const) to avoid redeclaration errors
var AssessmentsAPI = window.AssessmentsAPI;
