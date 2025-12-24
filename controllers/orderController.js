import * as OrderService from '../services/orderService.js';

export const createOrder = async (req, res) => {
  console.log('=== ORDER CREATION REQUEST ===');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  const { customerName, totalAmount, orderItems } = req.body;

  if (!customerName || !totalAmount || !orderItems || !Array.isArray(orderItems) || orderItems.length === 0) {
    console.error('Validation failed: Missing required fields');
    return res.status(400).json({ success: false, message: 'Missing required order fields: customerName, totalAmount, or orderItems' });
  }

  for (const item of orderItems) {
    if (!item.menuItem || !item.quantity || item.price === undefined) {
      console.error('Validation failed: Invalid order item', item);
      return res.status(400).json({ success: false, message: 'Each order item must have menuItem, quantity, and price' });
    }
  }

  try {
    // Add user ID if user is authenticated (customer)
    // Add waiter ID if admin/waiter is creating the order
    const orderData = {
      ...req.body,
      user: req.user?.id || null,
      // If the authenticated user is an admin, set them as the waiter
      waiter: req.user?.role === 'admin' ? req.user.id : null
    };

    console.log('Creating order with data:', JSON.stringify(orderData, null, 2));
    const order = await OrderService.createOrder(orderData);
    console.log('Order created successfully:', order?._id);
    console.log('Order details:', JSON.stringify(order, null, 2));

    res.status(201).json({ success: true, data: order });
  } catch (error) {
    console.error('Error creating order:', error);
    console.error('Error stack:', error.stack);
    res.status(400).json({ success: false, message: error.message || 'Failed to create order' });
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
    console.log('[OrderController] Fetching all orders...');
    const orders = await OrderService.getAllOrders();
    console.log('[OrderController] Found orders:', orders?.length || 0);
    console.log('[OrderController] Orders data:', JSON.stringify(orders, null, 2));
    res.json({ success: true, data: orders || [] });
  } catch (error) {
    console.error('[OrderController] Error fetching orders:', error);
    console.error('[OrderController] Error stack:', error.stack);
    res.status(500).json({ success: false, message: error.message });
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

export const getCustomersFromOrders = async (req, res) => {
  try {
    const customers = await OrderService.getCustomersFromOrders();
    res.json({ success: true, data: customers });
  } catch (error) {
    console.error('[OrderController] Error fetching customers:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const sendEmailToCustomers = async (req, res) => {
  try {
    const { recipients, subject, message, template } = req.body;

    if (!recipients || !Array.isArray(recipients) || recipients.length === 0) {
      return res.status(400).json({ success: false, message: 'Recipients are required' });
    }

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required' });
    }

    const { sendBulkEmail } = await import('../utils/emailService.js');
    const result = await sendBulkEmail({ recipients, subject, message, template });

    res.json({
      success: true,
      data: {
        totalSent: result.totalSent,
        totalFailed: result.totalFailed,
        message: `Email sent to ${result.totalSent} customers${result.totalFailed > 0 ? `, ${result.totalFailed} failed` : ''}`,
      },
    });
  } catch (error) {
    console.error('[OrderController] Error sending emails:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};