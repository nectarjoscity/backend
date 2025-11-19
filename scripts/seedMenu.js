import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Category from '../models/Category.js';
import MenuItem from '../models/MenuItem.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/nectarv';

const categoriesData = [
  { name: '🥗 Fresh Salads', description: 'Healthy and nutritious salad bowls', emoji: '🥗', isActive: true },
  { name: '🍲 Hearty Bowls', description: 'Filling and satisfying meal bowls', emoji: '🍲', isActive: true },
  { name: '🍣 Sushi & Rolls', description: 'Freshly prepared sushi and rolls', emoji: '🍣', isActive: true },
  { name: '🥤 Fresh Beverages', description: 'Refreshing smoothies and drinks', emoji: '🥤', isActive: true },
];

const rawMenuData = {
  '🥗 Fresh Salads': [
    { name: 'Mediterranean Bowl', price: '₦14.99', description: 'Fresh greens, olives, feta, tomatoes, cucumber with herb dressing', emoji: '🥗' },
    { name: 'Quinoa Power Salad', price: '₦16.99', description: 'Quinoa, kale, avocado, nuts, dried cranberries with lemon vinaigrette', emoji: '🌱' },
    { name: 'Caesar Supreme', price: '₦13.99', description: 'Crisp romaine, parmesan, croutons with our signature caesar dressing', emoji: '🥬' },
  ],
  '🍲 Hearty Bowls': [
    { name: 'Buddha Bowl', price: '₦18.99', description: 'Brown rice, roasted vegetables, chickpeas, tahini sauce', emoji: '🍲' },
    { name: 'Protein Power Bowl', price: '₦19.99', description: 'Grilled chicken, sweet potato, broccoli, quinoa with pesto', emoji: '💪' },
    { name: 'Vegan Delight', price: '₦17.99', description: 'Tofu, edamame, carrots, brown rice with ginger-soy glaze', emoji: '🌿' },
  ],
  '🍣 Sushi & Rolls': [
    { name: 'California Roll', price: '₦22.99', description: 'Crab, avocado, cucumber, and nori, rolled with sushi rice', emoji: '🍣' },
    { name: 'Spicy Tuna Roll', price: '₦24.99', description: 'Fresh tuna, spicy mayo, and cucumber, rolled with sushi rice', emoji: '🌶️' },
    { name: 'Salmon Nigiri', price: '₦20.99', description: 'Fresh salmon over seasoned sushi rice', emoji: '🍣' },
  ],
  '🥤 Fresh Beverages': [
    { name: 'Green Goddess Smoothie', price: '₦8.99', description: 'Spinach, banana, mango, coconut water, chia seeds', emoji: '🥤' },
    { name: 'Antioxidant Blast', price: '₦9.99', description: 'Blueberries, acai, banana, almond milk, honey', emoji: '🫐' },
    { name: 'Tropical Paradise', price: '₦8.99', description: 'Pineapple, mango, coconut, lime, mint', emoji: '🥥' },
  ],
};

const toNumber = (price) => {
  if (typeof price === 'number') return price;
  const n = parseFloat(String(price).replace(/[^\d.]/g, ''));
  if (Number.isNaN(n)) throw new Error(`Invalid price value: ${price}`);
  return n;
};

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  // Upsert categories
  const categoryMap = new Map();
  for (const cat of categoriesData) {
    const res = await Category.findOneAndUpdate(
      { name: cat.name },
      { $set: cat },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );
    categoryMap.set(cat.name, res._id);
  }
  console.log(`Upserted ${categoryMap.size} categories.`);

  // Upsert menu items for each category
  let itemCount = 0;
  for (const [catName, items] of Object.entries(rawMenuData)) {
    const categoryId = categoryMap.get(catName);
    if (!categoryId) {
      console.warn(`Category not found for ${catName}, skipping its items`);
      continue;
    }

    for (const it of items) {
      const update = {
        description: it.description,
        emoji: it.emoji,
        price: toNumber(it.price),
        currency: 'NGN',
        isAvailable: true,
        isActive: true,
        category: categoryId,
      };

      await MenuItem.findOneAndUpdate(
        { name: it.name, category: categoryId },
        { $set: update, $setOnInsert: { name: it.name } },
        { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
      );
      itemCount += 1;
    }
  }
  console.log(`Upserted ${itemCount} menu items.`);

  await mongoose.disconnect();
  console.log('Seeding completed.');
}

seed().catch(async (err) => {
  console.error('Seeding error:', err);
  try { await mongoose.disconnect(); } catch {}
  process.exit(1);
});