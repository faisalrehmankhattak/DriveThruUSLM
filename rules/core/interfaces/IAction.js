/**
 * Standardized Action Interface
 * Creates a consistent input/output format for all actions
 * Enables any action to be called from any stage and feed into any other stage
 */

/**
 * Processing Request
 * Standardized input format for all actions
 */
class ProcessingRequest {
  constructor(order, options = {}) {
    // Core data
    this.order = order;
    this.processingId = options.processingId || `proc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    this.timestamp = Date.now();
    
    // Processing context
    this.context = {
      errors: options.errors || [],
      warnings: options.warnings || [],
      resolutions: options.resolutions || [],
      metadata: options.metadata || {}
    };
    
    // Stage information
    this.stage = {
      name: options.stageName || 'unknown',
      index: options.stageIndex || 0,
      totalStages: options.totalStages || 1,
      previousStage: options.previousStage || null
    };
    
    // Configuration for this action
    this.config = options.config || {};
    
    // Pipeline state
    this.pipeline = {
      aborted: false,
      abortReason: null,
      debugMode: options.debugMode || false,
      dryRun: options.dryRun || false
    };
    
    // Performance tracking
    this.performance = {
      requestStartTime: Date.now(),
      cumulativeProcessingTime: options.cumulativeProcessingTime || 0,
      stageTimings: options.stageTimings || {}
    };
  }

  /**
   * Create a request for the next stage
   */
  createNextStageRequest(nextStageName, updatedOrder = null, additionalOptions = {}) {
    return new ProcessingRequest(updatedOrder || this.order, {
      processingId: this.processingId,
      errors: this.context.errors,
      warnings: this.context.warnings,
      resolutions: this.context.resolutions,
      metadata: this.context.metadata,
      stageName: nextStageName,
      stageIndex: this.stage.index + 1,
      totalStages: this.stage.totalStages,
      previousStage: this.stage.name,
      cumulativeProcessingTime: this.performance.cumulativeProcessingTime,
      stageTimings: this.performance.stageTimings,
      debugMode: this.pipeline.debugMode,
      dryRun: this.pipeline.dryRun,
      ...additionalOptions
    });
  }

  /**
   * Clone this request for parallel processing
   */
  clone(overrides = {}) {
    return new ProcessingRequest(this.order, {
      ...this.toJSON(),
      ...overrides
    });
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      order: this.order,
      processingId: this.processingId,
      timestamp: this.timestamp,
      errors: this.context.errors,
      warnings: this.context.warnings,
      resolutions: this.context.resolutions,
      metadata: this.context.metadata,
      stageName: this.stage.name,
      stageIndex: this.stage.index,
      totalStages: this.stage.totalStages,
      previousStage: this.stage.previousStage,
      config: this.config,
      cumulativeProcessingTime: this.performance.cumulativeProcessingTime,
      stageTimings: this.performance.stageTimings,
      debugMode: this.pipeline.debugMode,
      dryRun: this.pipeline.dryRun
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json) {
    return new ProcessingRequest(json.order, json);
  }
}

/**
 * Processing Response
 * Standardized output format for all actions
 */
class ProcessingResponse {
  constructor(request, actionResult = {}) {
    // Copy request information
    this.processingId = request.processingId;
    this.timestamp = Date.now();
    this.requestTimestamp = request.timestamp;
    
    // Action execution results
    this.success = actionResult.success !== false;
    this.order = actionResult.order || request.order; // Use updated order or original
    this.orderModified = actionResult.order !== undefined && actionResult.order !== request.order;
    
    // Processing context (updated)
    this.context = {
      errors: actionResult.errors || request.context.errors,
      warnings: actionResult.warnings || request.context.warnings,
      resolutions: actionResult.resolutions || request.context.resolutions,
      operations: actionResult.operations || request.context.operations || [], // Add operations support
      metadata: { ...request.context.metadata, ...(actionResult.metadata || {}) }
    };
    
    // Also expose operations at the top level for easy access
    this.operations = this.context.operations;
    
    // Also expose metadata at the top level for easy access
    this.metadata = this.context.metadata;
    
    // Stage information
    this.stage = {
      name: request.stage.name,
      index: request.stage.index,
      totalStages: request.stage.totalStages,
      previousStage: request.stage.previousStage,
      completed: true,
      success: this.success,
      processingTime: actionResult.processingTime || (Date.now() - request.performance.requestStartTime)
    };
    
    // Action-specific results
    this.actionResults = {
      type: actionResult.type || 'generic',
      itemsProcessed: actionResult.itemsProcessed || 0,
      modifications: actionResult.modifications || [],
      validations: actionResult.validations || [],
      transformations: actionResult.transformations || []
    };
    
    // Pipeline state
    this.pipeline = {
      aborted: request.pipeline.aborted,
      abortReason: request.pipeline.abortReason,
      debugMode: request.pipeline.debugMode,
      dryRun: request.pipeline.dryRun,
      canContinue: !request.pipeline.aborted // Allow continuation even with stage failures
    };
    
    // Performance tracking
    this.performance = {
      requestStartTime: request.performance.requestStartTime,
      responseEndTime: Date.now(),
      stageProcessingTime: this.stage.processingTime,
      cumulativeProcessingTime: request.performance.cumulativeProcessingTime + this.stage.processingTime,
      stageTimings: {
        ...request.performance.stageTimings,
        [this.stage.name]: this.stage.processingTime
      }
    };
  }

  /**
   * Create request for next stage
   */
  createNextStageRequest(nextStageName, additionalConfig = {}) {
    // Allow continuation even with failures unless explicitly aborted
    if (this.pipeline.aborted) {
      throw new Error(`Cannot continue pipeline: ${this.pipeline.abortReason}`);
    }

    return new ProcessingRequest(this.order, {
      processingId: this.processingId,
      errors: this.context.errors,
      warnings: this.context.warnings,
      resolutions: this.context.resolutions,
      metadata: this.context.metadata,
      stageName: nextStageName,
      stageIndex: this.stage.index + 1,
      totalStages: this.stage.totalStages,
      previousStage: this.stage.name,
      cumulativeProcessingTime: this.performance.cumulativeProcessingTime,
      stageTimings: this.performance.stageTimings,
      debugMode: this.pipeline.debugMode,
      dryRun: this.pipeline.dryRun,
      config: additionalConfig
    });
  }

  /**
   * Get summary for logging
   */
  getSummary() {
    return {
      processingId: this.processingId,
      stage: this.stage.name,
      success: this.success,
      orderModified: this.orderModified,
      errors: this.context.errors.length,
      warnings: this.context.warnings.length,
      resolutions: this.context.resolutions.length,
      itemsProcessed: this.actionResults.itemsProcessed,
      processingTime: this.stage.processingTime,
      cumulativeTime: this.performance.cumulativeProcessingTime,
      canContinue: this.pipeline.canContinue
    };
  }

  /**
   * Create an error response
   */
  static createError(request, error, actionType = 'unknown') {
    return new ProcessingResponse(request, {
      success: false,
      type: actionType,
      errors: request.context.errors.concat([{
        message: error.message,
        code: error.code || 'ACTION_EXECUTION_ERROR',
        stage: request.stage.name,
        timestamp: Date.now(),
        stack: error.stack
      }]),
      warnings: request.context.warnings,
      resolutions: request.context.resolutions,
      processingTime: Date.now() - request.performance.requestStartTime
    });
  }

  /**
   * Serialize to JSON
   */
  toJSON() {
    return {
      processingId: this.processingId,
      timestamp: this.timestamp,
      requestTimestamp: this.requestTimestamp,
      success: this.success,
      order: this.order,
      orderModified: this.orderModified,
      context: this.context,
      stage: this.stage,
      actionResults: this.actionResults,
      pipeline: this.pipeline,
      performance: this.performance
    };
  }

  /**
   * Create from JSON
   */
  static fromJSON(json) {
    const response = Object.create(ProcessingResponse.prototype);
    Object.assign(response, json);
    return response;
  }
}

/**
 * Action Interface
 * All actions must implement this interface for composability
 */
class IAction {
  constructor(actionName, actionType = 'generic') {
    this.actionName = actionName;
    this.actionType = actionType;
  }

  /**
   * Universal execute method - same signature for all actions
   * @param {ProcessingRequest} request - Standardized input
   * @returns {Promise<ProcessingResponse>} - Standardized output
   */
  async execute(request) {
    try {
      // Validate request
      this.validateRequest(request);
      
      // Execute action-specific logic
      const actionResult = await this.processAction(request);
      
      // Create standardized response
      return new ProcessingResponse(request, {
        ...actionResult,
        type: this.actionType
      });
      
    } catch (error) {
      // Create error response
      return ProcessingResponse.createError(request, error, this.actionType);
    }
  }

  /**
   * Abstract method - implement action-specific logic
   * @param {ProcessingRequest} request
   * @returns {Promise<Object>} - Action result object
   */
  async processAction(request) {
    throw new Error(`Method 'processAction()' must be implemented by ${this.constructor.name}`);
  }

  /**
   * Validate request format
   */
  validateRequest(request) {
    if (!(request instanceof ProcessingRequest)) {
      throw new Error(`Invalid request type. Expected ProcessingRequest, got ${request?.constructor?.name}`);
    }
    
    if (!request.order) {
      throw new Error('Request must contain an order object');
    }
    
    if (!request.processingId) {
      throw new Error('Request must contain a processingId');
    }
  }

  /**
   * Get action metadata
   */
  getMetadata() {
    return {
      name: this.actionName,
      type: this.actionType,
      supportsUniversalInterface: true,
      version: '1.0.0'
    };
  }
}

/**
 * Factory for creating requests and responses
 */
class ActionFactory {
  /**
   * Create initial request for pipeline
   */
  static createInitialRequest(order, options = {}) {
    return new ProcessingRequest(order, {
      stageName: options.firstStage || 'initial',
      stageIndex: 0,
      totalStages: options.totalStages || 1,
      config: options.config || {},
      debugMode: options.debugMode || false,
      ...options
    });
  }

  /**
   * Create request from previous response
   */
  static createRequestFromResponse(response, nextStageName, config = {}) {
    return response.createNextStageRequest(nextStageName, config);
  }

  /**
   * Convert legacy action to universal action
   */
  static wrapLegacyAction(actionName, legacyAction, actionType = 'legacy') {
    return new class extends IAction {
      constructor() {
        super(actionName, actionType);
        this.legacyAction = legacyAction;
      }

      async processAction(request) {
        // Convert universal request to legacy format
        const mockContext = {
          errors: request.context.errors,
          warnings: request.context.warnings,
          metadata: request.context.metadata,
          addError: function(message, details = {}) {
            this.errors.push({ message, ...details, timestamp: Date.now() });
          },
          addWarning: function(message, details = {}) {
            this.warnings.push({ message, ...details, timestamp: Date.now() });
          },
          addResolution: function(key, value) {
            this.resolutions = this.resolutions || [];
            this.resolutions.push({ key, value, timestamp: Date.now() });
          }
        };

        // Execute legacy action
        const result = await this.legacyAction.execute(request.order, request.config, mockContext);

        // Convert legacy result to universal format
        return {
          success: result.success,
          order: result.order || request.order,
          errors: mockContext.errors,
          warnings: mockContext.warnings,
          resolutions: mockContext.resolutions || [],
          metadata: result.metadata || {},
          itemsProcessed: result.metadata?.itemsProcessed || 0,
          processingTime: result.processingTime
        };
      }
    };
  }
}

module.exports = {
  ProcessingRequest,
  ProcessingResponse,
  IAction,
  ActionFactory
};
