import { ToolBase, type ToolManifest } from '../../kernel';
import { toolRegistry } from '../../kernel';
import { z } from 'zod';

const inputSchema = z.object({
  naturalLanguageRequest: z.string().describe('Natural language text describing the desired template'),
  templateName: z.string().optional().describe('Template name (auto-generated if not provided)')
});

type ConfigureTemplateFromTextInput = z.infer<typeof inputSchema>;

/**
 * Tool that uses AI to extract requirements from natural language text and create template automatically
 * 
 * Example:
 * Input: "I need a template for web development. 
 *         We have developers at 45€/h, designers at 35€/h, and project managers at 55€/h.
 *         Overhead of 18% and margin of 25%."
 * 
 * Output: Template configured with automatically extracted roles
 */
export class ConfigureTemplateFromTextTool extends ToolBase<ConfigureTemplateFromTextInput, any> {
  manifest: ToolManifest = {
    name: 'configure_template_from_text',
    category: 'configuration',
    description: 'Creates a quote template automatically from natural language text using AI. Extracts labor roles, rates, overhead and margins from the provided text.',
    parameters: [
      { 
        name: 'naturalLanguageRequest', 
        type: 'string', 
        description: 'Text describing the template (e.g.: "Template for consulting with senior consultants at 80€/h and junior at 45€/h, overhead 20%")', 
        required: true 
      },
      { 
        name: 'templateName', 
        type: 'string', 
        description: 'Template name (optional - will be auto-generated if not provided)', 
        required: false 
      }
    ],
    outputSchema: z.object({
      success: z.boolean(),
      extractedRequirements: z.any().optional(),
      template: z.any().optional(),
      message: z.string()
    }),
    requiresAuth: true,
    progressSupport: true
  };

  protected async executeInternal(
    input: ConfigureTemplateFromTextInput,
    context: any,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    onProgress?.(10, '🧠 Analyzing text with AI...');

    // Validate input
    const validated = inputSchema.parse(input);

    // Step 1: Use extract_quote_requirements to extract requirements
    onProgress?.(30, '📋 Extracting structured requirements...');

    const extractTool = toolRegistry.get('extract_quote_requirements');
    if (!extractTool) {
      return {
        success: false,
        message: 'Tool extract_quote_requirements not found. Check if it is registered.'
      };
    }

    const extractResult = await extractTool.execute(
      { requestText: validated.naturalLanguageRequest },
      context
    );

    if (!extractResult.success || !extractResult.data) {
      return {
        success: false,
        message: `Failed to extract requirements: ${extractResult.error?.message || 'Unknown error'}`
      };
    }

    const requirements = extractResult.data.requirements;
    onProgress?.(50, `✅ Requirements extracted: ${requirements.labor?.roles?.length || 0} roles identified`);

    // Step 2: Map requirements to create_cost_template format
    onProgress?.(60, '🔧 Configuring template...');

    const laborRoles = requirements.labor?.roles?.map((role: any) => ({
      role: role.title,
      hourlyRate: role.rate,
      description: role.description || undefined
    })) || [];

    const materials = requirements.materials?.map((mat: any) => ({
      name: mat.name,
      unitCost: mat.estimatedCost || mat.cost || 0,
      unit: mat.quantity ? 'unit' : undefined,
      description: mat.description || undefined
    })) || [];

    // Determine template type
    let templateType: 'timeAndMaterials' | 'fixedPrice' | 'retainer' = 'timeAndMaterials';
    const businessModel = requirements.businessModel?.toLowerCase() || '';
    if (businessModel.includes('fixed') || businessModel.includes('fixo')) {
      templateType = 'fixedPrice';
    } else if (businessModel.includes('retainer') || businessModel.includes('retenção')) {
      templateType = 'retainer';
    }

    // Auto-generate name if not provided
    const templateName = validated.templateName || 
      `${requirements.projectTitle || 'Template'} - ${new Date().toLocaleDateString('en-US')}`;

    onProgress?.(70, `💾 Creating template "${templateName}"...`);

    // Step 3: Extract financial values or use defaults
    const overhead = requirements.budget?.overhead ?? 15; // Default: 15%
    const profitMargin = requirements.budget?.profitMargin ?? 20; // Default: 20%
    const discount = requirements.budget?.discount ?? 0; // Default: 0%

    // Step 4: Create template using create_cost_template
    const createTool = toolRegistry.get('create_cost_template');
    if (!createTool) {
      return {
        success: false,
        message: 'Tool create_cost_template not found. Check if it is registered.'
      };
    }

    const createResult = await createTool.execute(
      {
        name: templateName,
        type: templateType,
        description: requirements.projectDescription || undefined,
        laborRoles,
        materials,
        overheadConfig: {
          percentage: overhead,
          includesProfit: false
        },
        profitMargin: profitMargin,
        defaultDiscount: discount
      },
      context,
      (progress, msg) => onProgress?.(70 + (progress * 0.3), msg)
    );

    // Check BOTH success flags: envelope AND application result
    if (!createResult.success || !createResult.data?.success) {
      return {
        success: false,
        extractedRequirements: requirements,
        message: createResult.data?.message || createResult.error?.message || 'Unknown error'
      };
    }

    onProgress?.(100, '✅ Template configured successfully!');

    return {
      success: true,
      extractedRequirements: {
        projectTitle: requirements.projectTitle,
        businessModel: requirements.businessModel,
        laborRolesCount: laborRoles.length,
        materialsCount: materials.length
      },
      template: createResult.data?.template,
      message: `✅ Template "${templateName}" created automatically from text! ${laborRoles.length} labor roles and ${materials.length} materials configured.`
    };
  }
}
