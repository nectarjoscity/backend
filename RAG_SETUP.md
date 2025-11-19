# RAG System Setup Checklist

Follow these steps to get your RAG system up and running:

## ✅ Step 1: Add DeepSeek API Key

1. Get a DeepSeek API key from: https://platform.deepseek.com/api_keys
2. Add it to your `.env` file:
   ```env
   DEEPSEEK_API_KEY=sk-your-deepseek-api-key-here
   ```
   
   **Note:** The system also accepts `OPENAI_API_KEY` as a fallback for compatibility.

## ✅ Step 2: Index Your Knowledge Base

Run the indexing script to create vector embeddings for all your menu items and categories:

```bash
cd backend
npm run index:kb
```

This will:
- Index all active categories
- Index all active menu items
- Create vector embeddings for semantic search

**Expected output:**
```
Connected to MongoDB
=== Indexing Knowledge Base ===

Categories: X indexed, 0 errors
Menu items: Y indexed, 0 errors

=== Indexing Complete ===
Total documents indexed: Z
Total errors: 0
```

## ✅ Step 3: Verify the Setup

1. Make sure your backend server is running:
   ```bash
   npm run dev
   ```

2. Test the RAG system by making a request to `/api/nlp`:
   ```bash
   curl -X POST http://localhost:5000/api/nlp \
     -H "Content-Type: application/json" \
     -d '{"text": "Show me healthy options"}'
   ```

## ✅ Step 4: Test in Your Frontend

The RAG system is automatically integrated into your existing `/api/nlp` endpoint. Your frontend should work without any changes!

Try queries like:
- "Show me healthy options"
- "What spicy dishes do you have?"
- "I want something light"
- "Show me all menu items"

## 🔄 Ongoing Maintenance

### Auto-Indexing
- ✅ New menu items are automatically indexed when created
- ✅ Updated menu items are automatically re-indexed
- ✅ New categories are automatically indexed
- ✅ Updated categories are automatically re-indexed

### Manual Re-indexing
If you need to re-index everything (e.g., after bulk updates):

```bash
npm run index:kb
```

### Re-indexing Specific Items
You can programmatically re-index specific items:

```javascript
import { reindexMenuItem, reindexCategory } from './services/knowledgeBaseService.js';

// Re-index a menu item
await reindexMenuItem(menuItemId);

// Re-index a category  
await reindexCategory(categoryId);
```

## 🐛 Troubleshooting

### Error: "DEEPSEEK_API_KEY is not set"
- Make sure you've added `DEEPSEEK_API_KEY` (or `OPENAI_API_KEY`) to your `.env` file
- Restart your server after adding the key

### Error: "Failed to generate embedding"
- Check your DeepSeek API key is valid
- Ensure you have credits in your DeepSeek account
- Check your internet connection
- Verify the API endpoint is accessible

### No results or poor quality results
- Make sure you've run `npm run index:kb` first
- Check that your menu items have descriptive names and descriptions
- Verify MongoDB connection is working

### Slow performance
- Vector search adds ~200-500ms per query (normal)
- Consider caching frequent queries in the future
- Ensure MongoDB indexes are created (they should be automatic)

## 📊 Monitoring

Check how many documents are indexed:

```javascript
import { getDocumentCount } from './services/vectorStoreService.js';

const menuItemCount = await getDocumentCount('menuItem');
const categoryCount = await getDocumentCount('category');
console.log(`Menu items: ${menuItemCount}, Categories: ${categoryCount}`);
```

## 🎯 What's Different Now?

**Before (Old System):**
- AI responded based on general knowledge
- No access to actual menu data
- Could hallucinate menu items

**Now (RAG System):**
- ✅ Retrieves actual menu items from your database
- ✅ Responses grounded in real data
- ✅ More accurate recommendations
- ✅ Better understanding of your specific menu

The API interface remains the same - no frontend changes needed!

