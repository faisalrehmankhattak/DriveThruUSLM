const fs = require("fs");
const path = require("path");
const { createHybridSearch } = require("../rules/infrastructure/data/searchEngine");

async function populateMenuDatabase() {
  console.log("🍽️  Starting Menu Database Population");
  console.log("=====================================");

  try {
    // Read menu data
    console.log("📖 Reading menu data from large/menu-data.json...");
    const menuDataPath = path.join(__dirname, "large", "menu-data.json");
    const menuData = JSON.parse(fs.readFileSync(menuDataPath, "utf8"));
    console.log(`✅ Found ${menuData.items.length} menu items`);

    // Initialize HybridSearch 
    console.log("🔧 Initializing HybridSearch engine...");
    const searchEngine = createHybridSearch();
    
    // Test database connection
    console.log("🔗 Testing database connection...");
    await searchEngine.client.query("SELECT 1");
    console.log("✅ Database connection successful");

    // Setup database schema manually since we're already connected
    console.log("🗃️  Setting up database schema...");
    
    // Enable extensions
    try {
      await searchEngine.client.query("CREATE EXTENSION IF NOT EXISTS vector;");
      console.log("✅ pgvector extension enabled");
    } catch (error) {
      console.warn(`Could not enable pgvector: ${error.message}`);
    }

    try {
      await searchEngine.client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm;");
      console.log("✅ pg_trgm extension enabled");
    } catch (error) {
      console.warn(`Could not enable pg_trgm: ${error.message}`);
    }

    // Create the search_items table
    await searchEngine.client.query(`
      DROP TABLE IF EXISTS search_items CASCADE;
      CREATE TABLE search_items (
        id VARCHAR(255) PRIMARY KEY,
        name TEXT NOT NULL,
        embedding vector(1536),
        active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Create indexes
    await searchEngine.client.query(`
      CREATE INDEX IF NOT EXISTS idx_search_items_active 
      ON search_items(active) WHERE active = true;
    `);

    await searchEngine.client.query(`
      CREATE INDEX IF NOT EXISTS idx_search_items_name_gin 
      ON search_items USING gin(to_tsvector('english', name));
    `);

    await searchEngine.client.query(`
      CREATE INDEX IF NOT EXISTS idx_search_items_embedding_cosine 
      ON search_items USING ivfflat (embedding vector_cosine_ops) 
      WITH (lists = 100);
    `);

    console.log("✅ Database tables created");
    
    console.log("✅ Database schema created with indexes");

    // Process items in batches for efficiency
    const BATCH_SIZE = 10;
    let processedCount = 0;
    const totalItems = menuData.items.length;

    console.log("🚀 Starting batch processing of menu items...");
    
    for (let i = 0; i < totalItems; i += BATCH_SIZE) {
      const batch = menuData.items.slice(i, i + BATCH_SIZE);
      
      console.log(`📦 Processing batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(totalItems / BATCH_SIZE)} (items ${i + 1}-${Math.min(i + BATCH_SIZE, totalItems)})`);
      
      const promises = batch.map(async (item) => {
        try {
          // Extract only ID and name as requested
          const itemId = item.id;
          const itemName = item.name;
          
          console.log(`  🔄 Processing: ID ${itemId} - "${itemName}"`);
          
          // Use the search engine's addItem method which handles everything correctly
          await searchEngine.addItem(itemId, itemName, true);
          
          console.log(`  ✅ Stored: ID ${itemId} - "${itemName}"`);
          return { success: true, id: itemId, name: itemName };
          
        } catch (error) {
          console.error(`  ❌ Failed to process item ${item.id}: ${error.message}`);
          return { success: false, id: item.id, error: error.message };
        }
      });
      
      const results = await Promise.all(promises);
      const successCount = results.filter(r => r.success).length;
      processedCount += successCount;
      
      console.log(`  📊 Batch complete: ${successCount}/${batch.length} items processed successfully`);
      
      // Small delay to avoid rate limiting
      if (i + BATCH_SIZE < totalItems) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Final verification
    console.log("🔍 Verifying database population...");
    const countResult = await searchEngine.client.query("SELECT COUNT(*) as count FROM search_items WHERE active = true");
    const storedCount = parseInt(countResult.rows[0].count);
    
    console.log("📈 POPULATION SUMMARY:");
    console.log("=====================");
    console.log(`📁 Total menu items: ${totalItems}`);
    console.log(`✅ Successfully processed: ${processedCount}`);
    console.log(`🗃️  Items in database: ${storedCount}`);
    console.log(`📊 Success rate: ${((processedCount / totalItems) * 100).toFixed(1)}%`);

    if (storedCount === totalItems) {
      console.log("🎉 DATABASE POPULATION COMPLETED SUCCESSFULLY!");
      
      // Test a quick search
      console.log("\n🔍 Testing search functionality...");
      const testResults = await searchEngine.search("wings", { limit: 3 });
      console.log(`✅ Search test: Found ${testResults.length} results for "wings"`);
      testResults.forEach((result, idx) => {
        console.log(`  ${idx + 1}. ${result.name} (score: ${result.score.toFixed(3)})`);
      });
    } else {
      console.log("⚠️  Warning: Some items may not have been stored properly");
    }

  } catch (error) {
    console.error("❌ Error during database population:", error);
    throw error;
  }
}

// Run the population script
if (require.main === module) {
  populateMenuDatabase()
    .then(() => {
      console.log("🏁 Script completed successfully");
      process.exit(0);
    })
    .catch((error) => {
      console.error("💥 Script failed:", error);
      process.exit(1);
    });
}

module.exports = { populateMenuDatabase };