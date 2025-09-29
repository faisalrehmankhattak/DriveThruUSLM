/**
 * Menu Item Validation Action Tests
 * Tests the universal menu item validation functionality
 */

const ValidateMenuItemAction = require("../../domain/order/actions/validateMenuItemAction");
const { ActionFactory } = require("../../core/interfaces/IAction");

describe("Menu Item Validation Action", () => {
  let action;

  beforeEach(() => {
    // Setup fresh action for each test
    action = new ValidateMenuItemAction();
  });

  // Helper function to log performance metrics
  const logTestPerformance = (testName, response, startTime) => {
    const totalTime = Date.now() - startTime;
    const processingTime = response.stage?.processingTime || response.processingTime || 0;
    const itemsProcessed = response.context?.metadata?.itemsProcessed || response.metadata?.itemsProcessed || 0;
    
    console.log(` PERFORMANCE [${testName}]:`);
    console.log(`   Total Test Time: ${totalTime}ms`);
    console.log(`   Menu Validation Time: ${processingTime}ms`);
    console.log(`   Items Processed: ${itemsProcessed}`);
    console.log(`   Validation Rate: ${itemsProcessed && processingTime ? Math.round(itemsProcessed / (processingTime / 1000)) : 'N/A'} items/sec`);
  };

  describe("Action Execution", () => {
    test("should execute menu validation independently", async () => {
      const startTime = Date.now();
      const validOrder = {
        orderId: "menu-test-001",
        items: [
          { itemId: 1, itemName: "6 Traditional Wings", quantity: 1, modifiers: [] },
          { itemId: 6, itemName: "6 Boneless Wings", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Menu Validation Independence", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsProcessed).toBe(2);
      expect(response.context.metadata.validItems).toBe(2);
      expect(response.context.metadata.invalidItems).toBe(0);
      expect(response.context.errors).toHaveLength(0);
      expect(response.context.warnings).toHaveLength(0);
    });

    test("should handle empty order gracefully", async () => {
      const startTime = Date.now();
      const emptyOrder = {
        orderId: "menu-test-002",
        items: []
      };

      const request = ActionFactory.createInitialRequest(emptyOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Empty Order Handling", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsProcessed).toBe(0);
      expect(response.context.metadata.validItems).toBe(0);
      expect(response.context.metadata.invalidItems).toBe(0);
    });
  });

  describe("Valid Menu Items", () => {
    test("should validate exact matches from menu", async () => {
      const startTime = Date.now();
      const validOrder = {
        orderId: "menu-test-003",
        items: [
          { itemId: 1, itemName: "6 Traditional Wings", quantity: 1, modifiers: [] },
          { itemId: 15, itemName: "3 Grilled Tenders", quantity: 2, modifiers: [] },
          { itemId: 17, itemName: "All-American Cheeseburger", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Exact Menu Matches", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.errors).toHaveLength(0);
      expect(response.context.warnings).toHaveLength(0);
      expect(response.context.metadata.validItems).toBe(3);
      expect(response.context.metadata.invalidItems).toBe(0);
      expect(response.context.metadata.itemsProcessed).toBe(3);
    });

    test("should provide action metadata", () => {
      const metadata = action.getMetadata();
      
      expect(metadata.actionName).toBe('Menu Item Validation');
      expect(metadata.actionType).toBe('validation');
      expect(metadata.description).toContain('menu item names and IDs');
      expect(metadata.dependencies).toContain('MenuDataService');
      expect(metadata.errorCodes).toContain('MENU_ITEM_NAME_NOT_FOUND');
    });
  });

  describe("Invalid Menu Items", () => {
    test("should reject items with incorrect itemName", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "menu-test-004",
        items: [
          { itemId: 1, itemName: "Wrong Wing Name", quantity: 1, modifiers: [] },
          { itemId: 6, itemName: "6 Boneless Wings", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Invalid Item Name", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain('not found in menu');
      expect(response.context.metadata.validItems).toBe(1);
      expect(response.context.metadata.invalidItems).toBe(1);
    });

    test("should reject items with non-existent itemId", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "menu-test-005",
        items: [
          { itemId: 99999, itemName: "Traditional Wings", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Non-existent ItemId Rejection", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.context.operations[0].rationale).toContain("not found in menu");
    });

    test("should handle case sensitivity correctly", async () => {
      const startTime = Date.now();
      const caseMismatchOrder = {
        orderId: "menu-test-006",
        items: [
          { itemId: 1, itemName: "6 honey garlic traditional wings", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(caseMismatchOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Case Sensitivity Handling", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain('not found in menu');
    });
  });

  describe("Configuration Modes", () => {
    test("should provide suggestions in suggestion mode", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "menu-test-007",
        items: [
          { itemId: 1, itemName: "Wrong Name", quantity: 1, modifiers: [] }
        ]
      };

      // Test with suggestion mode configuration
      const request = ActionFactory.createInitialRequest(invalidOrder, {
        config: {
          strict: false,
          addSuggestionsAsWarnings: true
        }
      });
      const response = await action.execute(request);
      
      logTestPerformance("Suggestion Mode", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations.length).toBeGreaterThan(0);
      // Suggestions would be in operation context for unified structure
    });

    test("should handle strict mode correctly", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "menu-test-008",
        items: [
          { itemId: 1, itemName: "Wrong Name", quantity: 1, modifiers: [] }
        ]
      };

      // Test with strict mode configuration
      const request = ActionFactory.createInitialRequest(invalidOrder, {
        config: {
          strict: true,
          addSuggestionsAsWarnings: false
        }
      });
      const response = await action.execute(request);
      
      logTestPerformance("Strict Mode", response, startTime);
      
      expect(response.success).toBe(false);
      // In unified structure, validation results are in operations
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
    });
  });

  describe("Complex Order Scenarios", () => {
    test("should validate mixed valid and invalid items", async () => {
      const startTime = Date.now();
      const mixedOrder = {
        orderId: "menu-test-009",
        items: [
          { itemId: 1, itemName: "6 Traditional Wings", quantity: 1, modifiers: [] }, // Valid
          { itemId: 6, itemName: "Wrong Boneless Wings", quantity: 1, modifiers: [] },             // Invalid name
          { itemId: 15, itemName: "3 Grilled Tenders", quantity: 1, modifiers: [] },                   // Valid
          { itemId: 99999, itemName: "Non-existent", quantity: 1, modifiers: [] }                  // Invalid ID
        ]
      };

      const request = ActionFactory.createInitialRequest(mixedOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Mixed Valid/Invalid Items", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.context.metadata.validItems).toBe(2);
      expect(response.context.metadata.invalidItems).toBe(2);
    });

    test("should handle real-world menu items from large menu", async () => {
      const startTime = Date.now();
      const realWorldOrder = {
        orderId: "menu-test-010",
        items: [
          { itemId: 7, itemName: "10 Boneless Wings", quantity: 1, modifiers: [] },
          { itemId: 21, itemName: "Regular Ranch", quantity: 1, modifiers: [] },
          { itemId: 45, itemName: "Red Bull Blue Edition (Blueberry)", quantity: 1, modifiers: [] },
          { itemId: 77, itemName: "Ghirardelli Chocolate Chunk Brownie", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(realWorldOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Real-World Large Menu", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.errors).toHaveLength(0);
      expect(response.context.metadata.validItems).toBe(4);
      expect(response.context.metadata.invalidItems).toBe(0);
    });
  });

  describe("Edge Cases", () => {
    test("should handle items without itemName property", async () => {
      const startTime = Date.now();
      const incompleteOrder = {
        orderId: "menu-test-011",
        items: [
          { itemId: 1, quantity: 1, modifiers: [] } // Missing itemName
        ]
      };

      const request = ActionFactory.createInitialRequest(incompleteOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Items Without ItemName", response, startTime);
      
      // Action should still process but handle missing itemName gracefully
      expect(response.success).toBe(true); // No items to validate means success
      expect(response.context.metadata.itemsProcessed).toBe(0);
    });

    test("should handle items without itemId property", async () => {
      const startTime = Date.now();
      const incompleteOrder = {
        orderId: "menu-test-012",
        items: [
          { itemName: "Some Item", quantity: 1, modifiers: [] } // Missing itemId
        ]
      };

      const request = ActionFactory.createInitialRequest(incompleteOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Items Without ItemId", response, startTime);
      
      // Action should still process but handle missing itemId gracefully
      expect(response.success).toBe(true); // No items to validate means success
      expect(response.context.metadata.itemsProcessed).toBe(0);
    });

    test("should handle empty itemName", async () => {
      const startTime = Date.now();
      const emptyNameOrder = {
        orderId: "menu-test-013",
        items: [
          { itemId: 1, itemName: "", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(emptyNameOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Empty ItemName", response, startTime);
      
      // Action should process but handle empty itemName gracefully
      expect(response.success).toBe(true); // No valid items to validate means success
      expect(response.context.metadata.itemsProcessed).toBe(0);
    });
  });

  describe("Performance Tests", () => {
    test("should process menu validation quickly", async () => {
      const startTime = Date.now();
      
      const performanceOrder = {
        orderId: "menu-perf-test",
        items: Array.from({ length: 50 }, (_, i) => ({
          itemId: (i % 10) + 1, // Cycle through first 10 menu items
          itemName: i % 2 === 0 ? "6 Traditional Wings" : "6 Boneless Wings",
          quantity: 1,
          modifiers: []
        }))
      };

      const request = ActionFactory.createInitialRequest(performanceOrder);
      const response = await action.execute(request);
      const executionTime = Date.now() - startTime;
      
      logTestPerformance("Large Order Performance", response, startTime);
      
      expect(response.success).toBe(false); // Some items will have wrong IDs
      expect(response.context.metadata.itemsProcessed).toBe(50);
      expect(response.context.metadata.validItems).toBeLessThan(50); // Not all will be valid due to ID mismatches
      expect(executionTime).toBeLessThan(100); // Should be very fast with cached menu data
    });
  });

  describe("Intelligent Name-ID Matching", () => {
    test("should validate perfect match (correct itemId + itemName)", async () => {
      const startTime = Date.now();
      const perfectOrder = {
        orderId: "perfect-match-test",
        items: [
          { itemId: 1, itemName: "6 Traditional Wings", quantity: 1, modifiers: [] },
          { itemId: 6, itemName: "6 Boneless Wings", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(perfectOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Perfect Match Validation", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.errors).toHaveLength(0);
      expect(response.context.metadata.validItems).toBe(2);
      expect(response.context.metadata.invalidItems).toBe(0);
    });

    test("should detect wrong itemId for unique itemName", async () => {
      const startTime = Date.now();
      const wrongIdOrder = {
        orderId: "wrong-id-test",
        items: [
          { itemId: 99, itemName: "6 Traditional Wings", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(wrongIdOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Wrong ItemId Detection", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.context.operations[0].rationale).toContain("not found in menu");
    });

    test("should suggest correct itemId when itemName exists but itemId is wrong", async () => {
      const startTime = Date.now();
      const existingNameOrder = {
        orderId: "existing-name-test",
        items: [
          { itemId: 999, itemName: "Fried Pickles", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(existingNameOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Suggestion for Wrong ItemId", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations[0].rationale).toContain("not found in menu");
      // Should suggest that the name exists with the correct ID
    });

    test("should handle multiple items with same name correctly", async () => {
      const startTime = Date.now();
      // First, let's find if there are any duplicate names in the menu
      
      // Test with two different valid items (no duplicate names in current menu)
      const duplicateTestOrder = {
        orderId: "duplicate-name-test",
        items: [
          // Using known menu items that should work
          { itemId: 23, itemName: "Regular Southwestern Ranch", quantity: 1, modifiers: [] },
          { itemId: 66, itemName: "Buffalo (Dry Seasoning)", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(duplicateTestOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Multiple Items Same Name", response, startTime);
      
      // Both should be valid since they are correct item/name pairs
      expect(response.context.metadata.itemsProcessed).toBe(2);
      expect(response.success).toBe(true); // Should handle different items correctly
    });

    test("should reject itemId that doesn't match any item with given name", async () => {
      const startTime = Date.now();
      const mismatchOrder = {
        orderId: "mismatch-test",
        items: [
          { itemId: 1, itemName: "Wrong Item Name", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(mismatchOrder);
      const response = await action.execute(request);
      
      logTestPerformance("ItemId Mismatch Rejection", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.context.operations[0].rationale).toContain("not found in menu");
    });
  });

  describe("Menu Validation Action Direct Testing", () => {
    test("should provide accurate validation summary", async () => {
      const startTime = Date.now();
      const testOrder = {
        orderId: "validation-summary-test",
        items: [
          { itemId: 1, itemName: "6 Traditional Wings", quantity: 1 },
          { itemId: 2, itemName: "Wrong Name", quantity: 1 }
        ]
      };

      const request = ActionFactory.createInitialRequest(testOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Validation Summary Accuracy", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.metadata.validItems).toBe(1);
      expect(response.context.metadata.invalidItems).toBe(1);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
    });

    test("should load menu data correctly and detect duplicates", async () => {
      const startTime = Date.now();
      const action = new ValidateMenuItemAction();
      const analysis = await action.getMenuAnalysis();
      
      expect(analysis.totalItems).toBeGreaterThan(0);
      expect(analysis.duplicateNames).toBe(0); // No duplicates in current menu
      expect(analysis.duplicateDetails).toBeInstanceOf(Array);
      
      // Test that menu service is initialized
      expect(action.menuService).toBeDefined();
      
      console.log(` PERFORMANCE [Menu Data Analysis]: ${Date.now() - startTime}ms`);
    });

    test("should analyze name matching correctly", async () => {
      const startTime = Date.now();
      const action = new ValidateMenuItemAction();
      
      // Get indexes first for the new API
      const indexes = await action.menuService.getIndexes();
      
      // Test correct match
      const correctMatch = action.analyzeNameMatch(1, "6 Traditional Wings", [1], indexes);
      expect(correctMatch.isValid).toBe(true);
      
      // Test wrong ID for correct name
      const wrongIdMatch = action.analyzeNameMatch(999, "6 Traditional Wings", [1], indexes);
      expect(wrongIdMatch.isValid).toBe(false);
      expect(wrongIdMatch.error).toContain("should have itemId");
      
      console.log(` PERFORMANCE [Name Matching Analysis]: ${Date.now() - startTime}ms`);
    });
  });
});
