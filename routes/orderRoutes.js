import { createOrder, getOrderById, getAllOrders, updateOrder, deleteOrder } from '../controllers/orderController.js';
import { authenticate, authorize } from '../middleware/auth.js';

import express from 'express';
const router = express.Router();

router.post('/', createOrder);
router.get('/:id', getOrderById);
router.get('/', getAllOrders);
router.put('/:id', authenticate, authorize('admin'), updateOrder);
router.delete('/:id', authenticate, authorize('admin'), deleteOrder);

export default router;