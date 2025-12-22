import { nodeRegistry } from '../registry/NodeRegistry';
import { WorkflowNode, WorkflowEdge, ValidationError } from '../types/workflow.types';

/**
 * Validates a workflow before execution
 */
export function validateWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): { valid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    // 1. Must have at least one node
    if (nodes.length === 0) {
        errors.push({ field: 'nodes', message: 'Workflow must have at least one node' });
    }

    // 2. Must have at least one trigger node
    const hasTrigger = nodes.some(node => {
        const definition = nodeRegistry.get(node.type!);
        return definition?.category === 'trigger';
    });

    if (nodes.length > 0 && !hasTrigger) {
        errors.push({ field: 'nodes', message: 'Workflow must have at least one trigger node' });
    }

    // 3. Check for disconnected nodes (except triggers)
    nodes.forEach(node => {
        const definition = nodeRegistry.get(node.type!);
        if (definition?.category !== 'trigger') {
            const isConnected = edges.some(edge => edge.target === node.id);
            if (!isConnected) {
                errors.push({
                    nodeId: node.id,
                    field: 'connection',
                    message: `Node "${node.data.label}" is not connected to any previous node`
                });
            }
        }
    });

    // 4. Run node-specific validation from registry
    nodes.forEach(node => {
        const definition = nodeRegistry.get(node.type!);
        if (definition?.validate) {
            const nodeErrors = definition.validate(node.data);
            nodeErrors.forEach(err => {
                errors.push({
                    nodeId: node.id,
                    ...err
                });
            });
        }
    });

    return {
        valid: errors.length === 0,
        errors
    };
}
