import * as OrderRepository from '../repositories/orderRepository.js';
import * as OrderItemRepository from '../repositories/orderItemRepository.js';

export const createOrder = async (orderData) => {
  const { orderItems, ...orderHeader } = orderData;
  const newOrder = await OrderRepository.create(orderHeader);

  const createdOrderItems = [];
  for (const item of orderItems) {
    const newOrderItem = await OrderItemRepository.create({ ...item, order: newOrder._id });
    createdOrderItems.push(newOrderItem._id);
  }

  newOrder.orderItems = createdOrderItems;
  await newOrder.save();

  return newOrder;
};

export const getOrderById = async (id) => {
  return OrderRepository.findById(id);
};

export const getAllOrders = async () => {
  return OrderRepository.findAll();
};

export const updateOrder = async (id, updateData) => {
  return OrderRepository.update(id, updateData);
};

export const deleteOrder = async (id) => {
  // Optionally, delete associated order items as well
  const order = await OrderRepository.findById(id);
  if (order) {
    for (const itemId of order.orderItems) {
      await OrderItemRepository.remove(itemId);
    }
  }
  return OrderRepository.remove(id);
};