import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import dotenv from 'dotenv';
import userRoutes from './routes/userRoutes.js';
import categoryRoutes from './routes/categoryRoutes.js';
import menuItemRoutes from './routes/menuItemRoutes.js';
import deepseekRouter from './middleware/deepseekRouter.js';
import orderRoutes from './routes/orderRoutes.js';
import authRoutes from './routes/authRoutes.js';
import contactRoutes from './routes/contactRoutes.js';
import inventoryRoutes from './routes/inventoryRoutes.js';
import accountingRoutes from './routes/accountingRoutes.js';
import paymentRoutes from './routes/paymentRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import recommendationRoutes from './routes/recommendationRoutes.js';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
// Configure CORS with environment-based origins
const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
  : ['http://localhost:3000', 'http://localhost:3001'];

app.use(helmet({
  crossOriginResourcePolicy: { policy: "cross-origin" },
  crossOriginEmbedderPolicy: false
}));
app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);

    if (allowedOrigins.indexOf(origin) !== -1) {
      callback(null, true);
    } else {
      console.warn(`CORS blocked origin: ${origin}. Allowed origins:`, allowedOrigins);
      callback(null, true); // Temporarily allow all for debugging - change back to Error in production
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  exposedHeaders: ['Content-Range', 'X-Content-Range']
}));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// MongoDB connection - optimized for serverless environments
let dbConnected = false;
let connectionPromise = null;

const connectDB = async () => {
  // If already connected, return
  if (mongoose.connection.readyState === 1) {
    dbConnected = true;
    return mongoose.connection;
  }

  // If connection is in progress, return the existing promise
  if (connectionPromise) {
    return connectionPromise;
  }

  // Start new connection
  connectionPromise = (async () => {
    try {
      if (!process.env.MONGODB_URI) {
        console.warn('MONGODB_URI not set. Database operations will fail.');
        dbConnected = false;
        return null;
      }

      // Check if already connected (for serverless reuse)
      if (mongoose.connection.readyState === 1) {
        dbConnected = true;
        return mongoose.connection;
      }

      const conn = await mongoose.connect(process.env.MONGODB_URI, {
        serverSelectionTimeoutMS: 10000, // 10s timeout for serverless
        socketTimeoutMS: 45000,
        maxPoolSize: 10,
        minPoolSize: 1,
      });

      dbConnected = true;
      console.log(`MongoDB Connected: ${conn.connection.host}`);

      // Handle connection events
      mongoose.connection.on('error', (err) => {
        console.error('MongoDB connection error:', err);
        dbConnected = false;
        connectionPromise = null;
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('MongoDB disconnected');
        dbConnected = false;
        connectionPromise = null;
      });

      return conn;
    } catch (error) {
      console.error('Error connecting to MongoDB:', error.message);
      dbConnected = false;
      connectionPromise = null;
      // Don't throw - allow server to continue
      return null;
    }
  })();

  return connectionPromise;
};

// Routes
app.get('/', (req, res) => {
  res.json({
    message: 'NectarV Backend API',
    version: '1.0.0',
    status: 'running'
  });
});

app.get('/api/health', (req, res) => {
  const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    database: dbStatus,
    mongodbState: mongoose.connection.readyState // 0=disconnected, 1=connected, 2=connecting, 3=disconnecting
  });
});

// API Routes
app.use('/api', deepseekRouter);
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/menu-items', menuItemRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/accounting', accountingRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/recommendations', recommendationRoutes);

// Error handling middleware - must be after routes
app.use((err, req, res, next) => {
  console.error('Error:', err.stack || err.message);

  // Ensure CORS headers are always set, even on errors
  const origin = req.headers.origin;
  if (origin && (allowedOrigins.indexOf(origin) !== -1 || !process.env.ALLOWED_ORIGINS)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  // Handle CORS errors
  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({
      success: false,
      message: 'CORS: Origin not allowed',
      error: process.env.NODE_ENV === 'production' ? {} : err.message
    });
  }

  // Handle MongoDB connection errors
  if (err.name === 'MongoServerError' || err.name === 'MongooseError' || err.message?.includes('MongoDB')) {
    return res.status(503).json({
      success: false,
      message: 'Database connection error. Please try again later.',
      error: process.env.NODE_ENV === 'production' ? {} : err.message
    });
  }

  // Handle other errors
  res.status(err.status || 500).json({
    success: false,
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'production' ? {} : err.message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// 404 handler - must be last middleware
app.use((req, res) => {
  res.status(404).json({
    message: 'Route not found',
    path: req.originalUrl
  });
});

// Start server
const startServer = async () => {
  // For Vercel/serverless, try to connect but don't block
  if (process.env.VERCEL) {
    // In serverless, connection will be attempted on first request
    // This is just a pre-warm attempt
    connectDB().catch(() => {
      // Silently fail - connection will be retried on first DB operation
    });
    return app;
  }

  // For traditional server deployment, connect on startup
  connectDB().catch(err => {
    console.error('Failed to connect to database on startup:', err.message);
  });

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
    console.log(`CORS allowed origins: ${allowedOrigins.join(', ')}`);
  });
};

// Start server only if not in Vercel serverless environment
if (!process.env.VERCEL) {
  startServer().catch(console.error);
} else {
  // For Vercel, just ensure app is ready
  startServer();
}

// Export for Vercel serverless - Vercel will call this as a serverless function
export default app;