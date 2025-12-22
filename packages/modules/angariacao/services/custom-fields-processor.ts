/**
 * Custom Fields Processor
 * Handles advanced field types: auto_number, currency, computed
 */

import { SequenceService } from '../../../../apps/api/services/sequence.service';

interface FieldConfig {
  type: string;
  config?: any;
  name: string;
  label: string;
}

interface ProcessedFields {
  [key: string]: any;
}

export class CustomFieldsProcessor {
  
  /**
   * Process custom fields during lead creation
   * - Generates auto_numbers via SequenceService
   * - Evaluates computed formulas
   * - Formats currency values
   */
  static async processFields(
    fields: FieldConfig[],
    inputData: any,
    tenantId: string
  ): Promise<ProcessedFields> {
    const processed: ProcessedFields = {};
    
    for (const field of fields) {
      const inputValue = inputData[field.name];
      
      switch (field.type) {
        case 'auto_number':
          processed[field.name] = await this.generateAutoNumber(field, tenantId);
          break;
          
        case 'currency':
          processed[field.name] = this.processCurrency(inputValue, field.config);
          break;
          
        case 'computed':
          processed[field.name] = this.evaluateFormula(field, inputData);
          break;
          
        case 'text_multiline':
          processed[field.name] = inputValue || null;
          break;
          
        default:
          // Basic types (text, number, select, etc) - pass through
          processed[field.name] = inputValue;
      }
    }
    
    return processed;
  }
  
  /**
   * Generate auto-number using SequenceService
   */
  private static async generateAutoNumber(
    field: FieldConfig,
    tenantId: string
  ): Promise<string> {
    const { pattern, entityType } = field.config || {};
    
    if (!pattern || !entityType) {
      throw new Error(`auto_number field "${field.name}" missing config.pattern or config.entityType`);
    }
    
    // Extract prefix from pattern (e.g., "PROP-{YYYY}-{SEQ3}" → "PROP")
    const prefix = pattern.split('-')[0] || 'AUTO';
    
    // Generate next code using existing SequenceService
    const code = await SequenceService.getNextCode({
      tenantId,
      entityType: entityType as any,
      prefix,
      paddingLength: this.extractPaddingLength(pattern)
    });
    
    // Apply pattern transformations (YYYY for year, etc)
    return this.applyPattern(code, pattern);
  }
  
  /**
   * Extract padding length from pattern
   * {SEQ3} → 3, {SEQ4} → 4, default → 4
   */
  private static extractPaddingLength(pattern: string): number {
    const match = pattern.match(/\{SEQ(\d+)\}/);
    return match ? parseInt(match[1], 10) : 4;
  }
  
  /**
   * Apply pattern transformations
   * PROP-{YYYY}-{SEQ3} + "PROP-0001" → "PROP-2025-001"
   */
  private static applyPattern(code: string, pattern: string): string {
    const currentYear = new Date().getFullYear();
    
    // Replace {YYYY} with current year
    let result = pattern.replace('{YYYY}', currentYear.toString());
    
    // Extract sequence number from generated code
    const seqMatch = code.match(/\d+$/);
    const seqNumber = seqMatch ? seqMatch[0] : '0001';
    
    // Replace {SEQn} with sequence number
    result = result.replace(/\{SEQ\d+\}/, seqNumber);
    
    return result;
  }
  
  /**
   * Process currency field
   * Stores as decimal, attaches currency code
   */
  private static processCurrency(
    value: any,
    config?: { currencyCode?: string; decimalPlaces?: number }
  ): any {
    if (value === null || value === undefined) {
      return null;
    }
    
    const currencyCode = config?.currencyCode || 'EUR';
    const decimalPlaces = config?.decimalPlaces || 2;
    
    // Parse to number and round to specified decimal places
    const numericValue = typeof value === 'string' ? parseFloat(value) : value;
    const roundedValue = Number(numericValue.toFixed(decimalPlaces));
    
    return {
      value: roundedValue,
      currency: currencyCode
    };
  }
  
  /**
   * Evaluate computed formula
   * SAFE evaluation - only allows basic arithmetic on whitelisted fields
   */
  private static evaluateFormula(
    field: FieldConfig,
    inputData: any
  ): number | null {
    const { formula, dependencies, allowOverride } = field.config || {};
    
    if (!formula || !dependencies) {
      throw new Error(`computed field "${field.name}" missing config.formula or config.dependencies`);
    }
    
    // If manual override is allowed and value is provided, use it
    if (allowOverride && inputData[field.name] !== undefined) {
      return inputData[field.name];
    }
    
    // Check all dependencies are present
    for (const dep of dependencies) {
      if (inputData[dep] === undefined || inputData[dep] === null) {
        return null; // Cannot compute without all dependencies
      }
    }
    
    // SAFE evaluation - only basic arithmetic
    try {
      return this.safeEvaluate(formula, inputData);
    } catch (error) {
      console.error(`[CustomFieldsProcessor] Formula evaluation error for ${field.name}:`, error);
      return null;
    }
  }
  
  /**
   * Safe formula evaluator
   * ONLY allows: +, -, *, /, (), numbers, and whitelisted variable names
   */
  private static safeEvaluate(formula: string, variables: any): number {
    // Replace variable names with their values
    let expression = formula;
    
    for (const [key, value] of Object.entries(variables)) {
      const numValue = typeof value === 'string' ? parseFloat(value) : value;
      if (typeof numValue === 'number' && !isNaN(numValue)) {
        expression = expression.replace(new RegExp(key, 'g'), numValue.toString());
      }
    }
    
    // Validate expression contains only safe characters
    if (!/^[\d\s+\-*/.()]+$/.test(expression)) {
      throw new Error('Formula contains invalid characters');
    }
    
    // Evaluate using Function constructor (safe for arithmetic only)
    const result = new Function(`return ${expression}`)();
    
    if (typeof result !== 'number' || isNaN(result)) {
      throw new Error('Formula did not evaluate to a number');
    }
    
    return result;
  }
}
