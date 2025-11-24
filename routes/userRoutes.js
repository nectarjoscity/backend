import express from 'express';
import { authenticate, authorize } from '../middleware/auth.js';
import {
  getAllUsers,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getCurrentUser
} from '../controllers/userController.js';

const router = express.Router();

// @route   GET /api/users/me
// @desc    Get current user
// @access  Private (authenticated)
router.get('/me', authenticate, getCurrentUser);

// @route   GET /api/users
// @desc    Get all users
// @access  Public
router.get('/', authenticate, authorize('admin'), getAllUsers);

// @route   GET /api/users/:id
// @desc    Get user by ID
// @access  Public
router.get('/:id', authenticate, authorize('admin'), getUserById);

// @route   POST /api/users
// @desc    Create new user
// @access  Public
router.post('/', authenticate, authorize('admin'), createUser);

// @route   PUT /api/users/:id
// @desc    Update user
// @access  Public
router.put('/:id', authenticate, authorize('admin'), updateUser);

// @route   DELETE /api/users/:id
// @desc    Delete user (soft delete)
// @access  Public
router.delete('/:id', authenticate, authorize('admin'), deleteUser);

export default router;