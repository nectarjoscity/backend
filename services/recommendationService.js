import OpenAI from 'openai';
import MenuItem from '../models/MenuItem.js';
import Category from '../models/Category.js';
import dotenv from 'dotenv';

dotenv.config();

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

/**
 * Get AI-powered meal recommendations based on selected items
 * @param {Array} selectedItems - Array of selected menu item objects
 * @param {Object} options - Optional configuration
 * @param {Array} options.excludeItemIds - Array of item IDs to exclude (already shown recommendations)
 * @param {string} options.targetCategory - If specified, only recommend for this category
 * @param {Object} options.preferences - User preferences for recommendations
 * @returns {Object} Recommendations grouped by meal component
 */
export async function getRecommendations(selectedItems, options = {}) {
    const { excludeItemIds = [], targetCategory = null, preferences = {} } = options;
    try {
        // Fetch all available menu items with their categories
        const allItems = await MenuItem.find({ isActive: true, isAvailable: true })
            .populate('category', 'name emoji')
            .lean();

        const categories = await Category.find({ isActive: true }).lean();

        // Get IDs of selected items to exclude from recommendations
        const selectedIds = selectedItems.map(item => item._id?.toString() || item.id?.toString());

        // Combine with already-shown items to exclude
        const allExcludeIds = [...new Set([...selectedIds, ...excludeItemIds.map(id => id?.toString())])];

        // Filter out already selected items AND already shown recommendations
        const availableItems = allItems.filter(item =>
            !allExcludeIds.includes(item._id.toString())
        );

        if (availableItems.length === 0) {
            return {
                success: true,
                recommendations: [],
                mealComplete: true,
                suggestion: "You've selected all available items!"
            };
        }

        // Prepare menu context for AI
        const menuContext = availableItems.map(item => ({
            id: item._id.toString(),
            name: item.name,
            description: item.description || '',
            price: item.price,
            category: item.category?.name || 'Other',
            emoji: item.emoji || item.category?.emoji || '🍽️'
        }));

        const selectedNames = selectedItems.map(item => item.name).join(', ');
        const selectedCategories = [...new Set(selectedItems.map(item =>
            item.category?.name || item.categoryName || 'Main'
        ))];

        // Build preference context for AI
        let preferenceContext = '';
        if (preferences.mealGoal) {
            const goalMap = {
                'full': 'a complete, filling meal with multiple courses',
                'light': 'a light, quick bite - fewer items',
                'protein': 'high-protein, muscle-building options',
                'comfort': 'comfort food - hearty and satisfying'
            };
            preferenceContext += `\n- MEAL GOAL: Customer wants ${goalMap[preferences.mealGoal] || preferences.mealGoal}`;
        }
        if (preferences.dietary && preferences.dietary !== 'none') {
            const dietaryMap = {
                'spicy': 'spicy, hot flavors',
                'mild': 'mild, non-spicy options',
                'sweet': 'sweet flavors'
            };
            preferenceContext += `\n- FLAVOR PREFERENCE: Customer prefers ${dietaryMap[preferences.dietary] || preferences.dietary}`;
        }
        if (preferences.budget && preferences.budget !== 'any') {
            const budgetMap = {
                'budget': 'budget-friendly, affordable options (prioritize lower-priced items)',
                'premium': 'premium, high-quality options (price is not a concern)'
            };
            preferenceContext += `\n- BUDGET: Customer wants ${budgetMap[preferences.budget] || preferences.budget}`;
        }

        // Build the AI prompt
        const systemPrompt = `You are a Nigerian restaurant meal recommendation expert. Your job is to suggest complementary menu items that pair well with the customer's current selection to build a complete, satisfying meal.
${preferenceContext ? `\nCUSTOMER PREFERENCES:${preferenceContext}\n` : ''}
CRITICAL RULES:
1. Only recommend items from the provided menu - never suggest items not on the menu
2. **CATEGORY ACCURACY IS MANDATORY**: Each item MUST be grouped under its EXACT category as shown in the menu data. For example:
   - Shawarma belongs in "Shawarma" or "Food" category, NOT "Drinks"
   - Salads belong in "Salads" or "Sides" category, NOT "Drinks"  
   - Only beverages like Zobo, Coke, Fanta, Water belong in "Drinks"
   - Use the "category" field from each menu item - DO NOT invent or change categories
3. Consider Nigerian cuisine pairing traditions (e.g., rice goes with stew/protein, swallow goes with soup)
4. PRIORITIZE the customer's preferences above all else${targetCategory ? `
5. FOCUS specifically on the "${targetCategory}" category - recommend more items from this category` : ''}
6. Maximum 2-3 items per category to avoid overwhelming the customer
7. Include a brief reason why each item pairs well (mention how it matches their preferences if applicable)
8. If the meal seems complete, say so

Return your response as valid JSON in this exact format:
{
  "recommendations": [
    {
      "category": "EXACT Category Name from menu item data",
      "items": [
        { "id": "item_id", "name": "Item Name", "reason": "Brief pairing reason" }
      ]
    }
  ],
  "mealComplete": boolean,
  "suggestion": "A friendly message about the meal status"
}`;

        const userPrompt = `Customer has selected: ${selectedNames}

Available menu items to recommend from (note: each item has a "category" field - USE THIS EXACT CATEGORY when grouping):
${JSON.stringify(menuContext, null, 2)}

What items would complement their selection? Remember: group items under their EXACT category from the menu data!`;

        const response = await openai.chat.completions.create({
            model: 'gpt-4o-mini',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 1000,
            response_format: { type: 'json_object' }
        });

        const aiResponse = JSON.parse(response.choices[0].message.content);

        // Enrich recommendations with full item details from database
        const enrichedRecommendations = await Promise.all(
            (aiResponse.recommendations || []).map(async (rec) => {
                const enrichedItems = await Promise.all(
                    (rec.items || []).map(async (recItem) => {
                        const fullItem = availableItems.find(item =>
                            item._id.toString() === recItem.id ||
                            item.name.toLowerCase() === recItem.name.toLowerCase()
                        );

                        if (fullItem) {
                            return {
                                _id: fullItem._id,
                                id: fullItem._id.toString(),
                                name: fullItem.name,
                                description: fullItem.description,
                                price: fullItem.price,
                                imageUrl: fullItem.imageUrl,
                                emoji: fullItem.emoji || fullItem.category?.emoji || '🍽️',
                                category: fullItem.category?.name || rec.category,
                                reason: recItem.reason
                            };
                        }
                        return null;
                    })
                );

                return {
                    category: rec.category,
                    items: enrichedItems.filter(Boolean)
                };
            })
        );

        // Filter out empty categories
        const filteredRecommendations = enrichedRecommendations.filter(rec => rec.items.length > 0);

        return {
            success: true,
            recommendations: filteredRecommendations,
            mealComplete: aiResponse.mealComplete || false,
            suggestion: aiResponse.suggestion || 'Here are some items that pair well with your selection!'
        };

    } catch (error) {
        console.error('Recommendation error:', error);

        // Fallback: return simple category-based recommendations
        return await getFallbackRecommendations(selectedItems);
    }
}

/**
 * Fallback recommendations when AI is unavailable
 */
async function getFallbackRecommendations(selectedItems) {
    try {
        const selectedIds = selectedItems.map(item => item._id?.toString() || item.id?.toString());
        const selectedCategoryIds = selectedItems.map(item => item.category?._id || item.category);

        // Get items from different categories
        const recommendations = await MenuItem.find({
            isActive: true,
            isAvailable: true,
            _id: { $nin: selectedIds },
            category: { $nin: selectedCategoryIds }
        })
            .populate('category', 'name emoji')
            .limit(6)
            .lean();

        // Group by category
        const grouped = {};
        recommendations.forEach(item => {
            const catName = item.category?.name || 'Other';
            if (!grouped[catName]) {
                grouped[catName] = [];
            }
            grouped[catName].push({
                _id: item._id,
                id: item._id.toString(),
                name: item.name,
                description: item.description,
                price: item.price,
                imageUrl: item.imageUrl,
                emoji: item.emoji || item.category?.emoji || '🍽️',
                category: catName,
                reason: 'A great addition to your meal!'
            });
        });

        return {
            success: true,
            recommendations: Object.entries(grouped).map(([category, items]) => ({
                category,
                items
            })),
            mealComplete: false,
            suggestion: 'Here are some suggestions to complete your meal!'
        };
    } catch (error) {
        console.error('Fallback recommendation error:', error);
        return {
            success: false,
            recommendations: [],
            mealComplete: false,
            suggestion: 'Unable to load recommendations at this time.'
        };
    }
}

/**
 * Check if a meal selection is complete
 */
export async function checkMealCompleteness(selectedItems) {
    const categories = await Category.find({ isActive: true }).lean();
    const categoryNames = categories.map(c => c.name.toLowerCase());

    const selectedCategories = selectedItems.map(item =>
        (item.category?.name || item.categoryName || '').toLowerCase()
    );

    // A "complete" meal typically has:
    // - A main dish/carb (Rice, Swallow, etc.)
    // - A protein or soup
    // - Optionally a drink

    const hasMain = selectedCategories.some(cat =>
        cat.includes('main') || cat.includes('rice') || cat.includes('swallow') || cat.includes('pasta')
    );
    const hasProtein = selectedCategories.some(cat =>
        cat.includes('protein') || cat.includes('meat') || cat.includes('fish') || cat.includes('chicken') || cat.includes('soup')
    );
    const hasDrink = selectedCategories.some(cat =>
        cat.includes('drink') || cat.includes('beverage')
    );

    return {
        isComplete: hasMain && hasProtein,
        hasMain,
        hasProtein,
        hasDrink,
        suggestion: !hasMain ? 'Add a main dish to your meal' :
            !hasProtein ? 'Add a protein or soup' :
                !hasDrink ? 'Consider adding a drink!' :
                    'Your meal looks complete!'
    };
}

export default { getRecommendations, checkMealCompleteness };
