import { create } from 'zustand';
import { Connection, addEdge, applyNodeChanges, applyEdgeChanges } from '@xyflow/react';
import type { Node, Edge, NodeChange, EdgeChange } from '@xyflow/react';
import { WorkflowNode, WorkflowEdge, ValidationError } from '../types/workflow.types';
import { nodeRegistry } from '../registry/NodeRegistry';

interface WorkflowState {
  // State
  nodes: Node[];
  edges: Edge[];
  selectedNodeId: string | null;
  validationErrors: ValidationError[];
  isExecuting: boolean;
  workflowName: string;
  workflowDescription: string;

  // Node/Edge operations
  setNodes: (nodes: Node[]) => void;
  setEdges: (edges: Edge[]) => void;
  onNodesChange: (changes: NodeChange[]) => void;
  onEdgesChange: (changes: EdgeChange[]) => void;
  onConnect: (connection: Connection) => void;

  // Node CRUD
  addNode: (node: Node) => void;
  updateNode: (id: string, data: Partial<Node['data']>) => void;
  deleteNode: (id: string) => void;
  duplicateNode: (id: string) => void;

  // Edge CRUD
  deleteEdge: (id: string) => void;

  // Selection
  selectNode: (id: string | null) => void;

  // Workflow metadata
  setWorkflowName: (name: string) => void;
  setWorkflowDescription: (description: string) => void;

  // Validation
  setValidationErrors: (errors: ValidationError[]) => void;

  // Execution
  setIsExecuting: (isExecuting: boolean) => void;

  // Serialization
  serialize: () => any;
  deserialize: (data: any) => void;

  // Reset
  reset: () => void;
}

const initialState = {
  nodes: [],
  edges: [],
  selectedNodeId: null,
  validationErrors: [],
  isExecuting: false,
  workflowName: 'New Workflow',
  workflowDescription: '',
};

export const useWorkflowStore = create<WorkflowState>((set, get) => ({
  ...initialState,

  // Set methods
  setNodes: (nodes) => set({ nodes }),
  setEdges: (edges) => set({ edges }),

  // React Flow handlers
  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },

  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },

  onConnect: (connection) => {
    set({
      edges: addEdge(connection, get().edges),
    });
  },

  // Node operations
  addNode: (node) => set((state) => ({
    nodes: [...state.nodes, node],
  })),

  updateNode: (id, data) => set((state) => ({
    nodes: state.nodes.map(node =>
      node.id === id ? { ...node, data: { ...node.data, ...data } } : node
    ),
  })),

  deleteNode: (id) => set((state) => ({
    nodes: state.nodes.filter(n => n.id !== id),
    edges: state.edges.filter(e => e.source !== id && e.target !== id),
    selectedNodeId: state.selectedNodeId === id ? null : state.selectedNodeId,
  })),

  duplicateNode: (id) => {
    const node = get().nodes.find(n => n.id === id);
    if (!node) return;

    const newNode: Node = {
      ...node,
      id: `${node.type}-${Date.now()}`,
      position: {
        x: node.position.x + 50,
        y: node.position.y + 50,
      },
      data: {
        ...node.data,
        label: `${node.data.label} (Copy)`,
      },
    };

    set((state) => ({
      nodes: [...state.nodes, newNode],
    }));
  },

  // Edge operations
  deleteEdge: (id) => set((state) => ({
    edges: state.edges.filter(e => e.id !== id),
  })),

  // Selection
  selectNode: (id) => set({ selectedNodeId: id }),

  // Workflow metadata
  setWorkflowName: (name) => set({ workflowName: name }),
  setWorkflowDescription: (description) => set({ workflowDescription: description }),

  // Validation
  setValidationErrors: (errors) => set({ validationErrors: errors }),

  // Execution
  setIsExecuting: (isExecuting) => set({ isExecuting }),

  // Serialization
  serialize: () => {
    const state = get();

    // Helper to safely serialize only primitive values from config
    const safeSerializeConfig = (config: any): any => {
      if (config === null || config === undefined) return {};

      try {
        // Use a replacer function to filter out non-serializable values
        const seen = new WeakSet();
        const safeStringify = JSON.stringify(config, (key, value) => {
          // Skip React internal properties
          if (key.startsWith('__react') || key.startsWith('_react') || key === 'current') {
            return undefined;
          }
          // Skip functions
          if (typeof value === 'function') {
            return undefined;
          }
          // Skip DOM nodes - check constructor name to avoid import conflicts
          if (value && typeof value === 'object') {
            const ctorName = value.constructor?.name || '';
            if (ctorName.includes('Element') || ctorName.includes('Node') || ctorName === 'Event') {
              return undefined;
            }
            // Detect circular refs
            if (seen.has(value)) {
              return undefined;
            }
            seen.add(value);
          }
          return value;
        });
        return JSON.parse(safeStringify);
      } catch (e) {
        console.warn('Failed to serialize config, returning empty object:', e);
        return {};
      }
    };

    const serializableNodes = state.nodes
      .filter(node => {
        try {
          return !!nodeRegistry.get(node.type || '');
        } catch (e) {
          return false;
        }
      })
      .map(node => {
        // Extract only the serializable parts we need
        const cleanedConfig = safeSerializeConfig(node.data?.config || {});
        return {
          id: String(node.id),
          type: String(node.type),
          name: String(node.data?.label || 'Node'),
          position: {
            x: Number(node.position?.x || 0),
            y: Number(node.position?.y || 0),
          },
          config: cleanedConfig,
        };
      });

    return {
      name: state.workflowName,
      description: state.workflowDescription,
      definition: {
        nodes: serializableNodes,
        edges: state.edges.map(edge => ({
          id: String(edge.id),
          source: String(edge.source),
          target: String(edge.target),
          condition: (edge as any).condition ? String((edge as any).condition) : undefined,
        })),
      },
    };
  },

  deserialize: (data) => {
    if (!data || !data.definition) return;

    console.log('Deserializing workflow data:', data);

    const nodes = (data.definition.nodes || []).map((node: any) => {
      const mappedNode = {
        id: node.id,
        type: node.type,
        position: node.position,
        data: {
          label: node.name || 'Node',
          config: node.config || {},
          executionStatus: 'idle',
        },
      };
      console.log('Mapped node:', mappedNode);
      return mappedNode;
    });

    const edges = (data.definition.edges || []).map((edge: any) => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      condition: edge.condition,
      loopBack: edge.loopBack,
    }));

    console.log('Final nodes:', nodes);
    console.log('Final edges:', edges);

    set({
      workflowName: data.name || 'Untitled Workflow',
      workflowDescription: data.description || '',
      nodes,
      edges,
      selectedNodeId: null,
      validationErrors: [],
    });
  },

  // Reset
  reset: () => set(initialState),
}));
