import type { ToolManifest, ToolExecutionContext, ToolExecutionResult } from './types';
import type { ToolBase } from './base';
import { actionTracker } from '../../services/action-tracker';
import { toolEmbeddingService } from '../../services/tool-embedding.service';

export class ToolRegistry {
  private tools: Map<string, ToolBase> = new Map();
  private categories: Map<string, Set<string>> = new Map();
  
  register(tool: ToolBase): void {
    const { name, category } = tool.manifest;
    
    if (this.tools.has(name)) {
      throw new Error(`Tool ${name} already registered`);
    }
    
    // 🔒 VALIDATION: Check for malformed array/object parameters
    this.validateManifest(tool.manifest);
    
    this.tools.set(name, tool);
    
    if (!this.categories.has(category)) {
      this.categories.set(category, new Set());
    }
    this.categories.get(category)!.add(name);
  }

  /**
   * Validate tool manifest for common schema errors
   */
  private validateManifest(manifest: ToolManifest): void {
    for (const param of manifest.parameters) {
      // ⚠️ Arrays must have 'items' definition (OpenAI Function Calling requirement)
      if (param.type === 'array' && !param.items) {
        console.warn(
          `[ToolRegistry] ⚠️  SCHEMA WARNING: Tool "${manifest.name}" param "${param.name}" ` +
          `has type 'array' but missing 'items' definition. This will fail OpenAI Function Calling validation. ` +
          `Add items: { type: 'string' } (or appropriate type) to the parameter manifest.`
        );
      }

      // ⚠️ Objects should have 'properties' definition for better validation
      if (param.type === 'object' && !param.properties) {
        console.warn(
          `[ToolRegistry] ⚠️  SCHEMA WARNING: Tool "${manifest.name}" param "${param.name}" ` +
          `has type 'object' but missing 'properties' definition. Consider adding properties for better validation.`
        );
      }
    }
  }
  
  get(name: string): ToolBase | undefined {
    return this.tools.get(name);
  }
  
  getByCategory(category: string): ToolBase[] {
    const toolNames = this.categories.get(category) || new Set();
    return Array.from(toolNames)
      .map(name => this.tools.get(name)!)
      .filter(Boolean);
  }
  
  getAllManifests(): ToolManifest[] {
    return Array.from(this.tools.values()).map(tool => tool.manifest);
  }
  
  async execute<T = any>(
    toolName: string,
    input: any,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<ToolExecutionResult<T>> {
    const tool = this.get(toolName);
    
    if (!tool) {
      return {
        success: false,
        error: {
          code: 'TOOL_NOT_FOUND',
          message: `Tool ${toolName} not found in registry`,
          recoverable: false
        }
      };
    }
    
    const startTime = Date.now();
    
    const result = await tool.execute(input, context, onProgress);
    
    const duration = Date.now() - startTime;
    
    if (context.tenantId && context.userId) {
      try {
        const affectedEntities = result.success ? this.extractAffectedEntities(result.data) : [];
        
        await actionTracker.trackToolExecution({
          tenantId: context.tenantId,
          userId: context.userId,
          toolName,
          category: tool.manifest.category,
          affectedEntities,
          metadata: {
            input: this.sanitizeInput(input),
            success: result.success,
            duration,
            ...(result.error && {
              error: {
                code: result.error.code,
                message: result.error.message,
                recoverable: result.error.recoverable,
              }
            }),
            ...result.metadata,
          },
        });
        
        // Track tool popularity for AI-powered tool selection (non-blocking)
        if (result.success) {
          toolEmbeddingService.trackToolExecution(toolName).catch(err => {
            console.error('[ToolRegistry] Failed to track tool popularity:', err);
          });
        }
      } catch (trackingError) {
        console.error('[ToolRegistry] Failed to track tool execution:', trackingError);
      }
    }
    
    return result;
  }
  
  private extractAffectedEntities(data: any): Array<{ type: string; id: string; name?: string }> {
    if (!data) return [];
    
    const entities: Array<{ type: string; id: string; name?: string }> = [];
    
    if (Array.isArray(data)) {
      for (const item of data.slice(0, 10)) {
        if (item && typeof item === 'object' && item.id) {
          entities.push({
            type: item.__typename || item.type || 'unknown',
            id: String(item.id),
            name: item.name || item.title || undefined,
          });
        }
      }
    } else if (data && typeof data === 'object') {
      if (data.id) {
        entities.push({
          type: data.__typename || data.type || 'unknown',
          id: String(data.id),
          name: data.name || data.title || undefined,
        });
      }
      
      if (data.created && typeof data.created === 'object' && data.created.id) {
        entities.push({
          type: data.created.__typename || data.created.type || 'created',
          id: String(data.created.id),
          name: data.created.name || data.created.title || undefined,
        });
      }
      
      if (data.updated && typeof data.updated === 'object' && data.updated.id) {
        entities.push({
          type: data.updated.__typename || data.updated.type || 'updated',
          id: String(data.updated.id),
          name: data.updated.name || data.updated.title || undefined,
        });
      }
    }
    
    return entities;
  }
  
  private sanitizeInput(input: any): any {
    if (!input || typeof input !== 'object') return input;
    
    const sanitized = { ...input };
    const sensitiveKeys = ['password', 'token', 'secret', 'apiKey', 'key'];
    
    for (const key of Object.keys(sanitized)) {
      if (sensitiveKeys.some(sk => key.toLowerCase().includes(sk))) {
        sanitized[key] = '[REDACTED]';
      }
    }
    
    return sanitized;
  }
}

export const toolRegistry = new ToolRegistry();
