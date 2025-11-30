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
      res.json = async function (data) {
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

  // CRITICAL: Check for credentials FIRST - don't treat them as menu searches
  const emailPasswordPattern = /^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s+([^\s]+)$/i;
  if (emailPasswordPattern.test(text)) {
    console.log('[DEBUG preParse] Detected email+password format, skipping preParse');
    return null;
  }
  if (text.match(/(?:username|email):\s*[^\s]+\s+password:\s*[^\s]+/i)) {
    console.log('[DEBUG preParse] Detected labeled credentials, skipping preParse');
    return null;
  }

  // ============================================================
  // SMART APPROACH: Only treat as search if it's an EXPLICIT action
  // Default to letting the AI handle conversational context
  // ============================================================

  // 1. EXPLICIT CART ACTIONS - these are clear commands
  const addItPattern = /^add\s+(?:it|them)(?:\s+to\s+(?:my\s+|the\s+)?cart)?$/i;
  const putItPattern = /^put\s+(?:it|them)\s+in\s+(?:my\s+|the\s+)?cart$/i;
  const addToCartPattern = /^add\s+to\s+(?:my\s+|the\s+)?cart$/i;

  if (addItPattern.test(lower) || putItPattern.test(lower) || addToCartPattern.test(lower)) {
    return null; // Let RAG handle with context (knows what "it" refers to)
  }

  // "add [specific item]" or "add [item] to cart"
  const addXMatch = lower.match(/^add\s+(?!it\s|them\s|it$|them$)(.+?)(?:\s+to\s+(?:my\s+|the\s+)?cart)?$/i);
  if (addXMatch) {
    const itemName = addXMatch[1].trim().replace(/[.,!?]+$/, '');
    if (itemName && itemName.length > 1) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: { search: itemName, addToCart: true }
      };
    }
  }

  // "put [item] in cart"
  const putXMatch = lower.match(/^put\s+(?!it\s|them\s)(.+?)\s+in\s+(?:my\s+|the\s+)?cart$/i);
  if (putXMatch) {
    const itemName = putXMatch[1].trim().replace(/[.,!?]+$/, '');
    if (itemName) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: { search: itemName, addToCart: true }
      };
    }
  }

  // 2. EXPLICIT SEARCH/BROWSE COMMANDS - user clearly wants to see menu items
  const explicitSearchPatterns = [
    /^show\s+(?:me\s+)?(?:the\s+)?(.+)$/i,           // "show me salads", "show drinks"
    /^(?:can\s+i\s+)?(?:see|view)\s+(?:the\s+)?(.+)$/i, // "see the menu", "view desserts"
    /^list\s+(?:all\s+)?(.+)$/i,                      // "list soups", "list all items"
    /^find\s+(.+)$/i,                                  // "find pasta"
    /^search\s+(?:for\s+)?(.+)$/i,                    // "search for chicken"
    /^(?:what|which)\s+(.+)\s+do\s+you\s+have/i,      // "what drinks do you have"
    /^do\s+you\s+have\s+(.+)/i,                       // "do you have pizza"
    /^(?:what's|whats)\s+(?:on\s+)?(?:the\s+)?menu/i, // "what's on the menu"
    /^(?:browse|explore)\s+(.+)$/i,                   // "browse desserts"
  ];

  for (const pattern of explicitSearchPatterns) {
    const match = lower.match(pattern);
    if (match) {
      const searchTerm = match[1]?.trim().replace(/[.,!?]+$/, '') || 'menu';
      console.log('[DEBUG preParse] Explicit search command:', searchTerm);
      
      // Check if it matches a category first
      try {
        const category = await Category.findOne({
          name: { $regex: new RegExp(searchTerm, 'i') },
          isActive: true
        });
        if (category) {
          return {
            mode: 'action',
            targetService: 'menuItem',
            operation: 'list',
            filters: { category: category.name }
          };
        }
      } catch (e) { /* ignore */ }

      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: { search: searchTerm }
      };
    }
  }

  // 3. ORDERING INTENT - "I want [item]", "I'd like [item]", "I'll have [item]"
  const orderMatch = lower.match(/^(?:i\s+want|i'd\s+like|i'll\s+have|get\s+me|give\s+me)\s+(.+)$/i);
  if (orderMatch) {
    const itemName = orderMatch[1].trim().replace(/[.,!?]+$/, '');
    // Make sure it doesn't look like a personal statement
    if (itemName && !itemName.match(/^(to\s+be|to\s+eat|to\s+lose|to\s+gain|to\s+know|healthy|better|some\s+help)/i)) {
      console.log('[DEBUG preParse] Order intent detected:', itemName);
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: { search: itemName }
      };
    }
  }

  // 4. SINGLE WORD that EXACTLY matches a category or menu item
  // Only do this for single words to avoid false positives
  const words = lower.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1 && lower.length > 2) {
    try {
      // Check categories
      const category = await Category.findOne({
        name: { $regex: new RegExp(`^${lower}s?$`, 'i') }, // Match singular or plural
        isActive: true
      });
      if (category) {
        console.log('[DEBUG preParse] Single word matches category:', category.name);
        return {
          mode: 'action',
          targetService: 'menuItem',
          operation: 'list',
          filters: { category: category.name }
        };
      }

      // Check menu items
      const MenuItem = (await import('../models/MenuItem.js')).default;
      const menuItem = await MenuItem.findOne({
        name: { $regex: new RegExp(lower, 'i') },
        isActive: true
      });
      if (menuItem) {
        console.log('[DEBUG preParse] Single word matches menu item:', menuItem.name);
        return {
          mode: 'action',
          targetService: 'menuItem',
          operation: 'list',
          filters: { search: lower }
        };
      }
    } catch (e) {
      console.warn('[DEBUG preParse] DB check error:', e.message);
    }
  }

  // 5. EVERYTHING ELSE → Let RAG/AI handle it intelligently
  // This includes:
  // - Personal statements ("I am diabetic", "I'm vegetarian")
  // - Greetings ("hello", "hi")
  // - Thanks ("thank you")
  // - Questions ("who are you", "how does this work")
  // - Context-dependent responses ("yes", "no", "that one")
  // - Anything else that's not an explicit search/action
  console.log('[DEBUG preParse] No explicit action detected, letting RAG handle:', lower);
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
  res.json = function (data) {
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