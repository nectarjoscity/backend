import Category from '../models/Category.js';

// Data access (DB) logic only. No business rules here.

export const create = async (data) => {
  return Category.create(data);
};

export const find = async (filter = {}, options = {}) => {
  const query = Category.find(filter);
  if (options.select) query.select(options.select);
  if (options.sort) query.sort(options.sort);
  return query;
};

export const findById = async (id) => {
  return Category.findById(id);
};

export const findByName = async (name) => {
  return Category.findOne({ name });
};

export const updateById = async (id, updates, options = { new: true, runValidators: true }) => {
  return Category.findByIdAndUpdate(id, updates, options);
};

export const deleteById = async (id) => {
  return Category.findByIdAndDelete(id);
};

export const deactivateById = async (id) => {
  return Category.findByIdAndUpdate(id, { isActive: false }, { new: true });
};