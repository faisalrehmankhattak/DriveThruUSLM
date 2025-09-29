/**
 *  Order Critic Class
 * 
 * Meta-level validation orchestrator that bridges server endpoints with the validation pipeline.
 * Provides simplified interface while maintaining complete observability and error handling.
 * 
 * Responsibilities:
 * - Process orders through comprehensive validation pipeline
 * - Handle success/error responses with appropriate messaging
 * - Maintain observability and audit trails
 * - Provide clean integration point for server endpoints
 */

const Pipeline = require('../pipelines/Pipeline');

class OrderCritic {
  constructor(config = {}) {
    this.config = {
      enableObservability: true,
      enableFileLogging: true,
      strictMode: false,
      ...config
    };

    // Initialize the validation pipeline with observability
    // Map OrderCritic config to new Pipeline API
    const pipelineMode = this.config.strictMode ? 'testing' : 'development';
    this.pipeline = new Pipeline({
      mode: pipelineMode,
      enableObservability: this.config.enableObservability,
      enableStateTracking: true,
      enablePerformanceTracking: true,
      enableAutoResolution: true,
      autoResolveMenuItems: true,
      autoResolveModifiers: true,
      logLevel: 'info',
      enableDetailedLogging: this.config.enableObservability,
      enableStepLogging: this.config.enableObservability,
      enableSummaryLogging: this.config.enableObservability
    });
  }

  /**
   * Process order through validation pipeline and return appropriate response
   * 
   * @param {Object} orderData - Raw order data from API request
   * @param {Object} config - Optional configuration overrides
   * @returns {Object} Standardized response with success/error handling
   */
  async processOrder(orderData, config = {}) {
    const startTime = Date.now();
    
    console.log(' === ORDER CRITIC PROCESSING ===');
    console.log(' Received Order:', JSON.stringify(orderData, null, 2));
    console.log('');

    try {
      // Merge configuration
      const mergedConfig = { ...this.config, ...config };

      // Execute validation pipeline
      const pipelineResult = await this.pipeline.execute(orderData, mergedConfig);
      
      const processingTime = Date.now() - startTime;

      // Handle success case
      if (pipelineResult.success) {
        console.log(' Order validation successful');
        
        // Generate turn log in expected format
        const turnLog = this.generateTurnLog(orderData, pipelineResult, processingTime);
        
        return {
          success: true,
          order: pipelineResult.order,
          message: "Order validated successfully",
          corrected_cart: this.convertOrderToCart(pipelineResult.order),
          critic_actions: pipelineResult.operations || [],
          metadata: {
            processingTime: `${processingTime}ms`,
            validationStages: pipelineResult.metadata?.executionPath?.length || 5,
            timestamp: new Date().toISOString()
          },
          observability: this.config.enableObservability ? {
            summary: this.extractObservabilitySummary(pipelineResult.observability),
            executionPath: pipelineResult.metadata?.executionPath || []
          } : undefined,
          turnLog: turnLog
        };
      }

      // Handle error case
      console.log(' Order validation failed');
      console.log(' Errors:', pipelineResult.errors);
      
      // Extract primary error message for user-friendly response
      const primaryErrorMessage = this.extractPrimaryErrorMessage(pipelineResult.errors);
      
      // Generate turn log even for failed orders (for complete conversation tracking)
      const turnLog = this.generateTurnLog(orderData, pipelineResult, processingTime);
      
      //  SMART ERROR FILTERING: Only return errors that weren't resolved by subsequent operations
      const filteredErrors = this.filterUnresolvedErrors(pipelineResult.errors || [], pipelineResult.operations || []);
      
      return {
        success: false,
        order: orderData, // Return original order when validation fails
        message: primaryErrorMessage,
        errors: filteredErrors, // Use filtered errors instead of all errors
        corrected_cart: this.convertOrderToCart(orderData), // Original cart for failed orders
        critic_actions: pipelineResult.operations || [], // Include operations even for failures
        metadata: {
          processingTime: `${processingTime}ms`,
          failedAt: this.identifyFailurePoint(pipelineResult),
          timestamp: new Date().toISOString()
        },
        observability: this.config.enableObservability ? {
          summary: this.extractObservabilitySummary(pipelineResult.observability),
          executionPath: pipelineResult.metadata?.executionPath || []
        } : undefined,
        turnLog: turnLog // Include turn log for failed orders too
      };

    } catch (error) {
      console.error('ERROR Order Critic encountered unexpected error:', error);
      
      const processingTime = Date.now() - startTime;
      
      return {
        success: false,
        order: orderData,
        message: `Order processing failed: ${error.message}`,
        errors: [{
          type: 'SYSTEM_ERROR',
          message: error.message,
          timestamp: new Date().toISOString()
        }],
        metadata: {
          processingTime: `${processingTime}ms`,
          failedAt: 'SYSTEM_LEVEL',
          timestamp: new Date().toISOString()
        }
      };
    }
  }

  /**
   *  Filter out errors that were resolved by subsequent operations
   * Same logic as the webhook and pipeline filtering
   */
  filterUnresolvedErrors(errors, operations) {
    if (!errors || !operations) return errors || [];
    
    // Map error codes to their corresponding resolution operation types
    const errorToResolutionMap = {
      'MENU_ITEM_NAME_NOT_FOUND': 'menu_item_resolution',
      'MODIFIER_NAME_NOT_FOUND': 'modifier_resolution'
    };
    
    return errors.filter(error => {
      const resolutionOpType = errorToResolutionMap[error.code];
      
      // If no resolution operation exists for this error type, keep the error
      if (!resolutionOpType) return true;
      
      // Find the most recent resolution operation for this error type
      const resolutionOps = operations.filter(op => op.op === resolutionOpType);
      if (resolutionOps.length === 0) return true; // No resolution attempted, keep error
      
      // Get the last resolution operation
      const lastResolutionOp = resolutionOps[resolutionOps.length - 1];
      
      // If resolution succeeded (corrected_value is not null/empty), filter out the error
      const resolutionSucceeded = lastResolutionOp.corrected_value && 
                                 lastResolutionOp.corrected_value !== 'null' && 
                                 lastResolutionOp.corrected_value !== 'RESOLUTION_FAILED';
      
      // Return true to keep error, false to filter it out
      return !resolutionSucceeded;
    });
  }

  /**
   * Extract user-friendly error message from pipeline errors
   * Prioritizes quantity validation errors as requested
   */
  extractPrimaryErrorMessage(errors) {
    if (!errors || errors.length === 0) {
      return "Order validation failed";
    }

    // Look for quantity validation errors first (as per requirement)
    const quantityError = errors.find(error => 
      error.message && (
        error.message.includes('quantity cannot be zero') ||
        error.message.includes('quantity cannot be negative') ||
        error.message.includes('count must be positive') ||
        error.message.includes('quantity') && error.message.includes('0')
      )
    );

    if (quantityError) {
      return quantityError.message;
    }

    // Fall back to first error message
    const firstError = errors[0];
    if (typeof firstError === 'string') {
      return firstError;
    }
    
    if (firstError && firstError.message) {
      return firstError.message;
    }

    return "Order validation failed with unknown error";
  }

  /**
   * Identify at which stage the validation failed
   */
  identifyFailurePoint(pipelineResult) {
    if (pipelineResult.metadata?.executionPath) {
      const failedStep = pipelineResult.metadata.executionPath.find(step => !step.success);
      return failedStep ? failedStep.step : 'UNKNOWN_STAGE';
    }

    // Check error types to infer failure point
    if (pipelineResult.errors && pipelineResult.errors.length > 0) {
      const firstError = pipelineResult.errors[0];
      
      if (typeof firstError === 'string') {
        if (firstError.includes('schema') || firstError.includes('Schema')) {
          return 'SCHEMA_VALIDATION';
        }
        if (firstError.includes('quantity') || firstError.includes('Quantity')) {
          return 'QUANTITY_VALIDATION';
        }
        if (firstError.includes('menu') || firstError.includes('Menu')) {
          return 'MENU_VALIDATION';
        }
      }
      
      if (firstError.errorCode) {
        if (firstError.errorCode.includes('SCHEMA')) return 'SCHEMA_VALIDATION';
        if (firstError.errorCode.includes('QUANTITY')) return 'QUANTITY_VALIDATION';
        if (firstError.errorCode.includes('MENU')) return 'MENU_VALIDATION';
        if (firstError.errorCode.includes('MODIFIER')) return 'MODIFIER_VALIDATION';
      }
    }

    return 'UNKNOWN_STAGE';
  }

  /**
   * Extract clean observability summary for response
   */
  extractObservabilitySummary(observability) {
    if (!observability) return null;

    return {
      executionId: observability.summary?.stateObservation?.executionId,
      sessionId: observability.summary?.stateObservation?.orderId,
      totalDuration: observability.summary?.stateObservation?.totalDuration,
      stepsExecuted: observability.summary?.stateObservation?.stepsExecuted,
      errorsCount: observability.summary?.stateObservation?.errorsCount || 0,
      warningsCount: observability.summary?.stateObservation?.warningsCount || 0,
      performanceInsights: observability.summary?.auditSummary?.performanceInsights,
      logFilePath: observability.summary?.auditSummary?.logFilePath
    };
  }

  /**
   * Get analytics for a specific order
   */
  async getOrderAnalytics(orderId) {
    return this.pipeline.getOrderAnalytics(orderId);
  }

  /**
   * Search execution history with criteria
   */
  async searchExecutionHistory(criteria = {}) {
    return this.pipeline.searchExecutionHistory(criteria);
  }

  /**
   * Generate turn log in assignment format
   * @param {Object} inputOrder - Original order from user/LLM
   * @param {Object} pipelineResult - Result from pipeline execution
   * @param {number} processingTime - Processing time in milliseconds
   * @returns {Object} Turn log in assignment format
   */
  generateTurnLog(inputOrder, pipelineResult, processingTime) {
    return {
      turn_timestamp: new Date().toISOString(),
      session_id: this.extractSessionId(inputOrder),
      order_id: inputOrder.orderId || 'unknown',
      input_order: this.convertOrderToCart(inputOrder),
      critic_actions: pipelineResult.operations || [],
      corrected_cart: this.convertOrderToCart(pipelineResult.order),
      latency_ms: processingTime
    };
  }

  /**
   * Convert order format to simplified cart format for logging
   * @param {Object} order - Order object
   * @returns {Array} Cart items in simplified format
   */
  convertOrderToCart(order) {
    if (!order || !order.items) return [];
    
    return order.items.map(item => ({
      item_name: item.itemName,
      item_id: item.itemId,
      quantity: item.quantity,
      modifiers: (item.modifiers && Array.isArray(item.modifiers)) ? item.modifiers.map(mod => ({
        modifier_id: mod.modifierId,
        selected: mod.selected,
        count: mod.count || 1
      })) : []
    }));
  }

  /**
   * Extract session ID from order (placeholder for future session tracking)
   * @param {Object} order - Order object
   * @returns {string} Session identifier
   */
  extractSessionId(order) {
    // For now, use orderId as session basis
    // In future, this would extract from actual session context
    const orderIdBase = order.orderId || 'unknown';
    return `session_${Date.now()}_${orderIdBase.slice(-8)}`;
  }
}

module.exports = OrderCritic;
