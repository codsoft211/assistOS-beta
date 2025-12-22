/**
 * Quota Monitoring Tools for AssistBuild (GAP #5)
 * 
 * AI tools that enable AssistBuild to monitor resource quotas,
 * provide usage insights, and recommend tier upgrades.
 * 
 * Architecture:
 * - Tools call quota.service.ts adapter (wraps ResourceQuotaService)
 * - Conversation context (tenant/environment) extracted automatically
 * - LLM-friendly JSON responses with English messages
 * 
 * Available Tools:
 * - check_quota_status: Overall quota status across all resources
 * - get_usage_statistics: Detailed stats for specific resource type
 * - list_quota_overrides: Custom quota configurations
 * - recommend_tier_upgrade: AI-driven upgrade recommendations
 */

import {
  checkQuotaStatus,
  getUsageStatistics,
  listQuotaOverrides,
  recommendTierUpgrade
} from '../services/quota.service';

/**
 * Quota Monitoring Tools for AssistBuild
 * These tools enable conversational quota management and monitoring
 */
export const quotaMonitoringTools = [
  {
    type: "function" as const,
    function: {
      name: "check_quota_status",
      description: "Checks the current status of all tenant resource quotas. Returns current usage, limits, and percentage used for each resource type (schemas, workflows, modules, generated code, patterns, jobs). Use to get an overview of quotas.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "get_usage_statistics",
      description: "Gets detailed usage statistics for a specific resource type. Returns total usage, daily/hourly usage (if applicable), configured limits, and percentage used. Use for detailed analysis of a specific resource.",
      parameters: {
        type: "object",
        properties: {
          resourceType: {
            type: "string",
            enum: ["code_generation", "schemas", "workflows", "modules", "patterns", "jobs"],
            description: "Resource type for analysis: code_generation (generated code), schemas (migrations), workflows, modules (installed modules), patterns (detected patterns), jobs (AssistBuild jobs)"
          }
        },
        required: ["resourceType"]
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "list_quota_overrides",
      description: "Lists all custom quota configurations for the tenant. Returns specific overrides that differ from tier defaults. Use to check if the tenant has custom limits.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  },
  {
    type: "function" as const,
    function: {
      name: "recommend_tier_upgrade",
      description: "Analyzes current usage and recommends tier upgrade if necessary. Returns recommendation based on resources that have reached or are close to limits (>70%). Includes comparison between current and recommended tier with prices and features. Use when user asks about upgrades or if quotas are being exceeded.",
      parameters: {
        type: "object",
        properties: {},
        required: []
      }
    }
  }
];

/**
 * Tool execution handlers - called by AssistBuild orchestrator
 */
export const quotaToolHandlers = {
  check_quota_status: async (args: any, metadata: any) => {
    return await checkQuotaStatus(metadata);
  },
  
  get_usage_statistics: async (args: { resourceType: string }, metadata: any) => {
    return await getUsageStatistics(metadata, args.resourceType as any);
  },
  
  list_quota_overrides: async (args: any, metadata: any) => {
    return await listQuotaOverrides(metadata);
  },
  
  recommend_tier_upgrade: async (args: any, metadata: any) => {
    return await recommendTierUpgrade(metadata);
  }
};
