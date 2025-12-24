/**
 * Enterprise-Safe Expression Engine for Workflow Automation
 * 
 * DESIGN PRINCIPLES:
 * 1. NO eval() or Function() - strictly deterministic path resolution.
 * 2. Type-Safe - handle objects, arrays, and strings correctly.
 * 3. Graceful Null Resolution - return consistent values for missing data.
 * 4. Immutable Context - do not modify the original workflow data.
 */

import type { ExecutionContext } from './types';

/**
 * Resolves a complex dotted path within a context object.
 * Supports: "trigger.fieldName", "steps.id.output.path.to.data"
 */
function resolvePath(obj: any, path: string): any {
    if (!obj || !path) return undefined;

    const parts = path.split('.');
    let current = obj;

    for (const part of parts) {
        if (current === null || current === undefined) {
            return undefined;
        }

        // Safety check: Don't allow access to proto or constructor
        if (part === '__proto__' || part === 'constructor' || part === 'prototype') {
            return undefined;
        }

        current = current[part];
    }

    return current;
}

/**
 * Evaluates a single token (expression inside {{ }})
 */
function evaluateExpression(expr: string, context: ExecutionContext): any {
    const token = expr.trim();

    // 1. Helper Functions (Deterministic)
    if (token === 'now()') {
        return new Date().toISOString();
    }

    // 2. Environment Variables
    if (token.startsWith('env.')) {
        const varName = token.split('.')[1];
        if (!varName) return '';

        // In backend, prioritize process.env; fallback to context if provided
        const envSource = (typeof process !== 'undefined' ? process.env : {}) as Record<string, any>;
        return envSource[varName] || '';
    }

    // 3. Trigger Data: {{trigger.field}}
    if (token.startsWith('trigger.')) {
        const path = token.substring(8); // Length of "trigger."
        return resolvePath(context.variables || {}, path);
    }

    // 4. Step Outputs: {{steps.nodeId.output.field}} or {{steps.nodeId.error}}
    if (token.startsWith('steps.')) {
        const parts = token.split('.');
        if (parts.length < 3) return '';

        const nodeId = parts[1];
        const type = parts[2]; // 'output' or 'error'

        const stepResult = context.stepResults?.[nodeId];
        if (!stepResult) return undefined;

        if (type === 'output') {
            const remainingPath = parts.slice(3).join('.');
            // If no remaining path, return the whole output object
            return remainingPath ? resolvePath(stepResult, remainingPath) : stepResult;
        }

        if (type === 'error') {
            return stepResult.error || '';
        }
    }

    return undefined;
}

/**
 * Interpolates all expressions within a string template.
 * Example: "Hello {{trigger.name}}, current time is {{now()}}"
 */
export function interpolateString(template: string, context: ExecutionContext): string {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, expr) => {
        const value = evaluateExpression(expr, context);

        // If unresolved, return the original placeholder to indicate failure/missing data
        if (value === undefined || value === null) {
            return match;
        }

        if (typeof value === 'object') {
            try {
                return JSON.stringify(value);
            } catch (e) {
                return '[Circular/Complex Object]';
            }
        }

        return String(value);
    });
}

/**
 * Recursively interpolates a configuration object or array.
 * This is used to resolve all dynamic values in a node's config before execution.
 */
export function interpolateConfig(config: any, context: ExecutionContext): any {
    if (config === null || config === undefined) return config;

    if (typeof config === 'string') {
        // If the entire string is just an expression like "{{steps.id.output}}", 
        // return the raw value (which could be an object/array) instead of stringifying it.
        const directMatch = config.trim().match(/^\{\{([^}]+)\}\}$/);
        if (directMatch) {
            const resolved = evaluateExpression(directMatch[1], context);
            return resolved !== undefined ? resolved : config;
        }

        return interpolateString(config, context);
    }

    if (Array.isArray(config)) {
        return config.map(item => interpolateConfig(item, context));
    }

    if (typeof config === 'object' && config !== null) {
        const result: Record<string, any> = {};
        for (const key in config) {
            if (Object.prototype.hasOwnProperty.call(config, key)) {
                result[key] = interpolateConfig(config[key], context);
            }
        }
        return result;
    }

    return config;
}

/**
 * Checks if a configuration object still contains unresolved {{ expressions }}.
 * Useful for strict validation before execution.
 */
export function hasUnresolvedExpressions(config: any): string | null {
    if (config === null || config === undefined) return null;

    if (typeof config === 'string') {
        const match = config.match(/\{\{([^}]+)\}\}/);
        return match ? match[0] : null;
    }

    if (Array.isArray(config)) {
        for (const item of config) {
            const unresolved = hasUnresolvedExpressions(item);
            if (unresolved) return unresolved;
        }
    }

    if (typeof config === 'object' && config !== null) {
        for (const key in config) {
            if (Object.prototype.hasOwnProperty.call(config, key)) {
                const unresolved = hasUnresolvedExpressions(config[key]);
                if (unresolved) return unresolved;
            }
        }
    }

    return null;
}
