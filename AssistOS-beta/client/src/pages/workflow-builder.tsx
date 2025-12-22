import { useEffect, DragEvent, useCallback, useState } from 'react';
import { useParams } from 'wouter';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkflowCanvas } from '@/components/workflow/canvas/WorkflowCanvas';
import { NodePalette } from '@/components/workflow/panels/NodePalette';
import { PropertiesPanel } from '@/components/workflow/panels/PropertiesPanel';
import { useWorkflowStore } from '@/lib/workflow/store/workflowStore';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import '@/lib/workflow/registry/registerNodes'; // Register all nodes
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ArrowLeft, Save, Play } from 'lucide-react';
import { useLocation } from 'wouter';
import { toast } from 'sonner';
import { apiRequest, queryClient } from '@/lib/queryClient';

export function WorkflowBuilderPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [isSaving, setIsSaving] = useState(false);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | undefined>(id);
  const { 
    addNode, 
    workflowName, 
    setWorkflowName,
    serialize,
    deserialize,
    reset
  } = useWorkflowStore();
  
  // Update current workflow ID when id parameter changes
  useEffect(() => {
    setCurrentWorkflowId(id);
  }, [id]);
  
  // Load workflow if editing
  useEffect(() => {
    const loadWorkflow = async () => {
      if (id && id !== 'new') {
        try {
          console.log('Loading workflow with id:', id);
          const response = await apiRequest('GET', `/api/assistbuild/workflows/${id}`);
          const workflow = await response.json();
          console.log('Loaded workflow data:', workflow);
          deserialize(workflow);
          toast.success('Workflow loaded successfully');
        } catch (error: any) {
          console.error('Failed to load workflow:', error);
          toast.error(error.message || 'Failed to load workflow');
          navigate('/workflows');
        }
      } else {
        console.log('New workflow - resetting');
        reset();
      }
    };
    
    loadWorkflow();
  }, [id, deserialize, reset, navigate]);
  
  // Handle drag and drop
  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      
      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;
      
      const definition = nodeRegistry.get(type);
      if (!definition) return;
      
      // Get the position relative to the React Flow viewport
      const reactFlowBounds = event.currentTarget.getBoundingClientRect();
      const position = {
        x: event.clientX - reactFlowBounds.left - 100,
        y: event.clientY - reactFlowBounds.top - 50,
      };
      
      const newNode = {
        id: `${type}-${Date.now()}`,
        type,
        position,
        data: {
          label: definition.label,
          config: { ...definition.defaultConfig },
        },
      };
      
      addNode(newNode);
      toast.success(`Added ${definition.label} node`);
    },
    [addNode]
  );
  
  const onDragOver = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);
  
  const handleSave = async (status: 'draft' | 'published' = 'draft') => {
    if (isSaving) return null;
    
    setIsSaving(true);
    try {
      const workflowData = serialize();
      
      // Validate workflow has at least one node
      if (workflowData.definition.nodes.length === 0) {
        toast.error('Workflow must have at least one node to save');
        return null;
      }
      
      // Save or update workflow
      let savedWorkflow;
      if (currentWorkflowId && currentWorkflowId !== 'new') {
        // Update existing workflow
        savedWorkflow = await apiRequest('PUT', `/api/assistbuild/workflows/${currentWorkflowId}`, {
          ...workflowData,
          environment: 'sandbox',
          status
        });
        toast.success('Workflow updated successfully!');
      } else {
        // Create new workflow
        savedWorkflow = await apiRequest('POST', '/api/assistbuild/workflows', {
          ...workflowData,
          environment: 'sandbox',
          status
        });
        
        // Update current workflow ID and navigate
        if (savedWorkflow.id) {
          setCurrentWorkflowId(savedWorkflow.id);
          navigate(`/workflows/builder/${savedWorkflow.id}`, { replace: true });
        }
        toast.success('Workflow created successfully!');
      }
      
      // Invalidate workflows cache to refresh the list page
      queryClient.invalidateQueries({ queryKey: ['/api/assistbuild/workflows'] });
      
      return savedWorkflow;
    } catch (error: any) {
      console.error('Save workflow error:', error);
      const errorMessage = error.message || error.error || 'Failed to save workflow';
      toast.error('Failed to save workflow', {
        description: errorMessage
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };
  
  const handlePublish = async () => {
    const result = await handleSave('published');
    if (result) {
      // Reload workflow to get updated status
      if (result.id) {
        const updatedWorkflow = await apiRequest('GET', `/api/assistbuild/workflows/${result.id}`);
        deserialize(updatedWorkflow);
      }
      toast.success('Workflow published successfully!');
    }
    return result;
  };

  const handleExecute = async () => {
    const { nodes, updateNode } = useWorkflowStore.getState();
    
    // Reset all node states
    nodes.forEach(node => {
      updateNode(node.id, { 
        executionStatus: 'idle',
        executionOutput: undefined,
        executionError: undefined 
      });
    });
    
    try {
      // Validate workflow has nodes
      if (nodes.length === 0) {
        toast.error('Workflow is empty. Add some nodes first!');
        return;
      }
      
      // Save workflow first (or ensure it's saved)
      let workflowId = currentWorkflowId;
      if (!currentWorkflowId || currentWorkflowId === 'new') {
        toast.info('Saving workflow first...');
        const savedWorkflow = await handleSave();
        
        if (!savedWorkflow || !savedWorkflow.id) {
          // handleSave already showed an error toast
          return;
        }
        
        workflowId = savedWorkflow.id;
        setCurrentWorkflowId(workflowId);
        // Wait for state to update
        await new Promise(resolve => setTimeout(resolve, 300));
      }
      
      toast.info('Executing workflow...');
      
      // Execute workflow on backend
      const response = await apiRequest('POST', `/api/assistbuild/workflows/${workflowId}/execute`, {
        environment: 'sandbox',
        triggerData: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+1234567890'
        }
      });
      const result = await response.json();
      const executionId = result.execution?.id;
      
      // Poll for execution status
      if (executionId) {
        pollExecutionStatus(executionId);
      } else {
        toast.success('Workflow executed successfully!');
      }
      
    } catch (error: any) {
      toast.error(error.message || 'Failed to execute workflow');
      
      // Mark all nodes as idle on error
      nodes.forEach(node => {
        updateNode(node.id, { executionStatus: 'idle' });
      });
    }
  };
  
  const pollExecutionStatus = async (executionId: string) => {
    const { nodes, updateNode } = useWorkflowStore.getState();
    let attempts = 0;
    const maxAttempts = 30;
    
    const poll = async () => {
      try {
        const response = await apiRequest('GET', `/api/assistbuild/executions/${executionId}`);
        const execution = await response.json();
        
        // Update node statuses based on execution logs
        if (execution.logs) {
          execution.logs.forEach((log: any) => {
            const node = nodes.find(n => n.id === log.nodeId);
            if (node) {
              if (log.status === 'running') {
                updateNode(log.nodeId, { executionStatus: 'running' });
              } else if (log.status === 'completed') {
                updateNode(log.nodeId, { 
                  executionStatus: 'completed',
                  executionOutput: log.output
                });
              } else if (log.status === 'failed') {
                updateNode(log.nodeId, { 
                  executionStatus: 'failed',
                  executionError: log.error
                });
              }
            }
          });
        }
        
        // Check if execution is complete
        if (execution.status === 'completed') {
          toast.success('Workflow completed successfully!');
          return;
        } else if (execution.status === 'failed') {
          toast.error('Workflow execution failed');
          return;
        } else if (execution.status === 'running' && attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 1000); // Poll every second
        }
        
      } catch (error) {
        console.error('Polling error:', error);
      }
    };
    
    poll();
  };
  
  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <Card className="border-b rounded-none">
        <div className="p-4 flex items-center justify-between">
          <div className="flex items-center gap-4 flex-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/workflows')}
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back
            </Button>
            
            <div className="flex-1 max-w-md">
              <Input
                value={workflowName}
                onChange={(e) => setWorkflowName(e.target.value)}
                placeholder="Workflow name"
                className="font-semibold"
              />
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={handleSave} disabled={isSaving}>
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button variant="secondary" onClick={handlePublish} disabled={isSaving}>
              Publish
            </Button>
            <Button onClick={handleExecute} disabled={isSaving}>
              <Play className="w-4 h-4 mr-2" />
              Execute
            </Button>
          </div>
        </div>
      </Card>
      
      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Node Palette - Left sidebar */}
        <div className="border-r bg-background">
          <NodePalette />
        </div>
        
        {/* Canvas - Center */}
        <div 
          className="flex-1 bg-muted/20"
          onDrop={onDrop}
          onDragOver={onDragOver}
        >
          <ReactFlowProvider>
            <WorkflowCanvas />
          </ReactFlowProvider>
        </div>
        
        {/* Properties Panel - Sheet (overlay) */}
        <PropertiesPanel />
      </div>
    </div>
  );
}

export default WorkflowBuilderPage;
