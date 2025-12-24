import { nodeRegistry } from '../registry/NodeRegistry';
import { WorkflowNode, WorkflowEdge, ValidationError } from '../types/workflow.types';

/**
 * Validates a workflow before execution or publication
 */
export function validateWorkflow(
    nodes: WorkflowNode[],
    edges: WorkflowEdge[]
): { valid: boolean; errors: ValidationError[] } {
    const errors: ValidationError[] = [];

    // 1. Must have at least one node
    if (nodes.length === 0) {
        errors.push({ field: 'nodes', message: 'Workflow must have at least one node' });
        return { valid: false, errors };
    }

    // 2. Must have at least one trigger node
    const hasTrigger = nodes.some(node => {
        const definition = nodeRegistry.get(node.type!);
        return definition?.category === 'trigger';
    });

    if (!hasTrigger) {
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

    // 4. Config & Credential Validation
    nodes.forEach(node => {
        const definition = nodeRegistry.get(node.type!);
        if (!definition) return;

        // A. Zod Schema Validation
        if (definition.configSchema) {
            const result = definition.configSchema.safeParse(node.data.config);
            if (!result.success) {
                result.error.errors.forEach(err => {
                    errors.push({
                        nodeId: node.id,
                        field: err.path.join('.'),
                        message: err.message
                    });
                });
            }
        }

        // B. Credential Enforcement
        if (definition.requiresCredentials) {
            const credentialId = node.data.config?.credentialId;
            if (!credentialId) {
                errors.push({
                    nodeId: node.id,
                    field: 'credentialId',
                    message: `Nodes of type "${definition.label}" require ${definition.credentialType || 'a'} credential`
                });
            }
        }

        // C. Custom Logic Validation (Deprecated in favor of Zod but kept for compatibility)
        if (definition.validate) {
            const nodeErrors = definition.validate(node.data, {} as any); // Pass dummy workflow for now
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
