import { generateText } from 'ai';
import dotenv from 'dotenv';
import openai from '../config/openai.js';
import { searchSimilar } from './vectorStoreService.js';
import { interpretQueryRules } from './ruleBasedInterpreter.js';
import Category from '../models/Category.js';

dotenv.config();

// Determine which LLM to use: OpenAI if available, otherwise rule-based fallback
const USE_OPENAI_LLM = process.env.USE_OPENAI_LLM !== 'false' && !!process.env.OPENAI_API_KEY;

// Get the appropriate model
let modelProvider = null;
function getLLMModel() {
  if (USE_OPENAI_LLM) {
    if (!modelProvider) {
      modelProvider = 'OpenAI';
      console.log('✓ Using OpenAI GPT-4o-mini for text generation');
    }
    return openai('gpt-4o-mini'); // Using gpt-4o-mini for cost-effectiveness, can be changed to gpt-4o or gpt-3.5-turbo
  }
  if (!modelProvider) {
    modelProvider = 'Rule-based';
    console.log('⚠ No OpenAI API key found, using rule-based interpreter');
  }
  return null; // Will fallback to rule-based interpreter
}

const ALLOWED_SERVICES = ['category', 'menuItem', 'user', 'order'];
const ALLOWED_OPERATIONS = ['list', 'get', 'create', 'update', 'delete'];
const ALLOWED_MODES = ['action', 'chat', 'clarify'];

/**
 * Build context from retrieved documents
 * @param {Array} retrievedDocs - Retrieved documents with scores
 * @returns {string} - Formatted context string
 */
function buildContext(retrievedDocs) {
  if (!retrievedDocs || retrievedDocs.length === 0) {
    return '';
  }

  const contextParts = retrievedDocs.map((doc, index) => {
    const { content, metadata, score } = doc;
    let context = `[${index + 1}] ${content}`;
    
    if (metadata.name) {
      context += ` (Name: ${metadata.name})`;
    }
    if (metadata.price !== undefined) {
      context += ` (Price: ${metadata.currency || 'NGN'} ${metadata.price})`;
    }
    if (metadata.category) {
      context += ` (Category: ${metadata.category})`;
    }
    if (metadata.description) {
      context += ` - ${metadata.description}`;
    }
    
    return context;
  });

  return `\n\n--- RELEVANT MENU INFORMATION ---\n${contextParts.join('\n\n')}\n`;
}

/**
 * RAG-enhanced query interpretation
 * @param {string} userText - User query text
 * @param {Array} messages - Conversation history
 * @param {Object} memoryContext - User memory/preferences context
 * @returns {Promise<Object>} - Interpreted query result
 */
export async function interpretQueryWithRAG(userText, messages = [], memoryContext = {}, useRulesOnly = false, identity = {}) {
  // CRITICAL: Check for informational queries FIRST (before "add it" pattern)
  // These queries should use the knowledge base directly, not be interpreted as actions
  const lowerText = (userText || '').toLowerCase().trim();
  const pronouns = ['it', 'them', 'this', 'that', 'these', 'those'];
  
  // Check if user is logged in
  const isLoggedIn = !!identity.userId;
  
  // Check if this is a greeting (first message or after long gap)
  const isGreeting = lowerText.match(/^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening))$/i);
  const isFirstMessage = messages.length === 0 || messages.filter(m => m.role === 'user').length === 0;
  
  // After greeting, if user is not logged in, ask about account
  if ((isGreeting || isFirstMessage) && !isLoggedIn) {
    const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
    const wasAskedAboutAccount = lastAssistantMessage?.content?.toLowerCase().includes('account');
    
    if (!wasAskedAboutAccount) {
      return {
        mode: 'chat',
        message: 'Hello! Welcome to NectarV! 👋\n\nDo you have an account with us? If yes, you can log in to get personalized recommendations based on your order history. If not, would you like to create one?',
        needsClarification: true,
        clarificationQuestion: 'Do you have an account? (yes/no) or would you like to create one?'
      };
    }
  }
  
  // Handle account-related queries
  // Check if last message asked about account
  const lastAssistantMsgForAccount = messages.filter(m => m.role === 'assistant').pop();
  const wasAskedAboutAccount = lastAssistantMsgForAccount?.content?.toLowerCase().includes('account') || 
                                lastAssistantMsgForAccount?.content?.toLowerCase().includes('do you have');
  
  // Check for affirmative/negative response to account question
  const isAccountAffirmative = lowerText.match(/^(yes|yeah|yep|yup|sure|ok|okay|alright)$/i);
  const isAccountNegative = lowerText.match(/^(no|nope|nah|don'?t)$/i);
  
  // If asked about account and user says "yes", they want to login
  if (wasAskedAboutAccount && isAccountAffirmative && !isLoggedIn) {
    return {
      mode: 'chat',
      message: 'Great! Please provide your username or email and password to log in.\n\nYou can send them like: "username: myusername password: mypassword" or "email: myemail@example.com password: mypassword"',
      needsClarification: true,
      clarificationQuestion: 'Please provide your username/email and password'
    };
  }
  
  // If asked about account and user says "no", ask if they want to create one
  if (wasAskedAboutAccount && isAccountNegative && !isLoggedIn) {
    return {
      mode: 'chat',
      message: 'No problem! Would you like to create an account? It only takes a moment and I can provide personalized recommendations based on your preferences.',
      needsClarification: true,
      clarificationQuestion: 'Would you like to create an account? (yes/no)'
    };
  }
  
  // CRITICAL: Check for login credentials EARLY, before any other processing
  // This must happen before search interpretation to prevent credentials from being treated as search queries
  if (!isLoggedIn) {
    const lastMsgForLogin = messages.filter(m => m.role === 'assistant').pop();
    const lastMsgContent = lastMsgForLogin?.content?.toLowerCase() || '';
    const wasAskedForCredentials = lastMsgContent.includes('username') || 
                                    lastMsgContent.includes('password') ||
                                    lastMsgContent.includes('log in') ||
                                    lastMsgContent.includes('provide') ||
                                    lastMsgContent.includes('send them');
    
    // Use original text (not lowercased) for email matching to preserve case
    const originalText = (userText || '').trim();
    
    console.log('[DEBUG RAG] 🔐 CREDENTIAL CHECK START:', {
      isLoggedIn,
      wasAskedForCredentials,
      lastMsgPreview: lastMsgContent.substring(0, 150),
      originalText: originalText.substring(0, 50),
      messagesCount: messages.length
    });
    
    // Format 1: "username: myuser password: mypass" or "email: my@email.com password: mypass"
    const loginMatch1 = originalText.match(/(?:username|email):\s*([^\s]+)\s+password:\s*([^\s]+)/i);
    
    // Format 2: "email@domain.com password" (email contains @, password is next word)
    // More flexible pattern: allows for various email formats
    const loginMatch2 = originalText.match(/^([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\s+(.+)$/i);
    
    // Format 3: "identifier password" (if asked for credentials - could be username or email)
    // This should catch simple "email password" format when credentials were requested
    const loginMatch3 = originalText.match(/^([^\s]+)\s+(.+)$/);
    
    let loginData = null;
    
    console.log('[DEBUG RAG] Pattern matching results:', {
      loginMatch1: loginMatch1 ? `MATCH: ${loginMatch1[1]}` : 'NO MATCH',
      loginMatch2: loginMatch2 ? `MATCH: ${loginMatch2[1]}` : 'NO MATCH',
      loginMatch3: loginMatch3 ? `MATCH: ${loginMatch3[1]} ${loginMatch3[2]}` : 'NO MATCH'
    });
    
    if (loginMatch1) {
      // Explicit format with labels
      loginData = {
        username: loginMatch1[1],
        email: loginMatch1[1].includes('@') ? loginMatch1[1] : null,
        password: loginMatch1[2]
      };
      console.log('[DEBUG RAG] ✅ Matched Format 1 (explicit labels)');
    } else if (loginMatch2) {
      // Email format (contains @ and domain) - most reliable
      loginData = {
        email: loginMatch2[1],
        password: loginMatch2[2].trim()
      };
      console.log('[DEBUG RAG] ✅ Matched Format 2 (email pattern):', loginMatch2[1]);
    } else if (loginMatch3 && wasAskedForCredentials) {
      // Simple format - only if we were asked for credentials
      // Check if first part looks like email
      const firstPart = loginMatch3[1];
      const secondPart = loginMatch3[2].trim();
      
      console.log('[DEBUG RAG] Format 3 check:', { firstPart, secondPart, hasAt: firstPart.includes('@'), hasDot: firstPart.match(/@.+\..+/) });
      
      // Email pattern: contains @ and at least one dot after @
      if (firstPart.includes('@') && firstPart.match(/@.+\..+/)) {
        // It's an email
        loginData = {
          email: firstPart,
          password: secondPart
        };
        console.log('[DEBUG RAG] ✅ Matched Format 3 (email detected):', firstPart);
      } else if (firstPart.length > 0 && secondPart.length > 0) {
        // Could be username (only if we were explicitly asked for credentials)
        loginData = {
          username: firstPart,
          password: secondPart
        };
        console.log('[DEBUG RAG] ✅ Matched Format 3 (username detected):', firstPart);
      }
    }
    
    if (loginData) {
      console.log('[DEBUG RAG] 🎯 RETURNING LOGIN ACTION:', { email: loginData.email, username: loginData.username, hasPassword: !!loginData.password });
      return {
        mode: 'action',
        targetService: 'auth',
        operation: 'login',
        filters: {
          payload: loginData
        },
        message: 'Logging you in...'
      };
    } else {
      console.log('[DEBUG RAG] ❌ No login credentials detected, continuing with normal flow');
    }
  }
  
  const wantsToLogin = lowerText.match(/(?:i\s+have\s+an\s+account|yes\s+i\s+have|yes\s+i\s+do|i\s+want\s+to\s+login|login|sign\s+in)/i);
  const wantsToRegister = lowerText.match(/(?:i\s+want\s+to\s+create|create\s+account|register|sign\s+up|i\s+don'?t\s+have|no\s+i\s+don'?t)/i);
  const wantsToSkip = lowerText.match(/(?:no\s+thanks|not\s+now|skip|continue\s+without|maybe\s+later)/i);
  
  if (wantsToLogin && !isLoggedIn) {
    return {
      mode: 'chat',
      message: 'Great! Please provide your username or email and password to log in.\n\nYou can send them like: "username: myusername password: mypassword" or "email: myemail@example.com password: mypassword"',
      needsClarification: true,
      clarificationQuestion: 'Please provide your username/email and password'
    };
  }
  
  if (wantsToRegister && !isLoggedIn) {
    return {
      mode: 'chat',
      message: 'Excellent! To create an account, I\'ll need:\n- Your name\n- Email address\n- Password (at least 6 characters)\n- Username (optional)\n\nYou can provide them like: "name: John Doe email: john@example.com password: mypassword username: johndoe"',
      needsClarification: true,
      clarificationQuestion: 'Please provide your name, email, password, and optionally username'
    };
  }
  
  if (wantsToSkip && !isLoggedIn) {
    return {
      mode: 'chat',
      message: 'No problem! You can continue browsing as a guest. If you change your mind later, just let me know and we can set up an account. How can I help you today?',
    };
  }
  
  // Handle registration credentials - multiple formats
  // Format 1: "name: John email: john@example.com password: pass username: john"
  // Format 2: "John john@example.com pass john" (if asked for registration)
  const registerMatch1 = lowerText.match(/(?:name):\s*([^,]+)(?:,\s*)?(?:email):\s*([^\s,]+)(?:,\s*)?(?:password):\s*([^\s,]+)(?:,\s*)?(?:username):\s*([^\s,]+)?/i);
  const registerMatch2 = lowerText.match(/^([^@]+)\s+([^\s@]+@[^\s]+)\s+([^\s]+)(?:\s+([^\s]+))?$/); // name email password [username]
  
  if (!isLoggedIn) {
    let registerData = null;
    if (registerMatch1) {
      registerData = {
        name: registerMatch1[1]?.trim(),
        email: registerMatch1[2]?.trim(),
        password: registerMatch1[3]?.trim(),
        username: registerMatch1[4]?.trim() || null
      };
    } else if (registerMatch2 && messages.length > 0) {
      // Only use simple format if we were asked for registration
      const lastMsg = messages.filter(m => m.role === 'assistant').pop();
      if (lastMsg?.content?.toLowerCase().includes('create') || lastMsg?.content?.toLowerCase().includes('account')) {
        registerData = {
          name: registerMatch2[1]?.trim(),
          email: registerMatch2[2]?.trim(),
          password: registerMatch2[3]?.trim(),
          username: registerMatch2[4]?.trim() || null
        };
      }
    }
    
    if (registerData && registerData.name && registerData.email && registerData.password) {
      return {
        mode: 'action',
        targetService: 'auth',
        operation: 'register',
        filters: {
          payload: registerData
        },
        message: 'Creating your account...'
      };
    }
  }
  
  const toTitleCase = (name = '') => name.split(/\s+/).map(word => word ? word.charAt(0).toUpperCase() + word.slice(1) : '').join(' ').trim();
  
  const resolveItemName = (candidate = '') => {
    let itemName = (candidate || '').trim();
    const isPronoun = !itemName || pronouns.includes(itemName.toLowerCase());
    
    if (!isPronoun) {
      return itemName;
    }
    
    console.log('[DEBUG RAG] Pronoun or missing item detected, attempting to resolve from context. Candidate:', candidate);
    
    // Strategy 1: Check memory context (recent products)
    if (memoryContext?.recentProducts && memoryContext.recentProducts.length > 0) {
      console.log('[DEBUG RAG] Using item from memoryContext.recentProducts:', memoryContext.recentProducts[0]);
      return memoryContext.recentProducts[0];
    }
    
    // Strategy 2: Recent assistant messages (look for "Item — description" patterns)
    const recentAssistantMessages = messages
      .filter(m => m.role === 'assistant')
      .slice(-3)
      .reverse();
    
    for (const msg of recentAssistantMessages) {
      const content = msg.content || '';
      const itemMatch = content.match(/(?:^|\n)\s*([A-Z][a-zA-Z0-9&'’\-]+(?:\s+[A-Z][a-zA-Z0-9&'’\-]+){0,4})(?:\s*[—–-]|$)/m);
      if (itemMatch) {
        console.log('[DEBUG RAG] Resolved item from assistant message:', itemMatch[1]);
        return itemMatch[1].trim();
      }
    }
    
    // Strategy 3: Recent user messages (look for capitalized phrases)
    const recentUserMessages = messages
      .filter(m => m.role === 'user')
      .slice(-5)
      .reverse();
    
    for (const msg of recentUserMessages) {
      const content = msg.content || '';
      const itemMatch = content.match(/\b([A-Z][a-zA-Z0-9&'’\-]+(?:\s+[A-Z][a-zA-Z0-9&'’\-]+){0,4})\b/);
      if (itemMatch && !pronouns.includes(itemMatch[1].toLowerCase())) {
        console.log('[DEBUG RAG] Resolved item from user message:', itemMatch[1]);
        return itemMatch[1].trim();
      }
    }
    
    // Strategy 4: Last assistant message (broader search)
    const lastAssistantMsg = messages.filter(m => m.role === 'assistant').pop();
    if (lastAssistantMsg?.content) {
      const allItemMatches = lastAssistantMsg.content.match(/([A-Z][a-zA-Z0-9&'’\-]+(?:\s+[A-Z][a-zA-Z0-9&'’\-]+){0,4})/g);
      if (allItemMatches && allItemMatches.length > 0) {
        console.log('[DEBUG RAG] Resolved item from last assistant message (broad search):', allItemMatches[0]);
        return allItemMatches[0].trim();
      }
    }
    
    // Fall back to candidate (even if pronoun) - better than empty string
    console.warn('[DEBUG RAG] Unable to resolve item from context, falling back to candidate:', candidate);
    return itemName || candidate || '';
  };
  
  const extractIngredientList = (content = '') => {
    if (!content) return null;
    
    const lines = content.split(/\n+/);
    for (const line of lines) {
      if (line.includes('•')) {
        const cleaned = line
          .replace(/\s*•\s*/g, ', ')
          .replace(/\s+/g, ' ')
          .trim();
        if (cleaned && cleaned.split(',').length >= 2) {
          return cleaned;
        }
      }
    }
    
    const inlineMatch = content.match(/ingredients?(?:\s*[:\-]\s*|\s+include\s+)([^\n.]+)/i);
    if (inlineMatch) {
      return inlineMatch[1].trim();
    }
    
    return null;
  };
  
  const extractExperienceSummary = (content = '') => {
    const match = content.match(/✨\s*The Experience\s*([\s\S]+?)(?:\n\s*[💚🌿]|$)/i);
    if (match) {
      return match[1]
        .split(/\n+/)
        .map(line => line.trim())
        .filter(Boolean)
        .slice(0, 2)
        .join(' ');
    }
    return null;
  };
  
  // Let the AI handle gratitude based on conversation context - no hardcoded checks
  
  // Pattern: "tell me more about X", "tell me about X", "what is X", "describe X", "information about X"
  const infoPattern1 = /^(?:tell\s+me\s+more\s+about|tell\s+me\s+about|what\s+is|what'?s|describe|information\s+about|tell\s+me\s+more\s+on)\s+(.+)$/i;
  const infoMatch = lowerText.match(infoPattern1);
  
  // Ingredient-specific queries (e.g., "what are the ingredients", "what's in it", "what does it contain")
  const ingredientPattern = /(?:what\s+(?:are|is)\s+(?:the\s+)?ingredients?(?:\s+(?:of|for|in)\s+(.+))?|ingredients?\s+for\s+(.+)|what'?s\s+in\s+(.+)|what\s+is\s+in\s+(.+)|what\s+do(?:es)?\s+(.+?)\s+contain|what\s+do(?:es)?\s+it\s+contain)/i;
  const ingredientMatch = userText.match(ingredientPattern);
  const isIngredientQuery = !!ingredientMatch || ['ingredient', 'ingredients'].includes(lowerText);
  const ingredientCandidate = ingredientMatch ? ingredientMatch.slice(1).find(Boolean) : (isIngredientQuery ? 'it' : null);
  
  if (infoMatch || isIngredientQuery) {
    const rawItemName = infoMatch ? infoMatch[1].trim().replace(/[.,!?]+$/, '') : (ingredientCandidate || '');
    const itemName = resolveItemName(rawItemName);
    
    console.log('[DEBUG RAG] Informational query detected. Searching knowledge base for:', itemName);
    console.log('[DEBUG RAG] Full query:', userText);
    
    // Search knowledge base specifically for this item
    const { searchSimilar } = await import('./vectorStoreService.js');
    
    // Try multiple search strategies
    let knowledgeResults = [];
    
    // Strategy 1: Search with exact item name
    knowledgeResults = await searchSimilar(itemName, {
      topK: 10,
      minScore: 0.1, // Very low threshold
      type: 'knowledge'
    });
    
    console.log('[DEBUG RAG] Strategy 1 results:', knowledgeResults.length);
    
    // Strategy 2: If no results, try without type filter (search all types, then filter)
    if (knowledgeResults.length === 0) {
      const allResults = await searchSimilar(itemName, {
        topK: 20,
        minScore: 0.05, // Very low threshold
      });
      knowledgeResults = allResults.filter(r => r.metadata?.type === 'knowledge');
      console.log('[DEBUG RAG] Strategy 2 results (filtered):', knowledgeResults.length);
    }
    
    // Strategy 3: If still no results, try searching individual words
    if (knowledgeResults.length === 0 && itemName.includes(' ')) {
      const words = itemName.split(/\s+/).filter(w => w.length > 2);
      for (const word of words) {
        const wordResults = await searchSimilar(word, {
          topK: 10,
          minScore: 0.1,
          type: 'knowledge'
        });
        if (wordResults.length > 0) {
          knowledgeResults = wordResults;
          console.log('[DEBUG RAG] Strategy 3 found results with word:', word);
          break;
        }
      }
    }
    
    console.log('[DEBUG RAG] Final knowledge base search results:', knowledgeResults.length);
    if (knowledgeResults.length > 0) {
      console.log('[DEBUG RAG] Top result:', {
        name: knowledgeResults[0].metadata?.name,
        score: knowledgeResults[0].score,
        contentPreview: (knowledgeResults[0].content || '').substring(0, 100)
      });
    } else {
      console.log('[DEBUG RAG] WARNING: No knowledge base results found for:', itemName);
      console.log('[DEBUG RAG] This might mean:');
      console.log('[DEBUG RAG] 1. PDF was not indexed (run: npm run index:pdf)');
      console.log('[DEBUG RAG] 2. Item name doesn\'t match PDF content');
      console.log('[DEBUG RAG] 3. Search threshold too high');
    }
    
    if (knowledgeResults.length > 0) {
      // Find the most relevant result
      const bestMatch = knowledgeResults[0];
      const content = bestMatch.content || '';
      const name = bestMatch.metadata?.name || bestMatch.metadata?.section || itemName;
      const itemNameLower = itemName.toLowerCase();
      const contentLower = content.toLowerCase();
      
      let relevantInfo = content;
      if (contentLower.includes(itemNameLower)) {
        const sentences = content.split(/[.!?]\s+/);
        const relevantSentences = sentences.filter(s => 
          s.toLowerCase().includes(itemNameLower)
        ).slice(0, 3);
        
        if (relevantSentences.length > 0) {
          relevantInfo = relevantSentences.join('. ') + '.';
        }
      }
      
      if (relevantInfo.length > 500) {
        relevantInfo = relevantInfo.substring(0, 500) + '...';
      }
      
      let message;
      if (isIngredientQuery) {
        const ingredientsText = extractIngredientList(content);
        const formattedName = toTitleCase(itemName || name || 'this item');
        const experienceSummary = extractExperienceSummary(content);
        
        if (ingredientsText) {
          message = `${formattedName} is made with ${ingredientsText}.`;
          if (experienceSummary) {
            message += ` ${experienceSummary}`;
          }
        } else {
          message = `I couldn't find a dedicated ingredient line for ${formattedName}, but here's what I found: ${relevantInfo}`;
        }
      } else {
        message = relevantInfo || `I found information about ${itemName} in our menu. ${content.substring(0, 200)}...`;
      }
      
      console.log('[DEBUG RAG] Found knowledge base information for:', itemName);
      return {
        mode: 'chat',
        message,
        retrievedContext: knowledgeResults.map(doc => ({
          name: doc.metadata?.name || doc.metadata?.section || '',
          content: doc.content || '',
          score: doc.score,
          documentId: doc.documentId,
          type: 'knowledge'
        }))
      };
    } else {
      console.log('[DEBUG RAG] No knowledge base results found for:', itemName);
      // Even if no results, return chat mode to avoid category misinterpretation
      // Try a broader search without type filter
      try {
        const { searchSimilar } = await import('./vectorStoreService.js');
        const broaderResults = await searchSimilar(itemName, {
          topK: 5,
          minScore: 0.1, // Very low threshold
        });
        
        if (broaderResults.length > 0) {
          // Filter for knowledge type results
          const knowledgeResults = broaderResults.filter(r => r.metadata?.type === 'knowledge');
          if (knowledgeResults.length > 0) {
            const bestMatch = knowledgeResults[0];
            const content = bestMatch.content || '';
            let relevantInfo = content;
            if (content.length > 500) {
              relevantInfo = content.substring(0, 500) + '...';
            }
            
            return {
              mode: 'chat',
              message: relevantInfo || `I found some information about ${itemName} in our menu. ${content.substring(0, 200)}...`,
              retrievedContext: knowledgeResults.map(doc => ({
                name: doc.metadata?.name || doc.metadata?.section || '',
                content: doc.content || '',
                score: doc.score,
                documentId: doc.documentId,
                type: 'knowledge'
              }))
            };
          }
        }
      } catch (err) {
        console.warn('[DEBUG RAG] Error in broader search:', err.message);
      }
      
      // If still no results, return a helpful message instead of falling through to category detection
      const formattedName = toTitleCase(itemName || 'that item');
      const fallbackMessage = isIngredientQuery
        ? `I couldn't reach the ingredient list for "${formattedName}" right now. Would you like me to search for it as a menu item instead?`
        : `I couldn't find detailed information about "${formattedName}" in our knowledge base. Would you like to search for it as a menu item instead?`;
      
      return {
        mode: 'chat',
        message: fallbackMessage,
        retrievedContext: []
      };
    }
  }
  
  // CRITICAL: Check for "add it" pattern FIRST, before LLM call
  // This ensures we handle context-dependent commands correctly without LLM interference
  const addItPattern1 = /^add\s+(?:it|them)(?:\s+to\s+(?:my\s+|the\s+)?cart)?$/i;
  const addItPattern2 = /^put\s+(?:it|them)\s+in\s+(?:my\s+|the\s+)?cart$/i;
  const addItPattern3 = /^add\s+to\s+(?:my\s+|the\s+)?cart$/i;
  const isAddItPattern = addItPattern1.test(lowerText) || addItPattern2.test(lowerText) || addItPattern3.test(lowerText);
  
  if (isAddItPattern) {
    console.log('[DEBUG RAG] EARLY DETECTION: "add it" pattern detected BEFORE LLM call');
    console.log('[DEBUG RAG] memoryContext.recentProducts:', memoryContext.recentProducts);
    
    // Get products from memory context first
    let productsToAdd = memoryContext.recentProducts || [];
    
    // If no products in memory, query database directly
    if (productsToAdd.length === 0) {
      console.log('[DEBUG RAG] No products in memoryContext, querying database...');
      try {
        const Conversation = (await import('../models/Conversation.js')).default;
        const queryFilter = {
          $or: [
            { 'result.returnedItems': { $exists: true, $ne: [] } },
            { 'result.suggestedProducts': { $exists: true, $ne: [] } }
          ]
        };
        
        if (identity.userId || identity.sessionId) {
          queryFilter.$and = [{
            $or: [
              identity.userId ? { user: identity.userId } : {},
              identity.sessionId ? { sessionId: identity.sessionId } : {}
            ]
          }];
        }
        
        const recentConvWithItems = await Conversation.findOne(queryFilter)
          .sort({ createdAt: -1 })
          .limit(1)
          .lean();
        
        if (recentConvWithItems) {
          console.log('[DEBUG RAG] Found conversation with items:', recentConvWithItems._id);
          if (recentConvWithItems.result?.returnedItems && Array.isArray(recentConvWithItems.result.returnedItems) && recentConvWithItems.result.returnedItems.length > 0) {
            productsToAdd = recentConvWithItems.result.returnedItems
              .map(name => String(name).toLowerCase().trim())
              .filter(name => name && name.length > 1 && name.length < 50)
              .slice(0, 3);
            console.log('[DEBUG RAG] Products from database returnedItems:', productsToAdd);
          } else if (recentConvWithItems.result?.suggestedProducts && Array.isArray(recentConvWithItems.result.suggestedProducts) && recentConvWithItems.result.suggestedProducts.length > 0) {
            productsToAdd = recentConvWithItems.result.suggestedProducts
              .map(name => String(name).toLowerCase().trim())
              .filter(name => name && name.length > 1 && name.length < 50)
              .slice(0, 3);
            console.log('[DEBUG RAG] Products from database suggestedProducts:', productsToAdd);
          }
        }
      } catch (dbError) {
        console.warn('[DEBUG RAG] Error querying database:', dbError.message);
      }
    }
    
    if (productsToAdd.length > 0) {
      console.log('[DEBUG RAG] Returning add to cart action EARLY for:', productsToAdd);
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: {
          search: productsToAdd[0],
          addToCart: true
        },
        message: `Great! Adding ${productsToAdd.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')} to your cart.`,
        suggestedProducts: productsToAdd
      };
    } else {
      console.log('[DEBUG RAG] No products found for "add it" command, will continue with LLM');
    }
  }
  
  // First, retrieve relevant context using RAG
  // For informational queries, prioritize knowledge type results
  const isInfoQuery = lowerText.match(/(?:tell\s+me\s+more\s+about|tell\s+me\s+about|what\s+is|what'?s|describe|information\s+about|tell\s+me\s+more\s+on)\s+/i);
  let retrievedDocs = [];
  
  if (isInfoQuery) {
    // For informational queries, search knowledge base first
    retrievedDocs = await searchSimilar(userText, {
      topK: 10,
      minScore: 0.1, // Lower threshold for knowledge base
      type: 'knowledge'
    });
    
    // If no knowledge results, fall back to general search
    if (retrievedDocs.length === 0) {
      const allDocs = await searchSimilar(userText, {
        topK: 10,
        minScore: 0.1
      });
      retrievedDocs = allDocs.filter(d => d.metadata?.type === 'knowledge');
    }
  } else {
    // For other queries, use general search with lower threshold
    // Also try to include knowledge base results
    retrievedDocs = await searchSimilar(userText, {
      topK: 10, // Increase to get more results
      minScore: 0.15 // Lower threshold to catch more matches
    });
    
    // If no results, try searching knowledge base specifically
    if (retrievedDocs.length === 0 || retrievedDocs.filter(d => d.metadata?.type === 'knowledge').length === 0) {
      const knowledgeResults = await searchSimilar(userText, {
        topK: 5,
        minScore: 0.1, // Very low threshold for knowledge base
        type: 'knowledge'
      });
      
      if (knowledgeResults.length > 0) {
        // Mix knowledge results with other results
        retrievedDocs = [...knowledgeResults, ...retrievedDocs].slice(0, 10);
      }
    }
  }

  // Get all active categories to help AI understand category names
  let categoriesList = [];
  try {
    const categories = await Category.find({ isActive: true }).select('name').lean();
    categoriesList = categories.map(c => c.name);
  } catch (err) {
    // Ignore errors, continue without category list
    console.warn('Could not fetch categories for context:', err.message);
  }

  // If rules-only mode or LLM unavailable, use rule-based interpreter
  if (useRulesOnly || !getLLMModel()) {
    return interpretQueryRules(userText, messages, memoryContext, retrievedDocs);
  }

  // Build context string from retrieved documents
  const context = buildContext(retrievedDocs);

  // Use the existing interpretUserQuery but enhance with RAG context
  // We'll modify the prompt to include retrieved context
  const convo = renderConversation(messages);
  
  // Get user context if available
  let userContextString = '';
  if (identity.userContext && identity.user) {
    const { formatUserContextForAI } = await import('./userContextService.js');
    userContextString = formatUserContextForAI(identity.userContext, identity.user);
  }
  
  const model = getLLMModel();

  const prompt = `You are a friendly restaurant waiter assistant and API intent router.
Your job has three parts:
1) Handle user orders or menu requests.
2) Chat naturally when the user is unsure or casual.
3) Help users find food combinations that suit their goals (health, diet, allergies, etc).

${categoriesList.length > 0 ? `\n--- AVAILABLE CATEGORIES ---\n${categoriesList.join(', ')}\n` : ''}

${context ? `\n--- AVAILABLE MENU ITEMS AND INFORMATION ---${context}\n` : ''}

${userContextString}

--- CONVERSATION HISTORY ---
${convo}
IMPORTANT: Read the conversation history above carefully. It shows the recent exchange between the user and assistant. Use this context to understand what the user is responding to or referring to.

Always output JSON ONLY in this schema:
{
  "mode": "action" | "clarify" | "chat",
  "targetService"?: "category"|"menuItem"|"user"|"order",
  "operation"?: "list"|"get"|"create"|"update"|"delete",
  "filters"?: {"id"?:string,"search"?:string,"category"?:string,"email"?:string,"name"?:string,"payload"?:object},
  "needsClarification"?: boolean,
  "clarificationQuestion"?: string,
  "message"?: string,
  "recommendations"?: [{
    "searchFilters": object,
    "items": [{"role":"protein|carb|vegetable|drink|side","nameHint":string}],
    "rationale": string,
    "fitScore": number,
    "confidence": "low"|"medium"|"high"
  }],
  "explanation"?: string
}

--- SMART RULES ---
- CRITICAL: ALWAYS check the conversation history above to understand context before deciding intent.
- Use the retrieved menu information above to provide accurate recommendations.
- INFORMATIONAL QUERIES: If the user asks "tell me more about X", "tell me about X", "what is X", "describe X", "information about X", use mode="chat" with information from the retrieved context. Extract relevant information about X from the AVAILABLE MENU ITEMS AND INFORMATION section above. Do NOT interpret these as category or menu item searches - they want INFORMATION, not a list.
- CONVERSATIONAL QUERIES: If the user asks conversational questions like "can I talk to you", "can we chat", "how are you", "tell me about yourself", "what can you do", use mode="chat" with a friendly, helpful message. Do NOT try to interpret these as menu searches.
- AFFIRMATIVE RESPONSES TO QUESTIONS: If the last assistant message ends with a question mark (?) or contains phrases like "would you like", "are you looking", "can I help", "do you want", and the user responds with:
  * "yes", "yes i would", "yes please", "yes i'd like", "sure", "okay", "alright", "that sounds good", "i'd like that", "yes i want", "yes i am", etc.
  These are CONVERSATIONAL RESPONSES answering the question, NOT search queries. Use mode="chat" and continue the conversation naturally based on what was asked. For example, if asked "Are you looking for something to eat or drink, or maybe you'd like some recommendations?" and user says "yes i would", respond with mode="chat" offering recommendations or asking follow-up questions.
- NEGATIVE RESPONSES TO QUESTIONS: If the last assistant message is a question and the user responds with "no", "not really", "nah", "nope", etc., this is also CONVERSATIONAL - use mode="chat" to acknowledge and offer alternatives.
- NEVER treat affirmative/negative responses to questions as search queries. Always check if the last assistant message was a question first.
- CONTEXT-AWARE INTENT DETECTION: Before interpreting user input, carefully read the conversation history. Look for:
  * Questions from assistant: If the last assistant message is a question (ends with "?" or contains question words), and the user gives a short response, it's likely answering that question, not a search query.
  * Order confirmations: If the last assistant message contains "Order confirmed", "Payment successful", "Thank you for choosing", or similar completion phrases, and the user says "thank you", "thanks", or similar gratitude, this is CONVERSATIONAL - use mode="chat" with a warm acknowledgment. NEVER treat gratitude after order completion as a search query.
  * Product discussions: If the conversation was about specific products and the user says "thank you", check if they're closing the conversation or if there are products to add to cart.
  * General gratitude: If "thank you" appears without clear context, respond conversationally with mode="chat".
- NEVER treat "thank you", "thanks", "yes", "no", or similar conversational phrases as search queries when they're clearly responses to questions or statements in the conversation history.
- CRITICAL CART ADDITION INTENT: The user wants to add items to cart if they say ANY of these patterns:
  * "add X" or "add X to cart" or "add X to my cart" → direct cart addition
  * "add it" or "add them" or "add it to cart" or "add it to my cart" → add previously mentioned items
  * "put X in cart" or "put it in cart" → cart addition
  * "I want to add X" or "I'd like to add X" → cart addition
  * "add to cart" (when items were mentioned) → add those items
  * After being asked "Would you like me to add X to your cart?", responses like "yes", "sure", "add it", "add them", "go ahead" → add those items
  Always use mode="action", targetService="menuItem", operation="list", filters.search=[item name], filters.addToCart=true
- CRITICAL CATEGORY DETECTION: If the user asks "what X do you have", "show me X", "do you have X", "what are the X you have", check if X matches a category name from the AVAILABLE CATEGORIES list above.
  - If X matches a category name (case-insensitive, handles singular/plural like "drink"/"drinks"), use filters.category with the EXACT category name from the list.
  - Example: User asks "what are the drinks you have" and "Drinks" is in categories → targetService: "menuItem", filters.category: "Drinks"
  - Example: User asks "show me desserts" and "Desserts" is in categories → targetService: "menuItem", filters.category: "Desserts"
  - If X doesn't match a category, treat it as a menu item search (filters.search: X)
- CRITICAL: If the user asks "what X do you have", "show me X", "do you have X", "I want X", they want MENU ITEMS (targetService: "menuItem"), NOT categories.
- Examples: "What smoothies do you have" → Check if "smoothies" is a category. If yes, filters.category: "Smoothies". If no, filters.search: "smoothies"
- Examples: "Show me drinks" → Check if "drinks" matches a category. If yes (e.g., "Drinks"), filters.category: "Drinks". If no, filters.search: "drinks"
- Only use targetService: "category" when explicitly asking about categories themselves (e.g., "list categories", "what categories do you have", "show me all categories").
- The filters.category field should contain the EXACT category name from the AVAILABLE CATEGORIES list (case-sensitive match).
- When searching for items that are NOT categories, use filters.search or filters.name.
- If the user asks about specific items mentioned in the context, reference them accurately.
- Never treat short answers like "no", "no i don't", "nah", "none", "nope", "not really", "yes", "yes i would", "yes please", "sure", "ok", "okay" as search terms.
- If they appear after a question (check conversation history), they are CONVERSATIONAL RESPONSES, not search queries. Interpret them as answers to the question.
- If they appear after a question about allergies or preferences, interpret meaningfully (e.g., "no i don't" = no allergies).
- If the user asks about items not in the context, use search filters to find menu items matching the term.
- Always maintain context from recent turns.
- ACTION-AWARE: If the user mentions a product (e.g., "I want fanta", "show me pizza") and then says "thank you", "that's all", "that will be all", "that's it", you should offer to add it to their cart. Use mode="clarify" with clarificationQuestion asking if they want to add it to cart.
- ACTION-AWARE: When user expresses interest in a product, proactively offer to add it to cart rather than just showing information.
- CHECKOUT INTENT: If the user says "proceed to checkout", "checkout", "go to checkout", "I'm done", "that's all", "I'm finished", "ready to checkout", "let's checkout", after items were added to cart, use mode="chat" with message="Great! You can proceed to checkout by clicking the 'Proceed to Checkout' button in your cart, or let me know if you'd like to add anything else!"
- ADD MORE INTENT: If the user says "something else", "add more", "yes, something else", "I want to add more", "add another", "another item", after being asked if they want to add something else, use mode="chat" with message="Sure! What would you like to add? You can tell me the item name or browse by category."
- ACCOUNT MANAGEMENT: If the user wants to login or register, use mode="action" with targetService="auth" and operation="login" or "register". For login, filters.payload should contain username/email and password. For register, filters.payload should contain name, email, password, and optionally username.
- USER PERSONALIZATION: If user context is provided above, use it to personalize recommendations. Reference their favorite items, order history, and preferences when making suggestions.
- If unsure, favor mode="chat" with a warm, short message that references the retrieved context.

--- CONTEXT MEMORY ---
{
  "recentGoal": ${JSON.stringify(memoryContext.recentGoal || null)},
  "recentCuisinePreference": ${JSON.stringify(memoryContext.recentCuisinePreference || null)},
  "recentAllergies": ${JSON.stringify(memoryContext.recentAllergies || [])},
  "recentMainChoice": ${JSON.stringify(memoryContext.recentMainChoice || null)},
  "lastUserIntent": ${JSON.stringify(memoryContext.lastUserIntent || null)}
}

CURRENT USER INPUT: ${userText}

Remember: Always check the conversation history above to understand the context before deciding if the user input is:
- A search query (e.g., "do you have rice", "show me pizza") - ONLY if it's clearly asking about menu items
- A conversational response answering a question (e.g., "yes i would" after "would you like recommendations?", "thank you" after order confirmation, greetings, "no" after questions)
- An action request (e.g., "add X to cart", "I want X")

CRITICAL CHECK: If the last assistant message in the conversation history is a QUESTION (ends with "?" or contains "would you", "are you", "can I", etc.), and the user input is a short phrase like "yes", "yes i would", "no", "sure", etc., it is ALWAYS a conversational response, NOT a search query.`;

  let text;
  try {
    const result = await generateText({
      model: model,
      prompt,
      maxRetries: 1, // Reduce retries to fail faster
      timeout: 10000 // 10 second timeout
    });
    text = result.text;
  } catch (error) {
    // If LLM fails, fall back to rule-based interpreter
    console.warn('OpenAI API failed, using rule-based interpreter:', error.message);
    return interpretQueryRules(userText, messages, memoryContext, retrievedDocs);
  }

  // Parse JSON response
  let parsed = coerceToJson(text);

  if (!parsed) {
    // If parsing fails, check if it's a conversational or informational query
    const lowerText = userText.toLowerCase().trim();
    const isConversational = lowerText.match(/(?:can\s+i\s+talk|can\s+we\s+chat|how\s+are\s+you|what\s+can\s+you\s+do|who\s+are\s+you|what\s+are\s+you)/i);
    const isInformational = lowerText.match(/(?:tell\s+me\s+more\s+about|tell\s+me\s+about|what\s+is|what'?s|describe|information\s+about|tell\s+me\s+more\s+on)\s+/i);
    
    if (isConversational) {
      return {
        mode: 'chat',
        message: 'Of course! I\'m here to help you explore our menu, find dishes that suit your preferences, and assist with your order. What would you like to know?',
        retrievedContext: retrievedDocs.map(doc => ({
          name: doc.metadata.name,
          score: doc.score,
          documentId: doc.documentId
        }))
      };
    }
    
    if (isInformational) {
      // This shouldn't happen if early detection worked, but as a fallback
      const infoMatch = lowerText.match(/(?:tell\s+me\s+more\s+about|tell\s+me\s+about|what\s+is|what'?s|describe|information\s+about|tell\s+me\s+more\s+on)\s+(.+)$/i);
      if (infoMatch) {
        const itemName = infoMatch[1].trim();
        return {
          mode: 'chat',
          message: `I couldn't find detailed information about "${itemName}" in our knowledge base. Would you like to search for it as a menu item instead?`,
          retrievedContext: retrievedDocs.map(doc => ({
            name: doc.metadata?.name || '',
            content: doc.content || '',
            score: doc.score,
            documentId: doc.documentId,
            type: doc.metadata?.type || 'unknown'
          }))
        };
      }
    }
    
    throw new Error('Failed to interpret user intent');
  }

  // CRITICAL: If LLM returned category for informational query, override it
  // Check if this was an informational query that got misinterpreted
  const isInformationalQuery = lowerText.match(/(?:tell\s+me\s+more\s+about|tell\s+me\s+about|what\s+is|what'?s|describe|information\s+about|tell\s+me\s+more\s+on)\s+/i);
  if (isInformationalQuery && parsed.mode === 'action' && parsed.targetService === 'category') {
    console.log('[DEBUG RAG] LLM misinterpreted informational query as category, overriding...');
    const infoMatch = lowerText.match(/(?:tell\s+me\s+more\s+about|tell\s+me\s+about|what\s+is|what'?s|describe|information\s+about|tell\s+me\s+more\s+on)\s+(.+)$/i);
    if (infoMatch) {
      const itemName = infoMatch[1].trim();
      // Search knowledge base one more time
      const { searchSimilar } = await import('./vectorStoreService.js');
      const knowledgeResults = await searchSimilar(itemName, {
        topK: 5,
        minScore: 0.1,
        type: 'knowledge'
      });
      
      if (knowledgeResults.length > 0) {
        const bestMatch = knowledgeResults[0];
        const content = bestMatch.content || '';
        let relevantInfo = content;
        if (content.length > 500) {
          relevantInfo = content.substring(0, 500) + '...';
        }
        
        return {
          mode: 'chat',
          message: relevantInfo,
          retrievedContext: knowledgeResults.map(doc => ({
            name: doc.metadata?.name || doc.metadata?.section || '',
            content: doc.content || '',
            score: doc.score,
            documentId: doc.documentId,
            type: 'knowledge'
          }))
        };
      }
      
      // If still no results, return helpful message
      return {
        mode: 'chat',
        message: `I couldn't find detailed information about "${itemName}" in our knowledge base. Would you like to search for it as a menu item instead?`,
        retrievedContext: []
      };
    }
  }

  // Post-processing: Fix common misinterpretations
  // Note: lowerText is already declared at the top of the function for early pattern detection
  
  // Handle various "add to cart" patterns - comprehensive detection
  // Pattern 1: "add X" or "add X to cart" or "add X to my cart"
  const addDirectMatch = lowerText.match(/^add\s+(.+?)(?:\s+to\s+(?:my|the\s+)?cart)?$/i);
  if (addDirectMatch) {
    const itemName = addDirectMatch[1].trim().replace(/[.,!?]+$/, '');
    // Skip if it's just "it" or "them" (these are handled as affirmative responses below)
    if (itemName && !itemName.match(/^(it|them)$/i)) {
      parsed.mode = 'action';
      parsed.targetService = 'menuItem';
      parsed.operation = 'list';
      parsed.filters = parsed.filters || {};
      parsed.filters.search = itemName;
      parsed.filters.addToCart = true;
      parsed.message = `Adding ${itemName.charAt(0).toUpperCase() + itemName.slice(1)} to your cart.`;
      return sanitizeInterpretation(parsed);
    }
  }
  
  // Pattern 2: "put X in cart" or "put it in cart"
  const putInCartMatch = lowerText.match(/^put\s+(.+?)\s+in\s+(?:my|the\s+)?cart$/i);
  if (putInCartMatch) {
    const itemName = putInCartMatch[1].trim().replace(/[.,!?]+$/, '');
    if (itemName && !itemName.match(/^(it|them)$/i)) {
      parsed.mode = 'action';
      parsed.targetService = 'menuItem';
      parsed.operation = 'list';
      parsed.filters = parsed.filters || {};
      parsed.filters.search = itemName;
      parsed.filters.addToCart = true;
      parsed.message = `Adding ${itemName.charAt(0).toUpperCase() + itemName.slice(1)} to your cart.`;
      return sanitizeInterpretation(parsed);
    }
  }
  
  // Pattern 3: "I want to add X" or "I'd like to add X"
  const wantToAddMatch = lowerText.match(/^(?:i\s+want\s+to|i'?d\s+like\s+to)\s+add\s+(.+?)(?:\s+to\s+(?:my|the\s+)?cart)?$/i);
  if (wantToAddMatch) {
    const itemName = wantToAddMatch[1].trim().replace(/[.,!?]+$/, '');
    if (itemName) {
      parsed.mode = 'action';
      parsed.targetService = 'menuItem';
      parsed.operation = 'list';
      parsed.filters = parsed.filters || {};
      parsed.filters.search = itemName;
      parsed.filters.addToCart = true;
      parsed.message = `Adding ${itemName.charAt(0).toUpperCase() + itemName.slice(1)} to your cart.`;
      return sanitizeInterpretation(parsed);
    }
  }
  
  // ACTION-AWARE: Check if user is responding to a clarification question
  // Note: "add it" patterns are already handled at the top of the function (early detection)
  // This section only handles affirmative responses to clarification questions
  const isAffirmative = lowerText.match(/^(yes|yeah|yep|yup|sure|ok|okay|alright|go\s+ahead|do\s+it|please|that'?s\s+fine|sounds\s+good)$/i);
  const isNegative = lowerText.match(/^(no|nope|nah|don'?t|skip|cancel|not\s+now|not\s+really)$/i);
  
  // Check previous conversation for clarification questions
  const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
  const wasAskedToAddToCart = lastAssistantMessage?.content?.toLowerCase().includes('add') && 
                                (lastAssistantMessage?.content?.toLowerCase().includes('cart') ||
                                 lastAssistantMessage?.content?.toLowerCase().includes('your cart'));
  
  // If user says "yes" after being asked to add to cart, try to find products
  // Priority: 1) memoryContext.recentProducts, 2) retrievedDocs, 3) extract from messages
  if (isAffirmative && wasAskedToAddToCart) {
    // Get products from memory context (from previous search) - most reliable
    // These are prioritized: suggestedProducts from last clarification first, then recentProducts
    let productsToAdd = memoryContext.recentProducts || [];
    
    console.log('[DEBUG RAG] Affirmative response detected after clarification. recentProducts:', productsToAdd);
    console.log('[DEBUG] retrievedDocs:', retrievedDocs.map(d => d.metadata?.name));
    
    // If no products in memory, check retrieved docs (current search results)
    if (productsToAdd.length === 0 && retrievedDocs.length > 0) {
      productsToAdd = retrievedDocs
        .slice(0, 3)
        .map(doc => doc.metadata?.name)
        .filter(Boolean)
        .map(name => name.toLowerCase().trim())
        .filter(name => name.length > 1 && name.length < 50);
      console.log('[DEBUG] Products from retrievedDocs:', productsToAdd);
    }
    
    // Also check if we can extract from the assistant's message
    if (productsToAdd.length === 0 && lastAssistantMessage?.content) {
      // Try to extract product names from the clarification question
      const content = lastAssistantMessage.content.toLowerCase();
      // Look for patterns like "add Fanta" or "add X, Y and Z to your cart"
      // Match: "add Fanta, Coke and Hello to your cart" or "add Drinks, Fanta, Coke and Hello to your cart"
      const addMatch = content.match(/add\s+([^,]+(?:,\s*[^,]+)*)\s+to/);
      if (addMatch) {
        // Split by comma and "and", then clean up each product name
        productsToAdd = addMatch[1]
          .split(/,|\s+and\s+/)
          .map(p => p.trim())
          .filter(p => p && p.length > 0 && !p.match(/^(and|or)$/i));
        console.log('[DEBUG] Products from assistant message:', productsToAdd);
      }
    }
    
    // Also check previous user messages for product searches
    if (productsToAdd.length === 0 && messages.length > 0) {
      // Look through recent user messages for product names
      const recentUserMessages = messages
        .filter(m => m.role === 'user')
        .slice(-3)
        .reverse();
      
      for (const msg of recentUserMessages) {
        const msgText = (msg.content || '').toLowerCase().trim();
        // Skip if it's a command like "add it", "items", etc.
        if (!msgText.match(/^(add|put|items|item|show|list|find|search|what|do\s+you\s+have|yes|no|thank)/i) &&
            msgText.length > 1 && 
            msgText.length < 50 &&
            msgText.split(/\s+/).length <= 4) {
          // This might be a product name
          productsToAdd = [msgText];
          console.log('[DEBUG] Products from user messages:', productsToAdd);
          break;
        }
      }
    }
    
    // If still no products, directly query the database for the most recent conversation with returnedItems
    // This is a fallback in case memoryContext doesn't have the products yet (timing issue)
    if (productsToAdd.length === 0) {
      console.log('[DEBUG] No products found yet, checking memoryContext:', memoryContext);
      console.log('[DEBUG] Querying database for recent conversations with returnedItems...');
      try {
        // Import Conversation model
        const Conversation = (await import('../models/Conversation.js')).default;
        
        // Filter by user/session if available to ensure we get the right conversation
        const queryFilter = {
          $or: [
            { 'result.returnedItems': { $exists: true, $ne: [] } },
            { 'result.suggestedProducts': { $exists: true, $ne: [] } }
          ]
        };
        
        // Add user/session filter if available
        if (identity.userId || identity.sessionId) {
          queryFilter.$and = [
            {
              $or: [
                identity.userId ? { user: identity.userId } : {},
                identity.sessionId ? { sessionId: identity.sessionId } : {}
              ]
            }
          ];
        }
        
        const recentConvWithItems = await Conversation.findOne(queryFilter)
          .sort({ createdAt: -1 })
          .limit(1)
          .lean();
        
        if (recentConvWithItems) {
          console.log('[DEBUG] Found conversation with items:', recentConvWithItems._id, 'Text:', recentConvWithItems.text);
          
          // Priority: returnedItems first, then suggestedProducts
          if (recentConvWithItems.result?.returnedItems && Array.isArray(recentConvWithItems.result.returnedItems) && recentConvWithItems.result.returnedItems.length > 0) {
            productsToAdd = recentConvWithItems.result.returnedItems
              .map(name => String(name).toLowerCase().trim())
              .filter(name => name && name.length > 1 && name.length < 50)
              .slice(0, 3);
            console.log('[DEBUG] Products from database returnedItems:', productsToAdd);
          } else if (recentConvWithItems.result?.suggestedProducts && Array.isArray(recentConvWithItems.result.suggestedProducts) && recentConvWithItems.result.suggestedProducts.length > 0) {
            productsToAdd = recentConvWithItems.result.suggestedProducts
              .map(name => String(name).toLowerCase().trim())
              .filter(name => name && name.length > 1 && name.length < 50)
              .slice(0, 3);
            console.log('[DEBUG] Products from database suggestedProducts:', productsToAdd);
          }
        } else {
          console.log('[DEBUG] No conversation with returnedItems found in database');
        }
      } catch (dbError) {
        console.warn('[DEBUG] Error querying database for returnedItems:', dbError.message);
      }
    }
    
    if (productsToAdd.length > 0) {
      // Return action to search for these products (so frontend can add to cart)
      parsed.mode = 'action';
      parsed.targetService = 'menuItem';
      parsed.operation = 'list';
      // Search for each product individually to get exact matches
      parsed.filters = {
        search: productsToAdd[0], // Search for first product (most common case)
        addToCart: true // Flag to indicate this is for adding to cart
      };
      const productNames = productsToAdd.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ');
      parsed.message = `Great! Adding ${productNames} to your cart.`;
      parsed.suggestedProducts = productsToAdd; // Store for reference
      console.log('[DEBUG] Returning add to cart action for:', productsToAdd);
      return sanitizeInterpretation(parsed);
    } else {
      console.log('[DEBUG] No products found for "add it" command');
    }
  }
  
  // If user says "no" after being asked to add to cart
  if (isNegative && wasAskedToAddToCart) {
    parsed.mode = 'chat';
    parsed.message = 'No problem! Is there anything else I can help you with?';
    return sanitizeInterpretation(parsed);
  }
  
  // ACTION-AWARE: Check if user is closing conversation after mentioning products
  const isClosingPhrase = lowerText.match(/(?:thank\s+you|thanks|that'?s\s+all|that\s+will\s+be\s+all|that'?s\s+it|i'?m\s+done|i'?m\s+good|no\s+more|nothing\s+else)/i);
  
  // CRITICAL: Check if last assistant message was an order confirmation
  // If so, "thank you" is purely conversational gratitude, NOT a request to add products
  const lastAssistantMsg = messages.filter(m => m.role === 'assistant').pop();
  const lastMessage = (lastAssistantMsg?.content || '').toLowerCase();
  const isOrderConfirmation = lastMessage.includes('order confirmed') || 
                              lastMessage.includes('payment successful') ||
                              lastMessage.includes('thank you for choosing') ||
                              lastMessage.includes('we\'ll notify you') ||
                              lastMessage.includes('we\'ll notify') ||
                              lastMessage.includes('🎉') ||
                              lastMessage.includes('order confirmed!') ||
                              (lastMessage.includes('total:') && (lastMessage.includes('service:') || lastMessage.includes('contact:'))) ||
                              (lastMessage.includes('₦') && lastMessage.includes('total')) ||
                              (lastMessage.includes('contact:') && lastMessage.includes('service:'));
  
  // CRITICAL: If "thank you" after order confirmation, respond conversationally without product extraction
  // This MUST happen before any product extraction logic
  if (isClosingPhrase && isOrderConfirmation) {
    console.log('[DEBUG RAG] Gratitude after order confirmation detected - responding conversationally');
    console.log('[DEBUG RAG] Last assistant message:', lastMessage.substring(0, 100));
    parsed.mode = 'chat';
    parsed.message = 'You\'re very welcome! We\'re excited to serve you. If you need anything else or have any questions, feel free to ask!';
    return sanitizeInterpretation(parsed);
  }
  
  // Extract products mentioned in recent conversation (including from retrieved docs)
  // Only if NOT after order confirmation
  const recentProducts = isOrderConfirmation ? [] : extractProductsFromConversation(messages, userText, retrievedDocs);
  
  // If user is closing AND products were mentioned, offer to add to cart
  // But NOT if it's after an order confirmation (check again to be safe)
  // Also ignore memoryContext.recentProducts if it's after order confirmation (they're old products from before the order)
  if (isClosingPhrase && !isOrderConfirmation && (recentProducts.length > 0 || (!isOrderConfirmation && memoryContext.recentProducts?.length > 0))) {
    // Prioritize products from memory context (products found in previous searches)
    const productsFromMemory = memoryContext.recentProducts || [];
    
    // Also check current retrieved context
    const productsFromContext = [];
    retrievedDocs.forEach(doc => {
      if (doc.metadata?.name) {
        const name = doc.metadata.name.toLowerCase().trim();
        if (name && !productsFromContext.includes(name)) {
          productsFromContext.push(name);
        }
      }
    });
    
    // Combine: memory first (most reliable - actual products found), then context, then text extraction
    let finalProducts = [...new Set([...productsFromMemory, ...productsFromContext, ...recentProducts])];
    
    // Filter out phrases that aren't product names (like "i want fanta")
    finalProducts = finalProducts.filter(p => {
      const lower = p.toLowerCase().trim();
      // Exclude phrases that start with "i want", "i'd like", etc.
      return !lower.match(/^(i\s+want|i'd\s+like|i'll\s+have|show\s+me|give\s+me)/i) &&
             lower.length > 1 &&
             lower.length < 30 && // Reasonable length
             lower.split(/\s+/).length <= 3; // Max 3 words
    });
    
    if (finalProducts.length === 0) return sanitizeInterpretation(parsed);
    
    // Clean up product names - capitalize first letter, remove duplicates
    const cleanProducts = [...new Set(finalProducts.map(p => {
      // Capitalize first letter
      return p.charAt(0).toUpperCase() + p.slice(1);
    }))];
    
    const productNames = cleanProducts.length === 1 
      ? cleanProducts[0]
      : cleanProducts.slice(0, -1).join(', ') + ' and ' + cleanProducts[cleanProducts.length - 1];
    
    parsed.mode = 'clarify';
    parsed.needsClarification = true;
    parsed.clarificationQuestion = `Would you like me to add ${productNames} to your cart?`;
    // More natural, human-like message - shorter and friendlier
    parsed.message = `Would you like me to add ${productNames} to your cart?`;
    // Store the products for potential cart addition
    parsed.suggestedProducts = cleanProducts;
    return sanitizeInterpretation(parsed);
  }
  
  // Handle "I want X" pattern - extract product name directly
  if (lowerText.match(/^i\s+want\s+(.+)$/i) || lowerText.match(/^i'd\s+like\s+(.+)$/i) || lowerText.match(/^i'll\s+have\s+(.+)$/i)) {
    const match = lowerText.match(/(?:i\s+want|i'd\s+like|i'll\s+have)\s+(.+)$/i);
    const itemName = match ? match[1].trim().replace(/[.,!?]+$/, '') : '';
    if (itemName) {
      parsed.mode = 'action';
      parsed.targetService = 'menuItem';
      parsed.operation = 'list';
      parsed.filters = parsed.filters || {};
      parsed.filters.search = itemName;
      // Remove category filter if it was incorrectly set
      delete parsed.filters.category;
    }
  }
  
  // If user asks "what X do you have" or "show me X", they want menu items, not categories
  if (
    parsed.mode === 'action' &&
    parsed.targetService === 'category' &&
    (lowerText.includes('what') || lowerText.includes('show me') || lowerText.includes('do you have'))
  ) {
    // Convert to menuItem search instead
    parsed.targetService = 'menuItem';
    parsed.operation = 'list';
    
    // Move category filter to search if it exists
    if (parsed.filters?.category && !parsed.filters?.search && !parsed.filters?.name) {
      parsed.filters.search = parsed.filters.category;
      delete parsed.filters.category;
    }
  }
  
  // If no search term extracted but user text is simple (1-3 words), use it as search
  if (
    parsed.mode === 'action' &&
    parsed.targetService === 'menuItem' &&
    (!parsed.filters?.search && !parsed.filters?.name) &&
    userText.trim().split(/\s+/).length <= 3 &&
    !lowerText.match(/^(what|how|when|where|why|show|list|find|get|give|can|do|is|are|will)/i)
  ) {
    parsed.filters = parsed.filters || {};
    parsed.filters.search = userText.trim();
  }

  // Post-processing: Check database if search term matches a category (even if AI didn't detect it)
  if (
    parsed.mode === 'action' &&
    parsed.targetService === 'menuItem' &&
    (parsed.filters?.search || parsed.filters?.name) &&
    !parsed.filters?.category
  ) {
    const searchTerm = (parsed.filters?.search || parsed.filters?.name || '').toLowerCase().trim();
    
    if (searchTerm) {
      try {
        // Check if search term matches a category name in database
        let matchedCategory = await Category.findOne({
          $or: [
            { name: { $regex: new RegExp(`^${searchTerm}$`, 'i') }, isActive: true },
            { name: { $regex: new RegExp(searchTerm, 'i') }, isActive: true }
          ]
        });
        
        // Also check singular/plural variations
        if (!matchedCategory) {
          const singular = searchTerm.replace(/s$/, '');
          const plural = searchTerm + 's';
          const variations = [singular, plural].filter(v => v !== searchTerm);
          
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
        
        // If category found in database, use it instead of search
        if (matchedCategory) {
          parsed.filters.category = matchedCategory.name; // Use exact name for AI consistency
          delete parsed.filters.search;
          delete parsed.filters.name;
        }
      } catch (err) {
        // Ignore database errors, continue with original interpretation
        console.warn('Error checking category in database:', err.message);
      }
    }
  }

  // Add retrieved context to the result for potential use
  // Include content so controllers can extract information from PDF/knowledge base
  parsed.retrievedContext = retrievedDocs.map(doc => ({
    name: doc.metadata?.name || doc.metadata?.section || '',
    content: doc.content || '',
    score: doc.score,
    documentId: doc.documentId,
    type: doc.metadata?.type || 'unknown'
  }));

  return sanitizeInterpretation(parsed);
}

/**
 * Utility: JSON Coercion
 */
function coerceToJson(text) {
  try {
    return JSON.parse(text);
  } catch (_) {
    const match = text && text.match(/\{[\s\S]*\}/);
    if (match) {
      try {
        return JSON.parse(match[0]);
      } catch (_) {
        return null;
      }
    }
    return null;
  }
}

/**
 * Utility: Sanitize model output
 */
function sanitizeInterpretation(raw) {
  const safe = {
    mode: 'chat',
    targetService: undefined,
    operation: undefined,
    filters: {},
    needsClarification: false,
  };

  if (!raw || typeof raw !== 'object') return safe;

  // Mode
  const mode = String(raw.mode || '').trim();
  if (ALLOWED_MODES.includes(mode)) safe.mode = mode;

  // Action fields
  const service = String(raw.targetService || '').trim();
  const operation = String(raw.operation || '').trim();
  const filters = raw.filters && typeof raw.filters === 'object' ? raw.filters : {};

  if (safe.mode === 'action') {
    if (ALLOWED_SERVICES.includes(service)) safe.targetService = service;
    if (ALLOWED_OPERATIONS.includes(operation)) safe.operation = operation;
  }

  const sanitizedFilters = {};
  if (safe.mode === 'action') {
    if (filters.id) sanitizedFilters.id = String(filters.id);
    if (filters.search) sanitizedFilters.search = String(filters.search);
    if (filters.category) sanitizedFilters.category = String(filters.category);
    if (filters.name) sanitizedFilters.name = String(filters.name);
    if (filters.email) sanitizedFilters.email = String(filters.email);

    if (filters.payload && typeof filters.payload === 'object') {
      const p = filters.payload;
      const payload = {};
      for (const key of [
        'name', 'description', 'emoji', 'imageUrl', 'isActive',
        'price', 'currency', 'isAvailable', 'category',
        'email', 'role',
        'customerName', 'customerEmail', 'customerPhone',
        'totalAmount', 'status'
      ]) {
        if (p[key] != null) payload[key] = p[key];
      }

      if (Array.isArray(p.orderItems)) {
        payload.orderItems = p.orderItems.map(item => ({
          menuItem: String(item.menuItem),
          quantity: Number(item.quantity),
          price: Number(item.price),
          notes: String(item.notes || '')
        }));
      }
      sanitizedFilters.payload = payload;
    }
  }

  if (safe.mode === 'action') safe.filters = sanitizedFilters;

  // Clarification & chat
  if (typeof raw.needsClarification === 'boolean') safe.needsClarification = raw.needsClarification;
  if (raw.clarificationQuestion) safe.clarificationQuestion = String(raw.clarificationQuestion);
  if (raw.message) safe.message = String(raw.message);

  // Preserve retrieved context if present
  if (raw.retrievedContext) {
    safe.retrievedContext = raw.retrievedContext;
  }
  
  // Preserve suggested products for cart addition
  if (raw.suggestedProducts && Array.isArray(raw.suggestedProducts)) {
    safe.suggestedProducts = raw.suggestedProducts;
  }

  return safe;
}

/**
 * Extract product names from conversation history
 * Looks for patterns like "I want X", "show me X", product searches, etc.
 * Also checks retrieved context for actual products found
 */
function extractProductsFromConversation(messages = [], currentText = '', retrievedDocs = []) {
  const products = new Set();
  const allText = [...messages.map(m => m.content || ''), currentText].join(' ').toLowerCase();
  
  // First, check retrieved context for actual products found (most reliable)
  retrievedDocs.forEach(doc => {
    if (doc.metadata?.name) {
      products.add(doc.metadata.name.toLowerCase());
    }
  });
  
  // Check previous messages for product searches that returned results
  // Look for user messages that mention products
  // SKIP assistant messages that are order confirmations (they contain order details, not product requests)
  messages.forEach((msg, index) => {
    // Skip assistant messages that are order confirmations
    if (msg.role === 'assistant') {
      const msgContent = (msg.content || '').toLowerCase();
      const isOrderMsg = msgContent.includes('order confirmed') || 
                        msgContent.includes('payment successful') ||
                        msgContent.includes('thank you for choosing') ||
                        msgContent.includes('we\'ll notify you') ||
                        msgContent.includes('we\'ll notify') ||
                        msgContent.includes('🎉') ||
                        msgContent.includes('order confirmed!') ||
                        (msgContent.includes('total:') && (msgContent.includes('service:') || msgContent.includes('contact:'))) ||
                        (msgContent.includes('₦') && msgContent.includes('total')) ||
                        (msgContent.includes('contact:') && msgContent.includes('service:'));
      if (isOrderMsg) {
        return; // Skip order confirmation messages - they contain order details, not product requests
      }
    }
    
    if (msg.role === 'user') {
      const msgText = (msg.content || '').toLowerCase().trim();
      
      // Skip closing phrases
      if (msgText.match(/(?:thank|thanks|that'?s\s+all|that\s+will\s+be|i'?m\s+done)/i)) {
        return;
      }
      
      // Extract "I want X" patterns - extract ONLY the product name (stop at punctuation or common words)
      const wantMatch = msgText.match(/(?:i\s+want|i'd\s+like|i'll\s+have)\s+([^.,!?]+?)(?:\s+(?:please|thanks|thank\s+you)|[.,!?]|$)/i);
      if (wantMatch) {
        let product = wantMatch[1].trim();
        // Remove common trailing words
        product = product.replace(/\s+(please|thanks|thank\s+you)$/i, '').trim();
        // Only add if it's a reasonable product name (1-3 words, not too long)
        const words = product.split(/\s+/);
        if (product && words.length <= 3 && product.length > 1 && product.length < 30) {
          products.add(product);
        }
      }
      
      // Extract simple product names (1-2 words only, not questions, not phrases)
      const words = msgText.split(/\s+/);
      if (words.length <= 2 && words.length > 0 && 
          !msgText.match(/^(what|how|when|where|why|thank|thanks|that|yes|no|ok|sure|show|list|find|i\s+want|i'd|i'll|give|me)/i)) {
        // Only add if it looks like a product name (not a full sentence)
        const potentialProduct = msgText.trim();
        if (potentialProduct.length < 25 && !potentialProduct.includes(',')) {
          products.add(potentialProduct);
        }
      }
    }
  });
  
  // Patterns to extract products from current text (only if not a closing phrase)
  if (!currentText.toLowerCase().match(/(?:thank|thanks|that'?s\s+all|that\s+will\s+be|i'?m\s+done)/i)) {
    const patterns = [
      /(?:i\s+want|i'd\s+like|i'll\s+have|show\s+me|give\s+me|i\s+need)\s+(.+?)(?:\s+please|\s+thanks|\.|!|\?|$)/gi,
      /(?:search|find|looking\s+for)\s+(?:a\s+)?(.+?)(?:\s+please|\.|!|\?|$)/gi,
    ];
    
    // Extract from patterns in current text
    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(currentText.toLowerCase())) !== null) {
        let product = match[1].trim().replace(/[.,!?]+$/, '');
        // Remove common trailing words
        product = product.replace(/\s+(please|thanks|thank\s+you)$/i, '').trim();
        // Filter out common words that aren't products and ensure reasonable length
        if (product && 
            product.length > 1 && 
            product.length < 30 &&
            !['you', 'me', 'some', 'the', 'a', 'an', 'all', 'that', 'this', 'have', 'do'].includes(product.toLowerCase())) {
          products.add(product);
        }
      }
    });
  }
  
  return Array.from(products).slice(0, 5); // Max 5 products
}

/**
 * Utility: Context rendering for prompt
 */
function renderConversation(messages = []) {
  if (!Array.isArray(messages) || messages.length === 0) return '';
  // Show last 10 messages to ensure order confirmations and context are visible
  const trimmed = messages.slice(-10);
  const lines = trimmed.map(m => {
    const role = m.role?.toUpperCase() || 'USER';
    const content = m.content ?? '';
    // Truncate very long messages but keep important parts
    const truncated = content.length > 500 ? content.substring(0, 500) + '...' : content;
    return `${role}: ${truncated}`;
  });
  return lines.join('\n');
}

