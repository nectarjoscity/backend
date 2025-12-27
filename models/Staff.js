import mongoose from 'mongoose';

const StaffSchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true },
    role: {
        type: String,
        required: true,
        trim: true,
        default: 'staff'
    },
    salary: { type: Number, required: true, min: 0 }, // Monthly salary in Naira
    phone: { type: String, trim: true },
    email: { type: String, trim: true },
    startDate: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true },
    paymentSchedule: {
        type: String,
        enum: ['monthly', 'weekly', 'daily'],
        default: 'monthly'
    },
    bankDetails: {
        bankName: { type: String, trim: true },
        accountNumber: { type: String, trim: true },
        accountName: { type: String, trim: true }
    },
    notes: { type: String, trim: true }
}, { timestamps: true });

export default mongoose.model('Staff', StaffSchema);
