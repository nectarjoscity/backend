import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null
    },
    waiter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      index: true,
      default: null
    },
    customerName: { type: String, required: true, trim: true },
    customerEmail: { type: String, trim: true },
    customerPhone: { type: String, trim: true },
    totalAmount: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'on-the-way', 'delivered', 'cancelled', 'completed'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'online'],
      default: 'cash',
    },
    paymentConfirmed: {
      type: Boolean,
      default: false,
    },
    paymentReference: {
      type: String,
      trim: true,
    },
    virtualAccountNumber: {
      type: String,
      trim: true,
    },
    virtualAccountName: {
      type: String,
      trim: true,
    },
    virtualAccountBank: {
      type: String,
      trim: true,
    },
    isPreOrder: {
      type: Boolean,
      default: false,
    },
    table: { type: String, trim: true },
    deliveryAddress: { type: String, trim: true },
    // Location tracking for analytics
    location: {
      latitude: { type: Number, default: null },
      longitude: { type: Number, default: null },
      accuracy: { type: Number, default: null },
    },
    orderItems: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'OrderItem',
      },
    ],
  },
  { timestamps: true }
);

const Order = mongoose.model('Order', OrderSchema);
export default Order;