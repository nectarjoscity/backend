import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { createMenuItem, getMenuItems, getMenuItemById, updateMenuItem, deleteMenuItem } from '../controllers/menuItemController.js';

const router = express.Router();

router.get('/', getMenuItems); // GET /api/menu-items
router.get('/:id', getMenuItemById); // GET /api/menu-items/:id
router.post('/', authenticate, authorize('admin'), createMenuItem); // POST /api/menu-items
router.put('/:id', authenticate, authorize('admin'), updateMenuItem); // PUT /api/menu-items/:id
router.delete('/:id', authenticate, authorize('admin'), deleteMenuItem); // DELETE /api/menu-items/:id?soft=true

export default router;