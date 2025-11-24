import cloudinary from '../config/cloudinary.js';

/**
 * Upload image to Cloudinary
 * @param {Buffer|string} imageFile - Image file buffer or base64 string
 * @param {Object} options - Upload options
 * @param {string} options.folder - Folder path in Cloudinary
 * @param {string} options.publicId - Public ID for the image
 * @param {string} options.resourceType - Resource type (image, video, etc.)
 * @returns {Promise<Object>} Cloudinary upload result
 */
export const uploadImageToCloudinary = async (imageFile, options = {}) => {
  const {
    folder = 'nectarv/menu-items',
    publicId = null,
    resourceType = 'image',
  } = options;

  try {
    const uploadOptions = {
      folder,
      resource_type: resourceType,
      overwrite: true,
      invalidate: true, // Invalidate CDN cache
    };

    if (publicId) {
      uploadOptions.public_id = publicId;
    }

    // If imageFile is a buffer, convert to base64 data URI
    let uploadData;
    if (Buffer.isBuffer(imageFile)) {
      const base64Image = imageFile.toString('base64');
      uploadData = `data:image/jpeg;base64,${base64Image}`;
    } else {
      uploadData = imageFile;
    }

    const result = await cloudinary.uploader.upload(uploadData, uploadOptions);

    return {
      success: true,
      url: result.secure_url,
      publicId: result.public_id,
      width: result.width,
      height: result.height,
      format: result.format,
      bytes: result.bytes,
    };
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`Failed to upload image: ${error.message}`);
  }
};

/**
 * Delete image from Cloudinary
 * @param {string} publicId - Public ID of the image to delete
 * @returns {Promise<Object>} Deletion result
 */
export const deleteImageFromCloudinary = async (publicId) => {
  try {
    if (!publicId) {
      return { success: true, message: 'No public ID provided' };
    }

    const result = await cloudinary.uploader.destroy(publicId, {
      invalidate: true,
    });

    return {
      success: result.result === 'ok',
      message: result.result === 'ok' ? 'Image deleted successfully' : 'Failed to delete image',
    };
  } catch (error) {
    console.error('Cloudinary delete error:', error);
    throw new Error(`Failed to delete image: ${error.message}`);
  }
};

/**
 * Extract public ID from Cloudinary URL
 * @param {string} url - Cloudinary URL
 * @returns {string|null} Public ID or null
 */
export const extractPublicIdFromUrl = (url) => {
  if (!url) return null;
  
  try {
    // Cloudinary URL format: https://res.cloudinary.com/{cloud_name}/{resource_type}/upload/{version}/{public_id}.{format}
    const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/);
    return match ? match[1] : null;
  } catch (error) {
    console.error('Error extracting public ID:', error);
    return null;
  }
};

