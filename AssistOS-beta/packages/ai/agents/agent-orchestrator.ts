// Migrated from AssistOS legacy - Phase 3
// Source: /tmp/assistos-legacy/server/services/agent-orchestrator.ts (322 lines)

import { db } from "../../../apps/api/db";

// TODO: Add these tables to schema if they don't exist
// import { 
//   conversionAgents, 
//   agentWorkflows, 
//   documentConversions 
// } from "../../../shared/schema";
import { eq, and, desc } from "drizzle-orm";

// TODO: Migrate document conversion service when needed
// import { documentConversionService } from "../../../apps/api/services/document-conversion";

interface WorkflowStep {
  type: 'conversion' | 'validation' | 'action' | 'notification';
  agentId?: string;
  config: any;
}

interface WorkflowExecution {
  workflowId: string;
  steps: WorkflowStep[];
  currentStep: number;
  status: 'running' | 'completed' | 'failed';
  results: any[];
}

export class AgentOrchestratorService {
  
  async routeDocument(params: {
    tenantId: string;
    userId: string;
    documentBuffer: Buffer;
    documentType: string;
    sourceType: string;
    sourceUrl?: string;
  }): Promise<{ agentId?: string; workflowId?: string; conversionResult: any }> {
    
    const { tenantId, documentType, documentBuffer } = params;
    
    const matchingAgents = await this.findMatchingAgents(tenantId, documentType);
    
    if (matchingAgents.length === 0) {
      console.log('[Orchestrator] No matching agent found, using default conversion');
      const result = await documentConversionService.convertDocument(params);
      return { conversionResult: result };
    }
    
    const bestAgent = this.selectBestAgent(matchingAgents, documentBuffer);
    console.log(`[Orchestrator] Selected agent: ${bestAgent.name}`);
    
    const result = await documentConversionService.convertDocument({
      ...params,
      templateId: bestAgent.templateId || undefined,
    });
    
    await this.executeAutoActions(bestAgent, result, params.tenantId);
    
    return {
      agentId: bestAgent.id,
      conversionResult: result,
    };
  }
  
  private async findMatchingAgents(tenantId: string, documentType: string) {
    const agents = await db
      .select()
      .from(conversionAgents)
      .where(and(
        eq(conversionAgents.tenantId, tenantId),
        eq(conversionAgents.documentType, documentType),
        eq(conversionAgents.isActive, true)
      ))
      .orderBy(desc(conversionAgents.priority));
    
    return agents;
  }
  
  private selectBestAgent(agents: any[], documentBuffer: Buffer): any {
    if (agents.length === 1) return agents[0];
    
    let bestAgent = agents[0];
    let highestScore = 0;
    
    for (const agent of agents) {
      let score = agent.priority || 50;
      
      if (agent.accuracy) {
        score += parseFloat(agent.accuracy) * 0.3;
      }
      
      if (agent.executionCount > 0) {
        const successRate = agent.successCount / agent.executionCount;
        score += successRate * 20;
      }
      
      if (score > highestScore) {
        highestScore = score;
        bestAgent = agent;
      }
    }
    
    return bestAgent;
  }
  
  private async executeAutoActions(agent: any, conversionResult: any, tenantId: string) {
    if (!agent.autoActions || !Array.isArray(agent.autoActions)) {
      return;
    }
    
    console.log(`[Orchestrator] Executing ${agent.autoActions.length} auto-actions`);
    
    for (const action of agent.autoActions) {
      try {
        switch (action) {
          case 'create_payable':
            await this.createPayableFromConversion(conversionResult, tenantId);
            break;
          case 'notify_accounting':
            console.log('[Orchestrator] Notification sent to accounting team');
            break;
          case 'store_document':
            console.log('[Orchestrator] Document stored');
            break;
          default:
            console.log(`[Orchestrator] Unknown action: ${action}`);
        }
      } catch (error) {
        console.error(`[Orchestrator] Error executing action ${action}:`, error);
      }
    }
    
    await db.update(conversionAgents)
      .set({
        executionCount: agent.executionCount + 1,
        successCount: conversionResult.overallConfidence >= 75 
          ? agent.successCount + 1 
          : agent.successCount,
      })
      .where(eq(conversionAgents.id, agent.id));
  }
  
  private async createPayableFromConversion(conversionResult: any, tenantId: string) {
    console.log('[Orchestrator] Creating payable from conversion');
  }
  
  async createWorkflow(params: {
    tenantId: string;
    userId: string;
    name: string;
    description?: string;
    triggerType: string;
    triggerConfig?: any;
    steps: WorkflowStep[];
  }): Promise<string> {
    
    const { tenantId, userId, name, description, triggerType, triggerConfig, steps } = params;
    
    const [workflow] = await db.insert(agentWorkflows).values({
      tenantId,
      name,
      description: description || null,
      triggerType,
      triggerConfig: triggerConfig || null,
      steps: steps as any,
      isActive: true,
      createdBy: userId,
    }).returning({ id: agentWorkflows.id });
    
    console.log(`[Orchestrator] Workflow "${name}" created: ${workflow.id}`);
    
    return workflow.id;
  }
  
  async executeWorkflow(workflowId: string, tenantId: string, context: any): Promise<WorkflowExecution> {
    
    const [workflow] = await db
      .select()
      .from(agentWorkflows)
      .where(and(
        eq(agentWorkflows.id, workflowId),
        eq(agentWorkflows.tenantId, tenantId)
      ));
    
    if (!workflow) {
      throw new Error('Workflow not found');
    }
    
    const steps = workflow.steps as WorkflowStep[];
    const results: any[] = [];
    
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      try {
        console.log(`[Orchestrator] Executing step ${i + 1}/${steps.length}: ${step.type}`);
        
        const result = await this.executeWorkflowStep(step, context, tenantId);
        results.push({ step: i, success: true, result });
        
        context = { ...context, ...result };
        
      } catch (error: any) {
        console.error(`[Orchestrator] Step ${i + 1} failed:`, error);
        results.push({ step: i, success: false, error: error.message });
        
        return {
          workflowId,
          steps,
          currentStep: i,
          status: 'failed',
          results,
        };
      }
    }
    
    await db.update(agentWorkflows)
      .set({
        executionCount: workflow.executionCount + 1,
      })
      .where(eq(agentWorkflows.id, workflowId));
    
    return {
      workflowId,
      steps,
      currentStep: steps.length,
      status: 'completed',
      results,
    };
  }
  
  private async executeWorkflowStep(step: WorkflowStep, context: any, tenantId: string): Promise<any> {
    
    switch (step.type) {
      case 'conversion':
        return await this.executeConversionStep(step, context, tenantId);
      
      case 'validation':
        return this.executeValidationStep(step, context);
      
      case 'action':
        return this.executeActionStep(step, context, tenantId);
      
      case 'notification':
        return this.executeNotificationStep(step, context);
      
      default:
        throw new Error(`Unknown step type: ${step.type}`);
    }
  }
  
  private async executeConversionStep(step: WorkflowStep, context: any, tenantId: string): Promise<any> {
    if (!context.documentBuffer) {
      throw new Error('No document buffer in context');
    }
    
    const result = await documentConversionService.convertDocument({
      tenantId,
      userId: context.userId,
      documentBuffer: context.documentBuffer,
      documentType: context.documentType || 'invoice',
      sourceType: context.sourceType || 'upload',
    });
    
    return { conversionResult: result };
  }
  
  private executeValidationStep(step: WorkflowStep, context: any): any {
    console.log('[Orchestrator] Validation step executed');
    return { validated: true };
  }
  
  private async executeActionStep(step: WorkflowStep, context: any, tenantId: string): Promise<any> {
    const action = step.config?.action || 'unknown';
    console.log(`[Orchestrator] Action step: ${action}`);
    return { actionExecuted: action };
  }
  
  private executeNotificationStep(step: WorkflowStep, context: any): any {
    const recipient = step.config?.recipient || 'default';
    console.log(`[Orchestrator] Notification sent to: ${recipient}`);
    return { notificationSent: true, recipient };
  }
  
  async getAgentMetrics(agentId: string, tenantId: string): Promise<{
    accuracy: number;
    totalExecutions: number;
    successRate: number;
    avgConfidence: number;
  }> {
    
    const [agent] = await db
      .select()
      .from(conversionAgents)
      .where(and(
        eq(conversionAgents.id, agentId),
        eq(conversionAgents.tenantId, tenantId)
      ));
    
    if (!agent) {
      throw new Error('Agent not found');
    }
    
    const conversions = await db
      .select()
      .from(documentConversions)
      .where(eq(documentConversions.customAgentId, agentId));
    
    const avgConfidence = conversions.length > 0
      ? conversions.reduce((sum, c) => sum + c.confidence, 0) / conversions.length
      : 0;
    
    const successRate = agent.executionCount > 0
      ? (agent.successCount / agent.executionCount) * 100
      : 0;
    
    return {
      accuracy: parseFloat(agent.accuracy || '0'),
      totalExecutions: agent.executionCount,
      successRate: Math.round(successRate),
      avgConfidence: Math.round(avgConfidence),
    };
  }
}

export const agentOrchestrator = new AgentOrchestratorService();
