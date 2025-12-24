import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { nodeRegistry } from '@/lib/workflow/registry/NodeRegistry';
import { cn } from '@/lib/utils';
import { AlertCircle, Loader2, CheckCircle2, XCircle, Info, Key } from 'lucide-react';
import { ErrorBoundary } from '../../common/ErrorBoundary';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

export interface BaseNodeData extends Record<string, any> {
  label: string;
  config: Record<string, any>;
  isValid?: boolean;
  errors?: string[];
  executionStatus?: 'idle' | 'running' | 'completed' | 'failed';
  executionOutput?: any;
  executionError?: string;
}

import type { Node } from '@xyflow/react';

export type BaseNodeType = Node<BaseNodeData>;

export const BaseNode = memo((props: NodeProps<BaseNodeType>) => {
  return (
    <ErrorBoundary name={`Node: ${props.data.label || props.type}`}>
      <BaseNodeInternal {...props} />
    </ErrorBoundary>
  );
});

const BaseNodeInternal = ({ id, type, data, selected }: NodeProps<BaseNodeType>) => {
  const definition = nodeRegistry.get(type!);
  if (!definition) return null;

  const Icon = definition.icon;
  const requiresCredentials = definition.requiresCredentials;
  const hasCredential = !!data.config?.credentialId;
  const credentialMissingError = requiresCredentials && !hasCredential;

  const hasErrors = (data.errors && data.errors.length > 0) || credentialMissingError;
  const executionStatus = data.executionStatus || 'idle';

  return (
    <div
      className={cn(
        'rounded-lg border-2 bg-white shadow-md transition-all min-w-[180px]',
        selected ? 'border-primary ring-2 ring-primary/20 shadow-lg' : 'border-gray-300',
        hasErrors && 'border-destructive ring-2 ring-destructive/20'
      )}
    >
      {/* Credential Status Badge */}
      {requiresCredentials && (
        <div className={cn(
          "absolute -top-2.5 -right-2.5 h-6 w-6 rounded-full flex items-center justify-center shadow-lg z-10",
          hasCredential ? "bg-primary text-white" : "bg-destructive text-white animate-bounce"
        )}>
          {hasCredential ? <Key className="w-3.5 h-3.5" /> : <Key className="w-3.5 h-3.5" />}
        </div>
      )}
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
            <span className="text-xs line-clamp-2">
              {data.errors && data.errors.length > 0
                ? data.errors[0]
                : "Required credential missing"}
            </span>
          </div>
        )}

        {/* Execution error */}
        {executionStatus === 'failed' && data.executionError && (
          <div className="mt-1.5 flex items-start gap-1 text-destructive bg-destructive/5 p-1 rounded border border-destructive/10">
            <XCircle className="w-3 h-3 flex-shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <span className="text-[10px] font-semibold block">Error:</span>
              <span className="text-[10px] line-clamp-3 block leading-tight">{data.executionError}</span>
              {data.executionError.length > 50 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button className="text-[9px] underline mt-1 flex items-center gap-0.5 opacity-70 hover:opacity-100">
                        <Info className="w-2.5 h-2.5" /> Details
                      </button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="max-w-[300px] text-xs">
                      {data.executionError}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
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
};

BaseNode.displayName = 'BaseNode';
