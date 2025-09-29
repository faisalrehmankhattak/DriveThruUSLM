/**
 * Order Consolidation Action
 * 
 * Converted from 280+ lines of ActionExecutor boilerplate to business logic
 * Maintains 100% compatibility with existing tests and functionality
 */

const { createAction } = require('../../../core/adapters');

/**
 *  Consolidation logic
 */
const consolidateOrder = createAction('order_consolidation', (order, config) => {
  // Default configuration (preserved from original)
  const settings = {
    skipConsolidationForSingleItems: false,
    preserveItemOrder: true,
    enablePerformanceLogging: true,
    ...config
  };
  
  const originalItemCount = order.items?.length || 0;
  
  // Handle empty order
  if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
    return {
      success: true,
      order: order,
      problems: [], // No problems for empty orders
      metadata: {
        itemsProcessed: 0,
        consolidationPerformed: false,
        originalItemCount: 0,
        consolidatedItemCount: 0,
        groupsConsolidated: 0,
        itemsReduced: 0,
        consolidationSummary: { totalGroups: 0, consolidatedGroups: 0, itemsReduced: 0 }
      },
      operationData: {
        itemCount: 0,
        originalCount: 0,
        finalCount: 0,
        duplicateCount: 0
      }
    };
  }
  
  // Group items by identity signature
  const identityGroups = groupByIdentity(order.items);
  const consolidatedGroups = countConsolidatedGroups(identityGroups);
  
  // Skip consolidation if no duplicates found
  if (settings.skipConsolidationForSingleItems && consolidatedGroups === 0) {
    return {
      success: true,
      order: order,
      problems: [],
      metadata: {
        itemsProcessed: originalItemCount,
        consolidationPerformed: false,
        originalItemCount: originalItemCount,
        consolidatedItemCount: originalItemCount,
        groupsConsolidated: 0,
        itemsReduced: 0,
        consolidationSummary: getConsolidationSummary(identityGroups)
      },
      operationData: {
        itemCount: originalItemCount,
        originalCount: originalItemCount,
        finalCount: originalItemCount,
        duplicateCount: 0
      }
    };
  }
  
  // Perform consolidation
  const consolidatedItems = consolidateItems(identityGroups, settings);
  const finalItemCount = consolidatedItems.length;
  const itemsReduced = originalItemCount - finalItemCount;
  
  const updatedOrder = {
    ...order,
    items: consolidatedItems
  };
  
  // Determine operation data based on whether consolidation occurred
  let operationData;
  if (itemsReduced > 0) {
    operationData = {
      originalCount: originalItemCount,
      finalCount: finalItemCount,
      duplicateCount: itemsReduced
    };
  } else {
    operationData = {
      itemCount: originalItemCount,
      originalCount: originalItemCount,
      finalCount: finalItemCount,
      duplicateCount: 0
    };
  }
  
  return {
    success: true,
    order: updatedOrder,
    problems: [], // Consolidation never fails
    metadata: {
      itemsProcessed: originalItemCount,
      consolidationPerformed: itemsReduced > 0,
      originalItemCount: originalItemCount,
      consolidatedItemCount: finalItemCount,
      groupsConsolidated: countConsolidatedGroups(identityGroups),
      itemsReduced: itemsReduced,
      consolidationSummary: getConsolidationSummary(identityGroups)
    },
    operationData
  };
});

/**
 * Helper functions (extracted from original action)
 */
function groupByIdentity(items) {
  const groups = new Map();
  
  items.forEach((item, index) => {
    const signature = createItemSignature(item);
    
    if (!groups.has(signature)) {
      groups.set(signature, []);
    }
    
    groups.get(signature).push({
      ...item,
      originalIndex: index
    });
  });
  
  return groups;
}

function createItemSignature(item) {
  // Create a unique signature for item identity
  const baseSignature = `${item.itemId || 'unknown'}_${item.itemName || 'unknown'}`;
  
  if (!item.modifiers || item.modifiers.length === 0) {
    return baseSignature;
  }
  
  // Sort modifiers to handle order independence, but ignore counts for consolidation
  const sortedModifiers = [...item.modifiers]
    .sort((a, b) => {
      const aKey = a.selected || a.modifierName || '';
      const bKey = b.selected || b.modifierName || '';
      return aKey.localeCompare(bKey);
    })
    .map(mod => mod.selected || mod.modifierName || '')
    .join('|');
  
  return `${baseSignature}_[${sortedModifiers}]`;
}

function countConsolidatedGroups(identityGroups) {
  let consolidatedGroups = 0;
  for (const group of identityGroups.values()) {
    if (group.length > 1) {
      consolidatedGroups++;
    }
  }
  return consolidatedGroups;
}

function consolidateItems(identityGroups, config) {
  const consolidatedItems = [];
  
  // Convert groups to consolidated items
  for (const group of identityGroups.values()) {
    if (group.length === 1) {
      // Single item, no consolidation needed
      const item = { ...group[0] };
      item.originalOrder = item.originalIndex;
      delete item.originalIndex;
      consolidatedItems.push(item);
    } else {
      // Multiple items, consolidate them
      const mergedItem = mergeItemGroup(group);
      consolidatedItems.push(mergedItem);
    }
  }
  
  // Sort by original order if preserveItemOrder is enabled
  if (config.preserveItemOrder) {
    consolidatedItems.sort((a, b) => a.originalOrder - b.originalOrder);
  }
  
  return consolidatedItems;
}

function mergeItemGroup(group) {
  // Use the first item as the base
  const baseItem = group[0];
  const totalQuantity = group.reduce((sum, item) => sum + (item.quantity || 1), 0);
  
  // Merge modifiers by combining counts
  let mergedModifiers = [];
  if (baseItem.modifiers && baseItem.modifiers.length > 0) {
    // Create a map to track modifier counts
    const modifierMap = new Map();
    
    // Process all items in the group
    group.forEach(item => {
      if (item.modifiers) {
        item.modifiers.forEach(modifier => {
          const key = modifier.selected || modifier.modifierName || '';
          const currentCount = modifier.count || 1;
          
          if (modifierMap.has(key)) {
            modifierMap.set(key, {
              ...modifierMap.get(key),
              count: modifierMap.get(key).count + currentCount
            });
          } else {
            modifierMap.set(key, {
              ...modifier,
              count: currentCount
            });
          }
        });
      }
    });
    
    // Convert back to array
    mergedModifiers = Array.from(modifierMap.values());
  }
  
  // Create merged item
  const mergedItem = {
    ...baseItem,
    quantity: totalQuantity,
    modifiers: mergedModifiers,
    originalOrder: baseItem.originalIndex // Use first item's position
  };
  
  // Clean up temporary properties
  delete mergedItem.originalIndex;
  
  return mergedItem;
}

function getConsolidationSummary(identityGroups) {
  const totalGroups = identityGroups.size;
  let consolidatedGroups = 0;
  let itemsReduced = 0;
  
  for (const group of identityGroups.values()) {
    if (group.length > 1) {
      consolidatedGroups++;
      itemsReduced += group.length - 1; // Reduced by (group size - 1)
    }
  }
  
  return {
    totalGroups,
    consolidatedGroups,
    itemsReduced
  };
}

/**
 * Export Business logic action with original class interface for compatibility
 */
class ConsolidateOrderAction {
  constructor() {
    this.actionType = 'order_consolidation';
    this.actionName = 'Order Consolidation';
    this.defaultConfig = {
      skipConsolidationForSingleItems: false,
      preserveItemOrder: true,
      enablePerformanceLogging: true
    };
  }
  
  async execute(request) {
    return await consolidateOrder.execute(request);
  }
  
  async processAction(request) {
    return await this.execute(request);
  }
  
  getMetadata() {
    return {
      name: this.actionType,
      type: 'transformation',
      supportsUniversalInterface: true,
      version: '1.0.0',
      description: 'Consolidates duplicate items in orders',
      capabilities: ['item_consolidation', 'duplicate_removal', 'quantity_merging'],
      errorTypes: ['SYSTEM_ERROR'],
      warningTypes: [],
      performance: {
        expectedTimePerOrder: '1-5ms',
        scalability: 'O(n log n) where n = number of items'
      }
    };
  }
  
  // Helper methods for test compatibility
  groupByIdentity(items) {
    return groupByIdentity(items);
  }
  
  createItemSignature(item) {
    return createItemSignature(item);
  }
  
  consolidateItems(identityGroups, config) {
    return consolidateItems(identityGroups, config);
  }
  
  countConsolidatedGroups(identityGroups) {
    return countConsolidatedGroups(identityGroups);
  }
  
  getConsolidationSummary(identityGroups) {
    return getConsolidationSummary(identityGroups);
  }
}

module.exports = ConsolidateOrderAction;
