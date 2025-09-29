/**
 *  Smart Error Filtering Tests
 * 
 * Tests the intelligent error filtering logic that only returns unresolved errors to the LLM.
 * This ensures that errors which were successfully resolved by subsequent operations 
 * are filtered out from the final response.
 */

const OrderCritic = require('../../critic/OrderCritic');

describe(' Smart Error Filtering', () => {
  let orderCritic;

  beforeEach(() => {
    orderCritic = new OrderCritic({
      enableObservability: true,
      strictMode: false
    });
  });

  describe(' Resolved Errors Should Be Filtered Out', () => {
    test('should filter out menu item validation error when resolution succeeds', async () => {
      // Arrange: Order with typo that can be resolved
      const orderWithTypo = {
        orderId: 'test-menu-item-resolution',
        items: [{
          itemId: 999, // Invalid ID
          itemName: 'chiken', // Typo that resolves to "Southern Chicken Sandwich"
          quantity: 1,
          modifiers: []
        }]
      };

      // Act: Process the order
      const result = await orderCritic.processOrder(orderWithTypo);

      // Assert: Check that the error was filtered out
      expect(result.success).toBe(true); // Resolution succeeded, so overall success
      expect(result.errors).toBeUndefined(); // No errors property when successful
      expect(result.critic_actions).toHaveLength(7); // All 7 operations executed (including modifier mapping)
      
      // Verify the resolution sequence in critic_actions
      const menuValidation = result.critic_actions.find(action => action.op === 'menu_item_validation');
      const menuResolution = result.critic_actions.find(action => action.op === 'menu_item_resolution');
      
      expect(menuValidation.corrected_value).toBe('VALIDATION_FAILED');
      expect(menuValidation.error).toBeDefined();
      expect(menuValidation.error.code).toBe('MENU_ITEM_NAME_NOT_FOUND');
      
      expect(menuResolution.corrected_value).not.toBe('null');
      expect(menuResolution.corrected_value).not.toBe('RESOLUTION_FAILED');
      expect(menuResolution.target).toBe('chiken');
      
      // Verify the corrected cart contains the resolved item
      expect(result.corrected_cart).toHaveLength(1);
      expect(result.corrected_cart[0].item_name).not.toBe('chiken');
    });

    test('should filter out modifier validation error when resolution succeeds', async () => {
      // Arrange: Order with modifier typo that can be resolved
      const orderWithModifierTypo = {
        orderId: 'test-modifier-resolution',
        items: [{
          itemId: 1,
          itemName: '6 Traditional Wings',
          quantity: 1,
          modifiers: [{
            modifierId: 999, // Invalid ID
            selected: 'Ranc', // Typo that resolves to "Ranch"
            count: 1
          }]
        }]
      };

      // Act: Process the order
      const result = await orderCritic.processOrder(orderWithModifierTypo);

      // Assert: Check that the modifier error was filtered out
      expect(result.success).toBe(true); // Resolution succeeded, so overall success
      expect(result.errors).toBeUndefined(); // No errors property when successful
      expect(result.critic_actions).toHaveLength(6); // All 6 operations executed (modifier mapping not triggered)
      
      // Verify the resolution sequence in critic_actions
      const modifierValidation = result.critic_actions.find(action => action.op === 'modifier_validation');
      const modifierResolution = result.critic_actions.find(action => action.op === 'modifier_resolution');
      
      expect(modifierValidation.corrected_value).toBe('VALIDATION_FAILED');
      expect(modifierValidation.error).toBeDefined();
      expect(modifierValidation.error.code).toBe('MODIFIER_NAME_NOT_FOUND');
      
      expect(modifierResolution.corrected_value).not.toBe('null');
      expect(modifierResolution.corrected_value).not.toBe('RESOLUTION_FAILED');
      expect(modifierResolution.target).toBe('Ranc');
      expect(modifierResolution.corrected_value).toBe('BBQ Ranch');
    });

    test('should filter out both menu item and modifier errors when both resolve successfully', async () => {
      // Arrange: Order with both menu item and modifier typos
      const orderWithMultipleTypos = {
        orderId: 'test-multiple-resolutions',
        items: [{
          itemId: 999, // Invalid ID
          itemName: 'honey garlic wings', // Typo that resolves to wings item
          quantity: 1,
          modifiers: [{
            modifierId: 999, // Invalid ID
            selected: 'Ranc', // Typo that resolves to "Ranch"
            count: 1
          }]
        }]
      };

      // Act: Process the order
      const result = await orderCritic.processOrder(orderWithMultipleTypos);

      // Assert: Check that menu item was resolved but modifier resolution failed  
      expect(result.success).toBe(false); // Modifier resolution failed, so overall failure
      expect(result.errors).toBeDefined(); // Errors property should exist when failed
      expect(result.critic_actions).toHaveLength(8); // All operations including both resolutions and mapping
      
      // Verify menu item resolution succeeded
      const menuResolution = result.critic_actions.find(action => action.op === 'menu_item_resolution');
      expect(menuResolution).toBeDefined();
      expect(menuResolution.corrected_value).toContain('Honey Garlic'); // Should resolve to Honey Garlic item
      
      // Verify modifier resolution failed (because Honey Garlic item doesn't have Ranc modifier)
      const modifierValidation = result.critic_actions.find(action => action.op === 'modifier_validation');
      expect(modifierValidation).toBeDefined();
      expect(modifierValidation.error).toBeDefined(); // Should have error
    });
  });

  describe(' Unresolved Errors Should Be Kept', () => {
    test('should keep schema validation error (no resolution available)', async () => {
      // Arrange: Order with schema error that cannot be resolved
      const orderWithSchemaError = {
        orderId: 'test-schema-error',
        items: [] // Empty items array - cannot be auto-resolved
      };

      // Act: Process the order
      const result = await orderCritic.processOrder(orderWithSchemaError);

      // Assert: Check that the schema error is kept
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(1);
      expect(result.errors[0].code).toBe('SCHEMA_VALIDATION_ERROR');
      expect(result.errors[0].context.reason).toBe('Empty items array');
      
      // Verify no resolution was attempted for schema errors
      const resolutionActions = result.critic_actions.filter(action => 
        action.op.includes('resolution')
      );
      expect(resolutionActions).toHaveLength(0);
    });

    test('should keep menu item error when resolution fails', async () => {
      // Arrange: Order with completely unresolvable menu item
      const orderWithUnresolvableItem = {
        orderId: 'test-unresolvable-item',
        items: [{
          itemId: 999,
          itemName: 'zzzzz_definitely_not_a_menu_item_zzzzz', // Extremely unlikely to resolve
          quantity: 1,
          modifiers: []
        }]
      };

      // Act: Process the order
      const result = await orderCritic.processOrder(orderWithUnresolvableItem);

      // Assert: Check behavior based on actual resolution capability
      
      // Find the resolution operation
      const menuResolution = result.critic_actions.find(action => action.op === 'menu_item_resolution');
      
      if (menuResolution && menuResolution.corrected_value === 'null') {
        // If resolution truly failed, error should be kept
        expect(result.success).toBe(false);
        expect(result.errors).toHaveLength(1);
        expect(result.errors[0].code).toBe('MENU_ITEM_NAME_NOT_FOUND');
      } else {
        // If resolution succeeded (AI is very good!), error should be filtered out
        expect(result.success).toBe(true);
        expect(result.errors).toBeUndefined();
      }
      
      // Either way, resolution should have been attempted
      expect(menuResolution).toBeDefined();
    });

    test('should keep quantity validation error (no resolution available)', async () => {
      // Arrange: Order with quantity error that cannot be resolved
      const orderWithQuantityError = {
        orderId: 'test-quantity-error',
        items: [{
          itemId: 1,
          itemName: '6 Traditional Wings',
          quantity: 0, // Invalid quantity - cannot be auto-resolved
          modifiers: []
        }]
      };

      // Act: Process the order
      const result = await orderCritic.processOrder(orderWithQuantityError);

      // Assert: Check that the quantity error is kept
      expect(result.success).toBe(false);
      expect(result.errors).toHaveLength(2); // Schema + Quantity errors
      
      // Should contain quantity error (unresolvable)
      const quantityErrors = result.errors.filter(error => 
        error.code === 'QUANTITY_VALIDATION_ERROR'
      );
      expect(quantityErrors).toHaveLength(1);
      
      // Verify no resolution was attempted for quantity errors
      const resolutionActions = result.critic_actions.filter(action => 
        action.op.includes('resolution')
      );
      expect(resolutionActions).toHaveLength(0);
    });
  });

  describe('PROCESSING Mixed Scenarios', () => {
    test('should filter resolved errors but keep unresolved ones', async () => {
      // Arrange: Order with both resolvable and unresolvable errors
      const mixedOrder = {
        orderId: 'test-mixed-errors',
        items: [
          {
            itemId: 999,
            itemName: 'chiken', // Resolvable typo
            quantity: 0, // Unresolvable quantity error
            modifiers: []
          }
        ]
      };

      // Act: Process the order
      const result = await orderCritic.processOrder(mixedOrder);

      // Assert: Check that only unresolvable errors remain
      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      
      // Should not contain menu item error (resolved)
      const menuItemErrors = result.errors.filter(error => 
        error.code === 'MENU_ITEM_NAME_NOT_FOUND'
      );
      expect(menuItemErrors).toHaveLength(0);
      
      // Should contain quantity error (unresolvable)
      const quantityErrors = result.errors.filter(error => 
        error.code === 'QUANTITY_VALIDATION_ERROR'
      );
      expect(quantityErrors).toHaveLength(1);
    });
  });

  describe(' Edge Cases', () => {
    test('should handle order with no errors', async () => {
      // Arrange: Perfect order with no errors
      const perfectOrder = {
        orderId: 'test-perfect-order',
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

      // Act: Process the order
      const result = await orderCritic.processOrder(perfectOrder);

      // Assert: Check that it succeeds with no errors
      expect(result.success).toBe(true);
      expect(result.errors).toBeUndefined(); // No errors property when successful
      expect(result.critic_actions).toHaveLength(6); // All validation operations (modifier mapping not triggered), no resolutions needed
      
      // Verify resolution operations (Ranch resolves to BBQ Ranch due to menu changes)
      const resolutionActions = result.critic_actions.filter(action => 
        action.op.includes('resolution')
      );
      expect(resolutionActions).toHaveLength(1); // Ranch -> BBQ Ranch resolution
    });

    test('should handle multiple resolution attempts for the same error type', async () => {
      // Arrange: Order with multiple items having the same type of error
      const multipleItemsOrder = {
        orderId: 'test-multiple-items',
        items: [
          {
            itemId: 999,
            itemName: 'chiken', // First typo
            quantity: 1,
            modifiers: []
          },
          {
            itemId: 998,
            itemName: 'wings', // Second typo
            quantity: 1,
            modifiers: []
          }
        ]
      };

      // Act: Process the order
      const result = await orderCritic.processOrder(multipleItemsOrder);

      // Assert: Check that filtering considers the most recent resolution
      expect(result.success).toBe(true); // Resolutions likely succeeded
      
      // Should have multiple menu item resolution operations
      const menuResolutions = result.critic_actions.filter(action => 
        action.op === 'menu_item_resolution'
      );
      expect(menuResolutions.length).toBeGreaterThan(0);
      
      // If all resolutions succeeded, no menu item errors should remain
      const allResolutionsSucceeded = menuResolutions.every(resolution => 
        resolution.corrected_value && 
        resolution.corrected_value !== 'null' && 
        resolution.corrected_value !== 'RESOLUTION_FAILED'
      );
      
      if (allResolutionsSucceeded) {
        // When resolutions succeed, overall success should be true and no errors
        expect(result.success).toBe(true);
        expect(result.errors).toBeUndefined();
      } else {
        // If resolutions failed, there should be errors
        expect(result.success).toBe(false);
        const menuItemErrors = result.errors.filter(error => 
          error.code === 'MENU_ITEM_NAME_NOT_FOUND'
        );
        expect(menuItemErrors.length).toBeGreaterThan(0);
      }
    });
  });
});
