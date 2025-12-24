import {
    Filter,
    ArrowUpDown,
    Combine,
    Code,
    FileJson,
    Table,
    Settings2,
    Slack,
    MessageCircle,
    Hash,
    Send,
    Bell,
    Mail
} from 'lucide-react';
import { z } from 'zod';
import { INodeDefinition } from '../types/workflow.types';
import { BaseNode } from '@/components/workflow/nodes/BaseNode';

// --- DATA NODES ---

/**
 * Filter Node
 */
export const filterNodeDefinition: INodeDefinition = {
    type: 'filter',
    label: 'Advanced Filter',
    description: 'Filter a list of items based on conditions',
    category: 'data',
    icon: Filter,
    color: 'bg-slate-600',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'Transformation',
        searchableKeywords: ['filter', 'where', 'query', 'data']
    },
    defaultConfig: {
        items: '{{trigger.items}}',
        conditions: []
    },
    configSchema: z.object({
        items: z.string().describe('template'),
        conditions: z.array(z.object({
            field: z.string(),
            operator: z.enum(['equals', 'notEquals', 'greaterThan', 'lessThan', 'contains']),
            value: z.string().describe('template')
        }))
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Data', type: 'any' }],
    outputs: [
        { id: 'matches', label: 'Matches', type: 'any' },
        { id: 'rejected', label: 'Rejected', type: 'any' }
    ]
};

/**
 * Sort Node
 */
export const sortNodeDefinition: INodeDefinition = {
    type: 'sort',
    label: 'Sort Items',
    description: 'Sort a list of objects by a specific field',
    category: 'data',
    icon: ArrowUpDown,
    color: 'bg-slate-700',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'Transformation',
        searchableKeywords: ['sort', 'order', 'alphabetical', 'reverse']
    },
    defaultConfig: {
        items: '',
        field: '',
        direction: 'asc'
    },
    configSchema: z.object({
        items: z.string().describe('template'),
        field: z.string(),
        direction: z.enum(['asc', 'desc'])
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'List', type: 'any' }],
    outputs: [{ id: 'output', label: 'Sorted List', type: 'any' }]
};

/**
 * Aggregate Node
 */
export const aggregateNodeDefinition: INodeDefinition = {
    type: 'aggregate',
    label: 'Aggregate Data',
    description: 'Calculate sum, average, min, or max from a list',
    category: 'data',
    icon: Combine,
    color: 'bg-slate-800',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'Calculation',
        searchableKeywords: ['sum', 'average', 'avg', 'count', 'math']
    },
    defaultConfig: {
        items: '',
        field: '',
        operation: 'sum'
    },
    configSchema: z.object({
        items: z.string().describe('template'),
        field: z.string(),
        operation: z.enum(['sum', 'avg', 'min', 'max', 'count'])
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Numbers', type: 'any' }],
    outputs: [{ id: 'result', label: 'Result', type: 'number' }]
};

// --- COMMUNICATION NODES ---

/**
 * Slack Node
 */
export const slackNodeDefinition: INodeDefinition = {
    type: 'slack_send',
    label: 'Slack Message',
    description: 'Send a message to a Slack channel',
    category: 'communication',
    icon: Slack,
    color: 'bg-purple-600',
    requiresCredentials: true,
    credentialType: 'slack',
    metadata: {
        categoryGroup: 'Chat',
        searchableKeywords: ['slack', 'message', 'chat', 'notify']
    },
    defaultConfig: {
        channel: '',
        text: ''
    },
    configSchema: z.object({
        channel: z.string().min(1, 'Channel is required'),
        text: z.string().min(1, 'Message text is required').describe('template')
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'success', label: 'Sent', type: 'boolean' }]
};

/**
 * WhatsApp Node
 */
export const whatsappNodeDefinition: INodeDefinition = {
    type: 'whatsapp_send',
    label: 'WhatsApp Message',
    description: 'Send a WhatsApp message via Meta API',
    category: 'communication',
    icon: MessageCircle,
    color: 'bg-green-600',
    requiresCredentials: true,
    credentialType: 'whatsapp',
    metadata: {
        categoryGroup: 'Chat',
        searchableKeywords: ['whatsapp', 'message', 'mobile', 'meta']
    },
    defaultConfig: {
        phoneNumber: '',
        templateName: '',
        languageCode: 'en_US'
    },
    configSchema: z.object({
        phoneNumber: z.string().min(1, 'Phone number is required'),
        templateName: z.string().min(1, 'Template name is required'),
        languageCode: z.string().default('en_US')
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Data', type: 'any' }],
    outputs: [{ id: 'msgId', label: 'Message ID', type: 'string' }]
};

/**
 * Discord Webhook Node
 */
export const discordNodeDefinition: INodeDefinition = {
    type: 'discord_webhook',
    label: 'Discord Webhook',
    description: 'Post a message to Discord using a webhook URL',
    category: 'communication',
    icon: Bell,
    color: 'bg-indigo-700',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'Chat',
        searchableKeywords: ['discord', 'webhook', 'notify', 'post']
    },
    defaultConfig: {
        webhookUrl: '',
        content: ''
    },
    configSchema: z.object({
        webhookUrl: z.string().url('Invalid webhook URL'),
        content: z.string().min(1).describe('template'),
        username: z.string().optional(),
        avatarUrl: z.string().url().optional()
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Data', type: 'any' }],
    outputs: [{ id: 'status', label: 'Status', type: 'number' }]
};
