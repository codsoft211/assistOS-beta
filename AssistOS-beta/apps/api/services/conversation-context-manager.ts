// Migrated from AssistOS legacy - Phase 2
import { memoryService } from "./memory.service";

export interface ConversationContext {
  recentMessages: Array<{ role: string; content: string }>;
  crossAgentContext: string;
  preferences: Record<string, any>;
  fullContextMessage: string; // Synthesized context to inject
}

export interface MessagePair {
  userMessage: string;
  assistantMessage: string;
  metadata?: any;
}

export class ConversationContextManager {
  private readonly MAX_RECENT_MESSAGES = 6;
  private readonly MAX_CROSS_AGENT_SIMILAR = 3;
  private readonly SIMILARITY_THRESHOLD = 0.7;
  private readonly MAX_CONTEXT_TOKENS = 1500; // ~1.5k tokens for memory context

  /**
   * Loads full conversation context for an agent interaction
   * @param tenantId - Tenant ID
   * @param userId - User ID
   * @param currentAgentType - Current agent (e.g., 'onboarding', 'configuration')
   * @param userQuery - Current user message (for semantic search)
   * @returns Formatted context to inject into LLM prompt
   */
  async loadContext(
    tenantId: string,
    userId: string,
    currentAgentType: string,
    userQuery: string
  ): Promise<ConversationContext> {
    try {
      // 1. Load recent messages from THIS agent (last 6)
      const recentMessages = await memoryService.getRecentMessages(
        tenantId,
        userId,
        currentAgentType,
        this.MAX_RECENT_MESSAGES
      );

      // 2. Load learned preferences (cross-agent)
      const preferences = await memoryService.getLearnedPreferences(
        tenantId,
        userId
      );

      // 3. Semantic search across ALL agents (cross-agent learning!)
      const similarMessages = await memoryService.findSimilarMessages(
        tenantId,
        userId,
        userQuery,
        this.MAX_CROSS_AGENT_SIMILAR
        // NO agentType filter = search ALL agents
      );

      // Filter only cross-agent messages (exclude current agent) + high similarity
      const crossAgentMessages = similarMessages.filter(
        (msg) =>
          msg.agentType !== currentAgentType &&
          msg.similarity >= this.SIMILARITY_THRESHOLD
      );

      // 4. Format cross-agent context as concise bullets
      const crossAgentContext = this.formatCrossAgentContext(crossAgentMessages);

      // 5. Format preferences
      const preferencesContext = this.formatPreferences(preferences);

      // 6. Synthesize full context message (budget: <1.5k tokens)
      const fullContextMessage = this.synthesizeContextMessage(
        crossAgentContext,
        preferencesContext
      );

      console.log(
        `[ContextManager] Loaded context for ${currentAgentType}:`,
        {
          recentMessages: recentMessages.length,
          crossAgentHits: crossAgentMessages.length,
          preferences: Object.keys(preferences).length,
        }
      );

      return {
        recentMessages: recentMessages.map((msg) => ({
          role: msg.role,
          content: msg.content,
        })),
        crossAgentContext,
        preferences,
        fullContextMessage,
      };
    } catch (error) {
      console.error("[ContextManager] Error loading context:", error);

      // Graceful degradation: return empty context
      return {
        recentMessages: [],
        crossAgentContext: "",
        preferences: {},
        fullContextMessage: "",
      };
    }
  }

  /**
   * Saves a user-assistant message pair with embeddings
   */
  async saveMessagePair(
    tenantId: string,
    userId: string,
    agentType: string,
    pair: MessagePair
  ): Promise<void> {
    try {
      // Save user message
      await memoryService.saveMessage(
        tenantId,
        userId,
        agentType,
        "user",
        pair.userMessage,
        pair.metadata
      );

      // Save assistant message
      await memoryService.saveMessage(
        tenantId,
        userId,
        agentType,
        "assistant",
        pair.assistantMessage,
        pair.metadata
      );

      console.log(
        `[ContextManager] Saved message pair for ${agentType} (user: ${pair.userMessage.length} chars, assistant: ${pair.assistantMessage.length} chars)`
      );
    } catch (error) {
      console.error("[ContextManager] Error saving message pair:", error);
      // Don't throw - memory save failures shouldn't break the conversation
    }
  }

  /**
   * Format cross-agent messages as concise bullet points
   */
  private formatCrossAgentContext(
    messages: Array<{ agentType: string; role: string; content: string; similarity: number }>
  ): string {
    if (messages.length === 0) {
      return "";
    }

    const bullets = messages.map((msg) => {
      const agentLabel = this.getAgentLabel(msg.agentType);
      const preview = this.truncateText(msg.content, 150);
      return `- [${agentLabel}] ${preview} (similarity: ${(msg.similarity * 100).toFixed(0)}%)`;
    });

    return bullets.join("\n");
  }

  /**
   * Format learned preferences
   */
  private formatPreferences(preferences: Record<string, any>): string {
    const entries = Object.entries(preferences);

    if (entries.length === 0) {
      return "";
    }

    const formatted = entries
      .map(([category, prefs]) => {
        const items = Object.entries(prefs)
          .map(([key, data]: [string, any]) => {
            return `  - ${key}: ${data.value}`;
          })
          .join("\n");

        return `${category}:\n${items}`;
      })
      .join("\n");

    return formatted;
  }

  /**
   * Synthesize full context message for injection into LLM
   */
  private synthesizeContextMessage(
    crossAgentContext: string,
    preferencesContext: string
  ): string {
    const sections: string[] = [];

    if (crossAgentContext) {
      sections.push(
        `**Relevant context from previous conversations with other assistants:**\n${crossAgentContext}`
      );
    }

    if (preferencesContext) {
      sections.push(
        `**Learned user preferences:**\n${preferencesContext}`
      );
    }

    if (sections.length === 0) {
      return "";
    }

    // Combine sections with separator
    const combined = sections.join("\n\n");

    // Truncate if exceeds budget (rough estimate: 1 token ≈ 4 chars)
    const maxChars = this.MAX_CONTEXT_TOKENS * 4;
    if (combined.length > maxChars) {
      return combined.substring(0, maxChars) + "... (truncated)";
    }

    return combined;
  }

  /**
   * Get friendly label for agent type
   */
  private getAgentLabel(agentType: string): string {
    const labels: Record<string, string> = {
      onboarding: "Assist Start",
      configuration: "Assist Build",
      settings: "Assist Settings",
      orchestration: "Assist Me",
      module: "Module Agent",
    };

    return labels[agentType] || agentType;
  }

  /**
   * Truncate text to max length
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }

    return text.substring(0, maxLength) + "...";
  }
}

export const conversationContextManager = new ConversationContextManager();
