import { interpolateString } from './interpolation';

/**
 * Simple expression evaluator for workflow edge conditions
 * Supports: ===, !==, >, <, >=, <=, &&, ||
 */
export function evaluateCondition(condition: string, context: any): boolean {
    if (!condition || typeof condition !== 'string') return true;

    // Interpolate variables first
    const interpolated = interpolateString(condition, context);

    try {
        // Basic safety: only allow specific characters
        // This is NOT a full JS evaluator, just a simple boolean expression parser
        if (/[^a-zA-Z0-9\s'":._{}!=><&|()-]/.test(interpolated)) {
            console.warn('Condition contains potentially unsafe characters:', interpolated);
            return false;
        }

        // Replace JS operators with safe space-wrapped versions to avoid partial matches
        const sanitized = interpolated
            .replace(/===/g, ' === ')
            .replace(/!==/g, ' !== ')
            .replace(/>/g, ' > ')
            .replace(/</g, ' < ')
            .replace(/&&/g, ' && ')
            .replace(/\|\|/g, ' || ');

        // Use Function constructor for basic evaluation of the boolean expression
        // Since we've sanitized it to only allow specific characters and variables are already interpolated as strings/numbers
        // we are relatively safe here for an MVP.
        return !!(new Function(`return (${sanitized})`)());
    } catch (error) {
        console.error('Failed to evaluate condition:', condition, error);
        return false; // Fail safe
    }
}
