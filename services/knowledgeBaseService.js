import MenuItem from '../models/MenuItem.js';
import Category from '../models/Category.js';
import { upsertDocument } from './vectorStoreService.js';

/**
 * Index a menu item in the vector store
 * @param {Object} menuItem - MenuItem document
 * @returns {Promise<Object>} - Vector store document
 */
export async function indexMenuItem(menuItem) {
  if (!menuItem || !menuItem._id) {
    throw new Error('Invalid menu item');
  }

  // Build content string for embedding
  const contentParts = [
    menuItem.name,
    menuItem.description || '',
    menuItem.emoji || '',
    menuItem.category?.name || ''
  ].filter(Boolean);

  const content = contentParts.join(' ');

  // Build metadata
  const metadata = {
    type: 'menuItem',
    documentId: menuItem._id,
    name: menuItem.name,
    description: menuItem.description,
    price: menuItem.price,
    currency: menuItem.currency || 'NGN',
    category: menuItem.category?.name || menuItem.category?.toString()
  };

  return await upsertDocument({ content, metadata });
}

/**
 * Index a category in the vector store
 * @param {Object} category - Category document
 * @returns {Promise<Object>} - Vector store document
 */
export async function indexCategory(category) {
  if (!category || !category._id) {
    throw new Error('Invalid category');
  }

  // Build content string for embedding
  const contentParts = [
    category.name,
    category.description || '',
    category.emoji || ''
  ].filter(Boolean);

  const content = contentParts.join(' ');

  // Build metadata
  const metadata = {
    type: 'category',
    documentId: category._id,
    name: category.name,
    description: category.description
  };

  return await upsertDocument({ content, metadata });
}

/**
 * Index all menu items
 * @returns {Promise<{indexed: number, errors: number}>} - Indexing results
 */
export async function indexAllMenuItems() {
  try {
    const menuItems = await MenuItem.find({ isActive: true })
      .populate('category', 'name')
      .lean();

    let indexed = 0;
    let errors = 0;

    for (const item of menuItems) {
      try {
        await indexMenuItem(item);
        indexed++;
      } catch (error) {
        console.error(`Error indexing menu item ${item._id}:`, error.message);
        errors++;
      }
    }

    return { indexed, errors, total: menuItems.length };
  } catch (error) {
    console.error('Error indexing menu items:', error);
    throw error;
  }
}

/**
 * Index all categories
 * @returns {Promise<{indexed: number, errors: number}>} - Indexing results
 */
export async function indexAllCategories() {
  try {
    const categories = await Category.find({ isActive: true }).lean();

    let indexed = 0;
    let errors = 0;

    for (const category of categories) {
      try {
        await indexCategory(category);
        indexed++;
      } catch (error) {
        console.error(`Error indexing category ${category._id}:`, error.message);
        errors++;
      }
    }

    return { indexed, errors, total: categories.length };
  } catch (error) {
    console.error('Error indexing categories:', error);
    throw error;
  }
}

/**
 * Index entire knowledge base (menu items + categories)
 * @param {Object} options - Options for indexing
 * @param {boolean} options.includePDF - Whether to include PDF indexing (default: false)
 * @returns {Promise<Object>} - Complete indexing results
 */
export async function indexKnowledgeBase(options = {}) {
  const { includePDF = false } = options;
  
  console.log('Starting knowledge base indexing...');
  
  const categoriesResult = await indexAllCategories();
  console.log(`Categories: ${categoriesResult.indexed} indexed, ${categoriesResult.errors} errors`);

  const menuItemsResult = await indexAllMenuItems();
  console.log(`Menu items: ${menuItemsResult.indexed} indexed, ${menuItemsResult.errors} errors`);

  let pdfResult = null;
  if (includePDF) {
    try {
      const { indexMenuPDF } = await import('./pdfService.js');
      pdfResult = await indexMenuPDF();
      console.log(`PDF: ${pdfResult.indexed} chunks indexed, ${pdfResult.errors} errors`);
    } catch (error) {
      console.warn('PDF indexing skipped:', error.message);
      pdfResult = { indexed: 0, errors: 1, total: 0 };
    }
  }

  return {
    categories: categoriesResult,
    menuItems: menuItemsResult,
    pdf: pdfResult,
    totalIndexed: categoriesResult.indexed + menuItemsResult.indexed + (pdfResult?.indexed || 0),
    totalErrors: categoriesResult.errors + menuItemsResult.errors + (pdfResult?.errors || 0)
  };
}

/**
 * Re-index a specific menu item (useful after updates)
 * @param {string} menuItemId - MenuItem ID
 * @returns {Promise<Object>} - Vector store document
 */
export async function reindexMenuItem(menuItemId) {
  const menuItem = await MenuItem.findById(menuItemId).populate('category', 'name');
  if (!menuItem) {
    throw new Error('Menu item not found');
  }
  return await indexMenuItem(menuItem);
}

/**
 * Re-index a specific category (useful after updates)
 * @param {string} categoryId - Category ID
 * @returns {Promise<Object>} - Vector store document
 */
export async function reindexCategory(categoryId) {
  const category = await Category.findById(categoryId);
  if (!category) {
    throw new Error('Category not found');
  }
  return await indexCategory(category);
}

