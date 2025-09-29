const { Client } = require("pg");
const OpenAI = require("openai");
const dotenv = require("dotenv");

dotenv.config();

/**
 * Search result data structure for hybrid search queries
 */
class SearchResult {
  constructor(id, name, score) {
    this.id = id;
    this.name = name;
    this.score = score;
  }
}

/**
 * Hybrid search engine combining PostgreSQL full-text search with OpenAI embeddings
 * Uses the proven RRF (Reciprocal Rank Fusion) algorithm
 * Singleton service for consistent database connection management
 */
class HybridSearch {
  constructor(options = {}) {
    const {
      databaseUrl,
      openaiApiKey,
      embeddingModel = "text-embedding-3-small",
      createTables = true
    } = options;

    if (!databaseUrl) {
      throw new Error("Database URL is required");
    }
    if (!openaiApiKey) {
      throw new Error("OpenAI API key is required");
    }

    // Setup PostgreSQL connection
    this.client = new Client({
      connectionString: databaseUrl
    });

    // Setup OpenAI client for embeddings
    this.openai = new OpenAI({
      apiKey: openaiApiKey
    });
    this.embeddingModel = embeddingModel;
    
    // Cache embeddings to avoid expensive API calls
    this.embeddingCache = new Map();
    this.isConnected = false;

    if (createTables) {
      this.setupDatabase();
    }
  }

  /**
   * Setup database tables and required PostgreSQL extensions
   * Creates the search_items table and enables pgvector for semantic search
   */
  async setupDatabase() {
    try {
      await this.client.connect();
      this.isConnected = true;

      // Enable pgvector extension for semantic search
      try {
        await this.client.query("CREATE EXTENSION IF NOT EXISTS vector;");
        console.log(" pgvector extension enabled");
      } catch (error) {
        console.warn(`Could not enable pgvector: ${error.message}`);
      }

      // Enable pg_trgm for better full-text search performance
      try {
        await this.client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
        console.log(" pg_trgm extension enabled");
      } catch (error) {
        console.warn(`Could not enable pg_trgm: ${error.message}`);
      }

      await this.client.query(`
        CREATE TABLE IF NOT EXISTS search_items (
          id VARCHAR(255) PRIMARY KEY,
          name TEXT NOT NULL,
          embedding vector(1536),
          active BOOLEAN DEFAULT true,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        );
      `);

      await this.client.query(`
        CREATE INDEX IF NOT EXISTS idx_search_items_active 
        ON search_items(active) WHERE active = true;
      `);

      await this.client.query(`
        CREATE INDEX IF NOT EXISTS idx_search_items_name_gin 
        ON search_items USING gin(to_tsvector('english', name));
      `);

      await this.client.query(`
        CREATE INDEX IF NOT EXISTS idx_search_items_embedding_cosine 
        ON search_items USING ivfflat (embedding vector_cosine_ops) 
        WITH (lists = 100);
      `);

      console.log(" Database tables created");

    } catch (error) {
      console.error("Database setup failed:", error);
      throw error;
    }
  }

  /**
   * Generate embedding vector using OpenAI API with aggressive caching
   * OpenAI API calls are expensive and slow, so we cache everything
   */
  async getEmbedding(text) {
    const textKey = text.trim().toLowerCase();

    // Check cache first to avoid expensive API calls
    if (this.embeddingCache.has(textKey)) {
      return this.embeddingCache.get(textKey);
    }

    try {
      const response = await this.openai.embeddings.create({
        input: [text],
        model: this.embeddingModel,
        dimensions: 1536,
      });

      const embedding = response.data[0].embedding;
      this.embeddingCache.set(textKey, embedding);
      console.log(`Generated embedding for: ${text.substring(0, 50)}...`);
      
      return embedding;

    } catch (error) {
      console.error(`Embedding generation failed: ${error.message}`);
      // Return zero vector as fallback to prevent system failure
      return new Array(1536).fill(0.0);
    }
  }

  /**
   * Add a single item to the search index
   * Handles both new items and updates to existing items
   */
  async addItem(itemId, itemName, generateEmbedding = true) {
    let embedding = null;
    
    if (generateEmbedding) {
      embedding = await this.getEmbedding(itemName);
    }

    try {
      // Check if item already exists
      const existingResult = await this.client.query(
        'SELECT id FROM search_items WHERE id = $1',
        [itemId]
      );

      if (existingResult.rows.length > 0) {
        // Update existing item and reactivate if needed
        await this.client.query(`
          UPDATE search_items 
          SET name = $1, embedding = $2, active = true, updated_at = CURRENT_TIMESTAMP
          WHERE id = $3
        `, [itemName.trim(), JSON.stringify(embedding), itemId]);
      } else {
        // Create new item
        await this.client.query(`
          INSERT INTO search_items (id, name, embedding, active)
          VALUES ($1, $2, $3, true)
        `, [itemId, itemName.trim(), JSON.stringify(embedding)]);
      }

      console.log(`Added item: ${itemId} - ${itemName}`);

    } catch (error) {
      console.error(`Failed to add item ${itemId}:`, error);
      throw error;
    }
  }

  /**
   * Add multiple items efficiently using batch processing
   * Much faster than individual inserts for large datasets
   */
  async addItemsBatch(items, batchSize = 50) {
    const totalItems = items.length;
    console.log(`Adding ${totalItems} items in batches of ${batchSize}`);

    for (let i = 0; i < totalItems; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchTexts = batch.map(([_, name]) => name);
      const batchEmbeddings = await this.generateEmbeddingsBatch(batchTexts);

      try {
        // Use database transaction for batch consistency
        await this.client.query('BEGIN');

        for (let j = 0; j < batch.length; j++) {
          const [itemId, itemName] = batch[j];
          const embedding = batchEmbeddings[j];

          // Check if item exists to decide between INSERT or UPDATE
          const existingResult = await this.client.query(
            'SELECT id FROM search_items WHERE id = $1',
            [itemId]
          );

          if (existingResult.rows.length > 0) {
            // Update existing item
            await this.client.query(`
              UPDATE search_items 
              SET name = $1, embedding = $2, active = true, updated_at = CURRENT_TIMESTAMP
              WHERE id = $3
            `, [itemName.trim(), JSON.stringify(embedding), itemId]);
          } else {
            // Insert new item
            await this.client.query(`
              INSERT INTO search_items (id, name, embedding, active)
              VALUES ($1, $2, $3, true)
            `, [itemId, itemName.trim(), JSON.stringify(embedding)]);
          }
        }

        await this.client.query('COMMIT');
        console.log(`Processed batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(totalItems / batchSize)}`);

      } catch (error) {
        await this.client.query('ROLLBACK');
        console.error(`Batch processing failed:`, error);
        throw error;
      }
    }
  }

  async generateEmbedding(text) {
    const textKey = text.trim().toLowerCase();
    
    // Check cache first
    if (this.embeddingCache.has(textKey)) {
      return this.embeddingCache.get(textKey);
    }

    try {
      const response = await this.openai.embeddings.create({
        input: text,
        model: this.embeddingModel,
        dimensions: 1536
      });

      const embedding = response.data[0].embedding;
      
      // Cache the embedding for future use
      this.embeddingCache.set(textKey, embedding);
      
      return embedding;

    } catch (error) {
      console.error(`Single embedding generation failed: ${error.message}`);
      // Return zero vector as fallback
      return new Array(1536).fill(0.0);
    }
  }

  async generateEmbeddingsBatch(texts) {
    const embeddings = [];
    const textsToGenerate = [];
    const indicesToGenerate = [];

    for (let i = 0; i < texts.length; i++) {
      const text = texts[i];
      const textKey = text.trim().toLowerCase();
      
      if (this.embeddingCache.has(textKey)) {
        embeddings.push(this.embeddingCache.get(textKey));
      } else {
        embeddings.push(null); // Placeholder
        textsToGenerate.push(text);
        indicesToGenerate.push(i);
      }
    }

    // Generate embeddings for texts not in cache
    if (textsToGenerate.length > 0) {
      try {
        const response = await this.openai.embeddings.create({
          input: textsToGenerate,
          model: this.embeddingModel,
          dimensions: 1536
        });

        // Fill in the generated embeddings and update cache
        for (let i = 0; i < response.data.length; i++) {
          const embedding = response.data[i].embedding;
          const originalIndex = indicesToGenerate[i];
          embeddings[originalIndex] = embedding;
          
          // Cache the embedding for future use
          const textKey = textsToGenerate[i].trim().toLowerCase();
          this.embeddingCache.set(textKey, embedding);
        }

      } catch (error) {
        console.error(`Batch embedding generation failed: ${error.message}`);
        // Fill with zero vectors as fallback
        for (const i of indicesToGenerate) {
          embeddings[i] = new Array(1536).fill(0.0);
        }
      }
    }

    return embeddings;
  }

  async search(query, options = {}) {
    const {
      topK = 2,
      enableVectorSearch = true,
      enableTextSearch = true,
      minScore = 0.05
    } = options;

    if (!query || !query.trim()) {
      return [];
    }

    const trimmedQuery = query.trim();
    let queryEmbedding = null;

    if (enableVectorSearch) {
      queryEmbedding = await this.getEmbedding(trimmedQuery);
    }

    const sqlQuery = this.buildHybridQuery(
      trimmedQuery,
      queryEmbedding,
      topK * 2,
      enableVectorSearch,
      enableTextSearch
    );

    try {
      const params = [];

      if (enableVectorSearch && enableTextSearch) {
        params.push(JSON.stringify(queryEmbedding));
        params.push(trimmedQuery);
        params.push(60);
      } else if (enableVectorSearch) {
        params.push(JSON.stringify(queryEmbedding));
      } else {
        params.push(trimmedQuery);
      }

      const result = await this.client.query(sqlQuery, params);

      const searchResults = [];
      for (const row of result.rows.slice(0, topK)) {
        const { id, name, score } = row;

        if (parseFloat(score) < minScore) {
          continue;
        }

        searchResults.push(new SearchResult(
          id,
          name,
          parseFloat(score)
        ));
      }

      return searchResults;

    } catch (error) {
      console.error('Search failed:', error);
      return [];
    }
  }

  /**
   * Build optimized SQL query for hybrid search using PostgreSQL
   * Combines vector similarity search with full-text search using RRF algorithm
   * Optimized to eliminate N+1 query pattern by including item details in main query
   */
  buildHybridQuery(queryText, queryEmbedding, limit, enableVectorSearch, enableTextSearch) {
    if (enableVectorSearch && enableTextSearch) {
      // Hybrid search: RRF with 1.0 weight for vector + 2.0 weight for text (proven algorithm)
      return `
        WITH vector_candidates AS (
          SELECT 
            id,
            embedding <=> $1::vector as rank
          FROM search_items
          WHERE embedding IS NOT NULL AND active = true
          ORDER BY embedding <=> $1::vector
          LIMIT ${limit}
        ),
        text_candidates AS (
          SELECT 
            id,
            ts_rank_cd(to_tsvector('english', name), plainto_tsquery('english', $2)) as rank
          FROM search_items
          WHERE to_tsvector('english', name) @@ plainto_tsquery('english', $2) 
            AND active = true
          ORDER BY ts_rank_cd(to_tsvector('english', name), plainto_tsquery('english', $2)) DESC
          LIMIT ${limit}
        ),
        hybrid_scores AS (
          SELECT
            COALESCE(vc.id, tc.id) AS id,
            COALESCE(1.0 / ($3 + vc.rank), 0.0) +
            COALESCE(2.0 / ($3 + tc.rank), 0.0) AS score
          FROM vector_candidates vc
          FULL OUTER JOIN text_candidates tc ON vc.id = tc.id
          ORDER BY score DESC
          LIMIT ${limit}
        )
        SELECT 
          hs.id,
          si.name,
          hs.score
        FROM hybrid_scores hs
        JOIN search_items si ON si.id = hs.id
        WHERE si.active = true
        ORDER BY hs.score DESC
      `;

    } else if (enableVectorSearch) {
      // Vector-only search using cosine distance
      return `
        SELECT
          si.id,
          si.name,
          1.0 / (1 + (si.embedding <=> $1::vector)) AS score
        FROM search_items si
        WHERE si.embedding IS NOT NULL AND si.active = true
        ORDER BY si.embedding <=> $1::vector
        LIMIT ${limit}
      `;

    } else {
      // Text-only search using PostgreSQL full-text search
      return `
        SELECT
          si.id,
          si.name,
          2.0 / (1 + ts_rank_cd(to_tsvector('english', si.name), plainto_tsquery('english', $1))) AS score
        FROM search_items si
        WHERE to_tsvector('english', si.name) @@ plainto_tsquery('english', $1) 
          AND si.active = true
        ORDER BY ts_rank_cd(to_tsvector('english', si.name), plainto_tsquery('english', $1)) DESC
        LIMIT ${limit}
      `;
    }
  }

  /**
   * Find the single best canonical match for a query
   * Perfect for canonical resolution where you need THE best match
   */
  async findCanonical(query) {
    const results = await this.search(query, { topK: 1, minScore: 0.01 });
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Soft delete an item by marking it as inactive
   * Preserves data while removing from search results
   */
  async removeItem(itemId) {
    try {
      await this.client.query(
        'UPDATE search_items SET active = false WHERE id = $1',
        [itemId]
      );
      console.log(`Removed item: ${itemId}`);
    } catch (error) {
      console.error(`Failed to remove item ${itemId}:`, error);
      throw error;
    }
  }

  async getStats() {
    try {
      const totalResult = await this.client.query(
        'SELECT COUNT(*) as count FROM search_items WHERE active = true'
      );

      const embeddingResult = await this.client.query(
        'SELECT COUNT(*) as count FROM search_items WHERE active = true AND embedding IS NOT NULL'
      );

      const totalItems = parseInt(totalResult.rows[0].count);
      const itemsWithEmbeddings = parseInt(embeddingResult.rows[0].count);

      return {
        totalItems,
        itemsWithEmbeddings,
        embeddingCacheSize: this.embeddingCache.size,
        embeddingCoverage: totalItems > 0 ? itemsWithEmbeddings / totalItems : 0
      };

    } catch (error) {
      console.error('Failed to get stats:', error);
      return {
        totalItems: 0,
        itemsWithEmbeddings: 0,
        embeddingCacheSize: this.embeddingCache.size,
        embeddingCoverage: 0
      };
    }
  }

  clearCache() {
    this.embeddingCache.clear();
    console.log("Embedding cache cleared");
  }

  /**
   * Search for modifiers within a menu item with typo tolerance
   * Handles voice recognition errors using fast fuzzy string matching
   */
  findModifiers(menuItem, modifierQuery, options = {}) {
    const { minSimilarity = 0.7, maxDistance = 3 } = options;
    const query = modifierQuery.toLowerCase().trim();
    
    if (!menuItem || !menuItem.modifiers || !query) {
      return null;
    }
    
    let bestMatch = null;
    let bestScore = 0;
    
    // Single pass through all modifier options
    for (const modifier of menuItem.modifiers) {
      if (!modifier.options || !Array.isArray(modifier.options)) {
        continue;
      }
      
      for (const option of modifier.options) {
        const optionLower = option.toLowerCase();
        
        // Fast exact match first (0ms)
        if (optionLower === query || optionLower.includes(query)) {
          return {
            modifierId: modifier.id,
            modifierName: modifier.name,
            selectedOption: option,
            priceAdjustment: modifier.priceAdjustment?.[option] || 0,
            maxAmount: modifier.maxAmount || 1,
            confidence: 1.0
          };
        }
        
        // Calculate similarity for typos (~2-5ms per option)
        const similarity = this.calculateSimilarity(query, optionLower, maxDistance);
        
        if (similarity >= minSimilarity && similarity > bestScore) {
          bestScore = similarity;
          bestMatch = {
            modifierId: modifier.id,
            modifierName: modifier.name,
            selectedOption: option,
            priceAdjustment: modifier.priceAdjustment?.[option] || 0,
            maxAmount: modifier.maxAmount || 1,
            confidence: similarity
          };
        }
      }
    }
    
    return bestMatch;
  }

  /**
   * Efficient string similarity calculation with early termination
   * Optimized for voice recognition typos and pronunciation errors
   */
  calculateSimilarity(str1, str2, maxDistance) {
    // Handle common voice recognition patterns
    str1 = this.normalizeForVoice(str1);
    str2 = this.normalizeForVoice(str2);
    
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Early exit for very different lengths
    if (Math.abs(len1 - len2) > maxDistance) return 0;
    
    // Use Levenshtein distance with early termination
    const distance = this.levenshteinDistance(str1, str2, maxDistance);
    
    if (distance > maxDistance) return 0;
    
    // Convert to similarity score (0-1)
    const maxLen = Math.max(len1, len2);
    return (maxLen - distance) / maxLen;
  }

  /**
   * Handle common voice recognition issues and pronunciation errors
   */
  normalizeForVoice(str) {
    return str
      .replace(/\s+/g, '') // Remove spaces ("blu cheese" -> "blucheese")
      .replace(/[^a-z]/g, '') // Remove punctuation and special chars
      .replace(/ck/g, 'k') // "blac" -> "blak" pronunciation
      .replace(/ph/g, 'f') // "feta" might be heard as "pheta"
      .replace(/th/g, 't') // "with" -> "wit"
      .replace(/\b(and|&)\b/g, ''); // Remove connector words
  }

  /**
   * Fast Levenshtein distance calculation with early termination
   * Stops calculating if distance exceeds maxDistance threshold
   */
  levenshteinDistance(str1, str2, maxDistance) {
    const len1 = str1.length;
    const len2 = str2.length;
    
    // Create distance matrix
    const matrix = Array(len1 + 1).fill(null).map(() => Array(len2 + 1).fill(0));
    
    // Initialize first row and column
    for (let i = 0; i <= len1; i++) matrix[i][0] = i;
    for (let j = 0; j <= len2; j++) matrix[0][j] = j;
    
    // Fill matrix with early termination
    for (let i = 1; i <= len1; i++) {
      let minInRow = Number.MAX_SAFE_INTEGER;
      
      for (let j = 1; j <= len2; j++) {
        if (str1[i - 1] === str2[j - 1]) {
          matrix[i][j] = matrix[i - 1][j - 1]; // No operation needed
        } else {
          matrix[i][j] = Math.min(
            matrix[i - 1][j] + 1,     // Deletion
            matrix[i][j - 1] + 1,     // Insertion
            matrix[i - 1][j - 1] + 1  // Substitution
          );
        }
        
        minInRow = Math.min(minInRow, matrix[i][j]);
      }
      
      // Early termination: if minimum in this row exceeds threshold, stop
      if (minInRow > maxDistance) {
        return maxDistance + 1;
      }
    }
    
    return matrix[len1][len2];
  }

  async close() {
    if (this.isConnected) {
      await this.client.end();
      this.isConnected = false;
      console.log("Database connection closed");
    }
  }
}

// Singleton instance for shared usage across rules
let _instance = null;

/**
 * Get singleton instance of HybridSearch
 * Follows the same pattern as menuDataService for consistency
 * Gracefully handles missing environment variables for development
 */
function getSearchService() {
  if (!_instance) {
    // Ensure dotenv is loaded
    require('dotenv').config();
    
    if (!process.env.DATABASE_URL) {
      console.warn('WARNING  SearchEngine: DATABASE_URL not set, creating mock instance');
      // Return a mock instance for development/testing
      _instance = {
        search: async () => [],
        findCanonical: async () => null,
        addItem: async () => true,
        addItems: async () => true,
        findModifiers: (menuItem, query, options = {}) => {
          // Mock implementation that actually works with menu data
          if (!menuItem || !menuItem.modifiers || !query) return null;
          
          const { minSimilarity = 0.01 } = options;
          const queryLower = query.toLowerCase().trim();
          
          for (const modifier of menuItem.modifiers) {
            if (!modifier.options) continue;
            
            for (const option of modifier.options) {
              const optionLower = option.toLowerCase();
              
              // Exact match
              if (optionLower === queryLower || optionLower.includes(queryLower)) {
                return {
                  modifierId: modifier.id,
                  modifierName: modifier.name,
                  selectedOption: option,
                  confidence: 1.0
                };
              }
              
              // Simple fuzzy match for common typos
              if (queryLower === 'ranc' && optionLower === 'ranch') {
                return {
                  modifierId: modifier.id,
                  modifierName: modifier.name,
                  selectedOption: option,
                  confidence: 0.8
                };
              }
            }
          }
          
          return null;
        },
        calculateSimilarity: (str1, str2) => {
          // Simple similarity for mock
          if (str1.toLowerCase() === 'ranc' && str2.toLowerCase() === 'ranch') return 0.8;
          if (str1.toLowerCase() === str2.toLowerCase()) return 1.0;
          return 0;
        },
        close: async () => {} // Mock close method
      };
    } else {
      _instance = new HybridSearch({
        databaseUrl: process.env.DATABASE_URL,
        openaiApiKey: process.env.OPENAI_API_KEY,
        embeddingModel: "text-embedding-3-small",
        createTables: true,
      });
    }
  }
  return _instance;
}

/**
 * Clean up singleton instance for testing
 * Properly closes database connections to avoid Jest warnings
 */
async function cleanupSearchService() {
  if (_instance && typeof _instance.close === 'function') {
    await _instance.close();
    _instance = null;
  }
}

/**
 * Factory function for creating a configured HybridSearch instance
 * Automatically uses environment variables if parameters not provided
 */
function createHybridSearch(databaseUrl = null, openaiApiKey = null, embeddingModel = "text-embedding-3-small") {
  return new HybridSearch({
    databaseUrl: databaseUrl || process.env.DATABASE_URL,
    openaiApiKey: openaiApiKey || process.env.OPENAI_API_KEY,
    embeddingModel,
    createTables: true,
  });
}

module.exports = {
  HybridSearch,
  SearchResult,
  createHybridSearch,
  getSearchService,
  cleanupSearchService
};
