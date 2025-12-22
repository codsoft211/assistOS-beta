// Realtime SSE Channel Constants
// Phase 4.3 - Settings Events Support
// Phase 4.4 - Chat Notifications Support

/**
 * REALTIME_CHANNELS - Event channel naming constants for SSE
 * 
 * Naming Convention: <domain>:<entity>.<action>
 * Example: settings:user.preferences.updated
 * 
 * Used by:
 * - SSE service (apps/api/services/sse.service.ts) - event handlers
 * - Mutation endpoints - event emission
 */
export const REALTIME_CHANNELS = {
  // Chat/Conversation events
  MESSAGE_CREATED: 'message.created',
  CONVERSATION_UPDATED: 'conversation.updated',
  CONVERSATION_CREATED: 'conversation.created',
  CONVERSATION_READ: 'conversation.read',
  
  // AI Response events (Phase 4.4 - Chat Notifications)
  AI_RESPONSE_STARTED: 'ai.response.started',
  AI_RESPONSE_COMPLETED: 'ai.response.completed',
  AI_RESPONSE_ERROR: 'ai.response.error',
  
  // Module events
  MODULES_UPDATED: 'modules.updated',
  
  // Custom tables events (for AssistBuild)
  CUSTOM_TABLES_UPDATED: 'custom-tables.updated',
  SCHEMA_UPDATED: 'schema.updated',
  
  // Company events
  COMPANY_UPDATED: 'company.updated',
  
  // Settings events (Phase 4.3 - NEW)
  SETTINGS_USER_PREFERENCES_UPDATED: 'settings:user.preferences.updated',
  SETTINGS_USER_PROFILE_UPDATED: 'settings:user.profile.updated',
  SETTINGS_TENANT_UPDATED: 'settings:tenant.updated',
  SETTINGS_TEAM_MEMBER_CHANGED: 'settings:team.member.changed',
} as const;

// Type-safe channel keys
export type RealtimeChannel = typeof REALTIME_CHANNELS[keyof typeof REALTIME_CHANNELS];
