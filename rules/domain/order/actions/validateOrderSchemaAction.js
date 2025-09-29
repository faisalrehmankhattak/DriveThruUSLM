/**
 * Order Schema Validation Action
 * Validates order data against expected schema structure using Business logic approach
 * Converted to Business logic createAction pattern
 */

const { createAction } = require('../../../core/adapters');

// Helper function: Validate top-level order structure
const validateOrderStructure = (order, options) => {
  const errors = [];
  const warnings = [];
  const { requireOrderId, requireItems, allowExtraFields, strict } = options;

  // Check if order is an object
  if (typeof order !== "object" || order === null) {
    errors.push("Order must be an object");
    return { errors, warnings };
  }

  // Validate orderId
  if (requireOrderId) {
    if (!order.hasOwnProperty("orderId")) {
      errors.push("Missing required field: orderId");
    } else if (typeof order.orderId !== "string") {
      errors.push("orderId must be a string");
    } else if (order.orderId.trim() === "") {
      warnings.push("orderId is empty");
    }
  }

  // Validate items array
  if (requireItems) {
    if (!order.hasOwnProperty("items")) {
      errors.push("Missing required field: items");
    } else if (!Array.isArray(order.items)) {
      errors.push("items must be an array");
    } else if (order.items.length === 0) {
      errors.push("Empty items array");
    }
  }

  // Check for extra fields in strict mode
  if (strict && !allowExtraFields) {
    const allowedFields = ["orderId", "items"];
    const extraFields = Object.keys(order).filter(key => !allowedFields.includes(key));
    if (extraFields.length > 0) {
      warnings.push(`Extra fields found: ${extraFields.join(", ")}`);
    }
  }

  return { errors, warnings };
};

// Helper function: Validate modifiers array
const validateModifiers = (modifiers, itemPrefix) => {
  const errors = [];
  const warnings = [];

  modifiers.forEach((modifier, index) => {
    const modifierPrefix = `${itemPrefix} modifier ${index + 1}`;

    // Check if modifier is an object
    if (typeof modifier !== "object" || modifier === null) {
      errors.push(`${modifierPrefix}: must be an object`);
      return;
    }

    // Validate required fields
    if (!modifier.hasOwnProperty("modifierId")) {
      errors.push(`${modifierPrefix}: missing required field 'modifierId'`);
    } else if (typeof modifier.modifierId !== "number") {
      errors.push(`${modifierPrefix}: modifierId must be a number`);
    }

    if (!modifier.hasOwnProperty("selected")) {
      errors.push(`${modifierPrefix}: missing required field 'selected'`);
    } else if (typeof modifier.selected !== "string") {
      errors.push(`${modifierPrefix}: selected must be a string`);
    } else if (modifier.selected.trim() === "") {
      warnings.push(`${modifierPrefix}: selected is empty`);
    }

    // Optional count field validation
    if (modifier.hasOwnProperty("count")) {
      if (typeof modifier.count !== "number") {
        errors.push(`${modifierPrefix}: count must be a number`);
      } else if (modifier.count <= 0) {
        errors.push(`${modifierPrefix}: count must be positive`);
      }
    }
  });

  return { errors, warnings };
};

// Helper function: Validate individual item structure
const validateItem = (item, index, options) => {
  const errors = [];
  const warnings = [];
  const { validateModifiers: shouldValidateModifiers, allowExtraFields, strict } = options;
  const itemPrefix = `Item ${index + 1}`;

  // Check if item is an object
  if (typeof item !== "object" || item === null) {
    errors.push(`${itemPrefix}: must be an object`);
    return { errors, warnings };
  }

  // Validate required fields
  const requiredFields = ["itemId", "itemName", "quantity", "modifiers"];
  
  requiredFields.forEach(field => {
    if (!item.hasOwnProperty(field)) {
      errors.push(`${itemPrefix}: missing required field '${field}'`);
    }
  });

  // Validate field types
  if (item.hasOwnProperty("itemId")) {
    if (typeof item.itemId !== "number") {
      errors.push(`${itemPrefix}: itemId must be a number`);
    } else if (item.itemId <= 0) {
      warnings.push(`${itemPrefix}: itemId should be positive (got ${item.itemId})`);
    }
  }

  if (item.hasOwnProperty("itemName")) {
    if (typeof item.itemName !== "string") {
      errors.push(`${itemPrefix}: itemName must be a string`);
    } else if (item.itemName.trim() === "") {
      warnings.push(`${itemPrefix}: itemName is empty`);
    }
  }

  if (item.hasOwnProperty("quantity")) {
    if (typeof item.quantity !== "number") {
      errors.push(`${itemPrefix}: quantity must be a number`);
    } else if (item.quantity <= 0) {
      errors.push(`${itemPrefix}: quantity must be positive (got ${item.quantity})`);
    } else if (!Number.isInteger(item.quantity)) {
      warnings.push(`${itemPrefix}: quantity should be an integer (got ${item.quantity})`);
    }
  }

  if (item.hasOwnProperty("modifiers")) {
    if (!Array.isArray(item.modifiers)) {
      errors.push(`${itemPrefix}: modifiers must be an array`);
    } else if (shouldValidateModifiers && item.modifiers.length > 0) {
      const modifierValidation = validateModifiers(item.modifiers, itemPrefix);
      errors.push(...modifierValidation.errors);
      warnings.push(...modifierValidation.warnings);
    }
  }

  // Check for extra fields in strict mode
  if (strict && !allowExtraFields) {
    const allowedFields = ["itemId", "itemName", "quantity", "modifiers"];
    const extraFields = Object.keys(item).filter(key => !allowedFields.includes(key));
    if (extraFields.length > 0) {
      warnings.push(`${itemPrefix}: extra fields found: ${extraFields.join(", ")}`);
    }
  }

  return { errors, warnings };
};

// Helper function: Validate items array structure
const validateItemsArray = (items, options) => {
  const errors = [];
  const warnings = [];

  items.forEach((item, index) => {
    const itemErrors = validateItem(item, index, options);
    errors.push(...itemErrors.errors);
    warnings.push(...itemErrors.warnings);
  });

  return { errors, warnings };
};

// Helper function: Get validation summary
const getValidationSummary = (order) => {
  const summary = {
    hasOrderId: order.hasOwnProperty("orderId"),
    hasItems: order.hasOwnProperty("items"),
    itemCount: order.items?.length || 0,
    totalModifiers: 0
  };

  if (order.items && Array.isArray(order.items)) {
    summary.totalModifiers = order.items.reduce((total, item) => {
      return total + (item?.modifiers?.length || 0);
    }, 0);
  }

  return summary;
};

// Business logic action: Core business logic
const validateOrderSchema = createAction('schema_validation', (order, config) => {
  // Default configuration
  const defaultConfig = {
    strict: false,
    requireOrderId: true,
    requireItems: true,
    validateModifiers: true,
    allowExtraFields: true,
    enablePerformanceLogging: true
  };

  const mergedConfig = { ...defaultConfig, ...config };
  let itemsValidated = 0;
  const problems = [];
  const warnings = [];

  // Validate top-level order structure
  const orderValidation = validateOrderStructure(order, {
    requireOrderId: mergedConfig.requireOrderId,
    requireItems: mergedConfig.requireItems,
    allowExtraFields: mergedConfig.allowExtraFields,
    strict: mergedConfig.strict
  });
  
  problems.push(...orderValidation.errors);
  warnings.push(...orderValidation.warnings);

  // Validate items array if present
  if (order.items && Array.isArray(order.items)) {
    itemsValidated = order.items.length;
    const itemsValidation = validateItemsArray(order.items, {
      validateModifiers: mergedConfig.validateModifiers,
      allowExtraFields: mergedConfig.allowExtraFields,
      strict: mergedConfig.strict
    });
    
    problems.push(...itemsValidation.errors);
    warnings.push(...itemsValidation.warnings);
  }

  return {
    success: problems.length === 0,
    problems,
    warnings,
    operationData: {
      itemCount: itemsValidated,
      reason: problems.length > 0 ? problems.join('; ') : null
    },
    metadata: {
      itemsValidated,
      structureValid: problems.length === 0,
      totalErrors: problems.length,
      totalWarnings: warnings.length,
      validationSummary: getValidationSummary(order),
      itemsProcessed: itemsValidated
    }
  };
});

// Compatibility wrapper class for existing imports
class ValidateOrderSchemaAction {
  constructor() {
    this.actionType = 'schema_validation';
    this.type = 'validation';
  }

  async execute(request) {
    return validateOrderSchema.execute(request);
  }

  async processAction(request) {
    return this.execute(request);
  }

  getMetadata() {
    return {
      name: this.actionType,
      type: this.type,
      description: 'Validates order structure against expected schema format',
      capabilities: ['structure_validation', 'type_checking', 'required_fields', 'modifier_validation'],
      errorTypes: ['SCHEMA_VALIDATION_ERROR', 'SYSTEM_ERROR'],
      warningTypes: ['SCHEMA_VALIDATION_WARNING'],
      performance: {
        expectedTimePerOrder: '1-5ms',
        scalability: 'O(n) where n = number of items + modifiers'
      }
    };
  }
}

module.exports = ValidateOrderSchemaAction;