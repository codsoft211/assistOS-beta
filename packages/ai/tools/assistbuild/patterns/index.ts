import { GetPatternSuggestionsTool } from './get-pattern-suggestions';
import { SearchPatternsTool } from './search-patterns';
import { GetPatternAdoptionStatsTool } from './get-pattern-adoption-stats';
import { toolRegistry } from '../../kernel';

// Instantiate and register all pattern tools
export const patternTools = [
  new GetPatternSuggestionsTool(),
  new SearchPatternsTool(),
  new GetPatternAdoptionStatsTool()
];

// Auto-register on import
for (const tool of patternTools) {
  toolRegistry.register(tool);
}

export {
  GetPatternSuggestionsTool,
  SearchPatternsTool,
  GetPatternAdoptionStatsTool
};
