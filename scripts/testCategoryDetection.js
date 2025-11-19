import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from '../models/Category.js';

dotenv.config();

async function testCategoryDetection() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('Connected to MongoDB\n');

    // Get all active categories
    const categories = await Category.find({ isActive: true }).select('name').lean();
    console.log('Active categories:', categories.map(c => c.name));
    console.log('');

    // Test the query pattern
    const query = 'what drinks do you have';
    const lower = query.toLowerCase().trim();
    
    console.log(`Testing query: "${query}"\n`);

    // Test the regex pattern used in preParse
    const match = lower.match(/(?:what|show\s+me|do\s+you\s+have)\s+(\w+)/i);
    console.log('Regex match result:', match);
    
    if (match) {
      const searchTerm = match[1];
      console.log(`Extracted search term: "${searchTerm}"\n`);

      // Test category matching
      const searchLower = searchTerm.toLowerCase().trim();
      console.log(`Searching for category: "${searchLower}"\n`);

      let matchedCategory = await Category.findOne({
        $or: [
          { name: { $regex: new RegExp(`^${searchLower}$`, 'i') }, isActive: true },
          { name: { $regex: new RegExp(searchLower, 'i') }, isActive: true }
        ]
      });

      console.log('Direct match:', matchedCategory ? matchedCategory.name : 'None');

      // Test singular/plural variations
      if (!matchedCategory) {
        const singular = searchLower.replace(/s$/, '');
        const plural = searchLower + 's';
        const variations = [singular, plural].filter(v => v !== searchLower);
        
        console.log(`\nTesting variations: ${variations.join(', ')}`);
        
        for (const variation of variations) {
          const cat = await Category.findOne({
            $or: [
              { name: { $regex: new RegExp(`^${variation}$`, 'i') }, isActive: true },
              { name: { $regex: new RegExp(variation, 'i') }, isActive: true }
            ]
          });
          
          if (cat) {
            matchedCategory = cat;
            console.log(`Found match: "${cat.name}" (variation: "${variation}")`);
            break;
          }
        }
      }

      if (matchedCategory) {
        console.log(`\n✅ Category detected: "${matchedCategory.name}"`);
      } else {
        console.log('\n❌ No category match found');
      }
    } else {
      console.log('❌ Regex pattern did not match');
    }

    await mongoose.disconnect();
  } catch (err) {
    console.error('Error:', err);
    process.exit(1);
  }
}

testCategoryDetection();

