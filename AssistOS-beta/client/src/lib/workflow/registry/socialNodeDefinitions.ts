import {
    Facebook,
    Instagram,
    Twitter,
    Linkedin,
    Youtube,
    Send,
    MessageSquare,
    Slack,
    Share2,
    Rss,
    Bell,
    Webhook,
    Phone,
    MessageCircle
} from 'lucide-react';
import { z } from 'zod';
import { INodeDefinition } from '../types/workflow.types';
import { BaseNode } from '@/components/workflow/nodes/BaseNode';

/**
 * Webhook Trigger
 */
export const webhookTriggerDefinition: INodeDefinition = {
    type: 'webhook_trigger',
    label: 'Webhook',
    description: 'Trigger workflow via HTTP POST request',
    category: 'trigger',
    icon: Webhook,
    color: 'bg-emerald-600',
    defaultConfig: {
        webhookPath: '',
        httpMethod: 'POST'
    },
    configSchema: z.object({
        webhookPath: z.string().min(1, 'Path required'),
        httpMethod: z.enum(['GET', 'POST', 'PUT'])
    }),
    component: BaseNode,
    inputs: [],
    outputs: [{ id: 'data', label: 'Payload', type: 'object' }],
    validate: (data) => !data.config?.webhookPath ? [{ field: 'webhookPath', message: 'Path required' }] : []
};

/**
 * Slack Node
 */
export const slackNodeDefinition: INodeDefinition = {
    type: 'slack',
    label: 'Slack',
    description: 'Send messages or manage Slack channels',
    category: 'integration',
    icon: Slack,
    color: 'bg-indigo-700',
    defaultConfig: {
        resource: 'message',
        operation: 'post',
        channel: '',
        text: ''
    },
    configSchema: z.object({
        resource: z.string(),
        operation: z.string(),
        channel: z.string().min(1, 'Channel required'),
        text: z.string().min(1, 'Text required')
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Discord Node
 */
export const discordNodeDefinition: INodeDefinition = {
    type: 'discord',
    label: 'Discord',
    description: 'Send messages to Discord via Webhooks or Bot',
    category: 'integration',
    icon: MessageSquare,
    color: 'bg-blue-600',
    defaultConfig: {
        webhookUrl: '',
        content: ''
    },
    configSchema: z.object({
        webhookUrl: z.string().url().optional(),
        content: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Telegram Node
 */
export const telegramNodeDefinition: INodeDefinition = {
    type: 'telegram',
    label: 'Telegram',
    description: 'Send messages or media via Telegram Bot API',
    category: 'integration',
    icon: Send,
    color: 'bg-sky-500',
    defaultConfig: {
        chatId: '',
        text: ''
    },
    configSchema: z.object({
        chatId: z.string().min(1),
        text: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * WhatsApp Cloud API Node
 */
export const whatsappNodeDefinition: INodeDefinition = {
    type: 'whatsapp_cloud',
    label: 'WhatsApp',
    description: 'Send messages via WhatsApp Cloud API',
    category: 'integration',
    icon: MessageCircle,
    color: 'bg-green-500',
    defaultConfig: {
        phoneNumber: '',
        templateName: '',
        languageCode: 'en_US'
    },
    configSchema: z.object({
        phoneNumber: z.string().min(1),
        templateName: z.string().min(1),
        languageCode: z.string().default('en_US')
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Twitter Node
 */
export const twitterNodeDefinition: INodeDefinition = {
    type: 'twitter',
    label: 'X (Twitter)',
    description: 'Post tweets or search X content',
    category: 'integration',
    icon: Twitter,
    color: 'bg-black',
    defaultConfig: {
        text: ''
    },
    configSchema: z.object({
        text: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * LinkedIn Node
 */
export const linkedinNodeDefinition: INodeDefinition = {
    type: 'linkedin',
    label: 'LinkedIn',
    description: 'Share posts or manage company pages',
    category: 'integration',
    icon: Linkedin,
    color: 'bg-blue-700',
    defaultConfig: {
        text: ''
    },
    configSchema: z.object({
        text: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * YouTube Node
 */
export const youtubeNodeDefinition: INodeDefinition = {
    type: 'youtube',
    label: 'YouTube',
    description: 'Upload videos or get channel analytics',
    category: 'integration',
    icon: Youtube,
    color: 'bg-red-600',
    defaultConfig: {
        operation: 'get_analytics'
    },
    configSchema: z.object({
        operation: z.enum(['upload', 'get_analytics', 'list_videos'])
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * RSS Feed Trigger
 */
export const rssTriggerDefinition: INodeDefinition = {
    type: 'rss_trigger',
    label: 'RSS Feed',
    description: 'Trigger workflow when new items appear in RSS feed',
    category: 'trigger',
    icon: Rss,
    color: 'bg-orange-500',
    defaultConfig: {
        url: '',
        pollInterval: '15m'
    },
    configSchema: z.object({
        url: z.string().url('Valid URL required'),
        pollInterval: z.string().default('15m')
    }),
    component: BaseNode,
    inputs: [],
    outputs: [{ id: 'item', label: 'Feed Item', type: 'any' }],
    validate: (data) => !data.config?.url ? [{ field: 'url', message: 'URL required' }] : []
};

/**
 * Facebook Graph API Node
 */
export const facebookNodeDefinition: INodeDefinition = {
    type: 'facebook',
    label: 'Facebook',
    description: 'Interact with Facebook Graph API',
    category: 'integration',
    icon: Facebook,
    color: 'bg-blue-800',
    defaultConfig: {
        pageId: '',
        message: ''
    },
    configSchema: z.object({
        pageId: z.string().min(1),
        message: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Instagram Graph API Node
 */
export const instagramNodeDefinition: INodeDefinition = {
    type: 'instagram',
    label: 'Instagram',
    description: 'Publish posts or manage Instagram content',
    category: 'integration',
    icon: Instagram,
    color: 'bg-pink-600',
    defaultConfig: {
        mediaUrl: '',
        caption: ''
    },
    configSchema: z.object({
        mediaUrl: z.string().url(),
        caption: z.string().optional()
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Twilio Node
 */
export const twilioNodeDefinition: INodeDefinition = {
    type: 'twilio',
    label: 'Twilio',
    description: 'Send SMS, WhatsApp messages or make calls',
    category: 'integration',
    icon: Phone,
    color: 'bg-red-500',
    defaultConfig: {
        from: '',
        to: '',
        body: ''
    },
    configSchema: z.object({
        from: z.string().min(1),
        to: z.string().min(1),
        body: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Reddit Node
 */
export const redditNodeDefinition: INodeDefinition = {
    type: 'reddit',
    label: 'Reddit',
    description: 'Post threads or search subreddits',
    category: 'integration',
    icon: Share2,
    color: 'bg-orange-600',
    defaultConfig: {
        subreddit: '',
        title: '',
        text: ''
    },
    configSchema: z.object({
        subreddit: z.string().min(1),
        title: z.string().min(1),
        text: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Pinterest Node
 */
export const pinterestNodeDefinition: INodeDefinition = {
    type: 'pinterest',
    label: 'Pinterest',
    description: 'Create pins or manage boards',
    category: 'integration',
    icon: Share2,
    color: 'bg-red-700',
    defaultConfig: {
        boardId: '',
        mediaUrl: '',
        note: ''
    },
    configSchema: z.object({
        boardId: z.string().min(1),
        mediaUrl: z.string().url(),
        note: z.string().optional()
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * TikTok Node
 */
export const tiktokNodeDefinition: INodeDefinition = {
    type: 'tiktok',
    label: 'TikTok',
    description: 'Upload videos or manage TikTok content',
    category: 'integration',
    icon: Share2,
    color: 'bg-black',
    defaultConfig: {
        videoUrl: ''
    },
    configSchema: z.object({
        videoUrl: z.string().url()
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Mattermost Node
 */
export const mattermostNodeDefinition: INodeDefinition = {
    type: 'mattermost',
    label: 'Mattermost',
    description: 'Send messages to Mattermost channels',
    category: 'integration',
    icon: MessageSquare,
    color: 'bg-blue-900',
    defaultConfig: {
        channelId: '',
        message: ''
    },
    configSchema: z.object({
        channelId: z.string().min(1),
        message: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

/**
 * Rocket Chat Node
 */
export const rocketChatNodeDefinition: INodeDefinition = {
    type: 'rocket_chat',
    label: 'Rocket.Chat',
    description: 'Send messages to Rocket.Chat channels',
    category: 'integration',
    icon: MessageSquare,
    color: 'bg-red-600',
    defaultConfig: {
        roomId: '',
        text: ''
    },
    configSchema: z.object({
        roomId: z.string().min(1),
        text: z.string().min(1)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Input', type: 'any' }],
    outputs: [{ id: 'output', label: 'Response', type: 'any' }],
    validate: (data) => []
};

