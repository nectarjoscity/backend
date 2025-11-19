import express from 'express';
import jwt from 'jsonwebtoken';
import User from '../models/User.js';

const router = express.Router();

// Register new user
router.post('/register', async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ success: false, message: 'Name, email, and password are required' });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    
    // Check if email already exists
    const existingEmail = await User.findOne({ email: String(email).toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    
    // Check if username already exists (if provided)
    if (username) {
      const existingUsername = await User.findOne({ username: String(username).toLowerCase() });
      if (existingUsername) {
        return res.status(400).json({ success: false, message: 'Username already taken' });
      }
    }
    
    // Create user
    const userData = {
      name: name.trim(),
      email: String(email).toLowerCase(),
      password,
    };
    
    if (username) {
      userData.username = String(username).toLowerCase().trim();
    }
    
    const user = await User.create(userData);
    
    // Generate token
    const payload = { sub: user.id, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
    
    return res.status(201).json({ 
      success: true, 
      message: 'Account created successfully', 
      data: { token, user: user.toJSON() } 
    });
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `${field === 'email' ? 'Email' : 'Username'} already exists` 
      });
    }
    return res.status(500).json({ success: false, message: e.message || 'Registration failed' });
  }
});

// Login with username or email
router.post('/login', async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!password) {
      return res.status(400).json({ success: false, message: 'Password is required' });
    }
    
    if (!username && !email) {
      return res.status(400).json({ success: false, message: 'Username or email is required' });
    }
    
    // Find user by username or email
    let user;
    if (username) {
      user = await User.findOne({ 
        $or: [
          { username: String(username).toLowerCase() },
          { email: String(username).toLowerCase() }
        ]
      });
    } else {
      user = await User.findOne({ email: String(email).toLowerCase() });
    }
    
    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    const payload = { sub: user.id, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
    
    return res.json({ 
      success: true, 
      message: 'Login successful', 
      data: { token, user: user.toJSON() } 
    });
  } catch (e) {
    return res.status(500).json({ success: false, message: e.message || 'Login failed' });
  }
});

export default router;


