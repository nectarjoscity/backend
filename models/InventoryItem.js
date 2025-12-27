import mongoose from 'mongoose';

const InventoryItemSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  description: { type: String, trim: true },
  unit: {
    type: String,
    required: true,
    enum: ['kg', 'g', 'L', 'mL', 'cL', 'cup', 'tbsp', 'tsp', 'piece', 'pack', 'bottle', 'box', 'can', 'carton', 'bag', 'dozen'],
    default: 'piece'
  },
  currentStock: { type: Number, required: true, min: 0, default: 0 },
  minStock: { type: Number, required: true, min: 0, default: 0 }, // Low stock threshold
  maxStock: { type: Number, min: 0 }, // Optional max stock
  costPerUnit: { type: Number, required: true, min: 0, default: 0 }, // For accounting
  supplier: { type: String, trim: true },
  category: {
    type: String,
    trim: true,
    default: 'ingredient'
  },
  isActive: { type: Boolean, default: true },
  lastRestocked: { type: Date },
}, { timestamps: true });

export default mongoose.model('InventoryItem', InventoryItemSchema);

