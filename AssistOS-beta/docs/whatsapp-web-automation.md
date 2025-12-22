# WhatsApp Web Automation - Technical Documentation

## Table of Contents
1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Automation Flow](#automation-flow)
4. [Message Classification](#message-classification)
5. [Context-Aware Response Generation](#context-aware-response-generation)
6. [AssistME Integration](#assistme-integration)
7. [Configuration](#configuration)
8. [Response Rules & Logic](#response-rules--logic)
9. [Testing & Validation](#testing--validation)
10. [Monitoring & Metrics](#monitoring--metrics)

---

## Overview

The WhatsApp Web Automation system automatically analyzes incoming WhatsApp messages and generates intelligent, context-aware responses using AssistOS's AI capabilities. This system was implemented to:

1. **Automatically respond to client inquiries** about products, pricing, and availability
2. **Provide proactive notifications** to internal teams (AssistME) for order-related messages
3. **Use real business data** from the tenant's system (products, inventory, customers, invoices)
4. **Learn from conversation context** to provide relevant, accurate responses
5. **Reduce manual response time** while maintaining professional communication

### Key Features

✅ **Smart Client Detection**: Only triggers for pre-configured automation clients  
✅ **Message Classification**: AI-powered categorization (order, inquiry, greeting, complaint, etc.)  
✅ **Context-Aware Responses**: Uses AssistME orchestrator with conversation history  
✅ **Real Data Integration**: Queries products, inventory, pricing, customer history  
✅ **Approval Workflow**: Suggests responses for human review before sending  
✅ **Follow-Up Detection**: Recognizes when user responds to questions  
✅ **Multi-Language Support**: Portuguese (primary) and English  

---

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│                  WhatsApp Message Received                   │
└─────────────────────┬───────────────────────────────────────┘
                      │
                      ▼
         ┌────────────────────────┐
         │  Message Listener      │
         │  (message-listener.ts) │
         └────────┬───────────────┘
                  │
                  │ If inbound & has text
                  │
                  ▼
    ┌─────────────────────────────────┐
    │  Automation Analyzer            │
    │  (whatsapp-automation-analyzer) │
    └─────────┬───────────────────────┘
              │
              ├──► 1. Check if configured client
              │    (whatsapp_automation_clients table)
              │
              ├──► 2. Classify message
              │    (whatsapp-message-classifier)
              │
              ├──► 3. Detect follow-up response
              │    (conversation history analysis)
              │
              └──► 4. Generate context-aware response
                   (AssistME orchestrator)
                         │
                         ▼
              ┌─────────────────────────┐
              │  AssistME Orchestrator  │
              │  (with filtered tools)  │
              └─────────┬───────────────┘
                        │
                        ├──► list_products
                        ├──► check_stock
                        ├──► list_stock_items
                        ├──► list_customers
                        ├──► search_customers
                        ├──► list_invoices
                        ├──► universal_search
                        └──► get_company_info
                              │
                              ▼
                ┌────────────────────────────┐
                │  Suggested Response        │
                │  (stored in analysis)      │
                └────────┬───────────────────┘
                         │
                         ▼
           ┌─────────────────────────────────┐
           │  Proactive Notification         │
           │  (AssistME inbox notification)  │
           └─────────────────────────────────┘
```

### Components

#### 1. **Message Listener** (`apps/worker/whatsapp-web/message-listener.ts`)
- Receives all incoming WhatsApp messages
- Filters for inbound messages with text
- Passes to automation analyzer

#### 2. **Automation Analyzer** (`packages/services/whatsapp-automation-analyzer.ts`)
- Core automation logic
- Client validation
- Message classification
- Response generation coordination

#### 3. **Message Classifier** (`apps/api/services/whatsapp-message-classifier.service.ts`)
- AI-powered message categorization
- Uses OpenAI GPT-4o-mini
- Returns category + confidence + reasoning

#### 4. **AssistME Orchestrator** (`packages/ai/agents/assistme/assistme-orchestrator.ts`)
- Generates context-aware responses
- Uses filtered tool set (13 essential tools)
- Respects OpenAI's 128-tool limit
- Provides reasoning and tool usage tracking

#### 5. **Proactive Notifier** (`packages/services/assistme-proactive-notifier.ts`)
- Creates notifications in AssistME inbox
- Includes suggested response
- Links to WhatsApp conversation

---

## Automation Flow

### Detailed Step-by-Step

```typescript
// 1. MESSAGE RECEIVED
async function processMessage(accountId: string, message: Message) {
  // ... standard processing (save to DB, download media, etc.)
  
  // 2. TRIGGER AUTOMATION (only for inbound messages)
  if (!message.fromMe && messageText) {
    
    // 2.1 Fetch conversation history (last 10 messages)
    const recentMessages = await fetchConversationHistory(accountId, contactPhone, 10);
    
    // 2.2 Analyze message
    const analysis = await whatsappAutomationAnalyzer.analyzeMessage(
      tenantId,
      contactPhone,
      messageText,
      conversationHistory,  // For context
      contactName,          // For personalization
    );
    
    // 2.3 If should trigger → send notification
    if (analysis.shouldTrigger && analysis.clientInfo) {
      await assistMEProactiveNotifier.notifyWhatsAppOrderInquiry(
        tenantId,
        analysis,
        messageText,
      );
    }
  }
}
```

### Analysis Logic

```typescript
async analyzeMessage(
  tenantId: string,
  phoneNumber: string,
  messageText: string,
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  contactName?: string,
): Promise<AutomationAnalysisResult>
```

**Steps:**

1. **Check if Configured Client**
```typescript
const client = await db.query.whatsappAutomationClients.findFirst({
  where: and(
    eq(whatsappAutomationClients.tenantId, tenantId),
    eq(whatsappAutomationClients.phoneNumber, phoneNumber),
    eq(whatsappAutomationClients.isActive, true),
  ),
});

if (!client) {
  return { shouldTrigger: false, isConfiguredClient: false, ... };
}
```

2. **Classify Message**
```typescript
const classification = await whatsappClassifier.classifyMessage(messageText);
// Returns: { category, confidence, context: { reasoning, ... } }
```

3. **Detect Follow-Up**
```typescript
const isFollowUpResponse = this.detectFollowUpResponse(
  conversationHistory,
  messageText
);

// Checks if:
// - Last assistant message had a question
// - Current message is a confirmation/affirmation
```

4. **Determine if Order-Related**
```typescript
const isOrderRelated = 
  classification.category === "order" || 
  (classification.category === "info_request" && classification.confidence > 0.7) ||
  isFollowUpResponse;
```

5. **Generate Suggested Response** (if order-related)
```typescript
if (isOrderRelated && client.requiresApproval) {
  const responseResult = await this.generateSuggestedResponse(
    tenantId,
    phoneNumber,
    messageText,
    classification,
    conversationHistory,
  );
  suggestedResponse = responseResult.response;
  contextUsed = responseResult.contextUsed;
}
```

---

## Message Classification

### Categories

The classifier categorizes messages into:

| Category | Description | Examples |
|----------|-------------|----------|
| `order` | Direct order placement | "Quero encomendar 10 unidades", "I'd like to order" |
| `info_request` | Information inquiry | "Quanto custa?", "What's the price?", "Está disponível?" |
| `greeting` | Greetings/social | "Olá", "Bom dia", "Hello" |
| `complaint` | Issues/complaints | "Não recebi o pedido", "There's a problem" |
| `feedback` | Feedback/reviews | "Muito bom produto", "Great service" |
| `cancel_request` | Cancellation | "Quero cancelar", "Cancel my order" |
| `payment_inquiry` | Payment questions | "Como pago?", "Payment options?" |
| `delivery_inquiry` | Delivery questions | "Quando chega?", "When will it arrive?" |
| `other` | Other messages | General chat, unclear intent |

### Classification API

**Service**: `apps/api/services/whatsapp-message-classifier.service.ts`

```typescript
async classifyMessage(messageText: string): Promise<{
  category: MessageCategory;
  confidence: number;
  context: {
    reasoning: string;
    keywords?: string[];
    sentiment?: 'positive' | 'neutral' | 'negative';
  };
}>
```

**Implementation:**
```typescript
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    {
      role: 'system',
      content: `You are a WhatsApp message classifier...`
    },
    {
      role: 'user',
      content: messageText
    }
  ],
  response_format: { type: "json_object" },
  temperature: 0.3, // Low for consistency
});
```

**Response Format:**
```json
{
  "category": "info_request",
  "confidence": 0.85,
  "context": {
    "reasoning": "User is asking about product availability and pricing",
    "keywords": ["disponível", "preço", "quanto custa"],
    "sentiment": "neutral"
  }
}
```

---

## Context-Aware Response Generation

### AssistME Integration

The automation uses AssistME's full orchestrator with a **filtered tool set** to generate responses.

### Tool Filtering (Critical for Performance)

**Problem**: OpenAI has a 128-tool limit per API call  
**Solution**: Filter to only essential tools for WhatsApp automation

```typescript
const essentialToolNames = [
  // Inventory & Products (core for most inquiries)
  'list_products',
  'check_stock',
  'list_stock_items',
  'stock_alert',
  
  // Customer Management (lookup customer info)
  'list_customers',
  'search_customers',
  'create_customer',
  'list_contacts',
  
  // Sales/Leads (for quotes if needed)
  'create_budget_quote',
  'list_leads',
  
  // Pricing/Financial (for invoice queries)
  'list_invoices',
  'create_invoice',
  
  // General search (helpful for any query)
  'universal_search',
  'get_dashboard_summary',
  'get_company_info',
];

// Filter tools from all available tools
const relevantTools = allTools.filter(tool => 
  essentialToolNames.includes(tool.name)
);

// Pass to AssistME (13 tools, well under 128 limit)
const result = await assistMEOrchestrator.processMessage(
  prompt,
  context,
  undefined,
  conversationHistory,
  undefined,
  relevantTools  // ← Filtered tools
);
```

### Prompt Engineering

The system uses a detailed Portuguese prompt that instructs AssistME on:

1. **Tool Usage Rules**
   - ALWAYS use tools BEFORE responding
   - NEVER say "vou verificar" (I'll check) - use tools NOW
   - Choose correct tools for query type

2. **Query Type Classification**

   **Price/Info Questions** → `list_products`
   - Show price ALWAYS, even if stock = 0
   - Example: "Produto X custa €25/unidade. Sem stock atualmente."

   **Availability Questions** → `check_stock` + `list_products` (for alternatives)
   - Only offer products with stock > 0
   - Example: "Produto X sem stock. Alternativa: Produto Y (€20, 15 unid)."

   **Mixed Questions** → `list_products` first, then `check_stock` if needed
   - Show price + availability
   - Example: "Produto X: €25/unidade, 45 unidades em stock."

   **Catalog Questions** → `list_products` (without stock filter)
   - Show full catalog
   - Example: "Temos 15 produtos. Principais: [lista]."

   **Order/Customer Questions** → Customer/invoice tools
   - Don't use product tools unnecessarily

3. **Response Format**
   - Professional and courteous
   - Direct (2-4 sentences)
   - ONLY useful information based on REAL data
   - Concrete data (names, prices, stock when relevant)

### Example Prompt (Excerpt)

```text
🚨 REGRA CRÍTICA - USO INTELIGENTE DE FERRAMENTAS:
ANTES de responder, TENS QUE usar as ferramentas disponíveis para obter dados reais.
❌ NUNCA respondas com "vou verificar" ou "vou consultar" - USA AS FERRAMENTAS AGORA!
❌ NUNCA respondas sem PRIMEIRO consultar o sistema usando as ferramentas
✅ SEMPRE usa ferramentas para obter informação específica e concreta
✅ USA APENAS as ferramentas necessárias para o tipo de pergunta

📊 CLASSIFICAÇÃO DE PERGUNTAS E FERRAMENTAS CORRETAS:

1️⃣ PERGUNTAS DE PREÇO/INFORMAÇÃO (ex: "quanto custa?", "qual o preço?"):
   → USA: list_products (com search para encontrar o produto)
   → COMPORTAMENTO: Mostra preço SEMPRE, mesmo se stock = 0
   → RESPOSTA: "Produto X custa €25/unidade. Atualmente sem stock, nova remessa em [data]."
   ❌ NÃO USES: check_stock (desnecessário para perguntas de preço)

2️⃣ PERGUNTAS DE DISPONIBILIDADE (ex: "está disponível?", "tem em stock?"):
   → PRIMEIRO: check_stock (para produto específico)
   → SE stock = 0: DEPOIS usa list_products (para procurar similares COM stock > 0)
   → COMPORTAMENTO: Só oferece produtos disponíveis (stock > 0)
   → RESPOSTA: "Produto X sem stock. Alternativa: Produto Y disponível (€20, 15 unidades)."

[... more detailed rules ...]
```

### Response Validation & Cleaning

After AssistME generates a response, it's validated and cleaned:

```typescript
private validateAndCleanResponse(response: string): string {
  let cleaned = response.trim();
  
  // Remove tool call artifacts
  cleaned = cleaned.replace(/\[Tool:?[^\]]*\]/gi, '');
  cleaned = cleaned.replace(/\[Calling tool[^\]]*\]/gi, '');
  
  // Remove code blocks
  cleaned = cleaned.replace(/```[\s\S]*?```/g, '');
  
  // Remove markdown headers
  cleaned = cleaned.replace(/^#+\s/gm, '');
  
  // Remove excessive newlines
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n');
  
  // Truncate if too long (max 600 chars for WhatsApp)
  if (cleaned.length > 600) {
    cleaned = cleaned.substring(0, 580).trim();
    // Try to end at a sentence
    const lastSentenceEnd = Math.max(
      cleaned.lastIndexOf('.'),
      cleaned.lastIndexOf('!'),
      cleaned.lastIndexOf('?')
    );
    if (lastSentenceEnd > 400) {
      cleaned = cleaned.substring(0, lastSentenceEnd + 1);
    } else {
      cleaned = cleaned + '...';
    }
  }
  
  // Fallback if too short
  if (cleaned.length < 10) {
    return "Obrigado pela sua mensagem. Vou analisar e respondo já de seguida.";
  }
  
  return cleaned.trim();
}
```

---

## AssistME Integration

### Context Used Tracking

The system tracks which business data was consulted:

```typescript
const contextUsed = {
  checkedProducts: toolsUsed.some((t: string) => 
    t.includes('product') || t.includes('inventory') || t.includes('item')
  ),
  checkedInventory: toolsUsed.some((t: string) => 
    t.includes('inventory') || t.includes('stock')
  ),
  checkedPricing: toolsUsed.some((t: string) => 
    t.includes('price') || t.includes('pricing') || t.includes('quote')
  ),
  checkedClientHistory: toolsUsed.some((t: string) => 
    t.includes('client') || t.includes('customer') || t.includes('order') || t.includes('history')
  ),
  toolsUsed: ['list_products', 'check_stock', ...],
};
```

This information is:
1. Logged for debugging
2. Stored in the analysis result
3. Displayed in AssistME notification
4. Used for audit/analytics

### Conversation History

The system provides conversation context to AssistME:

```typescript
// Fetch last 10 messages from database
const recentMessages = await db.query.whatsappMessages.findMany({
  where: and(
    eq(whatsappMessages.accountId, accountId),
    or(
      eq(whatsappMessages.fromNumber, contactPhone),
      eq(whatsappMessages.toNumber, contactPhone),
    ),
  ),
  orderBy: [desc(whatsappMessages.timestamp)],
  limit: 10,
});

// Convert to conversation format
const conversationHistory: Array<{ role: 'user' | 'assistant'; content: string }> = 
  recentMessages
    .reverse() // Chronological order
    .filter(msg => msg.text)
    .map(msg => ({
      role: msg.direction === 'outbound' ? 'assistant' : 'user',
      content: msg.text || '',
    }));
```

**Benefits:**
- Understands context of previous messages
- Avoids repeating information
- Detects follow-up questions
- Provides continuity in conversation

---

## Configuration

### Automation Clients Table

**Schema**: `whatsapp_automation_clients`

```sql
CREATE TABLE whatsapp_automation_clients (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  phone_number VARCHAR(20) NOT NULL,
  name VARCHAR(255),
  is_active BOOLEAN DEFAULT true,
  requires_approval BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(tenant_id, phone_number)
);
```

**Fields:**
- `tenant_id`: Tenant this client belongs to
- `phone_number`: WhatsApp number (e.g., "351912345678")
- `name`: Optional client name (fallback if WhatsApp contact has no name)
- `is_active`: Enable/disable automation for this client
- `requires_approval`: If true, sends to AssistME for review; if false, auto-sends response

### Adding Automation Clients

**API Endpoint** (to be implemented):
```typescript
POST /api/whatsapp-automation/clients
{
  "phoneNumber": "351912345678",
  "name": "Cliente VIP",
  "requiresApproval": true,
  "isActive": true
}
```

**Direct Database**:
```sql
INSERT INTO whatsapp_automation_clients (tenant_id, phone_number, name, requires_approval, is_active)
VALUES ('tenant-uuid', '351912345678', 'Cliente VIP', true, true);
```

### Automation Settings (Future)

Planned settings per tenant:

```typescript
interface AutomationSettings {
  enabled: boolean;
  autoSendWithoutApproval: boolean;  // If true, sends directly
  businessHoursOnly: boolean;
  businessHours: {
    start: string;  // "09:00"
    end: string;    // "18:00"
    timezone: string;
  };
  maxResponseLength: number;  // Default: 600
  language: 'pt' | 'en';
  customPrompt?: string;  // Override default prompt
}
```

---

## Response Rules & Logic

### Decision Tree

```
Inbound Message Received
        │
        ▼
  Is Configured Client?
        │
    No  │  Yes
        │
        ▼
  Classify Message
        │
        ├─► order → isOrderRelated = true
        ├─► info_request (conf > 0.7) → isOrderRelated = true
        ├─► Is follow-up response? → isOrderRelated = true
        └─► other → isOrderRelated = false
                │
                ▼
         Is Order-Related?
                │
            No  │  Yes
                │
                ▼
         Requires Approval?
                │
        Yes ┌───┴───┐ No
            │       │
            ▼       ▼
     Send to      Auto-send
     AssistME     Response
     for review   (future)
```

### Follow-Up Detection Logic

```typescript
private detectFollowUpResponse(
  conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>,
  currentMessage?: string
): boolean {
  if (!conversationHistory || conversationHistory.length === 0) {
    return false;
  }

  // Get last assistant message
  const lastAssistantMessage = conversationHistory
    .slice()
    .reverse()
    .find(msg => msg.role === 'assistant');

  if (!lastAssistantMessage) {
    return false;
  }

  // Check if last assistant message had a question
  const hasQuestionMark = lastAssistantMessage.content.includes('?');
  const hasQuestionWords = /\b(quer|deseja|gostaria|pode|precisa|confirma|want|would|can)\b/i
    .test(lastAssistantMessage.content);

  // Check if current message is confirmation
  const confirmationWords = /\b(sim|yes|ok|okay|sure|claro|confirmo|concordo|aceito|pode ser)\b/i;
  const isConfirmation = currentMessage && confirmationWords.test(currentMessage.toLowerCase());

  // If we asked a question AND they confirmed → follow-up
  return (hasQuestionMark || hasQuestionWords) && isConfirmation;
}
```

**Example:**
```
Assistant: "Produto X custa €25. Quer fazer pedido?"
User: "Sim, pode ser"  ← Detected as follow-up
→ isOrderRelated = true (even though message itself isn't classified as "order")
```

### Response Quality Rules

1. **Always Use Real Data**
   - Never make up prices or availability
   - If product not found, say so explicitly
   - If stock is 0, mention it and suggest alternatives

2. **Be Specific**
   - Include product names, prices, quantities
   - Mention exact availability status
   - Provide actionable next steps

3. **Professional Tone**
   - Courteous and respectful
   - No excessive formality
   - Match customer's language (PT/EN)

4. **Concise**
   - 2-4 sentences ideal
   - Max 600 characters
   - Don't overwhelm with too much info

---

## Testing & Validation

### Unit Tests (Recommended)

```typescript
describe('WhatsApp Automation Analyzer', () => {
  it('should detect configured clients', async () => {
    const result = await whatsappAutomationAnalyzer.analyzeMessage(
      tenantId,
      '351912345678',  // Configured client
      'Quanto custa o produto X?',
    );
    expect(result.isConfiguredClient).toBe(true);
  });

  it('should classify order messages', async () => {
    const result = await whatsappAutomationAnalyzer.analyzeMessage(
      tenantId,
      configuredPhone,
      'Quero encomendar 10 unidades',
    );
    expect(result.category).toBe('order');
    expect(result.isOrderRelated).toBe(true);
  });

  it('should detect follow-up responses', async () => {
    const conversationHistory = [
      { role: 'assistant', content: 'Produto X custa €25. Quer fazer pedido?' },
    ];
    const result = await whatsappAutomationAnalyzer.analyzeMessage(
      tenantId,
      configuredPhone,
      'Sim, pode ser',
      conversationHistory,
    );
    expect(result.isOrderRelated).toBe(true);
  });

  it('should generate response with real data', async () => {
    const result = await whatsappAutomationAnalyzer.analyzeMessage(
      tenantId,
      configuredPhone,
      'Quanto custa o produto X?',
    );
    expect(result.suggestedResponse).toBeDefined();
    expect(result.contextUsed?.checkedProducts).toBe(true);
    expect(result.contextUsed?.toolsUsed).toContain('list_products');
  });
});
```

### Integration Tests

```typescript
describe('WhatsApp Automation E2E', () => {
  it('should process inbound message and create AssistME notification', async () => {
    // 1. Simulate WhatsApp message
    const message = createMockWhatsAppMessage({
      from: '351912345678@c.us',
      body: 'Quanto custa o produto X?',
    });

    // 2. Process message
    await processMessage(accountId, message);

    // 3. Verify automation triggered
    const notifications = await db.query.assistmeNotifications.findMany({
      where: eq(assistmeNotifications.tenantId, tenantId),
      orderBy: [desc(assistmeNotifications.createdAt)],
      limit: 1,
    });

    expect(notifications).toHaveLength(1);
    expect(notifications[0].type).toBe('whatsapp_order_inquiry');
    expect(notifications[0].suggestedResponse).toBeDefined();
  });
});
```

### Manual Testing Checklist

- [ ] Send price inquiry → verify response includes actual price from database
- [ ] Send availability inquiry → verify response checks stock and offers alternatives if needed
- [ ] Send order request → verify AssistME notification created
- [ ] Send follow-up confirmation → verify detected as follow-up
- [ ] Send message from non-configured number → verify no automation
- [ ] Send greeting message → verify no automation (not order-related)
- [ ] Verify conversation history is used (ask follow-up question)
- [ ] Verify tools are being called (check logs for tool usage)
- [ ] Verify response is cleaned (no [Tool: ...] artifacts)
- [ ] Verify response is within length limit

### Logging & Debugging

Enable detailed logging:

```typescript
// In message-listener.ts
console.log(`[WhatsApp Automation] Analysis result:`, {
  shouldTrigger: analysis.shouldTrigger,
  isConfiguredClient: analysis.isConfiguredClient,
  isOrderRelated: analysis.isOrderRelated,
  category: analysis.category,
  confidence: analysis.confidence,
});

console.log(`[WhatsApp Automation] AssistME response generated:`, {
  length: result.response?.length,
  toolsUsed: result.toolResults?.length || 0,
});

console.log(`[WhatsApp Automation] Context used:`, contextUsed);
```

Logs to monitor:
- `[WhatsApp Automation]` - Automation trigger logs
- `[AssistME Orchestrator]` - AI response generation
- `[Tool Execution]` - Tool calls and results
- `[WhatsApp Web]` - Message processing

---

## Monitoring & Metrics

### Key Metrics to Track

1. **Automation Trigger Rate**
   - Total inbound messages
   - Messages from configured clients
   - Messages classified as order-related
   - Automation trigger rate = (triggered / total) %

2. **Response Quality**
   - Average response length
   - Tool usage frequency (which tools are most used)
   - Response generation time
   - Response approval rate (how many human approves vs. edits)

3. **Classification Accuracy**
   - Correct classifications (requires manual review)
   - Confidence scores distribution
   - False positives (triggered when shouldn't)
   - False negatives (didn't trigger when should)

4. **Performance**
   - Average response generation time
   - Tool execution time
   - Database query time
   - OpenAI API latency

### Monitoring Dashboard (Future)

Suggested metrics to display:

```typescript
interface AutomationMetrics {
  period: '24h' | '7d' | '30d';
  
  messages: {
    total: number;
    fromConfiguredClients: number;
    automationTriggered: number;
    triggerRate: number;  // %
  };
  
  classification: {
    byCategory: Record<MessageCategory, number>;
    averageConfidence: number;
    lowConfidenceCount: number;  // < 0.7
  };
  
  responses: {
    generated: number;
    averageLength: number;
    approved: number;
    edited: number;
    rejected: number;
  };
  
  tools: {
    totalCalls: number;
    byTool: Record<string, number>;
    averageToolsPerResponse: number;
  };
  
  performance: {
    averageResponseTime: number;  // ms
    p95ResponseTime: number;
    p99ResponseTime: number;
  };
}
```

### Alerting

Set up alerts for:

- ⚠️ Classification confidence < 0.5 (may indicate unclear messages)
- ⚠️ Response generation time > 10s (performance issue)
- ⚠️ High edit rate > 50% (responses need improvement)
- ⚠️ No tool usage (AI not using real data)
- 🚨 OpenAI API errors
- 🚨 Database connection errors

---

## Advanced Features (Future Enhancements)

### 1. Auto-Send Mode

Allow trusted clients to receive auto-generated responses without human approval:

```typescript
if (isOrderRelated && !client.requiresApproval) {
  // Send response directly to WhatsApp
  await sessionManager.sendTextMessage(
    accountId,
    contactPhone,
    suggestedResponse
  );
  
  // Log for audit
  await db.insert(whatsappAutomationLogs).values({
    tenantId,
    messageId: message.id,
    action: 'auto_sent',
    response: suggestedResponse,
  });
}
```

### 2. Learning from Edits

Track how humans edit suggested responses to improve the AI:

```typescript
// When human edits response in AssistME
await db.insert(whatsappResponseFeedback).values({
  messageId: originalMessage.id,
  suggestedResponse: aiResponse,
  actualResponse: humanEditedResponse,
  feedback: 'edited',
  editDistance: levenshteinDistance(aiResponse, humanEditedResponse),
});

// Periodically analyze feedback to improve prompts
```

### 3. Multi-Language Detection

Auto-detect language and switch prompt:

```typescript
const detectedLanguage = detectLanguage(messageText);
const prompt = detectedLanguage === 'en' 
  ? englishAutomationPrompt 
  : portugueseAutomationPrompt;
```

### 4. Custom Response Templates

Allow tenants to define response templates:

```typescript
// Template with placeholders
const template = "Olá {name}, o {product} custa {price} e temos {stock} unidades disponíveis.";

// Fill with real data
const response = fillTemplate(template, {
  name: contactName,
  product: productName,
  price: formatPrice(product.price),
  stock: product.stock,
});
```

### 5. Sentiment Analysis

Track customer sentiment over time:

```typescript
const sentiment = await analyzeSentiment(messageText);

await db.update(whatsappContacts)
  .set({
    lastSentiment: sentiment.score,
    sentimentHistory: sql`array_append(sentiment_history, ${sentiment.score})`,
  })
  .where(eq(whatsappContacts.id, contact.id));

// Alert if customer sentiment becomes negative
if (sentiment.score < -0.5) {
  await notifyManager('Customer sentiment negative', { contactPhone });
}
```

### 6. Conversation Summarization

Automatically summarize long conversations:

```typescript
const summary = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [
    {
      role: 'system',
      content: 'Summarize this WhatsApp conversation in 2-3 sentences.',
    },
    {
      role: 'user',
      content: conversationHistory.map(m => `${m.role}: ${m.content}`).join('\n'),
    },
  ],
});

await db.update(whatsappConversations)
  .set({ summary: summary.choices[0].message.content })
  .where(eq(whatsappConversations.id, conversation.id));
```

---

## Best Practices

### Do's ✅

1. **Always validate client is configured** before triggering automation
2. **Use conversation history** to provide context-aware responses
3. **Log all automation actions** for debugging and audit
4. **Monitor tool usage** to ensure AI is using real data
5. **Clean and validate responses** before sending to AssistME
6. **Respect rate limits** on OpenAI API calls
7. **Test with real data** from production-like environments
8. **Provide fallback responses** if AI generation fails
9. **Track metrics** to measure effectiveness
10. **Iterate on prompts** based on real-world usage

### Don'ts ❌

1. **Don't auto-send without approval** (initially - requires thorough testing)
2. **Don't hardcode client phone numbers** (use database table)
3. **Don't make up data** if tools return empty results
4. **Don't ignore classification confidence** (low confidence = uncertain)
5. **Don't skip follow-up detection** (important for UX)
6. **Don't use all 100+ tools** (causes API errors, slow responses)
7. **Don't forget to clean responses** (remove artifacts)
8. **Don't ignore errors** (log and alert on failures)
9. **Don't optimize prematurely** (measure first, then optimize)
10. **Don't assume language** (detect or infer from previous messages)

---

## Troubleshooting

### Common Issues

#### 1. Automation Not Triggering

**Symptom:** Message received but no AssistME notification

**Debug Steps:**
```typescript
// Check if client is configured
const client = await db.query.whatsappAutomationClients.findFirst({
  where: and(
    eq(whatsappAutomationClients.phoneNumber, phoneNumber),
    eq(whatsappAutomationClients.isActive, true),
  ),
});
console.log('Client found:', !!client);

// Check message classification
const classification = await whatsappClassifier.classifyMessage(messageText);
console.log('Classification:', classification);

// Check if order-related
console.log('Is order-related:', isOrderRelated);
```

**Common Causes:**
- Phone number not in `whatsapp_automation_clients` table
- `is_active = false`
- Message classified as non-order-related (e.g., greeting)
- Message is from self (`fromMe = true`)

#### 2. Response Contains [Tool: ...] Artifacts

**Symptom:** Generated response has tool execution logs

**Solution:**
- Check `validateAndCleanResponse()` function is being called
- Verify regex patterns are correctly removing artifacts
- Update regex if new artifact patterns appear

#### 3. Response Too Generic / Not Using Real Data

**Symptom:** Response says "vou verificar" instead of providing actual data

**Debug Steps:**
```typescript
// Check tool results
console.log('Tools used:', result.toolResults);
console.log('Context used:', contextUsed);

// Verify tools are returning data
const products = await list_products({ tenantId, search: 'produto X' });
console.log('Products found:', products);
```

**Common Causes:**
- Tools not available to orchestrator (check filtered tools list)
- Tool execution failing silently
- Prompt not clear enough about using tools
- Database empty (no products/inventory data)

#### 4. OpenAI API Rate Limit Exceeded

**Symptom:** Error: "Rate limit exceeded"

**Solutions:**
- Implement request queuing with rate limiter
- Use GPT-4o-mini instead of GPT-4 (higher rate limits)
- Cache responses for similar queries
- Add exponential backoff retry logic

```typescript
async function retryWithBackoff(fn: () => Promise<any>, maxRetries = 3) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      if (error.code === 'rate_limit_exceeded' && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000;  // 1s, 2s, 4s
        await new Promise(resolve => setTimeout(resolve, delay));
      } else {
        throw error;
      }
    }
  }
}
```

#### 5. Response Generation Too Slow

**Symptom:** Takes > 10 seconds to generate response

**Optimizations:**
- Reduce tool set further (only include most relevant tools)
- Decrease `messagesPerChat` for conversation history (use 5 instead of 10)
- Implement response caching for common queries
- Use streaming mode for faster perceived performance

---

## Security & Privacy

### Data Handling

1. **Message Content**
   - All messages stored encrypted at rest (database-level encryption)
   - Transmitted over HTTPS between API and worker
   - OpenAI API calls are HTTPS (data encrypted in transit)

2. **PII Protection**
   - Phone numbers stored securely
   - Customer names and contact info access-controlled by tenant
   - No sensitive data logged in plain text

3. **Access Control**
   - Only authenticated users can trigger automation
   - Tenant isolation enforced at database level
   - AssistME notifications only visible to tenant members

4. **API Key Security**
   - OpenAI API keys stored in environment variables (not in code)
   - Never logged or exposed in responses
   - Rotated regularly (recommended)

### Compliance

- **GDPR**: Ensure customer consent for automated messaging
- **Data Retention**: Implement message retention policies
- **Right to Deletion**: Provide mechanism to delete customer data
- **Audit Trail**: Log all automation actions for compliance

---

## Performance Optimization

### Current Performance

| Metric | Value |
|--------|-------|
| Average response generation time | 3-8 seconds |
| Tools filtered | 13 out of 100+ |
| OpenAI API calls per message | 2 (classification + generation) |
| Database queries per message | 5-10 |
| Conversation history | Last 10 messages |

### Optimization Strategies

1. **Caching**
```typescript
// Cache product list (updated every 5 minutes)
const productCache = new Map<string, { data: any; expires: number }>();

async function getCachedProducts(tenantId: string) {
  const cached = productCache.get(tenantId);
  if (cached && cached.expires > Date.now()) {
    return cached.data;
  }
  
  const products = await fetchProducts(tenantId);
  productCache.set(tenantId, {
    data: products,
    expires: Date.now() + 5 * 60 * 1000,  // 5 minutes
  });
  
  return products;
}
```

2. **Parallel Processing**
```typescript
// Fetch classification and client info in parallel
const [classification, client] = await Promise.all([
  whatsappClassifier.classifyMessage(messageText),
  db.query.whatsappAutomationClients.findFirst(...),
]);
```

3. **Smart Tool Selection**
```typescript
// Only include tools relevant to message category
const relevantTools = classification.category === 'order'
  ? ['list_products', 'check_stock', 'create_customer']
  : classification.category === 'payment_inquiry'
  ? ['list_invoices', 'get_company_info']
  : essentialToolNames;
```

4. **Response Caching**
```typescript
// Cache common question responses (e.g., "what's your address?")
const responseCache = new Map<string, string>();

const cacheKey = `${tenantId}:${normalizeQuery(messageText)}`;
const cached = responseCache.get(cacheKey);
if (cached) {
  return cached;
}
```

---

## Changelog

### Version 1.0 (December 8, 2024)
- ✅ Initial implementation of WhatsApp automation
- ✅ Message classification with GPT-4o-mini
- ✅ Context-aware response generation with AssistME
- ✅ Tool filtering (13 essential tools)
- ✅ Conversation history support
- ✅ Follow-up detection
- ✅ AssistME proactive notifications
- ✅ Portuguese + English support
- ✅ Response validation and cleaning

### Future Roadmap

**Q1 2025**
- [ ] Auto-send mode (bypass approval for trusted clients)
- [ ] Multi-language detection
- [ ] Sentiment analysis
- [ ] Response templates

**Q2 2025**
- [ ] Learning from edits (improve AI based on human corrections)
- [ ] Conversation summarization
- [ ] Advanced analytics dashboard
- [ ] A/B testing for different prompts

**Q3 2025**
- [ ] Voice message transcription + response
- [ ] Image recognition for product inquiries
- [ ] Proactive outreach (e.g., order confirmations, shipping updates)
- [ ] Integration with CRM for customer insights

---

## References

- **OpenAI API**: https://platform.openai.com/docs
- **AssistME Orchestrator**: `packages/ai/agents/assistme/assistme-orchestrator.ts`
- **Message Classifier**: `apps/api/services/whatsapp-message-classifier.service.ts`
- **Automation Analyzer**: `packages/services/whatsapp-automation-analyzer.ts`
- **Message Listener**: `apps/worker/whatsapp-web/message-listener.ts`

---

**Document Version**: 1.0  
**Last Updated**: December 8, 2024  
**Maintainer**: AssistOS Engineering Team  
**Related Docs**: [WhatsApp Web Connector](./whatsapp-web-connector.md)
