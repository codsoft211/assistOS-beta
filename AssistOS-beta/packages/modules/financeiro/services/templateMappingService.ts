import { z } from 'zod';

export const QuoteRequirementsSchema = z.object({
  projectName: z.string(),
  projectDescription: z.string(),
  businessModel: z.enum(['time_materials', 'fixed_price', 'retainer', 'hybrid', 'unknown']),
  confidence: z.number().min(0).max(1),
  requirements: z.object({
    labor: z.array(z.object({
      role: z.string(),
      hours: z.number().optional(),
      description: z.string()
    })),
    materials: z.array(z.object({
      item: z.string(),
      quantity: z.number().optional(),
      description: z.string()
    })),
    deliverables: z.array(z.string()),
    timeline: z.object({
      duration: z.number().optional(),
      unit: z.enum(['days', 'weeks', 'months']).optional(),
      deadline: z.string().optional()
    }).optional(),
    budget: z.object({
      min: z.number().optional(),
      max: z.number().optional(),
      currency: z.string().default('EUR')
    }).optional(),
    constraints: z.array(z.string()),
  }),
  suggestedTemplateId: z.string().optional(),
  rawExtraction: z.record(z.any()).optional().default({})
});

export type QuoteRequirements = z.infer<typeof QuoteRequirementsSchema>;

export interface TemplateMappingResult {
  template: {
    id: string;
    name: string;
    type: string;
    description: string | null;
  };
  matchScore: number;
  confidence: 'high' | 'medium' | 'low';
  reasons: string[];
  alternatives: Array<{
    template: {
      id: string;
      name: string;
      type: string;
    };
    matchScore: number;
  }>;
}

export class TemplateMappingService {
  /**
   * Mapeia requisitos extraídos para o template mais apropriado
   * @param requirements Requisitos extraídos do texto
   * @param templates Lista de templates ativos disponíveis (deve vir do module storage)
   */
  static mapRequirementsToTemplate(
    requirements: QuoteRequirements,
    templates: Array<{
      id: string;
      name: string;
      type: string;
      description: string | null;
      isActive: boolean;
    }>
  ): TemplateMappingResult {
    console.log('[TemplateMappingService] Mapping requirements to template', {
      templatesCount: templates.length,
      businessModel: requirements.businessModel,
      confidence: requirements.confidence
    });

    if (templates.length === 0) {
      throw new Error('No active cost templates provided. Please create at least one template first.');
    }

    // 2. Calcular score de match para cada template
    const scored = templates.map((template: any) => {
      const score = this.calculateMatchScore(template, requirements);
      return {
        template,
        score
      };
    });

    // 3. Ordenar por score (descendente)
    scored.sort((a: any, b: any) => b.score - a.score);

    const best = scored[0];
    const alternatives = scored.slice(1, 4).map((s: any) => ({
      template: {
        id: s.template.id,
        name: s.template.name,
        type: s.template.type
      },
      matchScore: s.score
    }));

    // 4. Determinar confiança
    const confidence = this.determineConfidence(best.score, requirements.confidence);

    // 5. Gerar razões do match
    const reasons = this.generateMatchReasons(best.template, requirements);

    console.log('[TemplateMappingService] Selected template', {
      templateId: best.template.id,
      templateName: best.template.name,
      matchScore: best.score,
      confidence
    });

    return {
      template: {
        id: best.template.id,
        name: best.template.name,
        type: best.template.type,
        description: best.template.description
      },
      matchScore: best.score,
      confidence,
      reasons,
      alternatives
    };
  }

  /**
   * Calcula score de match entre template e requisitos (0-100)
   */
  private static calculateMatchScore(
    template: any,
    requirements: QuoteRequirements
  ): number {
    let score = 0;

    // 1. Business Model Match (peso: 40 pontos)
    // Map extracted business model to Fase 1 template type enums
    const modelMapping: Record<string, string[]> = {
      'time_materials': ['timeAndMaterials', 'timeandmaterials', 'time_materials', 't&m', 'hourly'],
      'fixed_price': ['fixedPrice', 'fixedprice', 'fixed_price', 'fixed', 'projeto_fechado'],
      'retainer': ['retainer', 'avenca', 'monthly', 'subscription'],
      'hybrid': ['hybrid', 'misto']
    };

    const templateType = template.type.toLowerCase();
    const requiredModel = requirements.businessModel;

    if (requiredModel !== 'unknown') {
      const validTypes = modelMapping[requiredModel] || [];
      if (validTypes.some(t => templateType.includes(t.toLowerCase()))) {
        score += 40;
      } else {
        // Penalidade por mismatch de modelo
        score -= 10;
      }
    } else {
      // Se unknown, usa default baseado em labor hours
      const hasHourEstimates = requirements.requirements.labor.some(l => l.hours !== undefined);
      if (hasHourEstimates && modelMapping.time_materials.some(t => templateType.includes(t.toLowerCase()))) {
        score += 20; // Menor peso porque é inferência
      } else if (!hasHourEstimates && modelMapping.fixed_price.some(t => templateType.includes(t.toLowerCase()))) {
        score += 20;
      }
    }

    // 2. Labor Complexity Match (peso: 25 pontos)
    const laborCount = requirements.requirements.labor.length;
    
    if (laborCount === 0) {
      // Sem labor = provavelmente só materiais/produtos
      if (templateType.includes('fixed') || templateType.includes('produto')) {
        score += 25;
      }
    } else if (laborCount <= 2) {
      // Projeto simples
      score += 15;
    } else if (laborCount <= 5) {
      // Projeto médio
      score += 25;
    } else {
      // Projeto complexo
      score += 20;
    }

    // 3. Timeline Match (peso: 15 pontos)
    if (requirements.requirements.timeline) {
      const { duration, unit } = requirements.requirements.timeline;
      
      if (duration && unit) {
        const daysEstimate = this.convertToDays(duration, unit);
        
        // Retainer = projetos longos recorrentes
        if (daysEstimate > 90 && templateType.includes('retainer')) {
          score += 15;
        }
        // Fixed Price = projetos curtos/médios (usando enum correto)
        else if (daysEstimate <= 90 && (templateType.includes('fixed') || templateType.includes('fixedprice'))) {
          score += 15;
        }
        // T&M = qualquer duração (usando enum correto)
        else if (templateType.includes('time') || templateType.includes('timeandmaterials')) {
          score += 10;
        }
      }
    }

    // 4. Budget Clarity Match (peso: 10 pontos)
    if (requirements.requirements.budget) {
      const { min, max } = requirements.requirements.budget;
      
      // Budget definido = Fixed Price é bom match (usando enum correto)
      if (min !== undefined || max !== undefined) {
        if (templateType.includes('fixed') || templateType.includes('fixedprice')) {
          score += 10;
        } else {
          score += 5;
        }
      }
    } else {
      // Sem budget = T&M é melhor (usando enum correto)
      if (templateType.includes('time') || templateType.includes('timeandmaterials')) {
        score += 10;
      }
    }

    // 5. Materials Presence (peso: 10 pontos)
    const materialsCount = requirements.requirements.materials.length;
    
    if (materialsCount > 0) {
      // Templates que suportam materiais
      if (templateType.includes('hybrid') || templateType.includes('fixed')) {
        score += 10;
      } else {
        score += 5;
      }
    }

    // Normalizar score para 0-100
    return Math.max(0, Math.min(100, score));
  }

  /**
   * Converte duração para dias
   */
  private static convertToDays(duration: number, unit: 'days' | 'weeks' | 'months'): number {
    switch (unit) {
      case 'days':
        return duration;
      case 'weeks':
        return duration * 7;
      case 'months':
        return duration * 30;
      default:
        return duration;
    }
  }

  /**
   * Determina nível de confiança baseado em score e confidence da extração
   */
  private static determineConfidence(
    matchScore: number,
    extractionConfidence: number
  ): 'high' | 'medium' | 'low' {
    // Combinar ambos os fatores
    const combined = (matchScore / 100) * extractionConfidence;

    if (combined >= 0.7) return 'high';
    if (combined >= 0.4) return 'medium';
    return 'low';
  }

  /**
   * Gera razões human-readable para o match
   */
  private static generateMatchReasons(
    template: any,
    requirements: QuoteRequirements
  ): string[] {
    const reasons: string[] = [];
    const templateType = template.type.toLowerCase();

    // Business Model
    if (requirements.businessModel !== 'unknown') {
      const modelLabels: Record<string, string> = {
        'time_materials': 'Time & Materials',
        'fixed_price': 'Preço Fixo',
        'retainer': 'Avença/Recorrente',
        'hybrid': 'Modelo Híbrido'
      };
      
      reasons.push(`Modelo de negócio identificado: ${modelLabels[requirements.businessModel]}`);
    }

    // Labor
    if (requirements.requirements.labor.length > 0) {
      const roles = requirements.requirements.labor.map(l => l.role).join(', ');
      reasons.push(`Requisitos de mão-de-obra: ${roles}`);
      
      const hasHours = requirements.requirements.labor.some(l => l.hours !== undefined);
      if (hasHours) {
        reasons.push('Horas estimadas fornecidas - bom para Time & Materials');
      }
    }

    // Timeline
    if (requirements.requirements.timeline?.duration) {
      const { duration, unit } = requirements.requirements.timeline;
      reasons.push(`Prazo estimado: ${duration} ${unit}`);
    }

    // Budget
    if (requirements.requirements.budget) {
      const { min, max } = requirements.requirements.budget;
      if (min && max) {
        reasons.push(`Orçamento definido: €${min} - €${max}`);
      } else if (max) {
        reasons.push(`Orçamento máximo: €${max}`);
      }
    }

    // Materials
    if (requirements.requirements.materials.length > 0) {
      reasons.push(`${requirements.requirements.materials.length} materiais/recursos identificados`);
    }

    // Template characteristics
    reasons.push(`Template "${template.name}" é apropriado para este tipo de projeto`);

    return reasons;
  }

  /**
   * Valida se requisitos são suficientes para criar quote
   */
  static validateRequirementsCompleteness(
    requirements: QuoteRequirements
  ): { isValid: boolean; missingFields: string[]; warnings: string[] } {
    const missingFields: string[] = [];
    const warnings: string[] = [];

    // Campos essenciais
    if (!requirements.projectName || requirements.projectName.trim() === '') {
      missingFields.push('Nome do projeto');
    }

    if (!requirements.projectDescription || requirements.projectDescription.trim() === '') {
      missingFields.push('Descrição do projeto');
    }

    if (requirements.requirements.labor.length === 0 && requirements.requirements.materials.length === 0) {
      missingFields.push('Requisitos de labor OU materiais (pelo menos um deve estar presente)');
    }

    // Warnings (não bloqueantes)
    if (requirements.confidence < 0.5) {
      warnings.push('Baixa confiança na extração de requisitos - revisão manual recomendada');
    }

    if (requirements.businessModel === 'unknown') {
      warnings.push('Modelo de negócio não identificado - template pode não ser ideal');
    }

    if (!requirements.requirements.timeline) {
      warnings.push('Prazo não especificado - considerar adicionar estimativa');
    }

    return {
      isValid: missingFields.length === 0,
      missingFields,
      warnings
    };
  }

  /**
   * Busca templates ativos do banco e mapeia para melhor match
   * @param requirements Requisitos extraídos do texto
   * @param tenantId ID do tenant
   */
  static async findBestTemplate(
    requirements: QuoteRequirements,
    tenantId: string
  ): Promise<{
    bestMatch: TemplateMappingResult | null;
    allTemplates: any[];
  }> {
    const { db } = await import('../../../../apps/api/db');
    const { costTemplates } = await import('../../../../shared/schema');
    const { eq, and } = await import('drizzle-orm');

    console.log('[TemplateMappingService] Finding best template for tenant:', tenantId);

    const templates = await db
      .select()
      .from(costTemplates)
      .where(and(
        eq(costTemplates.tenantId, tenantId),
        eq(costTemplates.isActive, true)
      ));

    console.log('[TemplateMappingService] Found templates:', {
      count: templates.length,
      templates: templates.map(t => ({ id: t.id, name: t.name, type: t.type }))
    });

    if (templates.length === 0) {
      console.warn('[TemplateMappingService] No active templates found for tenant:', tenantId);
      return {
        bestMatch: null,
        allTemplates: []
      };
    }

    const mappingResult = this.mapRequirementsToTemplate(requirements, templates);

    return {
      bestMatch: mappingResult,
      allTemplates: templates
    };
  }
}
