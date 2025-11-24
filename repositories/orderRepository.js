import Order from '../models/Order.js';

export const create = async (orderData) => {
  const order = new Order(orderData);
  await order.save();
  return order;
};

export const findById = async (id) => {
  return Order.findById(id)
    .populate({
      path: 'orderItems',
      populate: {
        path: 'menuItem',
        model: 'MenuItem',
        select: 'name emoji description price imageUrl'
      }
    })
    .populate('waiter', 'name email')
    .populate('user', 'name email');
};

export const findAll = async () => {
  return Order.find()
    .populate({
      path: 'orderItems',
      populate: {
        path: 'menuItem',
        model: 'MenuItem',
        select: 'name emoji description price imageUrl'
      }
    })
    .populate('waiter', 'name email')
    .populate('user', 'name email')
    .sort({ createdAt: -1 });
};

export const update = async (id, updateData) => {
  return Order.findByIdAndUpdate(id, updateData, { new: true })
    .populate({
      path: 'orderItems',
      populate: {
        path: 'menuItem',
        model: 'MenuItem',
        select: 'name emoji description price imageUrl'
      }
    })
    .populate('waiter', 'name email')
    .populate('user', 'name email');
};

export const remove = async (id) => {
  return Order.findByIdAndDelete(id);
};