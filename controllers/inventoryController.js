import InventoryItem from '../models/InventoryItem.js';
import MenuItemIngredient from '../models/MenuItemIngredient.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import MenuItem from '../models/MenuItem.js';

// Helper to format MongoDB errors into user-friendly messages
const formatError = (error) => {
  // Duplicate key error
  if (error.code === 11000) {
    const field = Object.keys(error.keyPattern || {})[0] || 'field';
    const value = error.keyValue ? Object.values(error.keyValue)[0] : '';
    return `An item with this ${field} ("${value}") already exists. Please use a different ${field}.`;
  }

  // Validation errors
  if (error.name === 'ValidationError') {
    const messages = Object.values(error.errors || {}).map(e => e.message);
    return messages.join('. ') || 'Validation failed. Please check your input.';
  }

  // Cast error (invalid ID format)
  if (error.name === 'CastError') {
    return 'Invalid ID format. Please check the ID and try again.';
  }

  return error.message || 'An unexpected error occurred.';
};

// Get all inventory items
export const getInventoryItems = async (req, res) => {
  try {
    const { search, category, lowStock } = req.query;
    let query = { isActive: true };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    if (category) {
      query.category = category;
    }

    let items = await InventoryItem.find(query).sort({ name: 1 });

    // Filter low stock items if requested
    if (lowStock === 'true') {
      items = items.filter(item => item.currentStock <= item.minStock);
    }

    res.json({ success: true, data: items });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get single inventory item
export const getInventoryItem = async (req, res) => {
  try {
    const item = await InventoryItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Create inventory item
export const createInventoryItem = async (req, res) => {
  try {
    // Check if item with same name exists but is deactivated
    const existingItem = await InventoryItem.findOne({ name: req.body.name });
    if (existingItem && !existingItem.isActive) {
      // Reactivate and update the soft-deleted item
      const reactivated = await InventoryItem.findByIdAndUpdate(
        existingItem._id,
        { ...req.body, isActive: true },
        { new: true, runValidators: true }
      );
      return res.status(201).json({ success: true, data: reactivated, message: 'Item reactivated' });
    }

    const item = await InventoryItem.create(req.body);
    res.status(201).json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, message: formatError(error) });
  }
};

// Update inventory item
export const updateInventoryItem = async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true, runValidators: true }
    );
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(400).json({ success: false, message: formatError(error) });
  }
};

// Delete inventory item (soft delete)
export const deleteInventoryItem = async (req, res) => {
  try {
    const item = await InventoryItem.findByIdAndUpdate(
      req.params.id,
      { isActive: false },
      { new: true }
    );
    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }
    res.json({ success: true, data: item });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Restock inventory item
export const restockInventoryItem = async (req, res) => {
  try {
    const { quantity, costPerUnit, notes } = req.body;
    const item = await InventoryItem.findById(req.params.id);

    if (!item) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    const oldStock = item.currentStock;
    item.currentStock += quantity;
    if (costPerUnit) {
      item.costPerUnit = costPerUnit;
    }
    item.lastRestocked = new Date();
    await item.save();

    // Create transaction
    const transaction = await InventoryTransaction.create({
      inventoryItem: item._id,
      type: 'purchase',
      quantity: quantity,
      unit: item.unit,
      costPerUnit: costPerUnit || item.costPerUnit,
      totalCost: quantity * (costPerUnit || item.costPerUnit),
      notes: notes || `Restocked ${quantity} ${item.unit}`
    });

    res.json({
      success: true,
      data: item,
      transaction
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Get menu item ingredients
export const getMenuItemIngredients = async (req, res) => {
  try {
    const ingredients = await MenuItemIngredient.find({ menuItem: req.params.menuItemId })
      .populate('inventoryItem', 'name unit currentStock minStock costPerUnit');
    res.json({ success: true, data: ingredients });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add ingredient to menu item
export const addMenuItemIngredient = async (req, res) => {
  try {
    const { menuItemId, inventoryItemId, quantity, unit } = req.body;

    // Verify menu item exists
    const menuItem = await MenuItem.findById(menuItemId);
    if (!menuItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    // Verify inventory item exists
    const inventoryItem = await InventoryItem.findById(inventoryItemId);
    if (!inventoryItem) {
      return res.status(404).json({ success: false, message: 'Inventory item not found' });
    }

    const ingredient = await MenuItemIngredient.create({
      menuItem: menuItemId,
      inventoryItem: inventoryItemId,
      quantity,
      unit: unit || inventoryItem.unit
    });

    const populated = await MenuItemIngredient.findById(ingredient._id)
      .populate('inventoryItem', 'name unit currentStock minStock costPerUnit');

    res.status(201).json({ success: true, data: populated });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

// Remove ingredient from menu item
export const removeMenuItemIngredient = async (req, res) => {
  try {
    const ingredient = await MenuItemIngredient.findByIdAndDelete(req.params.id);
    if (!ingredient) {
      return res.status(404).json({ success: false, message: 'Ingredient not found' });
    }
    res.json({ success: true, message: 'Ingredient removed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get inventory transactions
export const getInventoryTransactions = async (req, res) => {
  try {
    const { inventoryItemId, orderId, type, startDate, endDate, limit = 100 } = req.query;
    let query = {};

    if (inventoryItemId) query.inventoryItem = inventoryItemId;
    if (orderId) query.order = orderId;
    if (type) query.type = type;
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const transactions = await InventoryTransaction.find(query)
      .populate('inventoryItem', 'name unit')
      .populate('order', 'customerName totalAmount')
      .populate('menuItem', 'name')
      .sort({ createdAt: -1 })
      .limit(parseInt(limit));

    res.json({ success: true, data: transactions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get inventory analytics/reporting
export const getInventoryAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.createdAt = {};
      if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
      if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
    }

    // Low stock items
    const allItems = await InventoryItem.find({ isActive: true });
    const lowStockItems = allItems.filter(item => item.currentStock <= item.minStock);

    // Total inventory value
    const totalValue = allItems.reduce((sum, item) => {
      return sum + (item.currentStock * item.costPerUnit);
    }, 0);

    // Transactions summary
    const transactions = await InventoryTransaction.find(dateFilter);
    const purchaseTotal = transactions
      .filter(t => t.type === 'purchase')
      .reduce((sum, t) => sum + (t.totalCost || 0), 0);
    const saleTotal = transactions
      .filter(t => t.type === 'sale')
      .reduce((sum, t) => sum + Math.abs(t.totalCost || 0), 0);

    // Most used items
    const itemUsage = {};
    transactions.filter(t => t.type === 'sale').forEach(t => {
      const itemId = t.inventoryItem.toString();
      itemUsage[itemId] = (itemUsage[itemId] || 0) + Math.abs(t.quantity);
    });

    const mostUsed = Object.entries(itemUsage)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([itemId, quantity]) => {
        const item = allItems.find(i => i._id.toString() === itemId);
        return item ? { item: item.name, quantity } : null;
      })
      .filter(Boolean);

    res.json({
      success: true,
      data: {
        totalItems: allItems.length,
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.map(item => ({
          id: item._id,
          name: item.name,
          currentStock: item.currentStock,
          minStock: item.minStock,
          unit: item.unit
        })),
        totalInventoryValue: totalValue,
        purchaseTotal,
        saleTotal,
        mostUsedItems: mostUsed
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

