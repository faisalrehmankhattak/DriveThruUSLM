/**
 *  Comprehensive Test Suite for modifierMappingAction
 * Meta-level testing covering all scenarios and edge cases
 */

const ModifierMappingAction = require('../../domain/order/actions/modifierMappingAction');
const { getItemModifierMappingService } = require('../../infrastructure/services/ItemModifierMappingService');
const { ActionFactory } = require('../../core/interfaces/IAction');

describe('modifierMappingAction', () => {
  let action;
  let mappingService;

  beforeEach(() => {
    action = new ModifierMappingAction();
    mappingService = getItemModifierMappingService();
    // Clear cache between tests
    mappingService.itemModifierLookup = null;
    mappingService.modifierItemLookup = null;
  });

  describe(' Core Functionality', () => {
    test('should successfully map Carrots & Celery to Wings', async () => {
      const order = {
        orderId: 'test-mapping-001',
        items: [
          {
            itemId: 1,
            itemName: '6 Honey Garlic Traditional Wings',
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

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Verify success
      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(1);

      // Verify mapping
      const wingsItem = result.order.items[0];
      expect(wingsItem.itemName).toBe('6 Honey Garlic Traditional Wings');
      expect(wingsItem.modifiers).toHaveLength(1);
      expect(wingsItem.modifiers[0].selected).toBe('Carrots & Celery');
      expect(wingsItem.modifiers[0].isAutoMapped).toBe(true);

      // Verify operations
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].op).toBe('modifier_mapping');
      expect(result.operations[0].corrected_value).toContain('6 Honey Garlic Traditional Wings + Carrots & Celery');

      // Verify cost savings
      expect(result.metadata.costSavings).toBeGreaterThan(0);
      expect(result.metadata.optimizationSummary.totalMappings).toBe(1);
    });

    test('should respect sequential order (item4 to item3, not item2)', async () => {
      const order = {
        orderId: 'test-sequential-001',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 2, itemName: '6 Honey Garlic Boneless Wings', quantity: 1, modifiers: [] },
          { itemId: 3, itemName: '6 Buffalo Bleu Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Should attach to item3 (Buffalo Wings), not item1 or item2
      expect(result.order.items).toHaveLength(3);
      
      const buffaloWings = result.order.items.find(item => 
        item.itemName === '6 Buffalo Bleu Traditional Wings'
      );
      expect(buffaloWings.modifiers).toHaveLength(1);
      expect(buffaloWings.modifiers[0].selected).toBe('Carrots & Celery');

      // Others should have no modifiers
      const honeyGarlic = result.order.items.find(item => 
        item.itemName === '6 Honey Garlic Traditional Wings'
      );
      expect(honeyGarlic.modifiers).toHaveLength(0);
    });
  });

  describe('ERROR HANDLING Business Rules Validation', () => {
    test('should NOT map items with quantity > 1', async () => {
      const order = {
        orderId: 'test-quantity-rule',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 2, modifiers: [] } // Customer wants 2!
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Should keep both items separate
      expect(result.order.items).toHaveLength(2);
      expect(result.order.items[0].modifiers).toHaveLength(0);

      // Should log skip operation
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].corrected_value).toBe('NO_MAPPING_REQUIRED');
      expect(result.operations[0].rationale).toContain('Quantity 2 > threshold 1');
    });

    test('should NOT map incompatible items', async () => {
      const order = {
        orderId: 'test-incompatible',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }, // Compatible
          { itemId: 999, itemName: 'NonExistentItem', quantity: 1, modifiers: [] } // Not a modifier
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Should consolidate Carrots & Celery but keep NonExistentItem separate
      expect(result.order.items).toHaveLength(2);
      
      // Wings should have Carrots & Celery as modifier
      const wingsItem = result.order.items.find(item => 
        item.itemName === '6 Honey Garlic Traditional Wings'
      );
      expect(wingsItem.modifiers).toHaveLength(1);
      expect(wingsItem.modifiers[0].selected).toBe('Carrots & Celery');

      // NonExistentItem should remain standalone
      const nonExistentItem = result.order.items.find(item => 
        item.itemName === 'NonExistentItem'
      );
      expect(nonExistentItem).toBeDefined();

      // Should have 1 successful mapping operation (Carrots & Celery)
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].corrected_value).toContain('6 Honey Garlic Traditional Wings + Carrots & Celery');
    });

    test('should handle duplicate modifier conflicts', async () => {
      const order = {
        orderId: 'test-duplicate-conflict',
        items: [
          {
            itemId: 1,
            itemName: '6 Honey Garlic Traditional Wings',
            quantity: 1,
            modifiers: [
              { modifierName: 'Dips & Veggies', selected: 'Carrots & Celery', count: 1 }
            ]
          },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Should keep items separate due to conflict
      expect(result.order.items).toHaveLength(2);

      // Should log conflict
      expect(result.operations).toHaveLength(1);
      expect(result.operations[0].corrected_value).toBe('MAPPING_FAILED');
      expect(result.metadata.optimizationSummary.conflictedItems).toBe(1);
    });

    test('should keep standalone item when target already has same modifier (your edge case)', async () => {
      const order = {
        orderId: 'test-edge-case-existing-modifier',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 2, itemName: '6 Honey Garlic Boneless Wings', quantity: 1, modifiers: [] },
          {
            itemId: 3,
            itemName: '6 Buffalo Bleu Traditional Wings',
            quantity: 1,
            modifiers: [
              { modifierName: 'Dips & Veggies', selected: 'Carrots & Celery', count: 1 }
            ]
          },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] } // item4
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Should fallback to item2 since item3 already has Carrots & Celery
      expect(result.order.items).toHaveLength(3);
      
      // Buffalo Wings should keep its existing modifier
      const buffaloWings = result.order.items.find(item => 
        item.itemName === '6 Buffalo Bleu Traditional Wings'
      );
      expect(buffaloWings.modifiers).toHaveLength(1);
      expect(buffaloWings.modifiers[0].selected).toBe('Carrots & Celery');

      // Boneless Wings should get the new Carrots & Celery
      const bonelessWings = result.order.items.find(item => 
        item.itemName === '6 Honey Garlic Boneless Wings'
      );
      expect(bonelessWings.modifiers).toHaveLength(1);
      expect(bonelessWings.modifiers[0].selected).toBe('Carrots & Celery');

      // Should have 1 successful mapping
      expect(result.metadata.optimizationSummary.totalMappings).toBe(1);
    });
  });

  describe(' Edge Cases and Error Handling', () => {
    test('should handle empty order gracefully', async () => {
      const order = { orderId: 'empty-order', items: [] };
      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(0);
      expect(result.metadata.itemsProcessed).toBe(0);
      expect(result.metadata.mappingsPerformed).toBe(0);
    });

    test('should handle null/undefined items array', async () => {
      const order = { orderId: 'null-items' }; // No items property
      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      expect(result.success).toBe(true);
      expect(result.metadata.itemsProcessed).toBe(0);
    });

    test('should respect maxMappingsPerOrder configuration', async () => {
      const order = {
        orderId: 'test-max-mappings',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 2, itemName: '6 Honey Garlic Boneless Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] },
          { itemId: 71, itemName: 'Celery', quantity: 1, modifiers: [] } // Real menu item
        ]
      };

      const config = { maxMappingsPerOrder: 1 };
      const request = ActionFactory.createInitialRequest(order, { config });
      const result = await action.execute(request);

      // Should stop after 1 mapping
      expect(result.metadata.mappingsPerformed).toBeLessThanOrEqual(1);
    });
  });

  describe('COST Cost Optimization', () => {
    test('should calculate cost savings correctly', async () => {
      const order = {
        orderId: 'test-cost-savings',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, price: 11.79, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, price: 1.49, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Should save the standalone price (since modifier is usually free)
      expect(result.metadata.costSavings).toBeGreaterThan(0);
      expect(result.operationData.totalSavings).toBeGreaterThan(0);
      
      // Should track savings in the modifier
      const wingsItem = result.order.items[0];
      expect(wingsItem.modifiers[0].savings).toBeGreaterThan(0);
      expect(wingsItem.modifiers[0].originalStandalonePrice).toBe(1.49);
    });
  });

  describe(' Configuration Options', () => {
    test('should respect custom skipQuantityThreshold', async () => {
      const order = {
        orderId: 'test-custom-threshold',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 2, modifiers: [] }
        ]
      };

      const config = { skipQuantityThreshold: 2 }; // Allow quantity 2
      const request = ActionFactory.createInitialRequest(order, { config });
      const result = await action.execute(request);

      // Should now map the quantity 2 item
      expect(result.order.items).toHaveLength(1);
      expect(result.order.items[0].modifiers[0].count).toBe(2);
    });

    test('should handle disabled cost optimization', async () => {
      const order = {
        orderId: 'test-no-cost-opt',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }
        ]
      };

      const config = { enableCostOptimization: false };
      const request = ActionFactory.createInitialRequest(order, { config });
      const result = await action.execute(request);

      // Should still perform mapping but maybe not track savings
      expect(result.success).toBe(true);
      expect(result.order.items).toHaveLength(1);
    });
  });

  describe('SUMMARY Performance and Metadata', () => {
    test('should provide comprehensive metadata', async () => {
      const order = {
        orderId: 'test-metadata',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Verify metadata structure
      expect(result.metadata).toHaveProperty('itemsProcessed');
      expect(result.metadata).toHaveProperty('mappingsPerformed');
      expect(result.metadata).toHaveProperty('costSavings');
      expect(result.metadata).toHaveProperty('optimizationSummary');
      expect(result.metadata).toHaveProperty('performanceMetrics');

      // Verify performance tracking
      expect(result.metadata.performanceMetrics.processingTime).toBeGreaterThanOrEqual(0);
      expect(result.metadata.performanceMetrics.avgTimePerItem).toBeGreaterThanOrEqual(0);
    });

    test('should track operations for observability', async () => {
      const order = {
        orderId: 'test-observability',
        items: [
          { itemId: 1, itemName: '6 Honey Garlic Traditional Wings', quantity: 1, modifiers: [] },
          { itemId: 69, itemName: 'Carrots & Celery', quantity: 1, modifiers: [] },
          { itemId: 999, itemName: 'NonExistentItem', quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const result = await action.execute(request);

      // Should have operations for both success and skipped items
      expect(result.operations.length).toBeGreaterThan(0);
      
      // Verify operation structure
      result.operations.forEach(operation => {
        expect(operation).toHaveProperty('op');
        expect(operation).toHaveProperty('target');
        expect(operation).toHaveProperty('corrected_value');
        expect(operation).toHaveProperty('rationale');
      });
    });
  });

  describe(' Action Metadata', () => {
    test('should provide comprehensive action metadata', () => {
      const metadata = action.getMetadata();

      expect(metadata.name).toBe('modifier_mapping');
      expect(metadata.type).toBe('optimization');
      expect(metadata.description).toContain('Intelligently maps standalone items');
      expect(metadata.errorCodes).toContain('MODIFIER_MAPPING_CONFLICT');
      expect(metadata.businessImpact).toHaveProperty('customerBenefit');
    });
  });
});
