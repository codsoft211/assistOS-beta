import { Play, Database, Globe, GitBranch, Calendar, FileSearch, Mail } from 'lucide-react';
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

  requiresCredentials: false,
  metadata: {
    categoryGroup: 'Entry Points',
    searchableKeywords: ['manual', 'start', 'trigger']
  },

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

  requiresCredentials: false,
  metadata: {
    categoryGroup: 'Database',
    searchableKeywords: ['database', 'crud', 'create', 'read', 'update', 'delete']
  },

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

  requiresCredentials: false,
  metadata: {
    categoryGroup: 'Communication',
    searchableKeywords: ['api', 'http', 'request', 'webhook', 'rest']
  },

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

  requiresCredentials: false,
  metadata: {
    categoryGroup: 'Logic',
    searchableKeywords: ['if', 'condition', 'branch', 'filter']
  },

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
