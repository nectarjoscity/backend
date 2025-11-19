#!/usr/bin/env node
// Increase Node.js memory limit for large PDF processing
process.env.NODE_OPTIONS = process.env.NODE_OPTIONS || '--max-old-space-size=4096';

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { indexMenuPDF } from '../services/pdfService.js';

dotenv.config();

async function run() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nectarv';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check for embedding API key (OpenAI or Hugging Face)
    const hasOpenAI = !!process.env.OPENAI_API_KEY;
    const hasHuggingFace = !!process.env.HUGGINGFACE_API_KEY;
    
    if (!hasOpenAI && !hasHuggingFace) {
      console.error('ERROR: No embedding API key found');
      console.error('Please set one of the following in your .env file:');
      console.error('  - OPENAI_API_KEY (recommended, uses OpenAI embeddings)');
      console.error('  - HUGGINGFACE_API_KEY (free alternative)');
      process.exit(1);
    }
    
    if (hasOpenAI) {
      console.log('✓ Using OpenAI embeddings');
    } else if (hasHuggingFace) {
      console.log('✓ Using Hugging Face embeddings');
    }

    // Index PDF
    console.log('\n=== Indexing Menu.pdf ===\n');
    const result = await indexMenuPDF();

    console.log('\n=== PDF Indexing Complete ===');
    console.log(`Total chunks indexed: ${result.indexed}`);
    console.log(`Total errors: ${result.errors}`);
    console.log(`Sections found: ${result.sections}`);
    console.log(`Text length: ${result.textLength} characters`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();

