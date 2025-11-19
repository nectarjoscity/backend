# OpenAI Embeddings Integration

This document describes the OpenAI embeddings integration for the RAG system.

## Overview

The embedding service now supports **OpenAI embeddings** with automatic fallback to **local embeddings**. This provides:

- **Better quality**: OpenAI's `text-embedding-3-small` (1536 dimensions) or `text-embedding-3-large` (3072 dimensions) provide superior semantic understanding
- **Reliability**: Automatic fallback to local embeddings if OpenAI API is unavailable
- **Flexibility**: Configurable via environment variables

## Configuration

### Environment Variables

Add to your `.env` file:

```env
# Required: OpenAI API Key
OPENAI_API_KEY=your_openai_api_key_here

# Optional: Choose embedding model (default: text-embedding-3-small)
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
# Options:
# - text-embedding-3-small (1536 dimensions) - Recommended, faster and cheaper
# - text-embedding-3-large (3072 dimensions) - Higher quality, more expensive

# Optional: Disable OpenAI embeddings (use local only)
USE_OPENAI_EMBEDDINGS=false
```

### Model Comparison

| Model | Dimensions | Quality | Speed | Cost |
|-------|-----------|---------|-------|------|
| `text-embedding-3-small` | 1536 | High | Fast | Low |
| `text-embedding-3-large` | 3072 | Very High | Slower | Higher |
| Local (`all-MiniLM-L6-v2`) | 384 | Good | Fast | Free |

## How It Works

1. **Primary**: If `OPENAI_API_KEY` is set and `USE_OPENAI_EMBEDDINGS !== 'false'`, the system uses OpenAI embeddings
2. **Fallback**: If OpenAI API fails or is unavailable, automatically falls back to local embeddings
3. **Batch Processing**: OpenAI supports native batch processing for better performance

## Migration from Local to OpenAI Embeddings

⚠️ **Important**: If you switch from local embeddings (384 dims) to OpenAI embeddings (1536 dims), you need to **re-index your vector store** because the embedding dimensions are different.

### Steps to Migrate

1. **Backup your data** (optional but recommended):
   ```bash
   mongodump --db=your_database_name --collection=vectorstores
   ```

2. **Set OpenAI API key** in `.env`:
   ```env
   OPENAI_API_KEY=your_key_here
   ```

3. **Re-index your knowledge base**:
   ```bash
   npm run index:kb
   ```

4. **Re-index PDF content** (if applicable):
   ```bash
   npm run index:pdf
   ```

### Testing

Test the embedding service:

```bash
node scripts/testEmbeddings.js
```

This will:
- Show which provider is being used
- Test single embedding generation
- Test batch embedding generation
- Verify embedding dimensions

## API Usage

### Single Embedding

```javascript
import { generateEmbedding } from './services/embeddingService.js';

const embedding = await generateEmbedding('Pizza Margherita');
console.log(`Dimensions: ${embedding.length}`); // 1536 for OpenAI, 384 for local
```

### Batch Embeddings

```javascript
import { generateEmbeddings } from './services/embeddingService.js';

const texts = ['Pizza', 'Burger', 'Salad'];
const embeddings = await generateEmbeddings(texts);
```

### Force Local Embeddings

```javascript
// Force local even if OpenAI is configured
const embedding = await generateEmbedding('Text', { forceLocal: true });
```

### Check Current Provider

```javascript
import { getEmbeddingProvider, getEmbeddingModel, EMBEDDING_DIMENSIONS } from './services/embeddingService.js';

console.log(`Provider: ${getEmbeddingProvider()}`); // 'openai' or 'local'
console.log(`Model: ${getEmbeddingModel()}`);
console.log(`Dimensions: ${EMBEDDING_DIMENSIONS}`);
```

## Cost Considerations

OpenAI embeddings are priced per token:
- `text-embedding-3-small`: $0.02 per 1M tokens
- `text-embedding-3-large`: $0.13 per 1M tokens

**Example**: Indexing 10,000 menu items (~50 tokens each = 500,000 tokens):
- Small model: ~$0.01
- Large model: ~$0.065

## Troubleshooting

### "429 You exceeded your current quota"

Your OpenAI account has exceeded its quota. The system will automatically fall back to local embeddings.

**Solutions**:
1. Check your OpenAI billing/usage dashboard
2. Upgrade your OpenAI plan
3. The system will continue working with local embeddings

### "OPENAI_API_KEY is not set"

The API key is missing. The system will use local embeddings.

**Solution**: Add `OPENAI_API_KEY` to your `.env` file.

### Embedding dimensions mismatch

If you see errors about dimension mismatches, you likely have old embeddings in your database.

**Solution**: Re-index your vector store (see Migration section above).

## Best Practices

1. **Start with `text-embedding-3-small`**: It provides excellent quality at a lower cost
2. **Monitor usage**: Keep track of your OpenAI API usage
3. **Use batch processing**: When indexing multiple items, use `generateEmbeddings()` for better performance
4. **Keep local fallback**: Don't disable local embeddings - they provide reliability
5. **Re-index after switching**: Always re-index when changing embedding providers

