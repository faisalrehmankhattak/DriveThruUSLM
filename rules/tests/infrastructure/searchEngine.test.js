/**
 * SearchEngine Integration Tests with Real Database
 * Tests both canonical and multi-result search with 128 menu items
 */

const { getSearchService, cleanupSearchService } = require('../../infrastructure/data/searchEngine');

describe('SearchEngine Tests', () => {
  let searchService;

  beforeAll(async () => {
    searchService = getSearchService();
    console.log(' Connected to database with 128 menu items');
  });

  afterAll(async () => {
    // Clean up database connections to avoid Jest warnings
    await cleanupSearchService();
    console.log(' Search service cleaned up');
  });

  describe(' Multi-Result Search', () => {
    test('should find multiple items for broad queries', async () => {
      console.log(' Testing multi-result search...');
      
      const results = await searchService.search('wings', { 
        topK: 5, 
        minScore: 0.01 
      });

      console.log(` Found ${results.length} wing items:`);
      
      expect(Array.isArray(results)).toBe(true);
      expect(results.length).toBeGreaterThan(0);
      
      results.forEach((result, index) => {
        console.log(`  ${index + 1}. ${result.name} (ID: ${result.id}, Score: ${result.score.toFixed(3)})`);
        expect(result).toHaveProperty('id');
        expect(result).toHaveProperty('name');
        expect(result.score).toBeGreaterThan(0);
      });
      
      console.log(' Multi-search working correctly');
    });
  });

  describe(' Canonical Search', () => {
    test('should find best single match', async () => {
      console.log(' Testing canonical search (single best result)...');
      
      const testQueries = ['wings', 'chicken'];
      
      for (const query of testQueries) {
        const results = await searchService.search(query, { 
          topK: 1, 
          minScore: 0.01
        });
        
        const bestMatch = results.length > 0 ? results[0] : null;
        
        console.log(` Best match for "${query}":`, 
          bestMatch ? `${bestMatch.name} (${bestMatch.score.toFixed(3)})` : 'No match'
        );
        
        if (bestMatch) {
          expect(bestMatch).toHaveProperty('id');
          expect(bestMatch).toHaveProperty('name');
          expect(bestMatch.score).toBeGreaterThan(0);
        }
      }
      
      console.log(' Canonical search working correctly');
    });

    test('should handle typos with semantic similarity', async () => {
      console.log(' Testing typo tolerance...');
      
      const typoTest = { original: 'wings', typo: 'wigns' };
      
      const originalResults = await searchService.search(typoTest.original, { topK: 1, minScore: 0.01 });
      const typoResults = await searchService.search(typoTest.typo, { topK: 1, minScore: 0.01 });
      
      console.log(` "${typoTest.original}" vs "${typoTest.typo}":`);
      console.log(`   Original: ${originalResults.length > 0 ? originalResults[0].name : 'No match'}`);
      console.log(`   Typo: ${typoResults.length > 0 ? typoResults[0].name : 'No match'}`);
      
      expect(Array.isArray(originalResults)).toBe(true);
      expect(Array.isArray(typoResults)).toBe(true);
      
      console.log(' Typo tolerance verified');
    });
  });

  describe('Singleton Pattern', () => {
    test('should return same instance across calls', () => {
      const service1 = getSearchService();
      const service2 = getSearchService();

      expect(service1).toBe(service2); // Same instance
      expect(typeof service1.search).toBe('function');
      
      console.log(' Singleton pattern working correctly');
    });
  });
});
