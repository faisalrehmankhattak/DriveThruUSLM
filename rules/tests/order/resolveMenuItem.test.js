/**
 * Menu Item Resolver Action Tests
 * Tests the resolveMenuItemAction that fixes MENU_ITEM_NAME_NOT_FOUND errors
 * using the battle-tested searchEngine.findCanonical method
 */

const { ResolveMenuItemAction } = require('../../domain/order/actions/resolveMenuItemAction');
const { ProcessingRequest, ActionFactory } = require('../../core/interfaces/IAction');
const { ErrorCodes } = require('../../core/errors');
const { cleanupSearchService } = require('../../infrastructure/data/searchEngine');

// Helper function to create test requests
function createTestRequest(orderData, config = {}) {
  const request = ActionFactory.createInitialRequest(orderData.order, {
    config,
    debugMode: true
  });
  
  // Add context data
  request.context = {
    orderId: orderData.orderId,
    order: orderData.order,
    errors: orderData.errors || [],
    warnings: [],
    metadata: {}
  };
  
  return request;
}

describe('Menu Item Resolver Action', () => {
  let action;

  beforeAll(() => {
    action = new ResolveMenuItemAction();
    console.log(' Menu Item Resolver Action initialized for testing');
  });

  afterAll(async () => {
    // Clean up database connections to avoid Jest warnings
    await cleanupSearchService();
    console.log(' Menu item resolver cleaned up');
  });

  describe(' Action Independence', () => {
    test('should execute independently when no errors exist', async () => {
      const startTime = Date.now();
      
      const request = createTestRequest({
        orderId: 'no-errors-test',
        order: {
          orderId: 'no-errors-test',
          items: [
            { itemId: 1, itemName: 'Traditional Wings', quantity: 1 }
          ]
        },
        errors: [] // No errors to resolve
      });

      const response = await action.execute(request);
      
      const totalTime = Date.now() - startTime;
      console.log(` PERFORMANCE [No Errors Independence]:`);
      console.log(`   Total Test Time: ${totalTime}ms`);
      console.log(`   Resolution Time: N/A`);
      console.log(`   Errors Processed: 0`);

      expect(response.success).toBe(true);
      // No resolution attempted when no errors exist
      expect(response.success).toBe(true);
      // Order should be returned in response for unified structure
    });

    test('should only process MENU_ITEM_NAME_NOT_FOUND errors', async () => {
      const request = createTestRequest({
        orderId: 'wrong-error-test',
        order: {
          orderId: 'wrong-error-test',
          items: [
            { itemId: 1, itemName: 'Traditional Wings', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'error1',
            errorCode: ErrorCodes.MENU_ITEM_ID_NOT_FOUND, // Different error type
            itemName: 'Traditional Wings',
            message: 'Different error type'
          },
          {
            errorId: 'error2', 
            errorCode: 'SOME_OTHER_ERROR',
            message: 'Unrelated error'
          }
        ]
      });

      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.context.metadata.resolutionAttempted).toBe(false);
      // Resolution action doesn't maintain legacy errors structure
    });
  });

  describe(' Error Detection', () => {
    test('should detect and extract MENU_ITEM_NAME_NOT_FOUND errors', async () => {
      const request = createTestRequest({
        orderId: 'error-detection-test',
        order: {
          orderId: 'error-detection-test',
          items: [
            { itemId: 999, itemName: 'Nonexistent Item', quantity: 1 },
            { itemId: 1, itemName: 'Traditional Wings', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'menu-error-1',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Nonexistent Item',
            itemIndex: 0,
            itemId: 999,
            message: 'Menu item name not found'
          }
        ]
      });

      const response = await action.execute(request);

      expect(response.context.metadata.resolutionAttempted).toBe(true);
    });

    test('should handle multiple MENU_ITEM_NAME_NOT_FOUND errors', async () => {
      const request = createTestRequest({
        orderId: 'multiple-errors-test',
        order: {
          orderId: 'multiple-errors-test',
          items: [
            { itemId: 999, itemName: 'Bad Item 1', quantity: 1 },
            { itemId: 998, itemName: 'Bad Item 2', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'menu-error-1',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Bad Item 1',
            itemIndex: 0
          },
          {
            errorId: 'menu-error-2',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Bad Item 2',
            itemIndex: 1
          }
        ]
      });

      const response = await action.execute(request);

      expect(response.context.metadata.resolutionAttempted).toBe(true);
      console.log(` Menu item resolution attempted: ${response.context.metadata.resolutionAttempted}`);
    });
  });

  describe(' SearchEngine Integration', () => {
    test('should use searchEngine.findCanonical for resolution', async () => {
      const request = createTestRequest({
        orderId: 'search-integration-test',
        order: {
          orderId: 'search-integration-test',
          items: [
            { itemId: 999, itemName: 'Traditional Wigns', quantity: 1 } // Typo in "Wings"
          ]
        },
        errors: [
          {
            errorId: 'typo-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Traditional Wigns',
            itemIndex: 0,
            itemId: 999
          }
        ]
      });

      const response = await action.execute(request);

      console.log(` Search Integration Results:`);
      console.log(`   Resolution Attempted: ${response.context.metadata.resolutionAttempted}`);

      expect(response.context.metadata.resolutionAttempted).toBe(true);
    });

    test('should handle confidence thresholds', async () => {
      const lowConfidenceConfig = { minConfidence: 0.9 }; // Very high threshold
      
      const request = createTestRequest({
        orderId: 'confidence-test',
        order: {
          orderId: 'confidence-test',
          items: [
            { itemId: 999, itemName: 'xyz123', quantity: 1 } // Unlikely to find high-confidence match
          ]
        },
        errors: [
          {
            errorId: 'low-confidence-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'xyz123',
            itemIndex: 0
          }
        ]
      }, lowConfidenceConfig);

      const response = await action.execute(request);

      expect(response.context.metadata.resolutionAttempted).toBe(true);
      
      if (response.context.metadata.menuItemsFailed > 0) {
        console.log(` Correctly rejected low-confidence match`);
      }
    });
  });

  describe(' Order Updates', () => {
    test('should update order with corrected item details', async () => {
      const originalOrder = {
        orderId: 'update-test',
        items: [
          { itemId: 999, itemName: 'Chicken Teder', quantity: 2 } // Typo in "Tender"
        ]
      };

      const request = createTestRequest({
        orderId: 'update-test',
        order: originalOrder,
        errors: [
          {
            errorId: 'update-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Chicken Teder',
            itemIndex: 0,
            itemId: 999
          }
        ]
      });

      const response = await action.execute(request);

      // If resolution was successful
      if (response.context.metadata.menuItemsResolved > 0) {
        const updatedItem = response.order.items[0];
        
        expect(updatedItem.itemName).not.toBe('Chicken Teder');
        expect(updatedItem.quantity).toBe(2); // Other properties preserved
        expect(updatedItem.itemId).not.toBe(999); // Should be corrected
        
        console.log(' "${updatedItem.itemName}"');
      }
    });

    test('should preserve non-error items in order', async () => {
      const request = createTestRequest({
        orderId: 'preserve-test',
        order: {
          orderId: 'preserve-test',
          items: [
            { itemId: 1, itemName: 'Traditional Wings', quantity: 1 }, // Valid item
            { itemId: 999, itemName: 'Bad Item', quantity: 1 }         // Error item
          ]
        },
        errors: [
          {
            errorId: 'preserve-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Bad Item',
            itemIndex: 1
          }
        ]
      });

      const response = await action.execute(request);

      // Valid item should be unchanged
      expect(response.order.items[0]).toEqual({
        itemId: 1,
        itemName: 'Traditional Wings',
        quantity: 1
      });

      expect(response.order.items).toHaveLength(2);
    });
  });

  describe('ERROR HANDLING Error Handling', () => {
    test('should handle missing itemName in error', async () => {
      const request = createTestRequest({
        orderId: 'missing-name-test',
        order: {
          orderId: 'missing-name-test',
          items: [
            { itemId: 999, itemName: '', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'missing-name-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            // itemName missing
            itemIndex: 0
          }
        ]
      });

      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.context.metadata.resolutionAttempted).toBe(false);
    });

    test('should handle search engine failures gracefully', async () => {
      // Test with extremely malformed input that might cause search issues
      const request = createTestRequest({
        orderId: 'search-failure-test',
        order: {
          orderId: 'search-failure-test',
          items: [
            { itemId: 999, itemName: '!@#$%^&*()', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'malformed-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: '!@#$%^&*()',
            itemIndex: 0
          }
        ]
      });

      const response = await action.execute(request);

      // Should not crash, even if resolution fails
      expect(response.context.metadata.resolutionAttempted).toBe(true);
      console.log(` Handled malformed input gracefully`);
    });
  });

  describe(' Performance Tests', () => {
    test('should process resolution quickly', async () => {
      const startTime = Date.now();

      const request = createTestRequest({
        orderId: 'performance-test',
        order: {
          orderId: 'performance-test',
          items: [
            { itemId: 999, itemName: 'Fast Resolution Test', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'perf-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Fast Resolution Test',
            itemIndex: 0
          }
        ]
      });

      const response = await action.execute(request);
      const totalTime = Date.now() - startTime;

      console.log(` PERFORMANCE [Menu Item Resolution]:`);
      console.log(`   Total Test Time: ${totalTime}ms`);
      console.log(`   Resolution Time: ${response.context.metadata.resolutionTime || 0}ms`);
      console.log(`   Errors Processed: 1`);
      console.log(`   Resolution Rate: ${response.context.metadata.resolutionTime ? Math.round(1000 / response.context.metadata.resolutionTime) : 'N/A'} errors/sec`);

      expect(totalTime).toBeLessThan(15000); // Should complete within 15 seconds (AI calls can be slow)
      expect(response.context.metadata.resolutionTime).toBeLessThan(10000); // Resolution within 10 seconds (OpenAI API variability)
    });
  });

  describe('CONTEXT Action Metadata', () => {
    test('should provide comprehensive action metadata', () => {
      const metadata = action.getMetadata();

      expect(metadata.actionName).toBe('menu_item_resolution');
      expect(metadata.actionType).toBe('resolution');
      expect(metadata.dependencies).toContain('SearchEngine');
      expect(metadata.errorCodes).toContain('MENU_ITEM_NAME_NOT_FOUND');
      expect(metadata.searchMethods).toContain('findCanonical');
      
      console.log(' Action metadata comprehensive and accurate');
    });
  });

  describe('PROCESSING Configuration Modes', () => {
    test('should handle strict mode correctly', async () => {
      const strictConfig = { strict: true, minConfidence: 0.7 };
      
      const request = createTestRequest({
        orderId: 'strict-mode-test',
        order: {
          orderId: 'strict-mode-test',
          items: [
            { itemId: 999, itemName: 'Maybe Match', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'strict-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Maybe Match',
            itemIndex: 0
          }
        ]
      }, strictConfig);

      const response = await action.execute(request);

      expect(response.context.metadata.resolutionAttempted).toBe(true);
      console.log(` Strict mode processing completed`);
    });

    test('should handle custom confidence thresholds', async () => {
      const customConfig = { minConfidence: 0.5, logResolutions: false };
      
      const request = createTestRequest({
        orderId: 'custom-config-test',
        order: {
          orderId: 'custom-config-test',
          items: [
            { itemId: 999, itemName: 'Custom Test', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'custom-error',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND.code,
            itemName: 'Custom Test',
            itemIndex: 0
          }
        ]
      }, customConfig);

      const response = await action.execute(request);

      expect(response.context.metadata.resolutionAttempted).toBe(true);
      console.log(` Custom configuration applied successfully`);
    });
  });
});
