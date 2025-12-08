import express from 'express';
import { getRecommendations, checkMealCompleteness } from '../services/recommendationService.js';
import { optionalAuth } from '../middleware/auth.js';

const router = express.Router();

// Optional auth - recommendations work for both logged-in and guest users
router.use(optionalAuth);

/**
 * POST /api/recommendations
 * Get AI-powered meal recommendations based on selected items
 * 
 * Body: { selectedItems: [{ _id, name, category, ... }] }
 */
router.post('/', async (req, res) => {
    try {
        const { selectedItems, excludeItemIds, targetCategory, preferences } = req.body;

        if (!selectedItems || !Array.isArray(selectedItems) || selectedItems.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Please provide at least one selected item'
            });
        }

        const result = await getRecommendations(selectedItems, {
            excludeItemIds: excludeItemIds || [],
            targetCategory: targetCategory || null,
            preferences: preferences || {}
        });

        return res.status(200).json(result);
    } catch (error) {
        console.error('Recommendation route error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to get recommendations',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/recommendations/check-meal
 * Check if the current selection forms a complete meal
 * 
 * Body: { selectedItems: [{ _id, name, category, ... }] }
 */
router.post('/check-meal', async (req, res) => {
    try {
        const { selectedItems } = req.body;

        if (!selectedItems || !Array.isArray(selectedItems)) {
            return res.status(400).json({
                success: false,
                message: 'Please provide selected items array'
            });
        }

        const result = await checkMealCompleteness(selectedItems);

        return res.status(200).json({
            success: true,
            ...result
        });
    } catch (error) {
        console.error('Check meal route error:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to check meal completeness',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

export default router;
