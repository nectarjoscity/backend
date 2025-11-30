import Expense from '../models/Expense.js';
import * as AccountingService from '../services/accountingService.js';

// Create a new expense
export const createExpense = async (req, res) => {
  try {
    const expenseData = {
      ...req.body,
      createdBy: req.user?.id
    };

    const expense = await Expense.create(expenseData);
    
    res.status(201).json({
      success: true,
      data: expense,
      message: 'Expense created successfully'
    });
  } catch (error) {
    console.error('Error creating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to create expense',
      error: error.message
    });
  }
};

// Get all expenses with filtering
export const getExpenses = async (req, res) => {
  try {
    const { 
      category, 
      startDate, 
      endDate, 
      paymentMethod,
      page = 1, 
      limit = 50,
      sortBy = 'date',
      sortOrder = 'desc'
    } = req.query;

    const filter = {};
    
    if (category) filter.category = category;
    if (paymentMethod) filter.paymentMethod = paymentMethod;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'asc' ? 1 : -1;

    const skip = (page - 1) * limit;
    
    const expenses = await Expense.find(filter)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('createdBy', 'name email');

    const total = await Expense.countDocuments(filter);

    res.json({
      success: true,
      data: expenses,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    console.error('Error fetching expenses:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expenses',
      error: error.message
    });
  }
};

// Update an expense
export const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const updateData = req.body;

    const expense = await Expense.findByIdAndUpdate(
      id,
      updateData,
      { new: true, runValidators: true }
    ).populate('createdBy', 'name email');

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      data: expense,
      message: 'Expense updated successfully'
    });
  } catch (error) {
    console.error('Error updating expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to update expense',
      error: error.message
    });
  }
};

// Delete an expense
export const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findByIdAndDelete(id);

    if (!expense) {
      return res.status(404).json({
        success: false,
        message: 'Expense not found'
      });
    }

    res.json({
      success: true,
      message: 'Expense deleted successfully'
    });
  } catch (error) {
    console.error('Error deleting expense:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to delete expense',
      error: error.message
    });
  }
};

// Get expense analytics
export const getExpenseAnalytics = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    const dateFilter = {};
    if (startDate || endDate) {
      dateFilter.date = {};
      if (startDate) dateFilter.date.$gte = new Date(startDate);
      if (endDate) dateFilter.date.$lte = new Date(endDate);
    }

    // Total expenses
    const totalExpenses = await Expense.aggregate([
      { $match: dateFilter },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]);

    // Expenses by category
    const expensesByCategory = await Expense.aggregate([
      { $match: dateFilter },
      { 
        $group: { 
          _id: '$category', 
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        } 
      },
      { $sort: { total: -1 } }
    ]);

    // Expenses by payment method
    const expensesByPayment = await Expense.aggregate([
      { $match: dateFilter },
      { 
        $group: { 
          _id: '$paymentMethod', 
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        } 
      }
    ]);

    // Monthly trend
    const monthlyTrend = await Expense.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: {
            year: { $year: '$date' },
            month: { $month: '$date' }
          },
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    res.json({
      success: true,
      data: {
        totalExpenses: totalExpenses[0]?.total || 0,
        expensesByCategory: expensesByCategory.map(item => ({
          category: item._id,
          total: item.total,
          count: item.count
        })),
        expensesByPayment: expensesByPayment.map(item => ({
          paymentMethod: item._id,
          total: item.total,
          count: item.count
        })),
        monthlyTrend: monthlyTrend.map(item => ({
          month: `${item._id.year}-${String(item._id.month).padStart(2, '0')}`,
          total: item.total,
          count: item.count
        }))
      }
    });
  } catch (error) {
    console.error('Error fetching expense analytics:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch expense analytics',
      error: error.message
    });
  }
};

// Generate Profit & Loss Statement
export const getProfitLossStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const statement = await AccountingService.generateProfitLossStatement(startDate, endDate);
    
    res.json({
      success: true,
      data: statement
    });
  } catch (error) {
    console.error('Error generating P&L statement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate P&L statement',
      error: error.message
    });
  }
};

// Generate Cash Flow Statement
export const getCashFlowStatement = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const statement = await AccountingService.generateCashFlowStatement(startDate, endDate);
    
    res.json({
      success: true,
      data: statement
    });
  } catch (error) {
    console.error('Error generating cash flow statement:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate cash flow statement',
      error: error.message
    });
  }
};

// Generate Revenue Analysis
export const getRevenueAnalysis = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const analysis = await AccountingService.generateRevenueAnalysis(startDate, endDate);
    
    res.json({
      success: true,
      data: analysis
    });
  } catch (error) {
    console.error('Error generating revenue analysis:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to generate revenue analysis',
      error: error.message
    });
  }
};

// Get Tax Summary
export const getTaxSummary = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    
    if (!startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'Start date and end date are required'
      });
    }

    const taxSummary = await AccountingService.calculateTaxSummary(startDate, endDate);
    
    res.json({
      success: true,
      data: taxSummary
    });
  } catch (error) {
    console.error('Error calculating tax summary:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to calculate tax summary',
      error: error.message
    });
  }
};
