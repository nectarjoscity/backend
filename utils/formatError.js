// Helper to format MongoDB errors into user-friendly messages
export const formatError = (error) => {
    // Duplicate key error
    if (error.code === 11000) {
        const field = Object.keys(error.keyPattern || {})[0] || 'field';
        const value = error.keyValue ? Object.values(error.keyValue)[0] : '';
        return `An item with this ${field} ("${value}") already exists. Please use a different ${field}.`;
    }

    // Validation errors
    if (error.name === 'ValidationError') {
        const messages = Object.values(error.errors || {}).map(e => e.message);
        return messages.join('. ') || 'Validation failed. Please check your input.';
    }

    // Cast error (invalid ID format)
    if (error.name === 'CastError') {
        return 'Invalid ID format. Please check the ID and try again.';
    }

    // Connection errors
    if (error.name === 'MongoNetworkError' || error.name === 'MongoTimeoutError') {
        return 'Database connection error. Please try again in a moment.';
    }

    return error.message || 'An unexpected error occurred.';
};

export default formatError;
