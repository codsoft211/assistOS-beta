import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  NodeTypes,
  Panel
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { useWorkflowStore } from '@/lib/workflow/store/workflowStore';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { Save, Play } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function WorkflowCanvas() {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    selectNode,
  } = useWorkflowStore();
  
  console.log('WorkflowCanvas - nodes:', nodes);
  console.log('WorkflowCanvas - edges:', edges);
  
  // Build node types from registry
  const nodeTypes: NodeTypes = useMemo(() => {
    const types: Record<string, React.ComponentType<any>> = {};
    for (const definition of nodeRegistry.getAll()) {
      types[definition.type] = definition.component;
    }
    console.log('WorkflowCanvas - nodeTypes:', types);
    return types;
  }, []);
  
  const onNodeClick = useCallback((_, node: any) => {
    selectNode(node.id);
  }, [selectNode]);
  
  const onPaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);
  
  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        onPaneClick={onPaneClick}
        nodeTypes={nodeTypes}
        fitView
        minZoom={0.1}
        maxZoom={2}
      >
        <Background gap={16} size={1} />
        <Controls />
        <MiniMap 
          className="!bg-background"
          maskColor="rgba(0, 0, 0, 0.1)"
        />
        
        {/* Top toolbar */}
        <Panel position="top-right" className="flex gap-2">
          <Button size="sm" variant="outline">
            <Save className="w-4 h-4 mr-2" />
            Save
          </Button>
          <Button size="sm">
            <Play className="w-4 h-4 mr-2" />
            Execute
          </Button>
        </Panel>
      </ReactFlow>
    </div>
  );
}
