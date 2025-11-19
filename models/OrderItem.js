import mongoose from 'mongoose';

const OrderItemSchema = new mongoose.Schema(
  {
    menuItem: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'MenuItem',
      required: true,
    },
    quantity: { type: Number, required: true, min: 1 },
    price: { type: Number, required: true, min: 0 },
    notes: { type: String, trim: true },
  },
  { timestamps: true }
);

const OrderItem = mongoose.model('OrderItem', OrderItemSchema);
export default OrderItem;