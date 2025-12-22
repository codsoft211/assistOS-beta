import { useCallback, useEffect } from 'react';
import { useWorkflowStore } from '@/lib/workflow/store/workflowStore';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Trash2, Copy, HelpCircle } from 'lucide-react';
import { Separator } from '@/components/ui/separator';
import { DynamicNodeForm } from '@/components/workflow/config/DynamicNodeForm';

export function PropertiesPanel() {
  const { selectedNodeId, nodes, deleteNode, duplicateNode, selectNode, updateNode } = useWorkflowStore();

  const node = selectedNodeId ? nodes.find(n => n.id === selectedNodeId) : null;

  const handleConfigChange = useCallback((newConfig: any) => {
    if (node) {
      updateNode(node.id, { config: newConfig });
    }
  }, [node?.id, updateNode]);

  if (!node) return null;

  const definition = nodeRegistry.get(node.type!);
  const Icon = definition.icon;



  const handleDelete = () => {
    deleteNode(node.id);
    selectNode(null);
  };

  const handleDuplicate = () => {
    duplicateNode(node.id);
  };

  return (
    <Sheet open={!!selectedNodeId} onOpenChange={(open) => !open && selectNode(null)}>
      <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
        <SheetHeader>
          <div className="flex items-center gap-2">
            <div className={`p-2 rounded ${definition.color}`}>
              <Icon className="w-5 h-5 text-white" />
            </div>
            <div className="flex-1">
              <SheetTitle>{definition.label}</SheetTitle>
              <SheetDescription className="text-xs mt-0.5">
                {definition.description}
              </SheetDescription>
            </div>
          </div>
        </SheetHeader>

        <div className="mt-6 space-y-6">
          {/* Node Label */}
          <div className="space-y-2">
            <Label htmlFor="node-label">Node Label</Label>
            <Input
              id="workflowName"
              value={(node.data as any).label || ''}
              onChange={(e) => updateNode(node.id, { label: e.target.value })}
              placeholder="Enter node name"
            />
            <p className="text-xs text-muted-foreground">
              A descriptive name for this node in the workflow
            </p>
          </div>

          {/* Dynamic Node Configuration */}
          <DynamicNodeForm
            definition={definition}
            value={node.data.config || {}}
            onChange={handleConfigChange}
          />

          <Separator />


          {/* Actions */}
          <div className="space-y-2">
            <Label>Actions</Label>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleDuplicate}
                className="flex-1"
              >
                <Copy className="w-4 h-4 mr-2" />
                Duplicate
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDelete}
                className="flex-1 text-destructive hover:text-destructive"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                Delete
              </Button>
            </div>
          </div>

          {/* Help link */}
          {definition.helpUrl && (
            <Button
              variant="ghost"
              size="sm"
              className="w-full"
              onClick={() => window.open(definition.helpUrl, '_blank')}
            >
              <HelpCircle className="w-4 h-4 mr-2" />
              View Documentation
            </Button>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
