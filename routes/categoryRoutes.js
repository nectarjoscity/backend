import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import { 
  createCategory,
  getCategories,
  getCategoryById,
  updateCategory,
  deleteCategory
} from '../controllers/categoryController.js';

const router = express.Router();

// @route   GET /api/categories
// @desc    Get all categories
// @access  Public
router.get('/', getCategories);

// @route   GET /api/categories/:id
// @desc    Get category by ID
// @access  Public
router.get('/:id', getCategoryById);

// @route   POST /api/categories
// @desc    Create category
// @access  Public
router.post('/', authenticate, authorize('admin'), createCategory);

// @route   PUT /api/categories/:id
// @desc    Update category
// @access  Public
router.put('/:id', authenticate, authorize('admin'), updateCategory);

// @route   DELETE /api/categories/:id
// @desc    Delete category (soft delete supported with ?soft=true)
// @access  Public
router.delete('/:id', authenticate, authorize('admin'), deleteCategory);

export default router;