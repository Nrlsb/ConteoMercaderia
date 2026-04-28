const fs = require('fs');
const path = require('path');
const supabase = require('../services/supabaseClient');

// App Version Endpoint Check
exports.getAppVersion = (req, res) => {
    try {
        const versionPath = path.join(__dirname, '../version.json');
        if (fs.existsSync(versionPath)) {
            const versionData = fs.readFileSync(versionPath, 'utf8');
            const versionInfo = JSON.parse(versionData);
            res.json(versionInfo);
        } else {
            res.status(404).json({ message: 'Version info not found' });
        }
    } catch (error) {
        console.error('Error reading version info:', error);
        res.status(500).json({ message: 'Error reading version info' });
    }
};

// Update App Version (Superadmin Only)
exports.updateAppVersion = (req, res) => {
    try {
        const { version, downloadUrl, releaseNotes } = req.body;

        if (!version || !downloadUrl) {
            return res.status(400).json({ message: 'Version y URL de descarga son requeridos' });
        }

        const versionPath = path.join(__dirname, '../version.json');

        const newVersionData = {
            version,
            downloadUrl,
            releaseNotes: releaseNotes || ''
        };

        fs.writeFileSync(versionPath, JSON.stringify(newVersionData, null, 2), 'utf8');
        res.json({ message: 'Versión actualizada correctamente', data: newVersionData });
    } catch (error) {
        console.error('Error updating version info:', error);
        res.status(500).json({ message: 'Error actualizando información de versión' });
    }
};

// Get Global Settings
exports.getSettings = async (req, res) => {
    try {
        const { data, error } = await supabase
            .from('app_settings')
            .select('value')
            .eq('key', 'global_config')
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 is 'not found'
            console.error('Error fetching settings:', error);
            return res.json({ countMode: 'pre_remito' });
        }

        if (!data) {
            return res.json({ countMode: 'pre_remito' }); // Default
        }

        res.json(data.value);
    } catch (error) {
        console.error('Server error fetching settings:', error);
        res.status(500).json({ message: 'Error fetching settings' });
    }
};

// Update Global Settings
exports.updateSettings = async (req, res) => {
    const { countMode } = req.body;

    if (!['pre_remito', 'products'].includes(countMode)) {
        return res.status(400).json({ message: 'Invalid count mode' });
    }

    try {
        // Upsert setting
        const { error } = await supabase
            .from('app_settings')
            .upsert({
                key: 'global_config',
                value: { count_mode: countMode },
                updated_at: new Date()
            });

        if (error) {
            console.error('Error updating settings:', error);
            if (error.code === '42P01') {
                return res.status(500).json({ message: 'Settings table missing. Please run setup_settings.sql in Database.' });
            }
            throw error;
        }

        res.json({ success: true, countMode });
    } catch (error) {
        console.error('Server error updating settings:', error);
        res.status(500).json({ message: 'Error updating settings' });
    }
};
