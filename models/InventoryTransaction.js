import mongoose from 'mongoose';

const InventoryTransactionSchema = new mongoose.Schema({
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true,
    index: true
  },
  type: {
    type: String,
    enum: ['purchase', 'sale', 'adjustment', 'waste', 'return'],
    required: true
  },
  quantity: { type: Number, required: true }, // Positive for purchase, negative for sale
  unit: { type: String, required: true },
  costPerUnit: { type: Number, min: 0 }, // Cost at time of transaction
  totalCost: { type: Number, min: 0 }, // quantity * costPerUnit
  order: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Order',
    index: true
  }, // Link to order if transaction is from order
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem'
  }, // Link to menu item if from order
  notes: { type: String, trim: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
}, { timestamps: true });

export default mongoose.model('InventoryTransaction', InventoryTransactionSchema);

