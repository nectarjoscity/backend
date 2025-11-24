import { submitContactForm } from '../controllers/contactController.js';
import express from 'express';

const router = express.Router();

// Contact form submission (public endpoint)
router.post('/', submitContactForm);

export default router;

