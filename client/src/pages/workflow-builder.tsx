import { useEffect, DragEvent, useCallback, useState } from 'react';
import { useParams, useLocation } from 'wouter';
import { ReactFlowProvider } from '@xyflow/react';
import { WorkflowCanvas } from '@/components/workflow/canvas/WorkflowCanvas';
import { NodePalette } from '@/components/workflow/panels/NodePalette';
import { PropertiesPanel } from '@/components/workflow/panels/PropertiesPanel';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useWorkflowStore } from '@/lib/workflow/store/workflowStore';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { validateWorkflow } from '@/lib/workflow/validation/workflowValidator';
import { Beaker, Rocket, Loader2, ArrowLeft, Save, Play } from "lucide-react";
import '@/lib/workflow/registry/registerNodes'; // Register all nodes
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';
import { apiRequest, queryClient } from '@/lib/queryClient';

export function WorkflowBuilderPage() {
  const { id } = useParams();
  const [, navigate] = useLocation();
  const [isSaving, setIsSaving] = useState(false);
  const [isExecuting, setIsExecuting] = useState(false);
  const [environment, setEnvironment] = useState<'sandbox' | 'production'>('sandbox');
  const [currentExecutionId, setCurrentExecutionId] = useState<string | null>(null);
  const [currentWorkflowId, setCurrentWorkflowId] = useState<string | undefined>(id);

  const {
    addNode,
    workflowName,
    setWorkflowName,
    serialize,
    deserialize,
    reset,
    updateNode
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
          const response = await apiRequest('GET', `/api/assistbuild/workflows/${id}`);
          const workflow = await response.json();
          deserialize(workflow);
          toast.success('Workflow loaded successfully');
        } catch (error: any) {
          console.error('Failed to load workflow:', error);
          toast.error(error.message || 'Failed to load workflow');
          navigate('/workflows');
        }
      } else {
        reset();
      }
    };

    loadWorkflow();
  }, [id, deserialize, reset, navigate]);

  const onDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();

      const type = event.dataTransfer.getData('application/reactflow');
      if (!type) return;

      const definition = nodeRegistry.get(type);
      if (!definition) return;

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

      if (workflowData.definition.nodes.length === 0) {
        toast.error('Workflow must have at least one node to save');
        return null;
      }

      let response;
      if (currentWorkflowId && currentWorkflowId !== 'new') {
        response = await apiRequest('PUT', `/api/assistbuild/workflows/${currentWorkflowId}`, {
          ...workflowData,
          environment: 'sandbox',
          status
        });
        toast.success('Workflow updated successfully!');
      } else {
        response = await apiRequest('POST', '/api/assistbuild/workflows', {
          ...workflowData,
          environment: 'sandbox',
          status
        });
        toast.success('Workflow created successfully!');
      }

      const savedWorkflow = await response.json();

      if (!currentWorkflowId || currentWorkflowId === 'new') {
        if (savedWorkflow.id) {
          setCurrentWorkflowId(savedWorkflow.id);
          navigate(`/workflows/builder/${savedWorkflow.id}`, { replace: true });
        }
      }

      queryClient.invalidateQueries({ queryKey: ['/api/assistbuild/workflows'] });
      return savedWorkflow;
    } catch (error: any) {
      console.error('Save workflow error:', error);
      toast.error('Failed to save workflow', {
        description: error.message || 'Failed to save workflow'
      });
      return null;
    } finally {
      setIsSaving(false);
    }
  };

  const handlePublish = async () => {
    if (currentWorkflowId && currentWorkflowId !== 'new') {
      try {
        const response = await apiRequest('GET', `/api/assistbuild/workflows/${currentWorkflowId}`);
        const data = await response.json();
        if (data.status === 'published') {
          toast.error('Cannot update a published workflow. Please duplicate it to make changes.');
          return;
        }
      } catch (error) {
        console.error('Failed to check workflow status:', error);
      }
    }

    const result = await handleSave('published');
    if (result && result.id) {
      const updatedWorkflow = await apiRequest('GET', `/api/assistbuild/workflows/${result.id}`);
      const updatedData = await updatedWorkflow.json();
      deserialize(updatedData);
      toast.success('Workflow published successfully!');
    }
    return result;
  };

  const handleExecute = async () => {
    const { nodes, edges } = useWorkflowStore.getState();

    nodes.forEach(node => {
      updateNode(node.id, {
        executionStatus: 'idle',
        executionOutput: undefined,
        executionError: undefined
      });
    });

    setIsExecuting(true);
    try {
      const { valid, errors } = validateWorkflow(nodes as any, edges as any);

      if (!valid) {
        toast.error(`Validation Error: ${errors[0].message}`);
        useWorkflowStore.setState({ validationErrors: errors });
        return;
      }

      useWorkflowStore.setState({ validationErrors: [] });

      let workflowId = currentWorkflowId;
      if (!currentWorkflowId || currentWorkflowId === 'new') {
        toast.info('Saving workflow first before execution...');
        const savedWorkflow = await handleSave();
        if (!savedWorkflow || !savedWorkflow.id) return;
        workflowId = savedWorkflow.id;
        setCurrentWorkflowId(workflowId);
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      toast.info(`Executing workflow in ${environment} environment...`);

      const response = await apiRequest('POST', `/api/assistbuild/workflows/${workflowId}/execute`, {
        environment,
        triggerData: {
          timestamp: new Date().toISOString(),
          manual: true
        }
      });
      const result = await response.json();
      const executionId = result.execution?.id;

      if (executionId) {
        setCurrentExecutionId(executionId);
        pollExecutionStatus(executionId);
      } else {
        toast.success('Workflow execution initiated successfully!');
      }

    } catch (error: any) {
      console.error('Execute error:', error);
      toast.error(error.message || 'Failed to execute workflow');
      nodes.forEach(node => {
        updateNode(node.id, { executionStatus: 'idle' });
      });
    } finally {
      setIsExecuting(false);
    }
  };

  const pollExecutionStatus = async (executionId: string) => {
    let attempts = 0;
    const maxAttempts = 30;

    const poll = async () => {
      try {
        const { nodes } = useWorkflowStore.getState();
        const response = await apiRequest('GET', `/api/assistbuild/executions/${executionId}`);
        const execution = await response.json();

        if (execution.logs) {
          execution.logs.forEach((log: any) => {
            const node = nodes.find(n => n.id === log.nodeId);
            if (node) {
              if (log.status === 'running') {
                updateNode(log.nodeId, { executionStatus: 'running' });
              } else if (log.status === 'success') {
                updateNode(log.nodeId, {
                  executionStatus: 'completed',
                  executionOutput: log.outputData
                });
              } else if (log.status === 'failed') {
                updateNode(log.nodeId, {
                  executionStatus: 'failed',
                  executionError: log.errorMessage
                });
              } else if (log.status === 'skipped') {
                updateNode(log.nodeId, {
                  executionStatus: 'idle',
                  executionOutput: { skipped: true, reason: log.errorMessage || 'Condition not met' }
                });
              }
            }
          });
        }

        if (execution.status === 'completed') {
          toast.success('Workflow completed successfully!');
          setCurrentExecutionId(null);
          return;
        } else if (execution.status === 'failed') {
          toast.error('Workflow execution failed');
          setCurrentExecutionId(null);
          return;
        } else if (execution.status === 'running' && attempts < maxAttempts) {
          attempts++;
          setTimeout(poll, 1000);
        } else if (attempts >= maxAttempts) {
          toast.error('Workflow execution timed out.');
          setCurrentExecutionId(null);
        }

      } catch (error) {
        console.error('Polling error:', error);
        setCurrentExecutionId(null);
      }
    };

    poll();
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <header className="border-b bg-card">
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
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Env:</span>
            <Select
              value={environment}
              onValueChange={(v: 'sandbox' | 'production') => setEnvironment(v)}
            >
              <SelectTrigger className="w-[120px] h-8 text-xs">
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sandbox" className="text-xs">
                  <div className="flex items-center">
                    <Beaker className="w-3 h-3 mr-2 text-blue-500" />
                    Sandbox
                  </div>
                </SelectItem>
                <SelectItem value="production" className="text-xs">
                  <div className="flex items-center">
                    <Rocket className="w-3 h-3 mr-2 text-green-500" />
                    Production
                  </div>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleSave('draft')}
              className="h-8"
              disabled={isSaving || isExecuting}
            >
              <Save className="w-4 h-4 mr-2" />
              {isSaving ? 'Saving...' : 'Save Draft'}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => handlePublish()}
              disabled={isSaving || isExecuting}
              className="h-8"
            >
              <Rocket className="w-4 h-4 mr-2" />
              Publish
            </Button>
            <Button
              size="sm"
              onClick={handleExecute}
              disabled={isExecuting || isSaving}
              className="h-8 bg-primary hover:bg-primary/90"
            >
              {isExecuting ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Workflow
                </>
              )}
            </Button>
          </div>
        </div>
      </header>

      {/* Environment Warning */}
      {environment === 'sandbox' && (
        <div className="bg-blue-50 border-b border-blue-100 px-4 py-1.5 flex items-center justify-center gap-2 text-[11px] text-blue-700 font-medium">
          <Beaker className="w-3 h-3" />
          <span>Running in <strong>Sandbox Mode</strong>. External integrations (Emails, WhatsApp, etc.) will be simulated and not actually sent.</span>
        </div>
      )}

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
