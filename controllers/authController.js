import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Login handler for AI flow
export const login = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    if (!password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password is required',
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: 'Please provide your password'
      });
    }
    
    if (!username && !email) {
      return res.status(400).json({ 
        success: false, 
        message: 'Username or email is required',
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: 'Please provide your username or email'
      });
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
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid credentials. Please check your username/email and password.',
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: 'Invalid credentials. Would you like to try again or create a new account?'
      });
    }
    
    const match = await user.comparePassword(password);
    if (!match) {
      return res.status(401).json({ 
        success: false, 
        message: 'Invalid password. Please try again.',
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: 'Invalid password. Would you like to try again?'
      });
    }
    
    const payload = { sub: user.id, role: user.role };
    const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
    
    return res.json({ 
      success: true, 
      message: `Welcome back, ${user.name}! 🎉 You're now logged in. I can now provide personalized recommendations based on your order history. How can I help you today?`,
      mode: 'chat',
      data: { token, user: user.toJSON() }
    });
  } catch (e) {
    return res.status(500).json({ 
      success: false, 
      message: e.message || 'Login failed',
      mode: 'chat'
    });
  }
};

// Register handler for AI flow
export const register = async (req, res) => {
  try {
    const { name, username, email, password } = req.body;
    
    // Validation
    if (!name || !email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'Name, email, and password are required',
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: 'Please provide your name, email, and password'
      });
    }
    
    if (password.length < 6) {
      return res.status(400).json({ 
        success: false, 
        message: 'Password must be at least 6 characters',
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: 'Password must be at least 6 characters. Please provide a stronger password.'
      });
    }
    
    // Check if email already exists
    const existingEmail = await User.findOne({ email: String(email).toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ 
        success: false, 
        message: 'Email already registered. Would you like to log in instead?',
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: 'This email is already registered. Would you like to log in instead?'
      });
    }
    
    // Check if username already exists (if provided)
    if (username) {
      const existingUsername = await User.findOne({ username: String(username).toLowerCase() });
      if (existingUsername) {
        return res.status(400).json({ 
          success: false, 
          message: 'Username already taken. Please choose a different username.',
          mode: 'chat',
          needsClarification: true,
          clarificationQuestion: 'This username is already taken. Please provide a different username or continue without one.'
        });
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
      message: `Welcome to NectarV, ${user.name}! 🎉 Your account has been created successfully. I'll learn from your preferences and order history to provide you with personalized recommendations. How can I help you today?`,
      mode: 'chat',
      data: { token, user: user.toJSON() }
    });
  } catch (e) {
    if (e.code === 11000) {
      const field = Object.keys(e.keyPattern)[0];
      return res.status(400).json({ 
        success: false, 
        message: `${field === 'email' ? 'Email' : 'Username'} already exists`,
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: `${field === 'email' ? 'Email' : 'Username'} already exists. Would you like to log in instead?`
      });
    }
    return res.status(500).json({ 
      success: false, 
      message: e.message || 'Registration failed',
      mode: 'chat'
    });
  }
};

