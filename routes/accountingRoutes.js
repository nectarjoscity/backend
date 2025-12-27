import express from 'express';
import * as AccountingController from '../controllers/accountingController.js';
import { authenticate, authorize } from '../middleware/auth.js';

const router = express.Router();

// All accounting routes require authentication and admin access
router.use(authenticate);
router.use(authorize('admin'));

// Expense management routes
router.post('/expenses', AccountingController.createExpense);
router.get('/expenses', AccountingController.getExpenses);
router.put('/expenses/:id', AccountingController.updateExpense);
router.delete('/expenses/:id', AccountingController.deleteExpense);
router.get('/expenses/analytics', AccountingController.getExpenseAnalytics);

// Financial reports routes
router.get('/reports/profit-loss', AccountingController.getProfitLossStatement);
router.get('/reports/cash-flow', AccountingController.getCashFlowStatement);
router.get('/reports/revenue-analysis', AccountingController.getRevenueAnalysis);
router.get('/reports/tax-summary', AccountingController.getTaxSummary);

// Dashboard overview
router.get('/dashboard', AccountingController.getDashboardMetrics);

// Menu profitability and food cost
router.get('/menu-profitability', AccountingController.getMenuProfitability);
router.get('/food-cost', AccountingController.getFoodCostAnalysis);

export default router;
