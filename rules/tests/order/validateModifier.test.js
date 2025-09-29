/**
 * Modifier Validation Tests
 * Tests the modifier validation functionality using universal interface
 * Converted from legacy rule engine to universal request/response format
 */

const ValidateModifierAction = require("../../domain/order/actions/validateModifierAction");
const { ActionFactory } = require("../../core/interfaces/IAction");

describe("Modifier Validation Action", () => {
  let action;

  beforeEach(() => {
    // Setup fresh action for each test
    action = new ValidateModifierAction();
  });

  // Helper function to log performance metrics
  const logTestPerformance = (testName, response, startTime) => {
    const totalTime = Date.now() - startTime;
    const validationTime = response.stage?.processingTime || response.processingTime || 0;
    
    console.log(` PERFORMANCE [${testName}]:`);
    console.log(`   Total Test Time: ${totalTime}ms`);
    console.log(`   Modifier Validation Time: ${validationTime}ms`);
    console.log(`   Items Processed: ${response.context.metadata.itemsProcessed || 0}`);
    console.log(`   Modifiers Processed: ${response.context.metadata.modifiersProcessed || 0}`);
    console.log(`   Validation Rate: ${response.context.metadata.validationRate || 0} modifiers/sec`);
  };

  describe("Action Execution", () => {
    test("should execute modifier validation independently", async () => {
      const startTime = Date.now();
      const validOrder = {
        orderId: "modifier-test-001",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 4, selected: "Ranch" },
              { modifierId: 3, selected: "Sauce on Side" }
            ]
          },
          { 
            itemId: 6, 
            itemName: "6 Boneless Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 4, selected: "Bleu Cheese" }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Modifier Validation Independence", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsProcessed).toBe(2);
      expect(response.context.metadata.modifiersProcessed).toBe(3);
      expect(response.context.metadata.validatedItems).toHaveLength(2);
      expect(response.context.metadata.invalidItems).toHaveLength(0);
    });

    test("should skip validation if no items have modifiers", async () => {
      const orderWithoutModifiers = {
        orderId: "modifier-test-002",
        items: [
          { itemId: 1, itemName: "6 Traditional Wings", quantity: 1, modifiers: [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(orderWithoutModifiers);
      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.modifiersProcessed).toBe(0);
    });
  });

  describe("Valid Modifier Scenarios", () => {
    test("should validate correct modifier IDs and options", async () => {
      const startTime = Date.now();
      const validOrder = {
        orderId: "modifier-test-003",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 4, selected: "Ranch" },
              { modifierId: 4, selected: "Carrots" },
              { modifierId: 3, selected: "Sauce on Side" }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Valid Modifier IDs and Options", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.modifiersProcessed).toBe(3);
      expect(response.context.metadata.validatedItems).toHaveLength(1);
      expect(response.context.metadata.invalidItems).toHaveLength(0);
    });

    test("should handle items without modifiers", async () => {
      const startTime = Date.now();
      const mixedOrder = {
        orderId: "modifier-test-004",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 4, selected: "Ranch" }
            ]
          },
          { 
            itemId: 22, 
            itemName: "Chips and Salsa", 
            quantity: 1, 
            modifiers: [] // No modifiers for this item
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(mixedOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Mixed Items With/Without Modifiers", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsProcessed).toBe(2);
      expect(response.context.metadata.modifiersProcessed).toBe(1);
      expect(response.context.metadata.validatedItems).toHaveLength(2);
    });
  });

  describe("Invalid Modifier Scenarios", () => {
    test("should reject invalid modifier IDs for item", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "modifier-test-005",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 999, selected: "Ranch" } // Invalid modifier ID
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Invalid Modifier ID Rejection", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.invalidItems).toHaveLength(1);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.context.operations[0].rationale).toContain("not available for item");
    });

    test("should reject invalid options for valid modifier ID", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "modifier-test-006",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 1, selected: "Invalid Option" } // Valid modifier ID, invalid option
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Invalid Option Rejection", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.invalidItems).toHaveLength(1);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.context.operations[0].rationale).toContain("not available for item");
    });

    test("should reject wrong modifier ID for correct option", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "modifier-test-007",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 2, selected: "Ranch" } // Ranch should be modifierId 4, not 2
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Wrong Modifier ID for Correct Option", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.invalidItems).toHaveLength(1);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.context.operations[0].rationale).toContain("not available for item");
    });

    test("should reject modifiers for non-existent items", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "modifier-test-008",
        items: [
          { 
            itemId: 9999, 
            itemName: "Non-existent Item", 
            quantity: 1, 
            modifiers: [
              { modifierId: 4, selected: "Ranch" }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Non-existent Item Rejection", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.invalidItems).toHaveLength(1);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
      expect(response.context.operations[0].rationale).toContain("not available for item");
    });
  });

  describe("Configuration Modes", () => {
    test("should provide suggestions in suggestion mode", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "modifier-test-009",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 999, selected: "Ranch" } // Invalid ID but valid option
            ]
          }
        ]
      };

      // Test suggestion mode configuration
      const request = ActionFactory.createInitialRequest(invalidOrder, {
        config: {
          strict: false,
          addSuggestionsAsWarnings: true
        }
      });
      const response = await action.execute(request);
      
      logTestPerformance("Suggestion Mode Configuration", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.operations.length).toBeGreaterThan(0);
      // Suggestions would be in operation context for unified structure
    });

    test("should handle strict mode correctly", async () => {
      const startTime = Date.now();
      const invalidOrder = {
        orderId: "modifier-test-010",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 4, selected: "ranch" } // Wrong case - should be "Ranch"
            ]
          }
        ]
      };

      // Test strict mode configuration
      const request = ActionFactory.createInitialRequest(invalidOrder, {
        config: {
          strict: true,
          addSuggestionsAsWarnings: false
        }
      });
      const response = await action.execute(request);
      
      logTestPerformance("Strict Mode Configuration", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.invalidItems).toHaveLength(1);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
    });
  });

  describe("Complex Modifier Scenarios", () => {
    test("should validate multiple modifiers per item", async () => {
      const startTime = Date.now();
      const complexOrder = {
        orderId: "modifier-test-011",
        items: [
          { 
            itemId: 1, // 6 Traditional Wings - simpler item with known modifiers
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 4, selected: "Ranch" },             // Dips & Veggies
              { modifierId: 4, selected: "Bleu Cheese" },       // Dips & Veggies 
              { modifierId: 4, selected: "Carrots" },           // Dips & Veggies
              { modifierId: 3, selected: "Sauce on Side" }      // Special Request
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(complexOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Multiple Modifiers Per Item", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.modifiersProcessed).toBe(4);
      expect(response.context.metadata.validatedItems).toHaveLength(1);
      expect(response.context.metadata.invalidItems).toHaveLength(0);
    });


    test("should handle mixed valid and invalid modifiers", async () => {
      const mixedOrder = {
        orderId: "modifier-test-012",
        items: [
          { 
            itemId: 1, 
            itemName: "6 Traditional Wings", 
            quantity: 1, 
            modifiers: [
              { modifierId: 4, selected: "Ranch" },           // Valid
              { modifierId: 1, selected: "Invalid Option" },   // Invalid option
              { modifierId: 3, selected: "Sauce on Side" }    // Valid
            ]
          }
        ]
      };

      const startTime = Date.now();
      const request = ActionFactory.createInitialRequest(mixedOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Mixed Valid and Invalid Modifiers", response, startTime);
      
      expect(response.success).toBe(false);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.modifiersProcessed).toBe(3);
      expect(response.context.metadata.invalidItems).toHaveLength(1);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
    });
  });

  describe("Performance Tests", () => {
    test("should process modifier validation quickly", async () => {
      const startTime = Date.now();
      
      // Create a large order with many modifiers
      const largeOrder = {
        orderId: "modifier-test-performance",
        items: Array(20).fill().map((_, i) => ({
          itemId: 1,
          itemName: "6 Traditional Wings",
          quantity: 1,
          modifiers: [
            { modifierId: 4, selected: "Ranch" },
            { modifierId: 4, selected: "Carrots" },
            { modifierId: 3, selected: "Sauce on Side" }
          ]
        }))
      };

      const request = ActionFactory.createInitialRequest(largeOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Large Order Modifier Performance", response, startTime);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsProcessed).toBe(20);
      expect(response.context.metadata.modifiersProcessed).toBe(60); // 20 items * 3 modifiers each
      expect(response.context.metadata.validatedItems).toHaveLength(20);
      expect(response.context.metadata.invalidItems).toHaveLength(0);
      
      // Validate performance is excellent (cached menu data = very fast)
      const processingTime = response.stage?.processingTime || response.processingTime || 0;
      expect(processingTime).toBeLessThan(50); // Should be very fast
    });
  });

  describe("Modifier Action Direct Testing", () => {
    test("should provide accurate validation summary", async () => {
      const startTime = Date.now();
      const testOrder = {
        orderId: "validation-summary-test",
        items: [
          { 
            itemId: 1,
            itemName: "6 Traditional Wings",
            quantity: 1,
            modifiers: [
              { modifierId: 4, selected: "Ranch" },     // Valid
              { modifierId: 999, selected: "Invalid" }  // Invalid ID
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(testOrder);
      const response = await action.execute(request);
      
      logTestPerformance("Validation Summary Accuracy", response, startTime);
      
      // The action uses default config which has strict: true, so it generates errors for invalid modifiers
      expect(response.success).toBe(false);
      expect(response.context.metadata.itemsProcessed).toBe(1);
      expect(response.context.metadata.modifiersProcessed).toBe(2);
      expect(response.context.metadata.validatedItems).toHaveLength(0);
      expect(response.context.metadata.invalidItems).toHaveLength(1);
      expect(response.context.operations.length).toBeGreaterThan(0);
      expect(response.context.operations[0].error).toBeDefined();
    });

  });
});
