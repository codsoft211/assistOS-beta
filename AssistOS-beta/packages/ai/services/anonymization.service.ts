import crypto from 'crypto';
import type { SelectDetectedPattern, SelectUserAction } from '../../../shared/schema';

export interface AnonymizedPattern {
  id: string; // Deterministic hash from anonymized sequence
  type: 'sequential' | 'temporal' | 'conditional';
  category: string;
  sequence: Array<{
    actionType: string;
    toolName?: string;
    category?: string;
  }>;
  occurrences: number;
  confidence: number;
  firstSeen: Date;
  lastSeen: Date;
  successRate?: number;
}

export class AnonymizationService {
  /**
   * Anonymize a detected pattern by stripping all tenant-specific data
   * 
   * Privacy guarantees:
   * - No tenant IDs
   * - No user IDs
   * - No sensitive metadata (entity names, specific values, etc.)
   * - Only structural pattern remains (sequence of actions)
   */
  anonymizePattern(pattern: SelectDetectedPattern): AnonymizedPattern {
    // 1. Anonymize sequence (remove any potential PII/sensitive data)
    const anonymizedSequence = pattern.sequence.map(step => ({
      actionType: step.actionType,
      toolName: step.toolName,
      category: step.category,
      // Explicitly exclude any metadata that could identify tenant
    }));

    // 2. Generate deterministic ID from anonymized sequence
    const id = this.generatePatternHash(anonymizedSequence);

    // 3. Categorize pattern
    const category = this.inferCategory(anonymizedSequence);

    // 4. Calculate success rate (if available)
    const successRate = this.estimateSuccessRate(pattern);

    return {
      id,
      type: pattern.type as 'sequential' | 'temporal' | 'conditional',
      category,
      sequence: anonymizedSequence,
      occurrences: pattern.occurrences,
      confidence: pattern.confidence,
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
      successRate,
    };
  }

  /**
   * Anonymize multiple patterns from different tenants
   * Aggregates identical patterns
   */
  anonymizeAndAggregate(patterns: SelectDetectedPattern[]): AnonymizedPattern[] {
    const aggregatedMap = new Map<string, AnonymizedPattern>();

    for (const pattern of patterns) {
      const anonymized = this.anonymizePattern(pattern);

      if (!aggregatedMap.has(anonymized.id)) {
        aggregatedMap.set(anonymized.id, anonymized);
      } else {
        // Aggregate metrics
        const existing = aggregatedMap.get(anonymized.id)!;
        existing.occurrences += anonymized.occurrences;
        existing.confidence = (existing.confidence + anonymized.confidence) / 2;
        
        if (anonymized.successRate !== undefined && existing.successRate !== undefined) {
          existing.successRate = (existing.successRate + anonymized.successRate) / 2;
        }

        // Update time range
        if (anonymized.firstSeen < existing.firstSeen) {
          existing.firstSeen = anonymized.firstSeen;
        }
        if (anonymized.lastSeen > existing.lastSeen) {
          existing.lastSeen = anonymized.lastSeen;
        }
      }
    }

    return Array.from(aggregatedMap.values());
  }

  /**
   * Generate deterministic hash for pattern matching
   */
  private generatePatternHash(sequence: Array<{actionType: string; toolName?: string; category?: string}>): string {
    const signature = sequence
      .map(s => `${s.toolName || s.actionType}:${s.category || 'general'}`)
      .join('→');
    
    return crypto
      .createHash('sha256')
      .update(signature)
      .digest('hex')
      .substring(0, 16);
  }

  /**
   * Infer category from sequence
   */
  private inferCategory(sequence: Array<{actionType: string; toolName?: string; category?: string}>): string {
    // Count category frequencies
    const categoryCounts = new Map<string, number>();
    
    for (const step of sequence) {
      const cat = step.category || 'general';
      categoryCounts.set(cat, (categoryCounts.get(cat) || 0) + 1);
    }

    // Return most frequent category
    let maxCount = 0;
    let dominantCategory = 'general';
    
    for (const [cat, count] of Array.from(categoryCounts.entries())) {
      if (count > maxCount) {
        maxCount = count;
        dominantCategory = cat;
      }
    }

    return dominantCategory;
  }

  /**
   * Estimate success rate from pattern metadata
   * In future, this could integrate with workflow execution metrics
   */
  private estimateSuccessRate(pattern: SelectDetectedPattern): number {
    // For now, use confidence as proxy for success rate
    // In future: join with workflow execution results
    return pattern.confidence;
  }

  /**
   * Validate that pattern is fully anonymized (no PII)
   * Used for testing and compliance
   */
  isFullyAnonymized(pattern: AnonymizedPattern): boolean {
    // Check that no sensitive keys exist
    const sensitiveKeys = ['tenantId', 'userId', 'email', 'name', 'phone'];
    const patternStr = JSON.stringify(pattern);
    
    return !sensitiveKeys.some(key => patternStr.includes(key));
  }

  /**
   * Generate privacy report for auditing
   */
  generatePrivacyReport(patterns: AnonymizedPattern[]): {
    totalPatterns: number;
    fullyAnonymized: number;
    privacyCompliance: number; // 0-1
  } {
    const fullyAnonymized = patterns.filter(p => this.isFullyAnonymized(p)).length;
    
    return {
      totalPatterns: patterns.length,
      fullyAnonymized,
      privacyCompliance: patterns.length > 0 ? fullyAnonymized / patterns.length : 1,
    };
  }
}

export const anonymizationService = new AnonymizationService();
