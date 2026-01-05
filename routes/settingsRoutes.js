import express from 'express';
import { getSettings, getPublicSettings, updateSetting } from '../controllers/settingsController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// Public routes
router.get('/public', getPublicSettings);

// Admin routes
router.get('/', authenticate, authorize('admin'), getSettings);
router.put('/:key', authenticate, authorize('admin'), updateSetting);

export default router;
