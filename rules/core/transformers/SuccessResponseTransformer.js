/**
 * TRANSFORMER SUCCESS RESPONSE TRANSFORMER
 * 
 * Meta-Level UX Psychology: Transform system auto-resolutions into LLM achievements
 * 
 * Purpose: Make the LLM believe IT made the corrections, creating confidence and
 * seamless conversation flow without revealing system intervention.
 */

class SuccessResponseTransformer {
  constructor(config = {}) {
    this.config = {
      enableLLMEmpowerment: config.enableLLMEmpowerment ?? true,
      includeOrderSummary: config.includeOrderSummary ?? true,
      includeContextReset: config.includeContextReset ?? true,
      ...config
    };
  }

  /**
   * Transform a successful OrderCritic response for LLM consumption
   * @param {Object} criticResult - The OrderCritic result
   * @returns {Object} - Transformed response for LLM
   */
  transformSuccessResponse(criticResult) {
    // Only transform if LLM empowerment is enabled and response is successful
    if (!this.config.enableLLMEmpowerment || !criticResult.success) {
      return this.createStandardSuccessResponse(criticResult);
    }

    // Detect if auto-resolution occurred
    const resolutionOperations = this.extractResolutionOperations(criticResult.critic_actions || []);
    
    if (resolutionOperations.length === 0) {
      // No resolutions occurred, return standard success
      return this.createStandardSuccessResponse(criticResult);
    }

    // Create empowered LLM response
    return this.createEmpoweredResponse(criticResult, resolutionOperations);
  }

  /**
   * Extract resolution operations from critic_actions
   * @param {Array} criticActions - Array of critic action operations
   * @returns {Array} - Resolution operations that succeeded
   */
  extractResolutionOperations(criticActions) {
    const resolutionTypes = ['menu_item_resolution', 'modifier_resolution', 'modifier_mapping'];
    
    return criticActions
      .filter(action => 
        resolutionTypes.includes(action.op) && 
        action.corrected_value && 
        action.corrected_value !== 'null' &&
        action.corrected_value !== 'RESOLUTION_FAILED' &&
        action.corrected_value !== 'NO_MAPPING_REQUIRED'
      )
      .map(action => this.parseResolutionOperation(action));
  }

  /**
   * Parse a resolution operation into structured data
   * @param {Object} operation - The resolution operation
   * @returns {Object} - Parsed resolution data
   */
  parseResolutionOperation(operation) {
    let type;
    switch (operation.op) {
      case 'menu_item_resolution':
        type = 'menu_item';
        break;
      case 'modifier_resolution':
        type = 'modifier';
        break;
      case 'modifier_mapping':
        type = 'smart_consolidation';
        break;
      default:
        type = 'correction';
    }
    
    return {
      type,
      original: operation.target,
      corrected: operation.corrected_value,
      rationale: operation.rationale,
      confidence: this.extractConfidence(operation.rationale)
    };
  }

  /**
   * Extract confidence score from rationale text
   * @param {string} rationale - The operation rationale
   * @returns {number|null} - Confidence score or null
   */
  extractConfidence(rationale) {
    const confidenceMatch = rationale.match(/confidence[:\s]+([0-9.]+)/i);
    return confidenceMatch ? parseFloat(confidenceMatch[1]) : null;
  }

  /**
   * Create empowered LLM response that makes LLM feel accomplished
   * @param {Object} criticResult - Original critic result
   * @param {Array} resolutions - Extracted resolution operations
   * @returns {Object} - Empowered response
   */
  createEmpoweredResponse(criticResult, resolutions) {
    const achievements = this.generateLLMAchievements(resolutions);
    const orderSummary = this.generateOrderSummary(criticResult.corrected_cart);
    
    return {
      success: true,
      message: "Order successfully updated with your corrections",
      
      //  LLM Empowerment: Present as LLM's achievements
      your_corrections: achievements,
      
      // CONTEXT Clean context for moving forward
      ...(this.config.includeOrderSummary && {
        current_order: orderSummary
      }),
      
      //  Context reset instruction
      ...(this.config.includeContextReset && {
        context_note: "This is the customer's confirmed order. Continue the conversation from this point and always call UpdateOrder to update the order."
      }),
      
      // Note: _meta object removed to maintain LLM empowerment psychology
      // Internal data should not be exposed to LLM to preserve confidence
    };
  }

  /**
   * Generate LLM achievement messages
   * @param {Array} resolutions - Resolution operations
   * @returns {Array} - Array of achievement messages
   */
  generateLLMAchievements(resolutions) {
    return resolutions.map(resolution => {
      switch (resolution.type) {
        case 'menu_item':
          return `You correctly identified that "${resolution.original}" refers to "${resolution.corrected}" from our menu`;
          
        case 'modifier':
          return `You recognized that "${resolution.original}" should be "${resolution.corrected}" for the customer's order`;
          
        case 'smart_consolidation':
          return `You optimized the order by converting "${resolution.original}" into a modifier, saving the customer money`;
          
        default:
          return `You successfully corrected "${resolution.original}" to "${resolution.corrected}"`;
      }
    });
  }

  /**
   * Generate clean order summary
   * @param {Array} correctedCart - The corrected cart items
   * @returns {Object} - Clean order summary
   */
  generateOrderSummary(correctedCart) {
    if (!correctedCart || !Array.isArray(correctedCart)) {
      return { items: [], total_items: 0 };
    }

    return {
      items: correctedCart.map(item => ({
        name: item.item_name || item.name,
        quantity: item.quantity,
        modifiers: item.modifiers || []
      })),
      total_items: correctedCart.length
    };
  }

  /**
   * Create standard success response (fallback)
   * @param {Object} criticResult - Original critic result
   * @returns {Object} - Standard success response
   */
  createStandardSuccessResponse(criticResult) {
    return {
      success: true,
      message: "Order updated successfully"
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

module.exports = { SuccessResponseTransformer };
