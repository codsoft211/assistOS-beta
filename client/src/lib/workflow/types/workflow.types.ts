import { Node as FlowNode, Edge as FlowEdge } from '@xyflow/react';
import { LucideIcon } from 'lucide-react';
import { z } from 'zod';

// Base workflow types
export interface Workflow {
  id: string;
  name: string;
  description?: string;
  tenantId: string;
  environment: 'sandbox' | 'production';
  status: 'draft' | 'published';
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt?: Date;
  updatedAt?: Date;
}

// Node types
export interface WorkflowNode extends FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
}

export interface NodeData {
  label: string;
  config: Record<string, any>;
  isValid?: boolean;
  errors?: string[];
  executionStatus?: 'idle' | 'running' | 'completed' | 'failed';
  executionOutput?: any;
  executionError?: string;
  [key: string]: unknown; // Fix for XYFlow compatibility
}

// Edge types
export interface WorkflowEdge extends FlowEdge {
  id: string;
  source: string;
  target: string;
  type?: string;
}

// Execution types
export interface ExecutionResult {
  success: boolean;
  data?: any;
  error?: string;
}

export interface ValidationError {
  nodeId?: string;
  field?: string;
  message: string;
  type?: 'error' | 'warning';
}

// Node definition for registry
export interface INodeDefinition {
  type: string;
  label: string;
  description: string;
  category: 'trigger' | 'action' | 'condition' | 'integration' | 'data' | 'ai' | 'communication' | 'utility';
  icon: LucideIcon;
  color: string;

  // Enterprise metadata
  requiresCredentials: boolean;
  credentialType?: string;
  metadata?: {
    categoryGroup?: string;
    searchableKeywords?: string[];
  };

  // Configuration
  defaultConfig: Record<string, any>;
  configSchema: z.ZodSchema;
  configComponent?: React.ComponentType<NodeConfigProps>;

  // Rendering
  component: React.ComponentType<any>;

  // Validation
  validate?: (data: NodeData, workflow: Workflow) => ValidationError[];

  // Metadata
  inputs: NodeInput[];
  outputs: NodeOutput[];
  helpUrl?: string;
}

export interface NodeInput {
  id: string;
  label: string;
  type: string;
}

export interface NodeOutput {
  id: string;
  label: string;
  type: string;
}

export interface NodeConfigProps {
  value: Record<string, any>;
  onChange: (value: Record<string, any>) => void;
}

// Serialized workflow format (for API)
export interface SerializedWorkflow {
  id?: string;
  name: string;
  description?: string;
  environment: 'sandbox' | 'production';
  status: 'draft' | 'published';
  definition: {
    nodes: Array<{
      id: string;
      type: string;
      position: { x: number; y: number };
      data: {
        label: string;
        config: Record<string, any>;
      };
    }>;
    edges: Array<{
      id: string;
      source: string;
      target: string;
    }>;
  };
}
