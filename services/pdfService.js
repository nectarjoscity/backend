import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import mongoose from 'mongoose';
import { upsertDocument, deleteDocuments } from './vectorStoreService.js';

const require = createRequire(import.meta.url);
const pdfParseModule = require('pdf-parse');
// pdf-parse exports PDFParse class - use getText() method
async function parsePDF(buffer) {
  let parser = null;
  try {
    parser = new pdfParseModule.PDFParse({ data: buffer });
    const result = await parser.getText();
    const text = result.text || '';
    // Clean up parser to free memory
    await parser.destroy();
    parser = null;
    return { text };
  } catch (error) {
    // Clean up on error
    if (parser) {
      try {
        await parser.destroy();
      } catch (e) {
        // Ignore cleanup errors
      }
    }
    throw error;
  }
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Extract text from PDF file
 * @param {string} pdfPath - Path to PDF file
 * @returns {Promise<string>} - Extracted text
 */
export async function extractTextFromPDF(pdfPath) {
  try {
    const dataBuffer = fs.readFileSync(pdfPath);
    const data = await parsePDF(dataBuffer);
    return data.text || '';
  } catch (error) {
    console.error('Error extracting text from PDF:', error);
    throw new Error(`Failed to extract text from PDF: ${error.message}`);
  }
}

/**
 * Split text into chunks for better indexing
 * @param {string} text - Text to chunk
 * @param {number} chunkSize - Maximum characters per chunk
 * @param {number} overlap - Overlap between chunks
 * @returns {string[]} - Array of text chunks
 */
export function chunkText(text, chunkSize = 1000, overlap = 200) {
  if (!text || text.length === 0) {
    return [];
  }

  const chunks = [];
  let start = 0;
  const maxChunks = 10000; // Safety limit to prevent memory issues

  while (start < text.length && chunks.length < maxChunks) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    
    // Move forward, accounting for overlap
    const nextStart = end - overlap;
    if (nextStart <= start) {
      // Prevent infinite loop - move forward at least by chunkSize
      start = end;
    } else {
      start = nextStart;
    }
  }

  return chunks;
}

/**
 * Parse menu PDF and extract structured information
 * @param {string} text - Extracted PDF text
 * @returns {Array} - Array of sections with content
 */
export function parseMenuPDF(text) {
  const sections = [];
  const lines = text.split('\n').map(line => line.trim()).filter(line => line.length > 0);

  let currentSection = null;
  let currentContent = [];

  for (const line of lines) {
    // Detect section headers (all caps, short lines, or lines ending with :)
    const isHeader = (
      line.length < 50 && 
      (line === line.toUpperCase() || line.endsWith(':'))
    );

    if (isHeader && currentSection) {
      // Save previous section
      if (currentContent.length > 0) {
        sections.push({
          title: currentSection,
          content: currentContent.join('\n')
        });
      }
      currentSection = line.replace(':', '').trim();
      currentContent = [];
    } else if (isHeader && !currentSection) {
      currentSection = line.replace(':', '').trim();
    } else if (currentSection) {
      currentContent.push(line);
    } else {
      // Content without a section header
      if (currentContent.length === 0) {
        currentSection = 'Menu Information';
      }
      currentContent.push(line);
    }
  }

  // Save last section
  if (currentSection && currentContent.length > 0) {
    sections.push({
      title: currentSection,
      content: currentContent.join('\n')
    });
  }

  return sections;
}

/**
 * Index PDF content into vector store
 * @param {string} pdfPath - Path to PDF file
 * @param {Object} options - Indexing options
 * @returns {Promise<Object>} - Indexing results
 */
export async function indexPDF(pdfPath, options = {}) {
  const {
    chunkSize = 500, // Reduced chunk size to avoid memory issues
    overlap = 100,  // Reduced overlap
    sourceName = 'Menu.pdf'
  } = options;

  try {
    // Extract text from PDF
    console.log(`Extracting text from ${pdfPath}...`);
    const text = await extractTextFromPDF(pdfPath);
    console.log(`Extracted ${text.length} characters from PDF`);

    // Force garbage collection hint
    if (global.gc) {
      global.gc();
    }

    // Parse into sections
    const sections = parseMenuPDF(text);
    console.log(`Parsed into ${sections.length} sections`);

    // If no sections found, chunk the entire text
    let chunks = [];
    if (sections.length === 0) {
      chunks = chunkText(text, chunkSize, overlap);
      chunks = chunks.map((chunk, index) => ({
        title: `Menu Section ${index + 1}`,
        content: chunk
      }));
    } else {
      // Chunk each section
      for (const section of sections) {
        const sectionChunks = chunkText(section.content, chunkSize, overlap);
        for (const chunk of sectionChunks) {
          chunks.push({
            title: section.title,
            content: chunk
          });
        }
      }
    }

    // Index each chunk in batches to avoid memory issues
    let indexed = 0;
    let errors = 0;
    const batchSize = 5; // Process 5 chunks at a time

    // Remove previous knowledge chunks for this source to avoid duplicates
    try {
      await deleteDocuments({
        'metadata.type': 'knowledge',
        'metadata.source': sourceName
      });
      console.log(`Cleared previous knowledge chunks for ${sourceName}`);
    } catch (cleanupError) {
      console.warn(`Could not clean previous knowledge chunks for ${sourceName}:`, cleanupError.message);
    }

    for (let i = 0; i < chunks.length; i += batchSize) {
      const batch = chunks.slice(i, Math.min(i + batchSize, chunks.length));
      
      // Process batch sequentially to avoid overwhelming the API
      for (let j = 0; j < batch.length; j++) {
        const chunk = batch[j];
        const chunkIndex = i + j + 1;
        try {
          // Extract item names from chunk content (e.g., "Tigra Bliss", "Isla Cream", "Avoba Banana Bliss")
          // Pattern 1: Item name at the start of content (2-5 capitalized words, possibly with numbers)
          const itemNameAtStart = chunk.content.match(/^([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){1,4})(?:\s*[•\n•\-\–\—]|$)/m);
          
          // Pattern 2: Item name followed by common verbs (e.g., "Tigra Bliss is a drink")
          const itemNameWithVerb = chunk.content.match(/\b([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){1,4})\s+(?:is|are|blends|celebrates|delivers|offers|provides|supports|features|contains|includes|combines|mixes)/i);
          
          // Pattern 3: Item name in quotes or after emoji (e.g., "✨ Tigra Bliss" or '"Tigra Bliss"')
          const itemNameInQuotes = chunk.content.match(/(?:✨|🌟|💚|🍹|🥤|📋|•)\s*([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){1,4})/);
          
          // Pattern 4: Item name as a standalone line (common in menu formats)
          const itemNameStandalone = chunk.content.match(/^([A-Z][a-zA-Z0-9]+(?:\s+[A-Z][a-zA-Z0-9]+){1,4})\s*$/m);
          
          // Try patterns in order of specificity
          const itemNameInContent = itemNameAtStart?.[1] || 
                                    itemNameWithVerb?.[1] || 
                                    itemNameInQuotes?.[1] || 
                                    itemNameStandalone?.[1];
          
          // Clean up the item name (remove extra whitespace, trim)
          const finalItemName = itemNameInContent ? itemNameInContent.trim() : null;
          
          const chunkDocumentId = new mongoose.Types.ObjectId();

          await upsertDocument({
            content: `${chunk.title}\n\n${chunk.content}`,
            metadata: {
              type: 'knowledge',
              documentId: chunkDocumentId,
              name: finalItemName ? `${sourceName} - ${finalItemName}` : `${sourceName} - ${chunk.title}`,
              source: sourceName,
              section: chunk.title,
              itemName: finalItemName,
              description: chunk.content.substring(0, 200) // First 200 chars as description
            }
          });
          indexed++;
          if (chunkIndex % 10 === 0) {
            console.log(`  Indexed ${chunkIndex}/${chunks.length} chunks...`);
          }
        } catch (error) {
          console.error(`Error indexing chunk ${chunkIndex}:`, error.message);
          errors++;
        }
      }
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      indexed,
      errors,
      total: chunks.length,
      sections: sections.length,
      textLength: text.length
    };
  } catch (error) {
    console.error('Error indexing PDF:', error);
    throw error;
  }
}

/**
 * Index the Menu.pdf file from the backend directory
 * @returns {Promise<Object>} - Indexing results
 */
export async function indexMenuPDF() {
  const pdfPath = path.join(__dirname, '..', 'Menu.pdf');
  
  if (!fs.existsSync(pdfPath)) {
    throw new Error(`PDF file not found: ${pdfPath}`);
  }

  return await indexPDF(pdfPath, {
    sourceName: 'Menu.pdf',
    chunkSize: 1000,
    overlap: 200
  });
}

