/**
 * Call Tracker - Complete Conversation Flow Management
 * 
 * Tracks entire voice assistant calls from start to finish,
 * managing turn-by-turn OrderCritic interactions and generating
 * comprehensive call summaries for analysis.
 */

const fs = require('fs').promises;
const path = require('path');

class CallTracker {
  constructor(config = {}) {
    this.config = {
      logDirectory: config.logDirectory || 'logs/calls',
      enableFileLogging: config.enableFileLogging !== false,
      maxCallDuration: config.maxCallDuration || 30 * 60 * 1000, // 30 minutes
      autoCleanup: config.autoCleanup !== false,
      ...config
    };
    
    // Active call sessions
    this.activeCalls = new Map(); // callId -> CallSession
    this.orderToCallMapping = new Map(); // orderId -> callId
    this.callStats = {
      totalCalls: 0,
      totalTurns: 0,
      totalOperations: 0
    };
    
    this.initializeLogging();
  }

  /**
   * Initialize logging directory and cleanup
   */
  async initializeLogging() {
    if (this.config.enableFileLogging) {
      try {
        await fs.mkdir(this.config.logDirectory, { recursive: true });
        console.log(` [CallTracker] Log directory initialized: ${this.config.logDirectory}`);
        
        if (this.config.autoCleanup) {
          this.startPeriodicCleanup();
        }
      } catch (error) {
        console.error(' [CallTracker] Failed to initialize logging:', error);
      }
    }
  }

  /**
   * Start a new call session
   * @param {string} callId - Unique identifier for the call (from Ultravox)
   * @param {Object} sessionData - Initial session metadata
   * @returns {Object} Call session object
   */
  startCall(callId, sessionData = {}) {
    const callSession = {
      callId,
      startTime: Date.now(),
      endTime: null,
      status: 'active',
      turns: [],
      orders: new Set(),
      metadata: {
        userAgent: sessionData.userAgent || 'unknown',
        ipAddress: sessionData.ipAddress || 'unknown',
        ultravoxSessionId: sessionData.ultravoxSessionId || null,
        ...sessionData
      },
      statistics: {
        totalTurns: 0,
        totalOperations: 0,
        avgLatency: 0,
        totalLatency: 0,
        operationTypes: new Map()
      }
    };

    this.activeCalls.set(callId, callSession);
    this.callStats.totalCalls++;

    console.log(' [CallTracker] Started call: ${callId}');
    return callSession;
  }

  /**
   * Add a turn (OrderCritic interaction) to an active call
   * @param {string} callId - Call identifier
   * @param {Object} turnData - Turn data from OrderCritic
   * @returns {boolean} Success status
   */
  addTurn(callId, turnData) {
    const call = this.activeCalls.get(callId);
    if (!call) {
      console.warn(`WARNING [CallTracker] Call not found: ${callId}`);
      return false;
    }

    // Add turn number
    const turnNumber = call.turns.length + 1;
    const enrichedTurn = {
      turn_number: turnNumber,
      ...turnData,
      timestamp: turnData.turn_timestamp || new Date().toISOString()
    };

    // Add to call
    call.turns.push(enrichedTurn);
    call.statistics.totalTurns++;
    this.callStats.totalTurns++;

    // Track order mapping
    if (turnData.order_id) {
      call.orders.add(turnData.order_id);
      this.orderToCallMapping.set(turnData.order_id, callId);
    }

    // Update statistics
    this.updateCallStatistics(call, enrichedTurn);

    console.log(' [CallTracker] Added turn ${turnNumber} to call ${callId}');
    return true;
  }

  /**
   * Update call statistics based on new turn
   */
  updateCallStatistics(call, turn) {
    // Track latency
    if (turn.latency_ms) {
      call.statistics.totalLatency += turn.latency_ms;
      call.statistics.avgLatency = call.statistics.totalLatency / call.statistics.totalTurns;
    }

    // Track operation types
    if (turn.critic_actions && Array.isArray(turn.critic_actions)) {
      turn.critic_actions.forEach(action => {
        const opType = action.op || 'unknown';
        const currentCount = call.statistics.operationTypes.get(opType) || 0;
        call.statistics.operationTypes.set(opType, currentCount + 1);
        call.statistics.totalOperations++;
        this.callStats.totalOperations++;
      });
    }
  }

  /**
   * End a call session and generate summary
   * @param {string} callId - Call identifier
   * @param {Object} endData - Optional end metadata
   * @returns {Object} Call summary
   */
  async endCall(callId, endData = {}) {
    const call = this.activeCalls.get(callId);
    if (!call) {
      console.warn(`WARNING [CallTracker] Cannot end call - not found: ${callId}`);
      return null;
    }

    // Mark as ended
    call.endTime = Date.now();
    call.status = 'completed';
    call.metadata.endReason = endData.reason || 'user_ended';
    call.metadata.duration = call.endTime - call.startTime;

    // Generate comprehensive summary
    const summary = this.generateCallSummary(call);

    // Remove from active calls
    this.activeCalls.delete(callId);

    // Clean up order mappings
    call.orders.forEach(orderId => {
      this.orderToCallMapping.delete(orderId);
    });

    // Save to file if enabled
    if (this.config.enableFileLogging) {
      await this.saveCallSummary(summary);
    }

    console.log(' [CallTracker] Ended call: ${callId} (${call.metadata.duration}ms, ${call.turns.length} turns)');
    return summary;
  }

  /**
   * Generate comprehensive call summary
   */
  generateCallSummary(call) {
    const operationTypeCounts = Object.fromEntries(call.statistics.operationTypes);
    
    return {
      call_id: call.callId,
      session_metadata: {
        start_time: new Date(call.startTime).toISOString(),
        end_time: new Date(call.endTime).toISOString(),
        duration_ms: call.metadata.duration,
        status: call.status,
        end_reason: call.metadata.endReason,
        ultravox_session_id: call.metadata.ultravoxSessionId
      },
      conversation_flow: {
        total_turns: call.statistics.totalTurns,
        total_orders: call.orders.size,
        order_ids: Array.from(call.orders),
        total_operations: call.statistics.totalOperations,
        operation_breakdown: operationTypeCounts
      },
      performance_metrics: {
        avg_latency_ms: Math.round(call.statistics.avgLatency * 100) / 100,
        total_latency_ms: call.statistics.totalLatency,
        turns_per_minute: call.metadata.duration > 0 ? 
          Math.round((call.statistics.totalTurns / (call.metadata.duration / 60000)) * 100) / 100 : 0
      },
      turns: call.turns,
      analysis: {
        conversation_effectiveness: this.analyzeConversationEffectiveness(call),
        common_issues: this.identifyCommonIssues(call),
        resolution_patterns: this.analyzeResolutionPatterns(call)
      }
    };
  }

  /**
   * Analyze conversation effectiveness
   */
  analyzeConversationEffectiveness(call) {
    const totalTurns = call.turns.length;
    const successfulTurns = call.turns.filter(turn => 
      !turn.critic_actions || turn.critic_actions.length === 0
    ).length;

    return {
      success_rate: totalTurns > 0 ? Math.round((successfulTurns / totalTurns) * 100) : 0,
      avg_turns_per_order: call.orders.size > 0 ? Math.round(totalTurns / call.orders.size) : 0,
      quick_resolution_rate: call.turns.filter(turn => turn.latency_ms < 100).length / totalTurns
    };
  }

  /**
   * Identify common issues in the conversation
   */
  identifyCommonIssues(call) {
    const issues = [];
    const operationCounts = call.statistics.operationTypes;

    if (operationCounts.get('schema_validation') > 2) {
      issues.push('Multiple schema validation failures - possible user confusion');
    }
    
    if (operationCounts.get('menu_item_validation') > 3) {
      issues.push('Frequent menu item issues - possible speech recognition problems');
    }

    if (call.statistics.avgLatency > 1000) {
      issues.push('High average latency - performance optimization needed');
    }

    return issues;
  }

  /**
   * Analyze resolution patterns
   */
  analyzeResolutionPatterns(call) {
    const patterns = {
      most_common_operation: null,
      resolution_success_rate: 0,
      escalation_points: []
    };

    // Find most common operation
    let maxCount = 0;
    call.statistics.operationTypes.forEach((count, operation) => {
      if (count > maxCount) {
        maxCount = count;
        patterns.most_common_operation = operation;
      }
    });

    // Calculate resolution success rate
    const resolutionTurns = call.turns.filter(turn => 
      turn.critic_actions && turn.critic_actions.some(action => 
        action.op.includes('resolution')
      )
    );
    
    patterns.resolution_success_rate = call.turns.length > 0 ? 
      Math.round((resolutionTurns.length / call.turns.length) * 100) : 0;

    return patterns;
  }

  /**
   * Save call summary to JSON file
   */
  async saveCallSummary(summary) {
    try {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `call_${summary.call_id}_${timestamp}.json`;
      const filepath = path.join(this.config.logDirectory, filename);

      await fs.writeFile(filepath, JSON.stringify(summary, null, 2));
      console.log(' [CallTracker] Call summary saved: ${filename}');
      
      return filepath;
    } catch (error) {
      console.error(' [CallTracker] Failed to save call summary:', error);
    }
  }

  /**
   * Get active call by ID
   */
  getCall(callId) {
    return this.activeCalls.get(callId);
  }

  /**
   * Get call ID by order ID
   */
  getCallByOrderId(orderId) {
    const callId = this.orderToCallMapping.get(orderId);
    return callId ? this.activeCalls.get(callId) : null;
  }

  /**
   * Get overall system statistics
   */
  getSystemStats() {
    return {
      ...this.callStats,
      activeCalls: this.activeCalls.size,
      activeOrders: this.orderToCallMapping.size
    };
  }

  /**
   * Start periodic cleanup of old data
   */
  startPeriodicCleanup() {
    setInterval(() => {
      this.cleanupStaleCalls();
    }, 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Clean up calls that have been active too long
   */
  cleanupStaleCalls() {
    const now = Date.now();
    const staleCalls = [];

    this.activeCalls.forEach((call, callId) => {
      if (now - call.startTime > this.config.maxCallDuration) {
        staleCalls.push(callId);
      }
    });

    staleCalls.forEach(async (callId) => {
      console.log(' [CallTracker] Cleaning up stale call: ${callId}');
      await this.endCall(callId, { reason: 'timeout' });
    });
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown() {
    console.log(' [CallTracker] Shutting down...');
    
    // End all active calls
    const activeCallIds = Array.from(this.activeCalls.keys());
    for (const callId of activeCallIds) {
      await this.endCall(callId, { reason: 'system_shutdown' });
    }

    console.log(' [CallTracker] Shutdown complete');
  }
}

module.exports = CallTracker;
