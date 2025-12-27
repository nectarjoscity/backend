import Order from '../models/Order.js';
import OrderItem from '../models/OrderItem.js';
import Expense from '../models/Expense.js';
import InventoryTransaction from '../models/InventoryTransaction.js';
import InventoryItem from '../models/InventoryItem.js';
import MenuItem from '../models/MenuItem.js';
import Staff from '../models/Staff.js';
import MenuItemIngredient from '../models/MenuItemIngredient.js';

// Default estimated food cost % for orders without inventory tracking
const DEFAULT_ESTIMATED_FOOD_COST_PERCENT = 32; // Industry standard: 28-35%

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

// Get Dashboard Overview Metrics
export const getDashboardMetrics = async () => {
  try {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    // Today's sales
    const todayOrders = await Order.find({
      createdAt: { $gte: today },
      status: 'completed'
    });
    const todaySales = todayOrders.reduce((sum, o) => sum + o.totalAmount, 0);
    const todayOrderCount = todayOrders.length;

    // Yesterday's sales
    const yesterdayOrders = await Order.find({
      createdAt: { $gte: yesterday, $lt: today },
      status: 'completed'
    });
    const yesterdaySales = yesterdayOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    // This week's sales
    const weekOrders = await Order.find({
      createdAt: { $gte: startOfWeek },
      status: 'completed'
    });
    const weekSales = weekOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    // This month's sales
    const monthOrders = await Order.find({
      createdAt: { $gte: startOfMonth },
      status: 'completed'
    });
    const monthSales = monthOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    // Last month's sales (for comparison)
    const lastMonthOrders = await Order.find({
      createdAt: { $gte: startOfLastMonth, $lte: endOfLastMonth },
      status: 'completed'
    });
    const lastMonthSales = lastMonthOrders.reduce((sum, o) => sum + o.totalAmount, 0);

    // This month's expenses
    const monthExpenses = await Expense.find({
      date: { $gte: startOfMonth }
    });
    const monthExpenseTotal = monthExpenses.reduce((sum, e) => sum + e.amount, 0);

    // Food Cost (COGS) - from inventory transactions this month
    const monthCogs = await calculateCOGS(startOfMonth.toISOString(), now.toISOString());
    const foodCostPercent = monthSales > 0 ? (monthCogs / monthSales) * 100 : 0;

    // Labor Cost - from active staff
    const activeStaff = await Staff.find({ isActive: true });
    const monthlyLaborCost = activeStaff.reduce((sum, staff) => {
      if (staff.paymentSchedule === 'monthly') return sum + staff.salary;
      if (staff.paymentSchedule === 'weekly') return sum + (staff.salary * 4);
      if (staff.paymentSchedule === 'daily') return sum + (staff.salary * 26);
      return sum;
    }, 0);
    const laborCostPercent = monthSales > 0 ? (monthlyLaborCost / monthSales) * 100 : 0;

    // Net Profit this month
    const monthNetProfit = monthSales - monthCogs - monthExpenseTotal;
    const netProfitMargin = monthSales > 0 ? (monthNetProfit / monthSales) * 100 : 0;

    // Low stock alerts
    const lowStockItems = await InventoryItem.find({
      isActive: true,
      $expr: { $lte: ['$currentStock', '$minStock'] }
    }).select('name currentStock minStock unit');

    // Calculate trends (vs yesterday/last month)
    const todayVsYesterday = yesterdaySales > 0
      ? ((todaySales - yesterdaySales) / yesterdaySales) * 100
      : todaySales > 0 ? 100 : 0;

    const monthVsLastMonth = lastMonthSales > 0
      ? ((monthSales - lastMonthSales) / lastMonthSales) * 100
      : monthSales > 0 ? 100 : 0;

    return {
      today: {
        sales: todaySales,
        orderCount: todayOrderCount,
        vsYesterday: todayVsYesterday
      },
      yesterday: {
        sales: yesterdaySales
      },
      thisWeek: {
        sales: weekSales,
        orderCount: weekOrders.length
      },
      thisMonth: {
        sales: monthSales,
        expenses: monthExpenseTotal,
        netProfit: monthNetProfit,
        netProfitMargin: netProfitMargin,
        orderCount: monthOrders.length,
        vsLastMonth: monthVsLastMonth
      },
      keyMetrics: {
        foodCostPercent: foodCostPercent.toFixed(1),
        laborCostPercent: laborCostPercent.toFixed(1),
        monthlyLaborCost,
        staffCount: activeStaff.length
      },
      alerts: {
        lowStockCount: lowStockItems.length,
        lowStockItems: lowStockItems.slice(0, 5) // Top 5
      },
      targets: {
        foodCostTarget: '28-35%',
        laborCostTarget: '25-35%',
        netMarginTarget: '10-20%'
      }
    };
  } catch (error) {
    console.error('Error getting dashboard metrics:', error);
    throw error;
  }
};

// Get Menu Item Profitability - cost and profit per dish
export const getMenuProfitability = async () => {
  try {
    // Get all active menu items with their ingredients
    const menuItems = await MenuItem.find({ isAvailable: true }).populate('category');

    const profitabilityData = await Promise.all(menuItems.map(async (item) => {
      // Get ingredients for this menu item
      const ingredients = await MenuItemIngredient.find({ menuItem: item._id })
        .populate('inventoryItem');

      // Calculate ingredient cost
      let ingredientCost = 0;
      const ingredientBreakdown = [];

      for (const ing of ingredients) {
        if (ing.inventoryItem) {
          const cost = (ing.inventoryItem.costPerUnit || 0) * ing.quantity;
          ingredientCost += cost;
          ingredientBreakdown.push({
            name: ing.inventoryItem.name,
            quantity: ing.quantity,
            unit: ing.unit,
            costPerUnit: ing.inventoryItem.costPerUnit || 0,
            totalCost: cost
          });
        }
      }

      // If no ingredients linked, use estimated cost
      const hasIngredients = ingredients.length > 0;
      const estimatedCost = hasIngredients ? ingredientCost : item.price * (DEFAULT_ESTIMATED_FOOD_COST_PERCENT / 100);
      const actualCost = hasIngredients ? ingredientCost : null;

      const profit = item.price - estimatedCost;
      const profitMargin = item.price > 0 ? (profit / item.price) * 100 : 0;
      const costPercent = item.price > 0 ? (estimatedCost / item.price) * 100 : 0;

      return {
        _id: item._id,
        name: item.name,
        category: item.category?.name || 'Uncategorized',
        price: item.price,
        ingredientCost: actualCost,
        estimatedCost: estimatedCost,
        hasIngredients,
        profit,
        profitMargin: profitMargin.toFixed(1),
        costPercent: costPercent.toFixed(1),
        ingredientCount: ingredients.length,
        ingredients: ingredientBreakdown
      };
    }));

    // Sort by profit margin (highest first)
    profitabilityData.sort((a, b) => parseFloat(b.profitMargin) - parseFloat(a.profitMargin));

    // Summary stats
    const withIngredients = profitabilityData.filter(p => p.hasIngredients);
    const withoutIngredients = profitabilityData.filter(p => !p.hasIngredients);
    const avgCostPercent = profitabilityData.length > 0
      ? profitabilityData.reduce((sum, p) => sum + parseFloat(p.costPercent), 0) / profitabilityData.length
      : 0;

    return {
      items: profitabilityData,
      summary: {
        totalItems: profitabilityData.length,
        itemsWithIngredients: withIngredients.length,
        itemsWithoutIngredients: withoutIngredients.length,
        averageCostPercent: avgCostPercent.toFixed(1),
        estimatedFoodCostUsed: DEFAULT_ESTIMATED_FOOD_COST_PERCENT
      }
    };
  } catch (error) {
    console.error('Error calculating menu profitability:', error);
    throw error;
  }
};

// Calculate food cost with fallback to estimated % for historical orders
export const calculateFoodCostWithEstimate = async (startDate, endDate) => {
  try {
    // First try to get actual COGS from inventory transactions
    const actualCogs = await calculateCOGS(startDate, endDate);

    // Get revenue for the period
    const orders = await Order.find({
      createdAt: { $gte: new Date(startDate), $lte: new Date(endDate) },
      status: 'completed'
    });
    const revenue = orders.reduce((sum, o) => sum + o.totalAmount, 0);

    // If we have actual COGS data, use it
    if (actualCogs > 0) {
      return {
        method: 'actual',
        cogs: actualCogs,
        revenue,
        foodCostPercent: revenue > 0 ? (actualCogs / revenue) * 100 : 0
      };
    }

    // Otherwise, estimate using default percentage
    const estimatedCogs = revenue * (DEFAULT_ESTIMATED_FOOD_COST_PERCENT / 100);
    return {
      method: 'estimated',
      cogs: estimatedCogs,
      revenue,
      foodCostPercent: DEFAULT_ESTIMATED_FOOD_COST_PERCENT,
      note: `No inventory data - using ${DEFAULT_ESTIMATED_FOOD_COST_PERCENT}% estimate`
    };
  } catch (error) {
    console.error('Error calculating food cost with estimate:', error);
    throw error;
  }
};