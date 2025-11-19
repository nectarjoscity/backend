import jwt from 'jsonwebtoken';
import User from '../models/User.js';

export const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) return res.status(401).json({ success: false, message: 'Unauthorized' });
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const user = await User.findById(payload.sub);
    if (!user || !user.isActive) return res.status(401).json({ success: false, message: 'Unauthorized' });
    req.user = { 
      id: user.id, 
      role: user.role, 
      email: user.email, 
      username: user.username,
      name: user.name 
    };
    next();
  } catch (e) {
    return res.status(401).json({ success: false, message: 'Invalid token' });
  }
};

// Optional authentication - doesn't fail if no token, but sets req.user if token is valid
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token) {
      req.user = null;
      return next();
    }
    const payload = jwt.verify(token, process.env.JWT_SECRET || 'dev-secret');
    const user = await User.findById(payload.sub);
    if (user && user.isActive) {
      req.user = { 
        id: user.id, 
        role: user.role, 
        email: user.email, 
        username: user.username,
        name: user.name 
      };
    } else {
      req.user = null;
    }
    next();
  } catch (e) {
    // Invalid token, but continue without user
    req.user = null;
    next();
  }
};

export const authorize = (...roles) => (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: 'Unauthorized' });
  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'Forbidden' });
  }
  next();
};


