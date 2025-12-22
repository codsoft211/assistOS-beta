# Workflow Builder Architecture Plan
**Framework:** @xyflow/react  
**Principles:** SOLID, Scalability, Modularity  
**Created:** December 16, 2025

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    Workflow Builder UI                       │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ┌──────────────┐  ┌─────────────────┐  ┌──────────────┐  │
│  │   Toolbar    │  │   Canvas (Flow) │  │  Properties  │  │
│  │   Palette    │  │                 │  │     Panel    │  │
│  │              │  │   React Flow    │  │              │  │
│  │  Node Types  │  │   Components    │  │ Node Config  │  │
│  └──────────────┘  └─────────────────┘  └──────────────┘  │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                    State Management Layer                    │
│  ┌────────────────────────────────────────────────────────┐ │
│  │  Workflow Store (Zustand/Context)                      │ │
│  │  - Nodes, Edges, Selected Node, Validation State      │ │
│  └────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                      Service Layer                           │
│  ┌──────────────┐  ┌──────────────┐  ┌─────────────────┐  │
│  │ Node Factory │  │  Validator   │  │ Workflow Service│  │
│  │   Registry   │  │   Service    │  │   (API)         │  │
│  └──────────────┘  └──────────────┘  └─────────────────┘  │
└─────────────────────────────────────────────────────────────┘
```

## 2. SOLID Principles Application

### 2.1 Single Responsibility Principle (SRP)

Each component/class has ONE clear responsibility:

```typescript
// ✅ Good: Each component has single responsibility
components/
├── WorkflowCanvas.tsx          // Manages React Flow canvas
├── NodePalette.tsx             // Displays available node types
├── PropertiesPanel.tsx         // Handles node configuration
├── ValidationPanel.tsx         // Shows validation errors
├── WorkflowToolbar.tsx         // Workflow-level actions (save, run, etc)
└── nodes/
    ├── BaseNode.tsx            // Common node UI structure
    ├── ManualTriggerNode.tsx   // Manual trigger specific UI
    └── CrudRecordNode.tsx      // CRUD operation specific UI
```

### 2.2 Open/Closed Principle (OCP)

System is open for extension (new node types) but closed for modification:

```typescript
// Core system doesn't change when adding new nodes
// Node Registry Pattern
interface INodeDefinition {
  type: string;
  label: string;
  category: string;
  icon: LucideIcon;
  defaultConfig: Record<string, any>;
  configSchema: z.ZodSchema;
  component: React.ComponentType<NodeProps>;
}

class NodeRegistry {
  private nodes: Map<string, INodeDefinition> = new Map();
  
  register(definition: INodeDefinition): void {
    this.nodes.set(definition.type, definition);
  }
  
  get(type: string): INodeDefinition | undefined {
    return this.nodes.get(type);
  }
  
  getByCategory(category: string): INodeDefinition[] {
    return Array.from(this.nodes.values())
      .filter(n => n.category === category);
  }
}

// Adding new node type requires ZERO changes to core:
// 1. Create node component
// 2. Create node definition
// 3. Register it
nodeRegistry.register({
  type: 'email_notification',
  label: 'Send Email',
  category: 'notifications',
  icon: Mail,
  defaultConfig: { to: '', subject: '', body: '' },
  configSchema: emailSchema,
  component: EmailNotificationNode
});
```

### 2.3 Liskov Substitution Principle (LSP)

All node types are substitutable - they implement common interface:

```typescript
// Base interface that ALL nodes must implement
interface IWorkflowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: INodeData;
}

interface INodeData {
  label: string;
  config: Record<string, any>;
  
  // All nodes must implement these
  validate(): ValidationResult;
  getInputs(): NodeInput[];
  getOutputs(): NodeOutput[];
  serialize(): SerializedNode;
}

// Any node type can be used wherever IWorkflowNode is expected
function validateNode(node: IWorkflowNode): ValidationResult {
  return node.data.validate(); // Works for ANY node type
}
```

### 2.4 Interface Segregation Principle (ISP)

Multiple specific interfaces instead of one fat interface:

```typescript
// ❌ Bad: Fat interface forcing all nodes to implement everything
interface INode {
  render(): JSX.Element;
  validate(): ValidationResult;
  execute(): Promise<any>;
  configureLLM(): void;        // Not all nodes need this
  configureDatabase(): void;   // Not all nodes need this
  scheduleExecution(): void;   // Not all nodes need this
}

// ✅ Good: Segregated interfaces
interface IRenderable {
  render(): JSX.Element;
}

interface IValidatable {
  validate(): ValidationResult;
}

interface IExecutable {
  execute(context: ExecutionContext): Promise<ExecutionResult>;
}

interface IConfigurable {
  getConfigSchema(): z.ZodSchema;
  getConfigComponent(): React.ComponentType;
}

interface ISchedulable {
  getScheduleConfig(): ScheduleConfig;
}

// Nodes implement only what they need
class ManualTriggerNode implements IRenderable, IValidatable, IConfigurable {
  // No execute() - it's a trigger, not executed
  // No schedule() - manual triggers aren't scheduled
}

class ScheduledTriggerNode implements IRenderable, IValidatable, IConfigurable, ISchedulable {
  // Includes scheduling capabilities
}
```

### 2.5 Dependency Inversion Principle (DIP)

Depend on abstractions, not concrete implementations:

```typescript
// ❌ Bad: Direct dependency on concrete class
class WorkflowCanvas {
  private apiClient = new ApiClient(); // Concrete dependency
  
  async saveWorkflow() {
    await this.apiClient.post('/workflows', data);
  }
}

// ✅ Good: Depend on abstraction
interface IWorkflowService {
  save(workflow: Workflow): Promise<void>;
  load(id: string): Promise<Workflow>;
  validate(workflow: Workflow): ValidationResult;
}

class WorkflowCanvas {
  constructor(private workflowService: IWorkflowService) {} // Abstract dependency
  
  async saveWorkflow() {
    await this.workflowService.save(this.workflow);
  }
}

// Implementation can be swapped without changing WorkflowCanvas
class ApiWorkflowService implements IWorkflowService {
  async save(workflow: Workflow): Promise<void> {
    await apiRequest('/workflows', 'POST', workflow);
  }
  // ...
}

class MockWorkflowService implements IWorkflowService {
  async save(workflow: Workflow): Promise<void> {
    console.log('Mock save:', workflow);
  }
  // ...
}
```

## 3. Scalable Architecture

### 3.1 Folder Structure

```
client/src/
├── pages/
│   ├── workflows.tsx                    // Workflow list page
│   └── workflow-builder.tsx             // Builder page (new)
│
├── components/
│   └── workflow/
│       ├── canvas/
│       │   ├── WorkflowCanvas.tsx       // Main React Flow wrapper
│       │   ├── MiniMap.tsx              // Minimap component
│       │   ├── Controls.tsx             // Zoom/fit controls
│       │   └── Background.tsx           // Grid background
│       │
│       ├── nodes/
│       │   ├── BaseNode.tsx             // Base node component
│       │   ├── NodeWrapper.tsx          // Common wrapper with handles
│       │   ├── ManualTriggerNode.tsx    // Trigger node
│       │   ├── CrudRecordNode.tsx       // CRUD node
│       │   └── index.ts                 // Node exports
│       │
│       ├── edges/
│       │   ├── CustomEdge.tsx           // Custom edge styling
│       │   └── ConditionalEdge.tsx      // Future: conditional routing
│       │
│       ├── panels/
│       │   ├── NodePalette.tsx          // Drag-and-drop palette
│       │   ├── PropertiesPanel.tsx      // Node configuration
│       │   ├── ValidationPanel.tsx      // Error display
│       │   └── ExecutionPanel.tsx       // Run history
│       │
│       ├── toolbar/
│       │   ├── WorkflowToolbar.tsx      // Main toolbar
│       │   ├── ZoomControls.tsx         // Zoom buttons
│       │   └── LayoutControls.tsx       // Auto-layout
│       │
│       └── config/
│           ├── FormBuilder.tsx          // Dynamic form generator
│           ├── FieldMapping.tsx         // Visual field mapper
│           └── TemplateEditor.tsx       // Template variable editor
│
├── lib/
│   └── workflow/
│       ├── services/
│       │   ├── WorkflowService.ts       // API integration
│       │   ├── ValidationService.ts     // Validation logic
│       │   └── ExecutionService.ts      // Execution management
│       │
│       ├── registry/
│       │   ├── NodeRegistry.ts          // Node type registry
│       │   ├── nodeDefinitions.ts       // All node definitions
│       │   └── registerNodes.ts         // Registration bootstrap
│       │
│       ├── store/
│       │   ├── workflowStore.ts         // Zustand store
│       │   └── selectors.ts             // Memoized selectors
│       │
│       ├── validation/
│       │   ├── validators.ts            // Validation functions
│       │   ├── rules.ts                 // Validation rules
│       │   └── schemas.ts               // Zod schemas
│       │
│       ├── utils/
│       │   ├── layoutEngine.ts          // Auto-layout algorithm
│       │   ├── dagUtils.ts              // DAG operations
│       │   ├── serialization.ts         // Import/export
│       │   └── templateParser.ts        // {{variable}} parsing
│       │
│       └── types/
│           ├── workflow.types.ts        // Core types
│           ├── node.types.ts            // Node interfaces
│           └── execution.types.ts       // Execution types
│
└── hooks/
    └── workflow/
        ├── useWorkflow.ts               // Main workflow hook
        ├── useNodeSelection.ts          // Selection management
        ├── useValidation.ts             // Validation hook
        └── useExecution.ts              // Execution hook
```

### 3.2 State Management (Zustand)

```typescript
// lib/workflow/store/workflowStore.ts
import { create } from 'zustand';
import { Node, Edge, Connection } from '@xyflow/react';

interface WorkflowState {
  // State
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  validationErrors: ValidationError[];
  isExecuting: boolean;
  
  // Actions
  addNode: (node: Node) => void;
  updateNode: (id: string, data: Partial<Node['data']>) => void;
  deleteNode: (id: string) => void;
  addEdge: (connection: Connection) => void;
  deleteEdge: (id: string) => void;
  selectNode: (id: string | null) => void;
  setValidationErrors: (errors: ValidationError[]) => void;
  
  // Complex operations
  duplicateNode: (id: string) => void;
  autoLayout: () => void;
  validateWorkflow: () => ValidationError[];
  
  // Serialization
  serialize: () => SerializedWorkflow;
  deserialize: (data: SerializedWorkflow) => void;
}

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  nodes: [],
  edges: [],
  selectedNodeId: null,
  validationErrors: [],
  isExecuting: false,
  
  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node]
  })),
  
  updateNode: (id, data) => set((state) => ({
    nodes: state.nodes.map(node =>
      node.id === id ? { ...node, data: { ...node.data, ...data } } : node
    )
  })),
  
  deleteNode: (id) => set((state) => ({
    nodes: state.nodes.filter(n => n.id !== id),
    edges: state.edges.filter(e => e.source !== id && e.target !== id),
    selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId
  })),
  
  addEdge: (connection) => set((state) => ({
    edges: [...state.edges, {
      id: `e${connection.source}-${connection.target}`,
      source: connection.source!,
      target: connection.target!,
      type: 'custom'
    }]
  })),
  
  deleteEdge: (id) => set((state) => ({
    edges: state.edges.filter(e => e.id !== id)
  })),
  
  selectNode: (id) => set({ selectedNodeId: id }),
  
  setValidationErrors: (errors) => set({ validationErrors: errors }),
  
  validateWorkflow: () => {
    const { nodes, edges } = get();
    const errors = ValidationService.validate({ nodes, edges });
    set({ validationErrors: errors });
    return errors;
  },
  
  // ... other methods
}));
```

### 3.3 Node Registry System

```typescript
// lib/workflow/registry/NodeRegistry.ts
export interface INodeDefinition {
  type: string;
  label: string;
  description: string;
  category: 'trigger' | 'action' | 'condition' | 'integration';
  icon: LucideIcon;
  color: string;
  
  // Configuration
  defaultConfig: Record<string, any>;
  configSchema: z.ZodSchema;
  configComponent?: React.ComponentType<{ value: any; onChange: (v: any) => void }>;
  
  // Rendering
  component: React.ComponentType<NodeProps>;
  
  // Validation
  validate?: (data: any, workflow: Workflow) => ValidationError[];
  
  // Execution metadata
  inputs: NodeInput[];
  outputs: NodeOutput[];
  
  // Documentation
  helpUrl?: string;
  examples?: Example[];
}

export class NodeRegistry {
  private static instance: NodeRegistry;
  private definitions = new Map<string, INodeDefinition>();
  
  private constructor() {}
  
  static getInstance(): NodeRegistry {
    if (!NodeRegistry.instance) {
      NodeRegistry.instance = new NodeRegistry();
    }
    return NodeRegistry.instance;
  }
  
  register(definition: INodeDefinition): void {
    if (this.definitions.has(definition.type)) {
      throw new Error(`Node type '${definition.type}' already registered`);
    }
    this.definitions.set(definition.type, definition);
  }
  
  get(type: string): INodeDefinition {
    const definition = this.definitions.get(type);
    if (!definition) {
      throw new Error(`Node type '${type}' not found in registry`);
    }
    return definition;
  }
  
  getAll(): INodeDefinition[] {
    return Array.from(this.definitions.values());
  }
  
  getByCategory(category: string): INodeDefinition[] {
    return this.getAll().filter(d => d.category === category);
  }
}

// Singleton export
export const nodeRegistry = NodeRegistry.getInstance();
```

### 3.4 Node Definitions

```typescript
// lib/workflow/registry/nodeDefinitions.ts
import { Play, Database, Code, Mail, Clock } from 'lucide-react';
import { z } from 'zod';

export const manualTriggerDefinition: INodeDefinition = {
  type: 'manual_trigger',
  label: 'Manual Trigger',
  description: 'Start workflow manually with input data',
  category: 'trigger',
  icon: Play,
  color: 'bg-green-500',
  
  defaultConfig: {
    label: 'Start'
  },
  
  configSchema: z.object({
    label: z.string().min(1, 'Label required')
  }),
  
  component: ManualTriggerNode,
  
  inputs: [],
  outputs: [
    { id: 'trigger', label: 'Trigger Data', type: 'any' }
  ],
  
  validate: (data) => {
    const errors: ValidationError[] = [];
    if (!data.label) {
      errors.push({
        nodeId: data.id,
        field: 'label',
        message: 'Label is required'
      });
    }
    return errors;
  }
};

export const crudRecordDefinition: INodeDefinition = {
  type: 'crud_record',
  label: 'CRUD Operation',
  description: 'Create, read, update, or delete records',
  category: 'action',
  icon: Database,
  color: 'bg-blue-500',
  
  defaultConfig: {
    operation: 'create',
    module: '',
    fields: {}
  },
  
  configSchema: z.object({
    operation: z.enum(['create', 'read', 'update', 'delete']),
    module: z.string().min(1, 'Module required'),
    fields: z.record(z.any()),
    condition: z.string().optional()
  }),
  
  configComponent: CrudRecordConfig,
  component: CrudRecordNode,
  
  inputs: [
    { id: 'data', label: 'Input Data', type: 'object' }
  ],
  outputs: [
    { id: 'result', label: 'Result', type: 'object' },
    { id: 'error', label: 'Error', type: 'error' }
  ],
  
  validate: (data) => {
    const errors: ValidationError[] = [];
    if (!data.config.module) {
      errors.push({
        nodeId: data.id,
        field: 'module',
        message: 'Module is required'
      });
    }
    if (Object.keys(data.config.fields).length === 0) {
      errors.push({
        nodeId: data.id,
        field: 'fields',
        message: 'At least one field must be configured'
      });
    }
    return errors;
  },
  
  helpUrl: 'https://docs.assistos.com/nodes/crud-record'
};

// Easy to add new nodes:
export const emailNotificationDefinition: INodeDefinition = {
  type: 'email_notification',
  label: 'Send Email',
  description: 'Send email notifications',
  category: 'integration',
  icon: Mail,
  color: 'bg-purple-500',
  
  defaultConfig: {
    to: '',
    subject: '',
    body: ''
  },
  
  configSchema: z.object({
    to: z.string().email('Invalid email'),
    subject: z.string().min(1, 'Subject required'),
    body: z.string().min(1, 'Body required'),
    cc: z.string().optional(),
    bcc: z.string().optional()
  }),
  
  component: EmailNotificationNode,
  
  inputs: [
    { id: 'data', label: 'Email Data', type: 'object' }
  ],
  outputs: [
    { id: 'sent', label: 'Sent', type: 'boolean' }
  ]
};

// Registration
export function registerAllNodes() {
  nodeRegistry.register(manualTriggerDefinition);
  nodeRegistry.register(crudRecordDefinition);
  nodeRegistry.register(emailNotificationDefinition);
  // Add more as needed...
}
```

### 3.5 Base Node Component

```typescript
// components/workflow/nodes/BaseNode.tsx
import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { cn } from '@/lib/utils';

export interface BaseNodeData {
  label: string;
  config: Record<string, any>;
  isValid?: boolean;
  errors?: string[];
}

export const BaseNode = memo(({ id, type, data, selected }: NodeProps<BaseNodeData>) => {
  const definition = nodeRegistry.get(type);
  const Icon = definition.icon;
  
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white shadow-lg transition-all',
        selected ? 'border-primary ring-2 ring-primary/20' : 'border-gray-200',
        !data.isValid && 'border-destructive'
      )}
    >
      {/* Input Handle */}
      {definition.inputs.length > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 !bg-gray-400"
        />
      )}
      
      {/* Node Header */}
      <div className={cn('px-4 py-2 rounded-t-lg text-white', definition.color)}>
        <div className="flex items-center gap-2">
          <Icon className="w-4 h-4" />
          <span className="text-sm font-medium">{definition.label}</span>
        </div>
      </div>
      
      {/* Node Content */}
      <div className="px-4 py-3 min-w-[200px]">
        <div className="text-sm font-medium text-gray-900">{data.label}</div>
        {data.errors && data.errors.length > 0 && (
          <div className="mt-2 text-xs text-destructive">
            {data.errors[0]}
          </div>
        )}
      </div>
      
      {/* Output Handle */}
      {definition.outputs.length > 0 && (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 !bg-gray-400"
        />
      )}
    </div>
  );
});

BaseNode.displayName = 'BaseNode';
```

### 3.6 Workflow Canvas Component

```typescript
// components/workflow/canvas/WorkflowCanvas.tsx
import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  Connection,
  NodeTypes,
  EdgeTypes
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/lib/workflow/store/workflowStore';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';

export function WorkflowCanvas() {
  const {
    nodes,
    edges,
    addNode,
    updateNode,
    deleteNode,
    addEdge: addEdgeToStore,
    deleteEdge,
    selectNode
  } = useWorkflowStore();
  
  // Build node types from registry
  const nodeTypes: NodeTypes = useMemo(() => {
    const types: Record<string, React.ComponentType<any>> = {};
    for (const definition of nodeRegistry.getAll()) {
      types[definition.type] = definition.component;
    }
    return types;
  }, []);
  
  const onConnect = useCallback((connection: Connection) => {
    addEdgeToStore(connection);
  }, [addEdgeToStore]);
  
  const onNodesDelete = useCallback((deleted: Node[]) => {
    deleted.forEach(node => deleteNode(node.id));
  }, [deleteNode]);
  
  const onEdgesDelete = useCallback((deleted: Edge[]) => {
    deleted.forEach(edge => deleteEdge(edge.id));
  }, [deleteEdge]);
  
  const onNodeClick = useCallback((_, node: Node) => {
    selectNode(node.id);
  }, [selectNode]);
  
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);
  
  return (
    <div className="w-full h-full">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onConnect={onConnect}
        onNodesDelete={onNodesDelete}
        onEdgesDelete={onEdgesDelete}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background />
        <Controls />
        <MiniMap />
      </ReactFlow>
    </div>
  );
}
```

### 3.7 Node Palette (Drag & Drop)

```typescript
// components/workflow/panels/NodePalette.tsx
import { DragEvent } from 'react';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';

export function NodePalette() {
  const categories = {
    trigger: 'Triggers',
    action: 'Actions',
    condition: 'Conditions',
    integration: 'Integrations'
  };
  
  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };
  
  return (
    <Card className="w-64 h-full">
      <div className="p-4 border-b">
        <h3 className="font-semibold">Node Palette</h3>
        <p className="text-xs text-muted-foreground">Drag nodes to canvas</p>
      </div>
      
      <ScrollArea className="h-[calc(100%-80px)]">
        {Object.entries(categories).map(([key, label]) => {
          const nodes = nodeRegistry.getByCategory(key);
          if (nodes.length === 0) return null;
          
          return (
            <div key={key} className="p-4">
              <h4 className="text-sm font-medium mb-2 text-muted-foreground">
                {label}
              </h4>
              <div className="space-y-2">
                {nodes.map(node => {
                  const Icon = node.icon;
                  return (
                    <div
                      key={node.type}
                      draggable
                      onDragStart={(e) => onDragStart(e, node.type)}
                      className="flex items-center gap-2 p-2 rounded border bg-white cursor-move hover:border-primary transition-colors"
                    >
                      <div className={`p-1.5 rounded ${node.color}`}>
                        <Icon className="w-4 h-4 text-white" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium truncate">
                          {node.label}
                        </div>
                        <div className="text-xs text-muted-foreground truncate">
                          {node.description}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </ScrollArea>
    </Card>
  );
}
```

### 3.8 Properties Panel (Dynamic Form)

```typescript
// components/workflow/panels/PropertiesPanel.tsx
import { useWorkflowStore } from '@/lib/workflow/store/workflowStore';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

export function PropertiesPanel() {
  const { selectedNodeId, nodes, updateNode } = useWorkflowStore();
  
  if (!selectedNodeId) {
    return (
      <Card className="w-80 h-full p-4">
        <div className="text-center text-muted-foreground">
          Select a node to configure
        </div>
      </Card>
    );
  }
  
  const node = nodes.find(n => n.id === selectedNodeId);
  if (!node) return null;
  
  const definition = nodeRegistry.get(node.type);
  const Icon = definition.icon;
  
  const handleConfigChange = (field: string, value: any) => {
    updateNode(node.id, {
      config: { ...node.data.config, [field]: value }
    });
  };
  
  return (
    <Card className="w-80 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b">
        <div className="flex items-center gap-2 mb-2">
          <div className={`p-1.5 rounded ${definition.color}`}>
            <Icon className="w-4 h-4 text-white" />
          </div>
          <h3 className="font-semibold">{definition.label}</h3>
        </div>
        <p className="text-xs text-muted-foreground">
          {definition.description}
        </p>
      </div>
      
      {/* Configuration Form */}
      <div className="flex-1 overflow-auto p-4 space-y-4">
        {/* Label Field (common to all nodes) */}
        <div className="space-y-2">
          <Label htmlFor="label">Label</Label>
          <Input
            id="label"
            value={node.data.label}
            onChange={(e) => updateNode(node.id, { label: e.target.value })}
            placeholder="Node label"
          />
        </div>
        
        {/* Custom config component or auto-generated form */}
        {definition.configComponent ? (
          <definition.configComponent
            value={node.data.config}
            onChange={(config) => updateNode(node.id, { config })}
          />
        ) : (
          <AutoGeneratedForm
            schema={definition.configSchema}
            value={node.data.config}
            onChange={handleConfigChange}
          />
        )}
      </div>
      
      {/* Footer Actions */}
      <div className="p-4 border-t flex gap-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => useWorkflowStore.getState().selectNode(null)}
        >
          Close
        </Button>
        {definition.helpUrl && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.open(definition.helpUrl, '_blank')}
          >
            Help
          </Button>
        )}
      </div>
    </Card>
  );
}
```

## 4. Scalability Features

### 4.1 Performance Optimizations

```typescript
// Memoization for expensive operations
const nodeTypes = useMemo(() => {
  // Build once, reuse across renders
  const types: Record<string, React.ComponentType<any>> = {};
  for (const definition of nodeRegistry.getAll()) {
    types[definition.type] = definition.component;
  }
  return types;
}, []); // Empty deps - only build once

// Virtual rendering for large node palettes
import { useVirtualizer } from '@tanstack/react-virtual';

// Debounced validation
import { useDebouncedCallback } from 'use-debounce';

const debouncedValidate = useDebouncedCallback(
  () => workflowStore.validateWorkflow(),
  500
);
```

### 4.2 Lazy Loading

```typescript
// Lazy load heavy components
const WorkflowBuilder = lazy(() => import('./pages/workflow-builder'));
const PropertiesPanel = lazy(() => import('./components/workflow/panels/PropertiesPanel'));

// Lazy load node components
const nodeDefinitions = [
  {
    type: 'heavy_analytics',
    component: lazy(() => import('./nodes/HeavyAnalyticsNode'))
  }
];
```

### 4.3 Extensibility Points

```typescript
// Plugin system for custom nodes
interface INodePlugin {
  id: string;
  name: string;
  version: string;
  nodes: INodeDefinition[];
}

class PluginManager {
  private plugins: Map<string, INodePlugin> = new Map();
  
  register(plugin: INodePlugin): void {
    this.plugins.set(plugin.id, plugin);
    plugin.nodes.forEach(node => nodeRegistry.register(node));
  }
  
  unregister(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (plugin) {
      plugin.nodes.forEach(node => nodeRegistry.unregister(node.type));
      this.plugins.delete(pluginId);
    }
  }
}

// Custom validation rules
interface IValidationRule {
  id: string;
  name: string;
  validate: (workflow: Workflow) => ValidationError[];
}

class ValidationRuleRegistry {
  private rules: IValidationRule[] = [];
  
  addRule(rule: IValidationRule): void {
    this.rules.push(rule);
  }
  
  validate(workflow: Workflow): ValidationError[] {
    return this.rules.flatMap(rule => rule.validate(workflow));
  }
}
```

### 4.4 Testing Strategy

```typescript
// Unit tests for pure functions
describe('ValidationService', () => {
  it('detects cycles in workflow', () => {
    const workflow = createCyclicWorkflow();
    const errors = ValidationService.validate(workflow);
    expect(errors).toContainEqual(
      expect.objectContaining({ type: 'cycle' })
    );
  });
});

// Integration tests for components
describe('WorkflowCanvas', () => {
  it('allows adding nodes via drag and drop', async () => {
    render(<WorkflowCanvas />);
    const node = screen.getByText('Manual Trigger');
    fireEvent.dragStart(node);
    // ... test drag and drop
  });
});

// E2E tests with Playwright
test('create and execute workflow', async ({ page }) => {
  await page.goto('/workflows/builder');
  await page.dragAndDrop('.node-palette .manual-trigger', '.react-flow');
  await page.click('button:has-text("Save")');
  await page.click('button:has-text("Execute")');
  await expect(page.locator('.execution-status')).toHaveText('Completed');
});
```

## 5. Implementation Phases

### Phase 1: Foundation (Week 1)
- ✅ Install @xyflow/react
- ✅ Setup Zustand store
- ✅ Create NodeRegistry system
- ✅ Register existing nodes (manual_trigger, crud_record)
- ✅ Build BaseNode component
- ✅ Create WorkflowCanvas with basic React Flow

### Phase 2: Core UI (Week 2)
- Build NodePalette with drag-and-drop
- Implement PropertiesPanel with dynamic forms
- Add WorkflowToolbar (save, load, execute)
- Implement node selection and highlighting
- Add validation visual feedback

### Phase 3: Advanced Features (Week 3)
- Auto-layout algorithm
- Undo/redo functionality
- Copy/paste nodes
- Export/import workflows (JSON)
- Workflow templates

### Phase 4: Execution & Monitoring (Week 4)
- Real-time execution visualization
- Execution history panel
- Node-by-node status updates
- Error highlighting
- Retry failed nodes

### Phase 5: Polish & Scale (Week 5+)
- Performance optimization
- Add more node types
- Plugin system
- Workflow versioning
- Collaboration features (future)

## 6. Key Dependencies

```json
{
  "dependencies": {
    "@xyflow/react": "^12.0.0",
    "zustand": "^4.4.0",
    "zod": "^3.22.0",
    "@tanstack/react-query": "^5.0.0",
    "lucide-react": "^0.300.0",
    "react": "^18.2.0"
  },
  "devDependencies": {
    "@types/react": "^18.2.0",
    "vitest": "^1.0.0",
    "@playwright/test": "^1.40.0"
  }
}
```

## 7. Benefits of This Architecture

### ✅ SOLID Compliance
- **SRP**: Each component/service has one clear responsibility
- **OCP**: Add new nodes without modifying core system
- **LSP**: All nodes are interchangeable via interfaces
- **ISP**: Small, focused interfaces instead of fat ones
- **DIP**: Dependencies on abstractions, not implementations

### ✅ Scalability
- **Modular**: New features added as plugins
- **Performant**: Memoization, lazy loading, virtualization
- **Maintainable**: Clear separation of concerns
- **Testable**: Isolated, mockable components

### ✅ Developer Experience
- **Type-safe**: Full TypeScript coverage
- **Discoverable**: Registry pattern makes nodes easy to find
- **Extensible**: Plugin system for custom nodes
- **Documented**: Clear interfaces and examples

### ✅ Future-Proof
- Easy to add new node types
- Can add conditional routing
- Can add parallel execution
- Can add workflow versioning
- Can add collaboration features

## 8. Next Steps

1. **Install dependencies**: `pnpm add @xyflow/react zustand`
2. **Create folder structure**: Setup all folders as outlined
3. **Build NodeRegistry**: Implement registry system first
4. **Register existing nodes**: Add manual_trigger and crud_record
5. **Build WorkflowCanvas**: Basic React Flow setup
6. **Add NodePalette**: Drag and drop functionality
7. **Build PropertiesPanel**: Dynamic form generation
8. **Iterate**: Add features incrementally

This architecture provides a solid, scalable foundation for building complex workflow systems while maintaining code quality and developer productivity.
