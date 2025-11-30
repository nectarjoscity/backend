import express from 'express';
import {
  getInventoryItems,
  getInventoryItem,
  createInventoryItem,
  updateInventoryItem,
  deleteInventoryItem,
  restockInventoryItem,
  getMenuItemIngredients,
  addMenuItemIngredient,
  removeMenuItemIngredient,
  getInventoryTransactions,
  getInventoryAnalytics
} from '../controllers/inventoryController.js';

const router = express.Router();

router.get('/', getInventoryItems);
router.get('/analytics', getInventoryAnalytics);
router.get('/transactions', getInventoryTransactions);
router.get('/:id', getInventoryItem);
router.post('/', createInventoryItem);
router.put('/:id', updateInventoryItem);
router.delete('/:id', deleteInventoryItem);
router.post('/:id/restock', restockInventoryItem);

// Menu item ingredients
router.get('/menu-item/:menuItemId/ingredients', getMenuItemIngredients);
router.post('/menu-item/ingredients', addMenuItemIngredient);
router.delete('/ingredients/:id', removeMenuItemIngredient);

export default router;

