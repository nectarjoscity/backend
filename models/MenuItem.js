import mongoose from 'mongoose';

const { Schema } = mongoose;

const MenuItemSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    emoji: { type: String, trim: true },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, default: 'NGN' },
    imageUrl: { type: String, trim: true },
    isAvailable: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    category: { type: Schema.Types.ObjectId, ref: 'Category', required: true },
  },
  { timestamps: true }
);

// Prevent duplicate item names within the same category
MenuItemSchema.index({ name: 1, category: 1 }, { unique: true });

export default mongoose.model('MenuItem', MenuItemSchema);