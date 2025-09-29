/**
 *  Modifier Mapping Integration Tests
 * Tests the modifierMappingAction within the complete pipeline
 */

const Pipeline = require('../../pipelines/Pipeline');

describe('Modifier Mapping Pipeline Integration', () => {
  let pipeline;

  beforeEach(() => {
    // Use development mode for full observability
    pipeline = new Pipeline({ 
      mode: 'development',
      enableModifierMapping: true,
      enableStepLogging: true 
    });
  });

  describe(' End-to-End Integration', () => {
    test('should integrate modifier mapping into full pipeline', async () => {
      const order = {
        orderId: 'integration-test-001',
        items: [
          {
            itemId: 1,
            itemName: '6 Traditional Wings',
            quantity: 1,
            modifiers: []
          },
          {
            itemId: 69,
            itemName: 'Carrots & Celery',
            quantity: 1,
            modifiers: []
          }
        ]
      };

      const result = await pipeline.execute(order);

      // Verify pipeline success
      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(1);

      // Verify modifier mapping occurred
      const wingsItem = result.order.items[0];
      expect(wingsItem.itemName).toBe('6 Traditional Wings');
      expect(wingsItem.modifiers).toHaveLength(1);
      expect(wingsItem.modifiers[0].selected).toBe('Carrots & Celery');

      // Verify operations include modifier mapping
      const mappingOperations = result.operations.filter(op => op.op === 'modifier_mapping');
      expect(mappingOperations).toHaveLength(1);
      expect(mappingOperations[0].corrected_value).toContain('6 Traditional Wings + Carrots & Celery');

      // Verify metadata includes cost savings
      expect(result.metadata.costSavings).toBeGreaterThan(0);
    });

    test('should handle sequential order with multiple compatible items', async () => {
      const order = {
        orderId: 'integration-sequential-001',
        items: [
          { itemId: 1, itemName: '6 Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 2, itemName: '6 Boneless Wings', quantity: 1, modifiers: [] },
          { itemId: 3, itemName: '6 Buffalo Bleu Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }
        ]
      };

      const result = await pipeline.execute(order);

      // Should attach to Buffalo Wings (item3 - closest predecessor)
      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(3);

      const buffaloWings = result.order.items.find(item => 
        item.itemName === '6 Buffalo Bleu Traditional Wings'
      );
      expect(buffaloWings.modifiers).toHaveLength(1);
      expect(buffaloWings.modifiers[0].selected).toBe('Carrots & Celery');
    });

    test('should handle edge case with existing modifier conflict', async () => {
      const order = {
        orderId: 'integration-conflict-001',
        items: [
          {
            itemId: 1,
            itemName: '6 Traditional Wings',
            quantity: 1,
            modifiers: [
              { modifierId: 4, selected: 'Carrots & Celery', count: 1 } // Already has the modifier
            ]
          },
          { itemId: 6, itemName: '6 Boneless Wings', quantity: 1, modifiers: [] }, // Should get the new modifier
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] } // Standalone item to map
        ]
      };

      const result = await pipeline.execute(order);

      // Should fallback to Boneless Wings since Traditional Wings has conflict
      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(2); // Carrots & Celery should be mapped, so only 2 items remain

      // Traditional Wings keeps existing modifier
      const traditionalWings = result.order.items.find(item => 
        item.itemName === '6 Traditional Wings'
      );
      expect(traditionalWings.modifiers).toHaveLength(1);
      expect(traditionalWings.modifiers[0].selected).toBe('Carrots & Celery');

      // Boneless Wings gets the new modifier
      const bonelessWings = result.order.items.find(item => 
        item.itemName === '6 Boneless Wings'
      );
      expect(bonelessWings.modifiers).toHaveLength(1);
      expect(bonelessWings.modifiers[0].selected).toBe('Carrots & Celery');
    });
  });

  describe(' Configuration Integration', () => {
    test('should respect pipeline configuration for modifier mapping', async () => {
      // Test with modifier mapping disabled
      const disabledPipeline = new Pipeline({ 
        mode: 'production',
        enableModifierMapping: false 
      });

      const order = {
        orderId: 'config-disabled-001',
        items: [
          { itemId: 1, itemName: '6 Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }
        ]
      };

      const result = await disabledPipeline.execute(order);

      // Should keep items separate when disabled
      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(2);

      // Should have no modifier mapping operations
      const mappingOperations = result.operations.filter(op => op.op === 'modifier_mapping');
      expect(mappingOperations).toHaveLength(0);
    });

    test('should work with custom configuration', async () => {
      const customPipeline = new Pipeline({ 
        mode: 'development',
        enableModifierMapping: true
      });

      const order = {
        orderId: 'config-custom-001',
        items: [
          { itemId: 1, itemName: '6 Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 2, modifiers: [] } // Quantity 2
        ]
      };

      // Pass custom config to allow quantity 2
      const result = await customPipeline.execute(order, {
        modifierMappingConfig: { skipQuantityThreshold: 2 }
      });

      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(1);
      expect(result.order.items[0].modifiers[0].count).toBe(2);
    });
  });

  describe(' Performance Integration', () => {
    test('should maintain pipeline performance with modifier mapping', async () => {
      const order = {
        orderId: 'performance-test-001',
        items: [
          { itemId: 1, itemName: '6 Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 2, itemName: '6 Boneless Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] },
          { itemId: 71, itemName: 'Celery', quantity: 1, modifiers: [] }
        ]
      };

      const startTime = Date.now();
      const result = await pipeline.execute(order);
      const executionTime = Date.now() - startTime;

      // Should complete quickly (< 100ms for this simple case)
      expect(executionTime).toBeLessThan(100);
      expect(result.success).toBe(true);

      // Should have performance metadata
      expect(result.metadata.performanceMetrics).toBeDefined();
      expect(result.metadata.performanceMetrics.processingTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe(' Observability Integration', () => {
    test('should provide complete observability data', async () => {
      const order = {
        orderId: 'observability-test-001',
        items: [
          { itemId: 1, itemName: '6 Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }
        ]
      };

      const result = await pipeline.execute(order);

      // Should have comprehensive operations log
      expect(result.operations).toBeDefined();
      expect(result.operations.length).toBeGreaterThan(0);

      // Should include all pipeline steps
      const operationTypes = result.operations.map(op => op.op);
      expect(operationTypes).toContain('schema_validation');
      expect(operationTypes).toContain('quantity_validation');
      expect(operationTypes).toContain('order_consolidation');
      expect(operationTypes).toContain('menu_item_validation');
      expect(operationTypes).toContain('modifier_validation');
      expect(operationTypes).toContain('modifier_mapping');

      // Should have detailed metadata
      expect(result.metadata).toBeDefined();
      expect(result.metadata.itemsProcessed).toBeDefined();
      expect(result.metadata.mappingsPerformed).toBeDefined();
      expect(result.metadata.costSavings).toBeDefined();
    });
  });

  describe('PROCESSING Real-World Scenarios', () => {
    test('should handle complex real-world order', async () => {
      const order = {
        orderId: 'real-world-001',
        items: [
          { itemId: 1, itemName: '6 Traditional Wings', quantity: 2, modifiers: [] }, // Quantity 2 - should not map
          { itemId: 2, itemName: '6 Boneless Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }, // Should map to Boneless Wings
          { itemId: 71, itemName: 'Celery', quantity: 1, modifiers: [] }, // Should map to Traditional Wings
          { itemId: 999, itemName: 'NonExistentItem', quantity: 1, modifiers: [] } // Should remain separate
        ]
      };

      const result = await pipeline.execute(order);

      expect(result.success).toBe(true);
      
      // Should have reduced item count due to mappings
      expect(result.order.items.length).toBeLessThan(5);

      // Should have mapping operations
      const mappingOperations = result.operations.filter(op => op.op === 'modifier_mapping');
      expect(mappingOperations.length).toBeGreaterThan(0);

      // Should have cost savings
      expect(result.metadata.costSavings).toBeGreaterThanOrEqual(0);
    });
  });
});
