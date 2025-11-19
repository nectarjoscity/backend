import VectorStore from '../models/VectorStore.js';
import { generateEmbedding } from './embeddingService.js';

/**
 * Add or update a document in the vector store
 * @param {Object} params - Document parameters
 * @param {string} params.content - Text content to embed
 * @param {Object} params.metadata - Metadata object
 * @param {string} params.metadata.type - Type: 'menuItem', 'category', or 'knowledge'
 * @param {mongoose.Types.ObjectId} params.metadata.documentId - Reference to original document
 * @returns {Promise<Object>} - Created/updated vector store document
 */
export async function upsertDocument({ content, metadata }) {
  if (!content || !metadata || !metadata.type || !metadata.documentId) {
    throw new Error('Content and metadata (type, documentId) are required');
  }

  // Generate embedding
  const embedding = await generateEmbedding(content);

  // Check if document already exists
  const existing = await VectorStore.findOne({
    'metadata.type': metadata.type,
    'metadata.documentId': metadata.documentId
  });

  if (existing) {
    // Update existing document
    existing.content = content;
    existing.embedding = embedding;
    existing.metadata = { ...existing.metadata, ...metadata };
    existing.version = (existing.version || 1) + 1;
    existing.indexedAt = new Date();
    return await existing.save();
  } else {
    // Create new document
    return await VectorStore.create({
      content,
      embedding,
      metadata
    });
  }
}

/**
 * Hybrid search: Combines keyword (MongoDB text search) + vector similarity
 * This is faster because keyword search filters candidates before expensive vector calculations
 * @param {string} queryText - Query text to search for
 * @param {Object} options - Search options
 * @param {number} options.topK - Number of results to return (default: 5)
 * @param {string} options.type - Filter by document type
 * @param {string} options.category - Filter by category
 * @param {number} options.minScore - Minimum similarity score (default: 0.5)
 * @param {number} options.keywordWeight - Weight for keyword score (0-1, default: 0.3)
 * @param {number} options.vectorWeight - Weight for vector score (0-1, default: 0.7)
 * @param {number} options.keywordLimit - Max candidates from keyword search (default: 50)
 * @returns {Promise<Array>} - Array of similar documents with scores
 */
export async function searchSimilar(queryText, options = {}) {
  const {
    topK = 5,
    type = null,
    category = null,
    minScore = 0.5,
    keywordWeight = 0.3,
    vectorWeight = 0.7,
    keywordLimit = 50
  } = options;

  if (!queryText || typeof queryText !== 'string' || queryText.trim().length === 0) {
    return [];
  }

  // Normalize weights
  const totalWeight = keywordWeight + vectorWeight;
  const normalizedKeywordWeight = keywordWeight / totalWeight;
  const normalizedVectorWeight = vectorWeight / totalWeight;

  // Build base filter
  const baseFilter = {};
  if (type) {
    baseFilter['metadata.type'] = type;
  }
  if (category) {
    baseFilter['metadata.category'] = category;
  }

  // STEP 1: Keyword search (fast MongoDB text search) - filters candidates
  // Also try regex search for exact matches in itemName field
  let keywordCandidates = [];
  
  // First, try exact match in itemName metadata field (case-insensitive)
  try {
    const exactMatchFilter = {
      ...baseFilter,
      $or: [
        { 'metadata.itemName': { $regex: queryText, $options: 'i' } },
        { 'metadata.name': { $regex: queryText, $options: 'i' } },
        { content: { $regex: queryText, $options: 'i' } }
      ]
    };
    
    const exactMatches = await VectorStore.find(exactMatchFilter)
      .limit(keywordLimit)
      .lean();
    
    if (exactMatches.length > 0) {
      // Boost exact matches by adding a high score
      keywordCandidates = exactMatches.map(doc => ({
        ...doc,
        score: 10 // High score for exact text matches
      }));
    }
  } catch (error) {
    console.warn('Error in exact match search:', error.message);
  }
  
  // Then try MongoDB text search
  if (keywordCandidates.length === 0) {
    try {
      const keywordFilter = {
        ...baseFilter,
        $text: { $search: queryText }
      };
      
      keywordCandidates = await VectorStore.find(keywordFilter, {
        score: { $meta: 'textScore' }
      })
        .sort({ score: { $meta: 'textScore' } })
        .limit(keywordLimit)
        .lean();
    } catch (error) {
      // If text index doesn't exist yet, fall back to vector-only search
      console.warn('Text index not found, using vector-only search:', error.message);
    }
  }

  // STEP 2: Generate query embedding for vector search
  let queryEmbedding;
  try {
    queryEmbedding = await generateEmbedding(queryText);
  } catch (error) {
    console.error('Failed to generate embedding for search, returning empty results:', error.message);
    return [];
  }

  // STEP 3: If keyword search found results, use them as candidates
  // Otherwise, fall back to all documents (vector-only mode)
  let candidates;
  if (keywordCandidates.length > 0) {
    // Use keyword-filtered candidates (much faster!)
    candidates = keywordCandidates;
  } else {
    // Fallback: sample documents matching base filter (limit to avoid timeouts)
    try {
      candidates = await VectorStore.find(baseFilter)
        .limit(500)
        .lean();
    } catch (error) {
      console.error('Failed to fetch fallback candidates:', error.message);
      return [];
    }
  }

  if (candidates.length === 0) {
    return [];
  }

  // STEP 4: Calculate hybrid scores (combine keyword + vector)
  const results = candidates.map(candidate => {
    // Vector similarity score (0 to 1)
    const vectorScore = cosineSimilarity(queryEmbedding, candidate.embedding);
    
    // Keyword score (normalized from MongoDB textScore, 0 to 1)
    // MongoDB textScore can be any positive number, normalize it
    const rawKeywordScore = candidate.score || 0;
    // Normalize: assume max textScore is around 10, but handle higher values
    const normalizedKeywordScore = Math.min(rawKeywordScore / 10, 1);
    
    // Hybrid score: weighted combination
    const hybridScore = (normalizedKeywordScore * normalizedKeywordWeight) + 
                        (vectorScore * normalizedVectorWeight);
    
    return {
      score: hybridScore,
      vectorScore: vectorScore,
      keywordScore: normalizedKeywordScore,
      content: candidate.content,
      metadata: candidate.metadata,
      documentId: candidate.metadata.documentId
    };
  });

  // STEP 5: Filter by minimum score and sort by hybrid score
  const filtered = results
    .filter(r => r.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);

  return filtered;
}

/**
 * Helper function for cosine similarity (imported from utils)
 */
function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    return 0;
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  return dotProduct / denominator;
}

/**
 * Delete documents by metadata filter
 * @param {Object} filter - MongoDB filter for metadata
 * @returns {Promise<number>} - Number of deleted documents
 */
export async function deleteDocuments(filter) {
  const result = await VectorStore.deleteMany(filter);
  return result.deletedCount;
}

/**
 * Get document count by type
 * @param {string} type - Document type
 * @returns {Promise<number>} - Count of documents
 */
export async function getDocumentCount(type = null) {
  const filter = type ? { 'metadata.type': type } : {};
  return await VectorStore.countDocuments(filter);
}

