import * as MenuRepo from '../repositories/menuItemRepository.js';
import * as CategoryRepo from '../repositories/categoryRepository.js';
import Category from '../models/Category.js';
import mongoose from 'mongoose';

const errorWithStatus = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const createMenuItem = async ({ name, description, emoji, price, currency = 'NGN', imageUrl, isAvailable = true, isActive = true, category }) => {
  // ensure category exists
  const cat = await CategoryRepo.findById(category);
  if (!cat) throw errorWithStatus(400, 'Invalid category');

  // enforce unique name within the category
  const exists = await MenuRepo.findByNameInCategory(name, category);
  if (exists) throw errorWithStatus(400, 'Item with this name already exists in the category');

  // normalize price to number
  const numericPrice = typeof price === 'string' ? parseFloat(String(price).replace(/[^\d.]/g, '')) : price;
  if (Number.isNaN(numericPrice)) throw errorWithStatus(400, 'Invalid price value');

  const item = await MenuRepo.create({ name, description, emoji, price: numericPrice, currency, imageUrl, isAvailable, isActive, category });
  return item;
};

export const getMenuItems = async ({ category, active, available, search, name } = {}) => {
  const filter = {};
  let searchTerm = search; // Use a mutable variable for search
  
  // Handle category filter - support both ObjectId and category name (string)
  if (category) {
    // Check if it's a valid ObjectId
    if (mongoose.Types.ObjectId.isValid(category)) {
      filter.category = category;
    } else {
      // It's a category name string - look up the category (case-insensitive, partial match)
      const categoryName = String(category).trim();
      
      // Try exact match first
      let categoryDoc = await Category.findOne({ 
        name: { $regex: new RegExp(`^${categoryName}$`, 'i') },
        isActive: true 
      });
      
      // If not found, try partial match
      if (!categoryDoc) {
        categoryDoc = await Category.findOne({ 
          name: { $regex: new RegExp(categoryName, 'i') },
          isActive: true 
        });
      }
      
      if (categoryDoc) {
        filter.category = categoryDoc._id;
      } else {
        // Category not found - don't filter by category, but add to search instead
        // This allows searching menu items that might match the category name in their description
        if (!searchTerm && !name) {
          searchTerm = categoryName; // Use category name as search term
        }
        // Don't return empty - let the search handle it
      }
    }
  }
  
  // Default to active items unless explicitly specified otherwise
  if (active === 'false') {
    filter.isActive = false;
  } else {
    // Default to active items (unless explicitly set to false)
    filter.isActive = true;
  }
  
  // Only filter by availability if explicitly specified
  // If not specified, show all items (both available and out of stock)
  if (available === 'true') {
    filter.isAvailable = true;
  } else if (available === 'false') {
    filter.isAvailable = false;
  }
  // If available is not specified, don't add the filter (show all items)
  if (name) {
    // Expand: search by name OR description (partial, case-insensitive)
    const pattern = String(name).trim();
    filter.$or = [
      { name: { $regex: pattern, $options: 'i' } },
      { description: { $regex: pattern, $options: 'i' } }
    ];
  } else if (searchTerm) {
    // partial match on name or description
    filter.$or = [
      { name: { $regex: searchTerm, $options: 'i' } },
      { description: { $regex: searchTerm, $options: 'i' } }
    ];
  }

  const items = await MenuRepo.find(filter, { sort: { createdAt: -1 }, populate: { path: 'category', select: 'name emoji' } });
  return items;
};

export const getMenuItemById = async (id) => {
  const item = await MenuRepo.findById(id, { populate: { path: 'category', select: 'name emoji' } });
  return item;
};

export const updateMenuItem = async (id, updates) => {
  const data = { ...updates };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  if (data.category) {
    const cat = await CategoryRepo.findById(data.category);
    if (!cat) throw errorWithStatus(400, 'Invalid category');
  }

  if (data.name || data.category) {
    const existing = await MenuRepo.findById(id);
    if (existing) {
      const targetCategory = data.category || existing.category;
      const conflict = await MenuRepo.findByNameInCategory(data.name || existing.name, targetCategory);
      if (conflict && String(conflict._id) !== String(id)) {
        throw errorWithStatus(400, 'Another item with this name already exists in the category');
      }
    }
  }

  if (data.price !== undefined) {
    const numericPrice = typeof data.price === 'string' ? parseFloat(String(data.price).replace(/[^\d.]/g, '')) : data.price;
    if (Number.isNaN(numericPrice)) throw errorWithStatus(400, 'Invalid price value');
    data.price = numericPrice;
  }

  // Convert isAvailable from string to boolean if needed
  if (data.isAvailable !== undefined) {
    if (typeof data.isAvailable === 'string') {
      data.isAvailable = data.isAvailable === 'true' || data.isAvailable === 'on';
    }
  }

  const item = await MenuRepo.updateById(id, data, { new: true, runValidators: true });
  return item;
};

export const deleteMenuItem = async (id, { soft } = {}) => {
  if (soft === 'true') return MenuRepo.deactivateById(id);
  return MenuRepo.deleteById(id);
};