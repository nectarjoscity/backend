import * as CategoryService from '../services/categoryService.js';
import { reindexCategory } from '../services/knowledgeBaseService.js';

// Create Category (controller only)
export const createCategory = async (req, res) => {
  try {
    const { name, description, emoji, imageUrl, isActive } = req.body;
    const category = await CategoryService.createCategory({ name, description, emoji, imageUrl, isActive });
    // Auto-index in vector store (non-blocking)
    reindexCategory(category._id).catch(err => console.error('Error indexing category:', err));
    return res.status(201).json({ success: true, message: 'Category created successfully', data: category });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({ success: false, message: error.message || 'Error creating category' });
  }
};

// Read: Get all categories (controller only)
export const getCategories = async (req, res) => {
  try {
    // Support both RAG filters (deepseekFilters) and regular query params
    const source = req.deepseekFilters || req.query;
    const categories = await CategoryService.getCategories({ 
      active: source.active, 
      search: source.search, 
      name: source.name 
    });
    return res.status(200).json({ success: true, count: categories.length, data: categories });
  } catch (error) {
    console.error('Error in getCategories:', error);
    // Check if it's a database connection error
    if (error.name === 'MongoServerError' || error.name === 'MongooseError' || error.message?.includes('MongoDB') || error.message?.includes('connection')) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection error. Please check your MongoDB configuration.', 
        error: process.env.NODE_ENV === 'production' ? {} : error.message 
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: 'Error fetching categories', 
      error: process.env.NODE_ENV === 'production' ? {} : error.message 
    });
  }
};

// Read: Get single category by ID
export const getCategoryById = async (req, res) => {
  try {
    const category = await CategoryService.getCategoryById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    return res.status(200).json({ success: true, data: category });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching category', error: error.message });
  }
};

// Update Category (controller only)
export const updateCategory = async (req, res) => {
  try {
    const category = await CategoryService.updateCategory(req.params.id, req.body);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    // Auto-reindex in vector store (non-blocking)
    reindexCategory(category._id).catch(err => console.error('Error reindexing category:', err));
    return res.status(200).json({ success: true, message: 'Category updated successfully', data: category });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({ success: false, message: error.message || 'Error updating category' });
  }
};

// Delete Category (controller only)
export const deleteCategory = async (req, res) => {
  try {
    const category = await CategoryService.deleteCategory(req.params.id, { soft: req.query.soft });
    if (!category) return res.status(404).json({ success: false, message: 'Category not found' });
    return res.status(200).json({ success: true, message: req.query.soft === 'true' ? 'Category deactivated' : 'Category deleted', data: category });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error deleting category', error: error.message });
  }
};