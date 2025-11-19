import * as UserService from '../services/userService.js';

// Get all users (controller)
export const getAllUsers = async (req, res) => {
  try {
    const users = await UserService.getAllUsers();
    res.status(200).json({ success: true, count: users.length, data: users });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching users', error: error.message });
  }
};

// Get user by ID (controller)
export const getUserById = async (req, res) => {
  try {
    const user = await UserService.getUserById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.status(200).json({ success: true, data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error fetching user', error: error.message });
  }
};

// Create new user (controller)
export const createUser = async (req, res) => {
  try {
    const user = await UserService.createUser(req.body);
    res.status(201).json({ success: true, message: 'User created successfully', data: user });
  } catch (error) {
    const status = error.status || 400;
    res.status(status).json({ success: false, message: error.message || 'Error creating user' });
  }
};

// Update user (controller)
export const updateUser = async (req, res) => {
  try {
    const user = await UserService.updateUser(req.params.id, req.body);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.status(200).json({ success: true, message: 'User updated successfully', data: user });
  } catch (error) {
    const status = error.status || 400;
    res.status(status).json({ success: false, message: error.message || 'Error updating user' });
  }
};

// Delete user (controller)
export const deleteUser = async (req, res) => {
  try {
    const user = await UserService.deleteUser(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.status(200).json({ success: true, message: 'User deleted successfully', data: user });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting user', error: error.message });
  }
};