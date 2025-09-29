/**
 *  Pipeline Observer
 * 
 * Observes and tracks pipeline execution flow, state changes, performance metrics,
 * and operations for comprehensive observability and debugging.
 */

class PipelineObserver {
  constructor(orderId, initialOrder, config = {}) {
    this.orderId = orderId;
    this.executionId = this.generateExecutionId();
    this.initialOrder = this.deepClone(initialOrder);
    this.currentOrder = this.deepClone(initialOrder);
    
    // Configuration
    this.config = {
      enableStateTracking: true,
      enablePerformanceTracking: true,
      enableOperationsLogging: true,
      enableDiffAnalysis: true,
      maxHistorySize: 100,
      ...config
    };

    // State tracking
    this.stateHistory = [this.deepClone(initialOrder)];
    this.stepResults = [];
    this.allOperations = []; // Unified operations from all actions
    
    // Performance tracking
    this.startTime = Date.now();
    this.stepTimes = [];
    this.totalProcessingTime = 0;
    
    // Error aggregation
    this.allErrors = [];
    this.criticalErrors = [];
    
    // Metadata
    this.metadata = {
      pipelineVersion: '2.0',
      contextCreated: new Date().toISOString(),
      totalSteps: 0,
      successfulSteps: 0,
      failedSteps: 0
    };
  }

  /**
   * Generate unique execution ID
   */
  generateExecutionId() {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substr(2, 5);
    return `exec_${timestamp}_${random}`;
  }

  /**
   * Deep clone utility
   */
  deepClone(obj) {
    if (obj === null || typeof obj !== 'object') return obj;
    if (obj instanceof Date) return new Date(obj.getTime());
    if (obj instanceof Array) return obj.map(item => this.deepClone(item));
    
    const cloned = {};
    for (const key in obj) {
      if (obj.hasOwnProperty(key)) {
        cloned[key] = this.deepClone(obj[key]);
      }
    }
    return cloned;
  }

  /**
   * Track the start of a pipeline step
   */
  startStep(actionName, actionConfig = {}) {
    const stepIndex = this.stepResults.length;
    const stepData = {
      stepIndex,
      actionName,
      actionConfig,
      startTime: Date.now(),
      orderBefore: this.deepClone(this.currentOrder),
      orderAfter: null,
      operations: [],
      success: null,
      duration: null,
      metadata: {}
    };

    this.stepResults.push(stepData);
    this.metadata.totalSteps++;

    if (this.config.enableStateTracking) {
      console.log(`[PipelineObserver] Step ${stepIndex}: Starting ${actionName}`);
    }

    return stepIndex;
  }

  /**
   * Track the completion of a pipeline step
   */
  completeStep(stepIndex, actionResult) {
    if (!this.stepResults[stepIndex]) {
      console.warn(`WARNING [PipelineObserver] Step ${stepIndex} not found`);
      return;
    }

    const step = this.stepResults[stepIndex];
    const endTime = Date.now();
    
    // Update step data
    step.endTime = endTime;
    step.duration = endTime - step.startTime;
    step.success = actionResult.success !== false;
    step.orderAfter = this.deepClone(actionResult.order || this.currentOrder);
    step.operations = actionResult.operations || [];
    step.metadata = actionResult.metadata || {};

    // Update current order state
    if (actionResult.order) {
      this.currentOrder = this.deepClone(actionResult.order);
      
      // Add to state history if tracking enabled
      if (this.config.enableStateTracking) {
        this.stateHistory.push(this.deepClone(this.currentOrder));
        
        // Limit history size
        if (this.stateHistory.length > this.config.maxHistorySize) {
          this.stateHistory.shift();
        }
      }
    }

    // Aggregate operations from this step
    if (this.config.enableOperationsLogging && step.operations.length > 0) {
      this.allOperations.push(...step.operations.map(op => ({
        ...op,
        stepIndex,
        actionName: step.actionName,
        timestamp: endTime
      })));
    }

    // Extract and aggregate errors from operations
    const stepErrors = step.operations
      .filter(op => op.error)
      .map(op => ({
        ...op.error,
        stepIndex,
        actionName: step.actionName,
        operation: op.operation,
        timestamp: endTime
      }));

    this.allErrors.push(...stepErrors);

    // Track critical errors
    const criticalStepErrors = stepErrors.filter(error => 
      error.severity === 'ERROR' || error.severity === 'CRITICAL'
    );
    this.criticalErrors.push(...criticalStepErrors);

    // Update metadata
    if (step.success) {
      this.metadata.successfulSteps++;
    } else {
      this.metadata.failedSteps++;
    }

    // Performance tracking
    this.stepTimes.push({
      stepIndex,
      actionName: step.actionName,
      duration: step.duration,
      isBottleneck: step.duration > 100
    });
    this.totalProcessingTime += step.duration;

    if (this.config.enablePerformanceTracking) {
      console.log(`[PipelineObserver] Step ${stepIndex}: ${step.actionName} completed in ${step.duration}ms`);
    }

    return step;
  }

  /**
   * Calculate state differences between two points
   */
  calculateStateDiff(fromStep = 0, toStep = null) {
    if (!this.config.enableDiffAnalysis) return null;

    const fromState = this.stateHistory[fromStep] || this.initialOrder;
    const toState = toStep !== null ? 
      this.stateHistory[toStep] : 
      this.currentOrder;

    return this.deepDiff(fromState, toState);
  }

  /**
   * Simple deep diff implementation
   */
  deepDiff(obj1, obj2, path = '') {
    const changes = [];
    
    // Handle arrays
    if (Array.isArray(obj1) && Array.isArray(obj2)) {
      const maxLength = Math.max(obj1.length, obj2.length);
      for (let i = 0; i < maxLength; i++) {
        const newPath = `${path}[${i}]`;
        if (i >= obj1.length) {
          changes.push({ type: 'added', path: newPath, value: obj2[i] });
        } else if (i >= obj2.length) {
          changes.push({ type: 'removed', path: newPath, value: obj1[i] });
        } else if (JSON.stringify(obj1[i]) !== JSON.stringify(obj2[i])) {
          changes.push(...this.deepDiff(obj1[i], obj2[i], newPath));
        }
      }
      return changes;
    }

    // Handle objects
    if (typeof obj1 === 'object' && typeof obj2 === 'object' && obj1 !== null && obj2 !== null) {
      const allKeys = new Set([...Object.keys(obj1), ...Object.keys(obj2)]);
      
      for (const key of allKeys) {
        const newPath = path ? `${path}.${key}` : key;
        
        if (!(key in obj1)) {
          changes.push({ type: 'added', path: newPath, value: obj2[key] });
        } else if (!(key in obj2)) {
          changes.push({ type: 'removed', path: newPath, value: obj1[key] });
        } else if (JSON.stringify(obj1[key]) !== JSON.stringify(obj2[key])) {
          changes.push(...this.deepDiff(obj1[key], obj2[key], newPath));
        }
      }
      return changes;
    }

    // Handle primitives
    if (obj1 !== obj2) {
      changes.push({ 
        type: 'modified', 
        path, 
        oldValue: obj1, 
        newValue: obj2 
      });
    }

    return changes;
  }

  /**
   * Get execution summary
   */
  getExecutionSummary() {
    const endTime = Date.now();
    const totalDuration = endTime - this.startTime;

    return {
      executionId: this.executionId,
      orderId: this.orderId,
      totalDuration,
      totalSteps: this.metadata.totalSteps,
      successfulSteps: this.metadata.successfulSteps,
      failedSteps: this.metadata.failedSteps,
      successRate: this.metadata.totalSteps > 0 ? 
        (this.metadata.successfulSteps / this.metadata.totalSteps * 100).toFixed(1) + '%' : '0%',
      totalOperations: this.allOperations.length,
      totalErrors: this.allErrors.length,
      criticalErrors: this.criticalErrors.length,
      bottlenecks: this.stepTimes.filter(step => step.isBottleneck),
      stateChanges: this.config.enableDiffAnalysis ? 
        this.calculateStateDiff(0, null) : null
    };
  }

  /**
   * Get complete context data for response
   */
  getContextData() {
    return {
      executionId: this.executionId,
      orderId: this.orderId,
      initialOrder: this.initialOrder,
      finalOrder: this.currentOrder,
      operations: this.allOperations,
      errors: this.allErrors,
      metadata: {
        ...this.metadata,
        summary: this.getExecutionSummary()
      },
      steps: this.config.enableStateTracking ? this.stepResults : [],
      stateHistory: this.config.enableStateTracking ? this.stateHistory : [],
      performance: {
        totalProcessingTime: this.totalProcessingTime,
        stepTimes: this.stepTimes,
        averageStepTime: this.stepTimes.length > 0 ? 
          Math.round(this.totalProcessingTime / this.stepTimes.length) : 0
      }
    };
  }

  /**
   * Extract errors from operations (for legacy compatibility)
   */
  extractErrors() {
    return this.allErrors;
  }

  /**
   * Extract successful operations
   */
  getSuccessfulOperations() {
    return this.allOperations.filter(op => !op.error);
  }

  /**
   * Extract failed operations
   */
  getFailedOperations() {
    return this.allOperations.filter(op => op.error);
  }
}

module.exports = PipelineObserver;
