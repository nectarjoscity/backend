import jwt from 'jsonwebtoken';
import User from '../models/User.js';

// Login handler for AI flow
export const login = async (req, res) => {
  try {
    const { username, email, password } = req.body;
    
    console.log('[DEBUG AUTH] Login attempt:', {
      hasUsername: !!username,
      hasEmail: !!email,
      hasPassword: !!password,
      emailValue: email,
      usernameValue: username,
      passwordLength: password?.length
    });
    
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
    const searchEmail = email ? String(email).toLowerCase().trim() : null;
    const searchUsername = username ? String(username).toLowerCase().trim() : null;
    
    console.log('[DEBUG AUTH] Searching for user:', { searchEmail, searchUsername });
    
    if (username) {
      user = await User.findOne({ 
        $or: [
          { username: searchUsername },
          { email: searchUsername }
        ]
      });
    } else {
      user = await User.findOne({ email: searchEmail });
    }
    
    console.log('[DEBUG AUTH] User lookup result:', {
      found: !!user,
      userId: user?._id,
      userEmail: user?.email,
      isActive: user?.isActive
    });
    
    // If user doesn't exist, auto-register them
    if (!user) {
      console.log('[DEBUG AUTH] User not found, attempting auto-registration');
      
      // Extract name from email
      const emailForName = email || username;
      const autoName = emailForName?.split('@')[0] || 'User';
      const normalizedEmail = (email || username).toLowerCase().trim();
      
      try {
        // Create new user
        const userData = {
          name: autoName,
          email: normalizedEmail,
          password: password
        };
        
        // If username was provided and it's not an email, use it as username
        if (username && !username.includes('@')) {
          userData.username = username.toLowerCase().trim();
        }
        
        console.log('[DEBUG AUTH] Creating new user:', {
          name: userData.name,
          email: userData.email,
          hasUsername: !!userData.username
        });
        
        const newUser = await User.create(userData);
        
        console.log('[DEBUG AUTH] User created successfully:', {
          userId: newUser._id,
          email: newUser.email
        });
        
        // Generate token for the new user
        const payload = { sub: newUser.id, role: newUser.role };
        const token = jwt.sign(payload, process.env.JWT_SECRET || 'dev-secret', { expiresIn: '7d' });
        
        return res.status(201).json({ 
          success: true, 
          message: `Welcome to NectarV, ${newUser.name}! 🎉 Your account has been created successfully. I'll learn from your preferences to provide personalized recommendations. How can I help you today?`,
          mode: 'chat',
          data: { token, user: newUser.toJSON() }
        });
      } catch (regError) {
        console.error('[DEBUG AUTH] Auto-registration failed:', regError);
        
        // If registration failed due to duplicate, it means user exists but we couldn't find them
        if (regError.code === 11000) {
          return res.status(401).json({ 
            success: false, 
            message: 'This email is already registered. Please check your password and try again.',
            mode: 'chat',
            needsClarification: true,
            clarificationQuestion: 'This email is already registered. Please check your password and try again.'
          });
        }
        
        return res.status(400).json({ 
          success: false, 
          message: regError.message || 'Could not create account. Please try again.',
          mode: 'chat',
          needsClarification: true,
          clarificationQuestion: 'Could not create your account. Please try again with valid details.'
        });
      }
    }
    
    // User exists but is inactive
    if (!user.isActive) {
      console.log('[DEBUG AUTH] User found but inactive');
      return res.status(401).json({ 
        success: false, 
        message: 'Your account has been deactivated. Please contact support.',
        mode: 'chat',
        needsClarification: true,
        clarificationQuestion: 'Your account has been deactivated. Would you like to create a new account?'
      });
    }
    
    const match = await user.comparePassword(password);
    console.log('[DEBUG AUTH] Password comparison:', { match });
    
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
    
    console.log('[DEBUG AUTH] Register attempt:', {
      hasName: !!name,
      hasUsername: !!username,
      hasEmail: !!email,
      hasPassword: !!password,
      emailValue: email,
      nameValue: name,
      passwordLength: password?.length
    });
    
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
    const normalizedEmail = String(email).toLowerCase().trim();
    const existingEmail = await User.findOne({ email: normalizedEmail });
    
    console.log('[DEBUG AUTH] Email check:', {
      normalizedEmail,
      exists: !!existingEmail
    });
    
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
      email: normalizedEmail,
      password,
    };
    
    if (username) {
      userData.username = String(username).toLowerCase().trim();
    }
    
    console.log('[DEBUG AUTH] Creating user with data:', {
      name: userData.name,
      email: userData.email,
      hasUsername: !!userData.username,
      passwordLength: password.length
    });
    
    const user = await User.create(userData);
    
    console.log('[DEBUG AUTH] User created successfully:', {
      userId: user._id,
      email: user.email
    });
    
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

