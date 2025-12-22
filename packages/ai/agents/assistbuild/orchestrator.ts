import OpenAI from "openai";
import type { Stream } from "openai/streaming";
import type {
  ChatCompletionChunk,
  ChatCompletionCreateParamsStreaming,
} from "openai/resources/chat/completions";
import { toolRegistry, type ToolManifest } from "../../tools/kernel";
import { filterAssistBuildTools } from "../../tools/kernel/tool-allowlists";
import type { OrchestratorConfig, TenantContext } from "./types";
import { creditUsageService } from "../../../services/credit-usage";

export class AssistBuildOrchestrator {
  private openai: OpenAI;
  private config: OrchestratorConfig;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      timeout: 120000, // ✅ 2 minute timeout prevents hanging requests
      maxRetries: 1, // ✅ Fail fast instead of long retry cycles
    });

    // 🔒 CRITICAL SECURITY: AssistBuild ONLY gets configuration tools, NEVER operational tools
    const allManifests = toolRegistry.getAllManifests();
    const configurationToolsOnly = filterAssistBuildTools(allManifests);

    console.log(
      `[AssistBuild] 🔒 Security filter: ${allManifests.length} total tools → ${configurationToolsOnly.length} configuration tools allowed`,
    );

    this.config = {
      model: config.model || "gpt-5",
      temperature: config.temperature || 0.2,
      maxTokens: config.maxTokens || 8192,
      tools: config.tools || configurationToolsOnly,
    };
  }

  async processMessage(
    userMessage: string,
    context: TenantContext,
    onProgress?: (message: string) => void,
    conversationHistory?: Array<{
      role: "user" | "assistant";
      content: string;
    }>,
    onStreamChunk?: (chunk: string) => void,
    availableTools?: ToolManifest[],
  ): Promise<string> {
    console.log(`[AssistBuild] Starting processMessage for tenant ${context.tenantId}`);
    console.log(`[AssistBuild] User message: "${userMessage.substring(0, 100)}..."`);
    
    // 💳 PRE-FLIGHT CREDIT CHECK: Block operation if insufficient credits
    try {
      await creditUsageService.checkSufficientCredits(context.tenantId, 1);
    } catch (error) {
      console.error('[AssistBuild] ❌ BLOCKED: Insufficient credits', error);
      throw error; // Block the operation
    }
    
    onProgress?.('🚀 Preparing AssistBuild\n');
    
    const systemPrompt = this.buildSystemPrompt(context);

    const modelName = this.config.model === "gpt-5" ? "GPT-5" : "GPT-4o";
    onProgress?.(`🤖 Processing with ${modelName}\n`);

    // Build messages array with conversation history
    const messages: any[] = [];

    // Add previous conversation context (last 10 messages to stay within token limits)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10);
      messages.push(
        ...recentHistory.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
      );
    }

    // Add current user message
    messages.push({ role: "user", content: userMessage });

    // 🔒 CRITICAL SECURITY: Always filter to configuration tools only
    const baseTools = availableTools || this.config.tools;
    const toolManifests = filterAssistBuildTools(baseTools);

    if (baseTools.length !== toolManifests.length) {
      console.log(
        `[AssistBuild] 🔒 Security filter applied: ${baseTools.length} tools → ${toolManifests.length} configuration tools`,
      );
    }
    console.log(
      `[AssistBuild] Using ${toolManifests.length} tools for this request`,
    );

    // Convert tools to OpenAI format
    const tools = toolManifests.map((manifest) => ({
      type: "function" as const,
      function: {
        name: manifest.name,
        description: manifest.description,
        parameters: this.buildParametersSchema(manifest),
      },
    }));

    let fullResponse = "";
    let continueLoop = true;
    let iterationCount = 0;
    const maxIterations = 10;

    // 📊 Accumulate token usage across all iterations (critical for tool call scenarios)
    let totalUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    while (continueLoop) {
      iterationCount++;
      console.log(
        `[AssistBuild] 🔄 Starting iteration ${iterationCount}`,
      );

      // ✨ STREAMING ENABLED: Real-time progressive responses like Replit Agent!
      // 🔧 GPT-5 doesn't support custom temperature - only default (1) is allowed
      const completionParams: ChatCompletionCreateParamsStreaming = {
        model: this.config.model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        tools: tools.length > 0 ? tools : undefined,
        max_completion_tokens: this.config.maxTokens,
        stream: true, // ✅ Enable streaming!
        stream_options: { include_usage: true }, // ✅ Get actual token usage!
        ...(this.config.model !== "gpt-5" && {
          temperature: this.config.temperature,
        }),
      };

      console.log(
        `[AssistBuild] 📡 Calling OpenAI API (model: ${this.config.model}, messages: ${messages.length}, tools: ${tools.length})`,
      );

      // Initialize streaming variables OUTSIDE try block so they're accessible after
      let streamedContent = "";
      let streamedToolCalls: any[] = [];
      const toolCallsBuffer: Record<
        number,
        { id?: string; name?: string; arguments?: string }
      > = {};
      let chunkCount = 0;

      try {
        const stream: Stream<ChatCompletionChunk> =
          await this.openai.chat.completions.create(completionParams);

        console.log(
          `[AssistBuild] ✅ OpenAI stream created successfully, processing chunks...`,
        );

        // Process stream chunks in real-time
        for await (const chunk of stream) {
          chunkCount++;
          const delta = chunk.choices[0]?.delta;

          // 📊 Extract and accumulate usage data from final chunk (handles multi-iteration scenarios)
          if (chunk.usage) {
            totalUsage.prompt_tokens += chunk.usage.prompt_tokens;
            totalUsage.completion_tokens += chunk.usage.completion_tokens;
            totalUsage.total_tokens += chunk.usage.total_tokens;
            console.log(
              `[AssistBuild] 📊 Iteration ${iterationCount} tokens: ${chunk.usage.total_tokens} (${chunk.usage.prompt_tokens} prompt + ${chunk.usage.completion_tokens} completion)`,
            );
          }

          if (!delta) continue;

          // Stream text content progressively
          if (delta.content) {
            if (iterationCount !== 1 && chunkCount === 2) {
              const content = "\n\n---\n" + delta.content;
              streamedContent += content;
              fullResponse += content;
              onStreamChunk?.(content); // ✅ Send chunks in real-time!
            } else {
              const content = delta.content;
              streamedContent += content;
              fullResponse += content;
              onStreamChunk?.(content); // ✅ Send chunks in real-time!
            }
          }

          // Accumulate tool calls (they come in fragments)
          if (delta.tool_calls) {
            for (const toolCallDelta of delta.tool_calls) {
              const index = toolCallDelta.index;

              if (!toolCallsBuffer[index]) {
                toolCallsBuffer[index] = { id: "", name: "", arguments: "" };
              }

              if (toolCallDelta.id) {
                toolCallsBuffer[index].id = toolCallDelta.id;
              }

              if (toolCallDelta.function?.name) {
                toolCallsBuffer[index].name = toolCallDelta.function.name;
              }

              if (toolCallDelta.function?.arguments) {
                toolCallsBuffer[index].arguments =
                  (toolCallsBuffer[index].arguments || "") +
                  toolCallDelta.function.arguments;
              }
            }
          }
        }

        console.log(
          `[AssistBuild] ✅ Stream processing completed: ${chunkCount} chunks, ${streamedContent.length} chars content, ${Object.keys(toolCallsBuffer).length} tool calls`,
        );
      } catch (apiError: any) {
        console.error(
          `[AssistBuild] ❌ OpenAI API call failed:`,
          apiError.message,
        );
        console.error(`[AssistBuild] Stack:`, apiError.stack);

        // Re-throw to be caught by outer handler
        throw new Error(`OpenAI API error: ${apiError.message}`);
      }

      // Convert buffered tool calls to final format
      streamedToolCalls = Object.values(toolCallsBuffer)
        .filter((tc) => tc.id && tc.name)
        .map((tc) => ({
          id: tc.id,
          type: "function",
          function: {
            name: tc.name,
            arguments: tc.arguments || "{}",
          },
        }));

      // Build complete message for history
      const message: any = {
        role: "assistant",
        content: streamedContent || null,
      };

      if (streamedToolCalls.length > 0) {
        message.tool_calls = streamedToolCalls;
      }

      // Add assistant message to history
      messages.push(message);

      // Check if we need to execute tools
      if (streamedToolCalls.length > 0) {
        console.log(
          `[AssistBuild] 🔧 Calling ${streamedToolCalls.length} tools:`,
          streamedToolCalls.map((t: any) => t.function.name),
        );

        const toolResults = [];

        for (const toolCall of streamedToolCalls) {
          const toolName = toolCall.function.name;
          const toolParams = JSON.parse(toolCall.function.arguments);

          console.log(`[AssistBuild] Executing tool: ${toolName}`);

          // Get friendly tool name for progress message
          const toolProgressMessage = this.getToolProgressMessage(toolName);
          onProgress?.(`\n${toolProgressMessage}\n`);

          const result = await toolRegistry.execute(
            toolName,
            toolParams,
            {
              tenantId: context.tenantId,
              userId: context.userId,
              environment: context.environment,
            },
            (progress, msg) => {
              onProgress?.(
                `🛠️ ▸ ${progress > 0 ? progress + "%" : ""}: ${msg}`,
              );
            },
          );

          if (result.success) {
            console.log(
              `[AssistBuild] Tool "${toolName}" completed successfully`,
            );
            onProgress?.(`✅ Tool "${toolName}" completed successfully\n`);
          } else {
            console.log(`[AssistBuild] Tool ${toolName} completed: ERROR`);
            console.error(
              `[AssistBuild] ❌ Tool ${toolName} error details:`,
              JSON.stringify(result.error, null, 2),
            );
            onProgress?.(
              `❌ Error: ${result.error?.message || "Unknown error"}\n`,
            );
          }

          toolResults.push({
            tool_call_id: toolCall.id,
            role: "tool",
            name: toolName,
            content: JSON.stringify(
              result.success ? result.data : result.error,
            ),
          });
        }

        // Add tool results to messages
        messages.push(...toolResults);
      } else {
        // No more tool calls, we're done
        continueLoop = false;
      }
    }

    // 📊 Log final accumulated token usage across all iterations
    if (totalUsage.total_tokens > 0) {
      console.log(
        `[AssistBuild] 📊 TOTAL accumulated tokens: ${totalUsage.total_tokens} (${totalUsage.prompt_tokens} prompt + ${totalUsage.completion_tokens} completion) across ${iterationCount} iteration(s)`,
      );
    }

    // 💰 CREDIT SYSTEM: Track OpenAI usage and deduct credits
    if (totalUsage.total_tokens > 0) {
      try {
        const billingResult = await creditUsageService.trackModelUsage({
          tenantId: context.tenantId,
          userId: context.userId,
          provider: "openai",
          service: this.config.model || "gpt-5",
          promptTokens: totalUsage.prompt_tokens,
          completionTokens: totalUsage.completion_tokens,
          environment: (context.environment || "production") as
            | "production"
            | "sandbox",
          metadata: {
            model: this.config.model,
            orchestratorType: "assistbuild",
            iterationCount,
          },
        });
        console.log(
          `[AssistBuild] 💳 Credits deducted: ${billingResult.creditsDeducted} (cost $${billingResult.costUsd.toFixed(4)} USD)`,
        );
        // Track input tokens
        if (totalUsage.prompt_tokens > 0) {
          const inputResult =
            await creditUsageService.trackUsageAndDeductCredits({
              tenantId: context.tenantId,
              userId: context.userId,
              provider: "openai",
              service: this.config.model || "gpt-5", // Use actual model from config
              unitsConsumed: totalUsage.prompt_tokens,
              unitType: "input_tokens_1k",
              environment: (context.environment || "production") as
                | "production"
                | "sandbox",
              metadata: {
                model: this.config.model,
                promptTokens: totalUsage.prompt_tokens,
                orchestratorType: "assistbuild",
                iterationCount,
              },
            });
        }

        // Track output tokens
        if (totalUsage.completion_tokens > 0) {
          const outputResult =
            await creditUsageService.trackUsageAndDeductCredits({
              tenantId: context.tenantId,
              userId: context.userId,
              provider: "openai",
              service: this.config.model || "gpt-5", // Use actual model from config
              unitsConsumed: totalUsage.completion_tokens,
              unitType: "output_tokens_1k",
              environment: (context.environment || "production") as
                | "production"
                | "sandbox",
              metadata: {
                model: this.config.model,
                completionTokens: totalUsage.completion_tokens,
                orchestratorType: "assistbuild",
                iterationCount,
              },
            });
        }
      } catch (error) {
        // ⚠️ NOTE: This should rarely happen since we check credits before the operation
        // However, if it does happen (race condition, concurrent requests), we log it
        // but don't fail the request since the user already received their response
        console.error('[AssistBuild] ⚠️ Failed to track credit usage (post-operation):', error);
        if (error instanceof Error && error.message.includes('Insufficient credits')) {
          console.error('[AssistBuild] ❌ CRITICAL: Credit tracking failed - tenant may have gone negative!');
        }
      }
    }

    // // 💰 CREDIT SYSTEM: Track OpenAI usage and deduct credits
    // if (totalUsage.total_tokens > 0) {
    //   try {
    //     // Track input tokens
    //     if (totalUsage.prompt_tokens > 0) {
    //       const inputResult = await creditUsageService.trackUsageAndDeductCredits({
    //         tenantId: context.tenantId,
    //         userId: context.userId,
    //         provider: 'openai',
    //         service: this.config.model || 'gpt-5',  // Use actual model from config
    //         unitsConsumed: totalUsage.prompt_tokens,
    //         unitType: 'input_tokens_1k',
    //         environment: (context.environment || 'production') as 'production' | 'sandbox',
    //         metadata: {
    //           model: this.config.model,
    //           promptTokens: totalUsage.prompt_tokens,
    //           orchestratorType: 'assistbuild',
    //           iterationCount,
    //         }
    //       });
    //     }

    //     // Track output tokens
    //     if (totalUsage.completion_tokens > 0) {
    //       const outputResult = await creditUsageService.trackUsageAndDeductCredits({
    //         tenantId: context.tenantId,
    //         userId: context.userId,
    //         provider: 'openai',
    //         service: this.config.model || 'gpt-5',  // Use actual model from config
    //         unitsConsumed: totalUsage.completion_tokens,
    //         unitType: 'output_tokens_1k',
    //         environment: (context.environment || 'production') as 'production' | 'sandbox',
    //         metadata: {
    //           model: this.config.model,enantConnectorConfigs
    //           completionTokens: totalUsage.completion_tokens,
    //           orchestratorType: 'assistbuild',
    //           iterationCount,
    //         }
    //       });
    //     }
    //   } catch (error) {
    //     // Log error but don't fail the request
    //     console.error('[AssistBuild] ⚠️ Failed to track credit usage:', error);
    //     if (error instanceof Error && error.message.includes('Insufficient credits')) {
    //       console.error('[AssistBuild] ❌ CRITICAL: Tenant has insufficient credits!');
    //       // In future, could throw error here to prevent execution
    //     }
    //   }
    // }

    return fullResponse;
  }

  private buildSystemPrompt(context: TenantContext): string {
    return `# AssistBuild - Enterprise Configuration Assistant

You are **AssistBuild**, an AI assistant that helps configure AssistOS platforms efficiently and conversationally.

**LANGUAGE RULE:** ALWAYS respond in the SAME LANGUAGE the user writes in (English/Portuguese). Mirror their formality level.

**📝 REQUIRED FORMATTING:** ALL your answers MUST use formatted Markdown:
- Use **headings** (##, ###) to organize sections
- Use **bold** (*\*text*\*) to highlight important concepts
- Use **lists** (- item or 1. item) to enumerate options/steps
- Use \`code\` for technical names (moduleId, tenantId, tool names)
- Use \`\`\`language for code blocks when showing JSON/YAML examples or configurations
- Use **checkmarks** (✅, ❌, ⚠️) for statuses and warnings
- Organize information visually for easier reading

## CURRENT CONTEXT
- **Tenant:** ${context.tenantId}
- **Environment:** ${context.environment === "sandbox" ? "🧪 Sandbox" : "🚀 Production"}
- **User:** ${context.userId}

## YOUR APPROACH

You work **decisively and efficiently**:

1. **Understand** - Clarify the user's intent if unclear
2. **Execute** - Take action directly when intent is clear
3. **Confirm** - Report what was done with concrete results

**❌ DON'T:**
- Ask for confirmation multiple times for the same action
- Call discovery tools unnecessarily (only when you truly don't know)
- Provide too many options when the user's intent is clear
- Overthink simple requests

**✅ DO:**
- Act directly when the user's request is clear
- Ask ONE confirmation for destructive/major changes
- Keep responses concise and actionable
- Focus on what matters

## TERMINOLOGY MAPPING (CRITICAL)

When users say these terms, they mean:

**Company/Organization Setup:**
- "company", "empresa", "organization" → Use \`configure_company_info\` tool
- "company profile", "company details", "business info" → Use \`configure_company_info\` tool
- Examples: "setup company info", "configure my company", "update organization details"

**Custom Tables (Different!):**
- "create table", "new table", "custom table" → Use \`create_custom_table\` tool
- "table for X", "database table" → Use \`create_custom_table\` tool
- Only when explicitly asking for NEW tables, not company configuration

**Module Installation:**
- "install module", "activate CRM", "enable purchases" → Use \`activate_module\` tool
- ALWAYS preview tables first with \`preview: true\`
- Install ONE module at a time, never bulk

## COMMON WORKFLOWS

### 1. Company Information Setup (with Web Enrichment)
**User says:** "setup company" / "configure my company" / "empresa info"

**You do:**
- If user provides company name/website: Call \`enrich_company_from_web\` FIRST to auto-fetch data from web
- Review enriched data with user (shows info from website, Google Business, LinkedIn, reviews)
- If not initialized: Call \`bootstrap_tenant\` with basic info
- Call \`configure_company_info\` with the enriched/provided data
- Confirm what was saved

**Example with web enrichment:**
User: "Setup my company TechCorp Portugal"
You: "🌐 Let me search for TechCorp Portugal online..."
[CALL enrich_company_from_web with companyName="TechCorp Portugal", country="Portugal"]
"📊 Found the following information:
- **Name:** TechCorp Portugal Lda
- **Address:** Rua das Flores 123, Lisboa
- **Website:** techcorp.pt
- **Sector:** Technology
- **Google Rating:** 4.5 ⭐ (87 reviews)

Should I save this information?"
[User confirms]
[CALL configure_company_info with enriched data]
"✅ Company configured with web-enriched data!"

**Quick Setup (without web search):**
- If user provides ALL details directly, skip web search
- Call \`configure_company_info\` directly

### 2. Module Installation
**User says:** "install CRM" / "ativar módulo de vendas"

**You do:**
1. Preview: \`activate_module({moduleId: "crm", preview: true})\`
2. Show tables that will be created (briefly)
3. Ask ONCE: "Install with default tables?"
4. If yes: \`activate_module({moduleId: "crm", useDefaultTables: true})\`
5. Confirm installation

### 3. Custom Table Creation (Rare)
**User says:** "create a table for X" / "nova tabela para Y"

**You do:**
- Design table structure based on requirements
- Create with \`create_custom_table\`
- Confirm creation

### 4. File Attachments (CSV, Excel, JSON)
**User attaches:** CSV, XLSX, XLS, or JSON file

**You do:**
1. **Acknowledge** the attached file(s) and their contents
2. **Analyze** the data structure using \`parse_attached_file\` tool if needed for deeper analysis
3. **Ask** what the user wants to do with the data:
   - Create a custom table based on the file structure?
   - Import data into an existing table?
   - Configure company info from the data?
   - Something else?
4. **Execute** the configuration based on user's choice

**Use cases for file attachments:**
- 📊 **Create custom tables**: User uploads CSV/Excel with data structure → Create table matching columns
- 🏢 **Configure company**: User uploads JSON with company details → Apply to company config
- 📥 **Import entities**: User uploads client list, products, etc. → Import into appropriate module
- 📋 **Preview data**: User wants to see what's in a file before deciding

**Example interaction:**
User: [attaches clients.csv] "Create a table for this"
You: "I see you've uploaded \`clients.csv\` with ${(context as any).attachments?.length || 'some'} columns. Let me analyze the structure..."
[CALL parse_attached_file with the file content]
"Based on the file:
- **Columns detected:** name, email, phone, company
- **Rows:** 150
- **Suggested table:** \`clients\` with appropriate data types

Should I create this table now?"

**IMPORTANT:** When files are attached:
- The file content is available in base64 format
- Use \`parse_attached_file\` tool to get structured data
- Always confirm the user's intent before creating tables or importing

## DISCOVERY TOOL USAGE

**When to call \`get_tenant_state\`:**
- ✅ First message in conversation
- ✅ When user asks "what's configured?" or "what modules are installed?"
- ❌ NOT every single reply
- ❌ NOT before every configuration action

**When to call \`get_modules_catalog\`:**
- ✅ When user asks about available modules
- ✅ When suggesting which modules to install
- ❌ NOT if you already know the module exists

## CONFIRMATION STRATEGY

**One confirmation per major action:**
- ✅ Module installation → Ask once, then execute
- ✅ Company info updates → Execute directly (non-destructive)
- ✅ Custom table creation → Ask once if structure is complex
- ❌ Don't ask multiple times for the same thing

## EXAMPLE INTERACTIONS

**Good (Direct):**
User: "setup my company, name is Tech Corp, we do B2B software"
You: "Setting up your company profile..."
[CALL configure_company_info]
"✅ Company configured: Tech Corp, B2B, Technology sector"

**Bad (Over-cautious):**
User: "setup my company"
You: "Let me check what's configured..."
[CALL get_tenant_state]
"I can help you configure your company. What information would you like to provide?"
[User provides info]
"Great! Should I save this information?" ❌ DON'T ASK AGAIN
[User says yes]
"Saving now..." ❌ SHOULD HAVE SAVED DIRECTLY

## STREAMING FEEDBACK

Keep it **brief and informative**:
- "Configuring company info..." (before tool call)
- "✅ Saved 5 fields" (after success)
- "⚠️ Field X failed, trying Y..." (on error)

**Don't:**
- Write essays between tool calls
- Repeat the same information
- Over-explain simple operations

## ENVIRONMENT AWARENESS

${context.environment === "sandbox" ? "🧪 **Sandbox:** Experiment freely, test configurations, make mistakes safely." : "🚀 **Production:** Real data. Be accurate but still decisive."}

---

Now help the user configure their platform efficiently and conversationally.`;
  }

  private buildParametersSchema(tool: ToolManifest): any {
    const properties: any = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      const propDef: any = {
        type: param.type,
        description: param.description,
      };

      // ✅ Handle enum values
      if ((param as any).enum) {
        propDef.enum = (param as any).enum;
      }

      // ✅ DEFENSIVE FIX: Arrays MUST have items (OpenAI Function Calling requirement)
      if (param.type === "array") {
        if ((param as any).items) {
          propDef.items = this.sanitizeNestedSchema((param as any).items);
        } else {
          propDef.items = { type: "string" };
          console.warn(
            `[AssistBuild] ⚠️  Tool "${tool.name}" param "${param.name}" missing items - using fallback {type:'string'}`,
          );
        }
      }

      // ✅ For objects, include 'properties' definition with sanitization
      if (param.type === 'object' && (param as any).properties) {
        propDef.properties = this.sanitizeNestedProperties((param as any).properties);
        propDef.required = (param as any).required || [];
      }

      // ✅ ADD THIS: Handle enum values
      if ((param as any).enum) {
        propDef.enum = (param as any).enum;
        console.log(
          `[AssistBuild] 📋 Tool "${tool.name}" param "${param.name}" has enum: [${(param as any).enum.join(", ")}]`,
        );
      }

      properties[param.name] = propDef;

      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: "object",
      properties,
      required,
    };
  }

  private sanitizeNestedSchema(schema: any): any {
    if (!schema || typeof schema !== 'object') {
      return schema;
    }

    const sanitized: any = { ...schema };

    if (sanitized.type === 'object') {
      if (sanitized.properties) {
        sanitized.properties = this.sanitizeNestedProperties(sanitized.properties);
      }
      if (typeof sanitized.required === 'boolean') {
        delete sanitized.required;
      }
      if (!sanitized.required) {
        sanitized.required = [];
      }
    }

    if (sanitized.type === 'array' && sanitized.items) {
      sanitized.items = this.sanitizeNestedSchema(sanitized.items);
    }

    if (typeof sanitized.required === 'boolean') {
      delete sanitized.required;
    }

    return sanitized;
  }

  private sanitizeNestedProperties(properties: any): any {
    if (!properties || typeof properties !== 'object') {
      return properties;
    }

    const sanitized: any = {};

    for (const [key, value] of Object.entries(properties)) {
      if (value && typeof value === 'object') {
        const propCopy: any = { ...(value as any) };

        if (typeof propCopy.required === 'boolean') {
          delete propCopy.required;
        }

        if (propCopy.type === 'object' && propCopy.properties) {
          propCopy.properties = this.sanitizeNestedProperties(propCopy.properties);
          if (!propCopy.required || typeof propCopy.required === 'boolean') {
            propCopy.required = [];
          }
        }

        if (propCopy.type === 'array' && propCopy.items) {
          propCopy.items = this.sanitizeNestedSchema(propCopy.items);
        }

        sanitized[key] = propCopy;
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  private getToolProgressMessage(toolName: string): string {
    const progressMessages: Record<string, string> = {
      // Discovery tools
      get_tenant_state: "🔍 Analyzing current tenant state",
      get_modules_catalog: "📚 Querying modules catalog",
      get_module_info: "🔎 Investigating module details",
      get_modules_active: "✅ Checking active modules",
      search_catalog: "🔍 Searching in catalog",
      get_connectors: "🔌 Checking configured connectors",
      get_integrations_catalog: "📡 Querying integrations catalog",
      get_agents: "🤖 Listing AI agents",
      get_workflows: "⚡ Checking workflows and automations",
      get_audit_trail: "📋 Querying change history",

      // Configuration tools
      bootstrap_tenant: "🚀 Initializing tenant",
      enrich_company_from_web: "🌐 Searching web for company information",
      configure_company_info: "🏢 Configuring company information",
      setup_organization_structure: "🏛️ Creating organizational structure",
      activate_module: "⚙️ Activating module",
      deactivate_module: "❌ Deactivating module",
      configure_module: "🔧 Configuring module",
      preview_module_tables: "👁️ Previewing module tables",
      create_custom_table: "🗄️ Creating custom table",
      modify_table_structure: "🔧 Modifying table structure",
      add_connector: "🔌 Adding connector",
      remove_connector: "🗑️ Removing connector",
      create_agent: "🤖 Creating AI agent",
      update_agent: "✏️ Updating AI agent",
      create_workflow: "⚡ Creating workflow",
      update_workflow: "✏️ Updating workflow",
      rollback_configuration: "⏪ Rolling back configuration",

      // Validation tools
      validate_configuration: "✅ Validating configuration",
      test_module: "🧪 Testing module",
      test_workflow: "🧪 Testing workflow",
    };

    return progressMessages[toolName] || `🔧 Executing ${toolName}`;
  }
}
