import { describe, it, expect, beforeEach } from 'vitest';
import { createProgressTracker, ProgressTracker, ProgressSnapshot } from '../packages/ai/agents/assistme/utils/progress-tracker';

describe('ProgressTracker - Regression Tests', () => {
  let tracker: ProgressTracker;
  let emittedEvents: ProgressSnapshot[];

  beforeEach(() => {
    emittedEvents = [];
    const mockEmitFn = (snapshot: ProgressSnapshot) => {
      emittedEvents.push(snapshot);
    };
    tracker = createProgressTracker(mockEmitFn, 'moderate', 'test-operation');
  });

  describe('Percentage Bounds', () => {
    it('should start at 0%', () => {
      expect(emittedEvents.length).toBe(0);
    });

    it('should never exceed 100%', () => {
      tracker.startStage('analyzing', 'Analyzing request');
      tracker.completeStage();
      tracker.startStage('planning', 'Planning response');
      tracker.completeStage();
      tracker.startStage('executing', 'Executing tools');
      tracker.completeStage();
      tracker.startStage('synthesizing', 'Synthesizing response');
      tracker.completeStage();
      tracker.complete();

      for (const event of emittedEvents) {
        expect(event.percentage).toBeGreaterThanOrEqual(0);
        expect(event.percentage).toBeLessThanOrEqual(100);
      }
    });

    it('should reach exactly 100% on complete()', () => {
      tracker.startStage('analyzing', 'Analyzing');
      tracker.complete();

      const lastEvent = emittedEvents[emittedEvents.length - 1];
      expect(lastEvent.percentage).toBe(100);
    });
  });

  describe('Monotonic Progress', () => {
    it('should never decrease percentage', () => {
      tracker.startStage('analyzing', 'Analyzing');
      tracker.updateProgress('Still analyzing');
      tracker.completeStage();
      tracker.startStage('planning', 'Planning');
      tracker.updateProgress('Still planning');
      tracker.completeStage();

      let previousPercentage = 0;
      for (const event of emittedEvents) {
        expect(event.percentage).toBeGreaterThanOrEqual(previousPercentage);
        previousPercentage = event.percentage;
      }
    });

    it('should progress through all stages without regression', () => {
      const stages = ['analyzing', 'planning', 'executing', 'synthesizing'];
      
      for (const stage of stages) {
        tracker.startStage(stage, `Starting ${stage}`);
        tracker.updateProgress(`Working on ${stage}`);
        tracker.completeStage();
      }

      let previousPercentage = 0;
      for (const event of emittedEvents) {
        expect(event.percentage).toBeGreaterThanOrEqual(previousPercentage);
        previousPercentage = event.percentage;
      }
    });
  });

  describe('Stage Transitions', () => {
    it('should properly transition from analyzing to planning', () => {
      tracker.startStage('analyzing', 'Analyzing request');
      const analyzingEvents = emittedEvents.filter(e => e.currentStage === 'analyzing');
      expect(analyzingEvents.length).toBeGreaterThan(0);

      tracker.completeStage();
      tracker.startStage('planning', 'Planning response');
      
      const planningEvents = emittedEvents.filter(e => e.currentStage === 'planning');
      expect(planningEvents.length).toBeGreaterThan(0);

      const lastAnalyzing = analyzingEvents[analyzingEvents.length - 1];
      const firstPlanning = planningEvents[0];
      expect(firstPlanning.percentage).toBeGreaterThan(lastAnalyzing.percentage);
    });

    it('should handle routing -> planning transition without double-counting', () => {
      tracker.startStage('analyzing', 'Analyzing');
      tracker.completeStage();
      
      // Simulate routing (which should transition to planning)
      tracker.startStage('planning', 'Routing to tools');
      const firstPlanningPercentage = emittedEvents[emittedEvents.length - 1].percentage;

      // Simulate subsequent planning updates (should NOT restart stage)
      tracker.updateProgress('Planning tool execution');
      const secondPlanningPercentage = emittedEvents[emittedEvents.length - 1].percentage;

      // Percentage should increase or stay same, not jump
      expect(secondPlanningPercentage).toBeGreaterThanOrEqual(firstPlanningPercentage);
      expect(secondPlanningPercentage - firstPlanningPercentage).toBeLessThan(10); // Should be incremental
    });

    it('should handle formatting as sub-stage without double-counting', () => {
      tracker.startStage('synthesizing', 'Synthesizing response');
      const firstSynthPercentage = emittedEvents[emittedEvents.length - 1].percentage;

      // Formatting should update progress, not restart
      tracker.updateProgress('Formatting output');
      const formattingPercentage = emittedEvents[emittedEvents.length - 1].percentage;

      expect(formattingPercentage).toBeGreaterThanOrEqual(firstSynthPercentage);
      expect(formattingPercentage - firstSynthPercentage).toBeLessThan(10); // Incremental, not jump
    });
  });

  describe('Stage Weight Distribution', () => {
    it('should distribute progress across all stages', () => {
      const stages = ['analyzing', 'planning', 'executing', 'synthesizing'];
      const stagePercentages: number[] = [];

      for (const stage of stages) {
        tracker.startStage(stage, `Starting ${stage}`);
        tracker.updateProgress(`Working on ${stage}`);
        tracker.completeStage();
        
        // Record the final percentage after completing this stage
        if (emittedEvents.length > 0) {
          stagePercentages.push(emittedEvents[emittedEvents.length - 1].percentage);
        }
      }

      // Should have recorded percentages for all stages
      expect(stagePercentages.length).toBeGreaterThan(0);
      
      // Each successive stage should have higher or equal percentage
      for (let i = 1; i < stagePercentages.length; i++) {
        expect(stagePercentages[i]).toBeGreaterThanOrEqual(stagePercentages[i - 1]);
      }
    });
  });

  describe('Edge Cases', () => {
    it('should handle multiple updateProgress calls', () => {
      tracker.startStage('executing', 'Executing tools');
      
      for (let i = 0; i < 10; i++) {
        tracker.updateProgress(`Tool ${i} executing`);
      }

      // Should still be bounded
      for (const event of emittedEvents) {
        expect(event.percentage).toBeLessThanOrEqual(100);
      }

      // Should be monotonic
      let prev = 0;
      for (const event of emittedEvents) {
        expect(event.percentage).toBeGreaterThanOrEqual(prev);
        prev = event.percentage;
      }
    });

    it('should handle complete() without any stages', () => {
      tracker.complete();
      
      expect(emittedEvents.length).toBeGreaterThan(0);
      expect(emittedEvents[emittedEvents.length - 1].percentage).toBe(100);
    });

    it('should handle complete() in middle of stage', () => {
      tracker.startStage('analyzing', 'Analyzing');
      tracker.updateProgress('Partial progress');
      tracker.complete();

      expect(emittedEvents[emittedEvents.length - 1].percentage).toBe(100);
    });
  });

  describe('Historical Learning (ETA)', () => {
    it('should record stage duration', () => {
      tracker.startStage('analyzing', 'Analyzing');
      tracker.completeStage();

      // Duration should be recorded (tested indirectly via no errors)
      expect(() => tracker.startStage('planning', 'Planning')).not.toThrow();
    });

    it('should provide ETA after first run', () => {
      // First run - record baseline
      const tracker1 = createProgressTracker(() => {}, 'moderate', 'eta-test-1');
      tracker1.startStage('analyzing', 'Analyzing');
      tracker1.completeStage();
      tracker1.startStage('planning', 'Planning');
      tracker1.completeStage();
      tracker1.complete();

      // Second run - should have ETA (tested indirectly)
      const tracker2 = createProgressTracker(() => {}, 'moderate', 'eta-test-2');
      tracker2.startStage('analyzing', 'Analyzing');
      // ETA calculation happens internally, we verify no errors
      expect(() => tracker2.updateProgress('Still analyzing')).not.toThrow();
    });
  });

  describe('Stress Test', () => {
    it('should handle rapid progress updates without exceeding bounds', () => {
      const stages = ['analyzing', 'planning', 'executing', 'synthesizing'];
      
      for (const stage of stages) {
        tracker.startStage(stage, `Starting ${stage}`);
        
        // Rapid updates
        for (let i = 0; i < 100; i++) {
          tracker.updateProgress(`Update ${i}`);
        }
        
        tracker.completeStage();
      }

      tracker.complete();

      // Verify all percentages are valid
      for (const event of emittedEvents) {
        expect(event.percentage).toBeGreaterThanOrEqual(0);
        expect(event.percentage).toBeLessThanOrEqual(100);
      }

      // Verify monotonic
      let prev = 0;
      for (const event of emittedEvents) {
        expect(event.percentage).toBeGreaterThanOrEqual(prev);
        prev = event.percentage;
      }

      // Verify final is 100%
      expect(emittedEvents[emittedEvents.length - 1].percentage).toBe(100);
    });
  });
});
