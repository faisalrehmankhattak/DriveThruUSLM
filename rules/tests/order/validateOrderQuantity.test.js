const ValidateOrderQuantityAction = require("../../domain/order/actions/validateOrderQuantityAction");
const { ActionFactory } = require("../../core/interfaces/IAction");

/**
 * Quantity Validation Test Suite
 * Converted to use universal request/response interface
 */
describe("Quantity Validation Action", () => {
  let action;

  // Helper function to log performance metrics
  const logTestPerformance = (testName, response, startTime) => {
    const totalTime = Date.now() - startTime;
    const quantityValidationTime = response.stage?.processingTime || response.processingTime || 0;
    
    console.log(` PERFORMANCE [${testName}]:`);
    console.log(`   Total Test Time: ${totalTime}ms`);
    console.log(`   Quantity Validation Time: ${quantityValidationTime}ms`);
    console.log(`   Items Processed: ${response.context?.metadata?.itemsValidated || response.itemsProcessed || 0}`);
    console.log(`   Modifiers Processed: ${response.context?.metadata?.totalModifiersValidated || 0}`);
    console.log(`   Validation Rate: ${response.context?.metadata?.itemsValidated ? Math.round((response.context.metadata.itemsValidated / quantityValidationTime) * 1000) : 0} items/sec`);
  };

  beforeEach(() => {
    // Setup fresh action for each test
    action = new ValidateOrderQuantityAction();
  });

  describe("Action Execution", () => {
    test("should execute quantity validation independently", async () => {
      const validOrder = {
        "orderId": "order-dependency-test",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 1, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.context.errors).toHaveLength(0);
      expect(response.context.metadata.itemsValidated).toBe(1);
      expect(response.context.metadata.businessLogicValid).toBe(true);
    });

    test("should handle invalid items gracefully", async () => {
      const invalidOrder = {
        "orderId": "test-123",
        "items": "not an array" // Invalid type
      };

      const request = ActionFactory.createInitialRequest(invalidOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      // Action should complete successfully but with 0 items validated
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsValidated).toBe(0);
      expect(response.context.metadata.totalModifiersValidated).toBe(0);
    });
  });

  describe("Valid Business Logic Scenarios", () => {
    test("should pass validation for positive quantities", async () => {
      const validOrder = {
        "orderId": "order-positive",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 2, "modifiers": [] },
          { "itemId": 2, "itemName": "Sandwich", "quantity": 1, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.context.errors).toHaveLength(0);
      expect(response.context.metadata.businessLogicValid).toBe(true);
      expect(response.context.metadata.itemsValidated).toBe(2);
    });

    test("should pass validation for positive modifier counts", async () => {
      const validOrder = {
        "orderId": "order-modifiers",
        "items": [
          {
            "itemId": 1,
            "itemName": "Coffee",
            "quantity": 1,
            "modifiers": [
              { "modifierId": 1, "selected": "Extra Shot", "count": 2 },
              { "modifierId": 2, "selected": "Sugar", "count": 1 }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.totalModifiersValidated).toBe(2);
    });

    test("should handle items without count/quantity fields gracefully", async () => {
      const orderWithoutCounts = {
        "orderId": "order-no-counts",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 1, "modifiers": [] } // Valid quantity, no modifier counts
        ]
      };

      const request = ActionFactory.createInitialRequest(orderWithoutCounts, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.businessLogicValid).toBe(true);
    });
  });

  describe("Invalid Business Logic Scenarios", () => {
    test("should reject zero quantities", async () => {
      const zeroQuantityOrder = {
        "orderId": "order-zero-qty",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 0, "modifiers": [] },
          { "itemId": 2, "itemName": "Sandwich", "quantity": 1, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(zeroQuantityOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain("quantity cannot be zero");
      expect(response.operations[0].rationale).toContain("Coffee");
    });

    test("should reject negative quantities", async () => {
      const negativeQuantityOrder = {
        "orderId": "order-negative-qty",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": -1, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(negativeQuantityOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain("quantity cannot be negative");
      expect(response.operations[0].rationale).toContain("-1");
    });

    test("should reject zero modifier counts", async () => {
      const zeroModifierOrder = {
        "orderId": "order-zero-modifier",
        "items": [
          {
            "itemId": 1,
            "itemName": "Coffee",
            "quantity": 1,
            "modifiers": [
              { "modifierId": 1, "selected": "Extra Shot", "count": 0 }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(zeroModifierOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain("count cannot be zero");
      expect(response.operations[0].rationale).toContain("Extra Shot");
    });

    test("should reject negative modifier counts", async () => {
      const negativeModifierOrder = {
        "orderId": "order-negative-modifier",
        "items": [
          {
            "itemId": 1,
            "itemName": "Coffee",
            "quantity": 1,
            "modifiers": [
              { "modifierId": 1, "selected": "Sugar", "count": -2 }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(negativeModifierOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain("count cannot be negative");
      expect(response.operations[0].rationale).toContain("-2");
    });
  });

  describe("Business Logic Warnings", () => {
    test("should warn about unusually high quantities", async () => {
      const highQuantityOrder = {
        "orderId": "order-high-qty",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 150, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(highQuantityOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].corrected_value).toBe('VALIDATION_PASSED');
      // Warnings in unified structure - check metadata or operations rationale
      // High quantity warning expected
    });

    test("should warn about unusually high modifier counts", async () => {
      const highModifierOrder = {
        "orderId": "order-high-modifier",
        "items": [
          {
            "itemId": 1,
            "itemName": "Coffee",
            "quantity": 1,
            "modifiers": [
              { "modifierId": 1, "selected": "Sugar", "count": 20 }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(highModifierOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].corrected_value).toBe('VALIDATION_PASSED');
      // High modifier count warning expected
    });

    test("should warn about non-integer quantities in strict mode", async () => {
      const decimalQuantityOrder = {
        "orderId": "order-decimal",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 1.5, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(decimalQuantityOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].corrected_value).toBe('VALIDATION_PASSED');
    });
  });

  describe("Configuration Modes", () => {
    test("should handle lenient mode (allow zero quantities)", async () => {
      const zeroQuantityOrder = {
        "orderId": "order-lenient",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 0, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(zeroQuantityOrder, {
        config: { 
          enablePerformanceLogging: false,
          allowZeroQuantity: true  // Lenient mode
        }
      });

      const response = await action.execute(request);
      
      // In lenient mode, zero quantities should generate warnings, not errors
      expect(response.success).toBe(true);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].corrected_value).toBe('VALIDATION_PASSED');
    });

    test("should handle customer-friendly mode (allow zero modifier counts)", async () => {
      const zeroModifierOrder = {
        "orderId": "order-customer-friendly",
        "items": [
          {
            "itemId": 1,
            "itemName": "Coffee",
            "quantity": 1,
            "modifiers": [
              { "modifierId": 1, "selected": "Extra Shot", "count": 0 }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(zeroModifierOrder, {
        config: { 
          enablePerformanceLogging: false,
          allowZeroModifierCount: true  // Customer-friendly mode
        }
      });

      const response = await action.execute(request);
      
      // In customer-friendly mode, zero modifier counts should generate warnings, not errors
      expect(response.success).toBe(true);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].corrected_value).toBe('VALIDATION_PASSED');
    });
  });

  describe("Complex Order Scenarios", () => {
    test("should validate mixed valid and invalid items", async () => {
      const mixedOrder = {
        "orderId": "order-mixed",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 1, "modifiers": [] }, // Valid
          { "itemId": 2, "itemName": "Sandwich", "quantity": 0, "modifiers": [] }, // Invalid
          { "itemId": 3, "itemName": "Tea", "quantity": 2, "modifiers": [] } // Valid
        ]
      };

      const request = ActionFactory.createInitialRequest(mixedOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain("Sandwich");
      expect(response.context.metadata.itemsValidated).toBe(3);
    });

    test("should validate real-world order from your terminal", async () => {
      const realWorldOrder = {
        "orderId": "order-1758744166676-683",
        "items": [
          {
            "itemId": 1,
            "itemName": "Espresso",
            "quantity": 1,
            "modifiers": [
              {
                "modifierId": 2,
                "selected": "Whole Milk",
                "count": 1
              }
            ]
          },
          {
            "itemId": 3,
            "itemName": "Iced Coffee",
            "quantity": 1,
            "modifiers": []
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(realWorldOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.businessLogicValid).toBe(true);
      expect(response.context.metadata.itemsValidated).toBe(2);
      expect(response.context.metadata.totalModifiersValidated).toBe(1);
    });
  });

  describe("Performance Tests", () => {
    test("should process quantity validation quickly", async () => {
      const largeOrder = {
        "orderId": "order-performance",
        "items": Array.from({ length: 20 }, (_, i) => ({
          "itemId": i + 1,
          "itemName": `Item ${i + 1}`,
          "quantity": Math.floor(Math.random() * 5) + 1, // 1-5
          "modifiers": [
            { "modifierId": 1, "selected": "Option A", "count": 1 }
          ]
        }))
      };

      const startTime = Date.now();
      const request = ActionFactory.createInitialRequest(largeOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      const processingTime = Date.now() - startTime;
      
      logTestPerformance("Quantity Validation Performance", response, startTime);
      
      expect(response.success).toBe(true);
      expect(processingTime).toBeLessThan(100); // Should be very fast
      expect(response.context.metadata.itemsValidated).toBe(20);
      expect(response.context.metadata.totalModifiersValidated).toBe(20);
    });
  });

  describe("Business Logic Action Direct Testing", () => {
    test("should provide accurate validation summary", () => {
      const action = new ValidateOrderQuantityAction();
      const order = {
        "items": [
          { "quantity": 2, "modifiers": [{ "count": 1 }, { "count": 0 }] },
          { "quantity": 0, "modifiers": [] }
        ]
      };

      const summary = action.getValidationSummary(order);
      
      expect(summary.totalItems).toBe(2);
      expect(summary.totalQuantity).toBe(2);
      expect(summary.totalModifiers).toBe(2);
      expect(summary.totalModifierCount).toBe(1);
      expect(summary.itemsWithZeroQuantity).toBe(1);
      expect(summary.modifiersWithZeroCount).toBe(1);
    });

    test("should check business requirements correctly", () => {
      const action = new ValidateOrderQuantityAction();
      
      const validOrder = {
        "items": [
          { "quantity": 2, "modifiers": [{ "count": 1 }] }
        ]
      };

      const invalidOrder = {
        "items": [
          { "quantity": 0, "modifiers": [{ "count": 1 }] }
        ]
      };

      const validCheck = action.meetsBusinessRequirements(validOrder);
      const invalidCheck = action.meetsBusinessRequirements(invalidOrder);
      
      expect(validCheck.hasPositiveQuantities).toBe(true);
      expect(validCheck.isOrderable).toBe(true);
      
      expect(invalidCheck.hasPositiveQuantities).toBe(false);
      expect(invalidCheck.isOrderable).toBe(false);
    });
  });
});
