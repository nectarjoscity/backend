import Setting from '../models/Setting.js';

// Get all settings (Admin only)
export const getSettings = async (req, res) => {
    try {
        const settings = await Setting.find({});
        const settingsMap = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});
        res.json({ success: true, data: settingsMap });
    } catch (error) {
        console.error('Error fetching settings:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch settings' });
    }
};

// Get public settings (No auth required)
export const getPublicSettings = async (req, res) => {
    try {
        const settings = await Setting.find({ isPublic: true });
        const settingsMap = settings.reduce((acc, curr) => {
            acc[curr.key] = curr.value;
            return acc;
        }, {});

        // Ensure wifi_password exists if not found (seed default)
        if (!settingsMap.wifi_password) {
            // Return empty string if not set yet, don't create it automatically to avoid garbage data
            // Or we can return a default placeholder
        }

        res.json({ success: true, data: settingsMap });
    } catch (error) {
        console.error('Error fetching public settings:', error);
        res.status(500).json({ success: false, message: 'Failed to fetch public settings' });
    }
};

// Update a setting (Admin only)
export const updateSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value, isPublic, description } = req.body;

        if (!key) {
            return res.status(400).json({ success: false, message: 'Setting key is required' });
        }

        const updateData = { value };
        if (isPublic !== undefined) updateData.isPublic = isPublic;
        if (description !== undefined) updateData.description = description;

        const setting = await Setting.findOneAndUpdate(
            { key },
            updateData,
            { new: true, upsert: true, setDefaultsOnInsert: true }
        );

        res.json({ success: true, data: setting });
    } catch (error) {
        console.error('Error updating setting:', error);
        res.status(500).json({ success: false, message: 'Failed to update setting' });
    }
};
