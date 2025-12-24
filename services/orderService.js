import * as OrderRepository from '../repositories/orderRepository.js';
import * as OrderItemRepository from '../repositories/orderItemRepository.js';
import { sendOrderStatusEmail, sendOrderConfirmationEmail } from '../utils/emailService.js';
import InventoryItem from '../models/InventoryItem.js';
import MenuItemIngredient from '../models/MenuItemIngredient.js';
import InventoryTransaction from '../models/InventoryTransaction.js';

// Deduct inventory for an order
export const deductInventoryForOrder = async (order) => {
  const transactions = [];
  const errors = [];

  try {
    // Get all order items with menu items populated
    const populatedOrder = await OrderRepository.findById(order._id);

    if (!populatedOrder || !populatedOrder.orderItems) {
      console.log('[Inventory] No order items found for order:', order._id);
      return { success: true, transactions: [] };
    }

    for (const orderItem of populatedOrder.orderItems) {
      const menuItem = orderItem.menuItem;
      const quantity = orderItem.quantity;

      if (!menuItem) {
        console.warn('[Inventory] Order item missing menu item:', orderItem._id);
        continue;
      }

      // Get all ingredients for this menu item
      const ingredients = await MenuItemIngredient.find({ menuItem: menuItem._id })
        .populate('inventoryItem');

      for (const ingredient of ingredients) {
        const inventoryItem = ingredient.inventoryItem;
        if (!inventoryItem || !inventoryItem.isActive) {
          continue;
        }

        const totalNeeded = ingredient.quantity * quantity;

        // Check if enough stock available
        if (inventoryItem.currentStock < totalNeeded) {
          const error = {
            inventoryItem: inventoryItem.name,
            available: inventoryItem.currentStock,
            needed: totalNeeded,
            shortfall: totalNeeded - inventoryItem.currentStock
          };
          errors.push(error);
          console.warn(`[Inventory] Insufficient stock for ${inventoryItem.name}: need ${totalNeeded}, have ${inventoryItem.currentStock}`);
          // Continue processing but mark the issue
        }

        // Deduct inventory (even if insufficient, to track usage)
        const newStock = Math.max(0, inventoryItem.currentStock - totalNeeded);
        inventoryItem.currentStock = newStock;
        await inventoryItem.save();

        // Create transaction record
        const transaction = await InventoryTransaction.create({
          inventoryItem: inventoryItem._id,
          type: 'sale',
          quantity: -totalNeeded, // Negative for deduction
          unit: ingredient.unit,
          costPerUnit: inventoryItem.costPerUnit,
          totalCost: totalNeeded * inventoryItem.costPerUnit,
          order: order._id,
          menuItem: menuItem._id,
          notes: `Deducted for order ${order._id} - ${menuItem.name} x${quantity}`
        });

        transactions.push(transaction);
      }
    }

    return { success: errors.length === 0, transactions, errors };
  } catch (error) {
    console.error('[Inventory] Error deducting inventory:', error);
    throw error;
  }
};

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

  // Deduct inventory when payment is confirmed (for cash orders) or immediately (for transfer)
  if (orderHeader.paymentConfirmed || orderHeader.paymentMethod !== 'cash') {
    try {
      const inventoryResult = await deductInventoryForOrder(populatedOrder);
      if (inventoryResult.errors && inventoryResult.errors.length > 0) {
        console.warn('[OrderService] Inventory warnings:', inventoryResult.errors);
        // You might want to notify admin about low stock
      }
    } catch (inventoryError) {
      console.error('[OrderService] Failed to deduct inventory:', inventoryError);
      // Don't fail the order creation, but log the error
    }
  }

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

  // If payment was just confirmed, deduct inventory now
  if (updateData.paymentConfirmed === true && oldOrder && !oldOrder.paymentConfirmed) {
    try {
      const populatedOrder = await OrderRepository.findById(id);
      const inventoryResult = await deductInventoryForOrder(populatedOrder);
      if (inventoryResult.errors && inventoryResult.errors.length > 0) {
        console.warn('[OrderService] Inventory warnings on payment confirmation:', inventoryResult.errors);
      }
    } catch (inventoryError) {
      console.error('[OrderService] Failed to deduct inventory on payment confirmation:', inventoryError);
    }
  }

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

export const getCustomersFromOrders = async () => {
  const Order = (await import('../models/Order.js')).default;

  // Aggregate unique customers from orders
  const customers = await Order.aggregate([
    {
      $match: {
        customerName: { $exists: true, $ne: null, $ne: '' }
      }
    },
    {
      $group: {
        _id: {
          email: { $toLower: { $ifNull: ['$customerEmail', '$customerName'] } }
        },
        customerName: { $first: '$customerName' },
        customerEmail: { $first: '$customerEmail' },
        customerPhone: { $first: '$customerPhone' },
        totalOrders: { $sum: 1 },
        totalSpent: { $sum: '$totalAmount' },
        firstOrderDate: { $min: '$createdAt' },
        lastOrderDate: { $max: '$createdAt' }
      }
    },
    {
      $project: {
        _id: { $toString: '$_id.email' },
        customerName: 1,
        customerEmail: 1,
        customerPhone: 1,
        totalOrders: 1,
        totalSpent: 1,
        firstOrderDate: 1,
        lastOrderDate: 1
      }
    },
    {
      $sort: { lastOrderDate: -1 }
    }
  ]);

  return customers;
};