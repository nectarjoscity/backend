import mongoose from 'mongoose';

const categorySchema = new mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Category name is required'],
    trim: true,
    maxlength: [100, 'Category name cannot exceed 100 characters']
  },
  // Emotional display name for customer-facing UI (e.g., "Morning Rituals" instead of "Smoothies")
  displayName: {
    type: String,
    trim: true,
    maxlength: [100, 'Display name cannot exceed 100 characters'],
    default: null
  },
  // Short tagline for the category (e.g., "Start your day right")
  tagline: {
    type: String,
    trim: true,
    maxlength: [150, 'Tagline cannot exceed 150 characters'],
    default: null
  },
  description: {
    type: String,
    trim: true,
    maxlength: [300, 'Description cannot exceed 300 characters'],
    default: ''
  },
  emoji: {
    type: String,
    trim: true,
    maxlength: [10, 'Emoji string too long']
  },
  imageUrl: {
    type: String,
    trim: true,
    default: null
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
// Compound unique index: only active categories must have unique names
// This allows reusing names from soft-deleted categories
categorySchema.index({ name: 1, isActive: 1 }, {
  unique: true,
  partialFilterExpression: { isActive: true }
});
categorySchema.index({ createdAt: -1 });

const Category = mongoose.model('Category', categorySchema);

export default Category;