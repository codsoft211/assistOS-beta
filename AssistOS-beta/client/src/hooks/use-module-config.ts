import { useQuery } from "@tanstack/react-query";

/**
 * Module configuration structure matching useDynamicColumns expectations
 */
export interface ModuleConfigResponse {
  success: boolean;
  config: {
    ui?: {
      list?: {
        columns?: string[];
      };
    };
    leadFields?: Array<{ key: string; label: string; type?: string }>;
    customFields?: Array<{ key: string; label: string; type?: string }>;
    fields?: Array<{ key: string; label: string; type?: string }>;
    opportunityFields?: Array<{ key: string; label: string; type?: string }>;
    clientFields?: Array<{ key: string; label: string; type?: string }>;
    orderFields?: Array<{ key: string; label: string; type?: string }>;
    projectFields?: Array<{ key: string; label: string; type?: string }>;
    globalFields?: Array<{ key: string; label: string; type?: string }>;
  };
  moduleId: string;
  isActive: boolean;
}

/**
 * Hook to fetch module configuration from backend
 * @param moduleId - The module ID (e.g., 'lead-generation', 'crm', 'projects')
 * @returns Module configuration including UI settings, fields, and metadata
 */
export function useModuleConfig(moduleId: string) {
  return useQuery<ModuleConfigResponse>({
    queryKey: [`/api/modules/${moduleId}/config`],
    enabled: !!moduleId,
    retry: false,
    // TanStack Query v5 - handle errors in component via isError/error
  });
}
