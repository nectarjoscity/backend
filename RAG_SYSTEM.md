# RAG (Retrieval-Augmented Generation) System

This document describes the RAG system implementation for NectarV backend, which replaces the previous AI system with a context-aware retrieval-augmented generation approach.

## Overview

The RAG system enhances the AI assistant by:
1. **Retrieving relevant context** from a vector store containing menu items and categories
2. **Augmenting prompts** with retrieved context for more accurate responses
3. **Generating responses** using DeepSeek LLM with context-aware information

## Architecture

### Components

1. **Embedding Service** (`services/embeddingService.js`)
   - Generates vector embeddings using DeepSeek's `deepseek-embedding` model
   - Converts text into 1024-dimensional vectors for semantic search

2. **Vector Store** (`models/VectorStore.js`)
   - MongoDB model storing embeddings with metadata
   - Indexes menu items, categories, and knowledge base entries

3. **Vector Store Service** (`services/vectorStoreService.js`)
   - Manages document upserts and searches
   - Performs cosine similarity search to find relevant documents

4. **RAG Service** (`services/ragService.js`)
   - Combines retrieval with generation
   - Enhances prompts with retrieved context
   - Maintains compatibility with existing API structure

5. **Knowledge Base Service** (`services/knowledgeBaseService.js`)
   - Indexes menu items and categories
   - Provides utilities for re-indexing documents

## Setup

### 1. Environment Variables

Add the following to your `.env` file:

```env
DEEPSEEK_API_KEY=your_deepseek_api_key_here
```

You can get an API key from [DeepSeek Platform](https://platform.deepseek.com/api_keys).

**Note:** The system also accepts `OPENAI_API_KEY` as a fallback for compatibility.

### 2. Initial Indexing

Before using the RAG system, you need to index your existing menu items and categories:

```bash
npm run index:kb
```

This will:
- Index all active categories
- Index all active menu items
- Create vector embeddings for semantic search

### 3. Auto-Indexing

The system automatically indexes new and updated menu items and categories:
- When a menu item is created or updated, it's automatically indexed
- When a category is created or updated, it's automatically indexed
- Indexing happens asynchronously (non-blocking)

## Usage

### API Endpoint

The RAG system is integrated into the existing `/api/nlp` endpoint:

```bash
POST /api/nlp
Content-Type: application/json

{
  "text": "Show me healthy options",
  "messages": []
}
```

### How It Works

1. **Query Processing**: User query is received
2. **Vector Search**: System searches vector store for similar menu items/categories
3. **Context Retrieval**: Top 5 most relevant documents are retrieved (min similarity: 0.3)
4. **Prompt Augmentation**: Retrieved context is added to the LLM prompt
5. **Response Generation**: DeepSeek generates response with context awareness
6. **Routing**: Response is interpreted and routed to appropriate controllers

### Example Flow

```
User: "I want something light and healthy"

1. Vector search finds:
   - Grilled Salmon (score: 0.85)
   - Quinoa Salad (score: 0.82)
   - Veggie Bowl (score: 0.78)

2. Context added to prompt:
   "[1] Grilled Salmon (Price: NGN 2500) - Fresh salmon..."
   "[2] Quinoa Salad (Price: NGN 1800) - Healthy grains..."

3. LLM generates response with accurate menu information

4. System routes to menuItem controller with appropriate filters
```

## Benefits Over Previous System

1. **Context Awareness**: Responses are based on actual menu data, not just general knowledge
2. **Accuracy**: Reduces hallucinations by grounding responses in retrieved documents
3. **Relevance**: Semantic search finds items even with different wording
4. **Maintainability**: Easy to update knowledge base by re-indexing

## Maintenance

### Re-indexing

If you need to re-index everything:

```bash
npm run index:kb
```

### Re-indexing Specific Items

```javascript
import { reindexMenuItem, reindexCategory } from './services/knowledgeBaseService.js';

// Re-index a menu item
await reindexMenuItem(menuItemId);

// Re-index a category
await reindexCategory(categoryId);
```

### Checking Index Status

```javascript
import { getDocumentCount } from './services/vectorStoreService.js';

const menuItemCount = await getDocumentCount('menuItem');
const categoryCount = await getDocumentCount('category');
console.log(`Menu items: ${menuItemCount}, Categories: ${categoryCount}`);
```

## Configuration

### Similarity Thresholds

In `services/ragService.js`, you can adjust:

- `topK`: Number of documents to retrieve (default: 5)
- `minScore`: Minimum similarity score (default: 0.3)

### Embedding Model

The system uses DeepSeek's `deepseek-embedding` model (1024 dimensions). To change:

1. Update `EMBEDDING_MODEL` in `services/embeddingService.js`
2. Update `EMBEDDING_DIMENSIONS` accordingly
3. Update `DEEPSEEK_API_BASE` if using a different endpoint
4. Re-index all documents

## Troubleshooting

### "OPENAI_API_KEY is not set"

Make sure you've added `OPENAI_API_KEY` to your `.env` file.

### Low Quality Results

1. Ensure knowledge base is indexed: `npm run index:kb`
2. Check that menu items have descriptive names and descriptions
3. Adjust `minScore` threshold in `ragService.js`

### Slow Performance

1. Vector search is performed on every query - consider caching
2. Embedding generation takes ~200-500ms per query
3. Consider batch processing for bulk operations

## Future Enhancements

- [ ] Support for custom knowledge base entries
- [ ] Hybrid search (keyword + semantic)
- [ ] Caching of frequent queries
- [ ] Support for multiple embedding providers
- [ ] Fine-tuning similarity thresholds per query type

