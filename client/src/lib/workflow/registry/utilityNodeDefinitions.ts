import {
    Clock,
    Webhook,
    Repeat,
    GitMerge,
    StopCircle,
    PlayCircle
} from 'lucide-react';
import { z } from 'zod';
import { INodeDefinition } from '../types/workflow.types';
import { BaseNode } from '@/components/workflow/nodes/BaseNode';

/**
 * Delay Node
 */
export const delayNodeDefinition: INodeDefinition = {
    type: 'delay',
    label: 'Wait / Delay',
    description: 'Pause the workflow for a specific amount of time',
    category: 'utility',
    icon: Clock,
    color: 'bg-zinc-600',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'Flow Control',
        searchableKeywords: ['delay', 'wait', 'sleep', 'pause', 'timer']
    },
    defaultConfig: {
        duration: 5,
        unit: 'seconds'
    },
    configSchema: z.object({
        duration: z.number().min(1),
        unit: z.enum(['seconds', 'minutes', 'hours', 'days'])
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'output', label: 'Resume', type: 'any' }]
};

/**
 * Webhook Listener (Trigger/Utility)
 */
export const webhookListenerDefinition: INodeDefinition = {
    type: 'webhook_listener',
    label: 'Wait for Webhook',
    description: 'Pause and wait for an incoming HTTP request',
    category: 'utility',
    icon: Webhook,
    color: 'bg-zinc-700',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'Flow Control',
        searchableKeywords: ['webhook', 'listen', 'receive', 'callback']
    },
    defaultConfig: {
        path: '',
        method: 'POST'
    },
    configSchema: z.object({
        path: z.string().min(1, 'Webhook path is required'),
        method: z.enum(['POST', 'GET', 'PUT'])
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Trigger', type: 'any' }],
    outputs: [{ id: 'data', label: 'Received Data', type: 'any' }]
};

/**
 * Logic Merge
 */
export const mergeNodeDefinition: INodeDefinition = {
    type: 'merge',
    label: 'Merge Branches',
    description: 'Merge multiple paths back into one',
    category: 'utility',
    icon: GitMerge,
    color: 'bg-zinc-800',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'Flow Control',
        searchableKeywords: ['merge', 'join', 'combine', 'sync']
    },
    defaultConfig: {
        mode: 'first_come'
    },
    configSchema: z.object({
        mode: z.enum(['first_come', 'wait_all'])
    }),
    component: BaseNode,
    inputs: [
        { id: 'in1', label: 'Input A', type: 'any' },
        { id: 'in2', label: 'Input B', type: 'any' }
    ],
    outputs: [{ id: 'output', label: 'Merged', type: 'any' }]
};
