/**
 * Modifier Validation Action
 * Validates that modifiers match available modifiers for each specific item using Business logic approach
 * Converted to Business logic createAction pattern
 */

const { createAction } = require('../../../core/adapters');
const { getMenuDataService } = require('../../../infrastructure/data/menuDataService');

// Helper function: Validate a single modifier
const validateSingleModifier = (modifier, modIndex, itemModifierMap, item, config) => {
  const errors = [];
  
  // Check if modifier has required fields
  if (!modifier.modifierId || !modifier.selected) {
    errors.push(`Item "${item.itemName}" modifier ${modIndex + 1}: Missing modifierId or selected`);
    return { isValid: false, errors };
  }

  // Check if modifier exists for this item
  const modifierId = parseInt(modifier.modifierId);
  const modifierDetails = itemModifierMap.get(modifierId);
  
  if (!modifierDetails) {
    errors.push(`Modifier ID ${modifierId} not available for item "${item.itemName}"`);
    return { isValid: false, errors };
  }

  // Check if selected option is valid
  const validOptions = modifierDetails.options || [];
  
  let isValidOption;
  if (config.strict) {
    // Strict mode: exact case-sensitive match
    isValidOption = validOptions.some(option => option === modifier.selected);
  } else {
    // Lenient mode: case-insensitive match
    isValidOption = validOptions.some(option => 
      option.toLowerCase() === modifier.selected.toLowerCase()
    );
  }

  if (!isValidOption) {
    if (config.strict) {
      // In strict mode, provide more specific error about case sensitivity
      const caseInsensitiveMatch = validOptions.find(option => 
        option.toLowerCase() === modifier.selected.toLowerCase()
      );
      if (caseInsensitiveMatch) {
        errors.push(`Modifier "${modifier.selected}" has incorrect case. Expected: "${caseInsensitiveMatch}" for "${modifierDetails.name}" on item "${item.itemName}"`);
      } else {
        errors.push(`Modifier "${modifier.selected}" not available for "${modifierDetails.name}" on item "${item.itemName}"`);
      }
    } else {
      errors.push(`Modifier "${modifier.selected}" not available for "${modifierDetails.name}" on item "${item.itemName}"`);
    }
    return { isValid: false, errors };
  }

  return { isValid: errors.length === 0, errors };
};

// Business logic action: Core business logic
const validateModifier = createAction('modifier_validation', async (order, config) => {
  // Default configuration
  const defaultConfig = {
    strict: true,
    addSuggestionsAsWarnings: true,
    enablePerformanceLogging: true,
    validateModifierIds: true,
    requireAllModifiersValid: true
  };

  const mergedConfig = { ...defaultConfig, ...config };
  const menuService = getMenuDataService();
  
  let validModifiers = 0;
  let invalidModifiers = 0;
  let itemsProcessed = 0;
  let modifiersProcessed = 0;
  const problems = [];
  const validatedItems = [];
  const invalidItems = [];
  let failedModifierNames = [];
  let failedItemNames = [];

  // Get menu indexes
  const indexes = await menuService.getIndexes();

  // Validate modifiers for each item
  for (let itemIndex = 0; itemIndex < order.items.length; itemIndex++) {
    const item = order.items[itemIndex];
    itemsProcessed++;
    let itemHasInvalidModifiers = false;

    if (!item.modifiers || item.modifiers.length === 0) {
      validatedItems.push(item); // Items without modifiers are valid
      continue;
    }

    const itemModifierMap = indexes.itemModifiersMap.get(parseInt(item.itemId));
    
    if (!itemModifierMap) {
      // Item doesn't support modifiers
      modifiersProcessed += item.modifiers.length;
      invalidModifiers += item.modifiers.length;
      itemHasInvalidModifiers = true;
      problems.push(`Item "${item.itemName}" (ID: ${item.itemId}) does not support modifiers`);
      // Track failed modifiers for this item
      item.modifiers.forEach(mod => {
        failedModifierNames.push(mod.selected || mod.modifierName || 'unknown');
        failedItemNames.push(item.itemName);
      });
      } else {
      // Validate each modifier
      for (let modIndex = 0; modIndex < item.modifiers.length; modIndex++) {
        const modifier = item.modifiers[modIndex];
        modifiersProcessed++;
        
        const validation = validateSingleModifier(modifier, modIndex, itemModifierMap, item, mergedConfig);
        
        if (validation.isValid) {
          validModifiers++;
        } else {
          invalidModifiers++;
          itemHasInvalidModifiers = true;
          problems.push(...validation.errors);
          // Track failed modifier details
          failedModifierNames.push(modifier.selected || modifier.modifierName || 'unknown');
          failedItemNames.push(item.itemName);
        }
      }
    }
    
    // Track items by validation status
    if (itemHasInvalidModifiers) {
      invalidItems.push(item);
    } else {
      validatedItems.push(item);
      }
    }

    return {
    success: invalidModifiers === 0,
    problems,
    operationData: {
      itemCount: itemsProcessed,
      modifierCount: modifiersProcessed,
      validModifiers: validModifiers,
      invalidModifiers: invalidModifiers,
      modifierName: failedModifierNames.length > 0 ? failedModifierNames[0] : undefined,
      itemName: failedItemNames.length > 0 ? failedItemNames[0] : undefined,
      itemId: failedItemNames.length > 0 ? order.items.find(item => item.itemName === failedItemNames[0])?.itemId : undefined,
      modifierId: undefined, // Will be set when we track individual modifier failures
      failedModifierNames: failedModifierNames.join(', '),
      failedItemNames: failedItemNames.join(', '),
      reason: problems.length > 0 ? problems.join('; ') : null
    },
    metadata: {
      itemsProcessed,
      modifiersProcessed,
      validModifiers,
      invalidModifiers,
      validatedItems,
      invalidItems,
      modifiersFound: validModifiers,
      modifiersNotFound: invalidModifiers,
      validationSuccess: invalidModifiers === 0
    }
  };
});

// Compatibility wrapper class for existing imports
class ValidateModifierAction {
  constructor() {
    this.actionType = 'modifier_validation';
    this.type = 'validation';
  }

  async execute(request) {
    return validateModifier.execute(request);
  }

  async processAction(request) {
    return this.execute(request);
  }

  getMetadata() {
    return {
      name: this.actionType,
      type: this.type,
      description: 'Validates that modifiers exist and are valid for specific menu items',
      capabilities: ['modifier_lookup', 'item_modifier_validation', 'option_validation'],
      errorTypes: ['MODIFIER_VALIDATION_ERROR', 'SYSTEM_ERROR'],
      warningTypes: ['MODIFIER_VALIDATION_WARNING'],
      performance: {
        expectedTimePerOrder: '10-50ms',
        scalability: 'O(n*m) where n = items, m = modifiers per item'
      }
    };
  }
}

module.exports = ValidateModifierAction;