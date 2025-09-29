/**
 * TRANSFORMER ERROR RESPONSE TRANSFORMER
 * 
 * Meta-Level UX Psychology: Transform system errors into collaborative guidance
 * 
 * Purpose: Make the LLM feel like a thoughtful assistant seeking clarification
 * rather than a failed system that made mistakes.
 */

const { getMenuDataService } = require('../../infrastructure/data/menuDataService');

class ErrorResponseTransformer {
  constructor(config = {}) {
    this.config = {
      enableLLMEmpowerment: config.enableLLMEmpowerment ?? true,
      includeMenuSuggestions: config.includeMenuSuggestions ?? true,
      includeNextSteps: config.includeNextSteps ?? true,
      maxSuggestions: config.maxSuggestions ?? 10, // Limit suggestions for UX
      ...config
    };
    
    // Initialize menu service
    this.menuService = null;
    this.initializeMenuService();
  }

  /**
   * Initialize menu data service
   */
  async initializeMenuService() {
    try {
      this.menuService = getMenuDataService();
    } catch (error) {
      console.warn('WARNING [ErrorTransformer] Failed to initialize menu service:', error.message);
    }
  }

  /**
   * Transform error response for LLM empowerment
   * @param {Object} criticResult - The failed OrderCritic result
   * @returns {Object} - Transformed error response for LLM
   */
  async transformErrorResponse(criticResult) {
    if (!this.config.enableLLMEmpowerment || criticResult.success) {
      return this.createStandardErrorResponse(criticResult);
    }

    // Ensure menu service is initialized
    if (!this.menuService) {
      await this.initializeMenuService();
    }

    // Get the most recent unresolved errors
    const recentErrors = this.extractRecentErrors(criticResult.errors || []);
    
    if (recentErrors.length === 0) {
      return this.createStandardErrorResponse(criticResult);
    }

    // Create empowered error response with real menu suggestions
    return await this.createEmpoweredErrorResponse(criticResult, recentErrors);
  }

  /**
   * Extract recent unresolved errors
   * @param {Array} errors - Array of error objects
   * @returns {Array} - Recent errors to address
   */
  extractRecentErrors(errors) {
    // Sort by timestamp (most recent first)
    return errors
      .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      .slice(0, 2); // Only show 1-2 most recent errors
  }

  /**
   * Create empowered error response that frames LLM as thoughtful
   * @param {Object} criticResult - Original critic result
   * @param {Array} recentErrors - Recent errors to address
   * @returns {Object} - Empowered error response
   */
  async createEmpoweredErrorResponse(criticResult, recentErrors) {
    const clarifications = this.generateClarificationMessages(recentErrors);
    const suggestions = await this.generateRealMenuSuggestions(recentErrors);
    const nextSteps = this.generateNextSteps(recentErrors);

    return {
      success: false,
      message: "Let's refine the order together",
      
      //  LLM Empowerment: Frame as thoughtful clarification
      clarification_needed: clarifications,
      
      // SUGGESTION Real menu suggestions based on errors
      ...(suggestions.length > 0 && {
        suggested_corrections: suggestions
      }),
      
      //  Clear next steps for LLM
      ...(this.config.includeNextSteps && {
        your_next_step: nextSteps
      }),
      
      // Note: _meta object removed to maintain clean LLM interface
      // Internal debugging data should not be exposed to LLM
    };
  }

  /**
   * Generate clarification messages that make LLM feel thoughtful
   * @param {Array} errors - Recent errors
   * @returns {Array} - Clarification messages
   */
  generateClarificationMessages(errors) {
    return errors.map(error => {
      switch (error.code) {
        case 'MENU_ITEM_NAME_NOT_FOUND':
          return `I want to make sure I understand the customer correctly - when they said "${error.context.itemName}", which item from our menu did they mean?`;
          
        case 'MODIFIER_NAME_NOT_FOUND':
          return `Let me clarify the modifier - when the customer said "${error.context.modifierName}" for their ${error.context.itemName}, which option should I select?`;
          
        case 'SCHEMA_VALIDATION_ERROR':
          return `I need to double-check the order format to ensure accuracy - ${error.context.reason}`;
          
        case 'QUANTITY_VALIDATION_ERROR':
          return `Let me verify the quantities to make sure the order is complete - ${error.context.reason}`;
          
        default:
          return `I want to ensure this order is perfect - let me clarify: ${error.context?.reason || error.message}`;
      }
    });
  }

  /**
   * Generate real menu suggestions based on error context
   * @param {Array} errors - Recent errors
   * @returns {Array} - Real menu suggestion strings
   */
  async generateRealMenuSuggestions(errors) {
    const suggestions = [];
    
    for (const error of errors) {
      if (error.code === 'MENU_ITEM_NAME_NOT_FOUND') {
        // Get ALL menu items from menu service (no limit for menu items)
        const menuItems = await this.getAllMenuItems();
        suggestions.push(...menuItems);
      }
      
      if (error.code === 'MODIFIER_NAME_NOT_FOUND') {
        // Get modifiers for the specific item (limit modifiers to avoid overwhelming)
        const modifiers = await this.getModifiersForItem(error.context);
        suggestions.push(...modifiers.slice(0, this.config.maxSuggestions));
      }
    }
    
    // Remove duplicates but don't limit menu items
    const uniqueSuggestions = [...new Set(suggestions)];
    return uniqueSuggestions;
  }

  /**
   * Get all menu items from menu service
   * @returns {Array} - Array of menu item names
   */
  async getAllMenuItems() {
    try {
      if (!this.menuService) {
        console.warn('WARNING [ErrorTransformer] Menu service not available');
        return [];
      }

      // Get the raw menu data and extract all item names
      const menuData = await this.menuService.getData();
      if (!menuData || !menuData.items || !Array.isArray(menuData.items)) {
        console.warn('WARNING [ErrorTransformer] Invalid menu data structure');
        return [];
      }

      return menuData.items.map(item => item.name).filter(Boolean);
    } catch (error) {
      console.warn('WARNING [ErrorTransformer] Failed to get menu items:', error.message);
      return [];
    }
  }

  /**
   * Get modifiers for a specific item
   * @param {Object} errorContext - Error context with item info
   * @returns {Array} - Array of modifier option names
   */
  async getModifiersForItem(errorContext) {
    try {
      if (!this.menuService) {
        console.warn('WARNING [ErrorTransformer] Menu service not available');
        return [];
      }

      // Get item ID from context (could be itemId or need to resolve from itemName)
      let itemId = errorContext.itemId;
      
      if (!itemId && errorContext.itemName) {
        // Try to find item by name to get ID
        const allItems = this.menuService.getAllItems();
        const foundItem = allItems.find(item => 
          item.name.toLowerCase() === errorContext.itemName.toLowerCase()
        );
        itemId = foundItem?.id;
      }

      if (!itemId) {
        console.warn('WARNING [ErrorTransformer] Could not determine item ID for modifier suggestions');
        return [];
      }

      // Get modifiers for this specific item
      const modifiers = this.menuService.getItemModifiers(parseInt(itemId));
      
      // Extract all option names from all modifiers
      const optionNames = [];
      if (Array.isArray(modifiers)) {
        modifiers.forEach(modifier => {
          if (modifier.options && Array.isArray(modifier.options)) {
            modifier.options.forEach(option => {
              if (option.name) {
                optionNames.push(option.name);
              }
            });
          }
        });
      }

      return optionNames;
    } catch (error) {
      console.warn('WARNING [ErrorTransformer] Failed to get modifiers for item:', error.message);
      return [];
    }
  }


  /**
   * Generate clear next steps for LLM
   * @param {Array} errors - Recent errors
   * @returns {string} - Next step instruction
   */
  generateNextSteps(errors) {
    if (errors.length === 1) {
      const error = errors[0];
      if (error.code === 'MENU_ITEM_NAME_NOT_FOUND') {
        return "Ask the customer to confirm which item they'd prefer from the suggestions, then call UpdateOrder with the correct item name.";
      }
      if (error.code === 'MODIFIER_NAME_NOT_FOUND') {
        return "Ask the customer to choose from the available modifiers, then call UpdateOrder with their selection.";
      }
    }
    
    return "Clarify these items with the customer, then call UpdateOrder with the corrected information.";
  }

  /**
   * Create standard error response (fallback)
   * @param {Object} criticResult - Original critic result
   * @returns {Object} - Standard error response
   */
  createStandardErrorResponse(criticResult) {
    return {
      success: false,
      message: criticResult.message || "Order validation failed",
      errors: criticResult.errors || []
    };
  }

  /**
   * Update configuration at runtime
   * @param {Object} newConfig - New configuration options
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
  }
}

module.exports = { ErrorResponseTransformer };
