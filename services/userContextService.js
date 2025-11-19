import UserPreference from '../models/UserPreference.js';
import Order from '../models/Order.js';
import Conversation from '../models/Conversation.js';

/**
 * Get user behavior context for AI personalization
 * @param {string} userId - User ID
 * @returns {Promise<Object>} User context including preferences, order history, and behavior patterns
 */
export async function getUserContext(userId) {
  if (!userId) return null;

  try {
    // Get user preferences
    const preferences = await UserPreference.findOne({ user: userId }).lean();
    
    // Get recent orders (last 10)
    const recentOrders = await Order.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('orderItems')
      .lean();
    
    // Get order statistics
    const totalOrders = await Order.countDocuments({ user: userId });
    const totalSpent = await Order.aggregate([
      { $match: { user: userId } },
      { $group: { _id: null, total: { $sum: '$totalAmount' } } }
    ]);
    
    // Extract favorite items from orders
    const favoriteItems = {};
    recentOrders.forEach(order => {
      if (order.orderItems && Array.isArray(order.orderItems)) {
        order.orderItems.forEach(item => {
          if (item.menuItem && item.menuItem.name) {
            const itemName = item.menuItem.name.toLowerCase();
            favoriteItems[itemName] = (favoriteItems[itemName] || 0) + (item.quantity || 1);
          }
        });
      }
    });
    
    // Get most ordered items
    const topItems = Object.entries(favoriteItems)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name]) => name);
    
    // Get conversation patterns
    const recentConversations = await Conversation.find({ user: userId })
      .sort({ createdAt: -1 })
      .limit(20)
      .lean();
    
    // Extract common search patterns
    const searchPatterns = {};
    recentConversations.forEach(conv => {
      const text = (conv.text || '').toLowerCase();
      if (text.length > 2 && text.length < 50) {
        searchPatterns[text] = (searchPatterns[text] || 0) + 1;
      }
    });
    
    return {
      preferences: preferences || {},
      orderHistory: {
        totalOrders,
        totalSpent: totalSpent[0]?.total || 0,
        recentOrders: recentOrders.slice(0, 5),
        favoriteItems: topItems
      },
      behavior: {
        commonSearches: Object.entries(searchPatterns)
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([term]) => term),
        conversationCount: recentConversations.length
      }
    };
  } catch (error) {
    console.error('Error getting user context:', error);
    return null;
  }
}

/**
 * Format user context for AI prompt
 * @param {Object} userContext - User context from getUserContext
 * @param {Object} user - User object with id, name, email, username
 * @returns {string} Formatted context string for AI
 */
export function formatUserContextForAI(userContext, user) {
  if (!userContext || !user) return '';
  
  const parts = [];
  
  // User info
  parts.push(`User: ${user.name}${user.username ? ` (@${user.username})` : ''}`);
  
  // Preferences
  if (userContext.preferences) {
    const pref = userContext.preferences;
    if (pref.diet?.allergies?.length > 0) {
      parts.push(`Allergies: ${pref.diet.allergies.join(', ')}`);
    }
    if (pref.diet?.likes?.length > 0) {
      parts.push(`Likes: ${pref.diet.likes.join(', ')}`);
    }
    if (pref.recentGoal) {
      parts.push(`Recent goal: ${pref.recentGoal}`);
    }
  }
  
  // Order history
  if (userContext.orderHistory) {
    const oh = userContext.orderHistory;
    if (oh.totalOrders > 0) {
      parts.push(`Total orders: ${oh.totalOrders}`);
      if (oh.favoriteItems.length > 0) {
        parts.push(`Favorite items: ${oh.favoriteItems.join(', ')}`);
      }
    }
  }
  
  // Behavior
  if (userContext.behavior?.commonSearches?.length > 0) {
    parts.push(`Common searches: ${userContext.behavior.commonSearches.join(', ')}`);
  }
  
  return parts.length > 0 ? `\n--- USER CONTEXT ---\n${parts.join('\n')}\n` : '';
}

