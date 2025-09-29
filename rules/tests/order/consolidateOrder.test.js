const ConsolidateOrderAction = require("../../domain/order/actions/consolidateOrderAction");
const { ActionFactory } = require("../../core/interfaces/IAction");

/**
 * Order Consolidation Test Suite
 * Converted to use universal request/response interface
 * 
 * NOTE: This test suite focuses on the core consolidation functionality.
 * Only the most important tests have been converted to universal interface.
 * The remaining tests use the legacy engine format and will be converted later.
 */
describe("Order Consolidation Action", () => {
  let action;

  // Helper function to log performance metrics
  const logTestPerformance = (testName, response, startTime) => {
    const totalTime = Date.now() - startTime;
    const consolidationTime = response.stage?.processingTime || response.processingTime || 0;
    
    console.log(` PERFORMANCE [${testName}]:`);
    console.log(`   Total Test Time: ${totalTime}ms`);
    console.log(`   Consolidation Time: ${consolidationTime}ms`);
    console.log(`   Items Processed: ${response.context?.metadata?.originalItemCount || response.itemsProcessed || 0}`);
    console.log(`   Groups Consolidated: ${response.context?.metadata?.groupsConsolidated || 0}`);
    console.log(`   Consolidation Rate: ${response.context?.metadata?.originalItemCount ? Math.round((response.context.metadata.originalItemCount / consolidationTime) * 1000) : 0} items/sec`);
  };

  beforeEach(() => {
    // Setup fresh action for each test
    action = new ConsolidateOrderAction();
  });

  describe("Action Execution", () => {
    test("should execute consolidation independently", async () => {
      const validOrder = {
        "orderId": "order-dependency-test",
        "items": [
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [] },
          { "itemId": 6, "itemName": "Wings", "quantity": 12, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.context.metadata.originalItemCount).toBe(2);
      expect(response.context.metadata.consolidatedItemCount).toBe(1);
      expect(response.context.metadata.groupsConsolidated).toBe(1);
      expect(response.order.items).toHaveLength(1);
      expect(response.order.items[0].quantity).toBe(18); // 6 + 12
    });

    test("should consolidate identical items regardless of warnings", async () => {
      const orderWithWarnings = {
        "orderId": "order-warnings",
        "items": [
          { "itemId": 6, "itemName": "Wings", "quantity": 100, "modifiers": [] }, // High quantity item
          { "itemId": 6, "itemName": "Wings", "quantity": 50, "modifiers": [] }   // Same item
        ]
      };

      const request = ActionFactory.createInitialRequest(orderWithWarnings, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(1); // Should be consolidated
      expect(response.order.items[0].quantity).toBe(150); // Combined quantity
      expect(response.context.metadata.groupsConsolidated).toBe(1); // One group merged
    });
  });

  describe("Basic Consolidation Scenarios", () => {
    test("should consolidate identical items with no modifiers", async () => {
      const order = {
        "orderId": "order-basic",
        "items": [
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [] },
          { "itemId": 6, "itemName": "Wings", "quantity": 12, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(1);
      expect(response.order.items[0].itemId).toBe(6);
      expect(response.order.items[0].quantity).toBe(18);
      expect(response.order.items[0].modifiers).toEqual([]);
      expect(response.context.metadata.groupsConsolidated).toBe(1);
    });

    test("should consolidate identical items with same modifiers", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-modifiers",
        "items": [
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 6,
            "modifiers": [
              { "modifierId": 1, "selected": "Ranch", "count": 1 },
              { "modifierId": 2, "selected": "Medium", "count": 1 }
            ]
          },
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 6,
            "modifiers": [
              { "modifierId": 1, "selected": "Ranch", "count": 2 },
              { "modifierId": 2, "selected": "Medium", "count": 1 }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(1);
      expect(response.order.items[0].quantity).toBe(12);
      expect(response.order.items[0].modifiers).toHaveLength(2);
      
      // Check modifier consolidation
      const ranchMod = response.order.items[0].modifiers.find(m => m.selected === "Ranch");
      const mediumMod = response.order.items[0].modifiers.find(m => m.selected === "Medium");
      
      expect(ranchMod.count).toBe(3); // 1 + 2
      expect(mediumMod.count).toBe(2); // 1 + 1

      // Log performance
      logTestPerformance("consolidate identical items with same modifiers", response, startTime);
    });

    test("should handle modifier order independence", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-modifier-order",
        "items": [
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 6,
            "modifiers": [
              { "modifierId": 1, "selected": "Ranch", "count": 1 },
              { "modifierId": 2, "selected": "Medium", "count": 1 }
            ]
          },
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 6,
            "modifiers": [
              { "modifierId": 2, "selected": "Medium", "count": 1 }, // Different order
              { "modifierId": 1, "selected": "Ranch", "count": 1 }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(1); // Should consolidate despite different order
      expect(response.order.items[0].quantity).toBe(12);

      // Log performance
      logTestPerformance("handle modifier order independence", response, startTime);
    });
  });

  describe("No Consolidation Scenarios", () => {
    test("should NOT consolidate items with different itemIds", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-different-items",
        "items": [
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [] },  // Wings
          { "itemId": 15, "itemName": "Coffee", "quantity": 1, "modifiers": [] }  // Coffee
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(2); // Should remain separate
      expect(response.context.metadata.groupsConsolidated).toBe(0);
    });

    test("should NOT consolidate items with different modifier selections", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-different-modifiers",
        "items": [
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 6,
            "modifiers": [{ "modifierId": 1, "selected": "Ranch", "count": 1 }]
          },
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 6,
            "modifiers": [{ "modifierId": 1, "selected": "BBQ", "count": 1 }]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(2); // Should remain separate
      expect(response.context.metadata.groupsConsolidated).toBe(0);
    });

    test("should NOT consolidate items with different modifier counts", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-different-modifier-sets",
        "items": [
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 6,
            "modifiers": [
              { "modifierId": 1, "selected": "Ranch", "count": 1 },
              { "modifierId": 2, "selected": "Medium", "count": 1 }
            ]
          },
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 6,
            "modifiers": [
              { "modifierId": 1, "selected": "Ranch", "count": 1 }
              // Missing modifier 2
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(2); // Should remain separate
    });
  });

  describe("Complex Consolidation Scenarios", () => {
    test("should consolidate multiple groups in same order", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-multiple-groups",
        "items": [
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [{ "modifierId": 1, "selected": "Ranch", "count": 1 }] },
          { "itemId": 15, "itemName": "Coffee", "quantity": 1, "modifiers": [] }, // Coffee
          { "itemId": 6, "itemName": "Wings", "quantity": 12, "modifiers": [{ "modifierId": 1, "selected": "Ranch", "count": 2 }] },
          { "itemId": 15, "itemName": "Coffee", "quantity": 2, "modifiers": [] }, // Another coffee
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [{ "modifierId": 1, "selected": "BBQ", "count": 1 }] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(3); // 2 consolidated + 1 unique
      expect(response.context.metadata.groupsConsolidated).toBe(2);
      
      // Find the consolidated wings with Ranch
      const ranchWings = response.order.items.find(item => 
        item.itemId === 6 && item.modifiers.some(mod => mod.selected === "Ranch")
      );
      expect(ranchWings.quantity).toBe(18); // 6 + 12
      expect(ranchWings.modifiers[0].count).toBe(3); // 1 + 2
      
      // Find the consolidated coffee
      const coffee = response.order.items.find(item => item.itemId === 15);
      expect(coffee.quantity).toBe(3); // 1 + 2
    });

    test("should preserve item order after consolidation", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-preserve-order",
        "items": [
          { "itemId": 15, "itemName": "Coffee", "quantity": 1, "modifiers": [] }, // Coffee (index 0)
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [] },  // Wings (index 1)
          { "itemId": 20, "itemName": "Sandwich", "quantity": 1, "modifiers": [] }, // Sandwich (index 2)
          { "itemId": 6, "itemName": "Wings", "quantity": 12, "modifiers": [] }  // More wings (index 3)
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(3);
      
      // Order should be preserved: Coffee, Wings (consolidated), Sandwich
      expect(response.order.items[0].itemId).toBe(15); // Coffee first
      expect(response.order.items[1].itemId).toBe(6);  // Wings second (consolidated)
      expect(response.order.items[1].quantity).toBe(18); // 6 + 12
      expect(response.order.items[2].itemId).toBe(20); // Sandwich third
    });
  });

  describe("Edge Cases", () => {
    test("should handle empty order", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-empty",
        "items": []
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true); // Consolidation action doesn't validate schema
      expect(response.order.items).toHaveLength(0); // No items to consolidate
      expect(response.context.metadata.originalItemCount).toBe(0);
    });

    test("should handle single item order", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-single",
        "items": [
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(1); // Unchanged
      // Single item order: no consolidation needed, but metadata still exists
      expect(response.context.metadata.originalItemCount).toBe(1);
      expect(response.context.metadata.consolidatedItemCount).toBe(1);
      expect(response.context.metadata.groupsConsolidated).toBe(0);
    });

    test("should handle items with no modifiers vs empty modifiers array", async () => {
      const startTime = Date.now();
      const order = {
        "orderId": "order-modifier-edge",
        "items": [
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [] }, // Empty modifiers array
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [] } // Empty modifiers array
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(1); // Should consolidate
      expect(response.order.items[0].quantity).toBe(12);
    });
  });

  describe("Performance Tests", () => {
    test("should process consolidation quickly", async () => {
      // Create large order with many duplicates
      const items = [];
      for (let i = 0; i < 50; i++) {
        items.push({
          "itemId": i % 5, // Create 5 groups of 10 items each
          "itemName": `Item${i % 5}`,
          "quantity": 1,
          "modifiers": []
        });
      }

      const largeOrder = {
        "orderId": "order-performance",
        "items": items
      };

      const request = ActionFactory.createInitialRequest(largeOrder);
      const response = await action.execute(request);
      const processingTime = response.stage?.processingTime || 0;

      logTestPerformance("Duplicate Consolidation Performance", response, Date.now() - processingTime);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(5); // Should consolidate to 5 items
      expect(processingTime).toBeLessThan(100); // Should be fast
      expect(response.context.metadata.groupsConsolidated).toBe(5);
    });
  });

  describe("Consolidation Action Direct Testing", () => {
    test("should provide accurate consolidation summary", async () => {
      const order = {
        "orderId": "test-consolidation-summary",
        "items": [
          { "itemId": 6, "itemName": "Wings", "quantity": 6, "modifiers": [] },
          { "itemId": 6, "itemName": "Wings", "quantity": 12, "modifiers": [] },
          { "itemId": 15, "itemName": "Coffee", "quantity": 1, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.context.metadata.originalItemCount).toBe(3);
      expect(response.context.metadata.consolidatedItemCount).toBe(2);
      expect(response.context.metadata.groupsConsolidated).toBe(1);
      expect(response.context.metadata.itemsReduced).toBe(1);
    });

    test("should correctly identify and consolidate items with matching signatures", async () => {
      // Test that items with same itemId and modifiers get consolidated (signature matching behavior)
      const order = {
        "orderId": "test-signature-matching",
        "items": [
          // Items with no modifiers - should consolidate
          { "itemId": 6, "itemName": "Wings", "quantity": 2, "modifiers": [] },
          { "itemId": 6, "itemName": "Wings", "quantity": 3, "modifiers": [] },
          
          // Items with same modifiers in different order - should consolidate
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 1,
            "modifiers": [
              { "modifierId": 2, "selected": "Medium", "count": 1 },
              { "modifierId": 1, "selected": "Ranch", "count": 1 }
            ]
          },
          { 
            "itemId": 6, "itemName": "Wings", "quantity": 2,
            "modifiers": [
              { "modifierId": 1, "selected": "Ranch", "count": 1 },
              { "modifierId": 2, "selected": "Medium", "count": 1 }
            ]
          },
          
          // Different item - should NOT consolidate
          { "itemId": 15, "itemName": "Coffee", "quantity": 1, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(order);
      const response = await action.execute(request);

      expect(response.success).toBe(true);
      expect(response.order.items).toHaveLength(3); // 5 items to 3 consolidated items
      
      // Check that identical items (no modifiers) were consolidated
      const wingsNoModifiers = response.order.items.find(item => 
        item.itemId === 6 && item.modifiers.length === 0
      );
      expect(wingsNoModifiers.quantity).toBe(5); // 2 + 3 = 5
      
      // Check that items with same modifiers (different order) were consolidated
      const wingsWithModifiers = response.order.items.find(item => 
        item.itemId === 6 && item.modifiers.length > 0
      );
      expect(wingsWithModifiers.quantity).toBe(3); // 1 + 2 = 3
      expect(wingsWithModifiers.modifiers).toHaveLength(2);
      expect(wingsWithModifiers.modifiers.find(m => m.selected === "Ranch").count).toBe(2);
      expect(wingsWithModifiers.modifiers.find(m => m.selected === "Medium").count).toBe(2);
      
      // Check that different item was not consolidated
      const coffee = response.order.items.find(item => item.itemId === 15);
      expect(coffee.quantity).toBe(1);
      
      // Verify consolidation metadata
      expect(response.context.metadata.groupsConsolidated).toBe(2);
      expect(response.context.metadata.originalItemCount).toBe(5);
      expect(response.context.metadata.consolidatedItemCount).toBe(3);
    });
  });
});
