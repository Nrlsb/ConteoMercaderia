const express = require('express');
const router = express.Router();
const { createClient } = require('@supabase/supabase-js');
const { verifyToken, verifySuperAdmin } = require('../middleware/auth');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY);

// Cache in memory
let branchDyeTypesCache = null;
let cacheTime = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Get all branch dye types with cache
router.get('/', async (req, res) => {
    try {
        const now = Date.now();

        // Return cached data if available
        if (branchDyeTypesCache && now - cacheTime < CACHE_DURATION) {
            return res.json(branchDyeTypesCache);
        }

        const { data, error } = await supabase
            .from('branch_dye_types')
            .select('*')
            .order('branch_name');

        if (error) throw error;

        // Build map object from data
        const dyeTypeMap = {};
        if (data && Array.isArray(data)) {
            data.forEach(row => {
                dyeTypeMap[row.branch_name] = row.dye_type;
            });
        }

        branchDyeTypesCache = dyeTypeMap;
        cacheTime = now;

        res.json(dyeTypeMap);
    } catch (error) {
        console.error('Error fetching branch dye types:', error);
        res.status(500).json({ message: 'Error al obtener tipos de colorante por sucursal' });
    }
});

// Update dye type for a branch (admin only)
router.put('/:branch_name', verifyToken, verifySuperAdmin, async (req, res) => {
    try {
        const { branch_name } = req.params;
        const { dye_type } = req.body;

        // Validate dye_type
        if (!['Automotor', 'Hogar y Obra'].includes(dye_type)) {
            return res.status(400).json({
                message: 'Tipo de colorante inválido. Debe ser "Automotor" o "Hogar y Obra"'
            });
        }

        const { data, error } = await supabase
            .from('branch_dye_types')
            .upsert(
                { branch_name, dye_type, updated_at: new Date() },
                { onConflict: 'branch_name' }
            )
            .select();

        if (error) throw error;

        // Clear cache
        branchDyeTypesCache = null;
        cacheTime = 0;

        res.json({
            message: 'Tipo de colorante actualizado',
            data: data[0]
        });
    } catch (error) {
        console.error('Error updating branch dye type:', error);
        res.status(500).json({ message: 'Error al actualizar tipo de colorante' });
    }
});

// Get dye type for specific branch
router.get('/:branch_name', async (req, res) => {
    try {
        const { branch_name } = req.params;

        // Try cache first
        if (branchDyeTypesCache && branchDyeTypesCache[branch_name]) {
            return res.json({
                branch_name,
                dye_type: branchDyeTypesCache[branch_name]
            });
        }

        const { data, error } = await supabase
            .from('branch_dye_types')
            .select('*')
            .eq('branch_name', branch_name)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116 = no rows

        // Return default if not found
        const dye_type = data?.dye_type || 'Automotor';

        res.json({ branch_name, dye_type });
    } catch (error) {
        console.error('Error fetching branch dye type:', error);
        res.status(500).json({ message: 'Error al obtener tipo de colorante' });
    }
});

module.exports = router;
