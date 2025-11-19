import express from "express";
import { interpretQueryWithRAG } from "../services/ragService.js";
import { searchSimilar } from "../services/vectorStoreService.js";
import * as categoryController from "../controllers/categoryController.js";
import * as menuItemController from "../controllers/menuItemController.js";
import * as userController from "../controllers/userController.js";
import * as authController from "../controllers/authController.js";
import { getUserContext, formatUserContextForAI } from "../services/userContextService.js";
import session from './session.js'
import { optionalAuth } from './auth.js'
import UserPreference from '../models/UserPreference.js'
import Conversation from '../models/Conversation.js'
import Category from '../models/Category.js'
import Order from '../models/Order.js'
import User from '../models/User.js'
import dotenv from 'dotenv';

dotenv.config();

// Check which LLM to use: OpenAI (if available) > Rule-based fallback
const USE_OPENAI_LLM = process.env.USE_OPENAI_LLM !== 'false' && !!process.env.OPENAI_API_KEY;
const USE_LLM = USE_OPENAI_LLM;

const router = express.Router();
router.use(session);
router.use(optionalAuth); // Optional auth - sets req.user if token is present

// Mapping LLM output to controller handlers
const controllerMap = {
  category: {
    list: categoryController.getCategories,
    get: categoryController.getCategoryById,
    create: categoryController.createCategory,
    update: categoryController.updateCategory,
    delete: categoryController.deleteCategory,
  },
  menuItem: {
    list: menuItemController.getMenuItems,
    get: menuItemController.getMenuItemById,
    create: menuItemController.createMenuItem,
    update: menuItemController.updateMenuItem,
    delete: menuItemController.deleteMenuItem,
  },
  user: {
    list: userController.getAllUsers,
    get: userController.getUserById,
    create: userController.createUser,
    update: userController.updateUser,
    delete: userController.deleteUser,
  },
  auth: {
    login: authController.login,
    register: authController.register,
  },
};

/**
 * POST /api/nlp
 * Body: { text: string, messages?: Array<{role: 'user'|'assistant', content: string}> }
 *
 * Uses RAG (Retrieval-Augmented Generation) to interpret the text with context from vector store,
 * then routes to underlying controller.
 */
router.post("/nlp", async (req, res, next) => {
  try {
    const { text, messages = [] } = req.body || {};
    if (!text) return res.status(400).json({ error: "Text field is required" });

    const identity = { userId: req.user?.id || null, sessionId: req.sessionId || null };

    let pref = null;
    if (identity.userId) {
      pref = await UserPreference.findOne({ user: identity.userId });
    } else if (identity.sessionId) {
      pref = await UserPreference.findOne({ sessionId: identity.sessionId });
    }
    
    // Get recent products from previous successful searches and clarifications
    let recentProducts = [];
    let lastSuggestedProducts = [];
    try {
      const recentConvos = await Conversation.find({
        $or: [
          identity.userId ? { user: identity.userId } : {},
          identity.sessionId ? { sessionId: identity.sessionId } : {}
        ]
      })
        .sort({ createdAt: -1 })
        .limit(10) // Increased limit to ensure we get the "items" search result
        .lean();
      
      console.log('[DEBUG] Found', recentConvos.length, 'recent conversations');
      
      // Extract products from recent successful menu item searches
      recentConvos.forEach((conv, index) => {
        // Get suggested products from most recent clarification (if any)
        if (index === 0 && conv.result?.suggestedProducts && Array.isArray(conv.result.suggestedProducts)) {
          lastSuggestedProducts = conv.result.suggestedProducts.map(p => String(p).toLowerCase());
        }
        
        // PRIORITY 1: Extract from returnedItems (actual menu items that were shown to user)
        if (conv.result?.returnedItems && Array.isArray(conv.result.returnedItems)) {
          console.log('[DEBUG] Found returnedItems in conversation:', conv.result.returnedItems);
          conv.result.returnedItems.forEach(name => {
            const nameLower = String(name).toLowerCase().trim();
            if (nameLower && 
                nameLower.length > 1 && 
                nameLower.length < 50 &&
                !recentProducts.includes(nameLower)) {
              recentProducts.push(nameLower);
              console.log('[DEBUG] Added to recentProducts:', nameLower);
            }
          });
        }
        
        // PRIORITY 2: Extract from retrievedContext (products found in vector search)
        if (conv.result?.retrievedContext && Array.isArray(conv.result.retrievedContext)) {
          conv.result.retrievedContext.forEach(ctx => {
            if (ctx.name && typeof ctx.name === 'string') {
              const name = ctx.name.toLowerCase().trim();
              // Only add actual product names (not phrases)
              if (name && 
                  name.length > 1 && 
                  name.length < 30 &&
                  !name.match(/^(i\s+want|i'd\s+like|i'll\s+have|show\s+me|items|item|menu|search)/i) &&
                  !recentProducts.includes(name)) {
                recentProducts.push(name);
              }
            }
          });
        }
        
        // PRIORITY 3: Check the actual text of the conversation - if it contains menu item names
        // This helps capture products that were shown but not in retrievedContext
        if (conv.text && typeof conv.text === 'string') {
          const convText = conv.text.toLowerCase().trim();
          // Skip if it's a search query like "items", "show me", etc.
          if (!convText.match(/^(items|item|show|list|find|search|what|do\s+you\s+have|add|put|yes|no|thank)/i) &&
              convText.length > 1 && 
              convText.length < 50 &&
              convText.split(/\s+/).length <= 4) {
            // This might be a product name
            if (!recentProducts.includes(convText) && 
                !convText.match(/^(i\s+want|i'd\s+like|i'll\s+have)/i)) {
              recentProducts.push(convText);
            }
          }
        }
      });
    } catch (err) {
      // Ignore errors, just continue without product history
      console.warn('Error fetching recent products:', err.message);
    }
    
    // Prioritize suggested products from last clarification
    if (lastSuggestedProducts.length > 0) {
      recentProducts = [...lastSuggestedProducts, ...recentProducts.filter(p => !lastSuggestedProducts.includes(p))];
    }
    
    const memoryContext = {
      recentGoal: pref?.recentGoal || null,
      recentCuisinePreference: pref?.recentCuisinePreference || null,
      recentAllergies: pref?.recentAllergies || [],
      recentMainChoice: pref?.lastMainChoice || null,
      lastUserIntent: pref?.lastUserIntent || null,
      recentProducts: recentProducts.slice(0, 3) // Max 3 recent products
    };
    
    console.log('[DEBUG] memoryContext.recentProducts:', memoryContext.recentProducts);

    let result;
    // Deterministic pre-parser to prefer action mode for clear list intents
    const clarified = await preParse(text);
    if (clarified) {
      result = clarified;
      // Even with preParse, get RAG context for fallback information
      try {
        const retrievedDocs = await searchSimilar(text, {
          topK: 5,
          minScore: 0.3
        });
        result.retrievedContext = retrievedDocs.map(doc => ({
          name: doc.metadata?.name || doc.metadata?.section || '',
          content: doc.content || '',
          score: doc.score,
          documentId: doc.documentId,
          type: doc.metadata?.type || 'unknown'
        }));
      } catch (ragError) {
        console.error('Error getting RAG context:', ragError);
        // Continue without RAG context
      }
    } else {
      // Use RAG service for enhanced context-aware interpretation
      // If LLM is disabled or unavailable, use rule-based interpreter
      try {
        // Get user context if logged in
        let userContext = null;
        let user = null;
        if (req.user?.id) {
          user = await User.findById(req.user.id).lean();
          if (user) {
            userContext = await getUserContext(req.user.id);
          }
        }
        
        // Pass identity info and user context to RAG service
        const enhancedIdentity = {
          ...identity,
          user: user ? { id: user._id, name: user.name, email: user.email, username: user.username } : null,
          userContext: userContext
        };
        
        result = await interpretQueryWithRAG(text, messages, memoryContext, !USE_LLM, enhancedIdentity);
      } catch (ragError) {
        console.error('Error in RAG interpretation, falling back to rule-based interpreter:', ragError.message);
        
        // Fallback to rule-based interpreter (works without LLM)
        try {
          const retrievedDocs = await searchSimilar(text, {
            topK: 5,
            minScore: 0.3
          });
          const { interpretQueryRules } = await import('../services/ruleBasedInterpreter.js');
          result = await interpretQueryRules(text, messages, memoryContext, retrievedDocs);
        } catch (fallbackError) {
          console.error('Fallback interpreter also failed:', fallbackError.message);
          // Last resort: basic search
          result = clarified || {
            mode: 'action',
            targetService: 'menuItem',
            operation: 'list',
            filters: { search: text }
          };
          result.retrievedContext = [];
        }
      }
    }

    // Store conversation BEFORE processing response, so we can capture returned items
    const conversationDoc = await Conversation.create({
      user: identity.userId || null,
      sessionId: identity.sessionId || null,
      text,
      messages,
      result
    });
    
    // Store conversation ID in request for potential update after response
    req.conversationId = conversationDoc._id;

    const updates = {};
    if (result?.mode === 'action') {
      const s = (result?.filters?.search || '').toLowerCase();
      if (s.includes('healthy')) updates['tagsCount.healthy'] = (pref?.tagsCount?.healthy || 0) + 1;
      if (s.includes('spicy')) updates['tagsCount.spicy'] = (pref?.tagsCount?.spicy || 0) + 1;
      if (s.includes('sweet')) updates['tagsCount.sweet'] = (pref?.tagsCount?.sweet || 0) + 1;
      if (s.includes('light')) updates['tagsCount.light'] = (pref?.tagsCount?.light || 0) + 1;
    }

    const where = identity.userId ? { user: identity.userId } : { sessionId: identity.sessionId };
    if (identity.userId || identity.sessionId) {
      await UserPreference.findOneAndUpdate(
        where,
        {
          $setOnInsert: where,
          $set: {
            lastUserIntent: result?.mode || pref?.lastUserIntent
          },
          $inc: updates
        },
        { upsert: true, new: true }
      );
    }

    if (result?.mode === 'chat') {
      return res.status(200).json({ mode: 'chat', message: result.message || 'Okay.' });
    }
    if (result?.mode === 'clarify') {
      return res.status(200).json({ 
        mode: 'clarify', 
        needsClarification: true, 
        clarificationQuestion: result.clarificationQuestion || 'Could you clarify that?',
        message: result.message,
        suggestedProducts: result.suggestedProducts || []
      });
    }

    const { targetService, operation, filters = {}, retrievedContext } = result || {};
    
    if (!targetService || !operation) {
      // Check if it's a conversational query
      const lowerText = text.toLowerCase().trim();
      const isConversational = lowerText.match(/(?:can\s+i\s+talk|can\s+we\s+chat|how\s+are\s+you|tell\s+me\s+about|what\s+can\s+you\s+do|who\s+are\s+you|what\s+are\s+you|hi|hello|hey)/i);
      
      if (isConversational) {
        return res.status(200).json({ 
          mode: 'chat', 
          message: 'Of course! I\'m here to help you explore our menu, find dishes that suit your preferences, and assist with your order. What would you like to know?' 
        });
      }
      
      return res.status(400).json({ error: "Could not interpret user intent" });
    }

    // Store retrieved context for potential use in responses
    req.retrievedContext = retrievedContext || [];
    
    // Intercept menuItem list responses to store returned items in conversation
    // Store items BEFORE response is sent to ensure they're available for next request
    if (targetService === "menuItem" && operation === "list" && req.conversationId) {
      const originalJson = res.json.bind(res);
      res.json = async function(data) {
        // Extract menu item names from response and update conversation BEFORE sending response
        if (data && data.data && Array.isArray(data.data) && data.data.length > 0) {
          const itemNames = data.data
            .map(item => item.name)
            .filter(Boolean)
            .map(name => name.toLowerCase().trim());
          
          if (itemNames.length > 0) {
            console.log('[DEBUG] Storing returnedItems in conversation BEFORE response:', itemNames);
            // Update conversation with actual returned items - await to ensure it completes BEFORE sending response
            try {
              await Conversation.findByIdAndUpdate(req.conversationId, {
                $set: {
                  'result.returnedItems': itemNames
                }
              }, { new: false }); // Don't return updated doc, just update
              console.log('[DEBUG] Successfully stored returnedItems, now sending response');
            } catch (err) {
              console.warn('Error updating conversation with returned items:', err.message);
            }
          }
        }
        // Send response AFTER database update completes
        return originalJson(data);
      };
    }

    switch (targetService) {
      case "category":
        return await routeToCategory(operation, filters, req, res);
      case "menuItem":
        return await routeToMenuItems(operation, filters, req, res);
      case "user":
        return await routeToUsers(operation, filters, req, res);
      case "auth":
        return await routeToAuth(operation, filters, req, res);
      default:
        return res.status(400).json({ error: "Unknown target service" });
    }
  } catch (err) {
    next(err);
  }
});

async function preParse(text) {
  const lower = (text || '').toLowerCase().trim();
  
  // Don't pre-parse simple affirmative/negative responses - let RAG handle context
  // Also catch phrases like "yes i would", "yes please", "yes i'd like", etc.
  if (lower.match(/^(yes|yeah|yep|yup|sure|ok|okay|alright|no|nope|nah|don'?t|skip|cancel)$/i) ||
      lower.match(/^(yes\s+i\s+(would|will|want|am|do|can)|yes\s+please|yes\s+i'?d\s+(like|love|want)|that\s+sounds\s+good|i'?d\s+like\s+that|sure\s+(thing|i\s+would)|okay\s+(sure|i\s+would))$/i)) {
    return null; // Let RAG service handle with context
  }
  
  // Don't pre-parse informational queries - let RAG handle them intelligently
  // These queries should search the knowledge base, not categories or menu items
  if (lower.match(/(?:tell\s+me\s+more\s+about|tell\s+me\s+about|what\s+is|what'?s|describe|information\s+about|tell\s+me\s+more\s+on)\s+/i)) {
    console.log('[DEBUG preParse] Informational query detected, returning null for RAG handling. Text:', lower);
    return null; // Let RAG service handle informational queries (knowledge base search)
  }
  
  // Don't pre-parse conversational queries - let RAG handle them intelligently
  if (lower.match(/(?:can\s+i\s+talk|can\s+we\s+chat|how\s+are\s+you|what\s+can\s+you\s+do|who\s+are\s+you|what\s+are\s+you|hi|hello|hey)/i)) {
    return null; // Let RAG service handle conversational queries
  }
  
  // Don't pre-parse gratitude/acknowledgment phrases - let AI decide based on context
  if (lower.match(/^(thank\s+you|thanks|thank\s+you\s+very\s+much|thanks\s+a\s+lot|appreciate\s+it|much\s+appreciated)$/i)) {
    return null; // Let RAG service and AI handle with full conversation context
  }
  
  // Don't pre-parse "add it/them" responses - let RAG handle with context (these are responses to clarifications)
  // Match: "add it", "add it to cart", "add it to my cart", "add them", etc.
  // IMPORTANT: Check this BEFORE the generic "add X" pattern to avoid capturing "it to my cart" as item name
  // Test patterns: "add it", "add it to cart", "add it to my cart", "add it to the cart"
  // Fixed regex: (?:\s+to\s+(?:my\s+|the\s+)?cart)? properly handles " to my cart" and " to the cart"
  const addItPattern = /^add\s+(?:it|them)(?:\s+to\s+(?:my\s+|the\s+)?cart)?$/i;
  const putItPattern = /^put\s+(?:it|them)\s+in\s+(?:my\s+|the\s+)?cart$/i;
  const addToCartPattern = /^add\s+to\s+(?:my\s+|the\s+)?cart$/i;
  
  if (addItPattern.test(lower) || putItPattern.test(lower) || addToCartPattern.test(lower)) {
    console.log('[DEBUG preParse] Matched "add it" pattern, returning null for RAG handling. Text:', lower);
    return null; // Let RAG service handle with context
  }
  
  // Handle "add X" or "add X to cart" pattern - direct cart addition command (but not "add it" or "add them")
  // This regex uses a negative lookahead to ensure we don't match "add it" or "add them"
  const addXPattern = /^add\s+(?!it\s+to|them\s+to|it$|them$)(.+?)(?:\s+to\s+(?:my\s+|the\s+)?cart)?$/i;
  if (addXPattern.test(lower)) {
    const match = lower.match(/^add\s+(.+?)(?:\s+to\s+(?:my\s+|the\s+)?cart)?$/i);
    const itemName = match ? match[1].trim().replace(/[.,!?]+$/, '') : '';
    // Double-check: Skip if it's just "it" or "them" or starts with "it to" or "them to" (these are handled by RAG with context)
    if (itemName && 
        !itemName.match(/^(it|them)$/i) && 
        !itemName.match(/^(it|them)\s+to/i)) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: {
          search: itemName,
          addToCart: true // Flag to indicate this is for adding to cart
        }
      };
    }
  }
  
  // Handle "put X in cart" pattern
  if (lower.match(/^put\s+(.+?)\s+in\s+(?:my|the\s+)?cart$/i)) {
    const match = lower.match(/^put\s+(.+?)\s+in\s+(?:my|the\s+)?cart$/i);
    const itemName = match ? match[1].trim().replace(/[.,!?]+$/, '') : '';
    if (itemName && !itemName.match(/^(it|them)$/i)) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: {
          search: itemName,
          addToCart: true
        }
      };
    }
  }
  
  // Handle "I want to add X" pattern
  if (lower.match(/^(?:i\s+want\s+to|i'?d\s+like\s+to)\s+add\s+(.+?)(?:\s+to\s+(?:my|the\s+)?cart)?$/i)) {
    const match = lower.match(/^(?:i\s+want\s+to|i'?d\s+like\s+to)\s+add\s+(.+?)(?:\s+to\s+(?:my|the\s+)?cart)?$/i);
    const itemName = match ? match[1].trim().replace(/[.,!?]+$/, '') : '';
    if (itemName) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: {
          search: itemName,
          addToCart: true
        }
      };
    }
  }
  
  // Extract search term from common patterns
  let searchTerm = null;
  
  // Handle "I want X" pattern - very common for ordering
  if (lower.match(/^i\s+want\s+(.+)$/i) || lower.match(/^i'd\s+like\s+(.+)$/i) || lower.match(/^i'll\s+have\s+(.+)$/i)) {
    const match = lower.match(/(?:i\s+want|i'd\s+like|i'll\s+have)\s+(.+)$/i);
    searchTerm = match ? match[1].trim().replace(/[.,!?]+$/, '') : text.replace(/^(i\s+want|i'd\s+like|i'll\s+have)\s+/i, '').trim();
  }
  // Handle "what X do you have" pattern
  else if (lower.match(/what\s+\w+\s+do\s+you\s+have/i) || 
      lower.match(/what\s+\w+\s+are\s+available/i) ||
      lower.match(/show\s+me\s+\w+/i) ||
      lower.match(/do\s+you\s+have\s+\w+/i)) {
    const match = lower.match(/(?:what|show\s+me|do\s+you\s+have)\s+(\w+)/i);
    searchTerm = match ? match[1] : text.replace(/(?:what|show\s+me|do\s+you\s+have)\s+/i, '').trim();
  }
  // Handle simple product name queries (single word or short phrase)
  else {
    const words = lower.split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 3 && !lower.match(/^(what|how|when|where|why|show|list|find|get|give|can|do|is|are|will)/i)) {
      searchTerm = text.trim();
    }
  // simplistic determiner
    else if (lower.includes('show') || lower.includes('list') || lower.includes('find')) {
      searchTerm = text;
    }
  }
  
  // If we have a search term, check if it matches a category in the database
  if (searchTerm) {
    try {
      const searchLower = searchTerm.toLowerCase().trim();
      
      // Check if search term matches a category name
      let matchedCategory = await Category.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${searchLower}$`, 'i') }, isActive: true },
          { name: { $regex: new RegExp(searchLower, 'i') }, isActive: true }
        ]
      });
      
      // Also check singular/plural variations
      if (!matchedCategory) {
        const singular = searchLower.replace(/s$/, '');
        const plural = searchLower + 's';
        const variations = [singular, plural].filter(v => v !== searchLower);
        
        for (const variation of variations) {
          const cat = await Category.findOne({
            $or: [
              { name: { $regex: new RegExp(`^${variation}$`, 'i') }, isActive: true },
              { name: { $regex: new RegExp(variation, 'i') }, isActive: true }
            ]
          });
          
          if (cat) {
            matchedCategory = cat;
            break;
          }
        }
      }
      
      // If category found, use category filter instead of search
      if (matchedCategory) {
        return { 
          mode: 'action', 
          targetService: 'menuItem', 
          operation: 'list', 
          filters: { category: matchedCategory.name } 
        };
      }
    } catch (err) {
      // Ignore database errors, continue with search
      console.warn('Error checking category in preParse:', err.message);
    }
    
    // No category match, return search filter
    return { mode: 'action', targetService: 'menuItem', operation: 'list', filters: { search: searchTerm } };
  }
  
  return null;
}

async function routeToCategory(operation, filters, req, res) {
  // inject filters for downstream controllers
  req.deepseekFilters = filters || {};
  switch (operation) {
    case 'list':
      return categoryController.getCategories(req, res);
    case 'get':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      return categoryController.getCategoryById(req, res);
    case 'create':
      if (filters?.payload) req.body = { ...(req.body || {}), ...filters.payload };
      return categoryController.createCategory(req, res);
    case 'update':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      if (filters?.payload) req.body = { ...(req.body || {}), ...filters.payload };
      return categoryController.updateCategory(req, res);
    case 'delete':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      return categoryController.deleteCategory(req, res);
    default:
      return res.status(400).json({ error: 'Unsupported category operation' });
  }
}

async function routeToMenuItems(operation, filters, req, res) {
  req.deepseekFilters = filters || {};
  switch (operation) {
    case 'list':
      return menuItemController.getMenuItems(req, res);
    case 'get':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      return menuItemController.getMenuItemById(req, res);
    case 'create':
      if (filters?.payload) req.body = { ...(req.body || {}), ...filters.payload };
      return menuItemController.createMenuItem(req, res);
    case 'update':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      if (filters?.payload) req.body = { ...(req.body || {}), ...filters.payload };
      return menuItemController.updateMenuItem(req, res);
    case 'delete':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      return menuItemController.deleteMenuItem(req, res);
    default:
      return res.status(400).json({ error: 'Unsupported menuItem operation' });
  }
}

async function routeToAuth(operation, filters, req, res) {
  const handler = controllerMap.auth?.[operation];
  if (!handler) {
    return res.status(400).json({ error: `Unknown auth operation: ${operation}` });
  }
  
  // For login/register, pass the payload from filters
  if (filters.payload) {
    req.body = filters.payload;
  }
  
  // Intercept the response to include token in a format the frontend can use
  const originalJson = res.json.bind(res);
  res.json = function(data) {
    // If auth was successful, include token in response
    if (data.success && data.data?.token) {
      // Return in a format that includes both the message and token
      return originalJson({
        ...data,
        token: data.data.token, // Also include at top level for easy access
        user: data.data.user
      });
    }
    return originalJson(data);
  };
  
  return await handler(req, res);
}

async function routeToUsers(operation, filters, req, res) {
  req.deepseekFilters = filters || {};
  switch (operation) {
    case 'list':
      return userController.getAllUsers(req, res);
    case 'get':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      return userController.getUserById(req, res);
    case 'create':
      if (filters?.payload) req.body = { ...(req.body || {}), ...filters.payload };
      return userController.createUser(req, res);
    case 'update':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      if (filters?.payload) req.body = { ...(req.body || {}), ...filters.payload };
      return userController.updateUser(req, res);
    case 'delete':
      if (filters?.id) req.params = { ...(req.params || {}), id: String(filters.id) };
      return userController.deleteUser(req, res);
    default:
      return res.status(400).json({ error: 'Unsupported user operation' });
  }
}

export default router;