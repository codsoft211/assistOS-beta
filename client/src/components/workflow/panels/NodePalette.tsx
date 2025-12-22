import { DragEvent } from 'react';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { Card } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';

const categories = [
  { key: 'trigger', label: 'Triggers', description: 'Start your workflow' },
  { key: 'action', label: 'Actions', description: 'Perform operations' },
  { key: 'condition', label: 'Conditions', description: 'Add logic' },
  { key: 'integration', label: 'Integrations', description: 'Connect services' },
] as const;

export function NodePalette() {
  const onDragStart = (event: DragEvent, nodeType: string) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };
  
  return (
    <Card className="w-72 h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b bg-muted/30">
        <h3 className="font-semibold text-sm">Node Palette</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Drag nodes onto the canvas
        </p>
      </div>
      
      {/* Scrollable content */}
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-4">
          {categories.map(({ key, label, description }) => {
            const nodes = nodeRegistry.getByCategory(key);
            if (nodes.length === 0) return null;
            
            return (
              <div key={key}>
                <div className="mb-2">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {label}
                  </h4>
                  <p className="text-xs text-muted-foreground/70 mt-0.5">
                    {description}
                  </p>
                </div>
                
                <div className="space-y-2">
                  {nodes.map(node => {
                    const Icon = node.icon;
                    return (
                      <div
                        key={node.type}
                        draggable
                        onDragStart={(e) => onDragStart(e, node.type)}
                        className={cn(
                          'flex items-start gap-2.5 p-2.5 rounded-md border-2 border-border',
                          'bg-background cursor-grab active:cursor-grabbing',
                          'hover:border-primary hover:shadow-sm transition-all',
                          'group'
                        )}
                      >
                        <div className={cn('p-1.5 rounded', node.color, 'flex-shrink-0')}>
                          <Icon className="w-4 h-4 text-white" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate group-hover:text-primary transition-colors">
                            {node.label}
                          </div>
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {node.description}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                
                {key !== 'integration' && <Separator className="mt-4" />}
              </div>
            );
          })}
        </div>
      </ScrollArea>
    </Card>
  );
}
