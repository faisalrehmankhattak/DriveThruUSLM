const express = require("express");
const cors = require("cors");
const path = require("path");
const dotenv = require("dotenv");
const http = require("http");
const socketIo = require("socket.io");
const fs = require('node:fs');
const { UltravoxSession } = require("ultravox-client");

// Import fetch for Node.js
const fetch = require('node-fetch');

// Import OrderCritic for advanced order validation
const OrderCritic = require('./rules/critic/OrderCritic');

// Import CallTracker for complete conversation logging
const CallTracker = require('./rules/critic/CallTracker');
const { SuccessResponseTransformer } = require('./rules/core/transformers/SuccessResponseTransformer');
const { ErrorResponseTransformer } = require('./rules/core/transformers/ErrorResponseTransformer');


// Load environment variables
dotenv.config();

// Create Express app
const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));

// Socket.io connection handling
io.on("connection", (socket) => {
  console.log("New client connected:", socket.id);

  // Handle subscription to order updates
  socket.on("subscribe_to_order", (orderId) => {
    console.log(`Client ${socket.id} subscribed to order: ${orderId}`);
    socket.join(`order-${orderId}`);
  });

  // Handle unsubscription from order updates
  socket.on("unsubscribe_from_order", (orderId) => {
    console.log(`Client ${socket.id} unsubscribed from order: ${orderId}`);
    socket.leave(`order-${orderId}`);
  });

  // Handle disconnection
  socket.on("disconnect", () => {
    console.log("Client disconnected:", socket.id);
  });
});

// In-memory storage for active sessions and orders
const activeSessions = new Map();
const activeOrders = new Map();

// Initialize OrderCritic for comprehensive order validation
const orderCritic = new OrderCritic({
  enableObservability: true,
  enableFileLogging: process.env.NODE_ENV === 'production',
  strictMode: true  // Enable strict validation for quantity checks
});

// Initialize CallTracker for complete conversation logging
const callTracker = new CallTracker({
  logDirectory: 'logs/calls',
  enableFileLogging: true,
  maxCallDuration: 30 * 60 * 1000, // 30 minutes
  autoCleanup: true
});

// Initialize SuccessResponseTransformer for LLM empowerment
const successTransformer = new SuccessResponseTransformer({
  enableLLMEmpowerment: true,
  includeOrderSummary: true,
  includeContextReset: true
});

// Initialize ErrorResponseTransformer for LLM empowerment
const errorTransformer = new ErrorResponseTransformer({
  enableLLMEmpowerment: true,
  includeMenuSuggestions: true,
  includeNextSteps: true,
  maxSuggestions: 10
});

/**
 * Helper function to find call ID by order ID
 */
function findCallIdByOrderId(orderId) {
  // First, check active sessions
  for (const [sessionId, session] of activeSessions.entries()) {
    if (session.orderId === orderId && session.callId) {
      return session.callId;
    }
  }
  
  // Then, check call tracker
  const call = callTracker.getCallByOrderId(orderId);
  return call ? call.callId : null;
}

/**
 * Enrich validated order with menu data (pricing, descriptions, etc.)
 */
function enrichOrderWithMenuData(order) {
  const enrichedItems = [];
  
  if (order.items && Array.isArray(order.items)) {
    order.items.forEach((item) => {
      // Find the corresponding menu item by ID
      const menuItem = coffeeShopMenu.items.find(
        (menuItem) => menuItem.id === item.itemId
      );

      if (menuItem) {
        // Create a new item with menu data
        const enrichedItem = {
          id: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          modifiers: [],
        };

        // Add modifiers if they exist
        if (item.modifiers && Array.isArray(item.modifiers)) {
          item.modifiers.forEach((modifier) => {
            // Find the corresponding menu modifier by ID
            const menuModifier = menuItem.modifiers.find(
              (mod) => mod.id === modifier.modifierId
            );

            if (menuModifier) {
              // Determine the selected option
              const selectedOption =
                modifier.selected ||
                (modifier.count ? menuModifier.options[0] : null);

              // Add the modifier with any price adjustments
              const enrichedModifier = {
                id: menuModifier.id,
                name: menuModifier.name,
                selected: selectedOption,
                count: modifier.count || 1,
                priceAdjustment:
                  (menuModifier.priceAdjustment?.[selectedOption] || 0) * item.quantity,
              };

              enrichedItem.modifiers.push(enrichedModifier);
            } else {
              // If no matching modifier found, just add the original
              enrichedItem.modifiers.push(modifier);
            }
          });
        }

        enrichedItems.push(enrichedItem);
      } else {
        // If no matching menu item found, just add the original item
        enrichedItems.push(item);
      }
    });
  }

  return {
    items: enrichedItems,
    orderId: order.orderId,
    timestamp: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Enrich order using corrected_cart data (includes all auto-resolutions)
 * This ensures we use the fully processed and corrected items
 */
function enrichOrderWithCorrectedCart(correctedCart, orderId) {
  const enrichedItems = [];
  
  if (correctedCart && Array.isArray(correctedCart)) {
    correctedCart.forEach((cartItem) => {
      // Find the corresponding menu item by ID (corrected_cart uses item_id)
      const menuItem = coffeeShopMenu.items.find(
        (menuItem) => menuItem.id === parseInt(cartItem.item_id)
      );

      if (menuItem) {
        // Create enriched item using corrected data
        const enrichedItem = {
          id: menuItem.id,
          name: cartItem.item_name, // Use corrected name from cart
          price: menuItem.price * cartItem.quantity, // Multiply by quantity for accurate total
          quantity: cartItem.quantity,
          modifiers: [],
        };

        // Add modifiers if they exist in corrected cart
        if (cartItem.modifiers && Array.isArray(cartItem.modifiers) && cartItem.modifiers.length > 0) {
          cartItem.modifiers.forEach((modifier) => {
            // Find the modifier in the menu item's modifiers
            const menuModifier = menuItem.modifiers?.find(
              (mod) => mod.name === modifier.modifier_name || mod.id === modifier.modifier_id
            );

            if (menuModifier) {
              enrichedItem.modifiers.push({
                id: menuModifier.id,
                name: modifier.modifier_name || menuModifier.name, // Use corrected modifier name or menu name
                price: menuModifier.price * cartItem.quantity, // Multiply by item quantity
                selected: modifier.selected || modifier.modifier_name || menuModifier.name,
                count: modifier.count || 1,
              });
            } else {
              // If no matching modifier found, add the corrected modifier as-is
              enrichedItem.modifiers.push({
                name: modifier.modifier_name || modifier.selected || 'Unknown Modifier',
                selected: modifier.selected || modifier.modifier_name || 'Unknown',
                count: modifier.count || 1,
              });
            }
          });
        } else {
          // Apply default modifiers when no modifiers are present
          if (menuItem.modifiers && Array.isArray(menuItem.modifiers)) {
            menuItem.modifiers.forEach((menuModifier) => {
              // Only apply defaults if a defaultOption is explicitly defined AND has no extra cost
              if (menuModifier.defaultOption && menuModifier.defaultOption !== null && menuModifier.defaultOption !== '') {
                const priceAdjustment = menuModifier.priceAdjustment?.[menuModifier.defaultOption] || 0;
                
                // Only apply default if it doesn't add extra cost to avoid unexpected charges
                if (priceAdjustment === 0) {
                  enrichedItem.modifiers.push({
                    id: menuModifier.id,
                    name: menuModifier.name,
                    selected: menuModifier.defaultOption,
                    count: 1,
                    isDefault: true, // Flag to indicate this was auto-applied
                    priceAdjustment: 0, // Always 0 since we only apply free defaults
                  });
                }
                // Skip defaults that have extra cost to prevent unexpected charges
              }
              // Gracefully skip modifiers without defaults - no error, no forced selection
              // This allows items to have optional modifiers that don't require defaults
            });
          }
          // If item has no modifiers defined at all, enrichedItem.modifiers remains empty array
          // This is perfectly valid - some items may not have any modifiers
        }

        enrichedItems.push(enrichedItem);
      } else {
        // If no matching menu item found, create item from corrected cart data
        enrichedItems.push({
          id: cartItem.item_id,
          name: cartItem.item_name,
          quantity: cartItem.quantity,
          modifiers: cartItem.modifiers || [],
        });
      }
    });
  }

  return {
    items: enrichedItems,
    orderId: orderId,
    timestamp: new Date().toISOString(),
    lastUpdated: new Date().toISOString(),
  };
}

/**
 * Generate a join URL for Drive Thru AI by making an API call to the Ultravox service
 * Based on: https://docs.ultravox.ai/api-reference/agents/agents-calls-post
 */
async function generateJoinUrl() {
  try {
    // Import axios for making HTTP requests
    const axios = require("axios");

    // Agent ID to use for the call
    // In a production environment, this might be configurable or stored in the database
    const agentId = process.env.ULTRAVOX_AGENT_ID || "default-agent";

    // Generate a random order ID for this call
    const orderId = `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`;

    // Prepare the request data according to the API documentation
    const requestData = {
      // Optional initial messages to start the conversation
      initialMessages: [
        {
          role: "MESSAGE_ROLE_USER",
          medium: "MESSAGE_MEDIUM_TEXT",
          text: `The order id is '${orderId}'. Use this in appropriate fields for in calls/usage of tools.`,
        },
      ],
      // Optional metadata for the call
      metadata: {
        appName: "Voice Assistant Demo",
        version: "1.0.0",
        order_id: orderId,
      },
      // Optional settings for who speaks first
      firstSpeakerSettings: {
        agent: {}, // Agent will start with a greeting
      },
      // Optional recording settings
      recordingEnabled: false,
      // Optional medium setting (voice or text)
      // Must be one of: "MESSAGE_MEDIUM_UNSPECIFIED", "MESSAGE_MEDIUM_VOICE", "MESSAGE_MEDIUM_TEXT"
      initialOutputMedium: "MESSAGE_MEDIUM_VOICE",
    };

    // Make the API request using axios
    const response = await axios({
      method: "POST",
      url: `https://api.ultravox.ai/api/agents/${agentId}/calls`,
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": process.env.ULTRAVOX_API_KEY,
      },
      data: requestData,
    });

    // Extract the join URL and call ID from the response
    const joinUrl = response.data.joinUrl;
    const callId = response.data.callId || response.data.id || `call-${Date.now()}`;

    console.log("Generated join URL:", joinUrl);
    console.log("Ultravox Call ID:", callId);
    
    // Start call tracking
    callTracker.startCall(callId, {
      orderId,
      ultravoxSessionId: callId,
      userAgent: 'voice-assistant-server',
      agentId,
      timestamp: new Date().toISOString()
    });

    // Return join URL, order ID, and call ID
    return { joinUrl, orderId, callId };
  } catch (error) {
    // Handle axios errors
    console.error("Error generating join URL:", error);

    // Provide more detailed error information if available
    if (error.response) {
      // The request was made and the server responded with a status code
      // that falls out of the range of 2xx
      console.error("Response status:", error.response.status);
      console.error("Response data:", error.response.data);
      throw new Error(
        `API request failed with status ${error.response.status}: ${
          error.response.data.message ||
          JSON.stringify(error.response.data) ||
          "Unknown error"
        }`
      );
    } else if (error.request) {
      // The request was made but no response was received
      console.error("No response received:", error.request);
      throw new Error("No response received from API server");
    } else {
      // Something happened in setting up the request that triggered an Error
      throw new Error(`Failed to generate join URL: ${error.message}`);
    }
  }
}

// API endpoint to get a join URL
app.get("/api/join-url", async (req, res) => {
  try {
    console.log('🔗 JOIN URL REQUEST - Creating new voice session...');
    
    // Get join URL, order ID, and call ID from generateJoinUrl
    const { joinUrl, orderId, callId } = await generateJoinUrl();

    // Create a session ID for tracking
    const sessionId = Date.now().toString();
    activeSessions.set(sessionId, { 
      joinUrl, 
      status: "created", 
      orderId,
      callId // Store call ID for turn logging
    });

    console.log(`✅ Voice session created:`);
    console.log(`   Session ID: ${sessionId}`);
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Call ID: ${callId}`);
    console.log(`   Join URL: ${joinUrl.substring(0, 50)}...`);

    res.json({
      success: true,
      joinUrl,
      sessionId,
      orderId,
      callId // Include call ID for frontend tracking
    });
  } catch (error) {
    console.error("❌ Error in /api/join-url endpoint:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// API endpoint to end a call and generate summary
app.post("/api/end-call", async (req, res) => {
  try {
    const { callId, sessionId, reason } = req.body;
    
    console.log(`📞 END CALL REQUEST - Call ID: ${callId}, Reason: ${reason || 'user_ended'}`);
    
    // End the call in CallTracker
    const callSummary = await callTracker.endCall(callId, { 
      reason: reason || 'user_ended',
      sessionId 
    });
    
    if (callSummary) {
      console.log(`✅ Call ended successfully: ${callId}`);
      console.log(`📊 Call Summary: ${callSummary.conversation_flow.total_turns} turns, ${callSummary.performance_metrics.avg_latency_ms}ms avg latency`);
      
      res.json({
        success: true,
        message: "Call ended successfully",
        callSummary: {
          callId: callSummary.call_id,
          totalTurns: callSummary.conversation_flow.total_turns,
          avgLatency: callSummary.performance_metrics.avg_latency_ms,
          duration: callSummary.session_metadata.duration_ms,
          totalOperations: callSummary.conversation_flow.total_operations
        }
      });
    } else {
      res.status(404).json({
        success: false,
        error: "Call not found or already ended"
      });
    }
  } catch (error) {
    console.error("❌ Error ending call:", error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// API endpoint to get session status
app.get("/api/session/:sessionId", (req, res) => {
  const { sessionId } = req.params;

  if (activeSessions.has(sessionId)) {
    res.json({
      success: true,
      session: activeSessions.get(sessionId),
    });
  } else {
    res.status(404).json({
      success: false,
      error: "Session not found",
    });
  }
});

// API endpoint to end a session
app.post("/api/session/:sessionId/end", (req, res) => {
  const { sessionId } = req.params;

  if (activeSessions.has(sessionId)) {
    const session = activeSessions.get(sessionId);
    session.status = "ended";
    activeSessions.set(sessionId, session);

    res.json({
      success: true,
      message: "Session ended successfully",
    });
  } else {
    res.status(404).json({
      success: false,
      error: "Session not found",
    });
  }
});

// Import the coffee shop menu data from external JSON file
const coffeeShopMenu = require("./menu/large/menu-data.json");

// API endpoint to get the coffee shop menu
app.get("/api/menu", (req, res) => {
  // Log query parameters for debugging
  console.log("Menu endpoint called with query params:", req.query);

  res.json({
    success: true,
    menu: coffeeShopMenu,
  });
});

// Original implementation

// Enhanced API endpoint to update an order with OrderCritic validation
app.post("/api/update-order", async (req, res) => {
  try {
    console.log('🛒 ORDER UPDATE - AI called UpdateOrder tool!');
    console.log('================================================');
    
    const { order, orderId } = req.body;
    
    console.log(`📦 Raw order data received:`);
    console.log(`   Order ID: ${orderId}`);
    console.log(`   Order data: ${JSON.stringify(order, null, 2)}`);

    if (!order) {
      return res.status(400).json({
        success: false,
        error: "Missing order data in request body",
      });
    }

    // Parse the order JSON string if it's a string, otherwise use it directly
    let parsedOrder;
    try {
      parsedOrder = typeof order === "string" ? JSON.parse(order) : order;
    } catch (parseError) {
      return res.status(400).json({
        success: false,
        error: `Invalid order JSON: ${parseError.message}`,
      });
    }

    // Use the provided orderId, or the one from the order object, or generate a new one
    const orderIdToUse =
      orderId ||
      (parsedOrder.orderId
        ? parsedOrder.orderId
        : `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`);

    console.log(`Using order ID: ${orderIdToUse}`);

    // Ensure order has the ID
    if (!parsedOrder.orderId) {
      parsedOrder.orderId = orderIdToUse;
    }

    // **NEW: Process order through OrderCritic validation pipeline**
    console.log('🎯 Processing order through validation pipeline...');
    const criticResult = await orderCritic.processOrder(parsedOrder);

    // Handle SUCCESS case
    if (criticResult.success) {
      console.log('✅ Order validation successful - enriching with menu data...');
      
      // Enrich the validated order with corrected cart data (includes all resolutions)
      const enrichedOrder = enrichOrderWithCorrectedCart(criticResult.corrected_cart, criticResult.order.orderId);

      // Store the order in memory
      activeOrders.set(orderIdToUse, enrichedOrder);

      console.log(`Order ${orderIdToUse} validated and enriched:`, enrichedOrder);

      // Emit a WebSocket event to notify clients about the order update
      io.to(`order-${orderIdToUse}`).emit("order_updated", enrichedOrder);
      console.log(`WebSocket event 'order_updated' emitted for order: ${orderIdToUse}`);

      // Return successful response
      return res.json({
        success: true,
        order: enrichedOrder,
        message: criticResult.message || "Order validated successfully",
        observability: criticResult.observability?.summary
      });
    }

    // Handle ERROR case
    console.log('❌ Order validation failed:', criticResult.message);
    console.log('📋 Validation errors:', criticResult.errors);

    // Store original order for reference
    const orderWithMetadata = {
      ...parsedOrder,
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      validationStatus: 'failed'
    };

    activeOrders.set(orderIdToUse, orderWithMetadata);

    // Emit validation failure event
    io.to(`order-${orderIdToUse}`).emit("order_validation_failed", {
      orderId: orderIdToUse,
      message: criticResult.message,
      errors: criticResult.errors
    });

    // Return error response with 200 status (as requested)
    return res.json({
      success: false,
      order: parsedOrder, // Return original order
      message: criticResult.message,
      errors: criticResult.errors,
      observability: criticResult.observability?.summary
    });

  } catch (error) {
    console.error("Error in /api/update-order endpoint:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

// 🎯 SPRINT 1: Analysis endpoint for captured AI behavior
// Original endpoints only

// The non-websocket endpoint for getting a single order has been removed.
// Order updates are now handled exclusively through WebSocket connections.

// The non-websocket endpoint for getting all active orders has been removed.
// Order updates are now handled exclusively through WebSocket connections.

// 🔧 ULTRAVOX WEBHOOK ENDPOINTS FOR TOOLS
// =======================================

// Extract order processing logic into a reusable function
function processOrderFromAI(requestData, orderIdOverride = null) {
  const { order, orderId } = requestData;
  
  console.log(`📦 Processing order data:`);
  console.log(`   Order ID: ${orderId || orderIdOverride}`);
  console.log(`   Order data: ${JSON.stringify(order, null, 2)}`);
  
  // Process webhook order data

  if (!order) {
    throw new Error("Missing order data in request body");
  }

  // Parse the order JSON string if it's a string, otherwise use it directly
  let parsedOrder;
  try {
    parsedOrder = typeof order === "string" ? JSON.parse(order) : order;
  } catch (parseError) {
    throw new Error(`Invalid order JSON: ${parseError.message}`);
  }

  // Use the provided orderId, or the one from the order object, or generate a new one
  const orderIdToUse =
    orderIdOverride ||
    orderId ||
    (parsedOrder.orderId
      ? parsedOrder.orderId
      : `order-${Date.now()}-${Math.floor(Math.random() * 1000)}`);

  console.log(`Using order ID: ${orderIdToUse}`);

  // Add timestamp to the order
  const timestamp = new Date().toISOString();

  // Create a new order object without the existing orderId to avoid nested orderIds
  const { orderId: _, ...orderWithoutId } = parsedOrder;

  // Enrich the order items with menu data
  const enrichedItems = [];
  if (orderWithoutId.items && Array.isArray(orderWithoutId.items)) {
    orderWithoutId.items.forEach((item) => {
      // Find the corresponding menu item by ID
      const menuItem = coffeeShopMenu.items.find(
        (menuItem) => menuItem.id === item.itemId
      );

      if (menuItem) {
        // Create a new item with menu data
        const enrichedItem = {
          id: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          modifiers: [],
        };

        // Add modifiers if they exist
        if (item.modifiers && Array.isArray(item.modifiers)) {
          item.modifiers.forEach((modifier) => {
            // Find the corresponding menu modifier by ID
            const menuModifier = menuItem.modifiers.find(
              (mod) => mod.id === modifier.modifierId
            );

            if (menuModifier) {
              // Determine the selected option
              const selectedOption =
                modifier.selected ||
                (modifier.count ? menuModifier.options[0] : null);

              // Add the modifier with any price adjustments
              const enrichedModifier = {
                id: menuModifier.id,
                name: menuModifier.name,
                selected: selectedOption,
                count: modifier.count || 1,
                priceAdjustment:
                  (menuModifier.priceAdjustment?.[selectedOption] || 0) * item.quantity,
              };

              // Add the enriched modifier to the item
              enrichedItem.modifiers.push(enrichedModifier);
            } else {
              // If no matching modifier found, just add the original
              enrichedItem.modifiers.push(modifier);
            }
          });
        }

        // Set quantity
        enrichedItem.quantity = item.quantity || 1;

        // Calculate total price including modifiers
        const modifiersPriceAdjustment = enrichedItem.modifiers.reduce(
          (sum, mod) => sum + (mod.priceAdjustment || 0) * (mod.count || 1),
          0
        );
        enrichedItem.totalPrice = (enrichedItem.price + modifiersPriceAdjustment) * enrichedItem.quantity;

        enrichedItems.push(enrichedItem);
      } else {
        console.warn(`Menu item not found for ID: ${item.itemId}`);
        // Add the original item if menu item not found
        enrichedItems.push({
          ...item,
          name: item.name || `Unknown Item (${item.itemId})`,
          price: item.price || 0,
          totalPrice: (item.price || 0) * (item.quantity || 1),
        });
      }
    });
  }

  // Calculate total order price
  const totalPrice = enrichedItems.reduce((sum, item) => sum + (item.totalPrice || 0), 0);

  const processedOrder = {
    items: enrichedItems,
    orderId: orderIdToUse,
    timestamp,
    totalPrice: totalPrice.toFixed(2),
    status: "updated",
    customerInfo: orderWithoutId.customerInfo || {},
  };

  console.log('✅ Order processed successfully');
  console.log(`📊 Final order: ${enrichedItems.length} items, total: $${totalPrice.toFixed(2)}`);
  
  return processedOrder;
}


app.post('/webhooks/tools/GetStoreMenu', async (req, res) => {
  console.log('🍽️ Ultravox called GetStoreMenu webhook!');
  
  try {
    // Load menu data
    const menuData = JSON.parse(fs.readFileSync('./menu/large/menu-data.json', 'utf8'));
    console.log(`✅ Menu loaded successfully for Ultravox AI`);
    
    // Return menu in format Ultravox expects
    res.json({
      success: true,
      menu: menuData
    });
    
  } catch (error) {
    console.error('❌ Error loading menu for Ultravox:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// 🎯 Smart Error Filtering: Only return errors that weren't resolved by subsequent operations
function filterUnresolvedErrors(errors, criticActions) {
  if (!errors || !criticActions) return errors || [];
  
  // Map error codes to their corresponding resolution operation types
  const errorToResolutionMap = {
    'MENU_ITEM_NAME_NOT_FOUND': 'menu_item_resolution',
    'MODIFIER_NAME_NOT_FOUND': 'modifier_resolution'
  };
  
  return errors.filter(error => {
    const resolutionOpType = errorToResolutionMap[error.code];
    
    // If no resolution operation exists for this error type, keep the error
    if (!resolutionOpType) return true;
    
    // Find the most recent resolution operation for this error type
    const resolutionOps = criticActions.filter(action => action.op === resolutionOpType);
    if (resolutionOps.length === 0) return true; // No resolution attempted, keep error
    
    // Get the last resolution operation
    const lastResolutionOp = resolutionOps[resolutionOps.length - 1];
    
    // If resolution succeeded (corrected_value is not null/empty), filter out the error
    const resolutionSucceeded = lastResolutionOp.corrected_value && 
                               lastResolutionOp.corrected_value !== 'null' && 
                               lastResolutionOp.corrected_value !== 'RESOLUTION_FAILED';
    
    // Return true to keep error, false to filter it out
    return !resolutionSucceeded;
  });
}

app.post('/webhooks/tools/UpdateOrder', async (req, res) => {
  console.log('🛒 Ultravox called UpdateOrder webhook!');
  
  try {
    // Ultravox sends parameters directly in the request body
    const { orderId, items } = req.body;
    
    if (!orderId || !items) {
      throw new Error('Missing orderId or items in UpdateOrder call');
    }
    
    console.log(`🎯 Processing order ${orderId} with ${items.length} items`);
    
    // Extract call ID from Ultravox headers or find by order ID
    const callId = req.headers['x-ultravox-call-id'] || 
                   req.headers['ultravox-call-id'] || 
                   findCallIdByOrderId(orderId) ||
                   `call-${orderId}-${Date.now()}`;
    
    // **NEW: Normalize field names from Ultravox webhook format**
    const normalizedItems = items.map(item => ({
      itemId: item.itemId || item.item_id,
      itemName: item.itemName || item.item_name,
      quantity: item.quantity,
      modifiers: (item.modifiers || []).map(modifier => ({
        modifierId: modifier.modifierId || modifier.modifier_id,
        selected: modifier.selected,
        count: modifier.count
      }))
    }));

    // **NEW: Use OrderCritic for webhook validation too**
    const orderData = {
      orderId: orderId,
      items: normalizedItems
    };
    
    console.log('🎯 Processing order through validation pipeline...');
    const criticResult = await orderCritic.processOrder(orderData);
    
    // Log this turn in the call conversation
    if (criticResult.turnLog) {
      const turnData = {
        ...criticResult.turnLog,
        source: 'ultravox_webhook',
        webhook_timestamp: new Date().toISOString()
      };
      
      callTracker.addTurn(callId, turnData);
    }

    // Handle SUCCESS case
    if (criticResult.success) {
      console.log('✅ Webhook order validation successful - enriching with menu data...');
      
      // Enrich the validated order with corrected cart data (includes all resolutions)
      const enrichedOrder = enrichOrderWithCorrectedCart(criticResult.corrected_cart, orderId);

      // Store the order in memory
      activeOrders.set(orderId, enrichedOrder);

      console.log(`Webhook order ${orderId} validated and enriched:`, enrichedOrder);

      // Emit a WebSocket event to notify clients about the order update
      io.to(`order-${orderId}`).emit("order_updated", enrichedOrder);
      console.log(`WebSocket event 'order_updated' emitted for order: ${orderId}`);

      console.log('✅ Order updated successfully via Ultravox webhook');
      
      // 🎭 Transform success response for LLM empowerment
      const transformedResponse = successTransformer.transformSuccessResponse(criticResult);
      
      // Return empowered response that makes LLM feel accomplished
      return res.json(transformedResponse);
    }

    // Handle ERROR case
    console.log('❌ Webhook order validation failed:', criticResult.message);
    console.log('📋 Webhook validation errors:', criticResult.errors);

    // 🎯 SMART ERROR FILTERING: Only return errors that weren't resolved by subsequent operations
    const filteredErrors = filterUnresolvedErrors(criticResult.errors, criticResult.critic_actions);
    
    // Store original order for reference
    const orderWithMetadata = {
      ...orderData,
      timestamp: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      validationStatus: 'failed'
    };

    activeOrders.set(orderId, orderWithMetadata);

    // Emit validation failure event
    io.to(`order-${orderId}`).emit("order_validation_failed", {
      orderId: orderId,
      message: criticResult.message,
      errors: filteredErrors
    });

    // 🎭 Transform error response for LLM empowerment with real menu suggestions
    const transformedErrorResponse = await errorTransformer.transformErrorResponse({
      ...criticResult,
      errors: filteredErrors
    });

    // Return empowered error response that makes LLM feel thoughtful
    return res.status(400).json(transformedErrorResponse);
    
  } catch (error) {
    console.error('❌ Error processing UpdateOrder webhook:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Update system prompt and tools on startup (like original working version)
const updateAgentConfiguration = async () => {
  const system_prompt = fs.readFileSync('./system-prompt.txt', 'utf8');
  
  console.log('🔄 Updating Ultravox agent configuration (prompt + tools)...');
  
  // Get base URL - Heroku or ngrok (backup)
  const getBaseUrl = async () => {
    // Priority 1: Use environment variable (for Heroku)
    if (process.env.BASE_URL) {
      console.log(`📡 Using configured base URL: ${process.env.BASE_URL}`);
      return process.env.BASE_URL;
    }
    
    // Priority 2: Try ngrok detection (for local development)
    try {
      const response = await fetch('http://localhost:4040/api/tunnels');
      const tunnels = await response.json();
      const httpsTunnel = tunnels.tunnels.find(t => t.proto === 'https');
      if (httpsTunnel) {
        console.log(`📡 Detected ngrok URL: ${httpsTunnel.public_url}`);
        return httpsTunnel.public_url;
      }
    } catch (error) {
      console.log('📡 Ngrok not detected, using fallback');
    }
    
    // Priority 3: Fallback to localhost
    const fallbackUrl = `http://localhost:${PORT}`;
    console.log(`📡 Using fallback URL: ${fallbackUrl}`);
    return fallbackUrl;
  };

  const baseUrl = await getBaseUrl();
      
  // Get current agent config
  return fetch(`https://api.ultravox.ai/api/agents/${process.env.ULTRAVOX_AGENT_ID}`, {
    headers: {
      'X-API-Key': process.env.ULTRAVOX_API_KEY,
    }
  })
      .then(response => response.json())
      .then(currentAgent => {
        const existingCallTemplate = currentAgent.callTemplate || {};
        
        // Update tools with current base URL (Heroku or ngrok)
        const updatedSelectedTools = [
          {
            "temporaryTool": {
              "description": "Get the Cafe Akai with all available items, prices, and modifiers",
              "http": {
                "baseUrlPattern": `${baseUrl}/webhooks/tools/GetStoreMenu`,
                "httpMethod": "POST"
              },
              "modelToolName": "GetStoreMenu"
            },
            "nameOverride": "GetStoreMenu"
          },
          {
            "temporaryTool": {
              "description": "Update customer order with items and modifiers",
              "dynamicParameters": [
                {
                  "name": "orderId",
                  "location": "PARAMETER_LOCATION_BODY",
                  "schema": {
                    "description": "The unique order identifier",
                    "type": "string"
                  },
                  "required": true
                },
                {
                  "name": "items",
                  "location": "PARAMETER_LOCATION_BODY",
                  "schema": {
                    "description": "List of items in the order",
                    "type": "array"
                  },
                  "required": true
                }
              ],
              "http": {
                "baseUrlPattern": `${baseUrl}/webhooks/tools/UpdateOrder`,
                "httpMethod": "POST"
              },
              "modelToolName": "UpdateOrder"
            },
            "nameOverride": "UpdateOrder"
          }
        ];
        
        const updatePayload = {
          callTemplate: {
            ...existingCallTemplate,
            systemPrompt: system_prompt,
            selectedTools: updatedSelectedTools
          }
        };
        
        return fetch(`https://api.ultravox.ai/api/agents/${process.env.ULTRAVOX_AGENT_ID}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': process.env.ULTRAVOX_API_KEY,
          },
          body: JSON.stringify(updatePayload)
        });
      })
.then(response => {
      if (response.ok) {
        console.log('✅ Agent configuration updated successfully!');
        console.log('🎯 System prompt and tools are now current');
        console.log('🔗 Webhooks configured with current base URL');
      } else {
        return response.text().then(text => {
          console.log('❌ Failed to update agent configuration');
          console.log('Error response:', text);
        });
      }
    })
    .catch(error => {
      console.error('Error updating agent configuration:', error);
      console.log('💡 For local development, make sure ngrok is running: ngrok http 3000');
    });
};

// Start the server with socket.io support
server.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  
  // Update agent configuration (prompt + tools) after server starts
  setTimeout(updateAgentConfiguration, 2000);
});

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🔄 Graceful shutdown initiated...');
  
  try {
    // Shutdown CallTracker (ends all active calls and saves summaries)
    await callTracker.shutdown();
    
    console.log('✅ CallTracker shutdown complete');
    console.log('👋 Server shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

process.on('SIGTERM', async () => {
  console.log('\n🔄 SIGTERM received, shutting down gracefully...');
  
  try {
    await callTracker.shutdown();
    console.log('✅ Server shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
});

