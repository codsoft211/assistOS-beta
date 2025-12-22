/**
 * Tool Allowlists - Enforces separation between AssistME and AssistBuild
 * 
 * CRITICAL: AssistME handles operational tasks, AssistBuild handles platform configuration
 * 
 * Uses CATEGORY-BASED filtering based on actual tool registry categories.
 */

/**
 * AssistME Operational Categories
 * Tools in these categories handle daily business operations
 * 
 * These are the ACTUAL categories found in the tool registry.
 */
export const ASSISTME_OPERATIONAL_CATEGORIES = [
  'communication',     // WhatsApp, email, messaging
  'document_analysis',
  'discovery',         // Read-only discovery of tenant state (active modules, etc)
  'financial',
  'procurement',
  'logistics',
  'sales',
  'marketing',
  'accounting',
  'crm',
  'hr',
  'projects',
  'support',           // For future support tools
  'quality',           // For future quality tools
] as const;

/**
 * AssistBuild Configuration Categories
 * Tools in these categories handle ONLY platform configuration (tenant-level)
 * 
 * These are the ACTUAL categories found in the tool registry.
 */
export const ASSISTBUILD_CONFIGURATION_CATEGORIES = [
  // Core configuration
  'discovery',
  'configuration',
  'Configuration',      // Some tools use capitalized version
  'validation',
  'creation',
  
  // Module management
  'Activation',
  'Module Configuration',
  'Module Data',
  'Module Specific',
  
  // Integration & connectivity
  'Integrations',
  'Authentication',
  'Connectivity',
  'erp',
  'comunicacao',
  'pagamentos',
  
  // Organization
  'Organization Structure',
  
  // Advanced features
  'Advanced Data',
  'Status',
  
  // Data management
  'data-import',        // For CSV/Excel import tools
  
  // Future categories
  'sandbox',            // For sandbox validation tools
  'blueprints',         // For entity blueprints
  'schema_evolution',   // For migrations
  'system_config',      // For system configuration
  'quotes',             // Quote templates and configuration
] as const;

export type AssistMECategory = typeof ASSISTME_OPERATIONAL_CATEGORIES[number];
export type AssistBuildCategory = typeof ASSISTBUILD_CONFIGURATION_CATEGORIES[number];

/**
 * Check if a category belongs to AssistME
 */
export function isAssistMECategory(category: string): boolean {
  return ASSISTME_OPERATIONAL_CATEGORIES.includes(category as any);
}

/**
 * Check if a category belongs to AssistBuild
 */
export function isAssistBuildCategory(category: string): boolean {
  return ASSISTBUILD_CONFIGURATION_CATEGORIES.includes(category as any);
}

/**
 * Filter manifests to only include AssistME operational tools
 * Uses category-based filtering to dynamically include all operational tools
 */
export function filterAssistMETools<T extends { category?: string; name?: string }>(manifests: T[]): T[] {
  const filtered = manifests.filter(m => {
    if (!m.category) {
      console.warn(`[filterAssistMETools] Tool missing category, excluding:`, m.name || 'unknown');
      return false;
    }
    const isAllowed = isAssistMECategory(m.category);
    if (!isAllowed) {
      console.log(`[filterAssistMETools] Excluding tool with category '${m.category}':`, m.name || 'unknown');
    }
    return isAllowed;
  });
  
  console.log(`[filterAssistMETools] Filtered ${manifests.length} tools → ${filtered.length} operational tools`);
  return filtered;
}

/**
 * Filter manifests to only include AssistBuild configuration tools
 * Uses category-based filtering to dynamically include all configuration tools
 */
export function filterAssistBuildTools<T extends { category?: string; name?: string }>(manifests: T[]): T[] {
  const filtered = manifests.filter(m => {
    if (!m.category) {
      console.warn(`[filterAssistBuildTools] Tool missing category, excluding:`, m.name || 'unknown');
      return false;
    }
    const isAllowed = isAssistBuildCategory(m.category);
    if (!isAllowed) {
      console.log(`[filterAssistBuildTools] Excluding tool with category '${m.category}':`, m.name || 'unknown');
    }
    return isAllowed;
  });
  
  console.log(`[filterAssistBuildTools] Filtered ${manifests.length} tools → ${filtered.length} configuration tools`);
  return filtered;
}
