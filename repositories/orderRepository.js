import Order from '../models/Order.js';

export const create = async (orderData) => {
  const order = new Order(orderData);
  await order.save();
  return order;
};

export const findById = async (id) => {
  return Order.findById(id).populate({
    path: 'orderItems',
    populate: {
      path: 'menuItem',
      model: 'MenuItem'
    }
  });
};

export const findAll = async (id) => {
  return Order.find().populate({
    path: 'orderItems',
    populate: {
      path: 'menuItem',
      model: 'MenuItem'
    }
  }).sort({ createdAt: -1 });
};

export const update = async (id, updateData) => {
  return Order.findByIdAndUpdate(id, updateData, { new: true });
};

export const remove = async (id) => {
  return Order.findByIdAndDelete(id);
};