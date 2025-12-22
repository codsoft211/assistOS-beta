import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2, CheckCircle2, XCircle } from 'lucide-react';

export interface BaseNodeData {
  label: string;
  config: Record<string, any>;
  isValid?: boolean;
  errors?: string[];
}

export const BaseNode = memo(({ id, type, data, selected }: NodeProps<BaseNodeData>) => {
  const definition = nodeRegistry.get(type!);
  const Icon = definition.icon;
  const hasErrors = data.errors && data.errors.length > 0;
  const executionStatus = data.executionStatus || 'idle';
  
  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white shadow-md transition-all min-w-[180px]',
        selected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-gray-300',
        hasErrors && 'border-destructive ring-2 ring-destructive/20'
      )}
    >
      {/* Input Handle */}
      {definition.inputs.length > 0 && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-3 h-3 !bg-primary border-2 border-white"
        />
      )}
      
      {/* Node Header */}
      <div className={cn('px-3 py-2 rounded-t-lg', definition.color)}>
        <div className="flex items-center gap-2 text-white">
          <Icon className="w-4 h-4 flex-shrink-0" />
          <span className="text-xs font-medium truncate">{definition.label}</span>
          
          {/* Execution Status Indicator */}
          {executionStatus === 'running' && (
            <Loader2 className="w-3.5 h-3.5 animate-spin ml-auto" />
          )}
          {executionStatus === 'completed' && (
            <CheckCircle2 className="w-3.5 h-3.5 ml-auto" />
          )}
          {executionStatus === 'failed' && (
            <XCircle className="w-3.5 h-3.5 ml-auto" />
          )}
        </div>
      </div>
      
      {/* Node Content */}
      <div className="px-3 py-2 bg-white rounded-b-lg">
        <div className="text-sm font-medium text-gray-900 truncate">
          {data.label}
        </div>
        
        {/* Error indicator */}
        {hasErrors && (
          <div className="mt-1.5 flex items-start gap-1 text-destructive">
            <AlertCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="text-xs line-clamp-2">{data.errors![0]}</span>
          </div>
        )}
        
        {/* Execution error */}
        {executionStatus === 'failed' && data.executionError && (
          <div className="mt-1.5 flex items-start gap-1 text-destructive">
            <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <span className="text-xs line-clamp-2">{data.executionError}</span>
          </div>
        )}
        
        {/* Execution status text */}
        {executionStatus === 'running' && (
          <div className="mt-1 text-xs text-blue-600 font-medium">
            Executing...
          </div>
        )}
        {executionStatus === 'completed' && (
          <div className="mt-1 text-xs text-green-600 font-medium">
            ✓ Completed
          </div>
        )}
        
        {/* Config preview */}
        {!hasErrors && data.config && Object.keys(data.config).length > 0 && (
          <div className="mt-1 text-xs text-muted-foreground truncate">
            {Object.entries(data.config).slice(0, 2).map(([key, value]) => {
              const displayValue = typeof value === 'object' && value !== null 
                ? JSON.stringify(value).substring(0, 20)
                : String(value).substring(0, 20);
              return (
                <div key={key} className="truncate">
                  {key}: {displayValue}
                </div>
              );
            })}
          </div>
        )}
      </div>
      
      {/* Output Handle */}
      {definition.outputs.length > 0 && (
        <Handle
          type="source"
          position={Position.Right}
          className="w-3 h-3 !bg-primary border-2 border-white"
        />
      )}
    </div>
  );
});

BaseNode.displayName = 'BaseNode';
