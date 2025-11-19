import OrderItem from '../models/OrderItem.js';

export const create = async (orderItemData) => {
  const orderItem = new OrderItem(orderItemData);
  await orderItem.save();
  return orderItem;
};

export const findById = async (id) => {
  return OrderItem.findById(id).populate('menuItem');
};

export const findAll = async () => {
  return OrderItem.find().populate('menuItem');
};

export const update = async (id, updateData) => {
  return OrderItem.findByIdAndUpdate(id, updateData, { new: true });
};

export const remove = async (id) => {
  return OrderItem.findByIdAndDelete(id);
};