import mongoose from 'mongoose';

const ExpenseSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  amount: { type: Number, required: true, min: 0 },
  category: {
    type: String,
    enum: [
      'inventory',      // Inventory purchases
      'rent',           // Rent/lease payments
      'utilities',      // Electricity, water, internet
      'salaries',       // Employee wages
      'marketing',      // Advertising, promotions
      'maintenance',    // Equipment repairs, maintenance
      'insurance',      // Business insurance
      'taxes',          // Tax payments
      'supplies',       // Office supplies, cleaning supplies
      'professional',   // Legal, accounting fees
      'transportation', // Delivery, fuel costs
      'other'           // Miscellaneous
    ],
    required: true,
    default: 'other'
  },
  paymentMethod: {
    type: String,
    enum: ['cash', 'transfer', 'card', 'check'],
    default: 'transfer'
  },
  vendor: { type: String, trim: true }, // Supplier/vendor name
  receiptUrl: { type: String, trim: true }, // Receipt/document URL
  date: { type: Date, required: true, default: Date.now },
  notes: { type: String, trim: true },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  isRecurring: { type: Boolean, default: false }, // Recurring expense (rent, salaries)
  recurringFrequency: { // If recurring, how often
    type: String,
    enum: ['daily', 'weekly', 'monthly', 'yearly'],
    default: null
  },
}, { timestamps: true });

// Index for efficient date-based queries
ExpenseSchema.index({ date: -1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ createdAt: -1 });

export default mongoose.model('Expense', ExpenseSchema);



