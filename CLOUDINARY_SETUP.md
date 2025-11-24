# Cloudinary Image Upload Setup

## Overview
The backend now supports image uploads to Cloudinary for menu items. When admins add or update menu items, they can upload images that are automatically stored in Cloudinary and the URLs are saved in the database.

## Configuration

### 1. Get Cloudinary Credentials
1. Sign up at [cloudinary.com](https://cloudinary.com)
2. Go to your Dashboard
3. Copy your credentials:
   - Cloud Name
   - API Key
   - API Secret

### 2. Set Environment Variables
Add these to your `.env` file in the backend directory:

```env
CLOUDINARY_CLOUD_NAME=your-cloudinary-cloud-name
CLOUDINARY_API_KEY=your-cloudinary-api-key
CLOUDINARY_API_SECRET=your-cloudinary-api-secret
```

### 3. For Vercel Deployment
Add these environment variables in your Vercel project settings:
- Go to Vercel Dashboard → Your Project → Settings → Environment Variables
- Add all three Cloudinary variables for Production, Preview, and Development environments

## Features

### Backend
- ✅ Image upload to Cloudinary on menu item creation/update
- ✅ Automatic image deletion from Cloudinary on hard delete
- ✅ Image replacement (old image deleted when new one uploaded)
- ✅ File validation (images only, max 5MB)
- ✅ Images stored in `nectarv/menu-items` folder in Cloudinary

### Frontend
- ✅ Image upload UI in admin catalog page
- ✅ Image preview before upload
- ✅ Display uploaded images in menu item cards
- ✅ Change/remove image functionality
- ✅ Fallback to emoji if no image

## Usage

### Adding a Menu Item with Image
1. Go to Admin → Catalog
2. Select a category
3. Click "New Item"
4. Fill in the form
5. Click "Upload Image" to select an image file
6. Preview will show the selected image
7. Click "Save Item"

### Updating a Menu Item Image
1. Click edit on an existing menu item
2. Click "Change Image" to upload a new image
3. The old image will be automatically deleted from Cloudinary
4. Save the changes

### Removing an Image
1. When editing a menu item, click the X button on the image preview
2. Save the item (it will keep the emoji fallback)

## File Structure

```
backend/
├── config/
│   └── cloudinary.js          # Cloudinary configuration
├── utils/
│   └── uploadImage.js         # Upload/delete utilities
├── middleware/
│   └── upload.js              # Multer middleware for file handling
└── controllers/
    └── menuItemController.js  # Updated to handle image uploads
```

## API Endpoints

### POST /api/menu-items
- Accepts `multipart/form-data` with `image` field
- Uploads image to Cloudinary
- Saves Cloudinary URL to database

### PUT /api/menu-items/:id
- Accepts `multipart/form-data` with `image` field
- Replaces old image if new one uploaded
- Deletes old image from Cloudinary

### DELETE /api/menu-items/:id
- Hard delete removes image from Cloudinary
- Soft delete keeps image

## Image Storage
- **Folder**: `nectarv/menu-items`
- **Format**: Original format preserved
- **CDN**: Cloudinary CDN for fast delivery
- **Optimization**: Cloudinary automatically optimizes images

## Troubleshooting

### Images not uploading
1. Check Cloudinary credentials in `.env`
2. Verify file size is under 5MB
3. Ensure file is an image (jpg, png, gif, etc.)
4. Check backend logs for Cloudinary errors

### Images not displaying
1. Check if `imageUrl` is saved in database
2. Verify Cloudinary URL is accessible
3. Check browser console for CORS errors
4. Ensure Cloudinary account is active

### Old images not deleting
- This is non-critical - old images will remain in Cloudinary
- You can manually clean them up from Cloudinary dashboard
- Or set up a cleanup script to remove orphaned images

