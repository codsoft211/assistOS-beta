import { db } from '../../../../apps/api/db';
import { quotes, quoteLines, rateCards, costTemplates } from '../../../../shared/schema';
import { and, eq, sql, desc } from 'drizzle-orm';

/**
 * Quote Calculation Input Interface
 */
export interface QuoteCalculationInput {
  tenantId: string;
  templateId: string;
  clientId?: string;
  opportunityId?: string;
  requirements: {
    title: string;
    description?: string;
    items: Array<{
      description: string;
      roleId?: string; // ID do rate card
      hours?: number; // para labor
      quantity?: number; // para materiais
      unit?: string;
      unitCost?: number; // se fornecido manualmente
    }>;
    urgency?: 'normal' | 'urgent' | 'critical';
    deadline?: string;
  };
}

/**
 * Quote Calculation Result Interface
 */
export interface QuoteCalculationResult {
  quote: {
    quoteNumber: string;
    title: string;
    description: string;
    status: 'draft';
    requirements: any;
    calculations: {
      laborCosts: number;
      materialCosts: number;
      overheadCosts: number;
      totalCost: number;
      markup: number;
      totalPrice: number;
      margin: number;
      marginPercentage: number;
    };
    totalCost: string;
    totalPrice: string;
    margin: string;
    marginPercentage: string;
    templateId: string;
    clientId?: string;
    opportunityId?: string;
  };
  quoteLines: Array<{
    lineNumber: number;
    description: string;
    category: string;
    quantity: string;
    unit: string;
    unitCost: string;
    unitPrice: string;
    totalCost: string;
    totalPrice: string;
    margin: string;
    marginPercentage: string;
  }>;
}

/**
 * Cost Calculator Service
 * 
 * Responsabilidades:
 * - Cálculo Atômico de Custos
 * - Aplicar Rate Cards
 * - Aplicar Markup/Overhead
 * - Gerar Quote Lines
 * - Calcular Totais
 */
export class CostCalculatorService {
  /**
   * Gera número de orçamento auto-incremental: QT-YYYY-NNN
   */
  async generateQuoteNumber(tenantId: string): Promise<string> {
    const year = new Date().getFullYear();
    
    const lastQuotes = await db
      .select()
      .from(quotes)
      .where(and(
        eq(quotes.tenantId, tenantId),
        sql`EXTRACT(YEAR FROM ${quotes.createdAt}) = ${year}`
      ))
      .orderBy(desc(quotes.createdAt))
      .limit(1);
    
    const nextNum = lastQuotes.length > 0 
      ? parseInt(lastQuotes[0].quoteNumber.split('-')[2]) + 1 
      : 1;
    
    return `QT-${year}-${String(nextNum).padStart(3, '0')}`;
  }

  /**
   * Calcula orçamento completo com decomposição atômica
   */
  async calculateQuote(input: QuoteCalculationInput): Promise<QuoteCalculationResult> {
    // 1. Buscar template para obter configurações de markup/overhead
    const [template] = await db
      .select()
      .from(costTemplates)
      .where(and(
        eq(costTemplates.id, input.templateId),
        eq(costTemplates.tenantId, input.tenantId)
      ));

    if (!template) {
      throw new Error(`Template não encontrado: ${input.templateId}`);
    }

    const defaultMarkup = parseFloat(template.defaultMarkup || '1.50');
    const defaultOverhead = parseFloat(template.defaultOverhead || '0.15');

    // 2. Gerar número do orçamento
    const quoteNumber = await this.generateQuoteNumber(input.tenantId);

    // 3. Processar cada item e criar quote lines
    const quoteLineResults: QuoteCalculationResult['quoteLines'] = [];
    let laborCosts = 0;
    let materialCosts = 0;
    let overheadCosts = 0;

    for (let i = 0; i < input.requirements.items.length; i++) {
      const item = input.requirements.items[i];
      let unitCost = 0;
      let unitPrice = 0;
      let category = '';
      let unit = item.unit || 'unit';
      let quantity = item.quantity || 1;

      // CASO 1: Item com roleId (Labor)
      if (item.roleId) {
        const [rateCard] = await db
          .select()
          .from(rateCards)
          .where(and(
            eq(rateCards.id, item.roleId),
            eq(rateCards.tenantId, input.tenantId),
            eq(rateCards.isActive, true)
          ));

        if (!rateCard) {
          throw new Error(`Rate card não encontrado ou inativo: ${item.roleId}`);
        }

        const hours = item.hours || 1;
        unitCost = parseFloat(rateCard.costRate) * hours;
        unitPrice = parseFloat(rateCard.billRate) * hours;
        category = 'Labor';
        unit = 'hours';
        quantity = hours;
        
        laborCosts += unitCost;
      } 
      // CASO 2: Item sem roleId (Material/Outro)
      else {
        if (!item.unitCost || item.unitCost <= 0) {
          throw new Error(`Item "${item.description}" precisa de unitCost definido`);
        }

        unitCost = item.unitCost;
        quantity = item.quantity || 1;
        
        // Aplicar markup do template
        unitPrice = unitCost * defaultMarkup;
        category = 'Material';
        
        materialCosts += (unitCost * quantity);
      }

      // 3. Calcular overhead
      const overheadCost = unitCost * defaultOverhead;
      overheadCosts += overheadCost;

      // 4. Calcular totais da linha
      const totalCost = unitCost + overheadCost;
      const totalPrice = unitPrice;
      const margin = totalPrice - totalCost;
      const marginPercentage = totalCost > 0 ? (margin / totalCost) * 100 : 0;

      // 5. Criar quote line
      quoteLineResults.push({
        lineNumber: i + 1,
        description: item.description,
        category,
        quantity: quantity.toFixed(3),
        unit,
        unitCost: unitCost.toFixed(2),
        unitPrice: unitPrice.toFixed(2),
        totalCost: totalCost.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        margin: margin.toFixed(2),
        marginPercentage: marginPercentage.toFixed(2)
      });
    }

    // 6. Agregação de totais
    const totalCost = quoteLineResults.reduce((sum, line) => sum + parseFloat(line.totalCost), 0);
    const totalPrice = quoteLineResults.reduce((sum, line) => sum + parseFloat(line.totalPrice), 0);
    const totalMargin = totalPrice - totalCost;
    const totalMarginPercentage = totalCost > 0 ? (totalMargin / totalCost) * 100 : 0;

    // 7. Markup total (diferença entre preço e custo base)
    const baseCost = laborCosts + materialCosts;
    const markup = totalPrice - baseCost;

    // 8. Montar resultado final
    const result: QuoteCalculationResult = {
      quote: {
        quoteNumber,
        title: input.requirements.title,
        description: input.requirements.description || '',
        status: 'draft',
        requirements: input.requirements,
        calculations: {
          laborCosts,
          materialCosts,
          overheadCosts,
          totalCost,
          markup,
          totalPrice,
          margin: totalMargin,
          marginPercentage: totalMarginPercentage
        },
        totalCost: totalCost.toFixed(2),
        totalPrice: totalPrice.toFixed(2),
        margin: totalMargin.toFixed(2),
        marginPercentage: totalMarginPercentage.toFixed(2),
        templateId: input.templateId,
        clientId: input.clientId,
        opportunityId: input.opportunityId
      },
      quoteLines: quoteLineResults
    };

    return result;
  }
}

// Exportar instância singleton
export const costCalculatorService = new CostCalculatorService();
