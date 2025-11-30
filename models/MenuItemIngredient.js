import mongoose from 'mongoose';

const MenuItemIngredientSchema = new mongoose.Schema({
  menuItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'MenuItem',
    required: true,
    index: true
  },
  inventoryItem: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'InventoryItem',
    required: true,
    index: true
  },
  quantity: { type: Number, required: true, min: 0 }, // Amount needed per serving
  unit: { type: String, required: true }, // Should match inventory item unit
}, { timestamps: true });

// Prevent duplicate ingredient assignments
MenuItemIngredientSchema.index({ menuItem: 1, inventoryItem: 1 }, { unique: true });

export default mongoose.model('MenuItemIngredient', MenuItemIngredientSchema);

