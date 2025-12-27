import express from 'express';
import {
    getStaff,
    getStaffById,
    createStaff,
    updateStaff,
    deleteStaff,
    getLaborCostSummary
} from '../controllers/staffController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication and admin access
router.use(authenticate);
router.use(authorize('admin'));

router.route('/')
    .get(getStaff)
    .post(createStaff);

router.get('/labor-cost', getLaborCostSummary);

router.route('/:id')
    .get(getStaffById)
    .put(updateStaff)
    .delete(deleteStaff);

export default router;
