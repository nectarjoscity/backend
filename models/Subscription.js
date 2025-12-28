import mongoose from 'mongoose';

const SubscriptionMealSchema = new mongoose.Schema({
    mealType: {
        type: String,
        enum: ['breakfast', 'lunch', 'dinner', 'snack', 'drink', 'side', 'protein', 'main', 'extra'],
        default: 'extra',
    },
    menuItem: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MenuItem',
        required: true,
    },
    price: { type: Number, required: true },
    swappedFrom: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MenuItem',
        default: null,
    },
});

const SubscriptionDaySchema = new mongoose.Schema({
    date: { type: Date, required: true },
    dayName: { type: String, required: true },
    status: {
        type: String,
        enum: ['scheduled', 'delivered', 'skipped'],
        default: 'scheduled',
    },
    meals: [SubscriptionMealSchema],
});

const SubscriptionWeekSchema = new mongoose.Schema({
    weekNumber: { type: Number, required: true },
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    days: [SubscriptionDaySchema],
});

const SubscriptionSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true,
            index: true,
        },
        status: {
            type: String,
            enum: ['pending', 'active', 'paused', 'cancelled', 'expired'],
            default: 'pending',
        },
        startDate: { type: Date },
        endDate: { type: Date },

        // Preferences from AI onboarding
        preferences: {
            dietaryGoal: {
                type: String,
                enum: ['balanced', 'weight_loss', 'protein', 'vegetarian'],
                default: 'balanced',
            },
            allergies: [{ type: String }],
            spiceLevel: {
                type: String,
                enum: ['mild', 'medium', 'spicy'],
                default: 'medium',
            },
            mealFrequency: { type: Number, default: 3, min: 1, max: 3 },
            deliveryDays: [{ type: String }], // ['monday', 'tuesday', ...]
        },

        // Pricing breakdown
        pricing: {
            mealsTotal: { type: Number, default: 0 },
            deliveryFee: { type: Number, default: 0 }, // ₦1000 per delivery day
            discount: { type: Number, default: 0 }, // 10% off
            finalAmount: { type: Number, default: 0 },
        },

        // Payment
        paymentStatus: {
            type: String,
            enum: ['pending', 'paid', 'failed'],
            default: 'pending',
        },
        paymentReference: { type: String },
        paidAt: { type: Date },

        // Virtual account for SafeHaven
        virtualAccountNumber: { type: String },
        virtualAccountName: { type: String },
        virtualAccountBank: { type: String },

        // Weekly menus
        weeklyMenus: [SubscriptionWeekSchema],

        // Pause tracking
        pausedAt: { type: Date },
        resumedAt: { type: Date },
    },
    { timestamps: true }
);

// Index for querying active subscriptions
SubscriptionSchema.index({ status: 1, startDate: 1, endDate: 1 });

// Calculate pricing helper
SubscriptionSchema.methods.calculatePricing = function () {
    let mealsTotal = 0;
    let deliveryDays = 0;

    this.weeklyMenus.forEach((week) => {
        week.days.forEach((day) => {
            if (day.status !== 'skipped') {
                deliveryDays++;
                day.meals.forEach((meal) => {
                    mealsTotal += meal.price;
                });
            }
        });
    });

    const deliveryFee = deliveryDays * 1000; // ₦1000 per delivery
    const subtotal = mealsTotal + deliveryFee;
    const discount = subtotal * 0.1; // 10% discount
    const finalAmount = subtotal - discount;

    this.pricing = { mealsTotal, deliveryFee, discount, finalAmount };
    return this.pricing;
};

const Subscription = mongoose.model('Subscription', SubscriptionSchema);
export default Subscription;
