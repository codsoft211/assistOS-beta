export * from './types';
export * from './orchestrator';
export { AssistBuildOrchestrator } from './orchestrator';

import { AssistBuildOrchestrator } from './orchestrator';
import { discoveryTools } from '../../tools/assistbuild/discovery';
import { configurationTools } from '../../tools/assistbuild/configuration';

// Singleton instance
export const assistBuildOrchestrator = new AssistBuildOrchestrator({
  model: 'gpt-4o',
  maxTokens: 8192,
  temperature: 0.3,
  tools: [
    ...discoveryTools.map(t => t.manifest),
    ...configurationTools.map(t => t.manifest)
  ]
});
