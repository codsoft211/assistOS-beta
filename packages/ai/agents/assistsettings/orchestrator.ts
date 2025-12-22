import OpenAI from "openai";
import { toolRegistry, type ToolManifest } from "../../tools/kernel";
import { buildSystemPrompt } from "./system-prompt";
import type { OrchestratorConfig, UserContext } from "./types";
import { creditUsageService } from "../../../services/credit-usage";

interface TokenUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

// 🔒 CRITICAL SECURITY: Scope-based tool filtering for AssistSettings
// AssistSettings MUST ONLY access user-scoped tools - NO tenant/platform operations
function filterAssistSettingsTools(tools: ToolManifest[]): ToolManifest[] {
  const userScopedTools = tools.filter((tool) => {
    // 🔒 SECURITY: ONLY allow user-scoped tools
    if (tool.scope === "user") {
      return true;
    }

    // ⚠️ REJECT tenant/platform tools
    if (tool.scope === "tenant" || tool.scope === "platform") {
      console.log(
        `[AssistSettings] 🔒 SECURITY: Blocked ${tool.scope} tool: ${tool.name}`,
      );
      return false;
    }

    // ❌ DEFAULT DENY: Reject unknown scope (fail-safe)
    // Tools without explicit scope='user' are NOT allowed in AssistSettings
    console.warn(
      `[AssistSettings] ⚠️ SECURITY: Blocked tool with unknown scope: ${tool.name}`,
    );
    return false;
  });

  console.log(
    `[AssistSettings] 🔒 Security filter: ${tools.length} total tools → ${userScopedTools.length} user-scoped tools`,
  );
  return userScopedTools;
}

export class AssistSettingsOrchestrator {
  private openai: OpenAI;
  private config: OrchestratorConfig;

  constructor(config: Partial<OrchestratorConfig> = {}) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error("[AssistSettings] OPENAI_API_KEY not configured");
    }

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // 🔒 CRITICAL SECURITY: AssistSettings ONLY gets user-scoped tools
    const allManifests = toolRegistry.getAllManifests();
    const userScopedToolsOnly = filterAssistSettingsTools(allManifests);

    console.log(
      `[AssistSettings] Initialized with ${userScopedToolsOnly.length} user-scoped tools`,
    );

    this.config = {
      model: config.model || "gpt-4o", // Use GPT-4o (valid model)
      temperature: config.temperature || 0.7, // More conversational than AssistBuild
      maxTokens: config.maxTokens || 4096,
      tools: config.tools || userScopedToolsOnly,
    };
  }

  async processMessage(
    userMessage: string,
    context: UserContext,
    onProgress?: (message: string) => void,
    conversationHistory?: Array<{
      role: "user" | "assistant";
      content: string;
    }>,
    onStreamChunk?: (chunk: string) => void,
    availableTools?: ToolManifest[],
  ): Promise<string> {
    console.log(
      `[AssistSettings] Processing message for user ${context.userId}`,
    );
    console.log(
      `[AssistSettings] Selected menu: ${context.selectedMenu || "none"}`,
    );
    console.log(
      `[AssistSettings] User message: "${userMessage.substring(0, 100)}..."`,
    );

    // 💳 PRE-FLIGHT CREDIT CHECK: Block operation if insufficient credits
    try {
      await creditUsageService.checkSufficientCredits(context.tenantId, 1);
    } catch (error) {
      console.error('[AssistSettings] ❌ BLOCKED: Insufficient credits', error);
      throw error; // Block the operation
    }

    onProgress?.("⚙️ Preparando AssistSettings\n");

    const systemPrompt = buildSystemPrompt(context);

    onProgress?.("🤖 Processando pedido\n");

    // Build messages array with conversation history
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ];

    // Add previous conversation context (last 10 messages to stay within token limits)
    if (conversationHistory && conversationHistory.length > 0) {
      const recentHistory = conversationHistory.slice(-10);
      messages.push(
        ...recentHistory.map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content,
        })),
      );
    }

    // Add current user message
    messages.push({ role: "user", content: userMessage });

    // 🔒 CRITICAL SECURITY: Always filter to user-scoped tools
    const baseTools = availableTools || this.config.tools;
    const toolManifests = filterAssistSettingsTools(baseTools);

    if (baseTools.length !== toolManifests.length) {
      console.log(
        `[AssistSettings] 🔒 Security filter applied: ${baseTools.length} tools → ${toolManifests.length} user-scoped tools`,
      );
    }
    console.log(
      `[AssistSettings] Using ${toolManifests.length} tools for this request`,
    );

    // Convert tools to OpenAI format
    const tools: OpenAI.Chat.ChatCompletionTool[] = toolManifests.map(
      (manifest) => ({
        type: "function" as const,
        function: {
          name: manifest.name,
          description: manifest.description,
          parameters: this.buildParametersSchema(manifest),
        },
      }),
    );

    let fullResponse = "";
    let continueLoop = true;
    let iterationCount = 0;
    const MAX_ITERATIONS = 10; // Prevent infinite loops
    const totalUsage: TokenUsage = {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0,
    };

    while (continueLoop && iterationCount < MAX_ITERATIONS) {
      iterationCount++;

      // Call OpenAI with streaming
      const stream = await this.openai.chat.completions.create({
        model: this.config.model,
        messages,
        tools: tools.length > 0 ? tools : undefined,
        tool_choice: tools.length > 0 ? "auto" : undefined,
        temperature: this.config.temperature,
        max_tokens: this.config.maxTokens,
        stream: true,
        stream_options: { include_usage: true },
      });

      let currentContent = "";
      let toolCalls: OpenAI.Chat.ChatCompletionMessageToolCall[] = [];
      let currentToolCall: Partial<OpenAI.Chat.ChatCompletionMessageToolCall> | null =
        null;

      // Process stream
      for await (const chunk of stream) {
        const delta = chunk.choices[0]?.delta;

        if (delta?.content) {
          const textChunk = delta.content;
          currentContent += textChunk;
          fullResponse += textChunk;
          onStreamChunk?.(textChunk);
        }

        // Handle tool calls
        if (delta?.tool_calls) {
          for (const toolCall of delta.tool_calls) {
            if (toolCall.index !== undefined) {
              if (!toolCalls[toolCall.index]) {
                toolCalls[toolCall.index] = {
                  id: toolCall.id || "",
                  type: "function" as const,
                  function: {
                    name: (toolCall as any).function?.name || "",
                    arguments: "",
                  },
                } as any;
              }

              if ((toolCall as any).function?.arguments) {
                (toolCalls[toolCall.index] as any).function.arguments += (
                  toolCall as any
                ).function.arguments;
              }
            }
          }
        }

        const usageChunk = (chunk as any)?.usage;
        if (usageChunk) {
          totalUsage.prompt_tokens += usageChunk.prompt_tokens || 0;
          totalUsage.completion_tokens += usageChunk.completion_tokens || 0;
          totalUsage.total_tokens += usageChunk.total_tokens || 0;
        }
      }

      // Check if we need to execute tools
      if (toolCalls.length > 0) {
        console.log(
          `[AssistSettings] 🔧 Calling ${toolCalls.length} tools:`,
          toolCalls.map((t) => (t as any).function?.name || "unknown"),
        );
        onProgress?.(`\n\n🔧 Executando ${toolCalls.length} tools\n\n`);

        // Add assistant message with tool calls to history
        messages.push({
          role: "assistant",
          content: currentContent || null,
          tool_calls: toolCalls as any,
        });

        // Execute each tool
        for (const toolCall of toolCalls) {
          const tc = toolCall as any; // Type assertion for OpenAI compatibility
          if (!tc.function) continue; // Skip non-function tool calls

          console.log(`[AssistSettings] Executing tool: ${tc.function.name}`);

          const toolProgressMessage = this.getToolProgressMessage(
            tc.function.name,
          );
          onProgress?.(toolProgressMessage);

          try {
            const args = JSON.parse(tc.function.arguments);

            // 🔒 RBAC CHECK: Block team management if not admin
            if (
              tc.function.name.includes("team") &&
              tc.function.name !== "get_team_members" &&
              !context.isPlatformAdmin
            ) {
              const errorMsg =
                "⚠️ Team Management está restrito a Admins. Contacte um administrador.";
              messages.push({
                role: "tool",
                tool_call_id: tc.id,
                content: JSON.stringify({ error: errorMsg }),
              });
              console.log(
                `[AssistSettings] 🔒 RBAC: Blocked ${tc.function.name} for non-admin user`,
              );
              continue;
            }

            const result = await toolRegistry.execute(
              tc.function.name,
              args,
              {
                tenantId: context.tenantId,
                userId: context.userId,
                environment: context.environment,
              },
              (progress, msg) => {
                console.log(
                  `[AssistSettings] Tool progress: ${tc.function.name}: ${msg}`,
                );
                onProgress?.(`  ▸ ${msg}`);
              },
            );

            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify(result),
            });

            console.log(
              `[AssistSettings] ✅ Tool ${tc.function.name} completed`,
            );
          } catch (error: any) {
            console.error(
              `[AssistSettings] ❌ Tool ${tc.function.name} failed:`,
              error,
            );
            messages.push({
              role: "tool",
              tool_call_id: tc.id,
              content: JSON.stringify({
                error: error.message || "Tool execution failed",
              }),
            });
          }
        }

        // Continue loop to get final response after tool execution
        continue;
      } else {
        // No tool calls, we're done
        continueLoop = false;
      }
    }

    if (iterationCount >= MAX_ITERATIONS) {
      console.warn(
        `[AssistSettings] ⚠️ Max iterations (${MAX_ITERATIONS}) reached`,
      );
    }

    console.log(
      `[AssistSettings] ✅ Response completed in ${iterationCount} iterations`,
    );

    if (totalUsage.total_tokens > 0) {
      const environment = (context.environment || "production") as
        | "production"
        | "sandbox";
      try {
        await creditUsageService.trackModelUsage({
          tenantId: context.tenantId,
          userId: context.userId,
          provider: "openai",
          service: this.config.model,
          promptTokens: totalUsage.prompt_tokens,
          completionTokens: totalUsage.completion_tokens,
          environment,
          metadata: {
            orchestratorType: "assistsettings",
            model: this.config.model,
          },
        });
      } catch (error) {
        // ⚠️ NOTE: This should rarely happen since we check credits before the operation
        // However, if it does happen (race condition, concurrent requests), we log it
        // but don't fail the request since the user already received their response
        console.error("[AssistSettings] ⚠️ Failed to track credit usage (post-operation):", error);
        if (error instanceof Error && error.message.includes('Insufficient credits')) {
          console.error('[AssistSettings] ❌ CRITICAL: Credit tracking failed - tenant may have gone negative!');
        }
      }
    }

    return fullResponse;
  }

  private buildParametersSchema(tool: ToolManifest): any {
    const properties: any = {};
    const required: string[] = [];

    for (const param of tool.parameters) {
      const propDef: any = {
        type: param.type,
        description: param.description
      };

      // ✅ Handle arrays with items
      if (param.type === 'array' && (param as any).items) {
        propDef.items = (param as any).items;
      }

      // ✅ Handle objects with properties
      if (param.type === 'object' && (param as any).properties) {
        propDef.properties = (param as any).properties;
      }

      // ✅ Handle enum values (critical for constrained parameters)
      if ((param as any).enum) {
        propDef.enum = (param as any).enum;
        console.log(`[AssistSettings] 📋 Tool "${tool.name}" param "${param.name}" has enum: [${(param as any).enum.join(', ')}]`);
      }

      properties[param.name] = propDef;
      
      if (param.required) {
        required.push(param.name);
      }
    }

    return {
      type: 'object',
      properties,
      required
    };
  }

  private getToolProgressMessage(toolName: string): string {
    const progressMessages: Record<string, string> = {
      get_user_profile: "📋 Getting user profile\n",
      update_user_profile: "✏️ Updating profile\n",
      get_user_preferences: "⚙️ Loading preferences\n",
      update_user_preferences: "💾 Saving preferences\n",
      get_user_organizations: "🏢 Listing organizations\n",
      connect_integration: "🔗 Connecting integration\n",
      disconnect_integration: "🔌 Disconnecting integration\n",
      get_team_members: "👥 Listing team members\n",
      add_team_member: "➕ Adding member\n",
      remove_team_member: "➖ Removing member\n",
    };

    return progressMessages[toolName] || `🔧 Executing ${toolName}\n`;
  }
}
