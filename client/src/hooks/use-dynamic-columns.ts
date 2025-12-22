import { useMemo } from "react";

interface DynamicColumn {
  fieldKey: string;
  label: string;
  type?: string;
}

interface ModuleConfig {
  config?: {
    ui?: {
      list?: {
        columns?: string[];
      };
    };
    // Support all field collection types
    leadFields?: Array<{ key: string; label: string; type?: string }>;
    customFields?: Array<{ key: string; label: string; type?: string }>;
    fields?: Array<{ key: string; label: string; type?: string }>;
    pipelineFields?: Array<{ key: string; label: string; type?: string }>;
    opportunityFields?: Array<{ key: string; label: string; type?: string }>;
    projectFields?: Array<{ key: string; label: string; type?: string }>;
    contactFields?: Array<{ key: string; label: string; type?: string }>;
    orderFields?: Array<{ key: string; label: string; type?: string }>;
    globalFields?: Array<{ key: string; label: string; type?: string }>;
  };
}

/**
 * Hook to extract and process dynamic columns from module configuration
 * Works universally across all modules
 * @param moduleConfig - The module configuration object
 * @param fallbackColumns - Default columns to use if no configuration exists
 * @returns Processed columns array with fieldKey, label, and type
 */
export function useDynamicColumns(
  moduleConfig: ModuleConfig | undefined,
  fallbackColumns: DynamicColumn[] = []
): DynamicColumn[] {
  return useMemo(() => {
    if (!moduleConfig?.config) {
      return fallbackColumns;
    }

    const config = moduleConfig.config;
    
    // Extract column keys from UI configuration
    const columnKeys = config.ui?.list?.columns || [];
    
    if (columnKeys.length === 0) {
      return fallbackColumns;
    }

    // Collect all field definitions from all possible locations
    const allFieldDefinitions = [
      ...(config.leadFields || []),
      ...(config.customFields || []),
      ...(config.fields || []),
      ...(config.pipelineFields || []),
      ...(config.opportunityFields || []),
      ...(config.projectFields || []),
      ...(config.contactFields || []),
      ...(config.orderFields || []),
      ...(config.globalFields || []),
    ];

    // Map column keys to full column objects with labels and types
    return columnKeys.map((key: string) => {
      const fieldDef = allFieldDefinitions.find((f: any) => f.key === key);
      return {
        fieldKey: key,
        label: fieldDef?.label || formatFieldLabel(key),
        type: fieldDef?.type,
      };
    });
  }, [moduleConfig, fallbackColumns]);
}

/**
 * Format field key to human-readable label
 * e.g., "firstName" -> "First Name", "customerName" -> "Customer Name"
 */
function formatFieldLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}
