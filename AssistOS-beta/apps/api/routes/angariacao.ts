/**
 * Angariação (Lead Generation) Module Routes
 * 
 * Traditional Express Router with stub handler functions
 * Maps to AngariacaoModule route definitions
 * 
 * SECURITY: All routes protected with module-level permission checks
 */

import { Router } from "express";
import { requirePermission } from "../middleware/permissions.middleware";
import { db } from "../db";
import { adCampaigns, adCampaignPerformance, angariacaoLeads, commercialLeads, clients, projects, insertAdCampaignSchema, insertAdCampaignPerformanceSchema, insertAngariacaoLeadSchema, moduleCustomFields, modules, users, leadScoringRules, leadActivities } from "../../../shared/schema";
import { eq, and, desc, asc, gte, lte, sql, ilike, or } from "drizzle-orm";
import { upload } from "../middleware/upload";
import xlsx from "xlsx";
import path from "path";
import { promises as fs } from "fs";
import { CustomFieldsProcessor } from "../../../packages/modules/angariacao/services/custom-fields-processor";

const router = Router();

// ============================================================================
// LEADS
// ============================================================================

// GET /api/angariacao/leads - List leads (using commercial_leads table)
router.get("/leads", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || 'production';
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { 
      status, 
      leadSource, 
      search, 
      limit = 50, 
      offset = 0,
      sortField = 'createdAt',
      sortDirection = 'desc'
    } = req.query;
    
    const conditions = [
      eq(commercialLeads.tenantId, tenantId),
      eq(commercialLeads.environment, environment)
    ];
    
    if (status && status !== 'all') {
      conditions.push(eq(commercialLeads.status, status as string));
    }
    if (leadSource && leadSource !== 'all') {
      conditions.push(eq(commercialLeads.leadSource, leadSource as string));
    }
    if (search) {
      const searchTerm = `%${search}%`;
      conditions.push(
        or(
          ilike(commercialLeads.contactName, searchTerm),
          ilike(commercialLeads.proposalNumber, searchTerm),
          ilike(commercialLeads.description, searchTerm)
        )!
      );
    }
    
    const sortFieldMap: Record<string, any> = {
      'createdAt': commercialLeads.createdAt,
      'proposalNumber': commercialLeads.proposalNumber,
      'contactName': commercialLeads.contactName,
      'status': commercialLeads.status,
      'eventDate': commercialLeads.eventDate,
      'numPax': commercialLeads.numPax,
      'budgetTotal': commercialLeads.budgetTotal,
      'leadSource': commercialLeads.leadSource,
      'ownerId': commercialLeads.ownerId,
    };
    
    const orderByField = sortFieldMap[sortField as string] || commercialLeads.createdAt;
    const orderByDirection = sortDirection === 'asc' ? asc(orderByField) : desc(orderByField);
    
    const rawLeads = await db
      .select({
        lead: commercialLeads,
        ownerFirstName: users.firstName,
        ownerLastName: users.lastName,
      })
      .from(commercialLeads)
      .leftJoin(users, eq(commercialLeads.ownerId, users.id))
      .where(and(...conditions))
      .orderBy(orderByDirection)
      .limit(Number(limit))
      .offset(Number(offset));
    
    const leads = rawLeads.map(({ lead, ownerFirstName, ownerLastName }) => ({
      ...lead,
      ownerName: ownerFirstName && ownerLastName 
        ? `${ownerFirstName} ${ownerLastName}` 
        : ownerFirstName || '—',
    }));
    
    const [countResult] = await db
      .select({ count: sql<number>`count(*)` })
      .from(commercialLeads)
      .where(and(...conditions));
    
    res.json({ 
      leads,
      total: countResult?.count || leads.length
    });
  } catch (error: any) {
    console.error("[Angariação API] Error listing leads:", error);
    res.status(500).json({ error: "Failed to list leads" });
  }
});

// POST /api/angariacao/leads - Create lead
router.post("/leads", requirePermission('lead-generation.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || 'production';
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Build contact name from firstName + lastName
    const contactName = [req.body.firstName, req.body.lastName]
      .filter(Boolean)
      .join(' ') || null;
    
    // Parse eventDate if provided
    let eventDate = null;
    let eventYear = null;
    if (req.body.eventDate) {
      eventDate = new Date(req.body.eventDate);
      eventYear = eventDate.getFullYear();
    }
    
    // Create lead in commercialLeads table (same table used for listing)
    const [newLead] = await db
      .insert(commercialLeads)
      .values({
        tenantId,
        environment,
        contactName,
        contactEmail: req.body.email,
        contactPhone: req.body.phone,
        eventDate,
        eventYear,
        eventType: req.body.eventType,
        location: req.body.location,
        numPax: req.body.numPax ? Number(req.body.numPax) : null,
        valuePerPax: req.body.valuePerPax ? String(req.body.valuePerPax) : null,
        budgetTotal: req.body.budgetTotal ? String(req.body.budgetTotal) : null,
        leadSource: req.body.leadSource || 'manual',
        ownerId: req.body.ownerId || userId,
        status: req.body.status || 'Novo',
        comments: req.body.notes,
        description: req.body.company ? `Empresa: ${req.body.company}${req.body.nif ? ` | NIF: ${req.body.nif}` : ''}` : null,
      })
      .returning();
    
    res.status(201).json(newLead);
  } catch (error: any) {
    console.error("[Angariação API] Error creating lead:", error);
    res.status(500).json({ error: "Failed to create lead", details: error.message });
  }
});

// GET /api/angariacao/leads/:id - Get lead by ID
router.get("/leads/:id", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Try angariacaoLeads first
    const [lead] = await db
      .select()
      .from(angariacaoLeads)
      .where(and(
        eq(angariacaoLeads.id, req.params.id),
        eq(angariacaoLeads.tenantId, tenantId)
      ));
    
    if (lead) {
      // Include assignee info if available
      let assignee = null;
      if (lead.assignedToUserId) {
        const [user] = await db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(eq(users.id, lead.assignedToUserId));
        if (user) {
          assignee = { id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), email: user.email };
        }
      }
      
      // Get project if converted
      let convertedProject = null;
      if (lead.convertedToClientId) {
        const [project] = await db
          .select({ id: projects.id, projectCode: projects.projectCode, name: projects.name })
          .from(projects)
          .where(eq(projects.leadId, lead.id))
          .limit(1);
        convertedProject = project || null;
      }
      
      return res.json({ 
        lead: {
          ...lead,
          assignee,
          convertedProject
        }
      });
    }
    
    // Fallback to commercialLeads - normalize to frontend format
    const environment = (req as any).environment || 'production';
    const [commercialLead] = await db
      .select()
      .from(commercialLeads)
      .where(and(
        eq(commercialLeads.id, req.params.id),
        eq(commercialLeads.tenantId, tenantId),
        eq(commercialLeads.environment, environment)
      ));
    
    if (commercialLead) {
      // Parse contactName into firstName/lastName
      const nameParts = (commercialLead.contactName || '').split(' ');
      const firstName = nameParts[0] || null;
      const lastName = nameParts.slice(1).join(' ') || null;
      
      // Get owner info
      let assignee = null;
      if (commercialLead.ownerId) {
        const [user] = await db
          .select({ id: users.id, firstName: users.firstName, lastName: users.lastName, email: users.email })
          .from(users)
          .where(eq(users.id, commercialLead.ownerId));
        if (user) {
          assignee = { id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), email: user.email };
        }
      }
      
      // Normalize to angariacaoLeads-like format
      const normalizedLead = {
        id: commercialLead.id,
        tenantId: commercialLead.tenantId,
        email: commercialLead.contactEmail || '',
        contactName: commercialLead.contactName,
        firstName,
        lastName,
        phone: commercialLead.contactPhone,
        company: commercialLead.contactName || null,
        nif: null,
        status: commercialLead.status,
        score: (commercialLead as any).score || 0,
        leadSource: commercialLead.leadSource,
        convertedToClientId: null,
        notes: commercialLead.comments,
        description: commercialLead.description,
        proposalNumber: commercialLead.proposalNumber,
        customFields: {
          proposalNumber: commercialLead.proposalNumber,
          description: commercialLead.description,
          eventType: commercialLead.eventType,
          location: commercialLead.location,
          eventDate: commercialLead.eventDate,
          numPax: commercialLead.numPax,
          valuePerPax: commercialLead.valuePerPax,
          budgetTotal: commercialLead.budgetTotal,
          data_evento: commercialLead.eventDate,
          num_pax: commercialLead.numPax,
          valor_pax: commercialLead.valuePerPax,
          budget_total: commercialLead.budgetTotal,
          tipo_evento: commercialLead.eventType,
          localizacao: commercialLead.location
        },
        createdAt: commercialLead.createdAt,
        updatedAt: (commercialLead as any).updatedAt || commercialLead.createdAt,
        assignee,
        assignedToUserId: commercialLead.ownerId,
        convertedProject: commercialLead.projectId ? { id: commercialLead.projectId } : null,
        isCommercialLead: true
      };
      
      return res.json({ lead: normalizedLead });
    }
    
    res.status(404).json({ error: "Lead not found" });
  } catch (error: any) {
    console.error("[Angariação API] Error getting lead:", error);
    res.status(500).json({ error: "Failed to get lead", details: error.message });
  }
});

// PATCH /api/angariacao/leads/:id - Update lead
router.patch("/leads/:id", requirePermission('lead-generation.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Fetch existing lead to verify tenant ownership
    const [existingLead] = await db
      .select()
      .from(angariacaoLeads)
      .where(
        and(
          eq(angariacaoLeads.id, req.params.id),
          eq(angariacaoLeads.tenantId, tenantId)
        )
      );
    
    if (!existingLead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    // If customFields is being updated, process advanced fields
    let processedCustomFields = req.body.customFields;
    if (req.body.customFields) {
      // Look up Angariação module ID by slug
      const [moduleRecord] = await db
        .select({ id: modules.id })
        .from(modules)
        .where(eq(modules.slug, 'angariacao'));
      
      if (!moduleRecord) {
        return res.status(500).json({ error: "Angariação module not found" });
      }
      
      const customFields = await db
        .select()
        .from(moduleCustomFields)
        .where(eq(moduleCustomFields.moduleId, moduleRecord.id));
      
      processedCustomFields = await CustomFieldsProcessor.processFields(
        customFields.map(field => ({
          type: field.type,
          config: field.config,
          name: field.name,
          label: field.label
        })),
        { ...existingLead.customFields, ...req.body.customFields },
        tenantId
      );
    }
    
    // Check if status is changing to WIN - trigger automatic conversion
    const isConvertingToWin = req.body.status === 'WIN' && existingLead.status !== 'WIN';
    
    if (isConvertingToWin && !existingLead.convertedToClientId) {
      // Auto-convert lead to client + project
      const clientName = `${existingLead.firstName || ''} ${existingLead.lastName || ''}`.trim() || existingLead.company || existingLead.email;
      const environment = (req as any).environment || 'production';
      
      // Create client
      const [newClient] = await db
        .insert(clients)
        .values({
          tenantId,
          environment,
          name: clientName,
          legalName: existingLead.company || clientName,
          email: existingLead.email,
          phone: existingLead.phone,
          nif: existingLead.nif,
          status: 'Ativo',
          createdBy: userId,
          otherInfo: {
            convertedFromLead: existingLead.id,
            leadSource: existingLead.leadSource,
            originalCustomFields: processedCustomFields || existingLead.customFields
          }
        })
        .returning();
      
      // Create project
      const customFields = (processedCustomFields || existingLead.customFields) as any || {};
      const projectCode = customFields.numero_proposta || `PROJ-${Date.now()}`;
      const projectName = customFields.descricao || customFields.tipo_evento || `Projeto de ${clientName}`;
      
      const [newProject] = await db
        .insert(projects)
        .values({
          tenantId,
          environment,
          projectCode,
          name: projectName,
          clientId: newClient.id,
          clientName: clientName,
          leadId: existingLead.id,
          eventDate: customFields.data_evento ? new Date(customFields.data_evento) : null,
          plannedBudget: customFields.budget_total ? String(customFields.budget_total) : null,
          projectType: customFields.tipo_evento || 'Evento',
          status: 'planning',
          notes: customFields.comentarios || null,
          metadata: {
            localizacao: customFields.localizacao,
            num_pax: customFields.num_pax,
            valor_pax: customFields.valor_pax,
            owner: customFields.owner,
            lead_source: existingLead.leadSource
          },
          ownerId: existingLead.assignedToUserId || userId,
          createdBy: userId
        })
        .returning();
      
      console.log(`[Angariação] Auto-converted lead ${existingLead.id} to client ${newClient.id} and project ${newProject.id}`);
      
      // Update lead with conversion info
      const [updatedLead] = await db
        .update(angariacaoLeads)
        .set({
          ...req.body,
          status: 'Convertido', // Override to Convertido
          customFields: processedCustomFields,
          convertedToClientId: newClient.id,
          updatedAt: new Date()
        })
        .where(
          and(
            eq(angariacaoLeads.id, req.params.id),
            eq(angariacaoLeads.tenantId, tenantId)
          )
        )
        .returning();
      
      return res.json({
        ...updatedLead,
        _autoConverted: true,
        _client: newClient,
        _project: newProject
      });
    }
    
    // Normal update (no conversion)
    const [updatedLead] = await db
      .update(angariacaoLeads)
      .set({
        ...req.body,
        customFields: processedCustomFields,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(angariacaoLeads.id, req.params.id),
          eq(angariacaoLeads.tenantId, tenantId)
        )
      )
      .returning();
    
    res.json(updatedLead);
  } catch (error: any) {
    console.error("[Angariação API] Error updating lead:", error);
    res.status(500).json({ error: "Failed to update lead", details: error.message });
  }
});

// DELETE /api/angariacao/leads/:id - Delete lead
router.delete("/leads/:id", requirePermission('lead-generation.delete'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Try to delete from angariacaoLeads first
    const [deletedFromAngariacao] = await db
      .delete(angariacaoLeads)
      .where(and(
        eq(angariacaoLeads.id, req.params.id),
        eq(angariacaoLeads.tenantId, tenantId)
      ))
      .returning();
    
    if (deletedFromAngariacao) {
      console.log(`[Angariação] Deleted lead ${req.params.id}`);
      return res.json({ success: true, deleted: deletedFromAngariacao });
    }
    
    // Fallback to commercialLeads
    const environment = (req as any).environment || 'production';
    const [deletedFromCommercial] = await db
      .delete(commercialLeads)
      .where(and(
        eq(commercialLeads.id, req.params.id),
        eq(commercialLeads.tenantId, tenantId),
        eq(commercialLeads.environment, environment)
      ))
      .returning();
    
    if (deletedFromCommercial) {
      console.log(`[Angariação] Deleted commercial lead ${req.params.id}`);
      return res.json({ success: true, deleted: deletedFromCommercial });
    }
    
    res.status(404).json({ error: "Lead not found" });
  } catch (error: any) {
    console.error("[Angariação API] Error deleting lead:", error);
    res.status(500).json({ error: "Failed to delete lead", details: error.message });
  }
});

// POST /api/angariacao/leads/:id/qualify - Qualify lead with automatic scoring
router.post("/leads/:id/qualify", requirePermission('lead-generation.qualify'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || 'production';
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Get lead from angariacaoLeads first
    let lead = null;
    let isCommercialLead = false;
    
    const [angariacaoLead] = await db
      .select()
      .from(angariacaoLeads)
      .where(and(
        eq(angariacaoLeads.id, req.params.id),
        eq(angariacaoLeads.tenantId, tenantId)
      ));
    
    if (angariacaoLead) {
      lead = angariacaoLead;
    } else {
      // Try commercialLeads as fallback
      const [commercialLead] = await db
        .select()
        .from(commercialLeads)
        .where(and(
          eq(commercialLeads.id, req.params.id),
          eq(commercialLeads.tenantId, tenantId),
          eq(commercialLeads.environment, environment)
        ));
      
      if (commercialLead) {
        lead = commercialLead;
        isCommercialLead = true;
      }
    }
    
    if (!lead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    // Get active scoring rules
    const rules = await db
      .select()
      .from(leadScoringRules)
      .where(and(
        eq(leadScoringRules.tenantId, tenantId),
        eq(leadScoringRules.isActive, true)
      ))
      .orderBy(desc(leadScoringRules.priority));
    
    // Calculate score based on rules
    let totalScore = lead.score || 0;
    const appliedRules: string[] = [];
    
    for (const rule of rules) {
      const conditions = rule.conditions as any;
      let ruleMatches = false;
      
      if (conditions && conditions.field && conditions.operator) {
        const fieldValue = (lead as any)[conditions.field];
        
        switch (conditions.operator) {
          case 'equals':
            ruleMatches = fieldValue === conditions.value;
            break;
          case 'contains':
            ruleMatches = fieldValue && String(fieldValue).toLowerCase().includes(String(conditions.value).toLowerCase());
            break;
          case 'exists':
            ruleMatches = !!fieldValue && fieldValue !== '';
            break;
          case 'greater_than':
            ruleMatches = Number(fieldValue) > Number(conditions.value);
            break;
          case 'less_than':
            ruleMatches = Number(fieldValue) < Number(conditions.value);
            break;
        }
      }
      
      if (ruleMatches) {
        totalScore += rule.scoreChange || 0;
        appliedRules.push(rule.ruleName);
      }
    }
    
    // Apply base scoring for data completeness (adapts to both table structures)
    const customFields = (lead.customFields as any) || {};
    if (!rules.length) {
      if (isCommercialLead) {
        // Score based on commercial lead fields
        if ((lead as any).contactPhone) totalScore += 10;
        if ((lead as any).contactName) totalScore += 15;
        if ((lead as any).eventDate) totalScore += 15;
        if ((lead as any).numPax && (lead as any).numPax > 0) totalScore += 10;
        if ((lead as any).budgetTotal && Number((lead as any).budgetTotal) > 0) totalScore += 20;
        if ((lead as any).proposalNumber) totalScore += 10;
        if ((lead as any).location) totalScore += 10;
      } else {
        // Score based on angariacaoLeads fields
        if (lead.phone) totalScore += 10;
        if (lead.company) totalScore += 15;
        if (lead.firstName && lead.lastName) totalScore += 10;
        if (lead.nif) totalScore += 20;
        if (customFields.eventDate || customFields.data_evento) totalScore += 15;
        if (customFields.numPax || customFields.num_pax) totalScore += 10;
        if (customFields.budgetTotal || customFields.budget_total) totalScore += 20;
      }
      appliedRules.push('data_completeness_bonus');
    }
    
    // Cap score at 100
    totalScore = Math.min(100, Math.max(0, totalScore));
    
    // Determine new status
    const newStatus = totalScore >= 70 ? 'qualified' : (totalScore >= 40 ? 'nurturing' : 'contacted');
    
    // Update lead based on source table
    let updatedLead;
    if (isCommercialLead) {
      // commercialLeads doesn't have score column - only update status
      [updatedLead] = await db
        .update(commercialLeads)
        .set({
          status: newStatus,
          updatedAt: new Date()
        })
        .where(and(
          eq(commercialLeads.id, req.params.id),
          eq(commercialLeads.tenantId, tenantId)
        ))
        .returning();
      // Add computed score to response
      updatedLead = { ...updatedLead, score: totalScore };
    } else {
      [updatedLead] = await db
        .update(angariacaoLeads)
        .set({
          score: totalScore,
          status: newStatus,
          lastActivityAt: new Date(),
          updatedAt: new Date()
        })
        .where(and(
          eq(angariacaoLeads.id, req.params.id),
          eq(angariacaoLeads.tenantId, tenantId)
        ))
        .returning();
    }
    
    // Log activity (use try/catch in case leadActivities table doesn't exist)
    try {
      await db.insert(leadActivities).values({
        tenantId,
        leadId: req.params.id,
        activityType: 'qualification',
        description: `Lead qualificado com score ${totalScore}. Status: ${newStatus}`,
        metadata: { 
          previousScore: lead.score,
          newScore: totalScore,
          previousStatus: lead.status,
          newStatus,
          appliedRules 
        },
        userId
      });
    } catch (activityError) {
      console.log('[Angariação] Could not log activity:', activityError);
    }
    
    console.log(`[Angariação] Qualified lead ${req.params.id}: score=${totalScore}, status=${newStatus}`);
    
    res.json({ 
      success: true,
      lead: updatedLead,
      scoring: {
        previousScore: lead.score,
        newScore: totalScore,
        appliedRules,
        isQualified: newStatus === 'qualified'
      }
    });
  } catch (error: any) {
    console.error("[Angariação API] Error qualifying lead:", error);
    res.status(500).json({ error: "Failed to qualify lead", details: error.message });
  }
});

// POST /api/angariacao/leads/:id/assign - Assign lead to user
router.post("/leads/:id/assign", requirePermission('lead-generation.qualify'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || 'production';
    const { assignedToUserId } = req.body;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    if (!assignedToUserId) {
      return res.status(400).json({ error: "assignedToUserId is required" });
    }
    
    // Try to update in angariacaoLeads first
    const [updatedLead] = await db
      .update(angariacaoLeads)
      .set({
        assignedToUserId,
        updatedAt: new Date()
      })
      .where(and(
        eq(angariacaoLeads.id, req.params.id),
        eq(angariacaoLeads.tenantId, tenantId)
      ))
      .returning();
    
    if (updatedLead) {
      // Log activity
      try {
        await db.insert(leadActivities).values({
          tenantId,
          leadId: req.params.id,
          activityType: 'assignment',
          description: `Lead atribuído a utilizador`,
          metadata: { assignedToUserId },
          userId
        });
      } catch (e) {}
      
      console.log(`[Angariação] Assigned lead ${req.params.id} to user ${assignedToUserId}`);
      return res.json({ success: true, lead: updatedLead });
    }
    
    // Fallback to commercialLeads - use ownerId instead of assignedToUserId
    const [commercialUpdated] = await db
      .update(commercialLeads)
      .set({
        ownerId: assignedToUserId,
        updatedAt: new Date()
      })
      .where(and(
        eq(commercialLeads.id, req.params.id),
        eq(commercialLeads.tenantId, tenantId),
        eq(commercialLeads.environment, environment)
      ))
      .returning();
    
    if (commercialUpdated) {
      console.log(`[Angariação] Assigned commercial lead ${req.params.id} to user ${assignedToUserId}`);
      return res.json({ success: true, lead: commercialUpdated });
    }
    
    res.status(404).json({ error: "Lead not found" });
  } catch (error: any) {
    console.error("[Angariação API] Error assigning lead:", error);
    res.status(500).json({ error: "Failed to assign lead", details: error.message });
  }
});

// POST /api/angariacao/leads/:id/convert - Convert lead to client + project
router.post("/leads/:id/convert", requirePermission('lead-generation.convert'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || 'production';
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Fetch existing lead
    const [existingLead] = await db
      .select()
      .from(angariacaoLeads)
      .where(
        and(
          eq(angariacaoLeads.id, req.params.id),
          eq(angariacaoLeads.tenantId, tenantId)
        )
      );
    
    if (!existingLead) {
      return res.status(404).json({ error: "Lead not found" });
    }
    
    // Check if already converted
    if (existingLead.convertedToClientId) {
      return res.status(400).json({ 
        error: "Lead already converted",
        clientId: existingLead.convertedToClientId
      });
    }
    
    // STEP 1: Create client in CRM
    const clientName = `${existingLead.firstName || ''} ${existingLead.lastName || ''}`.trim() || existingLead.company || existingLead.email;
    
    const [newClient] = await db
      .insert(clients)
      .values({
        tenantId,
        environment,
        name: clientName,
        legalName: existingLead.company || clientName,
        email: existingLead.email,
        phone: existingLead.phone,
        nif: existingLead.nif,
        status: 'Ativo',
        createdBy: userId,
        otherInfo: {
          convertedFromLead: existingLead.id,
          leadSource: existingLead.leadSource,
          originalCustomFields: existingLead.customFields
        }
      })
      .returning();
    
    console.log(`[Angariação] Created client ${newClient.id} from lead ${existingLead.id}`);
    
    // STEP 2: Create project
    const customFields = existingLead.customFields as any || {};
    const projectCode = customFields.numero_proposta || `PROJ-${Date.now()}`;
    const projectName = customFields.descricao || customFields.tipo_evento || `Projeto de ${clientName}`;
    
    const [newProject] = await db
      .insert(projects)
      .values({
        tenantId,
        environment,
        projectCode,
        name: projectName,
        clientId: newClient.id,
        clientName: clientName,
        leadId: existingLead.id,
        eventDate: customFields.data_evento ? new Date(customFields.data_evento) : null,
        plannedBudget: customFields.budget_total ? String(customFields.budget_total) : null,
        projectType: customFields.tipo_evento || 'Evento',
        status: 'planning',
        notes: customFields.comentarios || null,
        metadata: {
          localizacao: customFields.localizacao,
          num_pax: customFields.num_pax,
          valor_pax: customFields.valor_pax,
          owner: customFields.owner,
          lead_source: existingLead.leadSource
        },
        ownerId: existingLead.assignedToUserId || userId,
        createdBy: userId
      })
      .returning();
    
    console.log(`[Angariação] Created project ${newProject.id} from lead ${existingLead.id}`);
    
    // STEP 3: Update lead with conversion info
    const [updatedLead] = await db
      .update(angariacaoLeads)
      .set({
        status: 'Convertido',
        convertedToClientId: newClient.id,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(angariacaoLeads.id, req.params.id),
          eq(angariacaoLeads.tenantId, tenantId)
        )
      )
      .returning();
    
    res.json({ 
      success: true,
      message: "Lead converted successfully",
      lead: updatedLead,
      client: newClient,
      project: newProject
    });
  } catch (error: any) {
    console.error("[Angariação API] Error converting lead:", error);
    res.status(500).json({ error: "Failed to convert lead", details: error.message });
  }
});

// GET /api/angariacao/leads/:id/activities - Get lead activities
router.get("/leads/:id/activities", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Try to fetch real activities from leadActivities table
    try {
      const activities = await db
        .select()
        .from(leadActivities)
        .where(and(
          eq(leadActivities.tenantId, tenantId),
          eq(leadActivities.leadId, req.params.id)
        ))
        .orderBy(desc(leadActivities.createdAt))
        .limit(50);
      
      res.json({ activities });
    } catch (dbError) {
      // If table doesn't exist, return empty array
      console.log('[Angariação] leadActivities table may not exist:', dbError);
      res.json({ activities: [] });
    }
  } catch (error: any) {
    console.error("[Angariação API] Error getting lead activities:", error);
    res.status(500).json({ error: "Failed to get lead activities" });
  }
});

// POST /api/angariacao/leads/:id/activities - Create lead activity
router.post("/leads/:id/activities", requirePermission('lead-generation.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { activityType, description, metadata } = req.body;
    
    if (!activityType || !description) {
      return res.status(400).json({ error: "activityType and description are required" });
    }
    
    let leadType: 'angariacao' | 'commercial' = 'angariacao';
    
    // Verify lead exists in angariacaoLeads first
    const [existingLead] = await db
      .select({ id: angariacaoLeads.id })
      .from(angariacaoLeads)
      .where(and(
        eq(angariacaoLeads.id, req.params.id),
        eq(angariacaoLeads.tenantId, tenantId)
      ));
    
    if (!existingLead) {
      // Check commercialLeads as fallback (without environment filter for broader match)
      const [commercialLead] = await db
        .select({ id: commercialLeads.id })
        .from(commercialLeads)
        .where(and(
          eq(commercialLeads.id, req.params.id),
          eq(commercialLeads.tenantId, tenantId)
        ));
      
      if (!commercialLead) {
        console.log(`[Angariação API] Lead ${req.params.id} not found in either table for tenant ${tenantId}`);
        return res.status(404).json({ error: "Lead not found" });
      }
      leadType = 'commercial';
    }
    
    // Create activity
    const [newActivity] = await db
      .insert(leadActivities)
      .values({
        tenantId,
        leadId: req.params.id,
        activityType,
        description,
        metadata: metadata || {},
        userId,
      })
      .returning();
    
    // Update lead's lastActivityAt (only for angariacaoLeads)
    if (leadType === 'angariacao') {
      await db
        .update(angariacaoLeads)
        .set({ lastActivityAt: new Date() })
        .where(eq(angariacaoLeads.id, req.params.id));
    }
    
    res.status(201).json({ activity: newActivity });
  } catch (error: any) {
    console.error("[Angariação API] Error creating lead activity:", error);
    res.status(500).json({ error: "Failed to create lead activity", details: error.message });
  }
});

// ============================================================================
// LEAD SOURCES
// ============================================================================

// GET /api/angariacao/sources - List lead sources
router.get("/sources", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      sources: [],
      message: "Angariação module - List lead sources (stub)" 
    });
  } catch (error: any) {
    console.error("[Angariação API] Error listing lead sources:", error);
    res.status(500).json({ error: "Failed to list lead sources" });
  }
});

// POST /api/angariacao/sources - Create lead source
router.post("/sources", requirePermission('lead-generation.manage_sources'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.status(201).json({ 
      message: "Angariação module - Create lead source (stub)",
      data: req.body
    });
  } catch (error: any) {
    console.error("[Angariação API] Error creating lead source:", error);
    res.status(500).json({ error: "Failed to create lead source" });
  }
});

// GET /api/angariacao/sources/:id - Get lead source by ID
router.get("/sources/:id", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      message: "Angariação module - Get lead source (stub)",
      id: req.params.id
    });
  } catch (error: any) {
    console.error("[Angariação API] Error getting lead source:", error);
    res.status(500).json({ error: "Failed to get lead source" });
  }
});

// PATCH /api/angariacao/sources/:id - Update lead source
router.patch("/sources/:id", requirePermission('lead-generation.manage_sources'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      message: "Angariação module - Update lead source (stub)",
      id: req.params.id,
      data: req.body
    });
  } catch (error: any) {
    console.error("[Angariação API] Error updating lead source:", error);
    res.status(500).json({ error: "Failed to update lead source" });
  }
});

// DELETE /api/angariacao/sources/:id - Delete lead source
router.delete("/sources/:id", requirePermission('lead-generation.manage_sources'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      message: "Angariação module - Delete lead source (stub)",
      id: req.params.id
    });
  } catch (error: any) {
    console.error("[Angariação API] Error deleting lead source:", error);
    res.status(500).json({ error: "Failed to delete lead source" });
  }
});

// ============================================================================
// SCORING RULES
// ============================================================================

// GET /api/angariacao/scoring-rules - List scoring rules
router.get("/scoring-rules", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      scoringRules: [],
      message: "Angariação module - List scoring rules (stub)" 
    });
  } catch (error: any) {
    console.error("[Angariação API] Error listing scoring rules:", error);
    res.status(500).json({ error: "Failed to list scoring rules" });
  }
});

// POST /api/angariacao/scoring-rules - Create scoring rule
router.post("/scoring-rules", requirePermission('lead-generation.manage_scoring'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.status(201).json({ 
      message: "Angariação module - Create scoring rule (stub)",
      data: req.body
    });
  } catch (error: any) {
    console.error("[Angariação API] Error creating scoring rule:", error);
    res.status(500).json({ error: "Failed to create scoring rule" });
  }
});

// GET /api/angariacao/scoring-rules/:id - Get scoring rule by ID
router.get("/scoring-rules/:id", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      message: "Angariação module - Get scoring rule (stub)",
      id: req.params.id
    });
  } catch (error: any) {
    console.error("[Angariação API] Error getting scoring rule:", error);
    res.status(500).json({ error: "Failed to get scoring rule" });
  }
});

// PATCH /api/angariacao/scoring-rules/:id - Update scoring rule
router.patch("/scoring-rules/:id", requirePermission('lead-generation.manage_scoring'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      message: "Angariação module - Update scoring rule (stub)",
      id: req.params.id,
      data: req.body
    });
  } catch (error: any) {
    console.error("[Angariação API] Error updating scoring rule:", error);
    res.status(500).json({ error: "Failed to update scoring rule" });
  }
});

// DELETE /api/angariacao/scoring-rules/:id - Delete scoring rule
router.delete("/scoring-rules/:id", requirePermission('lead-generation.manage_scoring'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      message: "Angariação module - Delete scoring rule (stub)",
      id: req.params.id
    });
  } catch (error: any) {
    console.error("[Angariação API] Error deleting scoring rule:", error);
    res.status(500).json({ error: "Failed to delete scoring rule" });
  }
});

// ============================================================================
// ANALYTICS & FUNNEL
// ============================================================================

// GET /api/angariacao/funil - Get funnel metrics
router.get("/funil", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || 'production';
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Get status counts
    const statusCounts = await db
      .select({
        status: commercialLeads.status,
        count: sql<number>`count(*)::int`
      })
      .from(commercialLeads)
      .where(and(
        eq(commercialLeads.tenantId, tenantId),
        eq(commercialLeads.environment, environment)
      ))
      .groupBy(commercialLeads.status);
    
    // Map status names to expected format
    const statusMapping: Record<string, string> = {
      'Novo': 'new',
      'new': 'new',
      'Contactado': 'contacted',
      'contacted': 'contacted',
      'Qualificado': 'qualified',
      'qualified': 'qualified',
      'Em Nutrição': 'nurturing',
      'nurturing': 'nurturing',
      'Convertido': 'converted',
      'converted': 'converted',
      'WIN': 'converted',
      'won': 'converted',
      'Perdido': 'lost',
      'lost': 'lost',
      'LOST': 'lost'
    };
    
    const byStatus: Record<string, number> = {
      new: 0,
      contacted: 0,
      qualified: 0,
      nurturing: 0,
      converted: 0,
      lost: 0
    };
    
    let total = 0;
    for (const { status, count } of statusCounts) {
      const mappedStatus = statusMapping[status || ''] || 'new';
      byStatus[mappedStatus] = (byStatus[mappedStatus] || 0) + count;
      total += count;
    }
    
    // Calculate rates
    const convertedCount = byStatus.converted || 0;
    const qualifiedCount = byStatus.qualified || 0;
    const conversionRate = total > 0 ? (convertedCount / total) * 100 : 0;
    const qualificationRate = total > 0 ? (qualifiedCount / total) * 100 : 0;
    
    // Get source breakdown
    const sourceCounts = await db
      .select({
        source: commercialLeads.leadSource,
        total: sql<number>`count(*)::int`,
        converted: sql<number>`count(*) FILTER (WHERE ${commercialLeads.status} IN ('converted', 'Convertido', 'WIN', 'won'))::int`
      })
      .from(commercialLeads)
      .where(and(
        eq(commercialLeads.tenantId, tenantId),
        eq(commercialLeads.environment, environment)
      ))
      .groupBy(commercialLeads.leadSource);
    
    const sourceBreakdown: Record<string, { total: number; conversionRate: number }> = {};
    for (const { source, total: srcTotal, converted } of sourceCounts) {
      if (source) {
        sourceBreakdown[source] = {
          total: srcTotal,
          conversionRate: srcTotal > 0 ? (converted / srcTotal) * 100 : 0
        };
      }
    }
    
    res.json({ 
      metrics: {
        total,
        byStatus,
        averageScore: 0,
        conversionRate,
        qualificationRate
      },
      sourceBreakdown
    });
  } catch (error: any) {
    console.error("[Angariação API] Error getting funnel metrics:", error);
    res.status(500).json({ error: "Failed to get funnel metrics" });
  }
});

// GET /api/angariacao/analytics - Get analytics
router.get("/analytics", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      message: "Angariação module - Analytics (stub)",
      conversionRate: 0,
      averageScore: 0,
      leadsByStatus: {},
      leadsBySource: {}
    });
  } catch (error: any) {
    console.error("[Angariação API] Error getting analytics:", error);
    res.status(500).json({ error: "Failed to get analytics" });
  }
});

// GET /api/angariacao/dashboard - Get dashboard
router.get("/dashboard", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || 'production';
    
    console.log('[Dashboard] Query params:', { tenantId, environment });
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const baseConditions = and(
      eq(commercialLeads.tenantId, tenantId),
      eq(commercialLeads.environment, environment)
    );
    
    const [totalResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(commercialLeads)
      .where(baseConditions);
    
    console.log('[Dashboard] Total result:', totalResult);
    
    const [qualifiedResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(commercialLeads)
      .where(and(baseConditions, eq(commercialLeads.status, 'qualified')));
    
    const [convertedResult] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(commercialLeads)
      .where(and(baseConditions, or(
        eq(commercialLeads.status, 'converted'),
        eq(commercialLeads.status, 'won')
      )));
    
    const totalLeads = totalResult?.count || 0;
    const qualifiedLeads = qualifiedResult?.count || 0;
    const convertedLeads = convertedResult?.count || 0;
    const conversionRate = totalLeads > 0 ? ((convertedLeads / totalLeads) * 100) : 0;
    const qualificationRate = totalLeads > 0 ? ((qualifiedLeads / totalLeads) * 100) : 0;
    
    res.json({ 
      summary: {
        totalLeads,
        qualifiedLeads,
        convertedLeads,
        conversionRate: Math.round(conversionRate * 10) / 10,
        qualificationRate: Math.round(qualificationRate * 10) / 10,
        averageScore: 0
      }
    });
  } catch (error: any) {
    console.error("[Angariação API] Error getting dashboard:", error);
    res.status(500).json({ error: "Failed to get dashboard" });
  }
});

// ============================================================================
// AD CAMPAIGNS
// ============================================================================

// GET /api/angariacao/campaigns - List campaigns
router.get("/campaigns", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { status, campaignType, limit = 50, offset = 0 } = req.query;
    
    const filters = [eq(adCampaigns.tenantId, tenantId)];
    
    if (status) {
      filters.push(eq(adCampaigns.campaignStatus, status as string));
    }
    
    if (campaignType) {
      filters.push(eq(adCampaigns.campaignType, campaignType as string));
    }
    
    const whereClause = filters.length === 1 ? filters[0] : and(...filters);
    
    const campaigns = await db
      .select()
      .from(adCampaigns)
      .where(whereClause)
      .orderBy(desc(adCampaigns.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(adCampaigns)
      .where(eq(adCampaigns.tenantId, tenantId));
    
    res.json({ 
      campaigns,
      total: count
    });
  } catch (error: any) {
    console.error("[Angariação API] Error listing campaigns:", error);
    res.status(500).json({ error: "Failed to list campaigns" });
  }
});

// POST /api/angariacao/campaigns - Create campaign
router.post("/campaigns", requirePermission('lead-generation.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const validated = insertAdCampaignSchema.parse({
      ...req.body,
      tenantId
    });
    
    const [campaign] = await db.insert(adCampaigns).values(validated as any).returning();
    
    res.status(201).json(campaign);
  } catch (error: any) {
    console.error("[Angariação API] Error creating campaign:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Invalid campaign data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to create campaign" });
  }
});

// GET /api/angariacao/campaigns/:id - Get campaign by ID
router.get("/campaigns/:id", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const [campaign] = await db
      .select()
      .from(adCampaigns)
      .where(and(
        eq(adCampaigns.id, req.params.id),
        eq(adCampaigns.tenantId, tenantId)
      ))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    res.json(campaign);
  } catch (error: any) {
    console.error("[Angariação API] Error getting campaign:", error);
    res.status(500).json({ error: "Failed to get campaign" });
  }
});

// PATCH /api/angariacao/campaigns/:id - Update campaign
router.patch("/campaigns/:id", requirePermission('lead-generation.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const validated = insertAdCampaignSchema.partial().parse(req.body);
    
    const [updated] = await db
      .update(adCampaigns)
      .set({
        ...(validated as any),
        updatedAt: new Date()
      })
      .where(and(
        eq(adCampaigns.id, req.params.id),
        eq(adCampaigns.tenantId, tenantId)
      ))
      .returning();
    
    if (!updated) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    res.json(updated);
  } catch (error: any) {
    console.error("[Angariação API] Error updating campaign:", error);
    if (error.name === 'ZodError') {
      return res.status(400).json({ error: "Invalid campaign data", details: error.errors });
    }
    res.status(500).json({ error: "Failed to update campaign" });
  }
});

// DELETE /api/angariacao/campaigns/:id - Delete campaign
router.delete("/campaigns/:id", requirePermission('lead-generation.delete'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const [deleted] = await db
      .delete(adCampaigns)
      .where(and(
        eq(adCampaigns.id, req.params.id),
        eq(adCampaigns.tenantId, tenantId)
      ))
      .returning();
    
    if (!deleted) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    res.json({ success: true, id: req.params.id });
  } catch (error: any) {
    console.error("[Angariação API] Error deleting campaign:", error);
    res.status(500).json({ error: "Failed to delete campaign" });
  }
});

// GET /api/angariacao/campaigns/:id/performance - Get campaign performance
router.get("/campaigns/:id/performance", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { startDate, endDate, groupBy = 'day' } = req.query;
    
    const [campaign] = await db
      .select()
      .from(adCampaigns)
      .where(and(
        eq(adCampaigns.id, req.params.id),
        eq(adCampaigns.tenantId, tenantId)
      ))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const performanceFilters = [
      eq(adCampaignPerformance.tenantId, tenantId),
      eq(adCampaignPerformance.campaignId, req.params.id)
    ];
    
    if (startDate) {
      performanceFilters.push(gte(adCampaignPerformance.date, startDate as string));
    }
    
    if (endDate) {
      performanceFilters.push(lte(adCampaignPerformance.date, endDate as string));
    }
    
    const performanceWhereClause = performanceFilters.length === 1 ? performanceFilters[0] : and(...performanceFilters);
    
    const performance = await db
      .select()
      .from(adCampaignPerformance)
      .where(performanceWhereClause)
      .orderBy(desc(adCampaignPerformance.date));
    
    res.json({ 
      performance,
      campaign: {
        id: campaign.id,
        name: campaign.campaignName,
        status: campaign.campaignStatus
      }
    });
  } catch (error: any) {
    console.error("[Angariação API] Error getting campaign performance:", error);
    res.status(500).json({ error: "Failed to get campaign performance" });
  }
});

// GET /api/angariacao/campaigns/:id/leads - Get campaign leads
router.get("/campaigns/:id/leads", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { status, limit = 50, offset = 0 } = req.query;
    
    const [campaign] = await db
      .select()
      .from(adCampaigns)
      .where(and(
        eq(adCampaigns.id, req.params.id),
        eq(adCampaigns.tenantId, tenantId)
      ))
      .limit(1);
    
    if (!campaign) {
      return res.status(404).json({ error: "Campaign not found" });
    }
    
    const leadsFilters = [
      eq(angariacaoLeads.tenantId, tenantId),
      eq(angariacaoLeads.campaign, req.params.id)
    ];
    
    if (status) {
      leadsFilters.push(eq(angariacaoLeads.status, status as string));
    }
    
    const leadsWhereClause = leadsFilters.length === 1 ? leadsFilters[0] : and(...leadsFilters);
    
    const leads = await db
      .select()
      .from(angariacaoLeads)
      .where(leadsWhereClause)
      .orderBy(desc(angariacaoLeads.createdAt))
      .limit(Number(limit))
      .offset(Number(offset));
    
    const [{ count }] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(angariacaoLeads)
      .where(and(
        eq(angariacaoLeads.tenantId, tenantId),
        eq(angariacaoLeads.campaign, req.params.id)
      ));
    
    res.json({ 
      leads,
      total: count,
      campaign: {
        id: campaign.id,
        name: campaign.campaignName
      }
    });
  } catch (error: any) {
    console.error("[Angariação API] Error getting campaign leads:", error);
    res.status(500).json({ error: "Failed to get campaign leads" });
  }
});

// POST /api/angariacao/campaigns/sync - Sync campaigns from Google Ads
router.post("/campaigns/sync", requirePermission('lead-generation.write'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // TODO: Implement actual logic - stub for now
    res.json({ 
      message: "Angariação module - Sync campaigns (stub)",
      synced: 0
    });
  } catch (error: any) {
    console.error("[Angariação API] Error syncing campaigns:", error);
    res.status(500).json({ error: "Failed to sync campaigns" });
  }
});

// POST /api/angariacao/leads/import - Import leads from Excel/CSV
router.post("/leads/import", requirePermission('lead-generation.write'), upload.single('file'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || 'development';
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname).toLowerCase();

    // Parse Excel/CSV
    const workbook = xlsx.readFile(filePath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      await fs.unlink(filePath);
      return res.status(400).json({ error: "Ficheiro vazio ou sem dados" });
    }

    // Auto-detect column mapping (flexible)
    const normalizeHeader = (h: string) => h.toLowerCase().trim().replace(/[^a-z0-9]/g, '');
    const firstRow: any = data[0];
    const headers = Object.keys(firstRow);
    
    const mapping: any = {};
    headers.forEach(h => {
      const norm = normalizeHeader(h);
      if (['nome', 'name', 'fullname'].includes(norm)) mapping.fullName = h;
      if (['email', 'mail', 'emailaddress'].includes(norm)) mapping.email = h;
      if (['telefone', 'phone', 'tel', 'telemovel', 'mobile'].includes(norm)) mapping.phone = h;
      if (['empresa', 'company', 'organizacao', 'organization'].includes(norm)) mapping.company = h;
      if (['cargo', 'position', 'job', 'title'].includes(norm)) mapping.jobTitle = h;
      if (['origem', 'source', 'leadSource'].includes(norm)) mapping.leadSource = h;
      if (['utmsource'].includes(norm)) mapping.utmSource = h;
      if (['utmmedium'].includes(norm)) mapping.utmMedium = h;
      if (['utmcampaign', 'campaign'].includes(norm)) mapping.utmCampaign = h;
      if (['utmterm'].includes(norm)) mapping.utmTerm = h;
      if (['utmcontent'].includes(norm)) mapping.utmContent = h;
    });

    const results = { total: data.length, success: 0, errors: 0, errorDetails: [] as any[] };

    for (const row of data as any[]) {
      try {
        const leadData: any = {
          tenantId,
          environment,
          createdBy: userId,
          fullName: mapping.fullName ? row[mapping.fullName] : null,
          email: mapping.email ? row[mapping.email] : null,
          phone: mapping.phone ? row[mapping.phone] : null,
          company: mapping.company ? row[mapping.company] : null,
          jobTitle: mapping.jobTitle ? row[mapping.jobTitle] : null,
          leadSource: mapping.leadSource ? row[mapping.leadSource] : 'import',
          utmSource: mapping.utmSource ? row[mapping.utmSource] : null,
          utmMedium: mapping.utmMedium ? row[mapping.utmMedium] : null,
          utmCampaign: mapping.utmCampaign ? row[mapping.utmCampaign] : null,
          utmTerm: mapping.utmTerm ? row[mapping.utmTerm] : null,
          utmContent: mapping.utmContent ? row[mapping.utmContent] : null,
        };

        // Atribuir a campanha se utm_campaign existir
        if (leadData.utmCampaign) {
          const campaign = await db.select().from(adCampaigns)
            .where(and(
              eq(adCampaigns.tenantId, tenantId),
              eq(adCampaigns.environment, environment),
              eq(adCampaigns.campaignName, leadData.utmCampaign)
            ))
            .limit(1);
          
          if (campaign.length > 0) {
            leadData.campaignId = campaign[0].id;
          }
        }

        // Validate with Zod (skip auto fields)
        const validated = insertAngariacaoLeadSchema.omit({ id: true, createdAt: true }).parse(leadData);
        
        await db.insert(angariacaoLeads).values(validated as any);
        results.success++;
      } catch (error: any) {
        results.errors++;
        const rowData: any = row;
        results.errorDetails.push({
          row: rowData.fullName || rowData.email || 'N/A',
          error: error.message
        });
      }
    }

    // Clean up uploaded file
    await fs.unlink(filePath);

    res.json({
      message: "Import concluído",
      results
    });
  } catch (error: any) {
    console.error("[Angariação API] Error importing leads:", error);
    if (req.file?.path) {
      await fs.unlink(req.file.path).catch(() => {});
    }
    res.status(500).json({ error: "Failed to import leads" });
  }
});

// ============================================================================
// CUSTOM FIELDS (Dynamic Configuration via AssistBuild)
// ============================================================================

// GET /api/angariacao/fields - Get custom fields for lead-generation module
router.get("/fields", requirePermission('lead-generation.read'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const environment = (req as any).environment || 'development';
    
    if (!tenantId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    // Get tenant-scoped lead-generation module
    const [tenantModule] = await db
      .select()
      .from(modules)
      .where(and(
        eq(modules.id, 'angariacao'),
        eq(modules.tenantId, tenantId),
        eq(modules.environment, environment)
      ))
      .limit(1);
    
    if (!tenantModule) {
      return res.json({ fields: [] });
    }
    
    // Get custom fields for this tenant's module
    const customFields = await db
      .select()
      .from(moduleCustomFields)
      .where(eq(moduleCustomFields.moduleId, tenantModule.id))
      .orderBy(moduleCustomFields.order);
    
    res.json({ fields: customFields });
  } catch (error: any) {
    console.error("[Angariação API] Error getting custom fields:", error);
    res.status(500).json({ error: "Failed to get custom fields" });
  }
});

// POST /api/angariacao/fields - Create custom field (called by AssistBuild)
router.post("/fields", requirePermission('lead-generation.configure'), async (req, res) => {
  try {
    const tenantId = (req as any).tenantId;
    const userId = (req as any).user?.id || (req.session as any)?.userId;
    const environment = (req as any).environment || 'development';
    
    if (!tenantId || !userId) {
      return res.status(401).json({ error: "Unauthorized" });
    }
    
    const { fieldName, fieldLabel, fieldType, isRequired, options, displayOrder } = req.body;
    
    // Validate required fields
    if (!fieldName || !fieldLabel || !fieldType) {
      return res.status(400).json({ error: "Missing required fields: fieldName, fieldLabel, fieldType" });
    }
    
    // Validate field type
    const validTypes = ['text', 'number', 'date', 'select', 'textarea'];
    if (!validTypes.includes(fieldType)) {
      return res.status(400).json({ error: `Invalid fieldType. Must be one of: ${validTypes.join(', ')}` });
    }
    
    // Validate select options
    if (fieldType === 'select' && (!options || (Array.isArray(options) && options.length === 0))) {
      return res.status(400).json({ error: "Select fields must have at least one option" });
    }
    
    // Get tenant-scoped lead-generation module
    const [tenantModule] = await db
      .select()
      .from(modules)
      .where(and(
        eq(modules.id, 'angariacao'),
        eq(modules.tenantId, tenantId),
        eq(modules.environment, environment)
      ))
      .limit(1);
    
    if (!tenantModule) {
      return res.status(404).json({ error: "Angariação module not active for this tenant" });
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
          order: displayOrder ?? existing.order
        })
        .where(eq(moduleCustomFields.id, existing.id))
        .returning();
      
      return res.json({ 
        success: true,
        field: updated,
        message: `Campo "${fieldLabel}" atualizado com sucesso`,
        updated: true
      });
    }
    
    // Insert new custom field
    const [field] = await db.insert(moduleCustomFields).values({
      moduleId: tenantModule.id,
      name: fieldName,
      label: fieldLabel,
      type: fieldType,
      required: isRequired || false,
      options: parsedOptions,
      order: displayOrder || 999
    }).returning();
    
    res.status(201).json({ 
      success: true,
      field,
      message: `Campo "${fieldLabel}" criado com sucesso`,
      updated: false
    });
  } catch (error: any) {
    console.error("[Angariação API] Error creating custom field:", error);
    res.status(500).json({ error: "Failed to create custom field" });
  }
});

console.log("[Angariação Routes] ✅ Registered routes: leads + sources + scoring + funnel + analytics + dashboard + campaigns + import + custom fields");

export default router;
