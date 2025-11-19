/**
 * Calculate cosine similarity between two vectors
 * @param {number[]} vecA - First vector
 * @param {number[]} vecB - Second vector
 * @returns {number} - Cosine similarity score (0 to 1)
 */
export function cosineSimilarity(vecA, vecB) {
  if (!vecA || !vecB || vecA.length !== vecB.length) {
    throw new Error('Vectors must have the same length');
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
 * Find top K most similar vectors
 * @param {number[]} queryVector - Query vector
 * @param {Array<{vector: number[], metadata: any}>} candidates - Array of candidate vectors with metadata
 * @param {number} topK - Number of top results to return
 * @returns {Array<{score: number, metadata: any}>} - Top K results sorted by similarity
 */
export function findTopSimilar(queryVector, candidates, topK = 5) {
  if (!queryVector || !candidates || candidates.length === 0) {
    return [];
  }

  const similarities = candidates.map(candidate => ({
    score: cosineSimilarity(queryVector, candidate.vector),
    metadata: candidate.metadata
  }));

  // Sort by similarity score (descending)
  similarities.sort((a, b) => b.score - a.score);

  // Return top K results
  return similarities.slice(0, topK);
}

/**
 * Normalize a vector to unit length
 * @param {number[]} vector - Vector to normalize
 * @returns {number[]} - Normalized vector
 */
export function normalizeVector(vector) {
  const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
  if (magnitude === 0) return vector;
  return vector.map(val => val / magnitude);
}

