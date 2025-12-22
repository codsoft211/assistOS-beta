import Handlebars from 'handlebars';
import fs from 'fs';
import path from 'path';

export interface BlueprintEntity {
  name: string;
  fields: Array<{
    name: string;
    type: 'text' | 'integer' | 'real' | 'timestamp' | 'boolean';
    required?: boolean;
  }>;
}

export interface BlueprintTemplateCode {
  entities: BlueprintEntity[];
}

export interface GeneratedFiles {
  [filePath: string]: string;
}

export class BlueprintCompilerService {
  private templates: Map<string, HandlebarsTemplateDelegate> = new Map();

  constructor() {
    const templateDir = path.join(__dirname, '../templates');
    this.loadTemplate('entity.drizzle', path.join(templateDir, 'entity.drizzle.ts.hbs'));
    this.loadTemplate('entity.routes', path.join(templateDir, 'entity.routes.ts.hbs'));
    this.loadTemplate('entity-list', path.join(templateDir, 'entity-list.tsx.hbs'));
    this.loadTemplate('entity-form', path.join(templateDir, 'entity-form.tsx.hbs'));
    
    console.log('[BlueprintCompiler] Templates loaded successfully');
  }

  private loadTemplate(name: string, filePath: string) {
    try {
      const templateContent = fs.readFileSync(filePath, 'utf-8');
      this.templates.set(name, Handlebars.compile(templateContent));
      console.log(`[BlueprintCompiler] Loaded template: ${name}`);
    } catch (error: any) {
      console.error(`[BlueprintCompiler] Failed to load template ${name}:`, error.message);
      throw error;
    }
  }

  async compile(templateCode: BlueprintTemplateCode): Promise<GeneratedFiles> {
    const files: GeneratedFiles = {};

    console.log(`[BlueprintCompiler] Compiling ${templateCode.entities.length} entities...`);

    for (const entity of templateCode.entities) {
      const context = this.buildContext(entity);

      files[`shared/schema-${entity.name}.ts`] = this.templates.get('entity.drizzle')!(context);
      files[`apps/api/routes/${entity.name}.ts`] = this.templates.get('entity.routes')!(context);
      files[`client/src/pages/${entity.name}/index.tsx`] = this.templates.get('entity-list')!(context);
      files[`client/src/pages/${entity.name}/form.tsx`] = this.templates.get('entity-form')!(context);

      console.log(`[BlueprintCompiler] Generated files for entity: ${entity.name}`);
    }

    console.log(`[BlueprintCompiler] Compilation complete. Generated ${Object.keys(files).length} files.`);
    return files;
  }

  private buildContext(entity: BlueprintEntity) {
    return {
      entityName: entity.name,
      pascalEntityName: this.toPascalCase(entity.name),
      tableName: entity.name.toLowerCase(),
      routePath: entity.name.toLowerCase(),
      entityLabel: this.toLabel(entity.name),
      fields: entity.fields.map(f => ({
        fieldKey: f.name,
        fieldLabel: this.toLabel(f.name),
        fieldType: this.mapFieldType(f.type),
        required: f.required || false
      }))
    };
  }

  private mapFieldType(type: string): string {
    const typeMap: Record<string, string> = {
      'text': 'text',
      'integer': 'integer',
      'real': 'real',
      'timestamp': 'timestamp',
      'boolean': 'boolean'
    };
    return typeMap[type] || 'text';
  }

  private toPascalCase(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  private toLabel(str: string): string {
    return str.charAt(0).toUpperCase() + str.slice(1).replace(/([A-Z])/g, ' $1');
  }
}
