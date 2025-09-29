/**
 * FUNCTIONAL ACTION ADAPTERS
 * 
 * Main entry point for functional action adaptation.
 * Provides clean, developer-friendly API while maintaining architectural honesty.
 * 
 * This module bridges the gap between:
 * - Pure business functions (what developers write)
 * - IAction interface (what the pipeline expects)
 */

const { adaptFunction } = require('./FunctionalActionAdapter');

/**
 * Create an action from a pure business function
 * 
 * This is the primary API for developers. Despite the name "create",
 * this is actually adapting a function to the IAction interface.
 * 
 * @param {string} name - Action name (kebab-case)
 * @param {function} businessLogic - Pure business function (order, config, request) => result
 * @param {Object} options - Optional configuration (reserved for future use)
 * @returns {IAction} - Full IAction-compatible instance
 * 
 * @example
 * const validateSchema = createAction('schema-validation', (order, config) => {
 *   if (!order.items || order.items.length === 0) {
 *     return { success: false, problems: ['Empty items array'] };
 *   }
 *   return { success: true };
 * });
 */
function createAction(name, businessLogic, options = {}) {
  return adaptFunction(name, businessLogic, options);
}

/**
 * Alias for createAction - more explicit about the adaptation
 * @param {string} name - Action name
 * @param {function} businessLogic - Business function
 * @param {Object} options - Optional configuration
 * @returns {IAction} - Adapted action
 */
function adaptBusinessFunction(name, businessLogic, options = {}) {
  return adaptFunction(name, businessLogic, options);
}

/**
 * Create multiple actions at once
 * @param {Array} actionDefinitions - Array of [name, logic, options] tuples
 * @returns {Object} - Object with action names as keys
 */
function createActions(actionDefinitions) {
  const actions = {};
  
  for (const [name, logic, options = {}] of actionDefinitions) {
    actions[name.replace(/-/g, '_')] = createAction(name, logic, options);
  }
  
  return actions;
}

// Export the developer-friendly API
module.exports = {
  // Primary API (maintains backward compatibility)
  createAction,
  
  // Alternative APIs (more explicit)
  adaptBusinessFunction,
  createActions,
  
  // Direct access to adapter (for advanced use)
  adaptFunction
};
