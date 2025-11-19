import MenuItem from '../models/MenuItem.js';

export const create = (data) => MenuItem.create(data);

export const find = (filter = {}, options = {}) => {
  let query = MenuItem.find(filter);
  if (options.populate) query = query.populate(options.populate);
  if (options.select) query = query.select(options.select);
  if (options.sort) query = query.sort(options.sort);
  return query;
};

export const findById = (id, options = {}) => {
  let query = MenuItem.findById(id);
  if (options.populate) query = query.populate(options.populate);
  if (options.select) query = query.select(options.select);
  return query;
};

export const findByNameInCategory = (name, categoryId) => {
  return MenuItem.findOne({ name, category: categoryId });
};

export const updateById = (id, updates, options = { new: true, runValidators: true }) => {
  return MenuItem.findByIdAndUpdate(id, updates, options);
};

export const deleteById = (id) => MenuItem.findByIdAndDelete(id);

export const deactivateById = (id) => MenuItem.findByIdAndUpdate(id, { isActive: false }, { new: true });