import { Brain, Sparkles, Image as ImageIcon, MessageSquare, Gauge, FileText } from 'lucide-react';
import { z } from 'zod';
import { INodeDefinition } from '../types/workflow.types';
import { BaseNode } from '@/components/workflow/nodes/BaseNode';

/**
 * OpenAI Text Completion Node
 */
export const openAITextDefinition: INodeDefinition = {
    type: 'openai_text',
    label: 'OpenAI Text Completion',
    description: 'Generate text using OpenAI GPT models',
    category: 'ai',
    icon: MessageSquare,
    color: 'bg-emerald-600',
    requiresCredentials: true,
    credentialType: 'openai',
    metadata: {
        categoryGroup: 'AI Model',
        searchableKeywords: ['openai', 'gpt', 'llm', 'ai', 'chat', 'text']
    },
    defaultConfig: {
        model: 'gpt-4o-mini',
        prompt: '',
        temperature: 0.7,
        maxTokens: 1000
    },
    configSchema: z.object({
        model: z.enum(['gpt-4o', 'gpt-4o-mini', 'gpt-3.5-turbo']),
        prompt: z.string().min(1, 'Prompt is required').describe('template'),
        temperature: z.number().min(0).max(2).default(0.7),
        maxTokens: z.number().min(1).max(4096).default(1000)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Context', type: 'any' }],
    outputs: [
        { id: 'result', label: 'Generated Text', type: 'string' },
        { id: 'error', label: 'Error', type: 'error' }
    ]
};

/**
 * OpenAI Image Generation Node
 */
export const openAIImageDefinition: INodeDefinition = {
    type: 'openai_image',
    label: 'OpenAI Dall-E',
    description: 'Generate images using DALL-E models',
    category: 'ai',
    icon: ImageIcon,
    color: 'bg-emerald-700',
    requiresCredentials: true,
    credentialType: 'openai',
    metadata: {
        categoryGroup: 'AI Model',
        searchableKeywords: ['openai', 'dalle', 'image', 'generation', 'ai']
    },
    defaultConfig: {
        model: 'dall-e-3',
        prompt: '',
        size: '1024x1024',
        quality: 'standard'
    },
    configSchema: z.object({
        model: z.enum(['dall-e-3', 'dall-e-2']),
        prompt: z.string().min(1, 'Prompt is required').describe('template'),
        size: z.enum(['256x256', '512x512', '1024x1024']),
        quality: z.enum(['standard', 'hd'])
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Prompt data', type: 'any' }],
    outputs: [
        { id: 'url', label: 'Image URL', type: 'string' },
        { id: 'error', label: 'Error', type: 'error' }
    ]
};

/**
 * Anthropic Text Node
 */
export const anthropicTextDefinition: INodeDefinition = {
    type: 'anthropic_text',
    label: 'Anthropic Claude',
    description: 'Generate text using Anthropic Claude models',
    category: 'ai',
    icon: Sparkles,
    color: 'bg-orange-600',
    requiresCredentials: true,
    credentialType: 'anthropic',
    metadata: {
        categoryGroup: 'AI Model',
        searchableKeywords: ['anthropic', 'claude', 'llm', 'ai']
    },
    defaultConfig: {
        model: 'claude-3-5-sonnet-20240620',
        prompt: '',
        maxTokens: 1024
    },
    configSchema: z.object({
        model: z.enum(['claude-3-5-sonnet-20240620', 'claude-3-opus-20240229', 'claude-3-haiku-20240307']),
        prompt: z.string().min(1, 'Prompt is required').describe('template'),
        maxTokens: z.number().default(1024)
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Context', type: 'any' }],
    outputs: [
        { id: 'result', label: 'Generated Text', type: 'string' },
        { id: 'error', label: 'Error', type: 'error' }
    ]
};

/**
 * Google Gemini Node
 */
export const googleGeminiDefinition: INodeDefinition = {
    type: 'google_gemini',
    label: 'Google Gemini',
    description: 'Generate text using Google Gemini models',
    category: 'ai',
    icon: Brain,
    color: 'bg-blue-600',
    requiresCredentials: true,
    credentialType: 'google',
    metadata: {
        categoryGroup: 'AI Model',
        searchableKeywords: ['google', 'gemini', 'llm', 'ai']
    },
    defaultConfig: {
        model: 'gemini-1.5-pro',
        prompt: ''
    },
    configSchema: z.object({
        model: z.enum(['gemini-1.5-pro', 'gemini-1.5-flash', 'gemini-pro']),
        prompt: z.string().min(1, 'Prompt is required').describe('template')
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Context', type: 'any' }],
    outputs: [
        { id: 'result', label: 'Generated Text', type: 'string' }
    ]
};

/**
 * AI Sentiment Analysis
 */
export const aiSentimentDefinition: INodeDefinition = {
    type: 'ai_sentiment',
    label: 'Sentiment Analysis',
    description: 'Analyze the sentiment of a given text',
    category: 'ai',
    icon: Gauge,
    color: 'bg-indigo-600',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'AI Analysis',
        searchableKeywords: ['sentiment', 'analysis', 'emotions', 'ai', 'nlp']
    },
    defaultConfig: {
        text: '{{trigger.input}}'
    },
    configSchema: z.object({
        text: z.string().min(1, 'Text to analyze is required').describe('template')
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Text', type: 'string' }],
    outputs: [
        { id: 'sentiment', label: 'Sentiment', type: 'string' },
        { id: 'score', label: 'Score', type: 'number' }
    ]
};

/**
 * AI Summary Node
 */
export const aiSummaryDefinition: INodeDefinition = {
    type: 'ai_summarize',
    label: 'Text Summarizer',
    description: 'Summarize long documents or text',
    category: 'ai',
    icon: FileText,
    color: 'bg-teal-600',
    requiresCredentials: false,
    metadata: {
        categoryGroup: 'AI Analysis',
        searchableKeywords: ['summarize', 'summary', 'shorten', 'ai', 'nlp']
    },
    defaultConfig: {
        text: '',
        length: 'medium'
    },
    configSchema: z.object({
        text: z.string().min(1, 'Text to summarize is required').describe('template'),
        length: z.enum(['short', 'medium', 'long']).default('medium')
    }),
    component: BaseNode,
    inputs: [{ id: 'input', label: 'Text', type: 'string' }],
    outputs: [
        { id: 'summary', label: 'Summary', type: 'string' }
    ]
};
