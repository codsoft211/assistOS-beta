import { Calendar, FileSearch, Mail } from 'lucide-react';
import { z } from 'zod';
import { INodeDefinition } from '../types/workflow.types';
import { BaseNode } from '@/components/workflow/nodes/BaseNode';

/**
 * Schedule Trigger Node Definition
 * Triggers workflow based on a schedule (cron, interval, or specific time)
 */
export const scheduleTriggerDefinition: INodeDefinition = {
  type: 'schedule_trigger',
  label: 'Schedule Trigger',
  description: 'Trigger workflow on a schedule (cron, interval, or once)',
  category: 'trigger',
  icon: Calendar,
  color: 'bg-indigo-600',
  
  defaultConfig: {
    scheduleType: 'interval',
    interval: '1h',
    cronExpression: '0 9 * * *',
    timezone: 'UTC',
    label: 'Scheduled Start'
  },
  
  configSchema: z.object({
    scheduleType: z.enum(['interval', 'cron', 'once']),
    interval: z.string().optional(), // 1h, 30m, 1d
    cronExpression: z.string().optional(), // Standard cron format
    runAt: z.string().optional(), // ISO datetime for 'once'
    timezone: z.string().default('UTC'),
    label: z.string().min(1, 'Label required')
  }),
  
  component: BaseNode,
  
  inputs: [],
  outputs: [
    { id: 'trigger', label: 'Schedule Data', type: 'any' }
  ],
  
  validate: (data) => {
    const errors = [];
    
    if (!data.config?.scheduleType) {
      errors.push({
        field: 'scheduleType',
        message: 'Schedule type is required'
      });
    }
    
    if (data.config?.scheduleType === 'interval' && !data.config?.interval) {
      errors.push({
        field: 'interval',
        message: 'Interval is required (e.g., 1h, 30m, 1d)'
      });
    }
    
    if (data.config?.scheduleType === 'cron' && !data.config?.cronExpression) {
      errors.push({
        field: 'cronExpression',
        message: 'Cron expression is required (e.g., 0 9 * * *)'
      });
    }
    
    return errors;
  }
};

/**
 * Fetch Invoice Node Definition
 * Fetches invoices from the database with filters
 */
export const fetchInvoiceDefinition: INodeDefinition = {
  type: 'fetch_invoice',
  label: 'Fetch Invoices',
  description: 'Fetch invoices from database with filters',
  category: 'action',
  icon: FileSearch,
  color: 'bg-cyan-600',
  
  defaultConfig: {
    status: 'overdue',
    dueDateRange: 'past',
    limit: 100
  },
  
  configSchema: z.object({
    status: z.enum(['pending', 'sent', 'paid', 'overdue', 'cancelled', 'any']).default('overdue'),
    dueDateRange: z.enum(['past', 'today', 'this_week', 'this_month', 'custom']).default('past'),
    dueDateFrom: z.string().optional(),
    dueDateTo: z.string().optional(),
    minAmount: z.number().optional(),
    maxAmount: z.number().optional(),
    limit: z.number().min(1).max(1000).default(100)
  }),
  
  component: BaseNode,
  
  inputs: [
    { id: 'trigger', label: 'Trigger', type: 'any' }
  ],
  outputs: [
    { id: 'invoices', label: 'Invoices', type: 'array' },
    { id: 'count', label: 'Count', type: 'number' },
    { id: 'error', label: 'Error', type: 'error' }
  ],
  
  validate: (data) => {
    const errors = [];
    
    if (data.config?.dueDateRange === 'custom') {
      if (!data.config?.dueDateFrom && !data.config?.dueDateTo) {
        errors.push({
          field: 'dueDateFrom',
          message: 'At least one date is required for custom range'
        });
      }
    }
    
    return errors;
  }
};

/**
 * Send Email Node Definition
 * Sends emails to recipients with customizable templates
 */
export const sendEmailDefinition: INodeDefinition = {
  type: 'send_email',
  label: 'Send Email',
  description: 'Send email notifications to recipients',
  category: 'action',
  icon: Mail,
  color: 'bg-rose-600',
  
  defaultConfig: {
    mode: 'batch', // batch = send to all invoices, single = one email
    toField: '{{customer_email}}',
    subject: 'Invoice Reminder - {{invoice_number}}',
    bodyTemplate: 'Dear {{customer_name}},\n\nThis is a friendly reminder that invoice {{invoice_number}} for ${{amount}} is overdue.\n\nDue Date: {{due_date}}\nAmount: ${{amount}}\n\nPlease arrange payment at your earliest convenience.\n\nBest regards,\nAccounts Team',
    fromName: 'Accounts Team',
    replyTo: ''
  },
  
  configSchema: z.object({
    mode: z.enum(['batch', 'single']).default('batch'),
    toField: z.string().min(1, 'Recipient field required'),
    ccField: z.string().optional(),
    subject: z.string().min(1, 'Subject required'),
    bodyTemplate: z.string().min(1, 'Email body required'),
    fromName: z.string().optional(),
    replyTo: z.string().email().optional().or(z.literal(''))
  }),
  
  component: BaseNode,
  
  inputs: [
    { id: 'data', label: 'Invoice Data', type: 'array' }
  ],
  outputs: [
    { id: 'sent', label: 'Sent Count', type: 'number' },
    { id: 'failed', label: 'Failed Count', type: 'number' },
    { id: 'results', label: 'Results', type: 'array' }
  ],
  
  validate: (data) => {
    const errors = [];
    
    if (!data.config?.toField) {
      errors.push({
        field: 'toField',
        message: 'Recipient email field is required'
      });
    }
    
    if (!data.config?.subject) {
      errors.push({
        field: 'subject',
        message: 'Email subject is required'
      });
    }
    
    if (!data.config?.bodyTemplate) {
      errors.push({
        field: 'bodyTemplate',
        message: 'Email body template is required'
      });
    }
    
    return errors;
  }
};
