/**
 * Centralized Error Code Registry
 * Meta-standard enterprise error handling with i18n support and severity classification
 */

/**
 * Error severity levels following Meta engineering standards
 */
const ErrorSeverity = {
  CRITICAL: 'CRITICAL',     // System failures, data corruption
  ERROR: 'ERROR',           // Validation failures, business rule violations
  WARNING: 'WARNING',       // Recoverable issues, recommendations
  INFO: 'INFO'              // Informational messages, suggestions
};

/**
 * Error categories for organization and filtering
 */
const ErrorCategory = {
  VALIDATION: 'VALIDATION',
  BUSINESS_LOGIC: 'BUSINESS_LOGIC',
  DATA_INTEGRITY: 'DATA_INTEGRITY',
  SYSTEM: 'SYSTEM',
  PERFORMANCE: 'PERFORMANCE'
};

/**
 * Centralized error code definitions for Order Validation System
 * Pattern: CATEGORY_SPECIFIC_ERROR_CODE
 */
const ErrorCodes = {
  // === SCHEMA VALIDATION ERRORS ===
  SCHEMA_VALIDATION_ERROR: {
    code: 'SCHEMA_VALIDATION_ERROR',
    severity: ErrorSeverity.ERROR,
    category: ErrorCategory.VALIDATION,
    message: 'Order structure validation failed',
    description: 'The order object does not conform to the required schema',
    suggestedAction: 'Check order structure for missing or invalid fields',
    llmSuggestedAction: 'Valid UpdateOrder Schema for your reference: {"orderId": "<ORDER_ID_FROM_CUSTOMER>", "items": [ { "itemId": <MENU_ITEM_ID>, "itemName": "<MENU_ITEM_NAME>", "quantity": <QTY>, "modifiers": [ { "modifierId": <MOD_ID>, "selected": "<CHOICE>", "count": <COUNT> } ] } ]}',
    httpStatusCode: 400,
    retryable: false
  },

  // === QUANTITY VALIDATION ERRORS ===
  QUANTITY_VALIDATION_ERROR: {
    code: 'QUANTITY_VALIDATION_ERROR',
    severity: ErrorSeverity.ERROR,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Quantity validation failed',
    description: 'Item or modifier quantities do not meet business requirements',
    suggestedAction: 'Ensure all quantities are positive numbers greater than 0',
    llmSuggestedAction: 'Invalid quantities detected. All item quantities must be positive numbers greater than 0. All modifier counts must be positive numbers greater than 0. ',
    httpStatusCode: 400,
    retryable: true
  },

  // === MENU ITEM VALIDATION ERRORS ===
  MENU_ITEM_NAME_NOT_FOUND: {
    code: 'MENU_ITEM_NAME_NOT_FOUND',
    severity: ErrorSeverity.ERROR,
    category: ErrorCategory.DATA_INTEGRITY,
    message: 'Item name does not exist in menu',
    description: 'The specified itemName was not found in the current menu database',
    suggestedAction: 'Use a valid item name from the menu or check for typos',
    llmSuggestedAction: 'The item name was not found in the menu. Please reflect back on the menu data {fullMenuData}. Ask customer again for the item name and if still not found, ask them to order different item.',
    httpStatusCode: 404,
    retryable: true
  },

  MENU_ITEM_ID_NOT_FOUND: {
    code: 'MENU_ITEM_ID_NOT_FOUND',
    severity: ErrorSeverity.ERROR,
    category: ErrorCategory.DATA_INTEGRITY,
    message: 'Item ID does not exist in menu',
    description: 'The specified itemId was not found in the current menu database',
    suggestedAction: 'Use a valid item ID from the menu database',
    llmSuggestedAction: 'The item ID {itemId} does not exist in the menu database. For item "{itemName}", valid IDs are: {validIds}. Please update the itemId field with a correct value.',
    httpStatusCode: 404,
    retryable: true
  },

  // === MODIFIER VALIDATION ERRORS ===
  MODIFIER_NAME_NOT_FOUND: {
    code: 'MODIFIER_NAME_NOT_FOUND',
    severity: ErrorSeverity.ERROR,
    category: ErrorCategory.DATA_INTEGRITY,
    message: 'Modifier name does not exist for this item',
    description: 'The specified modifier name was not found for the selected item',
    suggestedAction: 'Use a valid modifier name from the item options or check for typos',
    llmSuggestedAction: 'The modifier name was not found. Please reflect back on the menu data {fullMenuData}. Ask customer again for the modifier name and ensure modifier belongs to item, ask them to order different modifier.',
    httpStatusCode: 404,
    retryable: true
  },

  MODIFIER_ID_NOT_FOUND: {
    code: 'MODIFIER_ID_NOT_FOUND',
    severity: ErrorSeverity.ERROR,
    category: ErrorCategory.DATA_INTEGRITY,
    message: 'Modifier ID does not exist for this item',
    description: 'The specified modifierId was not found for the selected item',
    suggestedAction: 'Use a valid modifier ID from the item modifier options',
    llmSuggestedAction: 'The modifier ID {modifierId} for item "{itemName}" is invalid. Valid modifier IDs are: {validIds}. Please update the modifierId field with a correct value.',
    httpStatusCode: 404,
    retryable: true
  },

  MODIFIER_OPTION_NOT_FOUND: {
    code: 'MODIFIER_OPTION_NOT_FOUND',
    severity: ErrorSeverity.ERROR,
    category: ErrorCategory.DATA_INTEGRITY,
    message: 'Modifier option is not available',
    description: 'The selected option is not valid for the specified modifier',
    suggestedAction: 'Choose from the available options for this modifier',
    llmSuggestedAction: 'The option "{selectedOption}" for modifier "{modifierName}" is not available. Valid options are: {validOptions}. Please update the selected field with a valid option.',
    httpStatusCode: 404,
    retryable: true
  },

  // === CONSOLIDATION ERRORS ===
  CONSOLIDATION_ERROR: {
    code: 'CONSOLIDATION_ERROR',
    severity: ErrorSeverity.ERROR,
    category: ErrorCategory.BUSINESS_LOGIC,
    message: 'Error occurred while merging duplicate order items',
    description: 'The system failed to consolidate duplicate items in the order',
    suggestedAction: 'Check for duplicate items with same itemId and modifiers',
    llmSuggestedAction: 'Failed to merge duplicate items in the order. Please ensure all items have valid itemId and modifier structures. Remove any malformed duplicate entries and retry.',
    httpStatusCode: 400,
    retryable: true
  }
};

/**
 * LLM Suggestion Templates - Generate context-aware suggestions for AI self-fixing
 */
const LLMSuggestionTemplates = {
  /**
   * Create LLM suggestion for schema validation errors
   */
  schemaValidationSuggestion(validationErrors, context = {}) {
    const errorCode = ErrorCodes.SCHEMA_VALIDATION_ERROR;
    return {
      errorCode: errorCode.code,
      suggestion: errorCode.llmSuggestedAction,
      details: `Validation errors: ${validationErrors.join(', ')}`,
      suggestedFix: {
        action: 'CORRECT_SCHEMA',
        requiredFields: ['orderId', 'items'],
        itemRequiredFields: ['itemId', 'itemName', 'quantity', 'modifiers'],
        example: {
          orderId: 'order-12345',
          items: [
            {
              itemId: 1,
              itemName: 'Coffee',
              quantity: 1,
              modifiers: []
            }
          ]
        }
      },
      severity: errorCode.severity,
      timestamp: Date.now(),
      context
    };
  },

  /**
   * Create LLM suggestion for quantity validation errors
   */
  quantityValidationSuggestion(invalidItems, context = {}) {
    const errorCode = ErrorCodes.QUANTITY_VALIDATION_ERROR;
    return {
      errorCode: errorCode.code,
      suggestion: errorCode.llmSuggestedAction.replace('{invalidItems}', invalidItems.join(', ')),
      details: `Invalid quantities found in: ${invalidItems.join(', ')}`,
      suggestedFix: {
        action: 'CORRECT_QUANTITIES',
        rule: 'All quantities and counts must be positive numbers > 0',
        examples: {
          valid: { quantity: 2, modifiers: [{ modifierId: 1, count: 1 }] },
          invalid: { quantity: 0, modifiers: [{ modifierId: 1, count: -1 }] }
        }
      },
      severity: errorCode.severity,
      timestamp: Date.now(),
      context
    };
  },

  /**
   * Create LLM suggestion for menu item name not found
   */
  menuItemNameNotFoundSuggestion(itemName, suggestions = [], context = {}) {
    const errorCode = ErrorCodes.MENU_ITEM_NAME_NOT_FOUND;
    return {
      errorCode: errorCode.code,
      suggestion: errorCode.llmSuggestedAction
        .replace('{itemName}', itemName)
        .replace('{suggestions}', suggestions.join(', ') || 'none available'),
      details: `Item "${itemName}" not found in menu database`,
      suggestedFix: {
        action: 'REPLACE_ITEM_NAME',
        originalName: itemName,
        alternatives: suggestions,
        instruction: 'Choose the closest match from alternatives or use exact menu item name'
      },
      severity: errorCode.severity,
      timestamp: Date.now(),
      context
    };
  },

  /**
   * Create LLM suggestion for menu item ID not found
   */
  menuItemIdNotFoundSuggestion(itemId, itemName, validIds = [], context = {}) {
    const errorCode = ErrorCodes.MENU_ITEM_ID_NOT_FOUND;
    return {
      errorCode: errorCode.code,
      suggestion: errorCode.llmSuggestedAction
        .replace('{itemId}', itemId)
        .replace('{itemName}', itemName)
        .replace('{validIds}', validIds.join(', ') || 'none found'),
      details: `Item ID ${itemId} is invalid for "${itemName}"`,
      suggestedFix: {
        action: 'REPLACE_ITEM_ID',
        originalId: itemId,
        itemName: itemName,
        validIds: validIds,
        instruction: 'Use one of the valid IDs for this item'
      },
      severity: errorCode.severity,
      timestamp: Date.now(),
      context
    };
  },

  /**
   * Create LLM suggestion for modifier errors
   */
  modifierNotFoundSuggestion(modifierId, modifierName, itemName, availableOptions = [], context = {}) {
    const errorCode = ErrorCodes.MODIFIER_ID_NOT_FOUND;
    return {
      errorCode: errorCode.code,
      suggestion: errorCode.llmSuggestedAction
        .replace('{modifierId}', modifierId)
        .replace('{itemName}', itemName)
        .replace('{validIds}', availableOptions.join(', ') || 'none available'),
      details: `Modifier ${modifierId} (${modifierName}) not available for "${itemName}"`,
      suggestedFix: {
        action: 'REPLACE_MODIFIER',
        originalModifierId: modifierId,
        originalModifierName: modifierName,
        itemName: itemName,
        availableModifiers: availableOptions,
        instruction: 'Choose from available modifiers for this item'
      },
      severity: errorCode.severity,
      timestamp: Date.now(),
      context
    };
  },

  /**
   * Create LLM suggestion for consolidation errors
   */
  consolidationErrorSuggestion(duplicateItems = [], context = {}) {
    const errorCode = ErrorCodes.CONSOLIDATION_ERROR;
    return {
      errorCode: errorCode.code,
      suggestion: errorCode.llmSuggestedAction,
      details: `Failed to merge ${duplicateItems.length} duplicate items`,
      suggestedFix: {
        action: 'CLEAN_DUPLICATES',
        problematicItems: duplicateItems,
        instruction: 'Remove malformed items and ensure proper itemId/modifier structure',
        example: {
          valid: { itemId: 1, itemName: 'Coffee', modifiers: [{ modifierId: 1, selected: 'Large' }] },
          invalid: { itemId: null, itemName: '', modifiers: 'invalid' }
        }
      },
      severity: errorCode.severity,
      timestamp: Date.now(),
      context
    };
  }
};

/**
 * Common error templates for validation actions
 */
const ErrorTemplates = {
  /**
   * Create a schema validation error
   */
  schemaValidationError(details, context = {}) {
    return {
      ...ErrorCodes.SCHEMA_VALIDATION_ERROR,
      message: details,
      timestamp: Date.now(),
      context
    };
  },

  /**
   * Create a quantity validation error
   */
  quantityValidationError(details, context = {}) {
    return {
      ...ErrorCodes.QUANTITY_VALIDATION_ERROR,
      message: details,
      timestamp: Date.now(),
      context
    };
  },

  /**
   * Create a menu item name not found error
   */
  menuItemNameNotFound(itemName, suggestions = [], context = {}) {
    return {
      ...ErrorCodes.MENU_ITEM_NAME_NOT_FOUND,
      message: `Item name "${itemName}" does not exist in menu`,
      timestamp: Date.now(),
      context: {
        itemName,
        suggestions,
        ...context
      }
    };
  },

  /**
   * Create a menu item ID not found error
   */
  menuItemIdNotFound(itemId, context = {}) {
    return {
      ...ErrorCodes.MENU_ITEM_ID_NOT_FOUND,
      message: `Item ID ${itemId} does not exist in menu`,
      timestamp: Date.now(),
      context: {
        itemId,
        ...context
      }
    };
  },

  /**
   * Create a modifier name not found error
   */
  modifierNameNotFound(modifierName, itemName, context = {}) {
    return {
      ...ErrorCodes.MODIFIER_NAME_NOT_FOUND,
      message: `Modifier "${modifierName}" does not exist for item "${itemName}"`,
      timestamp: Date.now(),
      context: {
        modifierName,
        itemName,
        ...context
      }
    };
  },

  /**
   * Create a modifier ID not found error
   */
  modifierIdNotFound(modifierId, itemName, availableIds = [], context = {}) {
    return {
      ...ErrorCodes.MODIFIER_ID_NOT_FOUND,
      message: `Modifier ID ${modifierId} does not exist for item "${itemName}"`,
      timestamp: Date.now(),
      context: {
        modifierId,
        itemName,
        availableIds,
        ...context
      }
    };
  },

  /**
   * Create a modifier option not found error
   */
  modifierOptionNotFound(option, modifierId, availableOptions = [], context = {}) {
    return {
      ...ErrorCodes.MODIFIER_OPTION_NOT_FOUND,
      message: `Option "${option}" is not available for modifier ${modifierId}`,
      timestamp: Date.now(),
      context: {
        option,
        modifierId,
        availableOptions,
        ...context
      }
    };
  }
};

/**
 * Error code utility functions
 */
class ErrorCodeUtils {
  /**
   * Get error definition by code
   */
  static getErrorDefinition(code) {
    return ErrorCodes[code] || null;
  }

  /**
   * Create standardized error object
   */
  static createError(code, context = {}) {
    const definition = ErrorCodes[code];
    if (!definition) {
      throw new Error(`Unknown error code: ${code}`);
    }

    return {
      code: definition.code,
      severity: definition.severity,
      category: definition.category,
      message: definition.message,
      description: definition.description,
      suggestedAction: definition.suggestedAction,
      httpStatusCode: definition.httpStatusCode,
      retryable: definition.retryable,
      timestamp: Date.now(),
      context: context || {}
    };
  }

  /**
   * Filter errors by severity
   */
  static filterBySeverity(errors, severity) {
    return errors.filter(error => error.severity === severity);
  }

  /**
   * Filter errors by category
   */
  static filterByCategory(errors, category) {
    return errors.filter(error => error.category === category);
  }

  /**
   * Get all error codes by category
   */
  static getErrorCodesByCategory(category) {
    return Object.values(ErrorCodes).filter(error => error.category === category);
  }

  /**
   * Check if error code is retryable
   */
  static isRetryable(code) {
    const definition = ErrorCodes[code];
    return definition ? definition.retryable : false;
  }

  /**
   * Get HTTP status code for error
   */
  static getHttpStatusCode(code) {
    const definition = ErrorCodes[code];
    return definition ? definition.httpStatusCode : 500;
  }

  /**
   * Format error for logging
   */
  static formatForLogging(error) {
    return {
      code: error.code,
      severity: error.severity,
      category: error.category,
      message: error.message,
      timestamp: error.timestamp,
      context: error.context
    };
  }

  /**
   * Format error for user display
   */
  static formatForUser(error) {
    return {
      message: error.message,
      suggestion: error.suggestedAction,
      canRetry: error.retryable
    };
  }
}

/**
 * Unified Operation Templates
 * Single source of truth: Operations contain both audit info AND error data
 * Eliminates redundancy between error handling and operation logging
 */
const UnifiedOperationTemplates = {
  // === VALIDATION OPERATIONS ===
  SCHEMA_VALIDATION_SUCCESS: {
    operation: 'schema_validation',
    target: (data) => `${data.itemCount} items`,
    corrected_value: 'VALIDATION_PASSED',
    rationale: (data) => `Schema validation successful: ${data.itemCount} items validated with correct structure`,
    error: null
  },
  
  SCHEMA_VALIDATION_FAILURE: {
    operation: 'schema_validation',
    target: (data) => 'Order structure',
    corrected_value: 'VALIDATION_FAILED',
    rationale: (data) => `Schema validation failed: ${data.reason}`,
    error: {
      code: 'SCHEMA_VALIDATION_ERROR',
      severity: 'ERROR',
      category: 'VALIDATION',
      context: (data) => ({ reason: data.reason, itemCount: data.itemCount }),
      llmMessage: 'Valid UpdateOrder Schema for your reference: {"orderId": "<ORDER_ID_FROM_CUSTOMER>", "items": [ { "itemId": <MENU_ITEM_ID>, "itemName": "<MENU_ITEM_NAME>", "quantity": <QTY>, "modifiers": [ { "modifierId": <MOD_ID>, "selected": "<CHOICE>", "count": <COUNT> } ] } ]}'
    }
  },

  QUANTITY_VALIDATION_SUCCESS: {
    operation: 'quantity_validation',
    target: (data) => `${data.itemCount} items, ${data.modifierCount} modifiers`,
    corrected_value: 'VALIDATION_PASSED',
    rationale: (data) => `Quantity validation successful: All items have valid quantities (>0) and modifiers have valid counts (>0)`,
    error: null
  },

  QUANTITY_VALIDATION_FAILURE: {
    operation: 'quantity_validation',
    target: (data) => 'Order quantities',
    corrected_value: 'VALIDATION_FAILED',
    rationale: (data) => `Quantity validation failed: ${data.reason}`,
    error: {
      code: 'QUANTITY_VALIDATION_ERROR',
      severity: 'ERROR',
      category: 'BUSINESS_LOGIC',
      context: (data) => ({ reason: data.reason, invalidItems: data.invalidItems }),
      llmMessage: 'Invalid quantities detected. All item quantities must be positive numbers greater than 0. All modifier counts must be positive numbers greater than 0.'
    }
  },

  // === CONSOLIDATION OPERATIONS ===
  ORDER_CONSOLIDATION_SUCCESS: {
    operation: 'order_consolidation',
    target: (data) => `${data.originalCount} items`,
    corrected_value: (data) => `${data.finalCount} items (consolidated)`,
    rationale: (data) => `Order consolidation successful: ${data.duplicateCount} duplicate items merged`,
    error: null
  },

  ORDER_CONSOLIDATION_NONE: {
    operation: 'order_consolidation',
    target: (data) => `${data.itemCount} items`,
    corrected_value: 'No consolidation needed',
    rationale: (data) => `Order consolidation successful: No duplicate items found, order structure maintained`,
    error: null
  },

  ORDER_CONSOLIDATION_FAILURE: {
    operation: 'order_consolidation',
    target: (data) => 'Order consolidation',
    corrected_value: 'CONSOLIDATION_FAILED',
    rationale: (data) => `Order consolidation failed: ${data.reason}`,
    error: {
      code: 'CONSOLIDATION_ERROR',
      severity: 'ERROR',
      category: 'BUSINESS_LOGIC',
      context: (data) => ({ reason: data.reason }),
      llmMessage: 'Failed to merge duplicate items in the order. Please ensure all items have valid itemId and modifier structures.'
    }
  },

  // === MENU ITEM OPERATIONS ===
  MENU_ITEM_VALIDATION_SUCCESS: {
    operation: 'menu_item_validation',
    target: (data) => `${data.itemCount} menu items`,
    corrected_value: 'VALIDATION_PASSED',
    rationale: (data) => `Menu item validation successful: All ${data.itemCount} items found in menu with correct IDs`,
    error: null
  },

  MENU_ITEM_VALIDATION_FAILURE: {
    operation: 'menu_item_validation',
    target: (data) => data.itemName,
    corrected_value: 'VALIDATION_FAILED',
    rationale: (data) => `Menu item validation failed: Item '${data.itemName}' not found in menu database`,
    error: {
      code: 'MENU_ITEM_NAME_NOT_FOUND',
      severity: 'ERROR',
      category: 'DATA_INTEGRITY',
      context: (data) => ({ 
        itemName: data.itemName, 
        itemId: data.itemId,
        itemIndex: data.itemIndex,
        suggestions: data.suggestions || []
      }),
      llmMessage: (data) => `The item name was not found in the menu. Please reflect back on the menu data {fullMenuData}. Ask customer again for the item name and if still not found, ask them to order different item.`
    }
  },

  MENU_ITEM_RESOLUTION_SUCCESS: {
    operation: 'menu_item_resolution',
    target: (data) => data.originalName,
    corrected_value: (data) => data.resolvedName,
    rationale: (data) => `Menu item resolution successful: '${data.originalName}' resolved to '${data.resolvedName}' using fuzzy matching (confidence: ${data.confidence})`,
    error: null
  },

  MENU_ITEM_RESOLUTION_FAILURE: {
    operation: 'menu_item_resolution',
    target: (data) => data.originalName,
    corrected_value: 'RESOLUTION_FAILED',
    rationale: (data) => `Menu item resolution failed: Could not find suitable match for '${data.originalName}' in menu database`,
    error: {
      code: 'MENU_ITEM_RESOLUTION_FAILED',
      severity: 'ERROR',
      category: 'DATA_INTEGRITY',
      context: (data) => ({ 
        originalName: data.originalName, 
        reason: data.reason,
        confidence: data.confidence || 0
      }),
      llmMessage: (data) => `Could not resolve menu item '${data.originalName}'. Please ask customer to choose from available menu items.`
    }
  },

  // === MODIFIER OPERATIONS ===
  MODIFIER_VALIDATION_SUCCESS: {
    operation: 'modifier_validation',
    target: (data) => `${data.modifierCount} modifiers`,
    corrected_value: 'VALIDATION_PASSED',
    rationale: (data) => `Modifier validation successful: All ${data.modifierCount} modifiers are valid for their respective items`,
    error: null
  },

  MODIFIER_VALIDATION_FAILURE: {
    operation: 'modifier_validation',
    target: (data) => data.modifierName,
    corrected_value: 'VALIDATION_FAILED',
    rationale: (data) => `Modifier validation failed: '${data.modifierName}' not available for item '${data.itemName}'`,
    error: {
      code: 'MODIFIER_NAME_NOT_FOUND',
      severity: 'ERROR',
      category: 'DATA_INTEGRITY',
      context: (data) => ({ 
        modifierName: data.modifierName,
        itemName: data.itemName,
        modifierId: data.modifierId,
        itemId: data.itemId
      }),
      llmMessage: 'The modifier was not found. Please reflect back on the menu data {fullMenuData}. Ask customer again for the modifier name and ensure modifier belongs to item, ask them to order different modifier.'
    }
  },

  MODIFIER_RESOLUTION_SUCCESS: {
    operation: 'modifier_resolution',
    target: (data) => data.originalOption,
    corrected_value: (data) => data.resolvedOption,
    rationale: (data) => `Modifier resolution successful: '${data.originalOption}' resolved to '${data.resolvedOption}' for modifier '${data.modifierName}'`,
    error: null
  },

  MODIFIER_RESOLUTION_FAILURE: {
    operation: 'modifier_resolution',
    target: (data) => data.originalOption,
    corrected_value: 'RESOLUTION_FAILED',
    rationale: (data) => `Modifier resolution failed: Could not find suitable match for '${data.originalOption}' in available modifiers`,
    error: {
      code: 'MODIFIER_RESOLUTION_FAILED',
      severity: 'ERROR',
      category: 'DATA_INTEGRITY',
      context: (data) => ({ 
        originalOption: data.originalOption,
        modifierName: data.modifierName,
        reason: data.reason
      }),
      llmMessage: (data) => `Could not resolve modifier option '${data.originalOption}'. Please ask customer to choose from available options.`
    }
  },

  // === MODIFIER MAPPING OPERATIONS ===
  MODIFIER_MAPPING_SUCCESS: {
    operation: 'modifier_mapping',
    target: (data) => `${data.originalItemName} (standalone item)`,
    corrected_value: (data) => `${data.targetItemName} + ${data.mappedModifierName} (modifier)`,
    rationale: (data) => `Smart consolidation: '${data.originalItemName}' (qty: ${data.originalQuantity}) mapped as '${data.mappedModifierName}' modifier to '${data.targetItemName}', saving $${data.costSavings.toFixed(2)}`,
    error: null
  },

  MODIFIER_MAPPING_SKIPPED: {
    operation: 'modifier_mapping',
    target: (data) => `${data.itemName} (qty: ${data.quantity})`,
    corrected_value: 'NO_MAPPING_REQUIRED',
    rationale: (data) => `Modifier mapping skipped: ${data.reason}`,
    error: null
  },

  MODIFIER_MAPPING_CONFLICT_ERROR: {
    operation: 'modifier_mapping',
    target: (data) => `${data.itemName} to ${data.targetItemName}`,
    corrected_value: 'MAPPING_FAILED',
    rationale: (data) => `Modifier mapping failed: ${data.reason}`,
    error: {
      code: 'MODIFIER_MAPPING_CONFLICT',
      severity: 'WARNING',
      category: 'BUSINESS_LOGIC',
      context: (data) => ({
        sourceItem: data.itemName,
        targetItem: data.targetItemName,
        conflictReason: data.reason,
        existingModifier: data.existingModifier
      }),
      llmMessage: (data) => `Cannot map '${data.itemName}' as modifier to '${data.targetItemName}': ${data.reason}. Item will remain separate.`
    }
  },

  MODIFIER_MAPPING_INVALID_ERROR: {
    operation: 'modifier_mapping',
    target: (data) => data.itemName,
    corrected_value: 'INVALID_MAPPING',
    rationale: (data) => `Invalid modifier mapping attempted: ${data.reason}`,
    error: {
      code: 'INVALID_MODIFIER_MAPPING',
      severity: 'ERROR',
      category: 'DATA_INTEGRITY',
      context: (data) => ({
        itemName: data.itemName,
        itemId: data.itemId,
        quantity: data.quantity,
        validationFailure: data.reason
      }),
      llmMessage: (data) => `'${data.itemName}' cannot be converted to modifier: ${data.reason}. Please keep as separate item.`
    }
  },

  // === UTILITY FUNCTIONS ===
  createOperation(templateKey, data = {}) {
    const template = UnifiedOperationTemplates[templateKey];
    if (!template) {
      throw new Error(`Unknown operation template: ${templateKey}`);
    }

    const operation = {
      op: template.operation,
      target: typeof template.target === 'function' ? template.target(data) : template.target,
      corrected_value: typeof template.corrected_value === 'function' ? template.corrected_value(data) : template.corrected_value,
      rationale: typeof template.rationale === 'function' ? template.rationale(data) : template.rationale
    };

    // Add error information if this is a failure operation
    if (template.error) {
      operation.error = {
        code: template.error.code,
        severity: template.error.severity,
        category: template.error.category,
        context: typeof template.error.context === 'function' ? template.error.context(data) : template.error.context,
        llmMessage: typeof template.error.llmMessage === 'function' ? template.error.llmMessage(data) : template.error.llmMessage,
        timestamp: Date.now()
      };
    }

    return operation;
  },

  // Extract errors from operations array
  extractErrors(operations) {
    return operations
      .filter(op => op.error)
      .map(op => op.error);
  },

  // Extract LLM message from first failed operation
  extractLLMMessage(operations) {
    const failedOp = operations.find(op => op.error);
    return failedOp ? failedOp.error.llmMessage : null;
  },

  // Get operations by type
  getOperationsByType(operations, operationType) {
    return operations.filter(op => op.op === operationType);
  }
};

// Single consolidated export
module.exports = {
  ErrorCodes,
  ErrorSeverity,
  ErrorCategory,
  ErrorCodeUtils,
  ErrorTemplates,
  LLMSuggestionTemplates,
  UnifiedOperationTemplates
};
