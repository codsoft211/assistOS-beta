import { ToolBase } from '../../kernel/base';
import type { ToolManifest, ToolExecutionContext } from '../../kernel/types';
import { z } from 'zod';
import Anthropic from '@anthropic-ai/sdk';

const inputSchema = z.object({
  text: z.string().describe('Natural language text of the request (email, message, description)'),
  context: z.object({
    customerName: z.string().optional(),
    customerEmail: z.string().optional(),
    existingQuoteId: z.string().optional(),
  }).optional().describe('Contexto adicional do pedido')
});

const outputSchema = z.object({
  projectName: z.string().describe('Nome do projeto identificado'),
  projectDescription: z.string().describe('Detailed project description'),
  businessModel: z.enum(['time_materials', 'fixed_price', 'retainer', 'hybrid', 'unknown'])
    .describe('Modelo de negócio identificado'),
  confidence: z.number().min(0).max(1).describe('Confiança na classificação (0-1)'),
  requirements: z.object({
    labor: z.array(z.object({
      role: z.string().describe('Papel/função (ex: Developer, Designer)'),
      hours: z.number().optional().describe('Horas estimadas'),
      description: z.string().describe('Work description')
    })).describe('Labor requirements'),
    materials: z.array(z.object({
      item: z.string().describe('Required item/material'),
      quantity: z.number().optional().describe('Estimated quantity'),
      description: z.string().describe('Material description')
    })).describe('Materiais/recursos necessários'),
    deliverables: z.array(z.string()).describe('Entregáveis identificados'),
    timeline: z.object({
      duration: z.number().optional().describe('Duração em dias/semanas'),
      unit: z.enum(['days', 'weeks', 'months']).optional(),
      deadline: z.string().optional().describe('Prazo específico mencionado')
    }).optional().describe('Prazos identificados'),
    budget: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().default('EUR'),
      overhead: z.number().optional().describe('Percentagem de overhead mencionada'),
      profitMargin: z.number().optional().describe('Percentagem de margem de lucro mencionada'),
      discount: z.number().optional().describe('Percentagem de desconto mencionada')
    }).optional().describe('Orçamento mencionado'),
    constraints: z.array(z.string()).describe('Restrições e condições especiais'),
  }).describe('Requisitos estruturados extraídos'),
  suggestedTemplateId: z.string().optional().describe('ID do template recomendado'),
  rawExtraction: z.record(z.any()).optional().describe('Dados brutos da extração para auditoria (opcional)')
});

export class ExtractQuoteRequirementsTool extends ToolBase<z.infer<typeof inputSchema>, z.infer<typeof outputSchema>> {
  manifest: ToolManifest = {
    name: 'extract_quote_requirements',
    category: 'creation',
    description: 'Extracts structured requirements from natural language text (emails, messages, descriptions) for quote creation. Uses LLM to identify: business model, labor, materials, timelines, budget, and recommends appropriate template.',
    parameters: [
      { 
        name: 'text', 
        type: 'string', 
        required: true, 
        description: 'Natural language text of the quote request',
        schema: z.string()
      },
      { 
        name: 'context', 
        type: 'object', 
        required: false, 
        description: 'Contexto adicional (cliente, quote existente)',
        schema: z.object({
          customerName: z.string().optional(),
          customerEmail: z.string().optional(),
          existingQuoteId: z.string().optional(),
        }).optional()
      }
    ],
    outputSchema,
    requiresAuth: true,
    progressSupport: true
  };

  private anthropic: Anthropic;

  constructor() {
    super();
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY
    });
  }

  protected async executeInternal(
    input: z.infer<typeof inputSchema>,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<z.infer<typeof outputSchema>> {
    onProgress?.(10, '🔍 Analyzing request text...');

    const systemPrompt = `You are an expert in requirements analysis for quotes/budgets.
Your task is to extract structured information from quote requests in natural language.

BUSINESS MODELS:
- time_materials: Charged by hours worked (e.g.: "develop feature X")
- fixed_price: Fixed price for complete project (e.g.: "create website for €5000")
- retainer: Recurring monthly payment (e.g.: "monthly maintenance")
- hybrid: Combination of models (e.g.: "initial setup + monthly maintenance")
- unknown: Cannot identify

LABOR REQUIREMENTS:
Identify mentioned roles/functions:
- Developer, Designer, Project Manager, Consultant, etc.
- Estimate hours if mentioned or inferable
- Describe the work for each role

MATERIALS:
Identify necessary resources:
- Software, hardware, services, licenses, etc.
- Quantities if mentioned

FINANCIAL VALUES:
Extract mentioned financial values:
- Overhead/indirect costs (e.g.: "18% overhead", "15% indirect costs")
- Profit margin (e.g.: "25% margin", "20% profit margin")
- Discount (e.g.: "10% discount", "5% discount")
- Minimum and maximum budget values

BE SPECIFIC AND CONSERVATIVE:
- Prefer "unknown" if not certain
- Do not invent information that is not in the text
- Use low confidence (<0.5) if there is ambiguity
- Capture ALL constraints and special conditions

OUTPUT FORMAT: Structured JSON according to the provided schema.`;

    try {
      onProgress?.(30, '🤖 Consulting Claude Sonnet 4.0...');

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 4096,
        temperature: 0.2, // Low for precise extraction
        system: systemPrompt,
        messages: [
          {
            role: 'user',
            content: `REQUEST TEXT:
${input.text}

${input.context ? `
ADDITIONAL CONTEXT:
- Customer: ${input.context.customerName || 'N/A'}
- Email: ${input.context.customerEmail || 'N/A'}
- Existing quote: ${input.context.existingQuoteId || 'New request'}
` : ''}

Analyze the text and extract structured requirements in JSON format according to schema:
{
  "projectName": string,
  "projectDescription": string,
  "businessModel": "time_materials" | "fixed_price" | "retainer" | "hybrid" | "unknown",
  "confidence": number (0-1),
  "requirements": {
    "labor": [{ "role": string, "hours": number?, "description": string }],
    "materials": [{ "item": string, "quantity": number?, "description": string }],
    "deliverables": string[],
    "timeline": { "duration": number?, "unit": "days"|"weeks"|"months", "deadline": string? }?,
    "budget": { "min": number?, "max": number?, "currency": "EUR", "overhead": number?, "profitMargin": number?, "discount": number? }?,
    "constraints": string[]
  },
  "suggestedTemplateId": string?,
  "rawExtraction": object
}

RETURN ONLY THE JSON, WITHOUT EXPLANATIONS.`
          }
        ]
      });

      onProgress?.(70, '📊 Processing response...');

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      let jsonText = content.text.trim();
      
      // Remove markdown code blocks if present
      if (jsonText.startsWith('```json')) {
        jsonText = jsonText.replace(/^```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonText.startsWith('```')) {
        jsonText = jsonText.replace(/^```\s*/, '').replace(/\s*```$/, '');
      }

      const extracted = JSON.parse(jsonText);

      onProgress?.(90, '✅ Extraction complete!');

      // Validate output schema
      const result = outputSchema.parse(extracted);

      console.log('[ExtractQuoteRequirementsTool] Successfully extracted requirements:', {
        projectName: result.projectName,
        businessModel: result.businessModel,
        confidence: result.confidence,
        laborItems: result.requirements.labor.length,
        materialItems: result.requirements.materials.length,
        deliverables: result.requirements.deliverables.length
      });

      onProgress?.(100, '🎯 Requirements extracted successfully!');

      return result;

    } catch (error) {
      console.error('[ExtractQuoteRequirementsTool] Error:', error);
      
      if (error instanceof z.ZodError) {
        throw new Error(`Schema validation failed: ${error.errors.map(e => `${e.path.join('.')}: ${e.message}`).join(', ')}`);
      }
      
      if (error instanceof SyntaxError) {
        throw new Error('Failed to parse Claude response as JSON. LLM may have returned invalid format.');
      }

      throw error;
    }
  }
}
