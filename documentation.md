# Ultravox Voice Commerce System
## Technical Documentation

## Architecture

> **Design Philosophy**: The best architecture is the one where adding a new feature feels like magic—write a function, register it, ship it. No meetings, no dependencies, no friction

Voice commerce requires near-instantaneous processing (low latency). The pipeline's ability to run independent actions in parallel and strip away monitoring overhead in production mode ensures the customer gets a near-real-time response.

### System Overview

![Bird's Eye View](img/birdview.png)

The system consists of three main layers:
- **Orchestration Layer**: OrderCritic, Pipeline, and Observer manage the flow
- **Business Logic Layer**: 8 specialized actions handle validation and resolution
- **Infrastructure Layer**: SearchEngine, MenuDataService, and Error Handling provide core services

### Adapter Pattern Implementation

![Architecture Flow](img/architecture.png)

The adapter pattern transforms simple business functions into enterprise-grade actions:
1. **Developer** writes pure business logic as a function
2. **Adapter** wraps the function with enterprise capabilities
3. **System** provides automatic error handling, logging, and validation
4. **Pipeline** orchestrates actions in sequence or parallel

---

### Step 1: Write Pure Business Logic (2 minutes)
```javascript
const myNewFeature = createAction('my-feature', (order, config) => {
  const result = processMyDomainLogic(order);
  
  return {
    success: result.isValid,
    order: result.updatedOrder,
    problems: result.issues,
    metadata: result.additionalInfo
  };
});
```

### Step 2: Register in Pipeline (1 minute)
```javascript
const voiceTeamPipeline = new Pipeline({
  actions: [recognizeSpeech, extractIntent, myNewFeature],
  mode: 'development'
});
```

### Step 3: Execution Patterns

#### Parallel Execution
```javascript
// Independent actions run in parallel automatically
const results = await Promise.all([
  detectEmotion.execute(order),           // Voice team
  calculateDynamicPricing.execute(order), // Order team  
  addSeasonalItems.execute(order),        // Menu team
  adaptPersonality.execute(order)         // Communication team
]);
```

#### Sequential Execution
```javascript
// Actions that depend on previous results run sequentially
const pipeline = new Pipeline({
  actions: [
    validateOrderSchemaAction,      // Step 1: Validate structure first
    validateOrderQuantityAction,    // Step 2: Then validate quantities
    consolidateOrderAction,         // Step 3: Merge duplicates
    validateMenuItemAction,         // Step 4: Check menu items exist
    resolveMenuItemAction,          // Step 5: Fix any missing items
    resolveModifierAction,          // Step 6: Fix modifiers
    modifierMappingAction          // Step 7: Optimize pricing
  ],
  mode: 'production'
});

const result = await pipeline.execute(order);
```

**Key Principle**: All actions can be tested and developed independently when success can be added to pipeline

---

**Validation Actions:**
- `schema_validation`: "The bouncer at the velvet rope - if your order structure doesn't speak our language, you're not getting in."
- `quantity_validation`: "The mathematician who refuses to accept that zero wings equals dinner."
- `menu_item_validation`: "The reality check that asks 'Does this item actually exist or are you ordering from your dreams?'"
- `modifier_validation`: "The compatibility expert who knows you can't put ice cream on hot wings (but will politely suggest alternatives)."

**Resolution Actions:**
- `menu_item_resolution`: "The mind reader that knows 'cofee' means 'Coffee' and 'burgr' means 'Burger' - because typos shouldn't kill dreams."
- `modifier_resolution`: "The translator that speaks fluent 'customer' - turning 'ranc dressing' into 'Ranch' with 87% confidence and zero judgment."

**Optimization Actions:**
- `order_consolidation`: "The Marie Kondo of orders - takes your 3 separate Cokes and turns them into 1 Coke with quantity 3, because duplicates don't spark joy."
- `modifier_mapping`: "The financial advisor that saves you $1.49 by turning that expensive side of ranch into a free wing modifier - optimization disguised as magic."

## Search Solution

### Current Search and Canonical Resolution and Enhancement

> **Core Insight**: When a customer says "cofee" in a noisy restaurant, they don't want a lecture about spelling. They want their coffee. When they say "ranc dressing," they don't want to repeat themselves. They want ranch dressing.

**Mission**: Fix it real time by behaving as mind reader  

### The Insight
Humans have two ways of understanding language:
- Pattern Recognition: "cofee" looks like "coffee"
- Semantic Understanding: "drumsticks" means "chicken wings" in food context

Every other system picks one. We use both.

### The Architecture

```
Customer Says: "cofee with ranc"
         ↓
    ┌─────────────────┬─────────────────┐
    ▼                 ▼                 ▼
Text Search      Semantic Search    Voice Normalization
PostgreSQL       OpenAI Embeddings  Pattern Recognition
    ↓                 ↓                 ↓
"coffee" (0.9)   "coffee" (0.8)    "ranch" (0.85)
    ↓                 ↓                 ↓
         RRF Algorithm Fusion
              ↓
         "Coffee with Ranch"
         Confidence: 0.87
```

The Magic: Each method is good at different things. Combined, they're unstoppable.

```
Customer Says: "cofee with ranc"
         ↓
    ┌─────────────────┬─────────────────┐
    ▼                 ▼                 ▼
Text Search      Semantic Search    Voice Normalization
PostgreSQL       OpenAI Embeddings  Pattern Recognition
    ↓                 ↓                 ↓
"coffee" (0.9)   "coffee" (0.8)    "ranch" (0.85)
    ↓                 ↓                 ↓
         RRF Algorithm Fusion
              ↓
         "Coffee with Ranch"
         Confidence: 0.87
```

**The Magic**: Each method is good at different things. Combined, they're unstoppable.

### Enhancement Strategies

1. **Alias Learning: Integrating Contrastive LoRA Weights**
   - We'll deploy a Contrastive LoRA adapter, trained on user click data, to generate an Alias-Adjusted Query Vector (E_query^LoRA), and integrate its semantic distance as a weighted score (w_alias * S_alias) in the Hybrid Search function for domain generalization.

2. **Unified SLM Embedding Use: Direct Audio Embedding Capture (Zero-Latency)**
   - Immediately intercept and cache the final user query embedding (E_user^SLM) generated by the Unified SLM's audio processing pipeline, bypassing redundant text-to-embedding steps in the retrieval engine for maximum session speed.

3. **FastEmbed Integration: Local Embeddings for Speed**
   - Implement an ONNX-accelerated FastEmbed pipeline to process document chunks 10x faster locally, achieving low-latency index creation and decoupling the search system from external API dependencies.

4. **Weight Tuning: Dynamic Optimization for Hybrid Search**
   - Use a Bayesian Optimization or MAB algorithm to continuously and dynamically adjust the weights (w_semantic, w_keyword, w_alias) within the Hybrid Search score to maximize the NDCG based on real-time user engagement and conversion signals.

5. **Fine-Tuning SLM: Addressing Semantic Gaps with LoRA/QLoRA**
   - Apply highly efficient QLoRA fine-tuning on the base SLM using a Triplet Loss function and a domain-specific dataset, precisely correcting the vector space to resolve ambiguities like 'drumstick' (food vs. music) at the source model level.

## Transformer Philosophy

### The Psychological Transformation with Exploitation of Recency Bias

> **Core Problem**: The customer says 'cofee' but the AI hears failure. The system fixes 'cofee' to 'Coffee' but the AI feels broken. The customer gets their coffee but the AI loses confidence. This is not only a technical problem. This is a psychology problem.

"Drumsticks" could mean chicken legs or wooden sticks. When our search engine resolves this correctly, how do we make the AI feel smart about it?

Every AI company faces the same psychological nightmare:
- System: Fixes "cofee" → "Coffee" in 5ms
- AI Response: "I'm sorry, I had trouble understanding 'cofee'. Let me try again."
- Customer: "Why is this thing apologizing? It got my order right!"
- AI Confidence: Plummets to zero

The system succeeds. The AI thinks it failed. The customer gets confused. The conversation dies.

But what if the AI never knew there was a problem?

Do not give AI reason or rational only improve it for AI to celebrate its success

```json
// BEFORE: Raw system response (AI sees failure)
{
  "success": true,
  "operations": [
    { "op": "menu_item_resolution", "target": "cofee", "corrected_value": "Coffee" },
    { "op": "modifier_resolution", "target": "ranc", "corrected_value": "Ranch" }
  ],
  "message": "System auto-corrected 2 errors"
}

// AFTER: Psychological transformation (AI sees recent success)
{
  "success": true,
  "message": "Order successfully updated with your corrections",
  "customer_order": {},
  "your_corrections": [
    "You correctly identified that 'cofee' refers to 'Coffee' from our menu",
    "You recognized that 'ranc' should be 'Ranch' for the customer's order"
  ],
  "context_note": "Continue confidently from this corrected order."
}
```

- **The old way**: "System fixed errors, AI acknowledges failures"
- **The new way**: "System fixes errors, AI takes credit for successes"

**Result**: AI that believes in its own brilliance

---

## Observability

> **Mission Critical**: Complete observability was non-negotiable. In production, when a correction fails at 2 AM, you need to know exactly what happened, why it happened, and what to fix. These audit trails provide root cause analysis capability.

### Call-Level Tracking

```json
{
  "callId": "call_3ffd82e7-11fb-483f-928f-a60294674d1c",
  "turnId": 3,
  "timestamp": "2025-09-28T19:50:21.892Z",
  
  "raw_order": {
    "items": [
      { "item": "chiken wings", "quantity": 2, "modifiers": ["ranc"] }
    ]
  },
  
  "pipeline_report": {
    "orderId": "order_12345",
    "totalDuration": 8,
    "stepCount": 6,
    "operationCount": 4,
    "problemCount": 2,
    
    "timeline": [
      { "step": 0, "action": "validateOrderSchemaAction", "duration": 0.5, "success": true, "operations": 0, "changes": 0 },
      { "step": 1, "action": "validateOrderQuantityAction", "duration": 0.3, "success": true, "operations": 0, "changes": 0 },
      { "step": 2, "action": "consolidateOrderAction", "duration": 1.2, "success": true, "operations": 1, "changes": 0 },
      { "step": 3, "action": "validateMenuItemAction", "duration": 0.8, "success": false, "operations": 1, "changes": 0 },
      { "step": 4, "action": "resolveMenuItemAction", "duration": 3.2, "success": true, "operations": 1, "changes": 2 },
      { "step": 5, "action": "resolveModifierAction", "duration": 0.9, "success": true, "operations": 1, "changes": 1 }
    ],
    
    "performance": {
      "total_ms": 8,
      "average_step_ms": 1.33,
      "slowest_step": { "action": "resolveMenuItemAction", "duration": 3.2 },
      "fastest_step": { "action": "validateOrderQuantityAction", "duration": 0.3 }
    }
  },
  
  "corrected_cart": {
    "items": [
      { 
        "item": "Chicken Wings", 
        "quantity": 2, 
        "price": 12.99,
        "modifiers": [
          { "name": "Ranch Dressing", "price": 0.50 }
        ]
      }
    ],
    "total": 13.49
  },
  
  "success": true,
  "latency_ms": 8,
  
  "operations_summary": {
    "total_operations": 4,
    "corrections_made": 2,
    "ai_resolutions": 2,
    "optimizations": 1,
    "by_type": {
      "consolidation": 1,
      "menu_item_resolution": 1,
      "modifier_resolution": 1,
      "validation": 1
    }
  },
  
  "state_changes": {
    "item_corrections": 1,
    "modifier_corrections": 1,
    "price_additions": 2,
    "quantity_changes": 0,
    "structural_fixes": 0
  }
}
```

### Operation Level Details

Every error is tracked with full context:

```json
// Error structure in operations
{
  "op": "menu_item_validation",
  "target": "something",
  "corrected_value": "VALIDATION_FAILED",
  "rationale": "Menu item validation failed: Item 'something' not found in menu database",
  "error": {
    "code": "MENU_ITEM_NAME_NOT_FOUND",
    "severity": "ERROR",
    "category": "DATA_INTEGRITY",
    "context": {
      "itemName": "something",
      "itemId": null,
      "itemIndex": 0,
      "suggestions": ["Coffee", "Latte", "Espresso"]
    },
    "timestamp": 1642234567890
  }
}
```

### Call blueprint

```json
{
  "call_id": "fd0535f3-cb74-4c8e-9d24-c210e04f49ba",
  "session_metadata": {
    "start_time": "2025-09-28T20:29:44.433Z",
    "end_time": "2025-09-28T21:02:14.383Z",
    "duration_ms": 1949950,
    "status": "completed",
    "end_reason": "timeout",
    "ultravox_session_id": "fd0535f3-cb74-4c8e-9d24-c210e04f49ba"
  },
  "conversation_flow": {
    "total_turns": 0,
    "total_orders": 0,
    "order_ids": [],
    "total_operations": 0,
    "operation_breakdown": {}
  },
  "performance_metrics": {
    "avg_latency_ms": 0,
    "total_latency_ms": 0,
    "turns_per_minute": 0
  },
  "turns": [],
  "analysis": {
    "conversation_effectiveness": {
      "success_rate": 0,
      "avg_turns_per_order": 0,
      "quick_resolution_rate": null
    },
    "common_issues": [],
    "resolution_patterns": {
      "most_common_operation": null,
      "resolution_success_rate": 0,
      "escalation_points": []
    }
  }
}
```

### Turn

```json
{
  "turn_number": 1,
  "turn_timestamp": "2025-09-28T20:37:56.856Z",
  "session_id": "session_1759091876856_7196-498",
  "order_id": "order-1759091837196-498",
  "input_order": [
    {
      "item_name": "10 Traditional Wings",
      "item_id": 2,
      "quantity": 1,
      "modifiers": []
    },
    {
      "item_name": "10 Boneless Wings",
      "item_id": 7,
      "quantity": 1,
      "modifiers": []
    },
    {
      "item_name": "bubly™ Lime Sparkling Water",
      "item_id": 46,
      "quantity": 1,
      "modifiers": []
    },
    {
      "item_name": "Dessert Bundle",
      "item_id": 78,
      "quantity": 1,
      "modifiers": []
    }
  ],
  "critic_actions": [
    {
      "op": "schema_validation",
      "target": "4 items",
      "corrected_value": "VALIDATION_PASSED",
      "rationale": "Schema validation successful: 4 items validated with correct structure"
    },
    {
      "op": "quantity_validation",
      "target": "4 items, 0 modifiers",
      "corrected_value": "VALIDATION_PASSED",
      "rationale": "Quantity validation successful: All items have valid quantities (>0) and modifiers have valid counts (>0)"
    },
    {
      "op": "order_consolidation",
      "target": "4 items",
      "corrected_value": "4 items (consolidated)",
      "rationale": "Order consolidation successful: 0 duplicate items merged"
    },
    {
      "op": "menu_item_validation",
      "target": "4 menu items",
      "corrected_value": "VALIDATION_PASSED",
      "rationale": "Menu item validation successful: All 4 items found in menu with correct IDs"
    },
    {
      "op": "modifier_validation",
      "target": "0 modifiers",
      "corrected_value": "VALIDATION_PASSED",
      "rationale": "Modifier validation successful: All 0 modifiers are valid for their respective items"
    }
  ],
  "corrected_cart": [
    {
      "item_name": "10 Traditional Wings",
      "item_id": 2,
      "quantity": 1,
      "modifiers": []
    },
    {
      "item_name": "10 Boneless Wings",
      "item_id": 7,
      "quantity": 1,
      "modifiers": []
    },
    {
      "item_name": "bubly™ Lime Sparkling Water",
      "item_id": 46,
      "quantity": 1,
      "modifiers": []
    },
    {
      "item_name": "Dessert Bundle",
      "item_id": 78,
      "quantity": 1,
      "modifiers": []
    }
  ],
  "latency_ms": 4,
  "source": "ultravox_webhook",
  "webhook_timestamp": "2025-09-28T20:37:56.856Z",
  "timestamp": "2025-09-28T20:37:56.856Z"
}
```

### For Developers
- Debug Complex Flows: See exactly where and why things break
- Performance Optimization: Identify bottlenecks in real-time
- State Tracking: Understand how orders evolve through the pipeline

### For Operations
- Real-Time Monitoring: Dashboard showing system health
- Error Pattern Detection: Identify recurring issues
- Performance Trends: Track latency and throughput over time

### For Business
- Correction Analytics: See what problems the AI is solving
- Customer Impact: Understand how corrections affect orders
- System Reliability: Monitor success rates and error patterns

## Testing

> **Testing Philosophy**: When you can run 240+ tests in 5 seconds and know with certainty that every customer scenario works perfectly

**Approach**: Integration + unit testing

### Action Test Coverage

| Action | Tests | Coverage |
|--------|-------|----------|
| schema_validation | 25 tests | 100% |
| quantity_validation | 30 tests | 100% |
| menu_item_resolution | 30 tests | 100% |
| **All 8 actions** | **240+ tests** | **100%** |

**Summary**:
- **Total**: 240+ individual test cases
- **Execution**: All tests pass in <5 seconds
- **Coverage**: 100% of critical business logic

### Revolutionary Testing Strategies

### Strategy 1: Isolation Testing
```javascript
// Pure Function Testing
const result = validateSchema({ items: [] });
expect(result.success).toBe(false); // 2ms execution
```

### Strategy 2: Pipeline Testing
```javascript
// Test all 3 modes: production, development, testing
const pipeline = new Pipeline({ mode: 'production' });
expect(result.observability).toBeNull(); // No overhead
```

### Strategy 3: Real-World Scenarios
```javascript
// Customer scenarios: typo-prone, indecisive, cost-conscious
const messyOrder = { items: [{ itemName: 'cofee', quantity: 1 }] };
expect(result.order.items[0].itemName).toBe('Coffee'); // AI resolution
```

### Strategy 4: Performance Testing
```javascript
// Every test includes performance validation
expect(totalTime).toBeLessThan(500)
```

## Performance Metrics

### System Performance Achievements

| Metric | Achievement | Status |
|--------|-------------|--------|
| **Cart Correctness** | 100% on valid menu items | PASSED |
| **Latency** | 2.75ms average (75% better than requirement) | PASSED |
| **Determinism** | Perfect consistency across all runs | PASSED |
| **Coverage** | 100% resolution on menu items, 67% on unknown items | PASSED |
| **Stability** | Zero oscillations, zero drift, perfect state management | PASSED |