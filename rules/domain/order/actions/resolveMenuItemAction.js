/**
 * Business logic Menu Item Resolution Action
 * 
 * Converted from 280+ lines of ActionExecutor boilerplate to business logic
 * Maintains 100% compatibility with existing tests and functionality
 */

const { createAction } = require('../../../core/adapters');
const { getSearchService } = require('../../../infrastructure/data/searchEngine');

/**
 *  Business logic (menu item resolution)
 */
const resolveMenuItem = createAction('menu_item_resolution', async (order, config, request) => {
  // Default configuration (preserved from original)
  const settings = {
    minConfidence: 0.01,
    enablePerformanceLogging: true,
    strict: false,
    ...config
  };
  
  const problems = [];
  
  // Check if there are menu item errors to resolve
  const menuItemErrors = findMenuItemErrors(request.context || {});
  
  if (menuItemErrors.length === 0) {
    return {
      success: true,
      problems: [],
      metadata: {
        resolutionAttempted: false,
        menuItemsResolved: 0,
        menuItemsFailed: 0,
        resolutionTime: 0,
        reason: 'No menu item errors to resolve'
      },
      operationData: {
        reason: 'No menu item errors to resolve',
        resolvedCount: 0,
        totalErrors: 0
      }
    };
  }

  let resolvedCount = 0;
  let attemptsCount = 0;
  let updatedOrder = { ...order };
  const resolutionStartTime = Date.now();
  const searchService = getSearchService();
  let resolutionDetails = [];

  // Attempt to resolve each error
  for (const error of menuItemErrors) {
    const itemName = error.context?.itemName || error.itemName;
    
    // Skip errors without itemName (handle gracefully)
    if (!itemName) {
      continue;
    }
    
    attemptsCount++;
    const resolution = await resolveMenuItemSingle(itemName, settings, searchService);
    
    if (resolution.success) {
      // Update the order with the resolved item
      updatedOrder = updateOrderWithResolution(updatedOrder, error, resolution);
      resolvedCount++;
      resolutionDetails.push({
        originalName: itemName,
        resolvedName: resolution.correctedName,
        confidence: resolution.confidence
      });
    } else {
      resolutionDetails.push({
        originalName: itemName,
        resolvedName: null,
        confidence: 0,
        reason: resolution.reason
      });
    }
  }

  const resolutionTime = Date.now() - resolutionStartTime;

  return {
    success: true, // Always succeed, resolution success tracked in metadata
    order: updatedOrder,
    problems,
    metadata: {
      resolutionAttempted: attemptsCount > 0,
      menuItemsResolved: resolvedCount,
      menuItemsFailed: attemptsCount - resolvedCount,
      resolutionTime: resolutionTime,
      modifierResolutionTime: resolutionTime, // For compatibility
      reason: attemptsCount === 0 ? 'No valid errors to process' : undefined
    },
    operationData: {
      resolvedCount: resolvedCount,
      totalErrors: menuItemErrors.length,
      originalName: resolutionDetails.length > 0 ? resolutionDetails[0].originalName : undefined,
      resolvedName: resolutionDetails.length > 0 ? resolutionDetails[0].resolvedName : undefined,
      confidence: resolutionDetails.length > 0 ? resolutionDetails[0].confidence : undefined,
      reason: resolvedCount > 0 ? `Resolved ${resolvedCount} menu items` : 'No items resolved'
    }
  };
});

/**
 * Helper functions (extracted from original action)
 */
function findMenuItemErrors(context) {
  if (!context || !context.errors) {
    return [];
  }

  return context.errors.filter(error => 
    error.code === 'MENU_ITEM_NAME_NOT_FOUND' || 
    (error.errorCode && error.errorCode === 'MENU_ITEM_NAME_NOT_FOUND')
  );
}

async function resolveMenuItemSingle(itemName, config, searchService) {
  if (!itemName) {
    return { success: false, reason: 'No item name provided' };
  }

  try {
    const bestMatch = await searchService.findCanonical(itemName);

    if (bestMatch && bestMatch.score >= config.minConfidence) {
      return {
        success: true,
        correctedName: bestMatch.name,
        correctedId: bestMatch.id,
        confidence: bestMatch.score,
        originalName: itemName
      };
    }

    return { 
      success: false, 
      reason: `No matches found above confidence threshold (${config.minConfidence})` 
    };
  } catch (error) {
    return { 
      success: false, 
      reason: `Search error: ${error.message}` 
    };
  }
}

function updateOrderWithResolution(order, error, resolution) {
  const updatedOrder = { ...order };
  
  // Find the item to update based on error context
  if (updatedOrder.items && Array.isArray(updatedOrder.items)) {
    const itemIndex = error.context?.itemIndex;
    
    if (itemIndex !== undefined && updatedOrder.items[itemIndex]) {
      // Update the specific item
      updatedOrder.items[itemIndex] = {
        ...updatedOrder.items[itemIndex],
        itemName: resolution.correctedName,
        itemId: resolution.correctedId
      };
    } else {
      // Try to find by name match
      const itemToUpdate = updatedOrder.items.find(item => 
        item.itemName === resolution.originalName
      );
      
      if (itemToUpdate) {
        itemToUpdate.itemName = resolution.correctedName;
        itemToUpdate.itemId = resolution.correctedId;
      }
    }
  }
  
  return updatedOrder;
}

/**
 * Export Business logic action with original class interface for compatibility
 */
class ResolveMenuItemAction {
  constructor() {
    this.actionType = 'menu_item_resolution';
    this.actionName = 'Menu Item Resolution';
    this.searchService = getSearchService();
    this.defaultConfig = {
      minConfidence: 0.01,
      enablePerformanceLogging: true,
      strict: false
    };
  }
  
  async execute(request) {
    return await resolveMenuItem.execute(request);
  }
  
  async processAction(request) {
    return await this.execute(request);
  }
  
  getMetadata() {
    return {
      name: this.actionType,
      type: 'resolution',
      supportsUniversalInterface: true,
      version: '1.0.0',
      actionName: 'menu_item_resolution',
      actionType: 'resolution',
      description: 'Resolves menu item typos using AI-powered search',
      dependencies: ['SearchEngine'],
      searchMethods: ['findCanonical'],
      errorCodes: ['MENU_ITEM_NAME_NOT_FOUND', 'MENU_ITEM_RESOLUTION_ERROR', 'SYSTEM_ERROR'],
      capabilities: ['typo_correction', 'ai_search', 'confidence_scoring'],
      errorTypes: ['MENU_ITEM_RESOLUTION_ERROR', 'SYSTEM_ERROR'],
      warningTypes: ['MENU_ITEM_RESOLUTION_WARNING'],
      performance: {
        expectedTimePerOrder: '100-500ms',
        scalability: 'O(n) where n = number of errors to resolve'
      }
    };
  }
  
  // Helper methods for test compatibility
  findMenuItemErrors(context) {
    return findMenuItemErrors(context);
  }
  
  async resolveMenuItem(itemName, config) {
    return await resolveMenuItemSingle(itemName, config, this.searchService);
  }
  
  updateOrderWithResolution(order, error, resolution) {
    return updateOrderWithResolution(order, error, resolution);
  }
}

module.exports = { ResolveMenuItemAction };
