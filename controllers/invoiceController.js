import Invoice from '../models/Invoice.js';
import Expense from '../models/Expense.js';

// Create a new invoice (draft or pending)
export const createInvoice = async (req, res) => {
    try {
        const { title, items, vendor, notes, submitForApproval } = req.body;

        if (!items || items.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Invoice must have at least one item'
            });
        }

        const invoiceData = {
            title,
            items,
            vendor,
            notes,
            createdBy: req.user.id,
            status: submitForApproval ? 'pending' : 'draft',
            submittedAt: submitForApproval ? new Date() : null
        };

        const invoice = await Invoice.create(invoiceData);

        const populatedInvoice = await Invoice.findById(invoice._id)
            .populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            data: populatedInvoice,
            message: submitForApproval
                ? 'Invoice created and submitted for approval'
                : 'Invoice draft created successfully'
        });
    } catch (error) {
        console.error('Error creating invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create invoice',
            error: error.message
        });
    }
};

// Get all invoices with filtering
export const getInvoices = async (req, res) => {
    try {
        const {
            status,
            startDate,
            endDate,
            createdBy,
            page = 1,
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        const filter = {};

        // Filter by status
        if (status) filter.status = status;

        // Filter by date range
        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        // If not admin, only show their own invoices
        if (req.user.role !== 'admin') {
            filter.createdBy = req.user.id;
        } else if (createdBy) {
            filter.createdBy = createdBy;
        }

        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

        const skip = (page - 1) * limit;

        const invoices = await Invoice.find(filter)
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('rejectedBy', 'name email');

        const total = await Invoice.countDocuments(filter);

        res.json({
            success: true,
            data: invoices,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching invoices:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invoices',
            error: error.message
        });
    }
};

// Get single invoice
export const getInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('rejectedBy', 'name email')
            .populate('expenseId');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Non-admin can only view their own invoices
        if (req.user.role !== 'admin' && invoice.createdBy._id.toString() !== req.user.id) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to view this invoice'
            });
        }

        res.json({
            success: true,
            data: invoice
        });
    } catch (error) {
        console.error('Error fetching invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invoice',
            error: error.message
        });
    }
};

// Update invoice (only draft status)
export const updateInvoice = async (req, res) => {
    try {
        const { title, items, vendor, notes } = req.body;

        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Only creator or admin can update
        if (invoice.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to update this invoice'
            });
        }

        // Cannot edit approved invoices
        if (invoice.status === 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Approved invoices cannot be edited'
            });
        }

        // Update fields
        if (title) invoice.title = title;
        if (items) invoice.items = items;
        if (vendor !== undefined) invoice.vendor = vendor;
        if (notes !== undefined) invoice.notes = notes;

        await invoice.save();

        const updatedInvoice = await Invoice.findById(invoice._id)
            .populate('createdBy', 'name email');

        res.json({
            success: true,
            data: updatedInvoice,
            message: 'Invoice updated successfully'
        });
    } catch (error) {
        console.error('Error updating invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update invoice',
            error: error.message
        });
    }
};

// Submit invoice for approval
export const submitInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        if (invoice.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to submit this invoice'
            });
        }

        if (invoice.status !== 'draft') {
            return res.status(400).json({
                success: false,
                message: 'Only draft invoices can be submitted'
            });
        }

        invoice.status = 'pending';
        invoice.submittedAt = new Date();
        await invoice.save();

        const updatedInvoice = await Invoice.findById(invoice._id)
            .populate('createdBy', 'name email');

        res.json({
            success: true,
            data: updatedInvoice,
            message: 'Invoice submitted for approval'
        });
    } catch (error) {
        console.error('Error submitting invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit invoice',
            error: error.message
        });
    }
};

// Approve invoice (admin only)
export const approveInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id)
            .populate('createdBy', 'name email');

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        if (invoice.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending invoices can be approved'
            });
        }

        // Create expense record
        const expense = await Expense.create({
            description: `Invoice ${invoice.invoiceNumber}: ${invoice.title}`,
            amount: invoice.totalAmount,
            category: 'inventory',
            paymentMethod: 'transfer', // Default, can be updated later
            vendor: invoice.vendor,
            date: new Date(),
            notes: `Approved invoice from ${invoice.createdBy.name}. Invoice #${invoice.invoiceNumber}`,
            createdBy: req.user.id
        });

        // Update invoice
        invoice.status = 'approved';
        invoice.approvedBy = req.user.id;
        invoice.approvedAt = new Date();
        invoice.expenseId = expense._id;
        await invoice.save();

        const updatedInvoice = await Invoice.findById(invoice._id)
            .populate('createdBy', 'name email')
            .populate('approvedBy', 'name email')
            .populate('expenseId');

        res.json({
            success: true,
            data: updatedInvoice,
            message: 'Invoice approved and expense recorded'
        });
    } catch (error) {
        console.error('Error approving invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to approve invoice',
            error: error.message
        });
    }
};

// Reject invoice (admin only)
export const rejectInvoice = async (req, res) => {
    try {
        const { reason } = req.body;

        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        if (invoice.status !== 'pending') {
            return res.status(400).json({
                success: false,
                message: 'Only pending invoices can be rejected'
            });
        }

        invoice.status = 'rejected';
        invoice.rejectedBy = req.user.id;
        invoice.rejectedAt = new Date();
        invoice.rejectionReason = reason || 'No reason provided';
        await invoice.save();

        const updatedInvoice = await Invoice.findById(invoice._id)
            .populate('createdBy', 'name email')
            .populate('rejectedBy', 'name email');

        res.json({
            success: true,
            data: updatedInvoice,
            message: 'Invoice rejected'
        });
    } catch (error) {
        console.error('Error rejecting invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to reject invoice',
            error: error.message
        });
    }
};

// Delete invoice (only drafts)
export const deleteInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);

        if (!invoice) {
            return res.status(404).json({
                success: false,
                message: 'Invoice not found'
            });
        }

        // Only creator or admin can delete
        if (invoice.createdBy.toString() !== req.user.id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to delete this invoice'
            });
        }

        // Cannot delete approved invoices (they are linked to expenses)
        if (invoice.status === 'approved') {
            return res.status(400).json({
                success: false,
                message: 'Approved invoices cannot be deleted as they are linked to expense records'
            });
        }

        await Invoice.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Invoice deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting invoice:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete invoice',
            error: error.message
        });
    }
};

// Get invoice statistics
export const getInvoiceStats = async (req, res) => {
    try {
        const filter = {};

        // Non-admin only see their own stats
        if (req.user.role !== 'admin') {
            filter.createdBy = req.user.id;
        }

        const [stats] = await Invoice.aggregate([
            { $match: filter },
            {
                $group: {
                    _id: null,
                    totalInvoices: { $sum: 1 },
                    totalAmount: { $sum: '$totalAmount' },
                    draft: {
                        $sum: { $cond: [{ $eq: ['$status', 'draft'] }, 1, 0] }
                    },
                    pending: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] }
                    },
                    approved: {
                        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] }
                    },
                    rejected: {
                        $sum: { $cond: [{ $eq: ['$status', 'rejected'] }, 1, 0] }
                    },
                    approvedAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$totalAmount', 0] }
                    },
                    pendingAmount: {
                        $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$totalAmount', 0] }
                    }
                }
            }
        ]);

        res.json({
            success: true,
            data: stats || {
                totalInvoices: 0,
                totalAmount: 0,
                draft: 0,
                pending: 0,
                approved: 0,
                rejected: 0,
                approvedAmount: 0,
                pendingAmount: 0
            }
        });
    } catch (error) {
        console.error('Error fetching invoice stats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch invoice statistics',
            error: error.message
        });
    }
};
