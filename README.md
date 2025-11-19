# NectarV Backend

A Node.js Express backend application with MongoDB integration following a monolithic architecture pattern.

## Features

- **Express.js** - Fast, unopinionated web framework
- **MongoDB** - NoSQL database with Mongoose ODM
- **ES6 Modules** - Modern JavaScript module system
- **Security** - Helmet for security headers, CORS enabled
- **Logging** - Morgan for HTTP request logging
- **Environment Configuration** - dotenv for environment variables
- **Development Tools** - Nodemon for auto-restart during development

## Project Structure

```
backend/
├── controllers/     # Request handlers
├── models/         # Database models
├── routes/         # API routes
├── middleware/     # Custom middleware
├── config/         # Configuration files
├── utils/          # Utility functions
├── server.js       # Main application file
├── package.json    # Dependencies and scripts
└── .env           # Environment variables
```

## Getting Started

### Prerequisites

- Node.js (v14 or higher)
- MongoDB (local installation or MongoDB Atlas)
- npm or yarn

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Configure environment variables:
   ```bash
   cp .env.example .env
   ```
   Update the `.env` file with your configuration.

3. Start MongoDB (if running locally):
   ```bash
   mongod
   ```

4. Run the application:
   ```bash
   # Development mode
   npm run dev
   
   # Production mode
   npm start
   ```

## API Endpoints

### Health Check
- `GET /` - API information
- `GET /api/health` - Health status

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user (soft delete)

## Environment Variables

```env
NODE_ENV=development
PORT=5000
MONGODB_URI=mongodb://localhost:27017/nectarv
JWT_SECRET=your-super-secret-jwt-key
CLIENT_URL=http://localhost:3000
```

## Development

- `npm run dev` - Start development server with auto-restart
- `npm start` - Start production server
- `npm test` - Run tests (to be implemented)

## Technologies Used

- **Node.js** - JavaScript runtime
- **Express.js** - Web framework
- **MongoDB** - Database
- **Mongoose** - MongoDB ODM
- **Helmet** - Security middleware
- **CORS** - Cross-origin resource sharing
- **Morgan** - HTTP request logger
- **dotenv** - Environment variable loader
- **Nodemon** - Development auto-restart tool