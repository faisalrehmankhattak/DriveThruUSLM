/**
 * Modifier Resolver Action
 * Automatically fixes modifier errors using Business logic approach
 * Converted to Business logic createAction pattern
 */

const { createAction } = require('../../../core/adapters');
const { getSearchService } = require('../../../infrastructure/data/searchEngine');
const { getMenuDataService } = require('../../../infrastructure/data/menuDataService');

// Helper function: Find modifier errors from context
const findModifierErrors = (context) => {
  if (!context || !context.errors) {
    return [];
  }

  return context.errors.filter(error => 
    error.code === 'MODIFIER_NAME_NOT_FOUND' || 
    (error.errorCode && error.errorCode === 'MODIFIER_NAME_NOT_FOUND')
  );
};

// Helper function: Resolve a single modifier using search service
const resolveModifierSingle = async (modifierName, itemId, config, searchService) => {
  if (!modifierName) {
    return { success: false, reason: 'No modifier name provided' };
  }

  try {
    // Get menu data to find the specific menu item
    const menuService = getMenuDataService();
    
    // Get the menu item modifiers
    const itemModifiers = await menuService.getItemModifiers(parseInt(itemId));
    if (!itemModifiers || itemModifiers.size === 0) {
      return { 
        success: false, 
        reason: `Menu item with ID ${itemId} not found or has no modifiers` 
      };
    }
    
    // Create menu item structure expected by findModifiers
    const menuItem = {
      id: parseInt(itemId),
      modifiers: Array.from(itemModifiers.values())
    };

    // Call findModifiers with correct parameters: (menuItem, modifierQuery, options)
    const result = searchService.findModifiers(menuItem, modifierName, {
      minSimilarity: config.minConfidence || 0.3,
      maxDistance: 3
    });

    if (result && result.confidence >= (config.minConfidence || 0.3)) {
      return {
        success: true,
        correctedName: result.selectedOption,
        correctedId: result.modifierId,
        modifierName: result.modifierName,
        confidence: result.confidence,
        originalName: modifierName
      };
    }

    return { 
      success: false, 
      reason: `No matches found above confidence threshold (${config.minConfidence || 0.3})` 
    };
  } catch (error) {
    return { 
      success: false, 
      reason: `Search error: ${error.message}` 
    };
  }
};

// Helper function: Update order with resolved modifier
const updateOrderWithResolution = (order, error, resolution) => {
  const updatedOrder = { ...order };
  
  // Find the modifier to update based on error context
  if (error.itemIndex !== undefined && error.modifierIndex !== undefined) {
    const item = updatedOrder.items[error.itemIndex];
    if (item && item.modifiers && item.modifiers[error.modifierIndex]) {
      item.modifiers[error.modifierIndex] = {
        ...item.modifiers[error.modifierIndex],
        selected: resolution.correctedName,
        modifierId: resolution.correctedId
      };
    }
  }

  return updatedOrder;
};

// Business logic action: Core business logic
const resolveModifier = createAction('modifier_resolution', async (order, config, request) => {
  // Default configuration
  const defaultConfig = {
    minConfidence: 0.3,
    strict: false,
    logResolutions: true,
    enablePerformanceLogging: true
  };

  const mergedConfig = { ...defaultConfig, ...config };
  const searchService = getSearchService();
  
  // Check if there are modifier errors to resolve
  const modifierErrors = findModifierErrors(request.context);
  
  if (modifierErrors.length === 0) {
    return {
      success: true,
      order: order,
      operationData: {
        reason: 'No modifier errors to resolve',
        resolvedCount: 0,
        totalErrors: 0
      },
      metadata: {
        modifierResolutionAttempted: false,
        resolvedCount: 0,
        totalErrors: 0,
        resolutionTime: 0,
        reason: 'No modifier errors to resolve'
      },
      // Add reason at top level for test compatibility
      reason: 'No modifier errors to resolve'
    };
  }

  let resolvedCount = 0;
  let attemptsCount = 0;
  let updatedOrder = { ...order };
  const resolutionStartTime = Date.now();
  let resolutionDetails = [];

  // Attempt to resolve each error
  for (const error of modifierErrors) {
    const modifierName = error.context?.modifierName || error.selected;
    const itemId = error.context?.itemId || error.itemId;
    
    // Skip errors without modifier name or itemId (handle gracefully)
    if (!modifierName || !itemId) {
      continue;
    }
    
    attemptsCount++;
    const resolution = await resolveModifierSingle(modifierName, itemId, mergedConfig, searchService);
    
    if (resolution.success) {
      // Update the order with the resolved modifier
      updatedOrder = updateOrderWithResolution(updatedOrder, error, resolution);
      resolvedCount++;
      resolutionDetails.push({
        originalOption: modifierName,
        resolvedOption: resolution.correctedName,
        modifierName: resolution.modifierName || 'unknown'
      });
    } else {
      resolutionDetails.push({
        originalOption: modifierName,
        resolvedOption: null,
        modifierName: 'unknown',
        reason: resolution.reason
      });
    }
  }

  const resolutionTime = Date.now() - resolutionStartTime;

  return {
    success: true, // Always succeed, resolution success is tracked in metadata
    order: updatedOrder,
    operationData: {
      resolvedCount,
      totalErrors: modifierErrors.length,
      originalOption: resolutionDetails.length > 0 ? resolutionDetails[0].originalOption : undefined,
      resolvedOption: resolutionDetails.length > 0 ? resolutionDetails[0].resolvedOption : undefined,
      modifierName: resolutionDetails.length > 0 ? resolutionDetails[0].modifierName : undefined,
      reason: resolvedCount === 0 ? 'No resolutions found' : null
    },
    metadata: {
      modifierResolutionAttempted: attemptsCount > 0,
      resolvedCount,
      totalErrors: modifierErrors.length,
      modifiersResolved: resolvedCount,
      modifiersFailed: modifierErrors.length - resolvedCount,
      resolutionTime,
      modifierResolutionTime: resolutionTime
    }
  };
});

// Compatibility wrapper class for existing imports
class ResolveModifierAction {
  constructor() {
    this.actionType = 'modifier_resolution';
    this.type = 'resolution';
  }

  async execute(request) {
    return resolveModifier.execute(request);
  }

  async processAction(request) {
    return this.execute(request);
  }

  getMetadata() {
    return {
      name: this.actionType,
      type: this.type,
      actionName: 'modifier_resolution',
      actionType: 'resolution',
      description: 'Automatically resolves modifier name mismatches using AI search',
      dependencies: ['SearchEngine', 'MenuDataService'],
      errorCodes: ['MODIFIER_NAME_NOT_FOUND'],
      searchMethods: ['findModifiers'],
      capabilities: ['typo_correction', 'fuzzy_search', 'modifier_lookup', 'ai_resolution'],
      errorTypes: ['MODIFIER_RESOLUTION_ERROR', 'SYSTEM_ERROR'],
      warningTypes: ['MODIFIER_RESOLUTION_WARNING'],
      performance: {
        expectedTimePerOrder: '50-500ms',
        scalability: 'O(n) where n = number of modifier errors to resolve'
      }
    };
  }
}

module.exports = { ResolveModifierAction };