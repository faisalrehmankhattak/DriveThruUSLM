/**
 * Error Builder Utility
 * Meta-standard fluent interface for creating standardized errors
 */

const { ErrorCodes, ErrorCodeUtils } = require('./errorCodes');

/**
 * Fluent error builder for consistent error creation
 */
class ErrorBuilder {
  constructor() {
    this.reset();
  }

  /**
   * Reset builder state
   */
  reset() {
    this._code = null;
    this._context = {};
    this._customMessage = null;
    this._customSuggestion = null;
    return this;
  }

  /**
   * Set error code
   */
  code(errorCode) {
    this._code = errorCode;
    return this;
  }

  /**
   * Add context information
   */
  context(key, value) {
    if (typeof key === 'object') {
      this._context = { ...this._context, ...key };
    } else {
      this._context[key] = value;
    }
    return this;
  }

  /**
   * Override default message
   */
  message(customMessage) {
    this._customMessage = customMessage;
    return this;
  }

  /**
   * Override default suggested action
   */
  suggestion(customSuggestion) {
    this._customSuggestion = customSuggestion;
    return this;
  }

  /**
   * Build the error object
   */
  build() {
    if (!this._code) {
      throw new Error('Error code is required');
    }

    const error = ErrorCodeUtils.createError(this._code, this._context);
    
    // Apply customizations
    if (this._customMessage) {
      error.message = this._customMessage;
    }
    
    if (this._customSuggestion) {
      error.suggestedAction = this._customSuggestion;
    }

    return error;
  }

  /**
   * Build and format for logging
   */
  buildForLogging() {
    return ErrorCodeUtils.formatForLogging(this.build());
  }

  /**
   * Build and format for user display
   */
  buildForUser() {
    return ErrorCodeUtils.formatForUser(this.build());
  }
}

/**
 * Static factory methods for common error patterns
 */
class ErrorFactory {
  /**
   * Create schema validation error
   */
  static schemaError(code, field, value) {
    return new ErrorBuilder()
      .code(code)
      .context({
        field,
        value,
        validationType: 'schema'
      })
      .build();
  }

  /**
   * Create menu validation error with suggestions
   */
  static menuError(code, itemId, itemName, suggestion = null) {
    const builder = new ErrorBuilder()
      .code(code)
      .context({
        itemId,
        itemName,
        validationType: 'menu'
      });

    if (suggestion) {
      builder.suggestion(suggestion);
    }

    return builder.build();
  }

  /**
   * Create quantity validation error
   */
  static quantityError(code, itemIndex, quantity, threshold = null) {
    return new ErrorBuilder()
      .code(code)
      .context({
        itemIndex,
        quantity,
        threshold,
        validationType: 'quantity'
      })
      .build();
  }

  /**
   * Create modifier validation error
   */
  static modifierError(code, itemId, modifierId, availableModifiers = []) {
    return new ErrorBuilder()
      .code(code)
      .context({
        itemId,
        modifierId,
        availableModifiers,
        validationType: 'modifier'
      })
      .build();
  }

  /**
   * Create system error
   */
  static systemError(code, operation, details = {}) {
    return new ErrorBuilder()
      .code(code)
      .context({
        operation,
        ...details,
        validationType: 'system'
      })
      .build();
  }

  /**
   * Create business logic error
   */
  static businessError(code, rule, context = {}) {
    return new ErrorBuilder()
      .code(code)
      .context({
        rule,
        ...context,
        validationType: 'business'
      })
      .build();
  }
}

/**
 * Predefined error templates for common scenarios
 */
class ErrorTemplates {
  /**
   * Item not found in menu
   */
  static itemNotFound(itemName, suggestions = []) {
    const builder = new ErrorBuilder()
      .code('MENU_ITEM_NAME_NOT_FOUND')
      .context({ itemName, suggestions });

    if (suggestions.length > 0) {
      builder.suggestion(`Did you mean: ${suggestions.join(', ')}?`);
    }

    return builder.build();
  }

  /**
   * Item ID and name mismatch
   */
  static itemMismatch(itemId, providedName, actualName) {
    return new ErrorBuilder()
      .code('MENU_ITEM_ID_NAME_MISMATCH')
      .context({ itemId, providedName, actualName })
      .message(`Item ID ${itemId} corresponds to "${actualName}", not "${providedName}"`)
      .suggestion(`Use itemName: "${actualName}" for itemId: ${itemId}`)
      .build();
  }

  /**
   * Invalid quantity
   */
  static invalidQuantity(itemIndex, quantity) {
    return new ErrorBuilder()
      .code('QUANTITY_INVALID_VALUE')
      .context({ itemIndex, quantity })
      .message(`Item ${itemIndex + 1}: quantity must be positive (got: ${quantity})`)
      .build();
  }

  /**
   * Missing required field
   */
  static missingField(field, context = {}) {
    const codes = {
      'orderId': 'SCHEMA_MISSING_ORDER_ID',
      'items': 'SCHEMA_MISSING_ITEMS'
    };

    return new ErrorBuilder()
      .code(codes[field] || 'SCHEMA_INVALID_ITEM_STRUCTURE')
      .context({ field, ...context })
      .build();
  }

  /**
   * System timeout
   */
  static timeout(operation, duration) {
    return new ErrorBuilder()
      .code('SYSTEM_PROCESSING_TIMEOUT')
      .context({ operation, duration })
      .message(`Operation "${operation}" timed out after ${duration}ms`)
      .build();
  }
}

module.exports = {
  ErrorBuilder,
  ErrorFactory,
  ErrorTemplates
};
