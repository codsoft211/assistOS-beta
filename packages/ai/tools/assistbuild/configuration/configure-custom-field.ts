import { ToolBase, type ToolManifest } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { globalCustomFields, insertGlobalCustomFieldSchema } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';

interface ConfigureCustomFieldInput {
  fieldKey: string;
  displayName: string;
  fieldType: 'text' | 'number' | 'date' | 'select' | 'multi_select' | 'auto_number' | 'currency' | 'computed' | 'text_multiline' | 'boolean';
  description?: string;
  options?: Array<{ value: string; label: string; color?: string }>;
  required?: boolean;
  unique?: boolean;
  searchable?: boolean;
  defaultValue?: any;
  config?: Record<string, any>;
}

export class ConfigureCustomFieldTool extends ToolBase<ConfigureCustomFieldInput, any> {
  manifest: ToolManifest = {
    name: 'configure_custom_field',
    category: 'configuration',
    description: 'Creates or updates a global custom field that can be used in leads, clients, projects, etc. Supports various types: text, number, date, dropdown (select), auto-number, currency, and more.',
    parameters: [
      { name: 'fieldKey', type: 'string', description: 'Unique field key (e.g.: lead_score, annual_revenue, industry)', required: true },
      { name: 'displayName', type: 'string', description: 'Visible field name (e.g.: Lead Score, Annual Revenue)', required: true },
      { name: 'fieldType', type: 'string', description: 'Field type: text, number, date, select, multi_select, boolean, currency, text_multiline', required: true },
      { name: 'description', type: 'string', description: 'Field description', required: false },
      { 
        name: 'options', 
        type: 'array', 
        description: 'Options for select/multi_select fields', 
        required: false,
        items: {
          type: 'object',
          properties: {
            value: { type: 'string', description: 'Option value' },
            label: { type: 'string', description: 'Display label' },
            color: { type: 'string', description: 'Optional color code' }
          },
          required: ['value', 'label']
        }
      },
      { name: 'required', type: 'boolean', description: 'Required field?', required: false },
      { name: 'unique', type: 'boolean', description: 'Unique value?', required: false },
      { name: 'searchable', type: 'boolean', description: 'Searchable field?', required: false },
      { name: 'defaultValue', type: 'object', description: 'Default value', required: false },
      { name: 'config', type: 'object', description: 'Additional type-specific configurations', required: false }
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false
  };

  protected async executeInternal(
    input: ConfigureCustomFieldInput,
    context: any
  ): Promise<any> {
    try {
      // Check if field already exists
      const [existing] = await db
        .select()
        .from(globalCustomFields)
        .where(
          and(
            eq(globalCustomFields.tenantId, context.tenantId),
            eq(globalCustomFields.environment, context.environment),
            eq(globalCustomFields.fieldKey, input.fieldKey)
          )
        )
        .limit(1);

      if (existing) {
        // Update existing field
        const [updated] = await db
          .update(globalCustomFields)
          .set({
            displayName: input.displayName,
            description: input.description,
            fieldType: input.fieldType,
            config: {
              options: input.options || undefined,
              defaultValue: input.defaultValue || undefined,
              ...(input.config || {})
            } as any,
            isRequired: input.required || false,
            isUnique: input.unique || false,
            isSearchable: input.searchable !== undefined ? input.searchable : true,
            updatedAt: new Date(),
            updatedBy: context.userId
          })
          .where(eq(globalCustomFields.id, existing.id))
          .returning();

        return {
          success: true,
          action: 'updated',
          field: updated,
          message: `Custom field "${input.displayName}" updated successfully`
        };
      }

      // Create new field
      const fieldData = insertGlobalCustomFieldSchema.parse({
        tenantId: context.tenantId,
        environment: context.environment,
        fieldKey: input.fieldKey,
        displayName: input.displayName,
        description: input.description,
        fieldType: input.fieldType,
        config: {
          options: input.options || undefined,
          defaultValue: input.defaultValue || undefined,
          ...(input.config || {})
        } as any,
        isRequired: input.required || false,
        isUnique: input.unique || false,
        isSearchable: input.searchable !== undefined ? input.searchable : true,
        isVisible: true,
        isDeleted: false,
        createdBy: context.userId,
        updatedBy: context.userId
      });

      const [newField] = await db
        .insert(globalCustomFields)
        .values([fieldData])
        .returning();

      return {
        success: true,
        action: 'created',
        field: newField,
          message: `Custom field "${input.displayName}" created successfully`
      };
    } catch (error: any) {
      console.error('[ConfigureCustomField] Error:', error);
      return {
        success: false,
        error: error.message || 'Error configuring custom field'
      };
    }
  }
}
