# AssistBuild Orchestrator

The **AssistBuild Orchestrator** is the central brain of the AssistBuild system, responsible for coordinating the execution of tools and the construction of enterprise platforms through natural conversation.

## Architecture

### Main Components

1. **Intent Analyzer**: Analyzes user requests and identifies intents
2. **Context Loader**: Loads tenant state, active modules, connectors
3. **Strategy Planner**: Decides the best approach (use existing vs. create new)
4. **Tool Executor**: Executes tools with progress tracking

### Execution Flow

```
User message → Intent analysis → Context loading → Strategy planning → Tool execution → Response
```

## Usage

```typescript
import { AssistBuildOrchestrator } from "@/packages/ai/agents/assistbuild";

const orchestrator = new AssistBuildOrchestrator({
  model: "claude-opus-4-20250514",
  temperature: 0.2,
  maxTokens: 8192,
});

const context = {
  tenantId: "tenant-123",
  activeModules: ["purchases", "finance"],
  connectors: [],
  agents: [],
  workflows: [],
  environment: "sandbox",
};

const response = await orchestrator.processMessage(
  "Creating an inventory management module",
  context,

  (progress) => console.log(progress)
);
```

## Configuration

Ensure that the environment variable `ANTHROPIC_API_KEY` is set.

## Types of Intent

- **discovery**: Explore modules and functionalities
- **configuration**: Configure existing modules
- **creation**: Create new components
- **modification**: Modify existing configurations
- **deployment**: Prepare and implement
- **help**: Obtain help and support

## Integration with ToolRegistry

The orchestrator uses the global `ToolRegistry` to discover and execute tools available in the system.
