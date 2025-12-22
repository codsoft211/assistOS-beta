import { Play, Database, Globe, GitBranch, Calendar, FileSearch, Mail, Settings, Clock, Code, FileJson, Layers, Sparkles, GitMerge } from 'lucide-react';
import { z } from 'zod';
import { INodeDefinition } from '../types/workflow.types';
import { BaseNode } from '@/components/workflow/nodes/BaseNode';

// Re-export invoice workflow nodes
export { scheduleTriggerDefinition, fetchInvoiceDefinition, sendEmailDefinition } from './invoiceNodeDefinitions';

/**
 * Manual Trigger Node Definition
 * Starts a workflow manually with input data
 */
export const manualTriggerDefinition: INodeDefinition = {
  type: 'manual_trigger',
  label: 'Manual Trigger',
  description: 'Start workflow manually with input data',
  category: 'trigger',
  icon: Play,
  color: 'bg-green-600',

  defaultConfig: {
    label: 'Start'
  },

  configSchema: z.object({
    label: z.string().min(1, 'Label required')
  }),

  component: BaseNode,

  inputs: [],
  outputs: [
    { id: 'trigger', label: 'Trigger Data', type: 'any' }
  ],

  validate: (data) => {
    const errors = [];
    if (!data.label || data.label.trim().length === 0) {
      errors.push({
        field: 'label',
        message: 'Label is required'
      });
    }
    return errors;
  }
};

/**
 * CRUD Record Node Definition
 * Create, read, update, or delete database records
 */
export const crudRecordDefinition: INodeDefinition = {
  type: 'crud_record',
  label: 'CRUD Operation',
  description: 'Create, read, update, or delete records',
  category: 'action',
  icon: Database,
  color: 'bg-blue-600',

  defaultConfig: {
    operation: 'create',
    entity: '',
    data: {}
  },

  configSchema: z.object({
    operation: z.enum(['create', 'read', 'update', 'delete']),
    entity: z.string().min(1, 'Entity required (e.g., customers, invoices)'),
    data: z.record(z.any()).optional(),
    filters: z.record(z.any()).optional()
  }),

  component: BaseNode,

  inputs: [
    { id: 'data', label: 'Input Data', type: 'object' }
  ],
  outputs: [
    { id: 'result', label: 'Result', type: 'object' },
    { id: 'error', label: 'Error', type: 'error' }
  ],

  validate: (data) => {
    const errors = [];

    if (!data.config?.entity) {
      errors.push({
        field: 'entity',
        message: 'Entity is required (e.g., customers, invoices)'
      });
    }

    if (!data.config?.operation) {
      errors.push({
        field: 'operation',
        message: 'Operation is required'
      });
    }

    if (data.config?.operation === 'create' || data.config?.operation === 'update') {
      if (!data.config?.data || Object.keys(data.config.data).length === 0) {
        errors.push({
          field: 'data',
          message: 'At least one field is required'
        });
      }
    }

    return errors;
  }
};

/**
 * HTTP Request Node Definition
 * Make HTTP API calls to external services
 */
export const httpRequestDefinition: INodeDefinition = {
  type: 'http_request',
  label: 'HTTP Request',
  description: 'Make HTTP API calls to external services',
  category: 'integration',
  icon: Globe,
  color: 'bg-purple-600',

  defaultConfig: {
    method: 'GET',
    url: '',
    headers: {},
    body: ''
  },

  configSchema: z.object({
    method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH']),
    url: z.string().url('Must be a valid URL'),
    headers: z.record(z.string()).optional(),
    body: z.string().optional()
  }),

  component: BaseNode,

  inputs: [
    { id: 'data', label: 'Request Data', type: 'object' }
  ],
  outputs: [
    { id: 'response', label: 'Response', type: 'object' },
    { id: 'error', label: 'Error', type: 'error' }
  ],

  validate: (data) => {
    const errors = [];

    if (!data.config?.url) {
      errors.push({
        field: 'url',
        message: 'URL is required'
      });
    }

    if (!data.config?.method) {
      errors.push({
        field: 'method',
        message: 'HTTP method is required'
      });
    }

    return errors;
  }
};

/**
 * Condition Node Definition
 * Branch workflow based on conditions
 */
export const conditionDefinition: INodeDefinition = {
  type: 'condition',
  label: 'Condition',
  description: 'Branch workflow based on conditions',
  category: 'condition',
  icon: GitBranch,
  color: 'bg-orange-600',

  defaultConfig: {
    operator: 'equals',
    field: '',
    value: ''
  },

  configSchema: z.object({
    operator: z.enum(['equals', 'notEquals', 'contains', 'greaterThan', 'lessThan', 'isEmpty', 'isNotEmpty']),
    field: z.string().min(1, 'Field required'),
    value: z.string().optional()
  }),

  component: BaseNode,

  inputs: [
    { id: 'data', label: 'Input Data', type: 'object' }
  ],
  outputs: [
    { id: 'true', label: 'True', type: 'boolean' },
    { id: 'false', label: 'False', type: 'boolean' }
  ],

  validate: (data) => {
    const errors = [];

    if (!data.config?.field) {
      errors.push({
        field: 'field',
        message: 'Field to evaluate is required'
      });
    }

    if (!data.config?.operator) {
      errors.push({
        field: 'operator',
        message: 'Operator is required'
      });
    }

    return errors;
  }
};

/**
 * Set Node Definition
 * Create or update variables in the workflow context
 */
export const setNodeDefinition: INodeDefinition = {
  type: 'set_variable',
  label: 'Set',
  description: 'Create or update variables in the workflow context',
  category: 'action',
  icon: Settings,
  color: 'bg-slate-600',

  defaultConfig: {
    variables: [
      { key: '', value: '' }
    ]
  },

  configSchema: z.object({
    variables: z.array(z.object({
      key: z.string().min(1, 'Key required'),
      value: z.any()
    }))
  }),

  component: BaseNode,

  inputs: [
    { id: 'input', label: 'Input', type: 'any' }
  ],
  outputs: [
    { id: 'output', label: 'Output', type: 'any' }
  ],

  validate: (data) => {
    const errors = [];
    if (!data.config?.variables || data.config.variables.length === 0) {
      errors.push({
        field: 'variables',
        message: 'At least one variable is required'
      });
    }
    return errors;
  }
};

/**
 * Wait Node Definition
 * Pause workflow execution for a specific duration
 */
export const waitNodeDefinition: INodeDefinition = {
  type: 'wait',
  label: 'Wait',
  description: 'Pause workflow execution for a specific duration',
  category: 'action',
  icon: Clock,
  color: 'bg-amber-500',

  defaultConfig: {
    duration: 5,
    unit: 'seconds'
  },

  configSchema: z.object({
    duration: z.number().min(1),
    unit: z.enum(['seconds', 'minutes', 'hours'])
  }),

  component: BaseNode,

  inputs: [
    { id: 'input', label: 'Input', type: 'any' }
  ],
  outputs: [
    { id: 'output', label: 'Output', type: 'any' }
  ],

  validate: (data) => {
    const errors = [];
    if (!data.config?.duration || data.config.duration <= 0) {
      errors.push({
        field: 'duration',
        message: 'Duration must be greater than 0'
      });
    }
    return errors;
  }
};

/**
 * Code Node Definition
 * Execute custom JavaScript or Python code
 */
export const codeNodeDefinition: INodeDefinition = {
  type: 'code_execution',
  label: 'Code',
  description: 'Execute custom JavaScript or Python code',
  category: 'action',
  icon: Code,
  color: 'bg-emerald-600',

  defaultConfig: {
    language: 'javascript',
    code: '// Access input via data variable\n// Return the result\nreturn data;'
  },

  configSchema: z.object({
    language: z.enum(['javascript', 'python']),
    code: z.string().min(1, 'Code is required')
  }),

  component: BaseNode,

  inputs: [
    { id: 'input', label: 'Input Data', type: 'any' }
  ],
  outputs: [
    { id: 'output', label: 'Result', type: 'any' },
    { id: 'error', label: 'Error', type: 'error' }
  ],

  validate: (data) => {
    const errors = [];
    if (!data.config?.code || data.config.code.trim().length === 0) {
      errors.push({
        field: 'code',
        message: 'Code is required'
      });
    }
    return errors;
  }
};

/**
 * JSON Parse/Stringify Node Definition
 */
export const jsonNodeDefinition: INodeDefinition = {
  type: 'json_operation',
  label: 'JSON',
  description: 'Parse or stringify JSON data',
  category: 'action',
  icon: FileJson,
  color: 'bg-blue-400',

  defaultConfig: {
    operation: 'parse',
    inputField: '{{data}}'
  },

  configSchema: z.object({
    operation: z.enum(['parse', 'stringify']),
    inputField: z.string().min(1, 'Input field is required')
  }),

  component: BaseNode,

  inputs: [
    { id: 'input', label: 'Input', type: 'any' }
  ],
  outputs: [
    { id: 'output', label: 'Result', type: 'any' },
    { id: 'error', label: 'Error', type: 'error' }
  ],

  validate: (data) => {
    const errors = [];
    if (!data.config?.inputField) {
      errors.push({
        field: 'inputField',
        message: 'Input field is required'
      });
    }
    return errors;
  }
};

/**
 * AI Chat Node Definition
 * Generate text using AI models (GPT-4, Claude, etc.)
 */
export const aiChatNodeDefinition: INodeDefinition = {
  type: 'ai_chat',
  label: 'AI Chat',
  description: 'Generate text using AI models',
  category: 'action',
  icon: Sparkles,
  color: 'bg-emerald-500',

  defaultConfig: {
    model: 'gpt-4o',
    prompt: 'Analyze this data: {{input}}',
    temperature: 0.7,
    maxTokens: 1000
  },

  configSchema: z.object({
    model: z.string().min(1, 'Model required'),
    prompt: z.string().min(1, 'Prompt required'),
    temperature: z.number().min(0).max(2).default(0.7),
    maxTokens: z.number().min(1).default(1000),
    systemPrompt: z.string().optional()
  }),

  component: BaseNode,

  inputs: [
    { id: 'input', label: 'Input Data', type: 'any' }
  ],
  outputs: [
    { id: 'output', label: 'Response', type: 'string' },
    { id: 'usage', label: 'Token Usage', type: 'object' },
    { id: 'error', label: 'Error', type: 'error' }
  ],

  validate: (data) => {
    const errors = [];
    if (!data.config?.prompt) {
      errors.push({
        field: 'prompt',
        message: 'Prompt is required'
      });
    }
    return errors;
  }
};

/**
 * Merge Node Definition
 * Combines data from multiple branches
 */
export const mergeNodeDefinition: INodeDefinition = {
  type: 'merge',
  label: 'Merge',
  description: 'Combine data from multiple branches',
  category: 'action',
  icon: GitMerge,
  color: 'bg-indigo-500',

  defaultConfig: {
    mode: 'merge_objects'
  },

  configSchema: z.object({
    mode: z.enum(['merge_objects', 'array_of_objects', 'wait_for_all'])
  }),

  component: BaseNode,

  inputs: [
    { id: 'input_1', label: 'Input 1', type: 'any' },
    { id: 'input_2', label: 'Input 2', type: 'any' }
  ],
  outputs: [
    { id: 'output', label: 'Combined Data', type: 'any' }
  ],

  validate: (data) => {
    return [];
  }
};

/**
 * Postgres Node Definition
 * Execute SQL queries against a PostgreSQL database
 */
export const postgresNodeDefinition: INodeDefinition = {
  type: 'postgres',
  label: 'Postgres',
  description: 'Execute SQL queries against a PostgreSQL database',
  category: 'action',
  icon: Database,
  color: 'bg-indigo-700',

  defaultConfig: {
    operation: 'executeQuery',
    query: 'SELECT * FROM users LIMIT 10;',
    connectionString: ''
  },

  configSchema: z.object({
    operation: z.enum(['executeQuery', 'insert', 'update', 'delete']),
    query: z.string().min(1, 'SQL query required'),
    connectionString: z.string().optional(), // If empty, uses tenant's default
  }),

  component: BaseNode,

  inputs: [
    { id: 'input', label: 'Input Data', type: 'any' }
  ],
  outputs: [
    { id: 'output', label: 'Query Result', type: 'any' },
    { id: 'rowCount', label: 'Row Count', type: 'number' },
    { id: 'error', label: 'Error', type: 'error' }
  ],

  validate: (data) => {
    const errors = [];
    if (!data.config?.query) {
      errors.push({
        field: 'query',
        message: 'SQL query is required'
      });
    }
    return errors;
  }
};




