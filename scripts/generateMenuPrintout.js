import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import models
import MenuItem from '../models/MenuItem.js';
import Category from '../models/Category.js';

async function generateMenuPrintout() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to MongoDB');

        // Fetch all categories, sorted by name
        const categories = await Category.find({}).sort({ name: 1 });

        let menuText = '';
        menuText += '═══════════════════════════════════════════════════════════\n';
        menuText += '                      MENU & PRICES                        \n';
        menuText += '═══════════════════════════════════════════════════════════\n\n';

        // For each category, fetch its menu items
        for (const category of categories) {
            // Fetch all menu items for this category (including out of stock)
            const menuItems = await MenuItem.find({
                category: category._id
            }).sort({ name: 1 });

            if (menuItems.length === 0) {
                continue; // Skip categories with no items
            }

            // Category header
            menuText += `\n${category.emoji || '•'} ${category.name.toUpperCase()}\n`;
            menuText += '─'.repeat(60) + '\n';

            if (category.description) {
                menuText += `${category.description}\n\n`;
            }

            // List all menu items in this category
            for (const item of menuItems) {
                const itemName = item.name.padEnd(45, '.');
                const price = `${item.currency} ${item.price.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
                const stockStatus = (!item.isAvailable || !item.isActive) ? ' [OUT OF STOCK]' : '';

                menuText += `${itemName}${price}${stockStatus}\n`;

                if (item.description) {
                    menuText += `  ${item.description}\n`;
                }
                menuText += '\n';
            }
        }

        menuText += '\n═══════════════════════════════════════════════════════════\n';
        menuText += '                   Thank you for visiting!                 \n';
        menuText += '═══════════════════════════════════════════════════════════\n';

        // Write to file
        const outputPath = path.join(__dirname, '..', 'menu_printout.txt');
        fs.writeFileSync(outputPath, menuText, 'utf8');

        console.log(`\n✓ Menu printout generated successfully!`);
        console.log(`✓ File saved to: ${outputPath}`);
        console.log(`\n--- Preview ---`);
        console.log(menuText.substring(0, 500) + '...\n');

    } catch (error) {
        console.error('Error generating menu printout:', error);
        process.exit(1);
    } finally {
        await mongoose.connection.close();
        console.log('Database connection closed');
    }
}

// Run the script
generateMenuPrintout();
