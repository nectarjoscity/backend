import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Expense from '../models/Expense.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import InventoryItem from '../models/InventoryItem.js';
import MenuItem from '../models/MenuItem.js';

// Calculate Cost of Goods Sold (COGS) from inventory transactions
export const calculateCOGS = async (startDate, endDate) => {
  try {
    const dateFilter = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    // Get all sale transactions (negative quantity = items used)
    const saleTransactions = await InventoryTransaction.find({
      ...dateFilter,
      type: 'sale'
    }).populate('inventoryItem');

    const cogs = saleTransactions.reduce((total, transaction) => {
      return total + Math.abs(transaction.totalCost || 0);
    }, 0);

    return cogs;
  } catch (error) {
    console.error('Error calculating COGS:', error);
    throw error;
  }
};

// Generate Profit & Loss Statement
export const generateProfitLossStatement = async (startDate, endDate) => {
  try {
    const dateFilter = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    // REVENUE - Get completed orders
    const completedOrders = await Order.find({
      ...dateFilter,
      status: 'completed'
    });

    const totalRevenue = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // COST OF GOODS SOLD
    const cogs = await calculateCOGS(startDate, endDate);

    // GROSS PROFIT
    const grossProfit = totalRevenue - cogs;
    const grossProfitMargin = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

    // OPERATING EXPENSES - Get all expenses except inventory
    const operatingExpenses = await Expense.find({
      date: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      },
      category: { $ne: 'inventory' } // Exclude inventory as it's already in COGS
    });

    const expensesByCategory = {};
    let totalOperatingExpenses = 0;

    operatingExpenses.forEach(expense => {
      if (!expensesByCategory[expense.category]) {
        expensesByCategory[expense.category] = 0;
      }
      expensesByCategory[expense.category] += expense.amount;
      totalOperatingExpenses += expense.amount;
    });

    // NET PROFIT
    const netProfit = grossProfit - totalOperatingExpenses;
    const netProfitMargin = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

    return {
      period: { startDate, endDate },
      revenue: {
        totalRevenue,
        orderCount: completedOrders.length
      },
      cogs: {
        totalCogs: cogs,
        cogsPercentage: totalRevenue > 0 ? (cogs / totalRevenue) * 100 : 0
      },
      grossProfit: {
        amount: grossProfit,
        margin: grossProfitMargin
      },
      operatingExpenses: {
        byCategory: expensesByCategory,
        total: totalOperatingExpenses
      },
      netProfit: {
        amount: netProfit,
        margin: netProfitMargin
      }
    };
  } catch (error) {
    console.error('Error generating P&L statement:', error);
    throw error;
  }
};

// Generate Cash Flow Statement
export const generateCashFlowStatement = async (startDate, endDate) => {
  try {
    const dateFilter = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };

    // CASH INFLOWS - Revenue from completed orders
    const completedOrders = await Order.find({
      createdAt: dateFilter,
      status: 'completed'
    });

    const cashInflows = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // CASH OUTFLOWS - All expenses
    const expenses = await Expense.find({
      date: dateFilter
    });

    const cashOutflows = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    // NET CASH FLOW
    const netCashFlow = cashInflows - cashOutflows;

    // Breakdown by payment method
    const inflowsByPayment = {};
    completedOrders.forEach(order => {
      if (!inflowsByPayment[order.paymentMethod]) {
        inflowsByPayment[order.paymentMethod] = 0;
      }
      inflowsByPayment[order.paymentMethod] += order.totalAmount;
    });

    const outflowsByPayment = {};
    expenses.forEach(expense => {
      if (!outflowsByPayment[expense.paymentMethod]) {
        outflowsByPayment[expense.paymentMethod] = 0;
      }
      outflowsByPayment[expense.paymentMethod] += expense.amount;
    });

    return {
      period: { startDate, endDate },
      cashInflows: {
        total: cashInflows,
        byPaymentMethod: inflowsByPayment
      },
      cashOutflows: {
        total: cashOutflows,
        byPaymentMethod: outflowsByPayment
      },
      netCashFlow
    };
  } catch (error) {
    console.error('Error generating cash flow statement:', error);
    throw error;
  }
};

// Generate Revenue Analysis
export const generateRevenueAnalysis = async (startDate, endDate) => {
  try {
    const dateFilter = {
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate)
      }
    };

    // Get all completed orders with items
    const orders = await Order.find({
      ...dateFilter,
      status: 'completed'
    }).populate({
      path: 'orderItems',
      populate: {
        path: 'menuItem',
        populate: {
          path: 'category'
        }
      }
    });

    let totalRevenue = 0;
    const revenueByCategory = {};
    const revenueByItem = {};
    const revenueByDay = {};

    orders.forEach(order => {
      totalRevenue += order.totalAmount;
      
      // Revenue by day
      const dayKey = order.createdAt.toISOString().split('T')[0];
      if (!revenueByDay[dayKey]) {
        revenueByDay[dayKey] = 0;
      }
      revenueByDay[dayKey] += order.totalAmount;

      // Revenue by category and item
      order.orderItems.forEach(item => {
        const categoryName = item.menuItem?.category?.name || 'Uncategorized';
        const itemName = item.menuItem?.name || 'Unknown Item';
        const itemRevenue = item.price * item.quantity;

        // By category
        if (!revenueByCategory[categoryName]) {
          revenueByCategory[categoryName] = 0;
        }
        revenueByCategory[categoryName] += itemRevenue;

        // By item
        if (!revenueByItem[itemName]) {
          revenueByItem[itemName] = { revenue: 0, quantity: 0 };
        }
        revenueByItem[itemName].revenue += itemRevenue;
        revenueByItem[itemName].quantity += item.quantity;
      });
    });

    // Sort and get top performers
    const topCategories = Object.entries(revenueByCategory)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    const topItems = Object.entries(revenueByItem)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([name, data]) => ({ name, ...data }));

    return {
      period: { startDate, endDate },
      totalRevenue,
      orderCount: orders.length,
      averageOrderValue: orders.length > 0 ? totalRevenue / orders.length : 0,
      revenueByDay,
      topCategories: topCategories.map(([name, revenue]) => ({ name, revenue })),
      topItems
    };
  } catch (error) {
    console.error('Error generating revenue analysis:', error);
    throw error;
  }
};

// Calculate tax information
export const calculateTaxSummary = async (startDate, endDate) => {
  try {
    const dateFilter = {
      $gte: new Date(startDate),
      $lte: new Date(endDate)
    };

    // Total revenue (taxable income)
    const completedOrders = await Order.find({
      createdAt: dateFilter,
      status: 'completed'
    });

    const totalRevenue = completedOrders.reduce((sum, order) => sum + order.totalAmount, 0);

    // Total deductible expenses
    const expenses = await Expense.find({
      date: dateFilter
    });

    const totalExpenses = expenses.reduce((sum, expense) => sum + expense.amount, 0);

    // Taxable income
    const taxableIncome = totalRevenue - totalExpenses;

    // Nigerian tax rates (simplified - consult with accountant for actual rates)
    const corporateTaxRate = 0.30; // 30% for companies
    const vatRate = 0.075; // 7.5% VAT

    const estimatedCorporateTax = Math.max(0, taxableIncome * corporateTaxRate);
    const estimatedVAT = totalRevenue * vatRate;

    return {
      period: { startDate, endDate },
      totalRevenue,
      totalExpenses,
      taxableIncome,
      estimatedTaxes: {
        corporateTax: estimatedCorporateTax,
        vat: estimatedVAT,
        total: estimatedCorporateTax + estimatedVAT
      },
      note: "Tax calculations are estimates. Consult with a qualified accountant for accurate tax planning."
    };
  } catch (error) {
    console.error('Error calculating tax summary:', error);
    throw error;
  }
};