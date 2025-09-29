# Rule Engine Testing

## 🧪 Jest Test Suite

This directory contains a professional-grade testing setup using Jest for the dependency-based rule engine.

## 🚀 Quick Start

```bash
# Run all tests
npm test

# Run tests in watch mode (for development)
npm run test:watch

# Run tests with coverage report
npm run test:coverage

# Run only rule engine tests
npm run test:rules

# Run tests for CI/CD
npm run test:ci
```

## 📁 Test Structure

```
rules/tests/
├── schemaValidation.test.js    # Schema validation tests
└── [future test files]         # Additional rule tests
```

## 🎯 Test Categories

### Schema Validation Tests
- **Valid Order Structures**: Tests for properly formatted orders
- **Invalid Order Structures**: Tests for malformed input
- **Missing Required Fields**: Tests for incomplete orders
- **Invalid Field Types**: Tests for type validation
- **Invalid Modifiers**: Tests for modifier validation
- **Configuration Modes**: Tests for strict/lenient modes
- **Performance Tests**: Tests for speed requirements
- **Engine Statistics**: Tests for metadata and stats

## 📊 Coverage Requirements

The test suite maintains high code coverage standards:
- **Statements**: 80%+
- **Branches**: 80%+
- **Functions**: 80%+
- **Lines**: 80%+

## 🧩 Adding New Rule Tests

When adding new rules, create test files following this pattern:

```javascript
// rules/tests/yourNewRule.test.js
const { DependencyRuleEngine } = require("../engine/dependencyRuleEngine");
const YourNewAction = require("../actions/yourNewAction");
const { YourNewRule } = require("../definitions/yourNewRule");

describe("Your New Rule", () => {
  let engine;

  beforeEach(() => {
    engine = new DependencyRuleEngine({ debugMode: false });
    engine.registerActionHandler("YOUR_ACTION", new YourNewAction());
    engine.addRule(YourNewRule);
  });

  test("should handle basic functionality", async () => {
    const result = await engine.processOrder(testData);
    expect(result.success).toBe(true);
  });
});
```

## 🔧 Test Configuration

Jest configuration is in `jest.config.js` at the project root. Key settings:
- **Test Environment**: Node.js
- **Test Pattern**: `*.test.js` files
- **Coverage Thresholds**: 80% for all metrics
- **Timeout**: 10 seconds for async operations

## 📈 Performance Testing

All tests include performance assertions:
- Individual order processing: <100ms
- Batch operations: <50ms per item
- Memory usage: Monitored for leaks

## 🎭 Mock Data

Test data follows your exact schema:
```javascript
const validOrder = {
  "orderId": "order-12345",
  "items": [
    {
      "itemId": 6,
      "itemName": "Blueberry Muffin",
      "quantity": 1,
      "modifiers": [
        { "modifierId": 1, "selected": "Yes" }
      ]
    }
  ]
};
```

## 🏆 Best Practices

1. **Test Isolation**: Each test is independent
2. **Clear Naming**: Test names describe the exact scenario
3. **Comprehensive Coverage**: Test happy path, edge cases, and errors
4. **Performance Checks**: Include timing assertions
5. **Real Data**: Use actual order formats from your system
6. **Dependency Testing**: Verify rule execution order

Happy testing! 🚀
