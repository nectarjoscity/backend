import * as OrderRepository from '../repositories/orderRepository.js';
import * as OrderItemRepository from '../repositories/orderItemRepository.js';
import { sendOrderStatusEmail, sendOrderConfirmationEmail } from '../utils/emailService.js';

export const createOrder = async (orderData) => {
  console.log('[OrderService] Creating order with data:', JSON.stringify(orderData, null, 2));
  
  const { orderItems, ...orderHeader } = orderData;
  
  console.log('[OrderService] Order header:', JSON.stringify(orderHeader, null, 2));
  console.log('[OrderService] Order items count:', orderItems.length);
  
  const newOrder = await OrderRepository.create(orderHeader);
  console.log('[OrderService] Order created with ID:', newOrder._id);

  const createdOrderItems = [];
  for (const item of orderItems) {
    console.log('[OrderService] Creating order item:', JSON.stringify(item, null, 2));
    try {
      const newOrderItem = await OrderItemRepository.create({ ...item, order: newOrder._id });
      console.log('[OrderService] Order item created:', newOrderItem._id);
      createdOrderItems.push(newOrderItem._id);
    } catch (itemError) {
      console.error('[OrderService] Error creating order item:', itemError);
      throw itemError;
    }
  }

  newOrder.orderItems = createdOrderItems;
  await newOrder.save();
  console.log('[OrderService] Order saved with items:', createdOrderItems.length);

  // Return populated order
  const populatedOrder = await OrderRepository.findById(newOrder._id);
  console.log('[OrderService] Populated order:', populatedOrder?._id);
  
  // Send order confirmation email (async, don't wait for it)
  if (populatedOrder.customerEmail) {
    sendOrderConfirmationEmail(populatedOrder).catch(err => {
      console.error('[OrderService] Failed to send confirmation email:', err);
    });
  }
  
  return populatedOrder;
};

export const getOrderById = async (id) => {
  return OrderRepository.findById(id);
};

export const getAllOrders = async () => {
  return OrderRepository.findAll();
};

export const updateOrder = async (id, updateData) => {
  // Get the old order to check status change
  const oldOrder = await OrderRepository.findById(id);
  
  // Update the order
  const updatedOrder = await OrderRepository.update(id, updateData);
  
  // Send email notification if status changed and customer has email
  if (updateData.status && oldOrder && oldOrder.status !== updateData.status) {
    const populatedOrder = await OrderRepository.findById(id);
    if (populatedOrder && populatedOrder.customerEmail) {
      // Send email asynchronously (don't block the response)
      sendOrderStatusEmail(populatedOrder, updateData.status).catch(err => {
        console.error('[OrderService] Failed to send status email:', err);
      });
    }
  }
  
  return updatedOrder;
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