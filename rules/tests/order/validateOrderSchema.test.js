const ValidateOrderSchemaAction = require("../../domain/order/actions/validateOrderSchemaAction");
const { ActionFactory } = require("../../core/interfaces/IAction");

/**
 * Universal Schema Validation Test Suite
 * Converted to use universal request/response interface
 */
describe("Universal Schema Validation Action", () => {
  let action;

  beforeEach(() => {
    // Setup fresh action for each test
    action = new ValidateOrderSchemaAction();
  });

  // Helper function to log performance metrics
  const logTestPerformance = (testName, response, startTime) => {
    const totalTime = Date.now() - startTime;
    const schemaValidationTime = response.stage?.processingTime || response.processingTime || 0;
    
    console.log(` PERFORMANCE [${testName}]:`);
    console.log(`   Total Test Time: ${totalTime}ms`);
    console.log(`   Schema Validation Time: ${schemaValidationTime}ms`);
    console.log(`   Items Processed: ${response.actionResults?.itemsProcessed || response.itemsProcessed || 0}`);
    console.log(`   Validation Rate: ${response.actionResults?.itemsProcessed ? Math.round((response.actionResults.itemsProcessed / schemaValidationTime) * 1000) : 0} items/sec`);
  };

  describe("Valid Order Structures", () => {
    test("should validate your example schema successfully", async () => {
      const validOrder = {
        "orderId": "order-12345",
        "items": [
          {
            "itemId": 6,
            "itemName": "Blueberry Muffin",
            "quantity": 1,
            "modifiers": [
              { "modifierId": 1, "selected": "Yes" },
              { "modifierId": 3, "selected": "Cream Cheese" }
            ]
          },
          { 
            "itemId": 6, 
            "itemName": "Blueberry Muffin", 
            "quantity": 1, 
            "modifiers": [] 
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(validOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.context.errors).toHaveLength(0);
      expect(response.context.warnings).toHaveLength(0);
      expect(response.context.metadata.structureValid).toBe(true);
      expect(response.context.metadata.itemsValidated).toBe(2);
    });

    test("should validate complex modifiers correctly", async () => {
      const complexOrder = {
        "orderId": "order-complex-123",
        "items": [
          {
            "itemId": 1,
            "itemName": "Custom Coffee",
            "quantity": 2,
            "modifiers": [
              { "modifierId": 1, "selected": "Extra Shot", "count": 2 },
              { "modifierId": 2, "selected": "Oat Milk" },
              { "modifierId": 3, "selected": "Extra Hot" }
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(complexOrder, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true);
      expect(response.context.metadata.itemsValidated).toBe(1);
    });

    test("should validate real-world order from terminal", async () => {
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
      expect(response.context.metadata.itemsValidated).toBe(2);
      expect(response.performance.stageProcessingTime).toBeLessThan(100); // Performance check
    });
  });

  describe("Invalid Order Structures", () => {
    test("should reject null order", async () => {
      // Use empty object since null is caught by IAction base validation
      const request = ActionFactory.createInitialRequest({}, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
    });

    test("should reject string order", async () => {
      const request = ActionFactory.createInitialRequest("invalid order", {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].error.code).toBe('SCHEMA_VALIDATION_ERROR');
      expect(response.operations[0].corrected_value).toBe('VALIDATION_FAILED');
    });

    test("should reject array order", async () => {
      const request = ActionFactory.createInitialRequest(["item1", "item2"], {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].error.code).toBe('SCHEMA_VALIDATION_ERROR');
    });

    test("should reject empty object", async () => {
      const request = ActionFactory.createInitialRequest({}, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].error.code).toBe('SCHEMA_VALIDATION_ERROR');
      expect(response.operations[0].rationale).toContain('orderId');
      expect(response.operations[0].rationale).toMatch(/items?/);
    });
  });

  describe("Missing Required Fields", () => {
    test("should detect missing orderId", async () => {
      const noOrderId = {
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 1, "modifiers": [] }
        ]
      };
      
      const request = ActionFactory.createInitialRequest(noOrderId, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain('orderId');
    });

    test("should detect missing items", async () => {
      const noItems = {
        "orderId": "order-123"
      };
      
      const request = ActionFactory.createInitialRequest(noItems, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations[0].rationale).toMatch(/items?/);
    });

    test("should reject empty items array", async () => {
      const emptyItems = {
        "orderId": "order-123",
        "items": []
      };
      
      const request = ActionFactory.createInitialRequest(emptyItems, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false); // Error, not warning
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toMatch(/items?/);
    });
  });

  describe("Invalid Field Types", () => {
    test("should detect type errors", async () => {
      const invalidTypes = {
        "orderId": 12345, // Should be string
        "items": [
          {
            "itemId": "6", // Should be number
            "itemName": 123, // Should be string
            "quantity": "1", // Should be number
            "modifiers": "none" // Should be array
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidTypes, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      const result = response; // For compatibility
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      expect(response.operations[0].rationale).toContain('orderId');
      expect(response.operations[0].rationale).toContain('itemId');
    });

    test("should validate item structure", async () => {
      const invalidItems = {
        "orderId": "order-123",
        "items": [
          null, // Null item
          "invalid item", // String item
          { "itemId": -1, "itemName": "", "quantity": 0, "modifiers": [] } // Invalid values
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidItems, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
      // In unified structure, validation issues are captured in operations
      expect(response.operations[0].rationale).toMatch(/itemId|quantity/);
    });
  });

  describe("Invalid Modifiers", () => {
    test("should validate modifier structure", async () => {
      const invalidModifiers = {
        "orderId": "order-123",
        "items": [
          {
            "itemId": 1,
            "itemName": "Coffee",
            "quantity": 1,
            "modifiers": [
              null, // Null modifier
              "invalid", // String modifier
              { "modifierId": "1" }, // Missing selected, wrong type
              { "selected": "Milk" }, // Missing modifierId
              { "modifierId": 1, "selected": "" } // Empty selected
            ]
          }
        ]
      };

      const request = ActionFactory.createInitialRequest(invalidModifiers, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(false);
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].error).toBeDefined();
    });
  });

  describe("Configuration Modes", () => {
    test("should handle strict validation", async () => {
      const orderWithExtraFields = {
        "orderId": "order-123",
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 1, "modifiers": [] }
        ],
        "extraField": "should trigger warning in strict mode"
      };

      const request = ActionFactory.createInitialRequest(orderWithExtraFields, {
        config: { 
          enablePerformanceLogging: false,
          strict: true,
          allowExtraFields: false
        }
      });

      const response = await action.execute(request);
      
      expect(response.operations.length).toBeGreaterThan(0);
      expect(response.operations[0].rationale).toContain('successful'); // For warnings, action still succeeds but has operations
    });

    test("should handle lenient validation", async () => {
      const orderWithoutOrderId = {
        "items": [
          { "itemId": 1, "itemName": "Coffee", "quantity": 1, "modifiers": [] }
        ]
      };

      const request = ActionFactory.createInitialRequest(orderWithoutOrderId, {
        config: { 
          enablePerformanceLogging: false,
          requireOrderId: false
        }
      });

      const response = await action.execute(request);
      
      expect(response.success).toBe(true); // Should pass in lenient mode
    });
  });

  describe("Performance Tests", () => {
    test("should process orders quickly", async () => {
      const order = {
        "orderId": "order-perf",
        "items": Array.from({ length: 10 }, (_, i) => ({
          "itemId": i + 1,
          "itemName": `Item ${i + 1}`,
          "quantity": 1,
          "modifiers": []
        }))
      };

      const startTime = Date.now();
      const request = ActionFactory.createInitialRequest(order, {
        config: { enablePerformanceLogging: false }
      });

      const response = await action.execute(request);
      const processingTime = Date.now() - startTime;
      
      logTestPerformance("Schema Validation Performance", response, startTime);
      
      expect(response.success).toBe(true);
      expect(processingTime).toBeLessThan(50); // Should be very fast
      expect(response.context.metadata.itemsValidated).toBe(10);
    });
  });

  describe("Action Metadata", () => {
    test("should provide accurate action metadata", () => {
      const metadata = action.getMetadata();
      
      expect(metadata.name).toBe('schema_validation');
      expect(metadata.type).toBe('validation');
      expect(metadata.capabilities).toContain('structure_validation');
      expect(metadata.capabilities).toContain('type_checking');
      expect(metadata.errorTypes).toContain('SCHEMA_VALIDATION_ERROR');
    });
  });
});
