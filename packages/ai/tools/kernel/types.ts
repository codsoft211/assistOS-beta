import { z } from 'zod';

export interface ToolManifest {
  name: string;
  category: 'discovery' | 'configuration' | 'creation' | 'validation' | 'deployment' | 'management' | 'crm' | 'financial' | 'projects' | 'hr' | 'logistics' | 'procurement' | 'sales' | 'support' | 'marketing' | 'accounting' | 'quality' | 'document_analysis' | 'communication' | 'data-import';
  description: string;
  parameters: ToolParameter[];
  scope?: 'user' | 'tenant' | 'platform' | 'unknown'; // 🔒 SECURITY: Tool access scope - determines which orchestrators can use this tool
  outputSchema?: z.ZodType<any>;
  requiresAuth: boolean;
  requiresSandbox?: boolean;
  estimatedDuration?: number;
  progressSupport: boolean;
}

export interface ToolParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array';
  description: string;
  required: boolean;
  schema?: z.ZodType<any>;
  default?: any;
  enum?: string[] | number[];
  items?: {
    type: 'string' | 'number' | 'boolean' | 'object';
    description?: string;
    properties?: Record<string, { 
      type: string; 
      description?: string;
      items?: { type: string }; // Support for nested arrays like string[]
    }>;
    required?: string[];
  };
  properties?: Record<string, { type: string; description?: string; required?: boolean }>;
}

export interface ToolExecutionContext {
  tenantId: string;
  userId: string;
  environment: 'sandbox' | 'production';
  conversationId?: string;
  metadata?: Record<string, any>;
}

export interface ToolExecutionResult<T = any> {
  success: boolean;
  data?: T;
  error?: ToolError;
  metadata?: {
    duration: number;
    progress?: number;
    logs?: string[];
  };
}

export interface ToolError {
  code: string;
  message: string;
  details?: any;
  recoverable: boolean;
}

// New simplified tool definition type (used by Sales, Marketing, Accounting tools)
export type ToolDefinition<TInput = any> = {
  name: string;
  description: string;
  category: 'discovery' | 'configuration' | 'creation' | 'validation' | 'deployment' | 'management' | 'crm' | 'financial' | 'projects' | 'hr' | 'logistics' | 'procurement' | 'sales' | 'support' | 'marketing' | 'accounting' | 'quality' | 'document_analysis' | 'communication' | 'data-import';
  inputSchema: z.ZodType<TInput>;
  progressSupport?: boolean; // Whether this tool reports progress during execution
  execute: (input: TInput, context: ToolExecutionContext, onProgress?: (progress: number, message: string) => void) => Promise<{
    success: boolean;
    data?: any;
    error?: ToolError;
  }>;
};
