import type { ToolManifest, ToolExecutionContext } from '../../tools/kernel';

export interface OrchestratorConfig {
  model: 'claude-3-5-sonnet-latest' | 'claude-3-5-sonnet-20241022' | 'gpt-5' | 'gpt-4o';
  temperature: number;
  maxTokens: number;
  tools: ToolManifest[];
}

export interface ConversationMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  toolCalls?: ToolCall[];
  toolResults?: ToolResult[];
}

export interface ToolCall {
  id: string;
  name: string;
  input: any;
}

export interface ToolResult {
  id: string;
  success: boolean;
  data?: any;
  error?: string;
}

export interface IntentAnalysis {
  intent: 'discovery' | 'configuration' | 'creation' | 'modification' | 'deployment' | 'help';
  confidence: number;
  entities: ExtractedEntity[];
  suggestedTools: string[];
}

export interface ExtractedEntity {
  type: 'module' | 'connector' | 'agent' | 'workflow' | 'entity' | 'field';
  name: string;
  properties?: Record<string, any>;
}

export interface TenantContext {
  tenantId: string;
  userId: string;
  companyInfo?: any;
  activeModules: string[];
  connectors: any[];
  agents: any[];
  workflows: any[];
  environment: 'sandbox' | 'production';
}

export interface ExecutionPlan {
  steps: ExecutionStep[];
  estimatedDuration: number;
  requiresApproval: boolean;
}

export interface ExecutionStep {
  toolName: string;
  input: any;
  dependsOn?: number[];
  parallel: boolean;
}
