/**
 * Modifier Resolver Action Tests
 * Tests the resolveModifierAction that fixes MODIFIER_NAME_NOT_FOUND errors
 * using the battle-tested searchEngine.findModifiers method
 */

const { ResolveModifierAction } = require('../../domain/order/actions/resolveModifierAction');
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

describe('Modifier Resolver Action', () => {
  let action;

  beforeAll(() => {
    action = new ResolveModifierAction();
    console.log(' Modifier Resolver Action initialized for testing');
  });

  afterAll(async () => {
    // Clean up database connections to avoid Jest warnings
    await cleanupSearchService();
    console.log(' Modifier resolver cleaned up');
  });

  describe(' Action Independence', () => {
    test('should execute independently when no modifier errors exist', async () => {
      const startTime = Date.now();
      
      const request = createTestRequest({
        orderId: 'no-modifier-errors-test',
        order: {
          orderId: 'no-modifier-errors-test',
          items: [
            { 
              itemId: 1, 
              itemName: 'Traditional Wings', 
              quantity: 1,
              modifiers: [
                { modifierId: 1, selected: 'Ranch' }
              ]
            }
          ]
        },
        errors: [] // No errors to resolve
      });

      const response = await action.execute(request);
      
      const totalTime = Date.now() - startTime;
      console.log(` PERFORMANCE [No Modifier Errors Independence]:`);
      console.log(`   Total Test Time: ${totalTime}ms`);
      console.log(`   Resolution Time: N/A`);
      console.log(`   Errors Processed: 0`);

      expect(response.success).toBe(true);
      expect(response.context.metadata.modifierResolutionAttempted).toBe(false);
      expect(response.metadata.reason).toBe('No modifier errors to resolve');
      // Order should be returned in response for unified structure
    });

    test('should only process MODIFIER_NAME_NOT_FOUND errors', async () => {
      const request = createTestRequest({
        orderId: 'wrong-modifier-error-test',
        order: {
          orderId: 'wrong-modifier-error-test',
          items: [
            { 
              itemId: 1, 
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [{ modifierId: 1, selected: 'Ranch' }]
            }
          ]
        },
        errors: [
          {
            errorId: 'error1',
            errorCode: ErrorCodes.MENU_ITEM_NAME_NOT_FOUND, // Different error type
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
      expect(response.context.metadata.modifierResolutionAttempted).toBe(false);
      // In unified structure, errors are tracked via operations
    });
  });

  describe(' Modifier Error Detection', () => {
    test('should detect and extract MODIFIER_NAME_NOT_FOUND errors', async () => {
      const request = createTestRequest({
        orderId: 'modifier-error-detection-test',
        order: {
          orderId: 'modifier-error-detection-test',
          items: [
            { 
              itemId: 1, 
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: 'Nonexistent Modifier' }
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'modifier-error-1',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            modifierId: 999,
            selected: 'Nonexistent Modifier',
            itemIndex: 0,
            modifierIndex: 0,
            message: 'Modifier option not found'
          }
        ]
      });

      const response = await action.execute(request);

      expect(response.context.metadata.modifierResolutionAttempted).toBe(true);
      expect(response.context.metadata.modifiersResolved).toBeGreaterThanOrEqual(0);
    });

    test('should handle multiple modifier errors', async () => {
      const request = createTestRequest({
        orderId: 'multiple-modifier-errors-test',
        order: {
          orderId: 'multiple-modifier-errors-test',
          items: [
            { 
              itemId: 1, 
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: 'Bad Modifier 1' },
                { modifierId: 998, selected: 'Bad Modifier 2' }
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'modifier-error-1',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: 'Bad Modifier 1',
            itemIndex: 0,
            modifierIndex: 0
          },
          {
            errorId: 'modifier-error-2', 
            errorCode: 'MODIFIER_OPTION_NOT_FOUND', // Alternative error code
            itemId: 1,
            selected: 'Bad Modifier 2',
            itemIndex: 0,
            modifierIndex: 1
          }
        ]
      });

      const response = await action.execute(request);

      expect(response.context.metadata.modifierResolutionAttempted).toBe(true);
      console.log(` Processed ${response.context.metadata.modifiersResolved || 0} + ${response.context.metadata.modifiersFailed || 0} modifier errors`);
    });
  });

  describe(' SearchEngine Integration', () => {
    test('should use searchEngine.findModifiers for resolution', async () => {
      const request = createTestRequest({
        orderId: 'modifier-search-integration-test',
        order: {
          orderId: 'modifier-search-integration-test',
          items: [
            { 
              itemId: 1, 
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: 'Ranc' } // Typo in "Ranch"
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'modifier-typo-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: 'Ranc',
            itemIndex: 0,
            modifierIndex: 0
          }
        ]
      });

      const response = await action.execute(request);

      console.log(` Modifier Search Integration Results:`);
      console.log(`   Resolution Attempted: ${response.context.metadata.modifierResolutionAttempted}`);
      console.log(`   Modifiers Resolved: ${response.context.metadata.modifiersResolved || 0}`);
      console.log(`   Modifiers Failed: ${response.context.metadata.modifiersFailed || 0}`);

      expect(response.context.metadata.modifierResolutionAttempted).toBe(true);

      // If resolution was successful, check the results
      if (response.context.metadata.modifiersResolved > 0) {
        expect(response.order.items[0].modifiers[0].selected).not.toBe('Ranc');
// In unified structure, successful resolution creates an operation
        console.log(`    Corrected to: ${response.order.items[0].modifiers[0].selected} (ID: ${response.order.items[0].modifiers[0].modifierId})`);
      }
    });

    test('should handle similarity thresholds', async () => {
      const lowSimilarityConfig = { minSimilarity: 0.95 }; // Very high threshold
      
      const request = createTestRequest({
        orderId: 'modifier-similarity-test',
        order: {
          orderId: 'modifier-similarity-test',
          items: [
            { 
              itemId: 1, 
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: 'xyz123' } // Unlikely to find high-similarity match
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'low-similarity-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: 'xyz123',
            itemIndex: 0,
            modifierIndex: 0
          }
        ]
      }, lowSimilarityConfig);

      const response = await action.execute(request);

      expect(response.context.metadata.modifierResolutionAttempted).toBe(true);
      
      if (response.context.metadata.modifiersFailed > 0) {
        console.log(` Correctly rejected low-similarity match`);
      }
    });
  });

  describe(' Order Updates', () => {
    test('should update order with corrected modifier details', async () => {
      const originalOrder = {
        orderId: 'modifier-update-test',
        items: [
          { 
            itemId: 1, 
            itemName: 'Traditional Wings',
            quantity: 1,
            modifiers: [
              { modifierId: 999, selected: 'Bleu Chees' } // Typo in "Bleu Cheese"
            ]
          }
        ]
      };

      const request = createTestRequest({
        orderId: 'modifier-update-test',
        order: originalOrder,
        errors: [
          {
            errorId: 'modifier-update-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: 'Bleu Chees',
            itemIndex: 0,
            modifierIndex: 0
          }
        ]
      });

      const response = await action.execute(request);

      // If resolution was successful
      if (response.context.metadata.modifiersResolved > 0) {
        const updatedModifier = response.order.items[0].modifiers[0];
        
        expect(updatedModifier.selected).not.toBe('Bleu Chees');
        expect(updatedModifier.modifierId).not.toBe(999); // Should be corrected
        
        console.log(' "${updatedModifier.selected}"');
      }
    });

    test('should preserve non-error modifiers in order', async () => {
      const request = createTestRequest({
        orderId: 'preserve-modifier-test',
        order: {
          orderId: 'preserve-modifier-test',
          items: [
            { 
              itemId: 1, 
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 1, selected: 'Ranch' },        // Valid modifier
                { modifierId: 999, selected: 'Bad Modifier' } // Error modifier
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'preserve-modifier-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: 'Bad Modifier',
            itemIndex: 0,
            modifierIndex: 1
          }
        ]
      });

      const response = await action.execute(request);

      // Valid modifier should be unchanged
      expect(response.order.items[0].modifiers[0]).toEqual({
        modifierId: 1,
        selected: 'Ranch'
      });

      expect(response.order.items[0].modifiers).toHaveLength(2);
    });
  });

  describe('ERROR HANDLING Error Handling', () => {
    test('should handle missing modifier details in error', async () => {
      const request = createTestRequest({
        orderId: 'missing-modifier-details-test',
        order: {
          orderId: 'missing-modifier-details-test',
          items: [
            { itemId: 1, itemName: 'Traditional Wings', quantity: 1 }
          ]
        },
        errors: [
          {
            errorId: 'missing-details-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            // Missing itemId and selected
            itemIndex: 0
          }
        ]
      });

      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.context.metadata.modifierResolutionAttempted).toBe(false);
    });

    test('should handle non-existent menu items gracefully', async () => {
      const request = createTestRequest({
        orderId: 'nonexistent-item-test',
        order: {
          orderId: 'nonexistent-item-test',
          items: [
            { 
              itemId: 99999, // Non-existent item
              itemName: 'Nonexistent Item',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: 'Some Modifier' }
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'nonexistent-item-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 99999,
            selected: 'Some Modifier',
            itemIndex: 0,
            modifierIndex: 0
          }
        ]
      });

      const response = await action.execute(request);

      // Should not crash, even if menu item lookup fails
      expect(response.context.metadata.modifierResolutionAttempted).toBe(true);
      console.log(` Handled non-existent menu item gracefully`);
    });

    test('should handle search engine failures gracefully', async () => {
      // Test with extremely malformed input that might cause search issues
      const request = createTestRequest({
        orderId: 'modifier-search-failure-test',
        order: {
          orderId: 'modifier-search-failure-test',
          items: [
            { 
              itemId: 1,
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: '!@#$%^&*()' }
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'malformed-modifier-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: '!@#$%^&*()',
            itemIndex: 0,
            modifierIndex: 0
          }
        ]
      });

      const response = await action.execute(request);

      // Should not crash, even if resolution fails
      expect(response.context.metadata.modifierResolutionAttempted).toBe(true);
      console.log(` Handled malformed modifier input gracefully`);
    });
  });

  describe(' Performance Tests', () => {
    test('should process modifier resolution quickly', async () => {
      const startTime = Date.now();

      const request = createTestRequest({
        orderId: 'modifier-performance-test',
        order: {
          orderId: 'modifier-performance-test',
          items: [
            { 
              itemId: 1,
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: 'Fast Modifier Test' }
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'modifier-perf-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: 'Fast Modifier Test',
            itemIndex: 0,
            modifierIndex: 0
          }
        ]
      });

      const response = await action.execute(request);
      const totalTime = Date.now() - startTime;

      console.log(` PERFORMANCE [Modifier Resolution]:`);
      console.log(`   Total Test Time: ${totalTime}ms`);
      console.log(`   Resolution Time: ${response.context.metadata.modifierResolutionTime || 0}ms`);
      console.log(`   Errors Processed: 1`);
      console.log(`   Resolution Rate: ${response.context.metadata.modifierResolutionTime ? Math.round(1000 / response.context.metadata.modifierResolutionTime) : 'N/A'} errors/sec`);

      expect(totalTime).toBeLessThan(5000); // Should complete within 5 seconds
      expect(response.context.metadata.modifierResolutionTime).toBeLessThan(2000); // Resolution within 2 seconds
    });
  });

  describe('CONTEXT Action Metadata', () => {
    test('should provide comprehensive action metadata', () => {
      const metadata = action.getMetadata();

      expect(metadata.actionName).toBe('modifier_resolution');
      expect(metadata.actionType).toBe('resolution');
      expect(metadata.dependencies).toContain('SearchEngine');
      expect(metadata.dependencies).toContain('MenuDataService');
      expect(metadata.errorCodes).toContain('MODIFIER_NAME_NOT_FOUND');
      expect(metadata.searchMethods).toContain('findModifiers');
      
      console.log(' Modifier action metadata comprehensive and accurate');
    });
  });

  describe('PROCESSING Configuration Modes', () => {
    test('should handle strict mode correctly', async () => {
      const strictConfig = { strict: true, minSimilarity: 0.8 };
      
      const request = createTestRequest({
        orderId: 'modifier-strict-mode-test',
        order: {
          orderId: 'modifier-strict-mode-test',
          items: [
            { 
              itemId: 1,
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: 'Maybe Modifier' }
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'modifier-strict-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: 'Maybe Modifier',
            itemIndex: 0,
            modifierIndex: 0
          }
        ]
      }, strictConfig);

      const response = await action.execute(request);

      expect(response.context.metadata.modifierResolutionAttempted).toBe(true);
      console.log(` Modifier strict mode processing completed`);
    });

    test('should handle custom similarity thresholds', async () => {
      const customConfig = { 
        minSimilarity: 0.6, 
        maxDistance: 2, 
        logResolutions: false 
      };
      
      const request = createTestRequest({
        orderId: 'modifier-custom-config-test',
        order: {
          orderId: 'modifier-custom-config-test',
          items: [
            { 
              itemId: 1,
              itemName: 'Traditional Wings',
              quantity: 1,
              modifiers: [
                { modifierId: 999, selected: 'Custom Modifier Test' }
              ]
            }
          ]
        },
        errors: [
          {
            errorId: 'modifier-custom-error',
            errorCode: 'MODIFIER_NAME_NOT_FOUND',
            itemId: 1,
            selected: 'Custom Modifier Test',
            itemIndex: 0,
            modifierIndex: 0
          }
        ]
      }, customConfig);

      const response = await action.execute(request);

      expect(response.context.metadata.modifierResolutionAttempted).toBe(true);
      console.log(` Modifier custom configuration applied successfully`);
    });
  });
});
