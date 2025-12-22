import { db } from '../../../apps/api/db';
import { userActions, type SelectUserAction } from '../../../shared/schema';
import { eq, and, gte, desc } from 'drizzle-orm';
import { subDays, differenceInDays } from 'date-fns';
import crypto from 'crypto';

export interface DetectedPattern {
  id: string;  // Deterministic hash based on sequence
  type: 'sequential' | 'temporal' | 'conditional';
  sequence: Array<{
    actionType: string;
    toolName?: string;
    category?: string;
  }>;
  occurrences: number;
  confidence: number; // 0-1
  suggestedWorkflow: {
    name: string;
    description: string;
    trigger: string;
    actions: string[];
  };
  firstSeen: Date;
  lastSeen: Date;
}

export class PatternDetector {
  /**
   * Detect patterns in user actions
   */
  async detectPatterns(
    tenantId: string,
    userId: string,
    minOccurrences: number = 3,
    windowDays: number = 30
  ): Promise<DetectedPattern[]> {
    // 1. Get recent actions
    const cutoffDate = subDays(new Date(), windowDays);
    const actions = await db.query.userActions.findMany({
      where: and(
        eq(userActions.tenantId, tenantId),
        eq(userActions.userId, userId),
        gte(userActions.createdAt, cutoffDate)
      ),
      orderBy: [userActions.createdAt],
      limit: 1000,
    });

    if (actions.length < minOccurrences) {
      return [];
    }

    // 2. Extract sequences
    const sequences = this.extractSequences(actions);

    // 3. Count occurrences
    const patterns = this.countPatterns(sequences, minOccurrences);

    // 4. Generate workflow suggestions
    return patterns.map(p => this.generateWorkflowSuggestion(p));
  }

  /**
   * Extract sequences of actions
   * Window: 5 minutes between actions to be considered same sequence
   */
  private extractSequences(actions: SelectUserAction[]): Array<SelectUserAction[]> {
    const sequences: Array<SelectUserAction[]> = [];
    let currentSequence: SelectUserAction[] = [];
    const MAX_GAP_MINUTES = 5;

    for (let i = 0; i < actions.length; i++) {
      const action = actions[i];
      const prevAction = i > 0 ? actions[i - 1] : null;

      if (!prevAction) {
        currentSequence = [action];
        continue;
      }

      const timeDiff = Math.abs(
        new Date(action.createdAt).getTime() - new Date(prevAction.createdAt).getTime()
      ) / (1000 * 60); // minutes

      if (timeDiff <= MAX_GAP_MINUTES) {
        // Same sequence
        currentSequence.push(action);
      } else {
        // New sequence
        if (currentSequence.length >= 2) {
          sequences.push([...currentSequence]);
        }
        currentSequence = [action];
      }
    }

    // Add last sequence
    if (currentSequence.length >= 2) {
      sequences.push(currentSequence);
    }

    return sequences;
  }

  /**
   * Count pattern occurrences
   */
  private countPatterns(
    sequences: Array<SelectUserAction[]>,
    minOccurrences: number
  ): Array<{
    sequence: Array<{actionType: string; toolName?: string; category?: string}>;
    occurrences: number;
    firstSeen: Date;
    lastSeen: Date;
  }> {
    // Group by sequence signature
    const patternMap = new Map<string, {
      sequence: Array<{actionType: string; toolName?: string; category?: string}>;
      occurrences: number;
      firstSeen: Date;
      lastSeen: Date;
      rawSequences: Array<SelectUserAction[]>;
    }>();

    for (const seq of sequences) {
      const signature = this.getSequenceSignature(seq);
      
      if (!patternMap.has(signature)) {
        patternMap.set(signature, {
          sequence: seq.map(a => ({
            actionType: a.actionType,
            toolName: a.toolName || undefined,
            category: a.category || undefined,
          })),
          occurrences: 0,
          firstSeen: new Date(seq[0].createdAt),
          lastSeen: new Date(seq[seq.length - 1].createdAt),
          rawSequences: [],
        });
      }

      const pattern = patternMap.get(signature)!;
      pattern.occurrences++;
      pattern.rawSequences.push(seq);
      
      const seqFirstDate = new Date(seq[0].createdAt);
      const seqLastDate = new Date(seq[seq.length - 1].createdAt);
      
      if (seqFirstDate < pattern.firstSeen) {
        pattern.firstSeen = seqFirstDate;
      }
      if (seqLastDate > pattern.lastSeen) {
        pattern.lastSeen = seqLastDate;
      }
    }

    // Filter by min occurrences
    return Array.from(patternMap.values())
      .filter(p => p.occurrences >= minOccurrences)
      .map(({ rawSequences, ...rest }) => rest);
  }

  /**
   * Get sequence signature for grouping
   */
  private getSequenceSignature(seq: SelectUserAction[]): string {
    return seq.map(a => `${a.toolName || a.actionType}:${a.category || 'general'}`).join('→');
  }

  /**
   * Generate workflow suggestion from pattern
   */
  private generateWorkflowSuggestion(pattern: {
    sequence: Array<{actionType: string; toolName?: string; category?: string}>;
    occurrences: number;
    firstSeen: Date;
    lastSeen: Date;
  }): DetectedPattern {
    const id = crypto.createHash('sha256')
      .update(JSON.stringify(pattern.sequence))
      .digest('hex')
      .substring(0, 16);

    // Calculate confidence based on occurrences and consistency
    const confidence = Math.min(pattern.occurrences / 10, 1);

    // Generate workflow description
    const stepDescriptions = pattern.sequence.map(s => 
      s.toolName || s.actionType
    );

    const name = `Workflow: ${stepDescriptions.slice(0, 3).join(' → ')}`;
    const description = `Detectado ${pattern.occurrences}x nos últimos ${
      differenceInDays(pattern.lastSeen, pattern.firstSeen)
    } dias`;

    return {
      id,
      type: 'sequential',
      sequence: pattern.sequence,
      occurrences: pattern.occurrences,
      confidence,
      suggestedWorkflow: {
        name,
        description,
        trigger: `Quando executar ${pattern.sequence[0].toolName || pattern.sequence[0].actionType}`,
        actions: stepDescriptions.slice(1),
      },
      firstSeen: pattern.firstSeen,
      lastSeen: pattern.lastSeen,
    };
  }
}

export const patternDetector = new PatternDetector();
