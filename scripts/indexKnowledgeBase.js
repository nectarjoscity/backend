import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { indexKnowledgeBase } from '../services/knowledgeBaseService.js';

dotenv.config();

async function run() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/nectarv';
    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Check for DeepSeek API key
    const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
    if (!apiKey) {
      console.error('ERROR: DEEPSEEK_API_KEY or OPENAI_API_KEY is not set in environment variables');
      console.error('Please set DEEPSEEK_API_KEY in your .env file');
      process.exit(1);
    }

    // Index knowledge base
    console.log('\n=== Indexing Knowledge Base ===\n');
    const result = await indexKnowledgeBase();

    console.log('\n=== Indexing Complete ===');
    console.log(`Total documents indexed: ${result.totalIndexed}`);
    console.log(`Total errors: ${result.totalErrors}`);
    console.log(`\nCategories: ${result.categories.indexed}/${result.categories.total}`);
    console.log(`Menu Items: ${result.menuItems.indexed}/${result.menuItems.total}`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

run();

