/**
 * Test script to verify embedding generation works correctly
 * Tests both OpenAI and local embeddings
 */

import dotenv from 'dotenv';
import { generateEmbedding, getEmbeddingProvider, getEmbeddingModel, EMBEDDING_DIMENSIONS } from '../services/embeddingService.js';

dotenv.config();

async function testEmbeddings() {
  console.log('🧪 Testing Embedding Service\n');
  console.log(`Provider: ${getEmbeddingProvider()}`);
  console.log(`Model: ${getEmbeddingModel()}`);
  console.log(`Dimensions: ${EMBEDDING_DIMENSIONS}\n`);

  const testTexts = [
    'Pizza Margherita',
    'Fresh tomato sauce, mozzarella, and basil',
    'Chocolate cake with vanilla ice cream'
  ];

  console.log('Testing single embedding generation...\n');

  for (const text of testTexts) {
    try {
      const start = Date.now();
      const embedding = await generateEmbedding(text);
      const duration = Date.now() - start;

      console.log(`✓ "${text.substring(0, 40)}..."`);
      console.log(`  Dimensions: ${embedding.length}`);
      console.log(`  Time: ${duration}ms`);
      console.log(`  Sample values: [${embedding.slice(0, 3).map(v => v.toFixed(4)).join(', ')}, ...]\n`);
    } catch (error) {
      console.error(`✗ Error embedding "${text}":`, error.message);
      console.error('');
    }
  }

  console.log('Testing batch embedding generation...\n');
  try {
    const { generateEmbeddings } = await import('../services/embeddingService.js');
    const start = Date.now();
    const embeddings = await generateEmbeddings(testTexts);
    const duration = Date.now() - start;

    console.log(`✓ Batch processed ${embeddings.length} texts`);
    console.log(`  Total time: ${duration}ms`);
    console.log(`  Average time per text: ${(duration / embeddings.length).toFixed(2)}ms\n`);

    // Verify all embeddings have correct dimensions
    const allCorrect = embeddings.every(e => e.length === EMBEDDING_DIMENSIONS);
    if (allCorrect) {
      console.log('✓ All embeddings have correct dimensions\n');
    } else {
      console.error('✗ Some embeddings have incorrect dimensions\n');
    }
  } catch (error) {
    console.error('✗ Error in batch embedding:', error.message);
    console.error('');
  }

  console.log('✅ Embedding test completed!\n');
}

// Run the test
testEmbeddings().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});

