// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/_legacy/orchestrator.ts (649 lines, 22KB)

// TODO: Migrate tenant storage service when needed
// import { getTenantStorage } from "../../../apps/api/services/tenant-storage";

// TODO: Add these types to schema if they don't exist
// import type { SpecializedAgent, Conversation } from "../../../shared/schema";

// TODO: Migrate OpenAI service when needed
// import { chatWithAgent, streamChatWithAgent } from "../../../apps/api/services/openai";

// TODO: Migrate agent modules when needed
// import * as collaboration from "../agents/collaboration";
// import * as onboardingAgent from "../agents/onboarding";
// import * as discoveryAgent from "../agents/discovery";
// import * as gapDetectionAgent from "../agents/gap-detection";
// import * as configurationAgent from "../agents/configuration";
// import * as projectPlanningAgent from "../agents/project-planning";
// import * as riskDetectionAgent from "../agents/risk-detection";
// import * as billingAgent from "../agents/billing";

/**
 * Orchestrator - Coordinates all specialized agents
 * 
 * Responsibilities:
 * 1. Route conversations to appropriate agents
 * 2. Manage handoffs between agents
 * 3. Coordinate multi-agent tasks
 * 4. Resolve conflicts
 * 5. Monitor system performance
 */

export interface AgentContext {
  conversationId: string;
  tenantId: string | null;
  userId?: string;
  currentAgentId?: string;
  previousMessages?: Array<{ role: string; content: string }>;
  metadata?: Record<string, any>;
}

export interface RoutingDecision {
  agentId: string;
  agentType: string;
  reason: string;
  confidence: number; // 0-100
  shouldHandoff: boolean;
  handoffMessage?: string;
}

/**
 * Orchestrator class - manages agent coordination
 */
export class Orchestrator {
  /**
   * Route a user message to the appropriate specialized agent
   */
  static async routeToAgent(
    context: AgentContext,
    userMessage: string
  ): Promise<RoutingDecision> {
    const storage = await getTenantStorage(context.tenantId || undefined);
    
    // Get all active specialized agents for this tenant
    const agents = await storage.getSpecializedAgents();
    const activeAgents = agents.filter(a => a.isActive);

    // If no agents, return error
    if (activeAgents.length === 0) {
      throw new Error("No specialized agents available. Please seed agents first.");
    }

    // Routing logic based on context and message content
    const decision = await this.determineAgent(
      activeAgents,
      context,
      userMessage
    );

    return decision;
  }

  /**
   * Determine which agent should handle this message using intelligent metadata-based routing
   */
  private static async determineAgent(
    agents: SpecializedAgent[],
    context: AgentContext,
    userMessage: string
  ): Promise<RoutingDecision> {
    // Score each agent based on multiple factors
    const agentScores = agents.map(agent => ({
      agent,
      score: this.scoreAgent(agent, context, userMessage),
    }));

    // Sort by score (highest first)
    agentScores.sort((a, b) => b.score.total - a.score.total);

    // Debug logging: Show top 3 agents and their scores
    console.log('[Orchestrator] Agent Scoring Results:');
    agentScores.slice(0, 3).forEach((item, index) => {
      console.log(`  ${index + 1}. ${item.agent.name} (${item.agent.type})`);
      console.log(`     Total Score: ${item.score.total.toFixed(1)} points`);
      console.log(`     Breakdown: Capability=${item.score.breakdown.capabilities}, Priority=${item.score.breakdown.priority}, Specialization=${item.score.breakdown.specialization}, Layer=${item.score.breakdown.layer}`);
      console.log(`     Reason: ${item.score.reason}`);
    });

    const bestMatch = agentScores[0];
    
    // Determine if handoff is needed
    const shouldHandoff = !!(context.currentAgentId && context.currentAgentId !== bestMatch.agent.id);
    
    return {
      agentId: bestMatch.agent.id,
      agentType: bestMatch.agent.type,
      reason: bestMatch.score.reason,
      confidence: Math.min(100, bestMatch.score.total),
      shouldHandoff,
      handoffMessage: shouldHandoff 
        ? `Vou conectar-te com ${bestMatch.agent.name} que está melhor preparado para ajudar-te.`
        : undefined,
    };
  }

  /**
   * Score an agent based on capabilities, priority, and context
   */
  private static scoreAgent(
    agent: SpecializedAgent,
    context: AgentContext,
    userMessage: string
  ): { total: number; reason: string; breakdown: Record<string, number> } {
    const message = userMessage.toLowerCase();
    const breakdown: Record<string, number> = {};
    let reason = "";

    // 1. CAPABILITY MATCHING (0-40 points)
    const capabilities = (agent.capabilities as string[]) || [];
    let capabilityScore = 0;
    const matchedCapabilities: string[] = [];

    capabilities.forEach(cap => {
      const capLower = cap.toLowerCase();
      if (message.includes(capLower) || this.isSemanticMatch(message, capLower)) {
        capabilityScore += 10;
        matchedCapabilities.push(cap);
      }
    });
    breakdown.capabilities = Math.min(40, capabilityScore);

    // 2. PRIORITY WEIGHTING (0-20 points)
    const priorityScore = (agent.priority / 100) * 20; // Normalize 0-100 to 0-20
    breakdown.priority = priorityScore;

    // 3. SPECIALIZATION MATCHING (0-30 points)
    const specialization = agent.specialization.toLowerCase();
    let specializationScore = 0;
    
    if (message.includes(specialization)) {
      specializationScore = 30;
      reason = `Specialization match: ${agent.specialization}`;
    } else if (this.isSemanticMatch(message, specialization)) {
      specializationScore = 20;
      reason = `Related to: ${agent.specialization}`;
    }
    breakdown.specialization = specializationScore;

    // 4. LAYER APPROPRIATENESS (0-10 points)
    const layerScore = this.scoreLayer(agent.layer, context, message);
    breakdown.layer = layerScore;

    // 5. SPECIAL BOOSTS (0-20 points)
    let boostScore = 0;
    
    // Gap Detection Agent boost for gap-indicating keywords
    if (agent.type === 'gap_detection') {
      const gapKeywords = ["doesn't", "don't", "can't", "cannot", "missing", "problem", "issue", "not working", "doesn't have", "don't have", "lacking", "need to add", "can you add"];
      const hasGapKeyword = gapKeywords.some(kw => message.includes(kw));
      if (hasGapKeyword) {
        boostScore += 15;
        reason = `Gap indicator detected: ${agent.specialization}`;
      }
    }
    
    // Project Context boost - if conversation is linked to a project
    if (context.metadata?.projectId) {
      if (agent.type === 'project_planning' || agent.type === 'risk_detection' || agent.type === 'project_billing') {
        boostScore += 20;
        reason = `Project context detected: ${agent.specialization}`;
      }
    }
    
    breakdown.boost = boostScore;

    // Calculate total
    const total = Object.values(breakdown).reduce((sum, val) => sum + val, 0);

    // Build reason if not already set
    if (!reason) {
      if (matchedCapabilities.length > 0) {
        reason = `Capabilities match: ${matchedCapabilities.join(", ")}`;
      } else if (breakdown.priority > 15) {
        reason = `High priority agent (${agent.name})`;
      } else {
        reason = `Best available match: ${agent.name}`;
      }
    }

    return { total, reason, breakdown };
  }

  /**
   * Check if message semantically matches a capability/specialization
   */
  private static isSemanticMatch(message: string, target: string): boolean {
    // Target keyword groups - keywords that appear in agent specializations/capabilities
    const targetKeywordGroups: Record<string, string[]> = {
      // Onboarding related targets
      prospect: ["hi", "hello", "interested", "learn about", "start", "new to", "about your"],
      conversion: ["hi", "hello", "interested", "learn about", "solution"],
      engagement: ["hi", "hello", "interested", "tell me about", "about your"],
      
      // Discovery related targets  
      requirement: ["need", "want", "require", "modules", "features", "have", "capabilities"],
      requirements: ["need", "want", "require", "modules", "features", "have", "capabilities"],
      gathering: ["need", "want", "require", "what do you have", "modules", "features"],
      conversational: ["need", "want", "how", "what", "tell me", "show me"],
      
      // Configuration related targets
      configuration: ["configure", "how do i", "how to", "setup", "set up"],
      configure: ["configure", "how do i", "how to", "setup", "set up"],
      workflow: ["workflow", "process", "approval", "how do i"],
      
      // Gap detection related
      gap: ["doesn't", "can't", "missing", "problem", "issue", "not working"],
      identification: ["doesn't", "can't", "missing", "problem", "not working"],
      
      // Expectation related
      expectation: ["cost", "price", "budget", "how much", "timeline", "when", "annually", "monthly"],
      alignment: ["cost", "price", "budget", "timeline", "annually", "monthly"],
      stakeholder: ["cost", "budget", "timeline", "expectation"],
      
      // Integration related
      integration: ["integrate", "connect", "sync", "api", "import", "export"],
      integrate: ["integrate", "connect", "sync", "shopify", "quickbooks"],
      
      // Optimization related
      optimization: ["optimize", "improve", "better", "faster", "enhance"],
      improvement: ["optimize", "improve", "better", "enhance"],
      
      // Process related
      process: ["process", "workflow", "optimize", "improve", "how to"],
      
      // Project Management related targets
      project: ["projeto", "project", "wbs", "planeamento", "planning", "estrutura", "fases", "tarefas"],
      planning: ["planear", "criar projeto", "wbs", "estrutura", "breakdown", "fases"],
      wbs: ["wbs", "estrutura", "fases", "breakdown", "work breakdown"],
      risk: ["risco", "risk", "problema", "issue", "bloqueio", "blocker", "alerta"],
      risks: ["riscos", "risks", "problemas", "issues", "alertas"],
      detection: ["detectar", "identificar", "verificar riscos", "check risks"],
      billing: ["fatura", "invoice", "billing", "cobrar", "payment", "custo", "cost"],
      invoice: ["fatura", "invoice", "cobrar", "billing", "quanto custa"],
      milestone: ["milestone", "marco", "deliverable", "entrega"],
      task: ["tarefa", "task", "atividade", "to-do"],
    };

    // Business domain keywords - check if message contains business terms
    const businessDomainKeywords: Record<string, string[]> = {
      inventory: ["requirement", "requirements", "gathering", "discovery"],
      sales: ["requirement", "requirements", "gathering", "discovery"],
      manage: ["requirement", "requirements", "gathering", "configuration"],
      track: ["requirement", "requirements", "gathering", "configuration"],
    };

    // Check if target keywords match message
    for (const [targetKeyword, messageKeywords] of Object.entries(targetKeywordGroups)) {
      if (target.includes(targetKeyword)) {
        const hasMatch = messageKeywords.some(kw => message.includes(kw));
        if (hasMatch) return true;
      }
    }

    // Check if message business domain keywords match target context
    for (const [businessKeyword, targetContexts] of Object.entries(businessDomainKeywords)) {
      if (message.includes(businessKeyword)) {
        const hasTargetMatch = targetContexts.some(ctx => target.includes(ctx));
        if (hasTargetMatch) return true;
      }
    }

    // Check for whole word matches to avoid false positives
    const targetWords = target.split(/[\s_-]+/).filter(w => w.length > 6);
    const messageWords = message.split(/\s+/);
    
    for (const targetWord of targetWords) {
      for (const messageWord of messageWords) {
        if (messageWord.length >= 6 && targetWord.length >= 6) {
          if (messageWord.includes(targetWord) || targetWord.includes(messageWord)) {
            if (Math.abs(messageWord.length - targetWord.length) <= 2) {
              return true;
            }
          }
        }
      }
    }

    return false;
  }

  /**
   * Score based on agent layer and context
   */
  private static scoreLayer(
    layer: string,
    context: AgentContext,
    message: string
  ): number {
    const message_lower = message.toLowerCase();

    switch (layer) {
      case "interface":
        // Interface layer handles onboarding, first contact
        if (!context.userId || message_lower.includes("olá") || message_lower.includes("começar")) {
          return 10;
        }
        return 5;

      case "intelligence":
        // Intelligence layer for analysis, discovery
        if (message_lower.includes("analis") || message_lower.includes("descobrir") || message_lower.includes("entender")) {
          return 10;
        }
        return 7;

      case "execution":
        // Execution layer for doing actual work
        if (message_lower.includes("criar") || message_lower.includes("fazer") || message_lower.includes("executar")) {
          return 10;
        }
        return 8;

      case "coordination":
        // Coordination for complex multi-agent tasks
        if (context.previousMessages && context.previousMessages.length > 5) {
          return 10; // Long conversations need coordination
        }
        return 6;

      default:
        return 5;
    }
  }

  /**
   * Execute handoff from one agent to another
   */
  static async executeHandoff(
    context: AgentContext,
    fromAgentId: string,
    toAgentId: string,
    reason: string,
    handoffMessage?: string
  ): Promise<void> {
    const storage = await getTenantStorage(context.tenantId || undefined);

    // Create handoff record
    await storage.createAgentHandoff({
      tenantId: context.tenantId || undefined,
      conversationId: context.conversationId,
      fromAgentId,
      toAgentId,
      reason,
      context: context.metadata || {},
      handoffMessage,
      status: "initiated",
    });

    // CRITICAL: Update conversation state with new active agent
    await storage.updateConversation(context.conversationId, {
      currentAgentId: toAgentId,
      updatedAt: new Date(),
    });

    // If handoff message provided, send it to the user
    if (handoffMessage) {
      await storage.createMessage({
        conversationId: context.conversationId,
        tenantId: context.tenantId || undefined,
        role: "assistant",
        content: handoffMessage,
        metadata: {
          type: "handoff",
          fromAgentId,
          toAgentId,
          reason,
        },
      });
    }
  }

  /**
   * Get agent by ID and prepare for chat
   */
  static async getAgentForChat(
    agentId: string,
    tenantId: string | null
  ): Promise<SpecializedAgent | null> {
    const storage = await getTenantStorage(tenantId || undefined);
    const agent = await storage.getSpecializedAgent(agentId);
    return agent || null;
  }

  /**
   * Request help from another agent (inter-agent communication)
   */
  static async requestAgentHelp(
    context: AgentContext,
    fromAgentId: string,
    toAgentType: string,
    helpMessage: string,
    helpContext?: Record<string, any>
  ): Promise<string> {
    const storage = await getTenantStorage(context.tenantId || undefined);

    // Find target agent
    const agents = await storage.getSpecializedAgentsByType(toAgentType);
    if (agents.length === 0) {
      throw new Error(`No agent found with type: ${toAgentType}`);
    }

    const toAgent = agents[0];

    // Use collaboration utility to request help
    const interactionId = await collaboration.requestHelp(
      context.tenantId,
      fromAgentId,
      toAgent.id,
      context.conversationId,
      {
        type: "request_help",
        content: helpMessage,
        context: helpContext || context.metadata || {}
      }
    );

    console.log(`[Orchestrator] Help requested: ${fromAgentId} → ${toAgent.id} (${toAgentType})`);
    
    return interactionId;
  }

  /**
   * Share context between agents
   */
  static async shareAgentContext(
    context: AgentContext,
    fromAgentId: string,
    toAgentId: string,
    contextData: {
      category: string;
      title: string;
      data: Record<string, any>;
    }
  ): Promise<void> {
    await collaboration.shareContext(
      context.tenantId,
      fromAgentId,
      toAgentId,
      context.conversationId,
      contextData
    );
  }

  /**
   * Execute handoff via collaboration utilities
   */
  static async executeCollaborativeHandoff(
    context: AgentContext,
    fromAgentId: string,
    toAgentId: string,
    reason: string,
    handoffContext?: Record<string, any>
  ): Promise<void> {
    await collaboration.handoffConversation(
      context.tenantId,
      fromAgentId,
      toAgentId,
      context.conversationId,
      reason,
      handoffContext
    );
  }

  /**
   * Coordinate multiple agents for a complex task
   */
  static async coordinateMultiAgentTask(
    context: AgentContext,
    taskDescription: string,
    requiredAgentTypes: string[]
  ): Promise<void> {
    const storage = await getTenantStorage(context.tenantId || undefined);

    // Get all required agents
    const agentPromises = requiredAgentTypes.map(type =>
      storage.getSpecializedAgentsByType(type)
    );

    const agentArrays = await Promise.all(agentPromises);
    const agents = agentArrays.flat();

    if (agents.length < requiredAgentTypes.length) {
      throw new Error("Not all required agents are available");
    }

    // TODO: Implement task orchestration logic
    // 1. Break down task into steps
    // 2. Assign steps to appropriate agents
    // 3. Manage execution sequence
    // 4. Collect and synthesize results
    // This will be implemented in next iteration
  }
}

/**
 * Call agent-specific handleMessage if available
 */
export async function callAgentHandler(
  agent: SpecializedAgent,
  context: AgentContext,
  message: string
): Promise<string | null> {
  const agentContext = {
    conversationId: context.conversationId,
    tenantId: context.tenantId,
    userId: context.userId || '' // Ensure userId is always a string
  };

  const agentInfo = {
    id: agent.id,
    type: agent.type,
    name: agent.name
  };

  try {
    // Call agent-specific handleMessage based on type
    switch (agent.type) {
      case 'onboarding':
        if (onboardingAgent.handleMessage) {
          return await onboardingAgent.handleMessage(agentContext, message, agentInfo);
        }
        break;
      case 'discovery':
        // discoveryAgent doesn't have handleMessage method yet
        console.log('[Orchestrator] Discovery agent called - no specific handler');
        return null;
      case 'gap_detection':
        // gapDetectionAgent doesn't have handleMessage method yet
        console.log('[Orchestrator] Gap Detection agent called - no specific handler');
        return null;
      case 'configuration':
        if (configurationAgent.handleMessage) {
          return await configurationAgent.handleMessage(agentContext, message, agentInfo);
        }
        break;
      case 'project_planning':
        if (projectPlanningAgent.handleMessage) {
          return await projectPlanningAgent.handleMessage(agentContext, message, agentInfo);
        }
        break;
      case 'risk_detection':
        if (riskDetectionAgent.handleMessage) {
          return await riskDetectionAgent.handleMessage(agentContext, message, agentInfo);
        }
        break;
      case 'project_billing':
        if (billingAgent.handleMessage) {
          return await billingAgent.handleMessage(agentContext, message, agentInfo);
        }
        break;
      default:
        console.log(`[Orchestrator] No specific handler for agent type: ${agent.type}`);
        return null;
    }
  } catch (error) {
    console.error(`[Orchestrator] Error calling agent handler for ${agent.type}:`, error);
    return null;
  }

  return null;
}

/**
 * Helper function to use orchestrator in chat routes
 */
export async function orchestrateChat(
  context: AgentContext,
  userMessage: string
): Promise<{
  agent: SpecializedAgent;
  decision: RoutingDecision;
  agentResponse?: string;
}> {
  // Get routing decision
  const decision = await Orchestrator.routeToAgent(context, userMessage);

  // Get the selected agent
  const agent = await Orchestrator.getAgentForChat(decision.agentId, context.tenantId);

  if (!agent) {
    throw new Error(`Agent ${decision.agentId} not found`);
  }

  // If handoff is needed and there's a previous agent, execute handoff
  if (decision.shouldHandoff && context.currentAgentId && context.currentAgentId !== agent.id) {
    await Orchestrator.executeHandoff(
      context,
      context.currentAgentId,
      agent.id,
      decision.reason,
      decision.handoffMessage
    );
  }

  // Try to call agent-specific handler
  const agentResponse = await callAgentHandler(agent, context, userMessage);

  return { agent, decision, agentResponse: agentResponse || undefined };
}

// ===========================
// Inter-Agent Communication Bus Initialization
// ===========================

import { interAgentBus } from './agents/inter-agent-bus';
import { handleFinanceRequests, handleHRRequests } from './agents/project-coordinator';

/**
 * Initialize inter-module communication handlers
 * Registers mock handlers for Finance and HR modules
 * These will be replaced with real agents when those modules are implemented
 */
function initializeInterAgentBus() {
  console.log('[Orchestrator] Initializing Inter-Agent Communication Bus...');
  
  // Register Finance module handler
  interAgentBus.registerModuleHandler('finance', handleFinanceRequests);
  console.log('[Orchestrator] ✓ Finance module handler registered');
  
  // Register HR module handler
  interAgentBus.registerModuleHandler('hr', handleHRRequests);
  console.log('[Orchestrator] ✓ HR module handler registered');
  
  console.log('[Orchestrator] Inter-Agent Communication Bus initialized successfully');
}

// Initialize on module load
initializeInterAgentBus();
