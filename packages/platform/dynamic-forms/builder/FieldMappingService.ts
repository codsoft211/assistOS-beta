/**
 * Field Mapping Service
 * 
 * Uses AI (AssistBuild) to suggest intelligent field mappings between
 * form fields and business entity fields.
 * 
 * @example
 * ```typescript
 * const service = new FieldMappingService();
 * 
 * const suggestion = await service.suggestMapping({
 *   formContext: {
 *     targetModule: 'compras',
 *     targetEntity: 'supplier',
 *     formName: 'Supplier Onboarding'
 *   },
 *   field: {
 *     label: 'NIF',
 *     fieldType: 'text',
 *     helpText: 'Número de Identificação Fiscal'
 *   }
 * });
 * 
 * // Returns: { entityField: 'taxId', confidence: 0.95, reasoning: '...', alternatives: [...] }
 * ```
 */

import Anthropic from '@anthropic-ai/sdk';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface FormContext {
  targetModule?: string;
  targetEntity?: string;
  formName?: string;
  formDescription?: string;
}

export interface FieldInfo {
  label: string;
  fieldType: string;
  placeholder?: string;
  helpText?: string;
  validation?: any;
}

export interface MappingSuggestion {
  entityField: string;
  confidence: number;
  reasoning: string;
  alternatives: Array<{
    entityField: string;
    confidence: number;
    reasoning: string;
  }>;
  suggestedTransforms?: string[];
  suggestedValidation?: string;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Common Entity Schemas
// ═══════════════════════════════════════════════════════════════════════════════

const ENTITY_SCHEMAS: Record<string, Record<string, string>> = {
  supplier: {
    name: 'Company/Supplier name',
    legalName: 'Legal business name',
    taxId: 'Tax ID / NIF / VAT number',
    email: 'Primary email address',
    phone: 'Primary phone number',
    address: 'Street address',
    city: 'City',
    postalCode: 'Postal/ZIP code',
    country: 'Country',
    website: 'Website URL',
    contactPerson: 'Primary contact person name',
    contactEmail: 'Contact person email',
    contactPhone: 'Contact person phone',
    bankAccount: 'Bank account number / IBAN',
    paymentTerms: 'Payment terms (e.g., NET30)',
    category: 'Supplier category',
    notes: 'Additional notes',
  },
  client: {
    name: 'Client/Customer name',
    legalName: 'Legal business name',
    taxId: 'Tax ID / NIF / VAT number',
    email: 'Primary email address',
    phone: 'Primary phone number',
    address: 'Street address',
    city: 'City',
    postalCode: 'Postal/ZIP code',
    country: 'Country',
    website: 'Website URL',
    contactPerson: 'Primary contact person name',
    contactEmail: 'Contact person email',
    contactPhone: 'Contact person phone',
    billingAddress: 'Billing address',
    shippingAddress: 'Shipping address',
    creditLimit: 'Credit limit',
    paymentTerms: 'Payment terms',
    segment: 'Client segment',
    notes: 'Additional notes',
  },
  project: {
    name: 'Project name',
    description: 'Project description',
    clientId: 'Client reference',
    startDate: 'Start date',
    endDate: 'End date',
    budget: 'Project budget',
    status: 'Project status',
    priority: 'Priority level',
    projectManager: 'Project manager',
    team: 'Team members',
    notes: 'Project notes',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Main Service
// ═══════════════════════════════════════════════════════════════════════════════

export class FieldMappingService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  /**
   * Suggest field mapping using AI
   * 
   * @param formContext - Context about the form
   * @param field - Field to map
   * @returns Mapping suggestion with confidence
   */
  async suggestMapping(
    formContext: FormContext,
    field: FieldInfo
  ): Promise<MappingSuggestion> {
    try {
      console.log(`[FieldMapping] Suggesting mapping for field: ${field.label}`);

      // Build the prompt
      const prompt = this.buildMappingPrompt(formContext, field);

      // Call Claude
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 1024,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      // Parse response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from AI');
      }

      const suggestion = this.parseSuggestion(textContent.text);
      
      console.log(`[FieldMapping] Suggestion: ${suggestion.entityField} (${suggestion.confidence})`);
      return suggestion;
    } catch (error: any) {
      console.error('[FieldMapping] Suggestion failed:', error);
      
      // Fallback to rule-based mapping
      return this.fallbackMapping(formContext, field);
    }
  }

  /**
   * Suggest mappings for multiple fields at once (batch)
   * 
   * @param formContext - Context about the form
   * @param fields - Fields to map
   * @returns Array of mapping suggestions
   */
  async suggestMappingBatch(
    formContext: FormContext,
    fields: FieldInfo[]
  ): Promise<MappingSuggestion[]> {
    try {
      console.log(`[FieldMapping] Suggesting mappings for ${fields.length} fields`);

      // Build batch prompt
      const prompt = this.buildBatchMappingPrompt(formContext, fields);

      // Call Claude
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        temperature: 0.1,
        messages: [{
          role: 'user',
          content: prompt
        }]
      });

      // Parse response
      const textContent = response.content.find(c => c.type === 'text');
      if (!textContent || textContent.type !== 'text') {
        throw new Error('No text response from AI');
      }

      const suggestions = this.parseBatchSuggestions(textContent.text, fields);
      
      console.log(`[FieldMapping] Generated ${suggestions.length} suggestions`);
      return suggestions;
    } catch (error: any) {
      console.error('[FieldMapping] Batch suggestion failed:', error);
      
      // Fallback to individual rule-based mapping
      return fields.map(field => this.fallbackMapping(formContext, field));
    }
  }

  /**
   * Build AI prompt for single field mapping
   */
  private buildMappingPrompt(formContext: FormContext, field: FieldInfo): string {
    const entitySchema = formContext.targetEntity 
      ? ENTITY_SCHEMAS[formContext.targetEntity] 
      : null;

    return `You are an AI assistant helping to map form fields to database entity fields.

**Form Context:**
- Target Module: ${formContext.targetModule || 'unknown'}
- Target Entity: ${formContext.targetEntity || 'unknown'}
- Form Name: ${formContext.formName || 'N/A'}
- Form Description: ${formContext.formDescription || 'N/A'}

**Entity Schema (${formContext.targetEntity || 'unknown'}):**
${entitySchema ? Object.entries(entitySchema).map(([key, desc]) => `- ${key}: ${desc}`).join('\n') : 'No schema available'}

**Field to Map:**
- Label: "${field.label}"
- Type: ${field.fieldType}
${field.placeholder ? `- Placeholder: "${field.placeholder}"` : ''}
${field.helpText ? `- Help Text: "${field.helpText}"` : ''}
${field.validation ? `- Validation: ${JSON.stringify(field.validation)}` : ''}

**Task:**
Suggest the best entity field to map this form field to. Consider:
1. Field label and help text
2. Field type compatibility
3. Common naming patterns (e.g., "NIF" → taxId, "Email" → email)
4. Entity context

**Response Format (JSON):**
\`\`\`json
{
  "entityField": "fieldName",
  "confidence": 0.95,
  "reasoning": "Why this mapping makes sense",
  "alternatives": [
    { "entityField": "alternativeField", "confidence": 0.75, "reasoning": "Why this could work" }
  ],
  "suggestedTransforms": ["trim", "uppercase"],
  "suggestedValidation": "nif"
}
\`\`\`

Respond ONLY with valid JSON.`;
  }

  /**
   * Build AI prompt for batch field mapping
   */
  private buildBatchMappingPrompt(formContext: FormContext, fields: FieldInfo[]): string {
    const entitySchema = formContext.targetEntity 
      ? ENTITY_SCHEMAS[formContext.targetEntity] 
      : null;

    return `You are an AI assistant helping to map multiple form fields to database entity fields.

**Form Context:**
- Target Module: ${formContext.targetModule || 'unknown'}
- Target Entity: ${formContext.targetEntity || 'unknown'}
- Form Name: ${formContext.formName || 'N/A'}
- Form Description: ${formContext.formDescription || 'N/A'}

**Entity Schema (${formContext.targetEntity || 'unknown'}):**
${entitySchema ? Object.entries(entitySchema).map(([key, desc]) => `- ${key}: ${desc}`).join('\n') : 'No schema available'}

**Fields to Map:**
${fields.map((f, i) => `${i + 1}. Label: "${f.label}", Type: ${f.fieldType}${f.helpText ? `, Help: "${f.helpText}"` : ''}`).join('\n')}

**Task:**
For each field, suggest the best entity field mapping.

**Response Format (JSON array):**
\`\`\`json
[
  {
    "fieldLabel": "field label from input",
    "entityField": "mappedFieldName",
    "confidence": 0.95,
    "reasoning": "Brief explanation",
    "suggestedTransforms": ["trim"],
    "suggestedValidation": "email"
  }
]
\`\`\`

Respond ONLY with valid JSON array.`;
  }

  /**
   * Parse AI suggestion response
   */
  private parseSuggestion(responseText: string): MappingSuggestion {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                        responseText.match(/```\n([\s\S]*?)\n```/);
      
      const jsonText = jsonMatch ? jsonMatch[1] : responseText;
      const parsed = JSON.parse(jsonText.trim());

      return {
        entityField: parsed.entityField || 'unknown',
        confidence: parsed.confidence || 0.5,
        reasoning: parsed.reasoning || 'No reasoning provided',
        alternatives: parsed.alternatives || [],
        suggestedTransforms: parsed.suggestedTransforms,
        suggestedValidation: parsed.suggestedValidation,
      };
    } catch (error) {
      console.error('[FieldMapping] Failed to parse suggestion:', error);
      return {
        entityField: 'unknown',
        confidence: 0,
        reasoning: 'Failed to parse AI response',
        alternatives: [],
      };
    }
  }

  /**
   * Parse batch AI suggestions response
   */
  private parseBatchSuggestions(responseText: string, fields: FieldInfo[]): MappingSuggestion[] {
    try {
      // Extract JSON from markdown code blocks if present
      const jsonMatch = responseText.match(/```json\n([\s\S]*?)\n```/) || 
                        responseText.match(/```\n([\s\S]*?)\n```/);
      
      const jsonText = jsonMatch ? jsonMatch[1] : responseText;
      const parsed = JSON.parse(jsonText.trim());

      if (!Array.isArray(parsed)) {
        throw new Error('Expected JSON array');
      }

      return parsed.map(p => ({
        entityField: p.entityField || 'unknown',
        confidence: p.confidence || 0.5,
        reasoning: p.reasoning || 'No reasoning provided',
        alternatives: p.alternatives || [],
        suggestedTransforms: p.suggestedTransforms,
        suggestedValidation: p.suggestedValidation,
      }));
    } catch (error) {
      console.error('[FieldMapping] Failed to parse batch suggestions:', error);
      return fields.map(() => ({
        entityField: 'unknown',
        confidence: 0,
        reasoning: 'Failed to parse AI response',
        alternatives: [],
      }));
    }
  }

  /**
   * Fallback rule-based mapping when AI fails
   */
  private fallbackMapping(formContext: FormContext, field: FieldInfo): MappingSuggestion {
    const label = field.label.toLowerCase();

    // Simple rule-based mappings
    const rules: Record<string, string> = {
      'nif': 'taxId',
      'tax id': 'taxId',
      'vat': 'taxId',
      'email': 'email',
      'e-mail': 'email',
      'phone': 'phone',
      'telefone': 'phone',
      'address': 'address',
      'morada': 'address',
      'city': 'city',
      'cidade': 'city',
      'postal': 'postalCode',
      'zip': 'postalCode',
      'country': 'country',
      'país': 'country',
      'name': 'name',
      'nome': 'name',
      'company': 'name',
      'empresa': 'name',
      'website': 'website',
      'site': 'website',
      'iban': 'bankAccount',
      'bank account': 'bankAccount',
    };

    for (const [keyword, entityField] of Object.entries(rules)) {
      if (label.includes(keyword)) {
        return {
          entityField,
          confidence: 0.7,
          reasoning: `Rule-based match: "${keyword}" → ${entityField}`,
          alternatives: [],
        };
      }
    }

    // No match found
    return {
      entityField: 'customField',
      confidence: 0.3,
      reasoning: 'No automatic mapping found. Manual mapping required.',
      alternatives: [],
    };
  }
}
