import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/nectarv';

async function fixCategoryIndex() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const collection = db.collection('categories');

    // Get existing indexes
    const indexes = await collection.indexes();
    console.log('\n📋 Current indexes:', JSON.stringify(indexes, null, 2));

    // Drop the old unique index on 'name' if it exists
    try {
      await collection.dropIndex('name_1');
      console.log('\n✅ Dropped old unique index on "name"');
    } catch (error) {
      if (error.code === 27) {
        console.log('\n⚠️  Index "name_1" does not exist (already dropped)');
      } else {
        throw error;
      }
    }

    // The new compound index will be created automatically when the server restarts
    // due to the schema definition
    console.log('\n✅ Index fix complete!');
    console.log('ℹ️  The new compound index will be created when the server restarts.');
    console.log('ℹ️  This allows you to reuse category names after soft deletion.');

    await mongoose.connection.close();
    console.log('\n✅ Disconnected from MongoDB');
  } catch (error) {
    console.error('❌ Error fixing index:', error);
    process.exit(1);
  }
}

fixCategoryIndex();

