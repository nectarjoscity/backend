import * as OrderService from '../services/orderService.js';

export const createOrder = async (req, res) => {
  const { customerName, totalAmount, orderItems } = req.body;

  if (!customerName || !totalAmount || !orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
    return res.status(400).json({ message: 'Missing required order fields: customerName, totalAmount, or orderItems' });
  }

  for (const item of orderItems) {
    if (!item.menuItem || !item.quantity || !item.price) {
      return res.status(400).json({ message: 'Each order item must have menuItem, quantity, and price' });
    }
  }

  try {
    // Add user ID if user is authenticated
    const orderData = {
      ...req.body,
      user: req.user?.id || null
    };
    
    const order = await OrderService.createOrder(orderData);
    res.status(201).json({ data: order });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const getOrderById = async (req, res) => {
  try {
    const order = await OrderService.getOrderById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ data: order });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getAllOrders = async (req, res) => {
  try {
    const orders = await OrderService.getAllOrders();
    res.json({ data: orders });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const updateOrder = async (req, res) => {
  try {
    const order = await OrderService.updateOrder(req.params.id, req.body);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ data: order });
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

export const deleteOrder = async (req, res) => {
  try {
    const order = await OrderService.deleteOrder(req.params.id);
    if (!order) {
      return res.status(404).json({ message: 'Order not found' });
    }
    res.json({ message: 'Order deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};