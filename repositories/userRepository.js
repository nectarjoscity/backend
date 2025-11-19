import User from '../models/User.js';

// Pure data access operations for User
export const find = async (filter = {}, options = {}) => {
  let query = User.find(filter);
  if (options.select) query = query.select(options.select);
  if (options.sort) query = query.sort(options.sort);
  return query;
};

export const findById = async (id, options = {}) => {
  let query = User.findById(id);
  if (options.select) query = query.select(options.select);
  return query;
};

export const findByEmail = async (email) => {
  return User.findOne({ email });
};

export const create = async (data) => {
  return User.create(data);
};

export const updateById = async (id, updates, options = { new: true, runValidators: true }) => {
  return User.findByIdAndUpdate(id, updates, options);
};

export const deactivateById = async (id) => {
  return User.findByIdAndUpdate(id, { isActive: false }, { new: true });
};