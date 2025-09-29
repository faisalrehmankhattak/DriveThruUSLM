const { UnifiedOperationTemplates } = require('../errors/errorCodes');
const { IAction } = require('../interfaces/IAction');

/**
 * FUNCTIONAL ACTION ADAPTER
 * 
 * Adapts pure business functions to the IAction interface.
 * This is the core adapter that bridges functional programming with OOP.
 * 
 * Usage:
 * const action = adaptFunction('action-name', (order, config) => {
 *   // Pure business logic here
 *   return { success: true, problems: [] };
 * });
 */

/**
 * Adapt a pure function to IAction interface
 * @param {string} name - Action name (kebab-case)
 * @param {function} businessFunction - Pure business logic function (order, config, request) => result
 * @returns {IAction} - Full IAction-compatible instance
 */
function adaptFunction(name, businessFunction) {
  // Auto-generate operation templates
  const opName = name.replace(/-/g, '_');
  const displayName = name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
  
  ensureOperationTemplates(opName, displayName);
  
  // Create the adapted action class
  class FunctionalActionAdapter extends IAction {
    constructor(dependencies = {}) {
      super(dependencies);
      this.actionType = name;
      this.actionName = displayName;
      this.businessFunction = businessFunction;
    }

    async processAction(request) {
      const startTime = Date.now();
      
      try {
        // Call the pure business function
        const result = await this.businessFunction(request.order, request.config || {}, request);
        const processingTime = Date.now() - startTime;
        
        // Transform result to IAction format
        const transformed = this.transformResult(result, request.order, processingTime);
        
        // Create operation
        const operation = this.createOperation(transformed, processingTime);
        
        return {
          success: transformed.success,
          order: transformed.order,
          operations: [operation],
          metadata: {
            itemsProcessed: request.order?.items?.length || 0,
            processingTime,
            actionName: this.actionName,
            ...transformed.metadata
          }
        };
        
      } catch (error) {
        const processingTime = Date.now() - startTime;
        const operation = UnifiedOperationTemplates.createOperation(
          `${opName.toUpperCase()}_FAILURE`,
          {
            reason: error.message,
            itemCount: request.order?.items?.length || 0,
            processingTime
          }
        );
        
        return {
          success: false,
          order: request.order,
          operations: [operation],
          metadata: {
            error: error.message,
            processingTime,
            systemError: true,
            actionName: this.actionName
          }
        };
      }
    }

    transformResult(result, order, processingTime) {
      // Handle different return types from business functions
      if (typeof result === 'boolean') {
        return { success: result, order };
      }
      
      if (typeof result === 'object' && result !== null) {
        // Auto-detect success from empty problems/errors arrays
        let autoSuccess = true;
        if (result.problems && Array.isArray(result.problems) && result.problems.length > 0) {
          autoSuccess = false;
        }
        if (result.errors && Array.isArray(result.errors) && result.errors.length > 0) {
          autoSuccess = false;
        }
        
        return {
          success: result.success !== undefined ? result.success : autoSuccess,
          order: result.order || order,
          problems: result.problems,
          errors: result.errors,
          metadata: result.metadata,
          operationData: result.operationData
        };
      }
      
      // Default case
      return { success: !!result, order };
    }

    createOperation(result, processingTime) {
      const opName = this.actionType.replace(/-/g, '_');
      const itemCount = result.order?.items?.length || 0;
      
      // Use operationData if provided, otherwise default data
      const baseData = { itemCount, processingTime };
      const operationData = result.operationData ? { ...baseData, ...result.operationData } : baseData;
      
      if (result.success) {
        return UnifiedOperationTemplates.createOperation(
          `${opName.toUpperCase()}_SUCCESS`,
          operationData
        );
      } else {
        const reason = result.problems ? result.problems.join(', ') : 
                     result.errors ? result.errors.join(', ') : 'Action failed';
        
        return UnifiedOperationTemplates.createOperation(
          `${opName.toUpperCase()}_FAILURE`,
          { ...operationData, reason }
        );
      }
    }

    getMetadata() {
      return {
        actionName: this.actionName,
        actionType: this.actionType,
        description: `Functional adapter: ${this.actionName}`,
        dependencies: [],
        errorCodes: [`${this.actionType.replace(/-/g, '_').toUpperCase()}_ERROR`],
        capabilities: ['functional-adapter'],
        performance: { averageTime: '< 50ms' }
      };
    }
  }
  
  return new FunctionalActionAdapter();
}

/**
 * Ensure operation templates exist for the action
 * @param {string} opName - Operation name (snake_case)
 * @param {string} displayName - Human-readable display name
 */
function ensureOperationTemplates(opName, displayName) {
  const successKey = `${opName.toUpperCase()}_SUCCESS`;
  const failureKey = `${opName.toUpperCase()}_FAILURE`;
  
  if (!UnifiedOperationTemplates[successKey]) {
    UnifiedOperationTemplates[successKey] = {
      operation: opName,
      target: '{itemCount} items',
      corrected_value: 'ACTION_COMPLETED',
      rationale: `Successfully processed {itemCount} items with ${displayName}`
    };
  }
  
  if (!UnifiedOperationTemplates[failureKey]) {
    UnifiedOperationTemplates[failureKey] = {
      operation: opName,
      target: '{itemCount} items',
      corrected_value: 'ACTION_FAILED',
      rationale: `${displayName} failed: {reason}`,
      error: {
        code: `${opName.toUpperCase()}_ERROR`,
        message: `${displayName} failed: {reason}`,
        severity: 'error'
      }
    };
  }
}

module.exports = { adaptFunction };
