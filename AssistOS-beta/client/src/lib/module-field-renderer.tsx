import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import type { ReactNode } from "react";

/**
 * Standard field mappings used across modules
 * Maps configured field keys to actual Drizzle schema column names (camelCase)
 */
const STANDARD_FIELD_MAPPINGS: Record<string, string> = {
  // Lead Generation - Maps Portuguese config keys to Drizzle camelCase fields
  'numeroProposta': 'proposalNumber',
  'nome': 'contactName',
  'estado': 'status',
  'data': '_eventDateWithYear',  // Special composite field
  'numeroPax': 'numPax',
  'budgetTotal': 'budgetTotal',
  'fonte': 'leadSource',
  'owner': '_ownerName',  // Special field - needs user lookup
  
  // CRM / Contacts
  'nomeCompleto': 'fullName',
  'empresa': 'company',
  'cargo': 'position',
  'telefone': 'phone',
  'dataUltimoContacto': 'lastContactDate',
  
  // Projects
  'nomeProjeto': 'projectName',
  'cliente': 'client',
  'dataInicio': 'startDate',
  'dataFim': 'endDate',
  'valorContrato': 'contractValue',
  
  // Common fields
  'email': 'email',
  'status': 'status',
  'score': 'score',
  'source': 'leadSource',
  'createdAt': 'createdAt',
  'updatedAt': 'updatedAt',
};

/**
 * Standard badge variant mappings for status values
 */
const STATUS_BADGE_VARIANTS: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  // Lead statuses
  new: 'secondary',
  active: 'default',
  contacted: 'outline',
  qualified: 'default',
  nurturing: 'secondary',
  converted: 'default',
  lost: 'destructive',
  
  // Opportunity statuses
  open: 'default',
  in_progress: 'secondary',
  won: 'default',
  cancelled: 'destructive',
  
  // Client statuses
  Ativo: 'default',
  Inativo: 'secondary',
  
  // Order statuses
  Draft: 'secondary',
  Pending: 'outline',
  Confirmed: 'default',
  Shipped: 'default',
  Delivered: 'default',
  Cancelled: 'destructive',
  
  // Generic statuses
  pending: 'outline',
  completed: 'default',
  'in-progress': 'secondary',
  'on-hold': 'outline',
};

interface RenderOptions {
  /** Base path for entity detail links (e.g., '/lead-generation/leads') */
  detailPath?: string;
  /** Custom field mappings to override defaults */
  customFieldMap?: Record<string, string>;
  /** Custom badge variants to override defaults */
  customBadgeVariants?: Record<string, 'default' | 'secondary' | 'destructive' | 'outline'>;
}

/**
 * Universal field renderer for module tables
 * 
 * KEY DESIGN PRINCIPLES:
 * 1. Returns PRIMITIVES (string/number) when possible to preserve CSS alignment
 * 2. Returns React elements ONLY for complex cases (Badge, Link)
 * 3. NO data-testid attributes - caller applies them to TableCell parent
 * 4. Fully customizable via module-config (no hardcoded helpers in pages)
 * 
 * @param entity - The data entity to render (lead, contact, project, etc.)
 * @param fieldKey - The configured field key from module config
 * @param fieldType - The field type from module config (currency, date, auto_number, etc.)
 * @param options - Rendering options (paths, custom mappings, custom badge variants)
 * @returns Rendered value (primitive string/number or React element)
 */
export function renderModuleField(
  entity: any,
  fieldKey: string,
  fieldType?: string,
  options: RenderOptions = {}
): ReactNode {
  const { detailPath, customFieldMap = {}, customBadgeVariants = {} } = options;
  
  // Merge custom mappings with standard mappings
  const fieldMap = { ...STANDARD_FIELD_MAPPINGS, ...customFieldMap };
  const badgeVariants = { ...STATUS_BADGE_VARIANTS, ...customBadgeVariants };
  
  // Get actual database key
  const actualKey = fieldMap[fieldKey] || fieldKey;
  
  // Handle special composite/computed fields
  if (actualKey === '_eventDateWithYear') {
    const eventDate = entity.eventDate;
    const eventYear = entity.eventYear;
    if (eventDate) {
      try {
        return new Date(eventDate).toLocaleDateString('pt-PT');
      } catch {
        return eventYear ? String(eventYear) : '—';
      }
    }
    return eventYear ? String(eventYear) : '—';
  }
  
  if (actualKey === '_ownerName') {
    const ownerName = entity.ownerName || entity.owner?.name || entity.owner?.firstName;
    if (ownerName) {
      return ownerName;
    }
    return '—';
  }
  
  const value = entity[actualKey] !== undefined ? entity[actualKey] : entity[fieldKey];
  
  // Handle null/undefined - return primitive string
  if (value === null || value === undefined) {
    return '—';
  }
  
  // Priority 1: Render based on explicit type from config
  if (fieldType) {
    switch (fieldType) {
      case 'currency':
        return `€${Number(value).toFixed(2)}`;
      
      case 'percentage':
        return `${Number(value).toFixed(0)}%`;
      
      case 'date':
      case 'datetime':
        try {
          return new Date(value).toLocaleDateString('pt-PT');
        } catch {
          return String(value);
        }
      
      case 'auto_number':
        return <span className="font-medium font-mono">{String(value)}</span>;
      
      case 'status':
      case 'select':
        const variant = badgeVariants[value] || 'secondary';
        return <Badge variant={variant}>{String(value)}</Badge>;
      
      case 'multi_select':
      case 'tags':
        if (Array.isArray(value)) {
          return (
            <div className="flex gap-1 flex-wrap">
              {value.map((tag, i) => (
                <Badge key={i} variant="secondary" className="text-xs">
                  {String(tag)}
                </Badge>
              ))}
            </div>
          );
        }
        return String(value);
      
      case 'boolean':
        return value ? '✓' : '✗';
      
      case 'email':
        return (
          <a href={`mailto:${value}`} className="hover:underline text-primary">
            {String(value)}
          </a>
        );
      
      case 'url':
      case 'link':
        return (
          <a href={String(value)} target="_blank" rel="noopener noreferrer" className="hover:underline text-primary">
            {String(value)}
          </a>
        );
      
      case 'relation':
      case 'reference':
        if (detailPath && entity.id) {
          return (
            <Link href={`${detailPath}/${entity.id}`}>
              <a className="hover:underline font-medium">{String(value)}</a>
            </Link>
          );
        }
        return <span className="font-medium">{String(value)}</span>;
      
      case 'computed':
        if (typeof value === 'object') {
          return JSON.stringify(value);
        }
        return String(value);
      
      case 'number':
      case 'integer':
      case 'decimal':
        return String(value);
      
      default:
        // For unknown types, continue to heuristic rendering
        break;
    }
  }
  
  // Priority 2: Heuristic rendering based on field key patterns
  switch (true) {
    // Primary identifier with link
    case fieldKey === 'numeroProposta' || fieldKey === 'email' || fieldKey === 'id':
      if (detailPath && entity.id) {
        return (
          <Link href={`${detailPath}/${entity.id}`}>
            <a className="hover:underline font-medium">{String(value)}</a>
          </Link>
        );
      }
      return <span className="font-medium">{String(value)}</span>;
    
    // Name fields - combine firstName/lastName if available
    case fieldKey === 'nome' || fieldKey === 'name' || fieldKey === 'nomeCompleto':
      const fullName = (entity.firstName || entity.lastName)
        ? `${entity.firstName || ''} ${entity.lastName || ''}`.trim()
        : String(value);
      return fullName;
    
    // Status fields - render as badge with variant lookup
    case fieldKey === 'estado' || fieldKey === 'status':
      const statusVariant = badgeVariants[value] || 'secondary';
      return <Badge variant={statusVariant}>{String(value)}</Badge>;
    
    // Score fields - return primitive number, let caller style
    case fieldKey === 'score':
      return Number(value);
    
    // Currency fields - return primitive string with euro symbol
    case fieldKey.includes('budget') || 
         fieldKey.includes('Budget') || 
         fieldKey.includes('valor') ||
         fieldKey.includes('Valor') ||
         fieldKey.includes('value') ||
         fieldKey.includes('Value') ||
         fieldKey.includes('price') ||
         fieldKey.includes('Price'):
      return `€${Number(value).toFixed(2)}`;
    
    // Percentage fields - return primitive string
    case fieldKey.includes('probability') ||
         fieldKey.includes('Probability') ||
         fieldKey.includes('percent') ||
         fieldKey.includes('Percent'):
      return `${Number(value).toFixed(0)}%`;
    
    // Date fields - return primitive date string
    case fieldKey === 'data' || 
         fieldKey.includes('Date') || 
         fieldKey.includes('date') ||
         fieldKey.toLowerCase().includes('data'):
      try {
        return new Date(value).toLocaleDateString('pt-PT');
      } catch {
        return String(value);
      }
    
    // Source/Fonte fields - return capitalized string
    case fieldKey === 'fonte' || fieldKey === 'source':
      return String(value).replace('_', ' ');
    
    // Owner/User fields
    case fieldKey === 'owner':
      return String(value);
    
    // Boolean fields - return symbols
    case typeof value === 'boolean':
      return value ? '✓' : '✗';
    
    // Number fields - return primitive
    case typeof value === 'number':
      return value;
    
    // Default: return as primitive string
    default:
      return String(value);
  }
}

/**
 * Get appropriate color class for score display
 * Exported for use in TableCell wrappers
 */
export function getScoreColorClass(score: number): string {
  if (score >= 70) return 'text-green-600 font-bold';
  if (score >= 40) return 'text-yellow-600 font-semibold';
  return 'text-red-600';
}
