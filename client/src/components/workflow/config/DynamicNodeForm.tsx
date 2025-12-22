import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { INodeDefinition } from '@/lib/workflow/types/workflow.types';
import { useEffect, useRef } from 'react';

interface DynamicNodeFormProps {
    definition: INodeDefinition;
    value: Record<string, any>;
    onChange: (value: Record<string, any>) => void;
}

/**
 * Dynamic form generator from Zod schema
 * Eliminates need for hardcoded forms per node type
 */
export function DynamicNodeForm({ definition, value, onChange }: DynamicNodeFormProps) {
    const { register, watch, setValue, formState: { errors } } = useForm({
        resolver: zodResolver(definition.configSchema),
        defaultValues: value,
        mode: 'onChange',
    });

    // Watch all form values and sync to parent
    const formValues = watch();
    const lastSyncedValue = useRef(JSON.stringify(value));

    useEffect(() => {
        const currentFormValuesJson = JSON.stringify(formValues);

        // Only sync if the form total values have changed AND it's different from what we last synced
        if (currentFormValuesJson !== lastSyncedValue.current) {
            const timer = setTimeout(() => {
                // Double check it's still different after debounce
                if (JSON.stringify(watch()) !== lastSyncedValue.current) {
                    lastSyncedValue.current = currentFormValuesJson;
                    onChange(formValues);
                }
            }, 300); // 300ms debounce for typing stability

            return () => clearTimeout(timer);
        }
    }, [formValues, onChange, watch]);

    // Update the ref if the 'value' prop changes from outside (e.g. store update)
    useEffect(() => {
        lastSyncedValue.current = JSON.stringify(value);
    }, [value]);

    // If node has custom config component, use it
    if (definition.configComponent) {
        const CustomComponent = definition.configComponent;
        return <CustomComponent value={value} onChange={onChange} />;
    }

    // Auto-generate form from Zod schema
    return (
        <div className="space-y-4">
            {renderSchemaFields(definition.configSchema, register, setValue, value, errors)}
        </div>
    );
}

/**
 * Recursively render form fields from Zod schema
 */
function renderSchemaFields(
    schema: z.ZodSchema,
    register: any,
    setValue: any,
    values: Record<string, any>,
    errors: any
): JSX.Element[] {
    const fields: JSX.Element[] = [];

    // Extract schema shape (works for ZodObject)
    if (!(schema instanceof z.ZodObject)) {
        return fields;
    }

    const shape = schema.shape;

    Object.entries(shape).forEach(([fieldName, fieldSchema]: [string, any]) => {
        // Unwrap optional/nullable
        let actualSchema = fieldSchema;
        let isOptional = false;

        if (fieldSchema instanceof z.ZodOptional || fieldSchema instanceof z.ZodNullable) {
            actualSchema = fieldSchema.unwrap();
            isOptional = true;
        }

        const label = fieldName
            .split(/(?=[A-Z])/)
            .map(word => word.charAt(0).toUpperCase() + word.slice(1))
            .join(' ');

        const fieldError = errors[fieldName];

        // String field
        if (actualSchema instanceof z.ZodString) {
            const description = actualSchema._def.description || '';
            const isLongText = description.includes('template') || description.includes('body');

            fields.push(
                <div key={fieldName} className="space-y-2">
                    <Label htmlFor={fieldName}>
                        {label}
                        {isOptional && <span className="text-muted-foreground ml-1">(optional)</span>}
                    </Label>
                    {isLongText ? (
                        <Textarea
                            id={fieldName}
                            {...register(fieldName)}
                            placeholder={`Enter ${label.toLowerCase()}`}
                            rows={4}
                            className="font-mono text-xs"
                        />
                    ) : (
                        <Input
                            id={fieldName}
                            {...register(fieldName)}
                            placeholder={`Enter ${label.toLowerCase()}`}
                        />
                    )}
                    {fieldError && (
                        <p className="text-xs text-destructive">{fieldError.message}</p>
                    )}
                    {description && (
                        <p className="text-xs text-muted-foreground">{description}</p>
                    )}
                </div>
            );
        }
        // Number field
        else if (actualSchema instanceof z.ZodNumber) {
            const min = (actualSchema._def.checks as any[])?.find((c: any) => c.kind === 'min')?.value;
            const max = (actualSchema._def.checks as any[])?.find((c: any) => c.kind === 'max')?.value;

            fields.push(
                <div key={fieldName} className="space-y-2">
                    <Label htmlFor={fieldName}>
                        {label}
                        {isOptional && <span className="text-muted-foreground ml-1">(optional)</span>}
                    </Label>
                    <Input
                        id={fieldName}
                        type="number"
                        {...register(fieldName, { valueAsNumber: true })}
                        min={min}
                        max={max}
                        placeholder={`Enter ${label.toLowerCase()}`}
                    />
                    {fieldError && (
                        <p className="text-xs text-destructive">{fieldError.message}</p>
                    )}
                    {(min !== undefined || max !== undefined) && (
                        <p className="text-xs text-muted-foreground">
                            {min !== undefined && `Min: ${min}`}
                            {min !== undefined && max !== undefined && ' | '}
                            {max !== undefined && `Max: ${max}`}
                        </p>
                    )}
                </div>
            );
        }
        // Boolean field
        else if (actualSchema instanceof z.ZodBoolean) {
            fields.push(
                <div key={fieldName} className="flex items-center justify-between space-y-2">
                    <Label htmlFor={fieldName}>{label}</Label>
                    <Switch
                        id={fieldName}
                        checked={values[fieldName] || false}
                        onCheckedChange={(checked) => setValue(fieldName, checked)}
                    />
                </div>
            );
        }
        // Enum field (select)
        else if (actualSchema instanceof z.ZodEnum) {
            const options = actualSchema._def.values;

            fields.push(
                <div key={fieldName} className="space-y-2">
                    <Label htmlFor={fieldName}>
                        {label}
                        {isOptional && <span className="text-muted-foreground ml-1">(optional)</span>}
                    </Label>
                    <Select
                        value={values[fieldName] || ''}
                        onValueChange={(val) => setValue(fieldName, val)}
                    >
                        <SelectTrigger id={fieldName}>
                            <SelectValue placeholder={`Select ${label.toLowerCase()}`} />
                        </SelectTrigger>
                        <SelectContent>
                            {options.map((option: string) => (
                                <SelectItem key={option} value={option}>
                                    {option.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())}
                                </SelectItem>
                            ))}
                        </SelectContent>
                    </Select>
                    {fieldError && (
                        <p className="text-xs text-destructive">{fieldError.message}</p>
                    )}
                </div>
            );
        }
        // Record/Object field (fallback to JSON editor)
        else if (actualSchema instanceof z.ZodRecord || actualSchema instanceof z.ZodObject) {
            fields.push(
                <div key={fieldName} className="space-y-2">
                    <Label htmlFor={fieldName}>
                        {label}
                        {isOptional && <span className="text-muted-foreground ml-1">(optional)</span>}
                    </Label>
                    <Textarea
                        id={fieldName}
                        value={JSON.stringify(values[fieldName] || {}, null, 2)}
                        onChange={(e) => {
                            try {
                                const parsed = JSON.parse(e.target.value);
                                setValue(fieldName, parsed);
                            } catch {
                                // Invalid JSON, ignore
                            }
                        }}
                        placeholder={`{}`}
                        rows={4}
                        className="font-mono text-xs"
                    />
                    {fieldError && (
                        <p className="text-xs text-destructive">{fieldError.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">JSON format</p>
                </div>
            );
        }
    });

    return fields;
}
