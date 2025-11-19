import mongoose from 'mongoose';

const OrderSchema = new mongoose.Schema(
  {
    user: { 
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
      enum: ['pending', 'confirmed', 'preparing', 'ready', 'delivered', 'cancelled', 'completed'],
      default: 'pending',
    },
    paymentMethod: {
      type: String,
      enum: ['cash', 'card', 'online'],
      default: 'cash',
    },
    table: { type: String, trim: true },
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