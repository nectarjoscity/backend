import mongoose from 'mongoose';

const InvoiceItemSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    description: { type: String, trim: true },
    quantity: { type: Number, required: true, min: 0.01 },
    unit: {
        type: String,
        required: true,
        enum: ['kg', 'g', 'L', 'mL', 'piece', 'pack', 'bottle', 'box', 'carton'],
        default: 'piece'
    },
    unitPrice: { type: Number, required: true, min: 0 },
    totalPrice: { type: Number, required: true, min: 0 } // quantity * unitPrice
});

const InvoiceSchema = new mongoose.Schema({
    invoiceNumber: {
        type: String,
        unique: true,
        required: true
    },
    title: { type: String, required: true, trim: true }, // e.g., "Weekly Kitchen Supplies"
    items: [InvoiceItemSchema],
    totalAmount: { type: Number, required: true, min: 0, default: 0 },
    status: {
        type: String,
        enum: ['draft', 'pending', 'approved', 'rejected'],
        default: 'draft'
    },
    vendor: { type: String, trim: true }, // Supplier name
    notes: { type: String, trim: true },

    // Who created and when
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Approval tracking
    submittedAt: { type: Date }, // When submitted for approval
    approvedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    approvedAt: { type: Date },
    rejectedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    rejectedAt: { type: Date },
    rejectionReason: { type: String, trim: true },

    // Link to expense (created on approval)
    expenseId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Expense'
    }
}, { timestamps: true });

// Generate unique invoice number before validation
InvoiceSchema.pre('validate', async function (next) {
    if (this.isNew && !this.invoiceNumber) {
        const date = new Date();
        const year = date.getFullYear().toString().slice(-2);
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        // Count invoices created today to generate sequence
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayEnd = new Date();
        todayEnd.setHours(23, 59, 59, 999);

        const count = await mongoose.model('Invoice').countDocuments({
            createdAt: { $gte: todayStart, $lte: todayEnd }
        });

        const sequence = String(count + 1).padStart(3, '0');
        this.invoiceNumber = `INV-${year}${month}${day}-${sequence}`;
    }
    next();
});

// Calculate total amount from items
InvoiceSchema.pre('save', function (next) {
    if (this.items && this.items.length > 0) {
        this.totalAmount = this.items.reduce((sum, item) => {
            item.totalPrice = item.quantity * item.unitPrice;
            return sum + item.totalPrice;
        }, 0);
    }
    next();
});

// Indexes
InvoiceSchema.index({ invoiceNumber: 1 });
InvoiceSchema.index({ status: 1 });
InvoiceSchema.index({ createdBy: 1 });
InvoiceSchema.index({ createdAt: -1 });

export default mongoose.model('Invoice', InvoiceSchema);
