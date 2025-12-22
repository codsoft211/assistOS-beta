import { ToolBase } from '../base';
import type { ToolDefinition, ToolExecutionContext, ToolManifest } from '../types';
import { z } from 'zod';

/**
 * Adapts ToolDefinition (object) to ToolBase (class) for unified registration
 * Enables new-style tools to work with existing toolRegistry
 */
export class ToolDefinitionAdapter extends ToolBase {
  public manifest: ToolManifest;

  constructor(private toolDef: ToolDefinition) {
    super();
    
    // Convert ToolDefinition to ToolManifest format
    this.manifest = {
      name: toolDef.name,
      category: toolDef.category,
      description: toolDef.description,
      parameters: this.extractParameters(toolDef.inputSchema),
      outputSchema: undefined, // ToolDefinition doesn't define output schema
      requiresAuth: true, // Default to true for security
      progressSupport: toolDef.progressSupport ?? false, // Use tool's progress support flag
    };
  }

  protected async executeInternal(
    input: any,
    context: ToolExecutionContext,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    // Call the ToolDefinition's execute function with progress callback
    const result = await this.toolDef.execute(input, context, onProgress);
    
    // Return just the data portion (ToolBase wrapper handles success/error)
    if (result.success) {
      return result.data;
    } else {
      throw new Error(result.error?.message || 'Tool execution failed');
    }
  }

  /**
   * Extract parameters from Zod schema via introspection
   */
  private extractParameters(schema: z.ZodType<any>): Array<{
    name: string;
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    description: string;
    required: boolean;
    schema?: z.ZodType<any>;
    items?: any;
    properties?: any;
  }> {
    const params: Array<{
      name: string;
      type: 'string' | 'number' | 'boolean' | 'object' | 'array';
      description: string;
      required: boolean;
      schema?: z.ZodType<any>;
      items?: any;
      properties?: any;
    }> = [];
    
    // Handle ZodObject
    if (schema instanceof z.ZodObject) {
      const shape = schema.shape;
      for (const [key, value] of Object.entries(shape)) {
        const paramType = this.zodTypeToJsonType(value as z.ZodType);
        const param: any = {
          name: key,
          type: paramType,
          required: !this.isOptional(value as z.ZodType),
          description: (value as any)._def?.description || `Parameter ${key}`,
          schema: value as z.ZodType<any>
        };

        // 🔧 For arrays, extract items definition (CRITICAL for OpenAI Function Calling)
        if (paramType === 'array') {
          const unwrappedValue = this.unwrapOptionalNullable(value as z.ZodType);
          if (unwrappedValue instanceof z.ZodArray) {
            const itemType = unwrappedValue._def.type;
            param.items = this.zodSchemaToJsonSchema(itemType);
          }
        }

        // 🔧 For objects, extract properties definition
        if (paramType === 'object') {
          const unwrappedValue = this.unwrapOptionalNullable(value as z.ZodType);
          if (unwrappedValue instanceof z.ZodObject) {
            param.properties = this.zodObjectToProperties(unwrappedValue);
          }
        }

        params.push(param);
      }
    }
    
    return params;
  }

  /**
   * Unwrap optional and nullable wrappers to get core type
   */
  private unwrapOptionalNullable(schema: z.ZodType): z.ZodType {
    let current = schema;
    while (current instanceof z.ZodOptional || current instanceof z.ZodNullable) {
      current = current.unwrap();
    }
    return current;
  }

  /**
   * Convert Zod schema to JSON schema definition
   */
  private zodSchemaToJsonSchema(schema: z.ZodType): any {
    const unwrapped = this.unwrapOptionalNullable(schema);
    
    if (unwrapped instanceof z.ZodString) {
      return { type: 'string' };
    }
    if (unwrapped instanceof z.ZodNumber) {
      return { type: 'number' };
    }
    if (unwrapped instanceof z.ZodBoolean) {
      return { type: 'boolean' };
    }
    if (unwrapped instanceof z.ZodObject) {
      return {
        type: 'object',
        properties: this.zodObjectToProperties(unwrapped)
      };
    }
    if (unwrapped instanceof z.ZodArray) {
      return {
        type: 'array',
        items: this.zodSchemaToJsonSchema(unwrapped._def.type)
      };
    }
    if (unwrapped instanceof z.ZodEnum) {
      return {
        type: 'string',
        enum: unwrapped._def.values
      };
    }
    
    return { type: 'string' }; // fallback
  }

  /**
   * Convert ZodObject to properties definition
   */
  private zodObjectToProperties(zodObject: z.ZodObject<any>): any {
    const properties: any = {};
    const shape = zodObject.shape;
    
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = this.zodSchemaToJsonSchema(value as z.ZodType);
    }
    
    return properties;
  }

  /**
   * Convert Zod type to JSON type string
   */
  private zodTypeToJsonType(schema: z.ZodType): 'string' | 'number' | 'boolean' | 'object' | 'array' {
    if (schema instanceof z.ZodString) return 'string';
    if (schema instanceof z.ZodNumber) return 'number';
    if (schema instanceof z.ZodBoolean) return 'boolean';
    if (schema instanceof z.ZodArray) return 'array';
    if (schema instanceof z.ZodObject) return 'object';
    if (schema instanceof z.ZodEnum) return 'string'; // enum → string
    if (schema instanceof z.ZodOptional) return this.zodTypeToJsonType(schema.unwrap());
    if (schema instanceof z.ZodNullable) return this.zodTypeToJsonType(schema.unwrap());
    return 'string'; // fallback
  }

  /**
   * Check if a Zod schema is optional
   */
  private isOptional(schema: z.ZodType): boolean {
    return schema instanceof z.ZodOptional || schema instanceof z.ZodNullable;
  }

  protected validateInput(input: any): any {
    // Use the ToolDefinition's inputSchema directly
    return this.toolDef.inputSchema.parse(input);
  }
}
