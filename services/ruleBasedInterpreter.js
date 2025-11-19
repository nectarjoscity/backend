/**
 * Rule-based query interpreter (works without DeepSeek API)
 * This provides a fallback when DeepSeek is unavailable
 */

import Category from '../models/Category.js';

/**
 * Interpret user query using rule-based logic (no LLM required)
 * @param {string} userText - User query text
 * @param {Array} messages - Conversation history
 * @param {Object} memoryContext - Memory context
 * @param {Array} retrievedDocs - Retrieved documents from vector search
 * @returns {Promise<Object>} - Interpreted query result
 */
export async function interpretQueryRules(userText, messages = [], memoryContext = {}, retrievedDocs = []) {
  const lowerText = userText.toLowerCase().trim();
  
  // Handle affirmative/negative responses
  const isAffirmative = lowerText.match(/^(yes|yeah|yep|yup|sure|ok|okay|alright|add\s+it|add\s+them|go\s+ahead|do\s+it|please)$/i);
  const isNegative = lowerText.match(/^(no|nope|nah|don'?t|skip|cancel|not\s+now)$/i);
  
  // Check previous conversation
  const lastAssistantMessage = messages.filter(m => m.role === 'assistant').pop();
  const wasAskedToAddToCart = lastAssistantMessage?.content?.toLowerCase().includes('add') && 
                                (lastAssistantMessage?.content?.toLowerCase().includes('cart') ||
                                 lastAssistantMessage?.content?.toLowerCase().includes('your cart'));
  
  // Handle "yes" after being asked to add to cart
  if (isAffirmative && wasAskedToAddToCart) {
    const productsToAdd = memoryContext.recentProducts || [];
    if (productsToAdd.length > 0) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: {
          search: productsToAdd[0],
          addToCart: true
        },
        message: `Great! Adding ${productsToAdd.map(p => p.charAt(0).toUpperCase() + p.slice(1)).join(', ')} to your cart.`,
        retrievedContext: []
      };
    }
  }
  
  // Handle "no" after being asked to add to cart
  if (isNegative && wasAskedToAddToCart) {
    return {
      mode: 'chat',
      message: 'No problem! Is there anything else I can help you with?',
      retrievedContext: []
    };
  }
  
  // Handle checkout intent - check if last message asked about checkout or adding more
  const wasAskedAboutCheckout = lastAssistantMessage?.content?.toLowerCase().includes('checkout') || 
                                 lastAssistantMessage?.content?.toLowerCase().includes('something else');
  
  // Checkout patterns - explicit checkout intent
  const checkoutPatterns = /^(proceed\s+to\s+checkout|checkout|go\s+to\s+checkout|i'?m\s+done|that'?s\s+all|i'?m\s+finished|ready\s+to\s+checkout|let'?s\s+checkout|i'?m\s+ready|no,?\s*(?:that'?s\s+all|i'?m\s+done|proceed))$/i;
  if (checkoutPatterns.test(lowerText) || (wasAskedAboutCheckout && (lowerText.includes('checkout') || lowerText.includes('done') || lowerText.includes('finished')))) {
    return {
      mode: 'chat',
      message: 'Great! You can proceed to checkout by clicking the "Proceed to Checkout" button in your cart, or let me know if you\'d like to add anything else!',
      retrievedContext: []
    };
  }
  
  // Add more patterns - only if explicitly asked about adding more or something else
  // Don't match just "yes" here to avoid conflicts with add-to-cart yes
  const addMorePatterns = /^(something\s+else|add\s+more|yes,?\s*something\s+else|i\s+want\s+to\s+add\s+more|add\s+another|another\s+item)$/i;
  // Also handle "yes" if the question specifically mentioned "something else" first
  const askedAboutSomethingElse = lastAssistantMessage?.content?.toLowerCase().includes('something else');
  if ((addMorePatterns.test(lowerText) || (lowerText === 'yes' && askedAboutSomethingElse)) && wasAskedAboutCheckout) {
    return {
      mode: 'chat',
      message: 'Sure! What would you like to add? You can tell me the item name or browse by category.',
      retrievedContext: []
    };
  }
  
  // Handle gratitude/acknowledgment - only as fallback when AI is unavailable
  // Check conversation context to determine appropriate response
  const isGratitude = lowerText.match(/^(thank\s+you|thanks|thank\s+you\s+very\s+much|thanks\s+a\s+lot|appreciate\s+it|much\s+appreciated)$/i);
  if (isGratitude) {
    // Check if last message was an order confirmation
    const lastMessage = lastAssistantMessage?.content?.toLowerCase() || '';
    const isOrderConfirmation = lastMessage.includes('order confirmed') || 
                                lastMessage.includes('payment successful') ||
                                lastMessage.includes('thank you for choosing') ||
                                lastMessage.includes('we\'ll notify you');
    
    if (isOrderConfirmation) {
      return {
        mode: 'chat',
        message: 'You\'re very welcome! We\'re excited to serve you. If you need anything else or have any questions, feel free to ask!',
        retrievedContext: []
      };
    }
    
    // If not order confirmation but there are products in memory, offer to add to cart
    if (memoryContext.recentProducts?.length > 0) {
      const products = memoryContext.recentProducts.map(p => p.charAt(0).toUpperCase() + p.slice(1));
      const productNames = products.length === 1 ? products[0] : products.slice(0, -1).join(', ') + ' and ' + products[products.length - 1];
      return {
        mode: 'clarify',
        needsClarification: true,
        clarificationQuestion: `Would you like me to add ${productNames} to your cart?`,
        message: `Would you like me to add ${productNames} to your cart?`,
        suggestedProducts: products,
        retrievedContext: []
      };
    }
    
    // General gratitude response
    return {
      mode: 'chat',
      message: 'You\'re welcome! Is there anything else I can help you with today?',
      retrievedContext: []
    };
  }
  
  // Handle closing phrases with products (but not gratitude - that's handled above)
  const isClosingPhrase = lowerText.match(/(?:that'?s\s+all|that\s+will\s+be\s+all|that'?s\s+it|i'?m\s+done|i'?m\s+good|no\s+more|nothing\s+else)/i);
  if (isClosingPhrase && memoryContext.recentProducts?.length > 0) {
    const products = memoryContext.recentProducts.map(p => p.charAt(0).toUpperCase() + p.slice(1));
    const productNames = products.length === 1 ? products[0] : products.slice(0, -1).join(', ') + ' and ' + products[products.length - 1];
    return {
      mode: 'clarify',
      needsClarification: true,
      clarificationQuestion: `Would you like me to add ${productNames} to your cart?`,
      message: `Would you like me to add ${productNames} to your cart?`,
      suggestedProducts: products,
      retrievedContext: []
    };
  }
  
  // Handle various "add to cart" patterns - comprehensive detection
  // Pattern 1: "add X" or "add X to cart" or "add X to my cart"
  const addDirectMatch = lowerText.match(/^add\s+(.+?)(?:\s+to\s+(?:my|the\s+)?cart)?$/i);
  if (addDirectMatch) {
    const itemName = addDirectMatch[1].trim().replace(/[.,!?]+$/, '');
    // Skip if it's just "it" or "them" (these are handled as affirmative responses above)
    if (itemName && !itemName.match(/^(it|them)$/i)) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: {
          search: itemName,
          addToCart: true
        },
        message: `Adding ${itemName.charAt(0).toUpperCase() + itemName.slice(1)} to your cart.`,
        retrievedContext: retrievedDocs.map(doc => ({
          name: doc.metadata?.name,
          score: doc.score,
          documentId: doc.metadata?.documentId
        }))
      };
    }
  }
  
  // Pattern 2: "put X in cart" or "put it in cart"
  const putInCartMatch = lowerText.match(/^put\s+(.+?)\s+in\s+(?:my|the\s+)?cart$/i);
  if (putInCartMatch) {
    const itemName = putInCartMatch[1].trim().replace(/[.,!?]+$/, '');
    if (itemName && !itemName.match(/^(it|them)$/i)) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: {
          search: itemName,
          addToCart: true
        },
        message: `Adding ${itemName.charAt(0).toUpperCase() + itemName.slice(1)} to your cart.`,
        retrievedContext: retrievedDocs.map(doc => ({
          name: doc.metadata?.name,
          score: doc.score,
          documentId: doc.metadata?.documentId
        }))
      };
    }
  }
  
  // Pattern 3: "I want to add X" or "I'd like to add X"
  const wantToAddMatch = lowerText.match(/^(?:i\s+want\s+to|i'?d\s+like\s+to)\s+add\s+(.+?)(?:\s+to\s+(?:my|the\s+)?cart)?$/i);
  if (wantToAddMatch) {
    const itemName = wantToAddMatch[1].trim().replace(/[.,!?]+$/, '');
    if (itemName) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: {
          search: itemName,
          addToCart: true
        },
        message: `Adding ${itemName.charAt(0).toUpperCase() + itemName.slice(1)} to your cart.`,
        retrievedContext: retrievedDocs.map(doc => ({
          name: doc.metadata?.name,
          score: doc.score,
          documentId: doc.metadata?.documentId
        }))
      };
    }
  }
  
  // Handle "I want X" pattern
  if (lowerText.match(/^i\s+want\s+(.+)$/i) || lowerText.match(/^i'd\s+like\s+(.+)$/i) || lowerText.match(/^i'll\s+have\s+(.+)$/i)) {
    const match = lowerText.match(/(?:i\s+want|i'd\s+like|i'll\s+have)\s+(.+)$/i);
    const itemName = match ? match[1].trim().replace(/[.,!?]+$/, '') : '';
    if (itemName) {
      return {
        mode: 'action',
        targetService: 'menuItem',
        operation: 'list',
        filters: { search: itemName },
        retrievedContext: retrievedDocs.map(doc => ({
          name: doc.metadata?.name,
          score: doc.score,
          documentId: doc.metadata?.documentId
        }))
      };
    }
  }
  
  // Extract search term from patterns
  let searchTerm = null;
  
  // Handle "what X do you have" pattern
  if (lowerText.match(/what\s+\w+\s+do\s+you\s+have/i) || 
      lowerText.match(/what\s+\w+\s+are\s+available/i) ||
      lowerText.match(/show\s+me\s+\w+/i) ||
      lowerText.match(/do\s+you\s+have\s+\w+/i)) {
    const match = lowerText.match(/(?:what|show\s+me|do\s+you\s+have)\s+(\w+)/i);
    searchTerm = match ? match[1] : lowerText.replace(/(?:what|show\s+me|do\s+you\s+have)\s+/i, '').trim();
  }
  // Handle simple product searches (1-3 words)
  else {
    const words = lowerText.split(/\s+/).filter(w => w.length > 0);
    if (words.length <= 3 && 
        !lowerText.match(/^(what|how|when|where|why|show|list|find|get|give|can|do|is|are|will|thank|thanks|yes|no)/i)) {
      searchTerm = userText.trim();
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
          filters: { category: matchedCategory.name },
          retrievedContext: retrievedDocs.map(doc => ({
            name: doc.metadata?.name,
            score: doc.score,
            documentId: doc.metadata?.documentId
          }))
        };
      }
    } catch (err) {
      // Ignore database errors, continue with search
      console.warn('Error checking category in ruleBasedInterpreter:', err.message);
    }
    
    // No category match, return search filter
    return {
      mode: 'action',
      targetService: 'menuItem',
      operation: 'list',
      filters: { search: searchTerm },
      retrievedContext: retrievedDocs.map(doc => ({
        name: doc.metadata?.name,
        score: doc.score,
        documentId: doc.metadata?.documentId
      }))
    };
  }
  
  // Handle category queries
  if (lowerText.match(/^(show|list|what)\s+(all\s+)?categories$/i) || 
      lowerText.match(/^categories$/i)) {
    return {
      mode: 'action',
      targetService: 'category',
      operation: 'list',
      filters: {},
      retrievedContext: []
    };
  }
  
  // Default: chat mode with helpful message
  return {
    mode: 'chat',
    message: 'How can I help you today? You can ask me about our menu items, search for specific dishes, or browse categories.',
    retrievedContext: []
  };
}

