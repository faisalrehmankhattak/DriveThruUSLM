// Import the UltravoxSession class from the ultravox-client package
import { UltravoxSession } from "ultravox-client";
import { io } from "socket.io-client";

class DriveThruAIVoiceAssistant {
  constructor() {
    // Initialize the Drive Thru AI session
    this.session = new UltravoxSession();

    // Add event listener for session status changes
    this.session.addEventListener("status", (event) => {
      console.log("Session status changed:", this.session.status);
      this.updateCallStatus(this.session.status);

      // We're only tracking thinking to speaking transitions

      // Track timestamps for status changes between thinking and speaking
      if (this.session.status === "thinking") {
        this.thinkingTimestamp = Date.now();
      } else if (this.session.status === "speaking" && this.thinkingTimestamp) {
        const transitionTime = Date.now() - this.thinkingTimestamp;
        console.log(
          `Transition time from thinking to speaking: ${transitionTime}ms`
        );
        this.thinkingToSpeakingTime = transitionTime;
        this.thinkingTimestamp = null;

        // Store the timestamp for this new agent transcript
        if (this.session.transcripts && this.session.transcripts.length > 0) {
          const agentTranscripts = this.session.transcripts.filter(
            (t) => t.speaker === "agent"
          );
          if (agentTranscripts.length > 0) {
            const latestAgentTranscript =
              agentTranscripts[agentTranscripts.length - 1];
            if (!this.transcriptLatencies) {
              this.transcriptLatencies = new Map();
            }
            this.transcriptLatencies.set(latestAgentTranscript, {
              thinkingToSpeaking: this.thinkingToSpeakingTime,
            });
            this.updateTranscripts(this.session.transcripts);
          }
        }
      }
    });

    // Add event listener for transcripts
    this.session.addEventListener("transcripts", (event) => {
      console.log("Transcripts updated:", this.session.transcripts);
      this.updateTranscripts(this.session.transcripts);
    });

    // Add event listeners for different states
    this.session.addEventListener("listening", (event) => {
      console.log("Listening state:", event);
      this.updateState("listening");

      // When user is speaking, mute the speakers to avoid picking up extra noise
      if (typeof this.session.muteSpeaker === "function") {
        console.log("Muting speakers while user is speaking");
        this.session.muteSpeaker(true);
      }

      // Unmute the microphone to hear the user
      if (typeof this.session.muteMic === "function") {
        console.log("Unmuting microphone for user input");
        this.session.muteMic(false);
      }
    });

    this.session.addEventListener("thinking", (event) => {
      console.log("Thinking state:", event);
      this.updateState("thinking");

      // During thinking state, unmute speakers and mute mic
      if (typeof this.session.muteSpeaker === "function") {
        console.log("Unmuting speakers during thinking state");
        this.session.muteSpeaker(false);
      }

      if (typeof this.session.muteMic === "function") {
        console.log("Muting microphone during thinking state");
        this.session.muteMic(true);
      }
    });

    this.session.addEventListener("speaking", (event) => {
      console.log("Speaking state:", event);
      this.updateState("speaking");

      // When agent is speaking, unmute speakers and mute the microphone
      if (typeof this.session.muteSpeaker === "function") {
        console.log("Unmuting speakers for agent response");
        this.session.muteSpeaker(false);
      }

      if (typeof this.session.muteMic === "function") {
        console.log("Muting microphone while agent is speaking");
        this.session.muteMic(true);
      }
    });

    // Initialize Socket.io connection
    this.socket = io();

    // Session tracking
    this.currentSessionId = null;
    this.currentOrderId = null;
    this.menuData = null;
    this.activeModifiersPopup = null;
    this.currentState = null;

    // Get DOM elements
    this.joinUrlInput = document.getElementById("joinUrl");
    this.startCallButton = document.getElementById("startCall");
    this.endCallButton = document.getElementById("endCall");
    this.callStatusElement = document.getElementById("callStatus");
    // No longer using global latency display element
    this.callTranscriptElement = document.getElementById("callTranscript");
    this.currentOrderElement = document.getElementById("currentOrder");
    this.menuItemsElement = document.getElementById("menuItems");

    // Create backdrop for modifiers popup
    this.modifiersBackdrop = document.createElement("div");
    this.modifiersBackdrop.className = "menu-modifiers-backdrop";
    document.body.appendChild(this.modifiersBackdrop);

    // Add click event to backdrop to close modifiers
    this.modifiersBackdrop.addEventListener("click", () => {
      this.closeModifiersPopup();
    });

    // Set up event listeners
    this.setupEventListeners();
    this.setupSocketListeners();

    // 🛠️ Tools are now handled server-side via webhooks
    console.log("🔧 Using server-side webhook tools for Ultravox integration");

    // Fetch and display the menu
    this.fetchMenu();
  }

  // 🛠️ Tools are now handled server-side via webhooks
  // No client-side tool registration needed

  setupEventListeners() {
    // Set up event listeners for UI elements
    this.startCallButton.addEventListener("click", () => {
      this.startCall();
    });

    this.endCallButton.addEventListener("click", () => {
      console.log("end");
      this.endCall();
    });
  }

  setupSocketListeners() {
    // Set up Socket.io event listeners
    this.socket.on("connect", () => {
      console.log("Connected to server");
    });

    // Listen for order updates from the backend
    this.socket.on("order_updated", (orderData) => {
      console.log("Order updated:", orderData);
      this.currentOrderId = orderData.orderId;
      // Original pattern: orderData is the order itself
      this.renderOrder(orderData);
    });

    // Listen for transcript updates
    this.socket.on("transcriptUpdate", (data) => {
      this.updateTranscript(data.text);
    });
  }

  updateCallStatus(status) {
    // Update UI based on session status
    switch (status) {
      case "connected":
        this.callStatusElement.textContent = "Connected";
        break;
      case "disconnected":
        this.callStatusElement.textContent = "Disconnected";
        break;
      case "connecting":
        this.callStatusElement.textContent = "Connecting...";
        break;
      default:
        this.callStatusElement.textContent = status;
    }
  }

  async startCall() {
    this.callStatusElement.textContent = "Fetching join URL...";
    this.startCallButton.disabled = true;

    // Reset tracking variables
    this.thinkingTimestamp = null;
    this.thinkingToSpeakingTime = null;
    this.transcriptLatencies = new Map();

    try {
      // Fetch join URL from the backend
      const response = await fetch("/api/join-url");
      const data = await response.json();

      if (!data.success || !data.joinUrl) {
        throw new Error(data.error || "Failed to get join URL");
      }

      const joinUrl = data.joinUrl;
      this.currentSessionId = data.sessionId;
      
      // Store the call ID for ending the call and generating logs
      this.currentCallId = data.callId;

      // Store the order ID if provided by the backend
      if (data.orderId) {
        this.currentOrderId = data.orderId;

        // Subscribe to order updates via WebSocket
        this.socket.emit("subscribe_to_order", this.currentOrderId);
      }

      this.callStatusElement.textContent = "Connecting...";

      // Start the Drive Thru AI session using the correct method
      try {
        // Use joinCall instead of join
        this.session.joinCall(joinUrl);
        // Status updates will be handled by the event listener
      } catch (error) {
        console.error("Failed to join call:", error);
        this.callStatusElement.textContent = "Connection failed";
        this.startCallButton.disabled = false;
      }
    } catch (error) {
      console.error("Failed to start call:", error);
      this.callStatusElement.textContent = "Connection failed";
      this.startCallButton.disabled = false;
    }
  }

  async endCall() {
    console.log("endCall method called");
    console.log(
      "Current session status before ending call:",
      this.session.status
    );

    this.startCallButton.disabled = false;

    // Always force the UI to update to disconnected state immediately
    // This ensures the UI is responsive even if the session status event isn't triggered
    this.updateCallStatus("disconnected");

    // Generate call logs by calling the server endpoint
    if (this.currentCallId) {
      try {
        console.log("🔄 Generating call logs...");
        const response = await fetch("/api/end-call", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            callId: this.currentCallId,
            sessionId: this.currentSessionId,
            reason: "user_ended"
          }),
        });

        const result = await response.json();
        if (result.success) {
          console.log("✅ Call logs generated successfully!");
          console.log(`📊 Call Summary: ${result.callSummary.totalTurns} turns, ${result.callSummary.avgLatency}ms avg latency`);
        } else {
          console.warn("⚠️ Failed to generate call logs:", result.error);
        }
      } catch (error) {
        console.error("❌ Error generating call logs:", error);
      }
    }

    // Reset tracking variables
    this.thinkingTimestamp = null;
    this.thinkingToSpeakingTime = null;
    this.transcriptLatencies = new Map();
    
    // Clear session identifiers
    this.currentCallId = null;
    this.currentSessionId = null;
    this.currentOrderId = null;

    // End the Drive Thru AI session using the correct method
    try {
      // Try different methods that might be available in the UltravoxSession class
      if (typeof this.session.leave === "function") {
        // Try the leave method first (might be the original method name)
        console.log("Using leave() method to end call");
        this.session.leave();
      } else if (typeof this.session.leaveCall === "function") {
        // Try the leaveCall method (as in the original code)
        console.log("Using leaveCall() method to end call");
        this.session.leaveCall();
      } else if (typeof this.session.endCall === "function") {
        // Try the endCall method
        console.log("Using endCall() method to end call");
        this.session.endCall();
      } else if (typeof this.session.disconnect === "function") {
        // Try the disconnect method
        console.log("Using disconnect() method to end call");
        this.session.disconnect();
      } else {
        // If none of the above methods exist, log an error
        console.error("No suitable method found to end the call");
      }

      // Check if the session status was updated after attempting to end the call
      setTimeout(() => {
        console.log("Session status after ending call:", this.session.status);

        // If the session status is still connected, force it to disconnected
        if (this.session.status === "connected") {
          console.log("Session status still connected, forcing disconnect");
          // Force the UI to update to disconnected state again
          this.updateCallStatus("disconnected");

          // Notify the server that the session has ended
          if (this.currentSessionId) {
            console.log("Notifying server that session has ended");
            fetch(`/api/session/${this.currentSessionId}/end`, {
              method: "POST",
            })
              .then((response) => response.json())
              .then((data) => {
                console.log("Server notified of session end:", data);
              })
              .catch((error) => {
                console.error("Error notifying server of session end:", error);
              });
          }
        }
      }, 500); // Check after a short delay to allow for status updates
    } catch (error) {
      console.error("Failed to leave call:", error);
    }
  }

  updateTranscript(text) {
    // Update the call transcript with simple text
    this.callTranscriptElement.textContent = text;
  }

  updateTranscripts(transcripts) {
    if (
      !transcripts ||
      !Array.isArray(transcripts) ||
      transcripts.length === 0
    ) {
      return;
    }

    // Clear the transcript container
    this.callTranscriptElement.innerHTML = "";

    // Create a container for the transcripts
    const transcriptContainer = document.createElement("div");
    transcriptContainer.className = "transcript-entries";

    // Process each transcript entry
    transcripts.forEach((transcript) => {
      const transcriptEntry = document.createElement("div");
      transcriptEntry.className = `transcript-entry ${transcript.speaker}`;

      // Create the header with speaker and medium info
      const header = document.createElement("div");
      header.className = "transcript-header";

      // Capitalize first letter of speaker
      const speakerName =
        transcript.speaker.charAt(0).toUpperCase() +
        transcript.speaker.slice(1);

      // Get latency data for this transcript
      let latencyData = null;
      if (transcript.speaker === "agent" && this.transcriptLatencies) {
        latencyData = this.transcriptLatencies.get(transcript);
      }

      // Style the header with right-aligned status and latency pills
      header.innerHTML = `
        <span class="speaker">${speakerName}</span>
        <div class="status-container">
          ${
            transcript.isFinal
              ? '<span class="final-badge">Final</span>'
              : '<span class="processing-indicator">Processing...</span>'
          }
          ${
            latencyData
              ? `<div class="latency-pill">
                  <span class="thinking-latency">${latencyData.thinkingToSpeaking}ms</span>
                </div>`
              : ""
          }
        </div>
      `;

      // Add CSS to the header for right-aligned pills
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";

      // Style the pills
      const finalBadge = header.querySelector(".final-badge");
      const processingIndicator = header.querySelector(".processing-indicator");
      const latencyPill = header.querySelector(".latency-pill");

      // Style for both types of status pills
      const applyPillStyle = (element) => {
        if (!element) return;
        element.style.display = "inline-block";
        element.style.padding = "2px 8px";
        element.style.borderRadius = "12px";
        element.style.fontSize = "12px";
        element.style.fontWeight = "bold";
        element.style.marginLeft = "8px";
      };

      // Style final badge (green)
      if (finalBadge) {
        applyPillStyle(finalBadge);
        finalBadge.style.backgroundColor = "#4CAF50";
        finalBadge.style.color = "white";
      }

      // Style processing indicator (yellow)
      if (processingIndicator) {
        applyPillStyle(processingIndicator);
        processingIndicator.style.backgroundColor = "#FFC107";
        processingIndicator.style.color = "black";
      }

      // Style latency pill
      if (latencyPill) {
        latencyPill.style.display = "block";
        latencyPill.style.marginTop = "4px";
        latencyPill.style.textAlign = "right";
        latencyPill.style.fontSize = "11px";
        latencyPill.style.color = "#666";
        latencyPill.style.fontFamily = "monospace";
      }

      // Create the content
      const content = document.createElement("div");
      content.className = "transcript-content";
      content.textContent = transcript.text;

      // Add header and content to the transcript entry
      transcriptEntry.appendChild(header);
      transcriptEntry.appendChild(content);

      transcriptContainer.appendChild(transcriptEntry);
    });

    // Add the state indicator if we have a current state
    if (this.currentState) {
      const stateIndicator = document.createElement("div");
      stateIndicator.className = `state-indicator ${this.currentState}`;
      stateIndicator.textContent = `${
        this.currentState.charAt(0).toUpperCase() + this.currentState.slice(1)
      }...`;
      transcriptContainer.appendChild(stateIndicator);
    }

    // Add the transcript container to the DOM
    this.callTranscriptElement.appendChild(transcriptContainer);

    // Scroll to the bottom of the transcript container
    this.scrollTranscriptToBottom();
  }

  updateState(state) {
    this.currentState = state;

    // Update the transcripts display to show the new state
    if (this.session.transcripts) {
      this.updateTranscripts(this.session.transcripts);
    } else {
      // If no transcripts yet, just show the state
      this.callTranscriptElement.innerHTML = `
        <div class="state-indicator ${state}">
          ${state.charAt(0).toUpperCase() + state.slice(1)}...
        </div>
      `;

      // Scroll to the bottom
      this.scrollTranscriptToBottom();
    }
  }

  // Scroll the transcript container to the bottom
  scrollTranscriptToBottom() {
    if (this.callTranscriptElement) {
      this.callTranscriptElement.scrollTop =
        this.callTranscriptElement.scrollHeight;
    }
  }

  // Order creation is now handled by the backend

  async fetchMenu() {
    try {
      const response = await fetch("/api/menu");
      const responseData = await response.json();

      // Extract the menu data from the response
      if (responseData.success && responseData.menu) {
        this.menuData = responseData.menu;
      } else {
        // Fallback to loading the menu data directly from the file
        const menuResponse = await fetch("menu/large/menu-data.json");
        this.menuData = await menuResponse.json();
      }

      this.renderMenu(this.menuData);
    } catch (error) {
      console.error("Error fetching menu:", error);

      // Fallback to loading the menu data directly from the file
      try {
        const menuResponse = await fetch("menu/large/menu-data.json");
        this.menuData = await menuResponse.json();
        this.renderMenu(this.menuData);
      } catch (fallbackError) {
        console.error("Error fetching menu from fallback:", fallbackError);
      }
    }
  }

  renderMenu(menuData) {
    if (!menuData || !menuData.items || !Array.isArray(menuData.items)) {
      console.error("Invalid menu data format");
      return;
    }

    this.menuItemsElement.innerHTML = "";

    menuData.items.forEach((item) => {
      const itemElement = document.createElement("div");
      itemElement.className = "menu-item";
      itemElement.innerHTML = `
        <h3>${item.name}</h3>
        <p class="price">$${item.price.toFixed(2)}</p>
        <p class="menu-item-description">${item.description || ""}</p>
        <button class="add-to-order" data-item-id="${item.id}">Options</button>
      `;

      // Add click event for the "Options" button
      const addButton = itemElement.querySelector(".add-to-order");
      addButton.addEventListener("click", () => {
        this.showModifiersPopup(item);
      });

      this.menuItemsElement.appendChild(itemElement);
    });
  }

  showModifiersPopup(menuItem) {
    // Close any existing popup
    this.closeModifiersPopup();

    // Create popup container
    const popup = document.createElement("div");
    popup.className = "menu-modifiers-popup";

    // Create popup content
    popup.innerHTML = `
      <h3>${menuItem.name} Options</h3>
      <div class="modifiers-container"></div>
      <div class="popup-actions">
        <button class="close-button">Close</button>
      </div>
    `;

    const modifiersContainer = popup.querySelector(".modifiers-container");

    // Create a table to display options
    const optionsTable = document.createElement("table");
    optionsTable.className = "options-table";

    // Add table header
    optionsTable.innerHTML = `
      <thead>
        <tr>
          <th>Option Type</th>
          <th>Available Options</th>
          <th>Price Adjustment</th>
          <th>Default</th>
        </tr>
      </thead>
      <tbody></tbody>
    `;

    const tableBody = optionsTable.querySelector("tbody");

    // Add modifiers to the table
    if (menuItem.modifiers && Array.isArray(menuItem.modifiers)) {
      menuItem.modifiers.forEach((modifier) => {
        // For each option in this modifier, create a row
        if (modifier.options && Array.isArray(modifier.options)) {
          modifier.options.forEach((option, index) => {
            const row = document.createElement("tr");

            // Calculate price adjustment if any
            let priceText = "No change";
            if (modifier.priceAdjustment && modifier.priceAdjustment[option]) {
              const adjustment = modifier.priceAdjustment[option];
              priceText =
                adjustment > 0
                  ? `+$${adjustment.toFixed(2)}`
                  : `-$${Math.abs(adjustment).toFixed(2)}`;
            }

            // Only show the modifier name in the first row of each modifier group
            const modifierName = index === 0 ? modifier.name : "";

            // Is this the default option?
            const isDefault = option === modifier.defaultOption ? "Yes" : "";

            row.innerHTML = `
              <td>${modifierName}</td>
              <td>${option}</td>
              <td>${priceText}</td>
              <td>${isDefault}</td>
            `;

            tableBody.appendChild(row);
          });

          // Add a spacer row between modifier groups
          const spacerRow = document.createElement("tr");
          spacerRow.className = "spacer-row";
          spacerRow.innerHTML = `<td colspan="4"></td>`;
          tableBody.appendChild(spacerRow);
        }
      });
    }

    modifiersContainer.appendChild(optionsTable);

    // Add event listener for close button
    const closeButton = popup.querySelector(".close-button");
    closeButton.addEventListener("click", () => {
      this.closeModifiersPopup();
    });

    // Show the popup and backdrop
    document.body.appendChild(popup);
    this.modifiersBackdrop.style.display = "block";
    this.activeModifiersPopup = popup;
  }

  closeModifiersPopup() {
    if (this.activeModifiersPopup) {
      document.body.removeChild(this.activeModifiersPopup);
      this.activeModifiersPopup = null;
      this.modifiersBackdrop.style.display = "none";
    }
  }

  // Order updates are now handled by the backend

  renderOrder(order) {
    console.log("🎯 renderOrder called with:", order);
    
    if (!order) {
      console.log("❌ No order provided to renderOrder");
      this.currentOrderElement.innerHTML = "<p>No order data received</p>";
      return;
    }
    
    if (!order.items) {
      console.log("❌ No items in order:", order);
      this.currentOrderElement.innerHTML = "<p>No items in order</p>";
      return;
    }
    
    if (!Array.isArray(order.items) || order.items.length === 0) {
      console.log("❌ Order items is empty or not an array:", order.items);
      this.currentOrderElement.innerHTML = "<p>No items in order</p>";
      return;
    }
    
    console.log(`✅ Rendering order with ${order.items.length} items`);

    // Translate the order items to include names and prices
    const translatedItems = this.translateOrderItems(order.items);

    // Calculate order total
    const orderTotal = translatedItems.reduce(
      (total, item) => total + item.price,
      0
    );

    // Create order HTML
    let orderHtml = `
      <div class="order-items">
    `;

    translatedItems.forEach((item) => {
      // Calculate the base price (without modifiers)
      const basePrice = item.basePrice;
      // Calculate modifiers total
      const modifiersTotal = item.price - basePrice;

      orderHtml += `
        <div class="order-item">
          <div class="item-header">
            <span class="item-name">${item.name}</span>
            <span class="item-price">$${basePrice.toFixed(2)}</span>
          </div>
      `;

      if (item.modifiers && item.modifiers.length > 0) {
        orderHtml += `<ul class="item-modifiers">`;

        item.modifiers.forEach((mod) => {
          let modText = `${mod.name}: ${mod.value}`;

          if (mod.priceAdjustment !== 0) {
            modText += ` (${
              mod.priceAdjustment > 0 ? "+" : ""
            }$${mod.priceAdjustment.toFixed(2)})`;
          }

          if (mod.amount > 1) {
            modText += ` x${mod.amount}`;
          }

          orderHtml += `<li class="modifier-item">${modText}</li>`;
        });

        // If there are modifiers with price adjustments, show the subtotal
        if (modifiersTotal !== 0) {
          orderHtml += `
            <li class="item-subtotal">
              <span>Item total:</span>
              <span>$${item.price.toFixed(2)}</span>
            </li>
          `;
        }

        orderHtml += `</ul>`;
      }

      orderHtml += `</div>`;
    });

    orderHtml += `
      </div>
      <div class="order-total">
        <span>Total:</span>
        <span>$${orderTotal.toFixed(2)}</span>
      </div>
    `;

    this.currentOrderElement.innerHTML = orderHtml;
  }

  // Order extraction from transcript is now handled by the backend

  // Order updates are now handled by the backend

  translateOrderItems(items) {
    if (!this.menuData || !this.menuData.items) {
      console.error("Menu data is not available");
      return [];
    }

    if (!Array.isArray(items)) {
      console.error("Invalid order items format");
      return [];
    }

    return items
      .map((orderItem) => {
        // Validate order item
        if (!orderItem || typeof orderItem !== "object") {
          console.error("Invalid order item format");
          return null;
        }

        // Handle different data structures - some items might have id instead of itemId
        const itemId = orderItem.itemId || orderItem.id;

        if (!itemId) {
          console.error("Order item missing ID");
          return null;
        }

        // Find matching menu item by ID
        const menuItem = this.menuData.items.find((item) => item.id === itemId);
        if (!menuItem) {
          console.error(`Menu item not found: ID ${orderItem.itemId}`);
          return null;
        }

        // Use the enriched price from backend (includes quantity multiplication)
        let itemPrice = orderItem.price || menuItem.price;
        const translatedModifiers = [];

        // Process modifiers if they exist
        if (orderItem.modifiers && Array.isArray(orderItem.modifiers)) {
          orderItem.modifiers.forEach((orderModifier) => {
            // Handle different data structures - some modifiers might have id instead of modifierId
            const modifierId = orderModifier.modifierId || orderModifier.id;

            if (!modifierId) {
              console.error("Modifier missing ID");
              return;
            }

            // Find matching menu modifier by ID
            const menuModifier = menuItem.modifiers.find(
              (mod) => mod.id === modifierId
            );
            if (menuModifier) {
              // Get the selected option or default
              const value =
                orderModifier.selected || menuModifier.defaultOption;

              // Use enriched price adjustment from backend (includes quantity multiplication)
              let priceAdjustment = 0;
              if (orderModifier.priceAdjustment !== undefined) {
                // Use the enriched priceAdjustment from backend
                priceAdjustment = orderModifier.priceAdjustment;
              } else if (
                menuModifier.priceAdjustment &&
                menuModifier.priceAdjustment[value]
              ) {
                // Fallback to menu data calculation
                priceAdjustment = menuModifier.priceAdjustment[value];
                // Apply adjustment based on count if specified
                if (orderModifier.count && orderModifier.count > 1) {
                  priceAdjustment *= orderModifier.count;
                }
              }
              // Don't add to itemPrice since it's already included in the enriched price

              translatedModifiers.push({
                name: menuModifier.name,
                value: value,
                priceAdjustment,
                amount: orderModifier.count || 1,
              });
            }
          });
        }

        return {
          name: menuItem.name,
          price: itemPrice,
          basePrice: menuItem.price,
          modifiers: translatedModifiers,
        };
      })
      .filter((item) => item !== null);
  }

  // ... [rest of the methods remain the same] ...
}

// Initialize the application when the DOM is loaded
document.addEventListener("DOMContentLoaded", () => {
  new DriveThruAIVoiceAssistant();
  console.log("Drive Thru AI Voice Assistant initialized");
});
