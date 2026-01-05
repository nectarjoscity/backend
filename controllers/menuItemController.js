import * as MenuService from '../services/menuItemService.js';
import { reindexMenuItem } from '../services/knowledgeBaseService.js';
import MenuItem from '../models/MenuItem.js';
import Category from '../models/Category.js';
import OrderItem from '../models/OrderItem.js';
import mongoose from 'mongoose';
import { searchSimilar } from '../services/vectorStoreService.js';
import { uploadImageToCloudinary, deleteImageFromCloudinary, extractPublicIdFromUrl } from '../utils/uploadImage.js';

// Get trending/best-selling menu items (public endpoint)
export const getTrendingItems = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 5;

    // Aggregate order items to find most ordered menu items
    const trendingItems = await OrderItem.aggregate([
      {
        $group: {
          _id: '$menuItem',
          totalOrders: { $sum: '$quantity' }
        }
      },
      { $sort: { totalOrders: -1 } },
      { $limit: limit + 5 } // Get a few extra in case some are inactive
    ]);

    // Get the menu item details
    const menuItemIds = trendingItems.map(item => item._id);
    const menuItems = await MenuItem.find({
      _id: { $in: menuItemIds },
      isActive: true,
      isAvailable: true
    }).populate('category', 'name emoji').lean();

    // Create a map for quick lookup
    const menuItemMap = new Map(menuItems.map(item => [item._id.toString(), item]));

    // Build the response with order counts
    const result = trendingItems
      .map(item => {
        const menuItem = menuItemMap.get(item._id?.toString());
        if (!menuItem) return null;

        // Format order count nicely
        let ordersDisplay = item.totalOrders.toString();
        if (item.totalOrders >= 1000) {
          ordersDisplay = Math.floor(item.totalOrders / 1000) + 'K+';
        } else if (item.totalOrders >= 100) {
          ordersDisplay = Math.floor(item.totalOrders / 100) * 100 + '+';
        } else if (item.totalOrders >= 10) {
          ordersDisplay = Math.floor(item.totalOrders / 10) * 10 + '+';
        }

        return {
          _id: menuItem._id,
          name: menuItem.name,
          emoji: menuItem.emoji || '🍽️',
          imageUrl: menuItem.imageUrl,
          price: menuItem.price,
          category: menuItem.category?.name,
          orders: ordersDisplay,
          totalOrders: item.totalOrders
        };
      })
      .filter(Boolean)
      .slice(0, limit);

    return res.status(200).json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('Error fetching trending items:', error);
    return res.status(500).json({
      success: false,
      message: 'Error fetching trending items',
      error: error.message
    });
  }
};


export const createMenuItem = async (req, res) => {
  try {
    let imageUrl = req.body.imageUrl; // Use existing imageUrl if provided

    // If file is uploaded, upload to Cloudinary
    if (req.file) {
      try {
        const uploadResult = await uploadImageToCloudinary(req.file.buffer, {
          folder: 'nectarv/menu-items',
        });
        imageUrl = uploadResult.url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image. Please try again.',
        });
      }
    }

    const itemData = {
      ...req.body,
      imageUrl,
    };

    const item = await MenuService.createMenuItem(itemData);
    // Auto-index in vector store (non-blocking)
    reindexMenuItem(item._id).catch(err => console.error('Error indexing menu item:', err));
    return res.status(201).json({ success: true, message: 'Menu item created successfully', data: item });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({ success: false, message: error.message || 'Error creating menu item' });
  }
};

export const getMenuItems = async (req, res) => {
  try {
    const source = req.deepseekFilters || req.query;
    let filters = { category: source.category, active: source.active, available: source.available, search: source.search, name: source.name };
    const addToCart = source.addToCart === 'true' || source.addToCart === true;

    // If AI detected a category name, convert it to category ID
    // The AI now intelligently detects categories, so we just need to resolve the category name to ID
    if (filters.category && !mongoose.Types.ObjectId.isValid(filters.category)) {
      // It's a category name string from the AI - look it up
      const categoryName = String(filters.category).trim();
      const matchedCategory = await Category.findOne({
        name: categoryName, // Exact match (AI provides exact name)
        isActive: true
      });

      if (matchedCategory) {
        filters.category = matchedCategory._id;
      } else {
        // Category not found, clear it and use as search term instead
        if (!filters.search && !filters.name) {
          filters.search = categoryName;
        }
        filters.category = undefined;
      }
    }

    const items = await MenuService.getMenuItems(filters);
    const hasQuery = (filters.search && String(filters.search).trim() !== '') || (filters.name && String(filters.name).trim() !== '') || filters.category;

    // If this is an addToCart action and we found items, return with addToCart flag
    if (addToCart && items.length > 0) {
      return res.status(200).json({
        success: true,
        count: items.length,
        data: items,
        addToCart: true,
        message: `✅ Added ${items.length} item${items.length > 1 ? 's' : ''} to your cart! Would you like to add something else, or proceed to checkout?`
      });
    }

    // If no results, try to find information from RAG vector store (PDF content)
    if (hasQuery && items.length === 0) {
      const searchTerm = String(filters.name || filters.search || '').toLowerCase().trim();

      // First, check if we have retrieved context from RAG
      let relevantContext = [];
      if (req.retrievedContext && req.retrievedContext.length > 0) {
        // Prioritize knowledge type (PDF content) over menuItem type
        const knowledgeContext = req.retrievedContext.filter(ctx => ctx.type === 'knowledge');
        const otherContext = req.retrievedContext.filter(ctx => ctx.type !== 'knowledge');

        // Check knowledge context first (PDF content)
        // STRICT FILTERING: Only accept results that actually contain the search term
        relevantContext = knowledgeContext.filter(ctx => {
          const ctxName = (ctx.name || '').toLowerCase();
          const ctxContent = (ctx.content || '').toLowerCase();
          // Must contain the search term AND have a reasonable similarity score
          const containsSearchTerm = ctxName.includes(searchTerm) || ctxContent.includes(searchTerm);
          const hasGoodScore = ctx.score > 0.4; // Higher threshold - require at least 40% similarity
          return containsSearchTerm && hasGoodScore;
        });

        // If no knowledge context found, check other types
        if (relevantContext.length === 0) {
          relevantContext = otherContext.filter(ctx => {
            const ctxName = (ctx.name || '').toLowerCase();
            const ctxContent = (ctx.content || '').toLowerCase();
            // Must contain the search term AND have a reasonable similarity score
            const containsSearchTerm = ctxName.includes(searchTerm) || ctxContent.includes(searchTerm);
            const hasGoodScore = ctx.score > 0.5; // Higher threshold - require at least 50% similarity
            return containsSearchTerm && hasGoodScore;
          });
        }
      }

      // If no relevant context from request, search vector store directly
      if (relevantContext.length === 0 && searchTerm) {
        try {
          console.log('[DEBUG menuItemController] Searching vector store for:', searchTerm);

          // Search with reasonable threshold - only get relevant results
          let vectorResults = await searchSimilar(searchTerm, {
            topK: 10,
            minScore: 0.4, // Higher threshold - require at least 40% similarity
            type: 'knowledge' // Search PDF/knowledge content specifically
          });

          console.log('[DEBUG menuItemController] Strategy 1 results:', vectorResults.length);

          // Filter results to ensure they actually contain the search term
          const searchTermLower = searchTerm.toLowerCase();
          vectorResults = vectorResults.filter(doc => {
            const content = (doc.content || '').toLowerCase();
            const name = (doc.metadata?.name || doc.metadata?.section || '').toLowerCase();
            return content.includes(searchTermLower) || name.includes(searchTermLower);
          });

          console.log('[DEBUG menuItemController] After filtering for search term:', vectorResults.length);

          if (vectorResults.length > 0) {
            console.log('[DEBUG menuItemController] Found', vectorResults.length, 'knowledge base results');
            console.log('[DEBUG menuItemController] Top result score:', vectorResults[0].score);
            console.log('[DEBUG menuItemController] Top result preview:', (vectorResults[0].content || '').substring(0, 100));

            relevantContext = vectorResults.map(doc => ({
              name: doc.metadata?.name || doc.metadata?.section || '',
              content: doc.content || doc.metadata?.content || doc.metadata?.text || '',
              score: doc.score,
              documentId: doc.metadata?.documentId
            }));
          } else {
            console.log('[DEBUG menuItemController] No relevant knowledge base results found for:', searchTerm);
            console.log('[DEBUG menuItemController] This means the item is not in the PDF or the search term doesn\'t match.');
          }
        } catch (err) {
          console.warn('Error searching vector store for context:', err.message);
        }
      }

      if (relevantContext.length > 0) {
        const searchTermDisplay = filters.name || filters.search || 'items';
        const searchTermLower = searchTerm.toLowerCase();
        let foundItemName = null;
        let foundContent = null;

        // Look for the search term in the content - only use contexts that actually mention it
        for (const ctx of relevantContext) {
          const contentLower = (ctx.content || '').toLowerCase();
          const nameLower = (ctx.name || '').toLowerCase();

          // Check if the search term appears in the content or name
          if (contentLower.includes(searchTermLower) || nameLower.includes(searchTermLower)) {
            foundItemName = ctx.name || searchTermDisplay;
            foundContent = ctx.content;
            break;
          }
        }

        // If we found content mentioning the search term, return it
        if (foundContent) {
          // Extract relevant sentences that mention the search term
          const sentences = foundContent.split(/[.!?]\s+/);
          const relevantSentences = sentences.filter(s =>
            s.toLowerCase().includes(searchTermLower)
          ).slice(0, 3);

          let message = relevantSentences.length > 0
            ? relevantSentences.join('. ') + '.'
            : foundContent.substring(0, 300) + (foundContent.length > 300 ? '...' : '');

          // Limit message length
          if (message.length > 500) {
            message = message.substring(0, 500) + '...';
          }

          return res.status(200).json({
            success: true,
            count: 0,
            data: [],
            mode: 'chat',
            message: message,
            retrievedContext: relevantContext
          });
        }
      }

      // If we reach here, no relevant context was found - fall through to the "no results" handler below
    }

    if (hasQuery && items.length === 0) {
      const q = String(filters.name || filters.search || '');

      // If we searched by category but found no items, provide a helpful message
      if (filters.category && !filters.search && !filters.name) {
        const categoryDoc = await Category.findById(filters.category);
        const categoryName = categoryDoc?.name || 'this category';
        return res.status(200).json({
          success: true,
          count: 0,
          data: [],
          message: `We don't have any items available in ${categoryName} right now. Would you like to browse other categories?`
        });
      }

      // Get intelligent suggestions - items semantically related to the search term
      let suggestions = [];
      let suggestionItems = [];

      try {
        // Method 1: Use vector search to find semantically similar items
        const similarDocs = await searchSimilar(q, {
          topK: 5,
          minScore: 0.2, // Lower threshold to get more suggestions
          type: 'menuItem'
        });

        if (similarDocs.length > 0) {
          // Get the actual menu items from the vector store results
          const itemIds = similarDocs
            .map(doc => doc.metadata?.documentId)
            .filter(id => id)
            .slice(0, 3);

          if (itemIds.length > 0) {
            suggestionItems = await MenuItem.find({
              _id: { $in: itemIds },
              isActive: true,
              isAvailable: true
            })
              .select('name emoji description')
              .lean();
          }
        }

        // Method 2: If vector search didn't find enough, try fuzzy text matching
        if (suggestionItems.length < 3) {
          // Search for items that contain similar words or ingredients
          const searchWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);

          if (searchWords.length > 0) {
            // Build a regex pattern that matches any of the search words
            const pattern = searchWords.join('|');

            const fuzzyMatches = await MenuItem.find({
              isActive: true,
              isAvailable: true,
              $or: [
                { name: { $regex: pattern, $options: 'i' } },
                { description: { $regex: pattern, $options: 'i' } }
              ],
              // Exclude items we already have
              _id: suggestionItems.length > 0 ? { $nin: suggestionItems.map(i => i._id) } : undefined
            })
              .limit(3 - suggestionItems.length)
              .select('name emoji description')
              .lean();

            suggestionItems = [...suggestionItems, ...fuzzyMatches];
          }
        }

        // Method 3: If still not enough, try to find items from similar categories
        if (suggestionItems.length < 3) {
          // Try to find items that might be in related categories
          // Look for items with similar words in their description
          const searchWords = q.toLowerCase().split(/\s+/).filter(w => w.length > 2);

          if (searchWords.length > 0) {
            // Get items that might be related by searching descriptions more broadly
            const relatedItems = await MenuItem.find({
              isActive: true,
              isAvailable: true,
              description: { $regex: searchWords[0], $options: 'i' },
              _id: suggestionItems.length > 0 ? { $nin: suggestionItems.map(i => i._id) } : undefined
            })
              .limit(3 - suggestionItems.length)
              .select('name emoji description')
              .lean();

            suggestionItems = [...suggestionItems, ...relatedItems];
          }
        }

        // Extract just the names for suggestions
        suggestions = suggestionItems
          .slice(0, 3)
          .map(item => item.name)
          .filter(Boolean);

      } catch (err) {
        // Ignore errors, just continue without suggestions
        console.warn('Could not fetch intelligent suggestions:', err.message);
      }

      // Generate more human, conversational responses
      const responses = [
        `Hmm, I couldn't find "${q}" in our menu right now.`,
        `I don't see "${q}" available at the moment.`,
        `Sorry, we don't have "${q}" on the menu right now.`,
        `I couldn't find any items matching "${q}".`
      ];

      const randomResponse = responses[Math.floor(Math.random() * responses.length)];

      let message = randomResponse;

      if (suggestions.length > 0) {
        const suggestionText = suggestions.length === 1
          ? suggestions[0]
          : suggestions.slice(0, -1).join(', ') + ' or ' + suggestions[suggestions.length - 1];
        message += ` Would you like to try ${suggestionText} instead? Or you can browse our categories to see what we have!`;
      } else {
        message += ` Feel free to browse our categories or ask me about something else!`;
      }

      return res.status(200).json({
        success: true,
        count: 0,
        data: [],
        message: message,
        suggestions: suggestions
      });
    }
    return res.status(200).json({ success: true, count: items.length, data: items });
  } catch (error) {
    console.error('Error fetching menu items:', error);
    res.status(500).json({ message: 'Server Error' });
  }
};

export const getMenuItemById = async (req, res) => {
  try {
    const item = await MenuService.getMenuItemById(req.params.id);
    if (!item) return res.status(404).json({ success: false, message: 'Menu item not found' });
    return res.status(200).json({ success: true, data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error fetching menu item', error: error.message });
  }
};

export const updateMenuItem = async (req, res) => {
  try {
    // Get existing item to check for old image
    const existingItem = await MenuItem.findById(req.params.id);
    if (!existingItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    let imageUrl = req.body.imageUrl; // Use provided imageUrl or keep existing

    // If new file is uploaded, upload to Cloudinary
    if (req.file) {
      try {
        // Delete old image from Cloudinary if it exists
        if (existingItem.imageUrl) {
          const oldPublicId = extractPublicIdFromUrl(existingItem.imageUrl);
          if (oldPublicId) {
            await deleteImageFromCloudinary(oldPublicId).catch(err => {
              console.warn('Failed to delete old image from Cloudinary:', err);
            });
          }
        }

        // Upload new image
        const uploadResult = await uploadImageToCloudinary(req.file.buffer, {
          folder: 'nectarv/menu-items',
        });
        imageUrl = uploadResult.url;
      } catch (uploadError) {
        console.error('Cloudinary upload error:', uploadError);
        return res.status(500).json({
          success: false,
          message: 'Failed to upload image. Please try again.',
        });
      }
    } else if (req.body.imageUrl === undefined) {
      // If imageUrl is not provided and no file uploaded, keep existing
      imageUrl = existingItem.imageUrl;
    }

    const updateData = {
      ...req.body,
      imageUrl,
    };

    const item = await MenuService.updateMenuItem(req.params.id, updateData);
    if (!item) return res.status(404).json({ success: false, message: 'Menu item not found' });

    // Auto-reindex in vector store (non-blocking)
    reindexMenuItem(item._id).catch(err => console.error('Error reindexing menu item:', err));
    return res.status(200).json({ success: true, message: 'Menu item updated successfully', data: item });
  } catch (error) {
    const status = error.status || 400;
    return res.status(status).json({ success: false, message: error.message || 'Error updating menu item' });
  }
};

export const deleteMenuItem = async (req, res) => {
  try {
    // Get item before deletion to access imageUrl
    const existingItem = await MenuItem.findById(req.params.id);
    if (!existingItem) {
      return res.status(404).json({ success: false, message: 'Menu item not found' });
    }

    const item = await MenuService.deleteMenuItem(req.params.id, { soft: req.query.soft });
    if (!item) return res.status(404).json({ success: false, message: 'Menu item not found' });

    // If hard delete, remove image from Cloudinary
    if (req.query.soft !== 'true' && existingItem.imageUrl) {
      const publicId = extractPublicIdFromUrl(existingItem.imageUrl);
      if (publicId) {
        await deleteImageFromCloudinary(publicId).catch(err => {
          console.warn('Failed to delete image from Cloudinary:', err);
        });
      }
    }

    return res.status(200).json({ success: true, message: req.query.soft === 'true' ? 'Menu item deactivated' : 'Menu item deleted', data: item });
  } catch (error) {
    return res.status(500).json({ success: false, message: 'Error deleting menu item', error: error.message });
  }
};