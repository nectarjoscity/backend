import dotenv from 'dotenv';
import { pipeline } from '@xenova/transformers';
import OpenAI from 'openai';

dotenv.config();

// Configuration
const USE_OPENAI = process.env.USE_OPENAI_EMBEDDINGS !== 'false' && !!process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_EMBEDDING_MODEL || 'text-embedding-3-small'; // Options: text-embedding-3-small (1536 dims) or text-embedding-3-large (3072 dims)

// Local embeddings model (fallback)
const LOCAL_EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
const LOCAL_EMBEDDING_DIMENSIONS = 384;

// OpenAI embedding dimensions
const OPENAI_EMBEDDING_DIMENSIONS = OPENAI_MODEL === 'text-embedding-3-large' ? 3072 : 1536;

// Determine which dimensions to use based on provider
export const EMBEDDING_DIMENSIONS = USE_OPENAI ? OPENAI_EMBEDDING_DIMENSIONS : LOCAL_EMBEDDING_DIMENSIONS;

// Initialize OpenAI client (lazy load on first use)
let openaiClient = null;

// Initialize local embedding pipeline (lazy load on first use)
let embeddingPipeline = null;

/**
 * Get or initialize the OpenAI client
 */
function getOpenAIClient() {
  if (!openaiClient && process.env.OPENAI_API_KEY) {
    openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
  return openaiClient;
}

/**
 * Get or initialize the local embedding pipeline
 * Model downloads automatically on first use (~90MB) and caches locally
 */
async function getLocalEmbeddingPipeline() {
  if (!embeddingPipeline) {
    console.log('Loading local embedding model (first time only, ~90MB download)...');
    embeddingPipeline = await pipeline('feature-extraction', LOCAL_EMBEDDING_MODEL, {
      quantized: true, // Use quantized model for faster loading and smaller size
    });
    console.log('Local embedding model loaded successfully!');
  }
  return embeddingPipeline;
}

/**
 * Generate embedding using OpenAI API
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector
 */
async function generateOpenAIEmbedding(text) {
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY is not set');
  }

  try {
    const response = await client.embeddings.create({
      model: OPENAI_MODEL,
      input: text.trim(),
    });

    // Extract embedding from response
    if (response && response.data && response.data[0] && response.data[0].embedding) {
      return response.data[0].embedding;
    } else {
      throw new Error('Unexpected response format from OpenAI');
    }
  } catch (error) {
    console.error('OpenAI embedding error:', error.message);
    throw new Error(`Failed to generate OpenAI embedding: ${error.message}`);
  }
}

/**
 * Generate embedding using local model
 * @param {string} text - Text to embed
 * @returns {Promise<number[]>} - Embedding vector (384 dimensions)
 */
async function generateLocalEmbedding(text) {
  try {
    const extractor = await getLocalEmbeddingPipeline();
    const result = await extractor(text.trim(), {
      pooling: 'mean', // Mean pooling for sentence embeddings
      normalize: true, // Normalize embeddings
    });

    // Convert to regular array
    if (result && result.data) {
      return Array.from(result.data);
    } else if (Array.isArray(result)) {
      return result;
    } else {
      // Fallback: try to convert whatever we got
      return Array.from(result);
    }
  } catch (error) {
    console.error('Local embedding error:', error);
    throw new Error(`Failed to generate local embedding: ${error.message}`);
  }
}

/**
 * Generate embeddings for a text string
 * Uses OpenAI if available and configured, otherwise falls back to local model
 * @param {string} text - Text to embed
 * @param {Object} options - Options
 * @param {boolean} options.forceLocal - Force use of local model even if OpenAI is available
 * @returns {Promise<number[]>} - Embedding vector
 */
export async function generateEmbedding(text, options = {}) {
  if (!text || typeof text !== 'string' || text.trim().length === 0) {
    throw new Error('Text must be a non-empty string');
  }

  const { forceLocal = false } = options;
  const useOpenAI = USE_OPENAI && !forceLocal;

  // Try OpenAI first if configured
  if (useOpenAI) {
    try {
      const embedding = await generateOpenAIEmbedding(text);
      // Log provider on first use (can be removed in production)
      if (!embeddingPipeline) {
        console.log(`✓ Using OpenAI embeddings (${OPENAI_MODEL}, ${OPENAI_EMBEDDING_DIMENSIONS} dimensions)`);
      }
      return embedding;
    } catch (error) {
      console.warn('OpenAI embedding failed, falling back to local model:', error.message);
      // Fall through to local embedding
    }
  }

  // Use local embedding (either as fallback or primary)
  const embedding = await generateLocalEmbedding(text);
  // Log provider on first use (can be removed in production)
  if (!embeddingPipeline) {
    console.log(`✓ Using local embeddings (${LOCAL_EMBEDDING_MODEL}, ${LOCAL_EMBEDDING_DIMENSIONS} dimensions)`);
  }
  return embedding;
}

/**
 * Generate embeddings for multiple texts in batch
 * @param {string[]} texts - Array of texts to embed
 * @param {Object} options - Options
 * @param {boolean} options.forceLocal - Force use of local model even if OpenAI is available
 * @returns {Promise<number[][]>} - Array of embedding vectors
 */
export async function generateEmbeddings(texts, options = {}) {
  if (!Array.isArray(texts) || texts.length === 0) {
    throw new Error('Texts must be a non-empty array');
  }

  const { forceLocal = false } = options;
  const useOpenAI = USE_OPENAI && !forceLocal;

  // OpenAI supports batch processing natively
  if (useOpenAI && texts.length > 1) {
    try {
      const client = getOpenAIClient();
      if (!client) {
        throw new Error('OPENAI_API_KEY is not set');
      }

      const response = await client.embeddings.create({
        model: OPENAI_MODEL,
        input: texts.map(t => t.trim()),
      });

      // Handle batch results - OpenAI returns an array of embedding objects
      if (response && response.data && Array.isArray(response.data)) {
        return response.data.map(item => item.embedding);
      } else {
        throw new Error('Unexpected batch response format from OpenAI');
      }
    } catch (error) {
      console.warn('OpenAI batch embedding failed, falling back to local model:', error.message);
      // Fall through to local processing
    }
  }

  // Process all texts with local model (or as fallback)
  // Note: If OpenAI failed, we still want to try local, so don't forceLocal here
  const embeddings = [];
  for (const text of texts) {
    const embedding = await generateEmbedding(text, { forceLocal });
    embeddings.push(embedding);
  }
  return embeddings;
}

/**
 * Get the current embedding provider being used
 * @returns {string} - 'openai' or 'local'
 */
export function getEmbeddingProvider() {
  return USE_OPENAI ? 'openai' : 'local';
}

/**
 * Get the current embedding model name
 * @returns {string} - Model name
 */
export function getEmbeddingModel() {
  return USE_OPENAI ? OPENAI_MODEL : LOCAL_EMBEDDING_MODEL;
}
