/**
 * Error System Exports
 * Centralized export point for all error-related utilities
 */

const { ErrorCodes, ErrorSeverity, ErrorCategory, ErrorCodeUtils } = require('./errorCodes');
const { ErrorBuilder, ErrorFactory, ErrorTemplates } = require('./errorBuilder');

module.exports = {
  // Core error definitions
  ErrorCodes,
  ErrorSeverity,
  ErrorCategory,
  
  // Utility functions
  ErrorCodeUtils,
  
  // Error creation utilities
  ErrorBuilder,
  ErrorFactory,
  ErrorTemplates
};
