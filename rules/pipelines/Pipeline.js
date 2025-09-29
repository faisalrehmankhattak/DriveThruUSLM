// Configurable order validation pipeline

const { ActionFactory } = require('../core/interfaces/IAction');
const PipelineObserver = require('./observability/PipelineObserver');

// Import validation actions
const ValidateOrderSchemaAction = require('../domain/order/actions/validateOrderSchemaAction');
const ValidateOrderQuantityAction = require('../domain/order/actions/validateOrderQuantityAction');
const ConsolidateOrderAction = require('../domain/order/actions/consolidateOrderAction');
const ValidateMenuItemAction = require('../domain/order/actions/validateMenuItemAction');
const ValidateModifierAction = require('../domain/order/actions/validateModifierAction');

// Import resolver actions
const { ResolveMenuItemAction } = require('../domain/order/actions/resolveMenuItemAction');
const { ResolveModifierAction } = require('../domain/order/actions/resolveModifierAction');

// Import optimization actions
const ModifierMappingAction = require('../domain/order/actions/modifierMappingAction');

/**
 * Pipeline
 * 
 * A configurable order validation pipeline for different environments:
 * - Production: Lightweight, fast execution with minimal logging
 * - Development: Full observability, state tracking, performance monitoring
 * - Testing: Optimized for test scenarios with configurable features
 */
class Pipeline {
  constructor(config = {}) {
    // Define pipeline modes with their default configurations
    this.modes = {
      production: {
        enableObservability: false,
        enableStateTracking: false,
        enablePerformanceTracking: false,
        enableAutoResolution: true,
        autoResolveMenuItems: true,
        autoResolveModifiers: true,
        enableModifierMapping: true,
        logLevel: 'error',
        enableDetailedLogging: false,
        enableStepLogging: false,
        enableSummaryLogging: false
      },
      development: {
        enableObservability: true,
        enableStateTracking: true,
        enablePerformanceTracking: true,
        enableAutoResolution: true,
        autoResolveMenuItems: true,
        autoResolveModifiers: true,
        enableModifierMapping: true,
        logLevel: 'info',
        enableDetailedLogging: true,
        enableStepLogging: true,
        enableSummaryLogging: true
      },
      testing: {
        enableObservability: true,
        enableStateTracking: false,
        enablePerformanceTracking: true,
        enableAutoResolution: false,
        autoResolveMenuItems: false,
        autoResolveModifiers: false,
        enableModifierMapping: true,
        logLevel: 'warn',
        enableDetailedLogging: false,
        enableStepLogging: false,
        enableSummaryLogging: false
      }
    };

    // Initialize all actions (using our working implementations)
    this.actions = {
      validateSchema: new ValidateOrderSchemaAction(),
      validateQuantity: new ValidateOrderQuantityAction(),
      consolidateOrder: new ConsolidateOrderAction(),
      validateMenuItem: new ValidateMenuItemAction(),
      resolveMenuItem: new ResolveMenuItemAction(),
      validateModifier: new ValidateModifierAction(),
      resolveModifier: new ResolveModifierAction(),
      modifierMapping: new ModifierMappingAction()
    };

    // Merge configuration based on mode
    this.config = this.buildConfig(config);
    
    this.log(`Pipeline initialized (${this.config.mode} mode)`, 'info');
  }

  /**
   * Build configuration by merging mode defaults with custom config
   */
  buildConfig(userConfig) {
    const mode = userConfig.mode || 'production';
    const modeDefaults = this.modes[mode] || this.modes.production;
    
    return {
      mode,
      pipelineVersion: '3.0',
      ...modeDefaults,
      ...userConfig // User config overrides mode defaults
    };
  }

  /**
   * Execute the complete validation pipeline
   */
  async execute(order, executionConfig = {}) {
    const startTime = Date.now();
    const orderId = order.orderId || `pipeline_${Date.now()}`;

    // Create observer based on configuration
    const observer = this.config.enableObservability ? 
      new PipelineObserver(orderId, order, {
        enableStateTracking: this.config.enableStateTracking,
        enablePerformanceTracking: this.config.enablePerformanceTracking,
        enableOperationsLogging: true,
        enableDiffAnalysis: this.config.enableObservability,
        ...executionConfig
      }) : null;

    this.log(`Starting pipeline execution for order: ${orderId}`, 'info');

    try {
      let currentOrder = order;
      let pipelineSuccess = true;
      let autoResolutionApplied = false;
      let allOperations = [];

      // Step 1: Schema Validation
      const schemaResult = await this.executeStep(
        observer, 'validateSchema', currentOrder, 'Schema Validation'
      );
      currentOrder = schemaResult.order || currentOrder;
      allOperations.push(...(schemaResult.operations || []));

      // Step 2: Quantity Validation  
      const quantityResult = await this.executeStep(
        observer, 'validateQuantity', currentOrder, 'Quantity Validation'
      );
      currentOrder = quantityResult.order || currentOrder;
      allOperations.push(...(quantityResult.operations || []));

      // Step 3: Order Consolidation
      const consolidationResult = await this.executeStep(
        observer, 'consolidateOrder', currentOrder, 'Order Consolidation'
      );
      currentOrder = consolidationResult.order || currentOrder;
      allOperations.push(...(consolidationResult.operations || []));

      // Step 4: Menu Item Validation
      const menuValidationResult = await this.executeStep(
        observer, 'validateMenuItem', currentOrder, 'Menu Item Validation'
      );
      currentOrder = menuValidationResult.order || currentOrder;
      allOperations.push(...(menuValidationResult.operations || []));

      // Step 5: Auto-resolve menu items if needed and enabled
      if (this.config.enableAutoResolution && this.config.autoResolveMenuItems) {
        const menuErrors = allOperations.filter(op => 
          op.error && op.op === 'menu_item_validation'
        );
        
        if (menuErrors.length > 0) {
          this.log(`Auto-resolving ${menuErrors.length} menu item errors`, 'info');
          const menuResolutionResult = await this.executeStepWithErrors(
            observer, 'resolveMenuItem', currentOrder, 'Menu Item Resolution', menuErrors.map(op => op.error)
          );
          currentOrder = menuResolutionResult.order || currentOrder;
          allOperations.push(...(menuResolutionResult.operations || []));
          autoResolutionApplied = true;
        }
      }

      // Step 6: Modifier Validation
      const modifierValidationResult = await this.executeStep(
        observer, 'validateModifier', currentOrder, 'Modifier Validation'
      );
      currentOrder = modifierValidationResult.order || currentOrder;
      allOperations.push(...(modifierValidationResult.operations || []));

      // Step 7: Auto-resolve modifiers if needed and enabled
      if (this.config.enableAutoResolution && this.config.autoResolveModifiers) {
        const modifierErrors = allOperations.filter(op => 
          op.error && op.op === 'modifier_validation'
        );
        
        if (modifierErrors.length > 0) {
          this.log(`Auto-resolving ${modifierErrors.length} modifier errors`, 'info');
          const modifierResolutionResult = await this.executeStepWithErrors(
            observer, 'resolveModifier', currentOrder, 'Modifier Resolution', modifierErrors.map(op => op.error)
          );
          currentOrder = modifierResolutionResult.order || currentOrder;
          allOperations.push(...(modifierResolutionResult.operations || []));
          autoResolutionApplied = true;
        }
      }

      // Step 8: Modifier Mapping (Cost Optimization)
      let modifierMappingMetadata = {};
      if (this.config.enableModifierMapping !== false) { // Enabled by default
        this.log(`Smart Modifier Mapping`, 'info');
        const modifierMappingConfig = executionConfig.modifierMappingConfig || {};
        const modifierMappingResult = await this.executeStep(
          observer, 'modifierMapping', currentOrder, 'Modifier Mapping', modifierMappingConfig
        );
        currentOrder = modifierMappingResult.order || currentOrder;
        allOperations.push(...(modifierMappingResult.operations || []));
        
        // Capture modifier mapping metadata for pipeline response
        if (modifierMappingResult.metadata) {
          modifierMappingMetadata = {
            costSavings: modifierMappingResult.metadata.costSavings || 0,
            mappingsPerformed: modifierMappingResult.metadata.mappingsPerformed || 0,
            itemsProcessed: modifierMappingResult.metadata.itemsProcessed || 0,
            optimizationSummary: modifierMappingResult.metadata.optimizationSummary || {},
            performanceMetrics: modifierMappingResult.metadata.performanceMetrics || {}
          };
        }
      }

      // Extract errors from operations
      const allErrors = allOperations.filter(op => op.error).map(op => op.error);
      const criticalErrors = allErrors.filter(error => 
        error.severity === 'ERROR' || error.severity === 'CRITICAL'
      );

      // Filter out errors that were resolved by subsequent operations
      const unresolvedCriticalErrors = this.filterUnresolvedErrors(criticalErrors, allOperations);

      // Determine overall pipeline success based on unresolved errors
      pipelineSuccess = unresolvedCriticalErrors.length === 0;

      // Calculate final execution metrics
      const totalTime = Date.now() - startTime;

      // Log summary if enabled
      if (this.config.enableSummaryLogging) {
        this.logPipelineSummary({
          totalTime,
          totalOperations: allOperations.length,
          totalErrors: allErrors.length,
          criticalErrors: criticalErrors.length,
          autoResolutionApplied
        });
      }

      // Build response based on configuration
      const response = {
        success: pipelineSuccess,
        order: currentOrder,
        operations: allOperations,
        metadata: {
          pipelineVersion: this.config.pipelineVersion,
          mode: this.config.mode,
          autoResolutionApplied,
          totalTime,
          operationsCount: allOperations.length,
          // Merge modifier mapping metadata
          ...modifierMappingMetadata
        }
      };

      // Add observability data if enabled
      if (this.config.enableObservability && observer) {
        const summary = observer.getExecutionSummary();
        response.observability = {
          executionId: observer.executionId,
          summary,
          stateChanges: this.config.enableStateTracking ? observer.calculateStateDiff() : null,
          steps: observer.stepResults,
          performance: {
            totalTime,
            stepTimes: observer.stepTimes,
            bottlenecks: this.config.enablePerformanceTracking ? 
              observer.stepTimes.filter(step => step.isBottleneck) : null
          }
        };
        response.metadata.executionContext = observer.getContextData();
      }

      // Add error details (using filtered unresolved errors)
      if (allErrors.length > 0) {
        response.errors = this.filterUnresolvedErrors(allErrors, allOperations);
        response.criticalErrors = unresolvedCriticalErrors;
      }

      return response;

    } catch (error) {
      const totalTime = Date.now() - startTime;
      this.log(`Pipeline execution failed: ${error.message}`, 'error');
      
      return {
        success: false,
        order: order,
        operations: allOperations || [],
        errors: [{
          code: 'PIPELINE_EXECUTION_ERROR',
          message: error.message,
          severity: 'CRITICAL',
          timestamp: Date.now()
        }],
        metadata: {
          pipelineVersion: this.config.pipelineVersion,
          mode: this.config.mode,
          executionFailed: true,
          totalTime
        }
      };
    }
  }

  /**
   * Execute a single pipeline step
   */
  async executeStep(observer, actionName, order, stepDescription, stepConfig = {}) {
    if (this.config.enableStepLogging) {
      this.log(`\n${stepDescription}...`, 'info');
    }
    
    // Start step tracking if observability enabled
    const stepIndex = observer ? observer.startStep(actionName, { description: stepDescription }) : null;
    
    try {
      // Execute the action using our working system
      const action = this.actions[actionName];
      const request = ActionFactory.createInitialRequest(order, { config: stepConfig });
      const result = await action.execute(request);
      
      // Complete step tracking if observability enabled
      if (observer) {
        const stepData = observer.completeStep(stepIndex, result);
        
        // Log step results if enabled
        if (this.config.enableStepLogging) {
          this.logStepResult(stepDescription, result, stepData);
        }
      }
      
      return result;
      
    } catch (error) {
      this.log(`Step failed: ${stepDescription} - ${error.message}`, 'error');
      
      // Track failed step if observability enabled
      if (observer) {
        observer.completeStep(stepIndex, {
          success: false,
          order,
          operations: [{
            op: actionName,
            target: 'step_execution',
            corrected_value: 'STEP_FAILED',
            rationale: `Step execution failed: ${error.message}`,
            error: {
              code: 'STEP_EXECUTION_ERROR',
              message: error.message,
              severity: 'ERROR'
            }
          }],
          metadata: { stepError: error.message }
        });
      }
      
      throw error;
    }
  }

  /**
   * Filter out errors that were resolved by subsequent operations
   * Same logic as the webhook filtering but adapted for pipeline operations
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
   * Execute a single pipeline step with errors from previous steps
   */
  async executeStepWithErrors(observer, actionName, order, stepDescription, errors = []) {
    if (this.config.enableStepLogging) {
      this.log(`\n${stepDescription}...`, 'info');
    }
    
    // Start step tracking if observability enabled
    const stepIndex = observer ? observer.startStep(actionName, { description: stepDescription }) : null;
    
    try {
      // Execute the action using our working system
      const action = this.actions[actionName];
      const request = ActionFactory.createInitialRequest(order, { errors });
      const result = await action.execute(request);
      
      // Complete step tracking if observability enabled
      if (observer) {
        const stepData = observer.completeStep(stepIndex, result);
        
        // Log step results if enabled
        if (this.config.enableStepLogging) {
          this.logStepResult(stepDescription, result, stepData);
        }
      }
      
      return result;
      
    } catch (error) {
      this.log(`Step failed: ${stepDescription} - ${error.message}`, 'error');
      
      // Track failed step if observability enabled
      if (observer) {
        observer.completeStep(stepIndex, {
          success: false,
          order,
          operations: [{
            op: actionName,
            target: 'step_execution',
            corrected_value: 'STEP_FAILED',
            rationale: `Step execution failed: ${error.message}`,
            error: {
              code: 'STEP_EXECUTION_ERROR',
              message: error.message,
              severity: 'ERROR'
            }
          }],
          metadata: { stepError: error.message }
        });
      }
      
      throw error;
    }
  }

  /**
   * Log step execution results
   */
  logStepResult(stepDescription, result, stepData) {
    if (!this.config.enableDetailedLogging) return;

    const operationsCount = result.operations?.length || 0;
    const hasErrors = result.operations?.some(op => op.error) || false;
    const status = hasErrors ? 'FAILED' : 'PASSED';
    
    this.log(`     ${status} (${operationsCount} operations, ${stepData.duration}ms)`, 'info');
    
    if (this.config.logLevel === 'debug' && result.operations) {
      result.operations.forEach((op, i) => {
        const errorStatus = op.error ? 'FAILED' : 'PASSED';
        this.log(`       ${i+1}. ${errorStatus} ${op.op}: ${op.target} to ${op.corrected_value}`, 'debug');
      });
    }
  }

  /**
   * Log pipeline execution summary
   */
  logPipelineSummary(summary) {
    this.log(`\nPIPELINE SUMMARY:`, 'info');
    this.log(`   Execution Time: ${summary.totalTime}ms`, 'info');
    this.log(`   Operations: ${summary.totalOperations}`, 'info');
    
    if (summary.totalErrors > 0) {
      this.log(`   Errors: ${summary.totalErrors}`, 'warn');
    }
    
    if (summary.criticalErrors > 0) {
      this.log(`   Critical: ${summary.criticalErrors}`, 'error');
    }
    
    if (summary.autoResolutionApplied) {
      this.log(`   Auto-resolution: Applied`, 'info');
    }
  }

  /**
   * Logging utility
   */
  log(message, level = 'info') {
    if (this.shouldLog(level)) {
      console.log(message);
    }
  }

  /**
   * Check if we should log at this level
   */
  shouldLog(level) {
    const levels = { debug: 0, info: 1, warn: 2, error: 3 };
    const currentLevel = levels[this.config.logLevel] || 1;
    const messageLevel = levels[level] || 1;
    return messageLevel >= currentLevel;
  }

  /**
   * Get current pipeline configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Update pipeline configuration at runtime
   */
  updateConfig(newConfig) {
    // If mode is changing, rebuild with new mode defaults + custom config
    if (newConfig.mode && newConfig.mode !== this.config.mode) {
      this.config = this.buildConfig({ ...newConfig });
    } else {
      // Otherwise, just merge the new config with current config
      this.config = { ...this.config, ...newConfig };
    }
    this.log(`Pipeline configuration updated to ${this.config.mode} mode`, 'info');
  }

  /**
   * Get available configuration modes
   */
  getModes() {
    return Object.keys(this.modes);
  }

  /**
   * Get default configuration for a specific mode
   */
  getModeDefaults(mode) {
    return { ...this.modes[mode] };
  }
}

module.exports = Pipeline;
