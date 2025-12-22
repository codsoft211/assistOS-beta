/**
 * Angariação Module Tools
 * 
 * AI tools para gestão de leads, scoring automático e conversão.
 */

import type { ModuleTool } from '../../base/module.interface';
import { db } from '../../../../apps/api/db';
import { angariacaoLeads, leadSources, leadScoringRules, leadActivities, clients, modules, moduleCustomFields, globalCustomFields } from '../../../../shared/schema';
import { eq, and, or, ilike, gte, desc } from 'drizzle-orm';

export const angariacaoTools: ModuleTool[] = [
  {
    name: 'capturar_lead',
    description: 'Capture new lead from multiple sources (web form, email, campaign, etc)',
    parameters: [
      {
        name: 'email',
        type: 'string',
        description: 'Lead email (required)',
        required: true
      },
      {
        name: 'firstName',
        type: 'string',
        description: 'First name',
        required: false
      },
      {
        name: 'lastName',
        type: 'string',
        description: 'Last name',
        required: false
      },
      {
        name: 'phone',
        type: 'string',
        description: 'Phone',
        required: false
      },
      {
        name: 'company',
        type: 'string',
        description: 'Company',
        required: false
      },
      {
        name: 'leadSource',
        type: 'string',
        description: 'Lead source ID',
        required: false
      },
      {
        name: 'campaign',
        type: 'string',
        description: 'Campaign name',
        required: false
      },
      {
        name: 'customFields',
        type: 'object',
        description: 'Custom fields',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { email, firstName, lastName, phone, company, leadSource, campaign, customFields } = params;
      
      // Check if lead already exists
      const existing = await db
        .select()
        .from(angariacaoLeads)
        .where(and(
          eq(angariacaoLeads.tenantId, context.tenantId),
          eq(angariacaoLeads.email, email)
        ))
        .limit(1);
      
      if (existing.length > 0) {
        return {
          success: false,
          error: `Lead with email ${email} already exists`,
          existingLeadId: existing[0].id
        };
      }
      
      // Determine auto-assignment if source has it configured
      let assignedToUserId = null;
      if (leadSource) {
        const source = await db
          .select()
          .from(leadSources)
          .where(and(
            eq(leadSources.tenantId, context.tenantId),
            eq(leadSources.id, leadSource)
          ))
          .limit(1);
        
        if (source.length > 0 && source[0].config) {
          const config = source[0].config as any;
          if (config.autoAssign) {
            assignedToUserId = config.autoAssign as string;
          }
        }
      }
      
      // Create lead
      const leadResult = await db
        .insert(angariacaoLeads)
        .values({
          tenantId: context.tenantId,
          email,
          firstName: firstName || null,
          lastName: lastName || null,
          phone: phone || null,
          company: company || null,
          leadSource: leadSource || 'manual',
          status: 'new',
          score: 0,
          assignedToUserId,
          customFields: campaign ? { ...customFields, campaign } : (customFields || null),
          lastActivityAt: new Date()
        })
        .returning();
      
      const lead = Array.isArray(leadResult) ? leadResult[0] : leadResult;
      
      // Log activity
      await db.insert(leadActivities).values({
        tenantId: context.tenantId,
        leadId: lead.id,
        activityType: 'note',
        description: 'Lead captured',
        metadata: { source: leadSource, campaign },
        userId: context.userId
      });
      
      return { 
        success: true, 
        lead,
        message: `Lead ${email} captured successfully`
      };
    }
  },
  
  {
    name: 'qualificar_lead',
    description: 'Apply AI scoring and automatically qualify lead based on configured rules',
    parameters: [
      {
        name: 'leadId',
        type: 'string',
        description: 'Lead ID to qualify',
        required: true
      }
    ],
    execute: async (params: any, context) => {
      const { leadId } = params;
      
      // Get lead
      const leadResult = await db
        .select()
        .from(angariacaoLeads)
        .where(and(
          eq(angariacaoLeads.id, leadId),
          eq(angariacaoLeads.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (leadResult.length === 0) {
        return { success: false, error: 'Lead not found' };
      }
      
      const lead = leadResult[0];
      
      // Get active scoring rules
      const rules = await db
        .select()
        .from(leadScoringRules)
        .where(and(
          eq(leadScoringRules.tenantId, context.tenantId),
          eq(leadScoringRules.isActive, true)
        ))
        .orderBy(desc(leadScoringRules.priority));
      
      // Calculate score
      let totalScore = 0;
      const appliedRules: string[] = [];
      
      for (const rule of rules) {
        const conditions = rule.conditions as any;
        let ruleMatches = false;
        
        // Simple rule evaluation (can be extended)
        if (conditions && conditions.field && conditions.operator && conditions.value) {
          const fieldValue = (lead as any)[conditions.field];
          
          switch (conditions.operator) {
            case 'equals':
              ruleMatches = fieldValue === conditions.value;
              break;
            case 'contains':
              ruleMatches = fieldValue && fieldValue.includes(conditions.value);
              break;
            case 'exists':
              ruleMatches = !!fieldValue;
              break;
          }
        }
        
        if (ruleMatches) {
          totalScore += rule.scoreChange;
          appliedRules.push(rule.ruleName);
        }
      }
      
      // Determine new status based on score
      let newStatus = lead.status;
      if (totalScore >= 70) {
        newStatus = 'qualified';
      } else if (totalScore >= 40) {
        newStatus = 'contacted';
      } else if (totalScore < 20) {
        newStatus = 'nurturing';
      }
      
      // Update lead
      const updatedLead = await db
        .update(angariacaoLeads)
        .set({
          score: totalScore,
          status: newStatus,
          lastActivityAt: new Date()
        })
        .where(and(
          eq(angariacaoLeads.id, leadId),
          eq(angariacaoLeads.tenantId, context.tenantId)
        ))
        .returning();
      
      // Log activity
      await db.insert(leadActivities).values({
        tenantId: context.tenantId,
        leadId,
        activityType: 'score_change',
        description: `Score changed from ${lead.score} to ${totalScore}`,
        metadata: {
          oldScore: lead.score,
          newScore: totalScore,
          scoreDelta: totalScore - (lead.score || 0),
          appliedRules,
          oldStatus: lead.status,
          newStatus
        },
        userId: context.userId
      });
      
      return {
        success: true,
        lead: updatedLead[0],
        oldScore: lead.score,
        newScore: totalScore,
        scoreDelta: totalScore - (lead.score || 0),
        appliedRules,
        statusChanged: lead.status !== newStatus,
        oldStatus: lead.status,
        newStatus
      };
    }
  },
  
  {
    name: 'atribuir_lead',
    description: 'Assign lead to a salesperson based on distribution rules',
    parameters: [
      {
        name: 'leadId',
        type: 'string',
        description: 'Lead ID',
        required: true
      },
      {
        name: 'userId',
        type: 'string',
        description: 'User ID to assign (optional, uses automatic rules if not provided)',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { leadId, userId } = params;
      
      // Get lead
      const leadResult = await db
        .select()
        .from(angariacaoLeads)
        .where(and(
          eq(angariacaoLeads.id, leadId),
          eq(angariacaoLeads.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (leadResult.length === 0) {
        return { success: false, error: 'Lead not found' };
      }
      
      const lead = leadResult[0];
      const targetUserId = userId || context.userId; // Default to current user if not specified
      
      // Update assignment
      const updatedLead = await db
        .update(angariacaoLeads)
        .set({
          assignedToUserId: targetUserId,
          lastActivityAt: new Date()
        })
        .where(and(
          eq(angariacaoLeads.id, leadId),
          eq(angariacaoLeads.tenantId, context.tenantId)
        ))
        .returning();
      
      // Log activity
      await db.insert(leadActivities).values({
        tenantId: context.tenantId,
        leadId,
        activityType: 'note',
        description: `Lead assigned to ${targetUserId}`,
        metadata: { assignedTo: targetUserId, assignedBy: context.userId },
        userId: context.userId
      });
      
      return {
        success: true,
        lead: updatedLead[0],
        message: `Lead assigned successfully`
      };
    }
  },
  
  {
    name: 'converter_lead',
    description: 'Convert qualified lead to client in commercial system',
    parameters: [
      {
        name: 'leadId',
        type: 'string',
        description: 'Lead ID to convert',
        required: true
      }
    ],
    execute: async (params: any, context) => {
      const { leadId } = params;
      
      // Get lead
      const leadResult = await db
        .select()
        .from(angariacaoLeads)
        .where(and(
          eq(angariacaoLeads.id, leadId),
          eq(angariacaoLeads.tenantId, context.tenantId)
        ))
        .limit(1);
      
      if (leadResult.length === 0) {
        return { success: false, error: 'Lead not found' };
      }
      
      const lead = leadResult[0];
      
      // Validate lead is qualified
      if (lead.status !== 'qualified' && lead.score < 70) {
        return {
          success: false,
          error: 'Lead is not qualified for conversion. Minimum score: 70',
          currentScore: lead.score,
          currentStatus: lead.status
        };
      }
      
      // Check if already converted
      if (lead.convertedToClientId) {
        return {
          success: false,
          error: 'Lead has already been converted',
          clientId: lead.convertedToClientId
        };
      }
      
      // Create client
      const clientResult = await db
        .insert(clients)
        .values({
          tenantId: context.tenantId,
          name: `${lead.firstName || ''} ${lead.lastName || ''}`.trim() || lead.email,
          email: lead.email,
          phone: lead.phone || null,
          company: lead.company || null,
          nif: lead.nif || null,
          status: 'Active'
        })
        .returning();
      
      const client = Array.isArray(clientResult) ? clientResult[0] : clientResult;
      
      // Update lead status
      await db
        .update(angariacaoLeads)
        .set({
          status: 'converted',
          convertedToClientId: client.id,
          lastActivityAt: new Date()
        })
        .where(and(
          eq(angariacaoLeads.id, leadId),
          eq(angariacaoLeads.tenantId, context.tenantId)
        ));
      
      // Log activity
      await db.insert(leadActivities).values({
        tenantId: context.tenantId,
        leadId,
        activityType: 'status_change',
        description: 'Lead converted to client',
        metadata: {
          oldStatus: lead.status,
          newStatus: 'converted',
          clientId: client.id
        },
        userId: context.userId
      });
      
      return {
        success: true,
        client,
        message: `Lead successfully converted to client ${client.name}`
      };
    }
  },
  
  {
    name: 'analisar_funil',
    description: 'Analyze lead conversion funnel metrics with date and source filters',
    parameters: [
      {
        name: 'startDate',
        type: 'string',
        description: 'Start date (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'endDate',
        type: 'string',
        description: 'End date (YYYY-MM-DD)',
        required: false
      },
      {
        name: 'leadSource',
        type: 'string',
        description: 'Filter by specific source',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { startDate, endDate, leadSource } = params;
      
      // Build conditions
      const conditions: any[] = [
        eq(angariacaoLeads.tenantId, context.tenantId)
      ];
      
      if (leadSource) {
        conditions.push(eq(angariacaoLeads.leadSource, leadSource));
      }
      
      // TODO: Add date filters when needed
      
      // Get all leads
      const leads = await db
        .select()
        .from(angariacaoLeads)
        .where(and(...conditions));
      
      // Calculate metrics
      const metrics = {
        total: leads.length,
        byStatus: {
          new: leads.filter(l => l.status === 'new').length,
          contacted: leads.filter(l => l.status === 'contacted').length,
          qualified: leads.filter(l => l.status === 'qualified').length,
          nurturing: leads.filter(l => l.status === 'nurturing').length,
          converted: leads.filter(l => l.status === 'converted').length,
          lost: leads.filter(l => l.status === 'lost').length
        },
        averageScore: leads.length > 0 
          ? leads.reduce((sum, l) => sum + (l.score || 0), 0) / leads.length 
          : 0,
        conversionRate: leads.length > 0 
          ? (leads.filter(l => l.status === 'converted').length / leads.length) * 100 
          : 0,
        qualificationRate: leads.length > 0 
          ? (leads.filter(l => l.status === 'qualified' || l.status === 'converted').length / leads.length) * 100 
          : 0
      };
      
      // Get source breakdown if available
      const sourceBreakdown: any = {};
      for (const lead of leads) {
        if (lead.leadSource) {
          if (!sourceBreakdown[lead.leadSource]) {
            sourceBreakdown[lead.leadSource] = {
              total: 0,
              converted: 0,
              averageScore: 0,
              scores: []
            };
          }
          sourceBreakdown[lead.leadSource].total++;
          if (lead.status === 'converted') {
            sourceBreakdown[lead.leadSource].converted++;
          }
          sourceBreakdown[lead.leadSource].scores.push(lead.score || 0);
        }
      }
      
      // Calculate averages for sources
      for (const source in sourceBreakdown) {
        const scores = sourceBreakdown[source].scores;
        sourceBreakdown[source].averageScore = scores.length > 0
          ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
          : 0;
        sourceBreakdown[source].conversionRate = sourceBreakdown[source].total > 0
          ? (sourceBreakdown[source].converted / sourceBreakdown[source].total) * 100
          : 0;
        delete sourceBreakdown[source].scores; // Remove raw scores from output
      }
      
      return {
        success: true,
        metrics,
        sourceBreakdown,
        period: {
          start: startDate || 'all_time',
          end: endDate || 'now'
        }
      };
    }
  },
  
  {
    name: 'listar_leads',
    description: 'List leads with optional filters (status, source, score, assignment)',
    parameters: [
      {
        name: 'status',
        type: 'string',
        description: 'Filter by status',
        required: false
      },
      {
        name: 'leadSource',
        type: 'string',
        description: 'Filter by source',
        required: false
      },
      {
        name: 'minScore',
        type: 'number',
        description: 'Minimum score',
        required: false
      },
      {
        name: 'assignedToUserId',
        type: 'string',
        description: 'Filter by owner',
        required: false
      },
      {
        name: 'limit',
        type: 'number',
        description: 'Maximum number of results',
        required: false,
        default: 50
      }
    ],
    execute: async (params: any, context) => {
      const { status, leadSource, minScore, assignedToUserId, limit = 50 } = params;
      
      const conditions: any[] = [
        eq(angariacaoLeads.tenantId, context.tenantId)
      ];
      
      if (status) {
        conditions.push(eq(angariacaoLeads.status, status));
      }
      
      if (leadSource) {
        conditions.push(eq(angariacaoLeads.leadSource, leadSource));
      }
      
      if (minScore !== undefined) {
        conditions.push(gte(angariacaoLeads.score, minScore));
      }
      
      if (assignedToUserId) {
        conditions.push(eq(angariacaoLeads.assignedToUserId, assignedToUserId));
      }
      
      const leads = await db
        .select()
        .from(angariacaoLeads)
        .where(and(...conditions))
        .orderBy(desc(angariacaoLeads.score))
        .limit(limit);
      
      return { success: true, leads, total: leads.length };
    }
  },

  {
    name: 'configure_lead_generation_fields',
    description: 'Add or update custom fields for lead capture form (called from AssistBuild Studio)',
    parameters: [
      {
        name: 'fieldName',
        type: 'string',
        description: 'Field key/name (e.g., "industry", "budget", "decision_timeline")',
        required: true
      },
      {
        name: 'fieldLabel',
        type: 'string',
        description: 'Display label in Portuguese (e.g., "Indústria", "Orçamento")',
        required: true
      },
      {
        name: 'fieldType',
        type: 'string',
        description: 'Field type: text, email, number, select, textarea, date, auto_number, currency, text_multiline, computed',
        required: true
      },
      {
        name: 'isRequired',
        type: 'boolean',
        description: 'Is this field required?',
        required: false,
        default: false
      },
      {
        name: 'options',
        type: 'string',
        description: 'For select fields, comma-separated options (e.g., "Option1,Option2,Option3")',
        required: false
      },
      {
        name: 'displayOrder',
        type: 'number',
        description: 'Display order in form (1-based)',
        required: false,
        default: 999
      },
      {
        name: 'config',
        type: 'object',
        description: 'Type-specific configuration: For auto_number: {pattern: "PROP-{YYYY}-{SEQ3}", entityType: "lead_proposal"}. For currency: {currencyCode: "EUR", decimalPlaces: 2}. For computed: {formula: "numPax * valorPax", dependencies: ["numPax", "valorPax"], allowOverride: true}',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { fieldName, fieldLabel, fieldType, isRequired, options, displayOrder, config } = params;
      
      if (!context?.tenantId) {
        return {
          success: false,
          error: 'Missing tenant context',
          message: 'Contexto de tenant não encontrado'
        };
      }
      
      try {
        const tenantId = context.tenantId;
        const environment = context.environment || 'development';
        
        // Validate field type
        const validTypes = ['text', 'number', 'date', 'select', 'textarea', 'auto_number', 'currency', 'text_multiline', 'computed'];
        if (!validTypes.includes(fieldType)) {
          return {
            success: false,
            error: 'Invalid field type',
            message: `Tipo de campo inválido. Use um dos seguintes: ${validTypes.join(', ')}`
          };
        }
        
        // Validate select options
        if (fieldType === 'select' && !options) {
          return {
            success: false,
            error: 'Missing options for select field',
            message: 'Campos do tipo "select" requerem opções. Exemplo: "Opção 1, Opção 2, Opção 3"'
          };
        }
        
        // Validate advanced type configs
        if (fieldType === 'auto_number' && (!config || !config.pattern || !config.entityType)) {
          return {
            success: false,
            error: 'Missing config for auto_number field',
            message: 'Campos auto_number requerem config.pattern e config.entityType. Exemplo: {pattern: "PROP-{YYYY}-{SEQ3}", entityType: "lead_proposal"}'
          };
        }
        
        if (fieldType === 'computed' && (!config || !config.formula || !config.dependencies)) {
          return {
            success: false,
            error: 'Missing config for computed field',
            message: 'Campos computed requerem config.formula e config.dependencies. Exemplo: {formula: "numPax * valorPax", dependencies: ["numPax", "valorPax"]}'
          };
        }
        
        // Get tenant-scoped angariacao module
        const [tenantModule] = await db
          .select()
          .from(modules)
          .where(and(
            eq(modules.slug, 'angariacao'),
            eq(modules.tenantId, tenantId),
            eq(modules.environment, environment)
          ))
          .limit(1);
        
        if (!tenantModule) {
          return {
            success: false,
            error: 'Module not active for tenant',
            message: 'O módulo de Angariação não está ativo para este tenant. Ative-o primeiro no Studio.'
          };
        }
        
        // Parse options if it's a select field
        let parsedOptions = null;
        if (fieldType === 'select' && options) {
          parsedOptions = typeof options === 'string' 
            ? options.split(',').map((o: string) => o.trim())
            : options;
        }
        
        // Check if field already exists (idempotency)
        const [existing] = await db
          .select()
          .from(moduleCustomFields)
          .where(and(
            eq(moduleCustomFields.moduleId, tenantModule.id),
            eq(moduleCustomFields.name, fieldName)
          ))
          .limit(1);
        
        if (existing) {
          // Update existing field
          const [updated] = await db
            .update(moduleCustomFields)
            .set({
              label: fieldLabel,
              type: fieldType,
              required: isRequired || false,
              options: parsedOptions,
              config: config || null,
              order: displayOrder ?? existing.order
            })
            .where(eq(moduleCustomFields.id, existing.id))
            .returning();
          
          const configDetails = config ? `\n- Configuração: ${JSON.stringify(config, null, 2)}` : '';
          
          return {
            success: true,
            field: {
              id: updated.id,
              name: updated.name,
              label: updated.label,
              type: updated.type,
              required: updated.required,
              config: updated.config,
              order: updated.order
            },
            message: `✅ Campo "${fieldLabel}" atualizado! As alterações já estão visíveis no formulário de captura de leads.${configDetails}`,
            updated: true
          };
        }
        
        // Insert new custom field
        const [field] = await db.insert(moduleCustomFields).values({
          moduleId: tenantModule.id,
          name: fieldName,
          label: fieldLabel,
          type: fieldType,
          required: isRequired || false,
          options: parsedOptions,
          config: config || null,
          order: displayOrder || 999
        }).returning();
        
        const configDetails = config ? `\n- Configuração: ${JSON.stringify(config, null, 2)}` : '';
        
        return {
          success: true,
          field: {
            id: field.id,
            name: field.name,
            label: field.label,
            type: field.type,
            required: field.required,
            config: field.config,
            order: field.order
          },
          message: `✅ Campo "${fieldLabel}" criado com sucesso!\n\nDetalhes:\n- Nome técnico: ${fieldName}\n- Tipo: ${fieldType}\n- ${isRequired ? 'Obrigatório' : 'Opcional'}\n- Ordem: ${displayOrder || 999}${configDetails}\n\nO campo já aparece automaticamente no formulário "Capturar Lead" da página de Leads.`,
          updated: false
        };
      } catch (error: any) {
        console.error('[configure_lead_generation_fields] Database error:', error);
        return {
          success: false,
          error: error.message,
          message: `❌ Erro ao criar campo: ${error.message}`
        };
      }
    }
  },

  {
    name: 'configure_global_field',
    description: 'Create or update a GLOBAL custom field shared across all modules (Leads, CRM, Projects). These fields follow entities through their lifecycle (Lead → Contact → Customer). Use this for common fields like Email, Phone, NIF, Budget, Industry, Decision Timeline.',
    parameters: [
      {
        name: 'fieldKey',
        type: 'string',
        description: 'Field key/name (e.g., "industry", "budget", "decision_timeline", "nif")',
        required: true
      },
      {
        name: 'displayName',
        type: 'string',
        description: 'Display label in Portuguese (e.g., "Indústria", "Orçamento", "NIF"). Required for new fields, optional for updates.',
        required: false
      },
      {
        name: 'fieldType',
        type: 'string',
        description: 'Field type: text, email, number, select, multi_select, textarea, date, phone, auto_number, currency, text_multiline, computed. Required for new fields, optional for updates.',
        required: false
      },
      {
        name: 'availableInModules',
        type: 'string',
        description: 'Which modules can use this field: "all" (default), or comma-separated module slugs like "angariacao,crm,projects"',
        required: false,
        default: 'all'
      },
      {
        name: 'isRequired',
        type: 'boolean',
        description: 'Is this field required?',
        required: false,
        default: false
      },
      {
        name: 'options',
        type: 'string',
        description: 'For select/multi_select fields, comma-separated options (e.g., "Option1,Option2,Option3")',
        required: false
      },
      {
        name: 'fieldOrder',
        type: 'number',
        description: 'Display order in form (1-based)',
        required: false,
        default: 0
      },
      {
        name: 'category',
        type: 'string',
        description: 'Field category for grouping (e.g., "contact_info", "financial", "custom")',
        required: false
      },
      {
        name: 'description',
        type: 'string',
        description: 'Field description/help text',
        required: false
      },
      {
        name: 'isUnique',
        type: 'boolean',
        description: 'Should this field value be unique across entities?',
        required: false,
        default: false
      },
      {
        name: 'isSearchable',
        type: 'boolean',
        description: 'Should this field be searchable?',
        required: false,
        default: false
      },
      {
        name: 'isVisible',
        type: 'boolean',
        description: 'Should this field be visible in forms?',
        required: false,
        default: true
      },
      {
        name: 'config',
        type: 'object',
        description: 'Type-specific configuration: For auto_number: {prefix: "PROP-", startFrom: 1}. For currency: {currencyCode: "EUR", decimalPlaces: 2}. For computed: {formula: "numPax * valorPax", dependencies: ["numPax", "valorPax"]}. For select: {options: [{value: "opt1", label: "Option 1"}]}',
        required: false
      }
    ],
    execute: async (params: any, context) => {
      const { fieldKey, displayName, fieldType, availableInModules = 'all', isRequired, options, fieldOrder, category, description, isUnique, isSearchable, isVisible, config } = params;
      
      if (!context?.tenantId || !context?.userId) {
        return {
          success: false,
          error: 'Missing tenant or user context',
          message: 'Contexto de tenant/usuário não encontrado'
        };
      }
      
      try {
        const tenantId = context.tenantId;
        const userId = context.userId;
        const environment = context.environment || 'development';
        
        // Validate field type
        const validTypes = ['text', 'email', 'phone', 'number', 'date', 'select', 'multi_select', 'textarea', 'auto_number', 'currency', 'text_multiline', 'computed'];
        if (!validTypes.includes(fieldType)) {
          return {
            success: false,
            error: 'Invalid field type',
            message: `Tipo de campo inválido. Use um dos seguintes: ${validTypes.join(', ')}`
          };
        }
        
        // Validate select options
        if ((fieldType === 'select' || fieldType === 'multi_select') && !options && !config?.options) {
          return {
            success: false,
            error: 'Missing options for select field',
            message: 'Campos do tipo "select" ou "multi_select" requerem opções. Forneça via parâmetro "options" (string CSV) ou via config.options (array de objetos).'
          };
        }
        
        // Validate advanced type configs
        if (fieldType === 'auto_number') {
          if (!config || (!config.prefix && config.startFrom === undefined)) {
            return {
              success: false,
              error: 'Missing config for auto_number field',
              message: 'Campos auto_number requerem config.prefix ou config.startFrom. Exemplo: {prefix: "PROP-", startFrom: 1}'
            };
          }
        }
        
        if (fieldType === 'currency') {
          if (!config || !config.currencyCode || typeof config.currencyCode !== 'string' || config.currencyCode.trim() === '') {
            return {
              success: false,
              error: 'Missing or empty currencyCode in config',
              message: 'Campos currency requerem config.currencyCode não-vazio. Exemplo: {currencyCode: "EUR", decimalPlaces: 2}'
            };
          }
          // Sanitize currencyCode
          finalConfig = {
            ...finalConfig,
            currencyCode: config.currencyCode.trim().toUpperCase(),
            decimalPlaces: config.decimalPlaces ?? 2
          };
        }
        
        if (fieldType === 'computed') {
          if (!config || !config.formula || typeof config.formula !== 'string' || config.formula.trim() === '') {
            return {
              success: false,
              error: 'Missing or empty formula in config',
              message: 'Campos computed requerem config.formula não-vazia.'
            };
          }
          if (!config.dependencies || !Array.isArray(config.dependencies) || config.dependencies.length === 0) {
            return {
              success: false,
              error: 'Missing or empty dependencies in config',
              message: 'Campos computed requerem config.dependencies com pelo menos um campo. Exemplo: ["valorPax", "numPax"]'
            };
          }
        }
        
        // Parse availableInModules - convert "all" to empty array (means all modules)
        let parsedModules: string[] = [];
        if (availableInModules && availableInModules !== 'all') {
          parsedModules = typeof availableInModules === 'string' 
            ? availableInModules.split(',').map((s: string) => s.trim())
            : availableInModules;
        }
        
        // Build config object with options if provided as simple string
        let finalConfig = config || {};
        
        // Validate and sanitize config.options if provided directly (not via CSV options param)
        if ((fieldType === 'select' || fieldType === 'multi_select') && finalConfig.options && !options) {
          if (!Array.isArray(finalConfig.options) || finalConfig.options.length === 0) {
            return {
              success: false,
              error: 'Invalid config.options format',
              message: 'config.options deve ser um array não-vazio de objetos {value, label}.'
            };
          }
          
          // Filter out empty/invalid options and deduplicate
          const seen = new Set<string>();
          const validOptions = finalConfig.options.filter((opt: any) => {
            if (!opt || typeof opt !== 'object' || !opt.value || !opt.label) return false;
            if (typeof opt.value !== 'string' || opt.value.trim() === '') return false;
            if (typeof opt.label !== 'string' || opt.label.trim() === '') return false;
            
            const key = opt.value.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          
          if (validOptions.length === 0) {
            return {
              success: false,
              error: 'No valid options in config.options',
              message: 'config.options não contém opções válidas. Cada opção deve ter {value: "...", label: "..."} com strings não-vazias e únicas.'
            };
          }
          
          // Replace config.options with validated options
          finalConfig.options = validOptions;
        }
        if ((fieldType === 'select' || fieldType === 'multi_select') && options && !finalConfig.options) {
          const optionsArray = typeof options === 'string' 
            ? options.split(',').map((o: string) => o.trim()).filter((o: string) => o.length > 0)
            : options;
          
          if (optionsArray.length === 0) {
            return {
              success: false,
              error: 'Empty options array',
              message: 'Campos select/multi_select requerem pelo menos uma opção não-vazia.'
            };
          }
          
          // Deduplicate options
          const seen = new Set<string>();
          const uniqueOptions = optionsArray.filter((opt: string) => {
            const key = opt.toLowerCase();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
          });
          
          if (uniqueOptions.length === 0) {
            return {
              success: false,
              error: 'No unique options',
              message: 'Campos select/multi_select requerem pelo menos uma opção única.'
            };
          }
          
          finalConfig = {
            ...finalConfig,
            options: uniqueOptions.map((opt: string) => ({
              value: opt.toLowerCase().replace(/\s+/g, '_'),
              label: opt
            }))
          };
        }
        
        // Check if field already exists (idempotency)
        const [existing] = await db
          .select()
          .from(globalCustomFields)
          .where(and(
            eq(globalCustomFields.tenantId, tenantId),
            eq(globalCustomFields.fieldKey, fieldKey),
            eq(globalCustomFields.environment, environment)
          ))
          .limit(1);
        
        if (existing) {
          // Update existing field - only update fields that were explicitly provided
          const updateData: any = {
            updatedBy: userId
          };
          
          // Always update these core fields (required params)
          if (displayName !== undefined) updateData.displayName = displayName;
          if (fieldType !== undefined) updateData.fieldType = fieldType;
          
          // Only update optional fields if they were provided
          if (description !== undefined) updateData.description = description;
          if (availableInModules !== undefined && availableInModules !== 'all') {
            updateData.availableInModules = parsedModules;
          }
          if (isRequired !== undefined) updateData.isRequired = isRequired;
          if (isUnique !== undefined) updateData.isUnique = isUnique;
          if (isSearchable !== undefined) updateData.isSearchable = isSearchable;
          if (isVisible !== undefined) updateData.isVisible = isVisible;
          if (config !== undefined && Object.keys(finalConfig).length > 0) {
            updateData.config = finalConfig;
          }
          if (fieldOrder !== undefined) updateData.fieldOrder = fieldOrder;
          if (category !== undefined) updateData.category = category;
          
          const [updated] = await db
            .update(globalCustomFields)
            .set(updateData)
            .where(eq(globalCustomFields.id, existing.id))
            .returning();
          
          const modulesInfo = parsedModules.length > 0 
            ? `- Módulos: ${parsedModules.join(', ')}`
            : '- Módulos: Todos (universal)';
          const configDetails = Object.keys(finalConfig).length > 0 
            ? `\n- Configuração: ${JSON.stringify(finalConfig, null, 2)}` 
            : '';
          
          return {
            success: true,
            field: {
              id: updated.id,
              fieldKey: updated.fieldKey,
              displayName: updated.displayName,
              fieldType: updated.fieldType,
              availableInModules: updated.availableInModules,
              isRequired: updated.isRequired,
              fieldOrder: updated.fieldOrder,
              category: updated.category
            },
            message: `✅ Campo GLOBAL "${displayName}" atualizado!\n\nEste campo está agora disponível em:\n${modulesInfo}\n- ${isRequired ? 'Obrigatório' : 'Opcional'}${configDetails}\n\n🌍 Como campo global, ele segue a entidade através do lifecycle (Lead → Contact → Customer).`,
            updated: true
          };
        }
        
        // Insert new global custom field - displayName and fieldType are REQUIRED for creates
        if (!displayName) {
          return {
            success: false,
            error: 'Missing displayName for new field',
            message: 'O parâmetro displayName é obrigatório ao criar um novo campo global.'
          };
        }
        if (!fieldType) {
          return {
            success: false,
            error: 'Missing fieldType for new field',
            message: 'O parâmetro fieldType é obrigatório ao criar um novo campo global.'
          };
        }
        
        const [field] = await db.insert(globalCustomFields).values({
          tenantId,
          environment,
          fieldKey,
          displayName,
          description: description || null,
          fieldType,
          availableInModules: parsedModules.length > 0 ? parsedModules : null,
          isRequired: isRequired || false,
          isUnique: isUnique || false,
          isSearchable: isSearchable || false,
          isVisible: isVisible !== undefined ? isVisible : true,
          config: Object.keys(finalConfig).length > 0 ? finalConfig : null,
          fieldOrder: fieldOrder || 0,
          category: category || null,
          createdBy: userId,
          updatedBy: userId
        }).returning();
        
        const modulesInfo = parsedModules.length > 0 
          ? `- Módulos: ${parsedModules.join(', ')}`
          : '- Módulos: Todos (universal)';
        const configDetails = Object.keys(finalConfig).length > 0 
          ? `\n- Configuração: ${JSON.stringify(finalConfig, null, 2)}` 
          : '';
        
        return {
          success: true,
          field: {
            id: field.id,
            fieldKey: field.fieldKey,
            displayName: field.displayName,
            fieldType: field.fieldType,
            availableInModules: field.availableInModules,
            isRequired: field.isRequired,
            fieldOrder: field.fieldOrder,
            category: field.category
          },
          message: `✅ Campo GLOBAL "${displayName}" criado com sucesso!\n\nDetalhes:\n- Nome técnico: ${fieldKey}\n- Tipo: ${fieldType}\n${modulesInfo}\n- ${isRequired ? 'Obrigatório' : 'Opcional'}\n- Ordem: ${fieldOrder || 0}${configDetails}\n\n🌍 Como campo global, ele está disponível em todos os módulos especificados e segue a entidade através do lifecycle (Lead → Contact → Customer).`,
          updated: false
        };
      } catch (error: any) {
        console.error('[configure_global_field] Database error:', error);
        return {
          success: false,
          error: error.message,
          message: `❌ Erro ao criar campo global: ${error.message}`
        };
      }
    }
  }
];
