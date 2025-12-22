import { ToolBase, type ToolManifest } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { costTemplates, costComponents } from '../../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import { z } from 'zod';

const laborRoleSchema = z.object({
  role: z.string().describe('Nome do papel (ex: Developer, Designer, Architect)'),
  hourlyRate: z.number().positive().describe('Taxa horária em EUR'),
  costRate: z.number().positive().optional().describe('Custo interno (opcional, default: 60% da taxa horária)'),
  description: z.string().optional().describe('Role description')
});

const materialItemSchema = z.object({
  name: z.string().describe('Nome do material/recurso'),
  unitCost: z.number().positive().describe('Custo unitário em EUR'),
  unit: z.string().optional().describe('Unidade (ex: licença, hora, unidade)'),
  description: z.string().optional().describe('Material description')
});

const inputSchema = z.object({
  name: z.string().describe('Nome do template (ex: "Desenvolvimento Web T&M")'),
  type: z.enum(['timeAndMaterials', 'fixedPrice', 'retainer']).describe('Tipo de template'),
  description: z.string().optional().describe('Template description'),
  laborRoles: z.array(laborRoleSchema).optional().describe('Roles de trabalho disponíveis'),
  materials: z.array(materialItemSchema).optional().describe('Materiais/recursos padrão'),
  overheadConfig: z.object({
    percentage: z.number().min(0).max(100).describe('Percentagem de overhead (0-100)'),
    includesProfit: z.boolean().optional().describe('Se overhead já inclui margem de lucro')
  }).optional().describe('Configuração de overhead'),
  profitMargin: z.number().min(0).max(100).optional().describe('Margem de lucro adicional (%)'),
  defaultDiscount: z.number().min(0).max(100).optional().describe('Desconto padrão (%)')
});

type CreateCostTemplateInput = z.infer<typeof inputSchema>;

export class CreateCostTemplateTool extends ToolBase<CreateCostTemplateInput, any> {
  manifest: ToolManifest = {
    name: 'create_cost_template',
    category: 'configuration',
    description: 'Creates a configurable quote template for Time&Materials, Fixed Price or Retainer with labor roles, materials and overhead',
    parameters: [
      { name: 'name', type: 'string', description: 'Template name (e.g.: "Web Development T&M")', required: true },
      { name: 'type', type: 'string', description: 'Type: timeAndMaterials, fixedPrice or retainer', required: true },
      { name: 'description', type: 'string', description: 'Template description', required: false },
      { name: 'laborRoles', type: 'array', description: 'Array de roles: [{role, hourlyRate, costRate?, description?}]', required: false },
      { name: 'materials', type: 'array', description: 'Array de materials: [{name, unitCost, unit?, description?}]', required: false },
      { name: 'overheadConfig', type: 'object', description: 'Overhead: {percentage, includesProfit?}', required: false },
      { name: 'profitMargin', type: 'number', description: 'Additional profit margin (%)', required: false },
      { name: 'defaultDiscount', type: 'number', description: 'Default discount (%)', required: false }
    ],
    outputSchema: z.object({
      success: z.boolean(),
      template: z.any().optional(),
      componentsCreated: z.number().optional(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: CreateCostTemplateInput,
    context: any,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    onProgress?.(10, `Creating template "${input.name}"...`);

    // Validate input with Zod
    const validated = inputSchema.parse(input);

    // Check if template with same name already exists
    const [existing] = await db
      .select()
      .from(costTemplates)
      .where(
        and(
          eq(costTemplates.tenantId, context.tenantId),
          eq(costTemplates.name, validated.name)
        )
      );

    if (existing) {
      return {
        success: false,
        message: `A template with the name "${validated.name}" already exists. Use another name or edit the existing one.`
      };
    }

    onProgress?.(30, 'Preparing template configuration...');

    // Build template config
    const templateConfig: any = {
      laborRoles: validated.laborRoles || [],
      materials: validated.materials || [],
      overhead: validated.overheadConfig || { percentage: 15, includesProfit: false },
      profitMargin: validated.profitMargin || 20,
      defaultDiscount: validated.defaultDiscount || 0
    };

    onProgress?.(50, 'Saving template to database...');

    // Create template
    const [newTemplate] = await db
      .insert(costTemplates)
      .values({
        tenantId: context.tenantId,
        name: validated.name,
        type: validated.type,
        description: validated.description || null,
        isActive: true,
        createdBy: context.userId
      })
      .returning();

    onProgress?.(70, 'Creating components (labor roles and materials)...');

    // Create labor components
    const laborComponents: any[] = [];
    if (validated.laborRoles && validated.laborRoles.length > 0) {
      for (const role of validated.laborRoles) {
        const costRate = role.costRate || (role.hourlyRate * 0.6); // Default: 60% do hourly rate
        
        laborComponents.push({
          templateId: newTemplate.id,
          tenantId: context.tenantId,
          name: role.role,
          type: 'labor',
          unit: 'hour',
          unitCost: costRate,
          unitPrice: role.hourlyRate,
          description: role.description || `Labor role: ${role.role}`,
          isActive: true
        });
      }
    }

    // Criar componentes de materials
    const materialComponents: any[] = [];
    if (validated.materials && validated.materials.length > 0) {
      for (const material of validated.materials) {
        materialComponents.push({
          templateId: newTemplate.id,
          tenantId: context.tenantId,
          name: material.name,
          type: 'material',
          unit: material.unit || 'unit',
          unitCost: material.unitCost,
          unitPrice: material.unitCost * 1.3, // Default markup: 30%
          description: material.description || `Material: ${material.name}`,
          isActive: true
        });
      }
    }

    const allComponents = [...laborComponents, ...materialComponents];
    let componentsCreated = 0;

    if (allComponents.length > 0) {
      const inserted = await db
        .insert(costComponents)
        .values(allComponents)
        .returning();
      
      componentsCreated = inserted.length;
    }

    onProgress?.(100, 'Template created successfully!');

    return {
      success: true,
      template: {
        id: newTemplate.id,
        name: newTemplate.name,
        type: newTemplate.type,
        description: newTemplate.description
      },
      componentsCreated,
      message: `✅ Template "${validated.name}" created with ${componentsCreated} components (${laborComponents.length} labor roles, ${materialComponents.length} materials). Config: ${templateConfig.overhead.percentage}% overhead, ${templateConfig.profitMargin}% profit margin.`
    };
  }
}
