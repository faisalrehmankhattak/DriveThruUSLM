const fs = require('fs');
const path = require('path');

/**
 * Optimized menu data loading service with async initialization and caching
 * Based on senior audit recommendations for performance optimization
 */
class MenuDataService {
  constructor(menuPath = null) {
    this.menuPath = menuPath || path.join(__dirname, '../../../menu/large/menu-data.json');
    this._data = null;
    this._loading = null;
    this._indexes = null;
    this._warmCache();
  }

  /**
   * Warm cache on instantiation - non-blocking
   */
  async _warmCache() {
    if (this._loading) return this._loading;
    
    this._loading = this._loadMenuData();
    this._data = await this._loading;
    this._indexes = this._buildIndexes(this._data);
    return this._data;
  }

  /**
   * Get menu data - returns cached data or loads if not available
   */
  async getData() {
    if (this._data) return this._data;
    return this._warmCache();
  }

  /**
   * Get pre-built indexes for efficient lookups
   */
  async getIndexes() {
    if (this._indexes) return this._indexes;
    await this._warmCache();
    return this._indexes;
  }

  /**
   * Load menu data from file system asynchronously
   */
  async _loadMenuData() {
    const startTime = process.hrtime.bigint();
    
    try {
      const data = await fs.promises.readFile(this.menuPath, 'utf8');
      const parsed = JSON.parse(data);
      
      const loadTime = Number(process.hrtime.bigint() - startTime) / 1e6;
      console.log(` Menu data loaded in ${loadTime.toFixed(2)}ms`);
      
      return parsed;
    } catch (error) {
      console.error(' Failed to load menu data:', error);
      throw error;
    }
  }

  /**
   * Build efficient lookup indexes for menu operations
   */
  _buildIndexes(menuData) {
    const startTime = process.hrtime.bigint();
    
    const indexes = {
      // For isMenuItemExists rule
      menuItemsMap: new Map(),
      nameToIdsMap: new Map(),
      idToItemMap: new Map(),
      
      // For isItemModifierExists rule
      itemModifiersMap: new Map(),
      modifierLookupMap: new Map()
    };

    // Build menu item indexes
    for (const item of menuData.items || []) {
      const itemId = parseInt(item.id);
      const itemName = item.name;

      // menuItemsMap: itemId -> itemName
      indexes.menuItemsMap.set(itemId, itemName);
      
      // idToItemMap: itemId -> full item object
      indexes.idToItemMap.set(itemId, item);
      
      // nameToIdsMap: itemName -> [itemId1, itemId2, ...]
      if (!indexes.nameToIdsMap.has(itemName)) {
        indexes.nameToIdsMap.set(itemName, []);
      }
      indexes.nameToIdsMap.get(itemName).push(itemId);

      // Build modifier indexes if item has modifiers
      if (item.modifiers && Array.isArray(item.modifiers) && item.modifiers.length > 0) {
        const modifierMap = new Map();
        
        for (const modifier of item.modifiers) {
          const modifierId = parseInt(modifier.id);
          const modifierOptions = modifier.options || [];
          
          modifierMap.set(modifierId, {
            id: modifierId,
            name: modifier.name,
            options: modifierOptions
          });
          
          // Create reverse lookup: option -> modifierId (for this item)
          for (const option of modifierOptions) {
            const lookupKey = `${itemId}-${option}`;
            indexes.modifierLookupMap.set(lookupKey, modifierId);
          }
        }
        
        indexes.itemModifiersMap.set(itemId, modifierMap);
      }
    }

    const indexTime = Number(process.hrtime.bigint() - startTime) / 1e6;
    console.log(` Menu indexes built in ${indexTime.toFixed(2)}ms`);
    console.log(` Indexed ${indexes.menuItemsMap.size} items, ${indexes.itemModifiersMap.size} items with modifiers`);

    return indexes;
  }

  /**
   * Check if an item exists by ID
   */
  async itemExists(itemId) {
    const indexes = await this.getIndexes();
    return indexes.menuItemsMap.has(parseInt(itemId));
  }

  /**
   * Get item name by ID
   */
  async getItemName(itemId) {
    const indexes = await this.getIndexes();
    return indexes.menuItemsMap.get(parseInt(itemId));
  }

  /**
   * Get all item IDs for a given name
   */
  async getItemIdsByName(itemName) {
    const indexes = await this.getIndexes();
    return indexes.nameToIdsMap.get(itemName) || [];
  }

  /**
   * Get modifiers for a specific item
   */
  async getItemModifiers(itemId) {
    const indexes = await this.getIndexes();
    return indexes.itemModifiersMap.get(parseInt(itemId)) || new Map();
  }

  /**
   * Find modifier ID for an item and option combination
   */
  async findModifierByOption(itemId, option) {
    const indexes = await this.getIndexes();
    const lookupKey = `${itemId}-${option}`;
    return indexes.modifierLookupMap.get(lookupKey);
  }
}

// Singleton instance for shared usage across rules
let _instance = null;

/**
 * Get singleton instance of MenuDataService
 */
function getMenuDataService() {
  if (!_instance) {
    _instance = new MenuDataService();
  }
  return _instance;
}

module.exports = {
  MenuDataService,
  getMenuDataService
};
