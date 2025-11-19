import * as CategoryRepo from '../repositories/categoryRepository.js';

const errorWithStatus = (status, message) => {
  const err = new Error(message);
  err.status = status;
  return err;
};

export const createCategory = async ({ name, description, emoji, imageUrl, isActive }) => {
  // Only check for active categories with the same name
  const existing = await CategoryRepo.find({ name, isActive: true });
  if (existing && existing.length > 0) throw errorWithStatus(400, 'Category with this name already exists');
  const category = await CategoryRepo.create({ name, description, emoji, imageUrl, isActive });
  return category;
};

export const getCategories = async ({ active, search, name } = {}) => {
  const filter = {};
  if (active === 'true') filter.isActive = true;
  if (active === 'false') filter.isActive = false;
  if (name) {
    // exact-ish match (case-insensitive)
    filter.name = new RegExp(`^${name}$`, 'i');
  } else if (search) {
    // partial match on name or description
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { description: { $regex: search, $options: 'i' } }
    ];
  }
  const categories = await CategoryRepo.find(filter, { sort: { createdAt: -1 } });
  return categories;
};

export const getCategoryById = async (id) => {
  const category = await CategoryRepo.findById(id);
  return category; // controller decides 404 response
};

export const updateCategory = async (id, updates) => {
  const data = { ...updates };
  Object.keys(data).forEach((k) => data[k] === undefined && delete data[k]);

  if (data.name) {
    // Only check for active categories with the same name
    const existing = await CategoryRepo.find({ name: data.name, isActive: true });
    const exists = existing && existing.length > 0 ? existing[0] : null;
    if (exists && String(exists._id) !== String(id)) {
      throw errorWithStatus(400, 'Another category with this name already exists');
    }
  }

  const category = await CategoryRepo.updateById(id, data, { new: true, runValidators: true });
  return category; // controller decides 404
};

export const deleteCategory = async (id, { soft } = {}) => {
  if (soft === 'true') {
    return CategoryRepo.deactivateById(id);
  }
  return CategoryRepo.deleteById(id);
};