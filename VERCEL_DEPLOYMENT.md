# Vercel Deployment Guide

## Environment Variables Configuration

When deploying to Vercel, you need to configure the following environment variables in your Vercel project settings:

### Required Environment Variables

1. **ALLOWED_ORIGINS** (Required for CORS)
   ```
   http://localhost:3000,http://localhost:3001,https://your-frontend-domain.vercel.app
   ```
   - Add all frontend URLs that should be allowed to access the backend
   - Separate multiple origins with commas
   - Include localhost URLs for local development testing

2. **MONGODB_URI** (Required)
   ```
   mongodb+srv://username:password@cluster.mongodb.net/nectarv
   ```
   - Your MongoDB Atlas connection string or other MongoDB URI

3. **JWT_SECRET** (Required)
   ```
   your-super-secret-jwt-key-change-this-in-production
   ```
   - A strong, random secret key for JWT token signing

4. **NODE_ENV** (Optional, defaults to development)
   ```
   production
   ```

5. **PORT** (Optional, Vercel sets this automatically)
   ```
   5000
   ```

6. **CLIENT_URL** (Optional)
   ```
   https://your-frontend-domain.vercel.app
   ```

## How to Set Environment Variables in Vercel

1. Go to your Vercel project dashboard
2. Navigate to **Settings** → **Environment Variables**
3. Add each variable:
   - **Key**: `ALLOWED_ORIGINS`
   - **Value**: `http://localhost:3000,http://localhost:3001,https://your-frontend-domain.vercel.app`
   - **Environment**: Select all (Production, Preview, Development)
4. Repeat for all required variables

## CORS Configuration

The backend is configured to allow requests from origins specified in `ALLOWED_ORIGINS`. 

**Important**: Make sure to include:
- `http://localhost:3000` - for local frontend development
- Your production frontend URL - for production deployments
- Any preview/staging URLs if needed

## Testing CORS

After deployment, test that CORS is working:

```bash
# Test from localhost
curl -H "Origin: http://localhost:3000" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://backend-blue-eta-17.vercel.app/api/categories
```

You should see CORS headers in the response.

## Troubleshooting

### CORS Error: "No 'Access-Control-Allow-Origin' header"
- Check that `ALLOWED_ORIGINS` includes your frontend URL
- Verify the environment variable is set in Vercel
- Check Vercel deployment logs for CORS warnings

### 500 Internal Server Error
- Check MongoDB connection string is correct
- Verify all required environment variables are set
- Check Vercel function logs for detailed error messages
- Ensure MongoDB Atlas allows connections from Vercel IPs (or use 0.0.0.0/0 for development)

## Security Notes

- **Never commit `.env` files** - they're in `.gitignore`
- Use strong, unique values for `JWT_SECRET` in production
- Restrict `ALLOWED_ORIGINS` to only necessary domains
- Consider using Vercel's environment variable encryption for sensitive values

