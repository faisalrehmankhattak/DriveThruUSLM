/**
 *  ItemModifierMappingService
 * Meta-level service for intelligent item-to-modifier relationship mapping
 * 
 * Provides the core intelligence for modifierMappingAction by:
 * - Building lookup tables for item-modifier relationships
 * - Identifying compatible items for modifier attachment
 * - Validating modifier attachment rules
 */

const { getMenuDataService } = require('../data/menuDataService');

class ItemModifierMappingService {
  constructor() {
    this.menuService = getMenuDataService();
    this.itemModifierLookup = null; // Cache for performance
    this.modifierItemLookup = null; // Reverse lookup cache
  }

  /**
   * Build comprehensive item-modifier lookup tables
   * Creates bidirectional mapping for efficient queries
   */
  async buildLookupTables() {
    if (this.itemModifierLookup && this.modifierItemLookup) {
      return; // Already built, use cache
    }

    const menuData = await this.menuService.getData();
    
    // itemName -> Set of compatible itemIds
    this.modifierItemLookup = new Map();
    
    // itemId -> Set of modifier option names
    this.itemModifierLookup = new Map();

    menuData.items.forEach(item => {
      const compatibleModifiers = new Set();
      
      if (item.modifiers && Array.isArray(item.modifiers)) {
        item.modifiers.forEach(modifier => {
          if (modifier.options && Array.isArray(modifier.options)) {
            modifier.options.forEach(option => {
              // Skip "None", "No X" options - these aren't real items
              if (!this.isNegativeOption(option)) {
                compatibleModifiers.add(option);
                
                // Build reverse lookup: modifierName -> compatible itemIds
                if (!this.modifierItemLookup.has(option)) {
                  this.modifierItemLookup.set(option, new Set());
                }
                this.modifierItemLookup.get(option).add(item.id);
              }
            });
          }
        });
      }

      this.itemModifierLookup.set(item.id, compatibleModifiers);
    });
  }

  /**
   * Check if option represents a negative/empty choice
   */
  isNegativeOption(option) {
    const negativePatterns = [
      /^no\s/i,           // "No Dips"
      /^none$/i,          // "None" 
      /without/i,         // "Without X"
      /\soff$/i,          // "Sauce off"
      /^regular$/i        // Skip "Regular" as it's usually default
    ];
    
    return negativePatterns.some(pattern => pattern.test(option));
  }

  /**
   * Find compatible items for a given standalone item
   * Returns items that can accept this item as a modifier
   * 
   * @param {Object} standaloneItem - Item to find compatibility for
   * @param {Array} cartItems - Current items in the cart
   * @returns {Array} Compatible items in order of preference
   */
  async findCompatibleItems(standaloneItem, cartItems) {
    await this.buildLookupTables();
    
    const itemName = standaloneItem.itemName;
    const compatibleItemIds = this.modifierItemLookup.get(itemName);
    
    if (!compatibleItemIds || compatibleItemIds.size === 0) {
      return []; // No compatible items found
    }

    // Filter cart items to find actual compatible targets
    const compatibleCartItems = cartItems.filter(cartItem => 
      compatibleItemIds.has(cartItem.itemId) && 
      cartItem !== standaloneItem // Don't attach to itself
    );

    // Sort by preference: closest (last) occurrence wins for sequential processing
    return compatibleCartItems.sort((a, b) => {
      const aIndex = cartItems.indexOf(a);
      const bIndex = cartItems.indexOf(b);
      return bIndex - aIndex; // Reverse order: closest item first
    });
  }

  /**
   * Validate if a modifier attachment is valid
   * Checks business rules and constraints
   */
  async validateModifierAttachment(targetItem, modifierItem, config = {}) {
    await this.buildLookupTables();

    // Rule 1: Respect the configured quantity threshold
    const maxQuantity = config.skipQuantityThreshold || 1;
    if (modifierItem.quantity > maxQuantity) {
      return {
        valid: false,
        reason: 'QUANTITY_TOO_HIGH',
        message: `Cannot convert item with quantity ${modifierItem.quantity} to modifier (max: ${maxQuantity})`
      };
    }

    // Rule 2: Target item must support this modifier
    const targetCompatibleModifiers = this.itemModifierLookup.get(targetItem.itemId);
    if (!targetCompatibleModifiers || !targetCompatibleModifiers.has(modifierItem.itemName)) {
      return {
        valid: false,
        reason: 'INCOMPATIBLE_MODIFIER',
        message: `${modifierItem.itemName} is not a valid modifier for ${targetItem.itemName}`
      };
    }

    // Rule 3: Check if modifier already exists (avoid duplicates)
    const existingModifier = this.findExistingModifier(targetItem, modifierItem.itemName);
    if (existingModifier) {
      return {
        valid: false,
        reason: 'MODIFIER_ALREADY_EXISTS',
        message: `${modifierItem.itemName} already attached to ${targetItem.itemName}`,
        existingModifier
      };
    }

    return {
      valid: true,
      message: `${modifierItem.itemName} can be attached to ${targetItem.itemName}`
    };
  }

  /**
   * Find existing modifier in target item
   */
  findExistingModifier(targetItem, modifierName) {
    if (!targetItem.modifiers || !Array.isArray(targetItem.modifiers)) {
      return null;
    }

    return targetItem.modifiers.find(mod => 
      mod.selected === modifierName || 
      mod.modifierName === modifierName
    );
  }

  /**
   * Determine which modifier category this item belongs to
   * Used for proper modifier structure
   */
  async getModifierCategoryForItem(targetItemId, modifierItemName) {
    await this.buildLookupTables();
    
    const menuData = await this.menuService.getData();
    const targetItem = menuData.items.find(item => item.id === targetItemId);
    
    if (!targetItem || !targetItem.modifiers) {
      return null;
    }

    // Find the modifier category that contains this option
    for (const modifier of targetItem.modifiers) {
      if (modifier.options && modifier.options.includes(modifierItemName)) {
        return {
          id: modifier.id,
          name: modifier.name,
          maxAmount: modifier.maxAmount || 1,
          priceAdjustment: modifier.priceAdjustment || {}
        };
      }
    }

    return null;
  }

  /**
   * Get comprehensive mapping statistics for debugging/analytics
   */
  async getMappingStats() {
    await this.buildLookupTables();
    
    return {
      totalItems: this.itemModifierLookup.size,
      totalModifierOptions: this.modifierItemLookup.size,
      averageModifiersPerItem: Array.from(this.itemModifierLookup.values())
        .reduce((sum, modifiers) => sum + modifiers.size, 0) / this.itemModifierLookup.size,
      topModifierOptions: Array.from(this.modifierItemLookup.entries())
        .map(([option, items]) => ({ option, compatibleItems: items.size }))
        .sort((a, b) => b.compatibleItems - a.compatibleItems)
        .slice(0, 10)
    };
  }
}

// Singleton pattern for performance
let mappingServiceInstance = null;

function getItemModifierMappingService() {
  if (!mappingServiceInstance) {
    mappingServiceInstance = new ItemModifierMappingService();
  }
  return mappingServiceInstance;
}

module.exports = {
  ItemModifierMappingService,
  getItemModifierMappingService
};
