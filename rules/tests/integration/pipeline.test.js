/**
 * Pipeline Integration Test
 * 
 * Tests the configurable pipeline across different modes (production, development, testing).
 * Validates that the same pipeline can adapt to different environments and use cases.
 **/

const Pipeline = require('../../pipelines/Pipeline');

describe(' Pipeline', () => {
  // Set longer timeout for integration tests
  jest.setTimeout(30000);

  afterAll(async () => {
    console.log(' Pipeline Tests Completed!');
    
    // Clean database connections
    try {
      const { getSearchService } = require('../../infrastructure/data/searchEngine');
      const searchService = getSearchService();
      if (searchService && searchService.client) {
        await searchService.client.end();
        console.log(' Search service database connection closed');
      }
    } catch (error) {
      console.log(' Cleanup completed with minor warnings');
    }
  });

  describe('Production Mode', () => {
    let productionPipeline;

    beforeAll(() => {
      productionPipeline = new Pipeline({
        mode: 'production'
      });
      console.log(' Production Pipeline Initialized');
    });

    test('should execute with minimal logging and observability', async () => {
      console.log('\n TEST: Production Mode - Minimal Observability');
      console.log('============================================================');

      const productionOrder = {
        orderId: 'prod-001',
        items: [{
          itemId: 1,
          itemName: '6 Traditional Wings',
          quantity: 2,
          modifiers: [{
            modifierId: 1,
            selected: 'Ranch',
            count: 1
          }]
        }]
      };

      const result = await productionPipeline.execute(productionOrder);

      // Verify basic functionality
      expect(result.success).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.operations).toBeDefined();
      expect(result.metadata.mode).toBe('production');
      expect(result.metadata.pipelineVersion).toBe('3.0');

      // Verify minimal observability (production mode)
      expect(result.observability).toBeUndefined(); // No observability in production
      expect(result.metadata.totalTime).toBeGreaterThan(0);
      expect(result.operations.length).toBeGreaterThanOrEqual(5);

      console.log(' Production Mode Test Passed!');
      console.log(` Execution Time: ${result.metadata.totalTime}ms`);
      console.log(` Operations: ${result.operations.length}`);
      console.log(` Mode: ${result.metadata.mode}`);
    });

    test('should handle auto-resolution in production', async () => {
      const orderWithErrors = {
        orderId: 'prod-error-001',
        items: [{
          itemId: 999, // Invalid item
          itemName: 'Invalid Item',
          quantity: 1,
          modifiers: []
        }]
      };

      const result = await productionPipeline.execute(orderWithErrors);

      // Should still complete (might have errors but no crash)
      expect(result).toBeDefined();
      expect(result.metadata.mode).toBe('production');
      
      // Check if auto-resolution was attempted
      const resolutionOps = result.operations.filter(op => 
        op.op && op.op.includes('resolution')
      );
      
      console.log(` Production Auto-Resolution: ${resolutionOps.length} attempts`);
    });
  });

  describe('Development Mode', () => {
    let developmentPipeline;

    beforeAll(() => {
      developmentPipeline = new Pipeline({
        mode: 'development'
      });
      console.log(' Development Pipeline Initialized');
    });

    test('should execute with full observability', async () => {
      console.log('\n TEST: Development Mode - Full Observability');
      console.log('============================================================');

      const developmentOrder = {
        orderId: 'dev-001',
        items: [{
          itemId: 1,
          itemName: '6 Traditional Wings',
          quantity: 2,
          modifiers: [{
            modifierId: 1,
            selected: 'Ranch',
            count: 1
          }]
        }]
      };

      const result = await developmentPipeline.execute(developmentOrder);

      // Verify basic functionality
      expect(result.success).toBe(true);
      expect(result.order).toBeDefined();
      expect(result.operations).toBeDefined();
      expect(result.metadata.mode).toBe('development');

      // Verify full observability (development mode)
      expect(result.observability).toBeDefined();
      expect(result.observability.executionId).toBeDefined();
      expect(result.observability.summary).toBeDefined();
      expect(result.observability.steps).toBeDefined();
      expect(result.observability.performance).toBeDefined();
      expect(result.observability.stateChanges).toBeDefined();

      // Verify enhanced metadata
      expect(result.metadata.executionContext).toBeDefined();
      expect(result.observability.steps.length).toBeGreaterThanOrEqual(5);

      console.log(' Development Mode Test Passed!');
      console.log(` Execution ID: ${result.observability.executionId}`);
      console.log(` Total Time: ${result.observability.performance.totalTime}ms`);
      console.log(` Operations: ${result.operations.length}`);
      console.log(' Success Rate: ${result.observability.summary.successRate}');
    });

    test('should track state changes in development mode', async () => {
      const orderWithDuplicates = {
        orderId: 'dev-state-001',
        items: [
          {
            itemId: 1,
            itemName: '6 Traditional Wings',
            quantity: 2,
            modifiers: []
          },
          {
            itemId: 1, // Duplicate - should be consolidated
            itemName: '6 Traditional Wings',
            quantity: 1,
            modifiers: []
          }
        ]
      };

      const result = await developmentPipeline.execute(orderWithDuplicates);

      expect(result.success).toBe(true);
      
      // Verify state tracking worked
      expect(result.observability.stateChanges).toBeDefined();
      expect(result.observability.steps).toBeDefined();
      
      // Find consolidation step
      const consolidationStep = result.observability.steps.find(step => 
        step.actionName === 'consolidateOrder'
      );
      
      expect(consolidationStep).toBeDefined();
      expect(consolidationStep.orderBefore.items.length).toBeGreaterThan(
        consolidationStep.orderAfter.items.length
      );

      console.log(' Development State Tracking Test Passed!');
      console.log(' State Changes: ${result.observability.stateChanges.length}');
    });
  });

  describe('Testing Mode', () => {
    let testingPipeline;

    beforeAll(() => {
      testingPipeline = new Pipeline({
        mode: 'testing'
      });
      console.log(' Testing Pipeline Initialized');
    });

    test('should execute optimized for testing', async () => {
      console.log('\n TEST: Testing Mode - Optimized for Tests');
      console.log('============================================================');

      const testOrder = {
        orderId: 'test-001',
        items: [{
          itemId: 1,
          itemName: '6 Traditional Wings',
          quantity: 1,
          modifiers: []
        }]
      };

      const result = await testingPipeline.execute(testOrder);

      // Verify basic functionality
      expect(result.success).toBe(true);
      expect(result.metadata.mode).toBe('testing');

      // Verify testing mode characteristics
      expect(result.observability).toBeDefined(); // Has observability for validation
      expect(result.observability.stateChanges).toBeNull(); // But no state tracking
      expect(result.metadata.autoResolutionApplied).toBe(false); // No auto-resolution

      console.log(' Testing Mode Test Passed!');
      console.log(` Mode: ${result.metadata.mode}`);
      console.log(` Auto-resolution: ${result.metadata.autoResolutionApplied}`);
    });
  });

  describe('Custom Configuration', () => {
    test('should allow custom configuration overrides', async () => {
      console.log('\n TEST: Custom Configuration');
      console.log('============================================================');

      const customPipeline = new Pipeline({
        mode: 'production', // Start with production
        enableObservability: true, // But enable observability
        logLevel: 'info', // And increase logging
        autoResolveMenuItems: false // But disable menu resolution
      });

      const customOrder = {
        orderId: 'custom-001',
        items: [{
          itemId: 999, // Invalid item to test resolution settings
          itemName: 'Invalid Item',
          quantity: 1,
          modifiers: []
        }]
      };

      const result = await customPipeline.execute(customOrder);

      // Verify custom configuration worked
      expect(result.metadata.mode).toBe('production');
      expect(result.observability).toBeDefined(); // Custom override
      expect(result.metadata.autoResolutionApplied).toBe(false); // Custom override

      console.log(' Custom Configuration Test Passed!');
      console.log(` Mode: ${result.metadata.mode}`);
      console.log(` Observability: ${result.observability ? 'Enabled' : 'Disabled'}`);
      console.log(` Auto-resolution: ${result.metadata.autoResolutionApplied}`);
    });

    test('should support runtime configuration updates', () => {
      const pipeline = new Pipeline({ mode: 'production' });
      
      expect(pipeline.getConfig().mode).toBe('production');
      expect(pipeline.getConfig().enableObservability).toBe(false);

      // Update configuration
      pipeline.updateConfig({ 
        mode: 'development',
        logLevel: 'debug'
      });

      expect(pipeline.getConfig().mode).toBe('development');
      expect(pipeline.getConfig().enableObservability).toBe(true);
      expect(pipeline.getConfig().logLevel).toBe('debug');

      console.log(' Runtime Configuration Update Test Passed!');
    });
  });

  describe('Mode Utilities', () => {
    test('should provide mode information and utilities', () => {
      const pipeline = new Pipeline();

      // Test mode utilities
      const availableModes = pipeline.getModes();
      expect(availableModes).toContain('production');
      expect(availableModes).toContain('development');
      expect(availableModes).toContain('testing');

      // Test mode defaults
      const prodDefaults = pipeline.getModeDefaults('production');
      expect(prodDefaults.enableObservability).toBe(false);
      expect(prodDefaults.logLevel).toBe('error');

      const devDefaults = pipeline.getModeDefaults('development');
      expect(devDefaults.enableObservability).toBe(true);
      expect(devDefaults.logLevel).toBe('info');

      console.log(' Mode Utilities Test Passed!');
        console.log(' Available Modes: ${availableModes.join(', ')}');
    });
  });

  describe('Performance Comparison', () => {
    test('should show performance difference between modes', async () => {
      console.log('\n TEST: Performance Comparison');
      console.log('============================================================');

      const testOrder = {
        orderId: 'perf-001',
        items: [{
          itemId: 1,
          itemName: '6 Traditional Wings',
          quantity: 1,
          modifiers: [{
            modifierId: 1,
            selected: 'Ranch',
            count: 1
          }]
        }]
      };

      // Test production mode performance
      const prodPipeline = new Pipeline({ mode: 'production' });
      const prodStart = Date.now();
      const prodResult = await prodPipeline.execute(testOrder);
      const prodTime = Date.now() - prodStart;

      // Test development mode performance  
      const devPipeline = new Pipeline({ mode: 'development' });
      const devStart = Date.now();
      const devResult = await devPipeline.execute(testOrder);
      const devTime = Date.now() - devStart;

      // Both should succeed
      expect(prodResult.success).toBe(true);
      expect(devResult.success).toBe(true);

      // Development mode should have more overhead but more features
      expect(devResult.observability).toBeDefined();
      expect(prodResult.observability).toBeUndefined();

      console.log(' Performance Comparison Test Passed!');
      console.log(` Production Time: ${prodTime}ms`);
      console.log(` Development Time: ${devTime}ms`);
      console.log(` Overhead: ${((devTime - prodTime) / prodTime * 100).toFixed(1)}%`);
    });
  });
});
