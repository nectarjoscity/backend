import express from 'express';
import * as InvoiceController from '../controllers/invoiceController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All invoice routes require authentication
router.use(authenticate);

// Routes accessible by admin and users with kitchen permission
// Create new invoice
router.post('/', InvoiceController.createInvoice);

// Get all invoices (filtered by role)
router.get('/', InvoiceController.getInvoices);

// Get invoice statistics
router.get('/stats', InvoiceController.getInvoiceStats);

// Get single invoice
router.get('/:id', InvoiceController.getInvoice);

// Update draft invoice
router.put('/:id', InvoiceController.updateInvoice);

// Submit invoice for approval
router.post('/:id/submit', InvoiceController.submitInvoice);

// Delete draft/rejected invoice
router.delete('/:id', InvoiceController.deleteInvoice);

// Admin-only routes
// Approve invoice
router.post('/:id/approve', authorize('admin'), InvoiceController.approveInvoice);

// Reject invoice
router.post('/:id/reject', authorize('admin'), InvoiceController.rejectInvoice);

export default router;
