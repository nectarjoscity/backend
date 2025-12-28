import Subscription from '../models/Subscription.js';
import MenuItem from '../models/MenuItem.js';
import * as PaymentService from '../services/paymentService.js';
import Transaction from '../models/Transaction.js';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Helper: Get day name from date
const getDayName = (date) => {
    const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    return days[new Date(date).getDay()];
};

// Helper: Add days to date
const addDays = (date, days) => {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
};

/**
 * Save user preferences from AI onboarding
 * POST /api/subscriptions/preferences
 */
export const savePreferences = async (req, res) => {
    try {
        const { dietaryGoal, allergies, spiceLevel, mealFrequency, deliveryDays } = req.body;

        // Validate required fields
        if (!dietaryGoal || !deliveryDays || deliveryDays.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'Dietary goal and delivery days are required',
            });
        }

        // Create or update pending subscription with preferences
        let subscription = await Subscription.findOne({
            user: req.user.id,
            status: 'pending',
            paymentStatus: 'pending',
        });

        if (!subscription) {
            subscription = new Subscription({ user: req.user.id });
        }

        subscription.preferences = {
            dietaryGoal,
            allergies: allergies || [],
            spiceLevel: spiceLevel || 'medium',
            mealFrequency: mealFrequency || 3,
            deliveryDays,
        };

        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Preferences saved successfully',
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error saving preferences:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Generate weekly menu based on preferences
 * POST /api/subscriptions/generate-menu
 */
export const generateMenu = async (req, res) => {
    try {
        const { subscriptionId, weeksCount = 1 } = req.body;

        // Get subscription
        const subscription = await Subscription.findOne({
            _id: subscriptionId,
            user: req.user.id,
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        // Get all active menu items
        const menuItems = await MenuItem.find({ isActive: true }).populate('category');

        if (menuItems.length === 0) {
            return res.status(400).json({ success: false, message: 'No menu items available' });
        }

        const { preferences } = subscription;

        // Filter items based on allergies (simplified - would need proper allergen data)
        let eligibleItems = menuItems;

        // Use AI to generate varied menu
        const mealTypes = ['breakfast', 'lunch', 'dinner'].slice(0, preferences.mealFrequency);
        const itemNames = eligibleItems.map((i) => ({
            name: i.name,
            category: i.category?.name || 'Other',
            price: i.price,
        }));

        const prompt = `You are a nutritionist creating a meal plan. Create a ${weeksCount * preferences.deliveryDays.length}-day meal plan.

Available items: ${JSON.stringify(itemNames)}

User preferences:
- Dietary goal: ${preferences.dietaryGoal}
- Spice level: ${preferences.spiceLevel}
- Meals per day: ${preferences.mealFrequency} (${mealTypes.join(', ')})

Rules:
1. Don't repeat the same item within 2 consecutive days
2. Ensure variety across categories
3. Match items to appropriate meal times (lighter for breakfast, hearty for lunch/dinner)

Return ONLY a valid JSON array with this exact format, no other text:
[{"day": 1, "meals": [{"type": "breakfast", "item": "Item Name"}, {"type": "lunch", "item": "Item Name"}]}]`;

        let generatedMenu;
        try {
            const aiResponse = await openai.chat.completions.create({
                model: 'gpt-4o-mini',
                messages: [{ role: 'user', content: prompt }],
                temperature: 0.7,
            });

            const content = aiResponse.choices[0].message.content.trim();
            // Extract JSON from response
            const jsonMatch = content.match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                generatedMenu = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('Invalid AI response format');
            }
        } catch (aiError) {
            console.error('[Subscription] AI generation failed, using fallback:', aiError);
            // Fallback: Simple rotation
            generatedMenu = [];
            let itemIndex = 0;
            for (let day = 1; day <= weeksCount * preferences.deliveryDays.length; day++) {
                const dayMeals = mealTypes.map((type) => {
                    const item = eligibleItems[itemIndex % eligibleItems.length];
                    itemIndex++;
                    return { type, item: item.name };
                });
                generatedMenu.push({ day, meals: dayMeals });
            }
        }

        // Build weekly menus structure
        const startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        // Start from next Monday
        const daysUntilMonday = (8 - startDate.getDay()) % 7 || 7;
        const weekStart = addDays(startDate, daysUntilMonday);

        const weeklyMenus = [];
        let dayCounter = 0;

        for (let week = 0; week < weeksCount; week++) {
            const weekStartDate = addDays(weekStart, week * 7);
            const weekEndDate = addDays(weekStartDate, 6);

            const days = [];
            for (let d = 0; d < 7; d++) {
                const dayDate = addDays(weekStartDate, d);
                const dayName = getDayName(dayDate);

                // Only include delivery days
                if (preferences.deliveryDays.includes(dayName)) {
                    const generatedDay = generatedMenu[dayCounter];
                    dayCounter++;

                    const meals = generatedDay?.meals.map((m) => {
                        const menuItem = eligibleItems.find(
                            (i) => i.name.toLowerCase() === m.item.toLowerCase()
                        );
                        return {
                            mealType: m.type,
                            menuItem: menuItem?._id || eligibleItems[0]._id,
                            price: menuItem?.price || eligibleItems[0].price,
                        };
                    }) || [];

                    days.push({
                        date: dayDate,
                        dayName,
                        status: 'scheduled',
                        meals,
                    });
                }
            }

            weeklyMenus.push({
                weekNumber: week + 1,
                startDate: weekStartDate,
                endDate: weekEndDate,
                days,
            });
        }

        // Update subscription
        subscription.weeklyMenus = weeklyMenus;
        subscription.startDate = weekStart;
        subscription.endDate = addDays(weekStart, weeksCount * 7 - 1);
        subscription.calculatePricing();
        await subscription.save();

        // Populate menu items for response
        await subscription.populate('weeklyMenus.days.meals.menuItem');

        return res.status(200).json({
            success: true,
            message: 'Menu generated successfully',
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error generating menu:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get current user's subscription
 * GET /api/subscriptions/my
 */
export const getMySubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({
            user: req.user.id,
            status: { $in: ['pending', 'active', 'paused'] },
        })
            .populate('weeklyMenus.days.meals.menuItem')
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error getting subscription:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Swap a meal for another
 * PUT /api/subscriptions/:id/swap-meal
 */
export const swapMeal = async (req, res) => {
    try {
        const { weekIndex, dayIndex, mealIndex, newMenuItemId } = req.body;

        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user.id,
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        const newMenuItem = await MenuItem.findById(newMenuItemId);
        if (!newMenuItem) {
            return res.status(404).json({ success: false, message: 'Menu item not found' });
        }

        // Get the meal to swap
        const week = subscription.weeklyMenus[weekIndex];
        const day = week?.days[dayIndex];
        const meal = day?.meals[mealIndex];

        if (!meal) {
            return res.status(404).json({ success: false, message: 'Meal not found' });
        }

        // Store original and swap
        meal.swappedFrom = meal.menuItem;
        meal.menuItem = newMenuItem._id;
        meal.price = newMenuItem.price;

        // Recalculate pricing
        subscription.calculatePricing();
        await subscription.save();

        await subscription.populate('weeklyMenus.days.meals.menuItem');

        return res.status(200).json({
            success: true,
            message: 'Meal swapped successfully',
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error swapping meal:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Add a meal item to a day
 * POST /api/subscriptions/:id/add-meal
 */
export const addMeal = async (req, res) => {
    try {
        const { weekIndex, dayIndex, menuItemId, mealType } = req.body;

        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user.id,
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        const menuItem = await MenuItem.findById(menuItemId);
        if (!menuItem) {
            return res.status(404).json({ success: false, message: 'Menu item not found' });
        }

        // Get the day
        const week = subscription.weeklyMenus[weekIndex];
        const day = week?.days[dayIndex];

        if (!day) {
            return res.status(404).json({ success: false, message: 'Day not found' });
        }

        // Normalize mealType to valid enum value
        const validTypes = ['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'side', 'protein', 'main', 'extra'];
        const normalizedType = mealType ? mealType.toLowerCase().replace(/\s+/g, '') : 'extra';
        const finalMealType = validTypes.includes(normalizedType) ? normalizedType : 'extra';

        // Add the new meal
        day.meals.push({
            mealType: finalMealType,
            menuItem: menuItem._id,
            price: menuItem.price,
        });

        // Recalculate pricing
        subscription.calculatePricing();
        await subscription.save();

        await subscription.populate('weeklyMenus.days.meals.menuItem');

        return res.status(200).json({
            success: true,
            message: 'Meal added successfully',
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error adding meal:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Remove a meal item from a day
 * DELETE /api/subscriptions/:id/remove-meal
 */
export const removeMeal = async (req, res) => {
    try {
        const { weekIndex, dayIndex, mealIndex } = req.body;

        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user.id,
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        // Get the day
        const week = subscription.weeklyMenus[weekIndex];
        const day = week?.days[dayIndex];

        if (!day || !day.meals[mealIndex]) {
            return res.status(404).json({ success: false, message: 'Meal not found' });
        }

        // Remove the meal
        day.meals.splice(mealIndex, 1);

        // Recalculate pricing
        subscription.calculatePricing();
        await subscription.save();

        await subscription.populate('weeklyMenus.days.meals.menuItem');

        return res.status(200).json({
            success: true,
            message: 'Meal removed successfully',
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error removing meal:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Skip a day
 * PUT /api/subscriptions/:id/skip-day
 */
export const skipDay = async (req, res) => {
    try {
        const { weekIndex, dayIndex } = req.body;

        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user.id,
            status: 'active',
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Active subscription not found' });
        }

        const day = subscription.weeklyMenus[weekIndex]?.days[dayIndex];
        if (!day) {
            return res.status(404).json({ success: false, message: 'Day not found' });
        }

        // Can only skip scheduled days
        if (day.status !== 'scheduled') {
            return res.status(400).json({ success: false, message: 'Cannot skip this day' });
        }

        day.status = 'skipped';
        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Day skipped successfully',
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error skipping day:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Pause subscription
 * PUT /api/subscriptions/:id/pause
 */
export const pauseSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user.id,
            status: 'active',
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Active subscription not found' });
        }

        subscription.status = 'paused';
        subscription.pausedAt = new Date();
        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription paused',
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error pausing subscription:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Resume subscription
 * PUT /api/subscriptions/:id/resume
 */
export const resumeSubscription = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user.id,
            status: 'paused',
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Paused subscription not found' });
        }

        subscription.status = 'active';
        subscription.resumedAt = new Date();
        await subscription.save();

        return res.status(200).json({
            success: true,
            message: 'Subscription resumed',
            data: subscription,
        });
    } catch (error) {
        console.error('[Subscription] Error resuming subscription:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Create payment for subscription
 * POST /api/subscriptions/:id/pay
 */
export const createPayment = async (req, res) => {
    try {
        const subscription = await Subscription.findOne({
            _id: req.params.id,
            user: req.user.id,
            paymentStatus: 'pending',
        });

        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Pending subscription not found' });
        }

        const { pricing } = subscription;
        if (!pricing.finalAmount || pricing.finalAmount <= 0) {
            return res.status(400).json({ success: false, message: 'Invalid subscription amount' });
        }

        // Create virtual account via SafeHaven
        const paymentData = await PaymentService.createVirtualAccount(pricing.finalAmount);

        // Store payment details
        subscription.virtualAccountNumber = paymentData.accountNumber;
        subscription.virtualAccountName = paymentData.accountName;
        subscription.virtualAccountBank = paymentData.bankName;
        subscription.paymentReference = paymentData.externalReference;
        await subscription.save();

        // Create transaction record
        const transaction = new Transaction({
            type: 'subscription',
            status: 'pending',
            amount: pricing.mealsTotal,
            deliveryFee: pricing.deliveryFee,
            totalAmount: pricing.finalAmount,
            paymentMethod: 'online',
            externalReference: paymentData.externalReference,
            virtualAccountNumber: paymentData.accountNumber,
            virtualAccountName: paymentData.accountName,
            virtualAccountBank: paymentData.bankName,
            customerName: req.user.name,
            customerEmail: req.user.email,
            description: `Meal subscription - ${subscription.weeklyMenus.length} week(s)`,
            metadata: { subscriptionId: subscription._id, discount: pricing.discount },
        });
        await transaction.save();

        return res.status(200).json({
            success: true,
            message: 'Payment initiated',
            data: {
                subscription,
                payment: paymentData,
            },
        });
    } catch (error) {
        console.error('[Subscription] Error creating payment:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Verify subscription payment (called after webhook or manual check)
 * POST /api/subscriptions/verify-payment
 */
export const verifyPayment = async (req, res) => {
    try {
        const { reference } = req.body;

        const subscription = await Subscription.findOne({ paymentReference: reference });
        if (!subscription) {
            return res.status(404).json({ success: false, message: 'Subscription not found' });
        }

        // Verify with SafeHaven
        const verified = await PaymentService.verifyPayment(reference);

        if (verified) {
            subscription.paymentStatus = 'paid';
            subscription.status = 'active';
            subscription.paidAt = new Date();
            await subscription.save();

            // Update transaction
            await Transaction.findOneAndUpdate(
                { externalReference: reference },
                { status: 'completed' }
            );

            return res.status(200).json({
                success: true,
                message: 'Payment verified, subscription activated',
                data: subscription,
            });
        } else {
            return res.status(400).json({
                success: false,
                message: 'Payment not yet confirmed',
            });
        }
    } catch (error) {
        console.error('[Subscription] Error verifying payment:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};

/**
 * Get all subscriptions (admin)
 * GET /api/subscriptions
 */
export const getAllSubscriptions = async (req, res) => {
    try {
        const { status, page = 1, limit = 20 } = req.query;

        const filter = {};
        if (status) filter.status = status;

        const subscriptions = await Subscription.find(filter)
            .populate('user', 'name email')
            .sort({ createdAt: -1 })
            .skip((page - 1) * limit)
            .limit(parseInt(limit));

        const total = await Subscription.countDocuments(filter);

        return res.status(200).json({
            success: true,
            count: subscriptions.length,
            total,
            pages: Math.ceil(total / limit),
            data: subscriptions,
        });
    } catch (error) {
        console.error('[Subscription] Error getting all subscriptions:', error);
        return res.status(500).json({ success: false, message: error.message });
    }
};
