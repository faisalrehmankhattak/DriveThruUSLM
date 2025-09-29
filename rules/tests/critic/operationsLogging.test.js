/**
 * Complete Operations Logging Test
 * 
 * Tests that ALL validation operations are logged, including successful validations.
 * This ensures complete observability and audit trail for every order processed.
 * 
 * Updated to use our unified operations structure directly.
 */

// Import all converted actions that use unified operations
const ValidateOrderSchemaAction = require('../../domain/order/actions/validateOrderSchemaAction');
const ValidateOrderQuantityAction = require('../../domain/order/actions/validateOrderQuantityAction');
const ConsolidateOrderAction = require('../../domain/order/actions/consolidateOrderAction');
const ValidateMenuItemAction = require('../../domain/order/actions/validateMenuItemAction');
const ValidateModifierAction = require('../../domain/order/actions/validateModifierAction');
const { ActionFactory } = require('../../core/interfaces/IAction');

describe('Complete Operations Logging', () => {
  let actions;

  beforeAll(() => {
    // Initialize all actions that use unified operations
    actions = {
      validateSchema: new ValidateOrderSchemaAction(),
      validateQuantity: new ValidateOrderQuantityAction(),
      consolidateOrder: new ConsolidateOrderAction(),
      validateMenuItem: new ValidateMenuItemAction(),
      validateModifier: new ValidateModifierAction()
    };
    console.log(' Complete Operations Logging Test Suite Initialized');
  });

  afterAll(async () => {
    console.log(' Complete Operations Logging Tests Completed!');
    
    // Properly close database connections
    try {
      // Get singleton instances that might have open connections
      const { getSearchService } = require('../../infrastructure/data/searchEngine');
      const { getMenuDataService } = require('../../infrastructure/data/menuDataService');
      
      // Close search service connections
      const searchService = getSearchService();
      if (searchService && searchService.client) {
        await searchService.client.end();
        console.log(' Search service database connection closed');
      }
      
      // Close menu service connections (if any)
      const menuService = getMenuDataService();
      if (menuService && menuService.close) {
        await menuService.close();
        console.log(' Menu service connections closed');
      }
      
    } catch (error) {
        console.log(' Cleanup completed with minor warnings');
    }
  });

  // Helper function to run all actions and collect operations
  async function processOrderWithOperations(order) {
    let allOperations = [];
    let currentOrder = order;
    let success = true;

    try {
      // Schema Validation
      const schemaResult = await actions.validateSchema.execute(
        ActionFactory.createInitialRequest(currentOrder)
      );
      if (schemaResult.context?.operations) allOperations.push(...schemaResult.context.operations);
      if (!schemaResult.success) success = false;

      // Quantity Validation
      const quantityResult = await actions.validateQuantity.execute(
        ActionFactory.createInitialRequest(currentOrder)
      );
      if (quantityResult.context?.operations) allOperations.push(...quantityResult.context.operations);

      // Order Consolidation
      const consolidationResult = await actions.consolidateOrder.execute(
        ActionFactory.createInitialRequest(currentOrder)
      );
      if (consolidationResult.context?.operations) allOperations.push(...consolidationResult.context.operations);
      currentOrder = consolidationResult.order || currentOrder;

      // Menu Item Validation
      const menuResult = await actions.validateMenuItem.execute(
        ActionFactory.createInitialRequest(currentOrder)
      );
      if (menuResult.context?.operations) allOperations.push(...menuResult.context.operations);
      if (!menuResult.success) success = false;

      // Modifier Validation
      const modifierResult = await actions.validateModifier.execute(
        ActionFactory.createInitialRequest(currentOrder)
      );
      if (modifierResult.context?.operations) allOperations.push(...modifierResult.context.operations);
      if (!modifierResult.success) success = false;

      return {
        success,
        message: success ? 'Order validated successfully' : 'Order validation failed',
        critic_actions: allOperations,
        order: currentOrder
      };
    } catch (error) {
      return {
        success: false,
        message: `Validation error: ${error.message}`,
        critic_actions: allOperations,
        order: currentOrder
      };
    }
  }

  describe('Successful Order - All Operations Logged', () => {
    it('should log ALL validation operations for a completely valid order', async () => {
      // Test case: Perfect order that passes all validations
      const validOrder = {
        orderId: 'complete-operations-test',
        items: [{
          itemId: 6,
          itemName: '6 Boneless Wings',
          quantity: 1,
          modifiers: [{
            modifierId: 4,
            selected: 'Ranch',
            count: 1
          }]
        }]
      };

      const result = await processOrderWithOperations(validOrder);

      // Should be successful
      expect(result.success).toBe(true);
      expect(result.message).toBe('Order validated successfully');

      // Should have ALL validation operations logged
      expect(result.critic_actions).toBeDefined();
      expect(result.critic_actions.length).toBeGreaterThanOrEqual(4); // Expect at least 4 operations (schema, quantity, menu_item, modifier)

      // Verify each operation is logged
      const operations = result.critic_actions;
      
      // 1. Schema Validation Success
      const schemaOp = operations.find(op => (op.operation || op.op) === 'schema_validation');
      expect(schemaOp).toBeDefined();
      expect(schemaOp.target).toContain('1 items');
      expect(schemaOp.corrected_value).toBe('VALIDATION_PASSED');
      expect(schemaOp.rationale).toContain('Schema validation successful');

      // 2. Quantity Validation Success  
      const quantityOp = operations.find(op => (op.operation || op.op) === 'quantity_validation');
      expect(quantityOp).toBeDefined();
      expect(quantityOp.target).toContain('1 items, 1 modifiers');
      expect(quantityOp.corrected_value).toBe('VALIDATION_PASSED');
      expect(quantityOp.rationale).toContain('Quantity validation successful');

      // 3. Order Consolidation (should always be present)
      const consolidationOp = operations.find(op => (op.operation || op.op) === 'order_consolidation');
      expect(consolidationOp).toBeDefined();
      expect(consolidationOp.target).toBeDefined();
      expect(consolidationOp.corrected_value).toBeDefined();

      // 4. Menu Item Validation Success
      const menuItemOp = operations.find(op => (op.operation || op.op) === 'menu_item_validation');
      expect(menuItemOp).toBeDefined();
      expect(menuItemOp.target).toContain('1 menu items');
      expect(menuItemOp.corrected_value).toBe('VALIDATION_PASSED');
      expect(menuItemOp.rationale).toContain('Menu item validation successful');

      // 5. Modifier Validation Success
      const modifierOp = operations.find(op => (op.operation || op.op) === 'modifier_validation');
      expect(modifierOp).toBeDefined();
      expect(modifierOp.target).toContain('1 modifiers');
      expect(modifierOp.corrected_value).toBe('VALIDATION_PASSED');
      expect(modifierOp.rationale).toContain('Modifier validation successful');

      console.log(' Complete Operations Test Results:');
      console.log(` Total Operations: ${operations.length}`);
      operations.forEach((op, i) => {
        console.log(' ${op.corrected_value}');
      });
    });

    it('should log operations for multiple items order', async () => {
      // Test case: Multiple items, all valid
      const multiItemOrder = {
        orderId: 'multi-item-operations-test',
        items: [
          {
            itemId: 6,
            itemName: '6 Boneless Wings',
            quantity: 1,
            modifiers: []
          },
          {
            itemId: 27,
            itemName: 'Carrots & Celery',
            quantity: 1,
            modifiers: [{
              modifierId: 1,
              selected: 'Ranch',
              count: 1
            }]
          }
        ]
      };

      const result = await processOrderWithOperations(multiItemOrder);

      expect(result.success).toBe(true);
      expect(result.critic_actions.length).toBeGreaterThanOrEqual(4); // Multiple items may generate multiple operations of same type

      // Verify operations reflect multiple items
      const schemaOp = result.critic_actions.find(op => (op.operation || op.op) === 'schema_validation');
      expect(schemaOp.target).toContain('2 items');

      const quantityOp = result.critic_actions.find(op => (op.operation || op.op) === 'quantity_validation');
      expect(quantityOp.target).toContain('2 items, 1 modifiers');

      const menuItemOp = result.critic_actions.find(op => (op.operation || op.op) === 'menu_item_validation');
      expect(menuItemOp.target).toContain('2 menu items');

      console.log(' Multi-Item Operations Test Results:');
      console.log(` Total Operations: ${result.critic_actions.length}`);
      result.critic_actions.forEach((op, i) => {
        console.log(' ${op.corrected_value}');
      });
    });
  });

  describe('Mixed Success/Failure - Complete Operations', () => {
    it('should log both successful and failed operations', async () => {
      // Test case: Order with some validation failures
      const mixedOrder = {
        orderId: 'mixed-operations-test',
        items: [{
          itemId: 999, // Invalid item ID
          itemName: 'Invalid Item Name', // Invalid item name
          quantity: 1,
          modifiers: []
        }]
      };

      const result = await processOrderWithOperations(mixedOrder);

      // Should have operations for both success and failure
      expect(result.critic_actions).toBeDefined();
      expect(result.critic_actions.length).toBeGreaterThan(3);

      // Should have successful schema and quantity operations
      const schemaOp = result.critic_actions.find(op => (op.operation || op.op) === 'schema_validation');
      expect(schemaOp).toBeDefined();
      expect(schemaOp.corrected_value).toBe('VALIDATION_PASSED');

      const quantityOp = result.critic_actions.find(op => (op.operation || op.op) === 'quantity_validation');
      expect(quantityOp).toBeDefined();
      expect(quantityOp.corrected_value).toBe('VALIDATION_PASSED');

      // Should have failed menu item validation
      const menuItemOp = result.critic_actions.find(op => (op.operation || op.op) === 'menu_item_validation');
      expect(menuItemOp).toBeDefined();
      expect(menuItemOp.corrected_value).toBe('VALIDATION_FAILED');

      console.log(' Mixed Operations Test Results:');
      console.log(` Total Operations: ${result.critic_actions.length}`);
      result.critic_actions.forEach((op, i) => {
        console.log(' ${op.corrected_value}');
      });
    });
  });

  describe('Operations Metadata Validation', () => {
    it('should include comprehensive metadata for all operations', async () => {
      const testOrder = {
        orderId: 'metadata-operations-test',
        items: [{
          itemId: 6,
          itemName: '6 Boneless Wings',
          quantity: 1,
          modifiers: []
        }]
      };

      const result = await processOrderWithOperations(testOrder);

      expect(result.critic_actions.length).toBeGreaterThanOrEqual(4); // At least 4 core operations

      // Verify each operation has required fields
      result.critic_actions.forEach((operation, index) => {
        expect(operation).toHaveProperty('op');
        expect(operation).toHaveProperty('target');
        expect(operation).toHaveProperty('corrected_value');
        expect(operation).toHaveProperty('rationale');

        // Verify operation names are valid
        expect(['schema_validation', 'quantity_validation', 'order_consolidation', 'menu_item_validation', 'modifier_validation'])
          .toContain(operation.op);

        console.log(` Operation ${index + 1} metadata complete:`, {
          op: operation.op,
          target: operation.target,
          corrected_value: operation.corrected_value,
          rationale_length: operation.rationale.length
        });
      });
    });
  });

  describe('Performance with Complete Logging', () => {
    it('should maintain performance with complete operations logging', async () => {
      const testOrder = {
        orderId: 'performance-operations-test',
        items: [{
          itemId: 6,
          itemName: '6 Boneless Wings',
          quantity: 2,
          modifiers: [{
            modifierId: 4,
            selected: 'Ranch',
            count: 1
          }]
        }]
      };

      const startTime = Date.now();
      const result = await processOrderWithOperations(testOrder);
      const processingTime = Date.now() - startTime;

      // Should complete within reasonable time even with complete logging
      expect(processingTime).toBeLessThan(1000); // 1 second max
      expect(result.success).toBe(true);
      expect(result.critic_actions.length).toBeGreaterThanOrEqual(4); // At least 4 core operations

      console.log(` Performance Test: ${processingTime}ms for complete operations logging`);
      console.log(` Operations logged: ${result.critic_actions.length}`);
      console.log(` Average per operation: ${Math.round(processingTime / result.critic_actions.length)}ms`);
    });

    it('should handle multiple operations of same type for multiple items/modifiers', async () => {
      // Test case: Order with duplicate items to trigger consolidation
      const duplicateItemsOrder = {
        orderId: 'duplicate-items-test',
        items: [
          {
            itemId: 6,
            itemName: '6 Boneless Wings',
            quantity: 1,
            modifiers: [{
              modifierId: 4,
              selected: 'Ranch',
              count: 1
            }]
          },
          {
            itemId: 6, // Same item - should trigger consolidation
            itemName: '6 Boneless Wings',
            quantity: 2,
            modifiers: [{
              modifierId: 4,
              selected: 'Ranch',
              count: 1
            }]
          }
        ]
      };

      const result = await processOrderWithOperations(duplicateItemsOrder);

      expect(result.success).toBe(true);
      expect(result.critic_actions.length).toBeGreaterThanOrEqual(4);

      // Should now have consolidation operation since we have duplicates
      const consolidationOp = result.critic_actions.find(op => (op.operation || op.op) === 'order_consolidation');
      expect(consolidationOp).toBeDefined();
      expect(consolidationOp.target).toBeDefined();
      expect(consolidationOp.corrected_value).toBeDefined();
      expect(consolidationOp.rationale).toContain('merged');

      console.log(' Consolidation operation correctly logged for duplicate items');
      console.log(` Total operations: ${result.critic_actions.length}`);
      result.critic_actions.forEach((op, i) => {
        console.log(' ${op.corrected_value}');
      });
    });
  });
});
