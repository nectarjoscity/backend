import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
    savePreferences,
    generateMenu,
    getMySubscription,
    swapMeal,
    addMeal,
    removeMeal,
    skipDay,
    pauseSubscription,
    resumeSubscription,
    createPayment,
    verifyPayment,
    getAllSubscriptions,
} from '../controllers/subscriptionController.js';

const router = express.Router();

// User routes (authenticated)
router.post('/preferences', authenticate, savePreferences);
router.post('/generate-menu', authenticate, generateMenu);
router.get('/my', authenticate, getMySubscription);
router.put('/:id/swap-meal', authenticate, swapMeal);
router.post('/:id/add-meal', authenticate, addMeal);
router.delete('/:id/remove-meal', authenticate, removeMeal);
router.put('/:id/skip-day', authenticate, skipDay);
router.put('/:id/pause', authenticate, pauseSubscription);
router.put('/:id/resume', authenticate, resumeSubscription);

// Payment routes
router.post('/:id/pay', authenticate, createPayment);
router.post('/verify-payment', authenticate, verifyPayment);

// Admin routes
router.get('/', authenticate, authorize('admin'), getAllSubscriptions);

export default router;
