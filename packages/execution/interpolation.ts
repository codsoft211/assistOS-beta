/**
 * Variable interpolation engine for workflow execution
 * Supports {{trigger.field}} and {{steps.stepId.output.field}}
 */

/**
 * Resolves a dotted path within an object
 */
function resolvePath(obj: any, path: string): any {
    return path.split('.').reduce((prev, curr) => {
        return prev ? prev[curr] : undefined;
    }, obj);
}

/**
 * Interpolates variables in a string template
 */
export function interpolateString(template: string, context: any): string {
    if (!template || typeof template !== 'string') return template;

    return template.replace(/\{\{([^}]+)\}\}/g, (match, path) => {
        const trimmedPath = path.trim();

        // Support trigger.xxx
        if (trimmedPath.startsWith('trigger.')) {
            const value = resolvePath(context.variables || {}, trimmedPath.replace('trigger.', ''));
            return value !== undefined ? String(value) : '';
        }

        // Support steps.xxx.output.yyy
        if (trimmedPath.startsWith('steps.')) {
            const parts = trimmedPath.split('.');
            if (parts.length >= 4 && parts[2] === 'output') {
                const stepId = parts[1];
                const remainingPath = parts.slice(3).join('.');
                const stepResult = (context.stepResults || {})[stepId];
                const value = resolvePath(stepResult || {}, remainingPath);
                return value !== undefined ? String(value) : '';
            }
        }

        return match; // Return original if not matched
    });
}

/**
 * Recursively interpolates all strings in a config object
 */
export function interpolateConfig(config: any, context: any): any {
    if (!config) return config;

    if (typeof config === 'string') {
        return interpolateString(config, context);
    }

    if (Array.isArray(config)) {
        return config.map(item => interpolateConfig(item, context));
    }

    if (typeof config === 'object') {
        const result: any = {};
        for (const key in config) {
            result[key] = interpolateConfig(config[key], context);
        }
        return result;
    }

    return config;
}
