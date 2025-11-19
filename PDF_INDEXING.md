# PDF Menu Indexing Guide

This guide explains how to index the Menu.pdf file into your RAG system.

## Overview

The PDF indexing system extracts text from `Menu.pdf` and adds it to your vector store, making it searchable through the RAG system. This allows the AI to answer questions about menu items, descriptions, and other information contained in the PDF.

## Quick Start

### Index the PDF

```bash
cd backend
npm run index:pdf
```

This will:
1. Extract text from `Menu.pdf`
2. Parse it into sections and chunks
3. Create vector embeddings for each chunk
4. Store them in the vector store as "knowledge" type documents

## How It Works

1. **Text Extraction**: Uses `pdf-parse` to extract all text from the PDF
2. **Section Parsing**: Automatically detects sections (headers, categories, etc.)
3. **Chunking**: Splits content into manageable chunks (1000 chars with 200 char overlap)
4. **Embedding**: Creates vector embeddings using DeepSeek
5. **Storage**: Stores in MongoDB vector store with metadata

## Usage

### Index PDF Only

```bash
npm run index:pdf
```

### Index Everything (Menu Items + Categories + PDF)

You can modify `scripts/indexKnowledgeBase.js` to include PDF indexing:

```javascript
const result = await indexKnowledgeBase({ includePDF: true });
```

Or run separately:
```bash
npm run index:kb    # Index menu items and categories
npm run index:pdf   # Index PDF
```

## PDF Structure

The system automatically detects:
- **Section headers** (all caps, short lines, or lines ending with `:`)
- **Content blocks** (grouped under sections)
- **Menu items** (if structured in the PDF)

## Chunking Strategy

- **Chunk Size**: 1000 characters (configurable)
- **Overlap**: 200 characters between chunks
- **Purpose**: Ensures context is preserved across chunk boundaries

## Metadata

Each indexed chunk includes:
- `type`: "knowledge"
- `source`: "Menu.pdf"
- `section`: Section title (if detected)
- `name`: "Menu.pdf - [Section Title]"
- `description`: First 200 characters of content

## Retrieval

When users ask questions, the RAG system will:
1. Search vector store for relevant chunks
2. Retrieve top matching chunks from PDF
3. Include them in the context for the LLM
4. Generate accurate responses based on PDF content

## Example Queries

After indexing, users can ask:
- "What's in the appetizer section?"
- "Tell me about the specials"
- "What are the prices for main courses?"
- "What ingredients are in [dish name]?"

## Troubleshooting

### PDF Not Found

Make sure `Menu.pdf` is in the `backend/` directory:
```bash
ls backend/Menu.pdf
```

### Extraction Errors

- Ensure PDF is not password protected
- Check PDF is not corrupted
- Verify PDF contains extractable text (not just images)

### Poor Results

- PDF might need better structure
- Try adjusting chunk size in `pdfService.js`
- Ensure PDF has clear section headers

### Re-indexing

To re-index the PDF after updates:
```bash
npm run index:pdf
```

The system will update existing chunks or create new ones.

## Configuration

You can customize PDF indexing in `services/pdfService.js`:

```javascript
// Adjust chunk size
chunkSize: 1000,  // Characters per chunk

// Adjust overlap
overlap: 200,     // Characters overlapping between chunks

// Custom source name
sourceName: 'Menu.pdf'
```

## Integration with RAG

The PDF content is automatically included when:
- User queries match PDF content semantically
- Similarity score exceeds threshold (default: 0.3)
- Top K results include PDF chunks

No additional configuration needed - it just works! 🎉

