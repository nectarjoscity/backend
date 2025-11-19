import mongoose from 'mongoose';

const { Schema } = mongoose;

const VectorStoreSchema = new Schema(
  {
    // Content to be retrieved
    content: {
      type: String,
      required: true,
      trim: true
    },
    
    // Embedding vector (384 dimensions for local model, 1536 for OpenAI text-embedding-3-small, 3072 for text-embedding-3-large)
    // The schema is flexible to support different embedding dimensions
    embedding: {
      type: [Number],
      required: true
    },
    
    // Metadata for filtering and context
    metadata: {
      // Type of document: 'menuItem', 'category', 'knowledge'
      type: {
        type: String,
        enum: ['menuItem', 'category', 'knowledge'],
        required: true
      },
      
      // Reference to the original document
      documentId: {
        type: Schema.Types.ObjectId,
        required: true
      },
      
      // Document name/title
      name: {
        type: String,
        trim: true
      },
      
      // Additional context
      category: String,
      price: Number,
      currency: String,
      description: String,
      itemName: String,
      tags: [String],
      
      // For knowledge base entries
      source: String,
      section: String
    },
    
    // Indexing metadata
    indexedAt: {
      type: Date,
      default: Date.now
    },
    
    // Version for re-indexing
    version: {
      type: Number,
      default: 1
    }
  },
  { timestamps: true }
);

// Indexes for efficient retrieval
VectorStoreSchema.index({ 'metadata.type': 1, 'metadata.documentId': 1 });
VectorStoreSchema.index({ 'metadata.type': 1 });
VectorStoreSchema.index({ indexedAt: -1 });

// Compound index for common queries
VectorStoreSchema.index({ 'metadata.type': 1, 'metadata.category': 1 });

// Text index for keyword search (hybrid search)
// Note: This index is created via migration script, but defined here for reference
VectorStoreSchema.index({ 
  content: 'text', 
  'metadata.name': 'text',
  'metadata.description': 'text',
  'metadata.itemName': 'text'
});

export default mongoose.model('VectorStore', VectorStoreSchema);

