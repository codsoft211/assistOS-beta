/**
 * RunAgentAction - Executes an AI agent with given input
 * 
 * Supports:
 * - specializedAgents (multi-agent systems)
 * - customAgents (dynamically created)
 * - agentsLibrary (global templates)
 * 
 * Config:
 * - agentId: ID of the agent to run
 * - agentType: 'specialized' | 'custom' | 'library'
 * - input: Input data for the agent
 * - timeout: Execution timeout in ms (default: 30000)
 */

import type { ActionExecutor, ActionResult } from '../ActionExecutor';
import type { ExecutionContext } from '../types';
import { db } from '../../../apps/api/db';
import { agentRuns, specializedAgents, customAgents, agentsLibrary } from '../../../shared/schema';
import { eq } from 'drizzle-orm';
import Anthropic from '@anthropic-ai/sdk';
import { toolRegistry } from '../../ai/tools/kernel';

export class RunAgentAction implements ActionExecutor {
  readonly name = 'run_agent';
  readonly description = 'Executes an AI agent with the given input data';

  async execute(config: any, context: ExecutionContext): Promise<ActionResult> {
    const { agentId, agentType = 'specialized', input, timeout = 30000 } = config;
    
    // Security: Validate tenant access
    if (!context.tenantId) {
      return {
        success: false,
        error: 'Tenant ID required for agent execution'
      };
    }
    
    let run: any; // Declare outside try block for catch access
    const startTime = Date.now();
    
    try {
      // Create agent run record
      [run] = await db.insert(agentRuns).values({
        tenantId: context.tenantId,
        agentId,
        status: 'running',
        inputData: input,
        startedAt: new Date(),
      }).returning();
      
      // Fetch agent configuration
      let agent;
      if (agentType === 'specialized') {
        [agent] = await db.select()
          .from(specializedAgents)
          .where(eq(specializedAgents.id, agentId))
          .limit(1);
      } else if (agentType === 'custom') {
        [agent] = await db.select()
          .from(customAgents)
          .where(eq(customAgents.id, agentId))
          .limit(1);
      } else if (agentType === 'library') {
        [agent] = await db.select()
          .from(agentsLibrary)
          .where(eq(agentsLibrary.id, agentId))
          .limit(1);
      }
      
      if (!agent) {
        await db.update(agentRuns)
          .set({
            status: 'failed',
            errorMessage: `Agent not found: ${agentId}`,
            completedAt: new Date(),
            durationMs: Date.now() - startTime
          })
          .where(eq(agentRuns.id, run.id));
          
        return {
          success: false,
          error: `Agent not found: ${agentId}`
        };
      }
      
      // Security: Verify tenant ownership (except for library agents)
      if (agentType !== 'library') {
        const agentWithTenant = agent as any;
        if (agentWithTenant.tenantId && agentWithTenant.tenantId !== context.tenantId) {
          await db.update(agentRuns)
            .set({
              status: 'failed',
              errorMessage: 'Unauthorized: Agent belongs to different tenant',
              completedAt: new Date(),
              durationMs: Date.now() - startTime
            })
            .where(eq(agentRuns.id, run.id));
            
          return {
            success: false,
            error: 'Unauthorized: Agent belongs to different tenant'
          };
        }
      }
      
      // Execute agent using multi-turn tool loop (similar to AssistBuildOrchestrator)
      let output: any;
      
      try {
        // Initialize Anthropic client
        const anthropic = new Anthropic({
          apiKey: process.env.ANTHROPIC_API_KEY
        });
        
        // Build system prompt
        const systemPrompt = (agent as any).systemPrompt || (agent as any).baseSystemPrompt || '';
        const model = (agent as any).model || (agent as any).defaultModel || 'claude-sonnet-4.5';
        const maxTokens = (agent as any).maxTokens || 4096;
        
        // Build messages array
        const messages: any[] = [{
          role: 'user',
          content: typeof input === 'string' ? input : JSON.stringify(input)
        }];
        
        // Get agent tools if configured
        let tools: any[] | undefined;
        if ((agent as any).tools && Array.isArray((agent as any).tools)) {
          // Agent has specific tools configured
          tools = ((agent as any).tools as string[]).map((toolName: string) => {
            const tool = toolRegistry.get(toolName);
            if (!tool) return null;
            
            const manifest = tool.manifest;
            return {
              name: manifest.name,
              description: manifest.description,
              input_schema: {
                type: 'object' as const,
                properties: manifest.parameters.reduce((acc, param) => {
                  const propDef: any = {
                    type: param.type,
                    description: param.description
                  };

                  // 🔧 For arrays, include 'items' definition (CRITICAL for Anthropic Function Calling)
                  if (param.type === 'array' && (param as any).items) {
                    propDef.items = (param as any).items;
                  }

                  // 🔧 For objects, include 'properties' definition
                  if (param.type === 'object' && (param as any).properties) {
                    propDef.properties = (param as any).properties;
                  }

                  // ✅ Handle enum values (critical for constrained parameters)
                  if ((param as any).enum) {
                    propDef.enum = (param as any).enum;
                  }

                  acc[param.name] = propDef;
                  return acc;
                }, {} as any),
                required: manifest.parameters.filter(p => p.required).map(p => p.name)
              }
            };
          }).filter(Boolean);
        }
        
        // Initial API call
        let response = await anthropic.messages.create({
          model,
          max_tokens: maxTokens,
          system: systemPrompt,
          messages,
          ...(tools && tools.length > 0 ? { tools } : {})
        });
        
        // Multi-turn tool execution loop (like AssistBuildOrchestrator)
        let iterations = 0;
        const maxIterations = 10;
        
        while (response.stop_reason === 'tool_use' && iterations < maxIterations) {
          iterations++;
          
          const toolUseBlocks = response.content.filter(block => block.type === 'tool_use');
          const toolResults = [];
          
          console.log(`[RunAgentAction] Executing ${toolUseBlocks.length} tools (iteration ${iterations})`);
          
          for (const toolUse of toolUseBlocks as any[]) {
            try {
              // Execute tool via toolRegistry
              const result = await toolRegistry.execute(
                toolUse.name,
                toolUse.input,
                {
                  tenantId: context.tenantId!,
                  userId: context.userId || '',
                  environment: 'sandbox'
                }
              );
              
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify(result.success ? result.data : result.error)
              });
            } catch (toolError) {
              console.error(`[RunAgentAction] Tool execution error for ${toolUse.name}:`, toolError);
              toolResults.push({
                type: 'tool_result',
                tool_use_id: toolUse.id,
                content: JSON.stringify({ error: 'Tool execution failed' })
              });
            }
          }
          
          // Add assistant response and tool results to messages
          messages.push({ role: 'assistant', content: response.content });
          messages.push({ role: 'user', content: toolResults });
          
          // Continue conversation
          response = await anthropic.messages.create({
            model,
            max_tokens: maxTokens,
            system: systemPrompt,
            messages,
            ...(tools && tools.length > 0 ? { tools } : {})
          });
        }
        
        // Extract final text response
        const finalResponse = response.content.find(block => block.type === 'text');
        const responseText = finalResponse ? (finalResponse as any).text : 'Operação concluída.';
        
        output = {
          response: responseText,
          agentName: agent.name,
          agentType,
          iterations,
          executedAt: new Date().toISOString()
        }
        
      } catch (agentError) {
        // If agent execution fails, update run and return error
        await db.update(agentRuns)
          .set({
            status: 'failed',
            errorMessage: agentError instanceof Error ? agentError.message : 'Agent execution error',
            errorStack: agentError instanceof Error ? agentError.stack : undefined,
            completedAt: new Date(),
            durationMs: Date.now() - startTime
          })
          .where(eq(agentRuns.id, run.id));
          
        return {
          success: false,
          error: agentError instanceof Error ? agentError.message : 'Agent execution error'
        };
      }
      
      // Update run record with success
      await db.update(agentRuns)
        .set({
          status: 'completed',
          outputData: output,
          completedAt: new Date(),
          durationMs: Date.now() - startTime
        })
        .where(eq(agentRuns.id, run.id));
      
      return {
        success: true,
        output: {
          runId: run.id,
          result: output
        }
      };
      
    } catch (error) {
      // Update agentRuns status to failed if run was created
      // Note: run might not exist if error happened before insertion
      try {
        if (run?.id) {
          await db.update(agentRuns)
            .set({
              status: 'failed',
              errorMessage: error instanceof Error ? error.message : 'Unknown error',
              errorStack: error instanceof Error ? error.stack : undefined,
              completedAt: new Date(),
              durationMs: Date.now() - startTime
            })
            .where(eq(agentRuns.id, run.id));
        }
      } catch (updateError) {
        console.error('[RunAgentAction] Failed to update run status:', updateError);
      }
      
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error executing agent'
      };
    }
  }
}
