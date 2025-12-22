import { ToolBase, type ToolManifest } from '../../kernel';
import { db } from '../../../../../apps/api/db';
import { angariacaoLeads, insertAngariacaoLeadSchema, globalCustomFields, insertGlobalCustomFieldSchema } from '../../../../../shared/schema';
import { promises as fs } from 'fs';
import xlsx from 'xlsx';
import { eq, and } from 'drizzle-orm';

interface AnalyzeConfigureImportInput {
  moduleId: string; // 'lead-generation', 'crm', 'projects'
  entityType: string; // 'lead', 'client', 'project'
  filePath: string;
  dryRun?: boolean;
  autoCreateFields?: boolean;
}

interface ColumnAnalysis {
  name: string;
  normalizedName: string;
  inferredType: 'text' | 'number' | 'date' | 'select' | 'boolean';
  sampleValues: any[];
  uniqueValues: any[]; // Array instead of Set for JSON serialization
  nullCount: number;
  isMapped: boolean;
  mappedTo?: string;
}

export class AnalyzeConfigureImportEntitiesTool extends ToolBase<AnalyzeConfigureImportInput, any> {
  manifest: ToolManifest = {
    name: 'analyze_configure_and_import_entities',
    category: 'configuration',
    description: 'Universal tool that analyzes a CSV/Excel file, automatically creates necessary custom fields, and imports data into the specified module (leads, clients, projects, etc). All in a single conversational step.',
    parameters: [
      { name: 'moduleId', type: 'string', description: 'Module ID: lead-generation, crm, projects', required: true },
      { name: 'entityType', type: 'string', description: 'Entity type: lead, client, project, opportunity', required: true },
      { name: 'filePath', type: 'string', description: 'Path to Excel/CSV file', required: true },
      { name: 'dryRun', type: 'boolean', description: 'Preview mode (does not save anything)', required: false },
      { name: 'autoCreateFields', type: 'boolean', description: 'Create custom fields automatically?', required: false }
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: true
  };

  private normalizeHeader(header: string): string {
    return header
      .toLowerCase()
      .trim()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]/g, '');
  }

  private inferFieldType(columnName: string, values: any[]): ColumnAnalysis['inferredType'] {
    const nonNullValues = values.filter(v => v != null && String(v).trim() !== '');
    if (nonNullValues.length === 0) return 'text';

    // Date detection (must come before number check)
    if (this.isDateColumn(columnName, nonNullValues)) return 'date';

    // Number detection (strict - must be valid numbers)
    const numericCount = nonNullValues.filter(v => {
      const num = Number(v);
      return !isNaN(num) && isFinite(num) && String(v).trim() !== '';
    }).length;
    if (numericCount / nonNullValues.length > 0.8) return 'number';

    // Boolean detection
    const uniqueValues = new Set(nonNullValues.slice(0, 100)); // Sample first 100
    if (uniqueValues.size <= 2 && this.isBooleanLike(Array.from(uniqueValues))) return 'boolean';

    // Dropdown detection (limited unique values, capped at 100 samples)
    if (uniqueValues.size > 0 && uniqueValues.size <= 15) return 'select';

    return 'text';
  }

  private isDateColumn(columnName: string, values: any[]): boolean {
    const dateKeywords = ['date', 'data', 'when', 'deadline', 'start', 'end', 'inicio', 'fim'];
    const norm = this.normalizeHeader(columnName);
    
    if (dateKeywords.some(kw => norm.includes(kw))) {
      return true;
    }

    // Check if values look like dates
    const sample = values.slice(0, 10);
    const dateCount = sample.filter(v => {
      const d = new Date(v);
      return !isNaN(d.getTime());
    }).length;

    return dateCount / sample.length > 0.7;
  }

  private isBooleanLike(values: any[]): boolean {
    const boolStrings = new Set(['true', 'false', 'yes', 'no', 'sim', 'não', '1', '0', 'y', 'n']);
    return values.every(v => boolStrings.has(String(v).toLowerCase()));
  }

  private mapColumnToStandardField(normalized: string): string | null {
    const mappings: Record<string, string> = {
      'nome': 'fullName',
      'name': 'fullName',
      'fullname': 'fullName',
      'cliente': 'fullName',
      'client': 'fullName',
      'lead': 'fullName',
      
      'email': 'email',
      'mail': 'email',
      'emailaddress': 'email',
      
      'telefone': 'phone',
      'phone': 'phone',
      'tel': 'phone',
      'telemovel': 'phone',
      'mobile': 'phone',
      'contacto': 'phone',
      
      'empresa': 'company',
      'company': 'company',
      'organizacao': 'company',
      'organization': 'company',
      
      'cargo': 'jobTitle',
      'position': 'jobTitle',
      'job': 'jobTitle',
      'title': 'jobTitle',
      
      'origem': 'leadSource',
      'source': 'leadSource',
      'leadsource': 'leadSource',
      'fonte': 'leadSource',
    };

    return mappings[normalized] || null;
  }

  private async analyzeFile(filePath: string): Promise<{
    data: any[];
    columns: ColumnAnalysis[];
  }> {
    // Parse file
    const workbook = xlsx.readFile(filePath);
    const worksheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = xlsx.utils.sheet_to_json(worksheet);

    if (data.length === 0) {
      throw new Error('Empty file or no data');
    }

    // Build complete header list by merging keys from all rows (not just first)
    const allHeaders = new Set<string>();
    data.forEach((row: any) => {
      Object.keys(row).forEach(key => allHeaders.add(key));
    });
    const headers = Array.from(allHeaders);

    // Analyze columns
    const columns: ColumnAnalysis[] = headers.map(header => {
      const normalized = this.normalizeHeader(header);
      const columnValues = data.map((row: any) => row[header]);
      const nonNullValues = columnValues.filter(v => v != null && v !== '');
      
      // Cap unique values to prevent memory issues on large datasets
      const uniqueValuesSample = Array.from(new Set(
        nonNullValues
          .map(v => String(v).trim())
          .filter(v => v !== '')
          .slice(0, 1000) // Max 1k unique values
      ));
      
      return {
        name: header,
        normalizedName: normalized,
        inferredType: this.inferFieldType(header, columnValues),
        sampleValues: nonNullValues.slice(0, 5),
        uniqueValues: uniqueValuesSample, // Now an array for JSON serialization
        nullCount: columnValues.length - nonNullValues.length,
        isMapped: this.mapColumnToStandardField(normalized) !== null,
        mappedTo: this.mapColumnToStandardField(normalized) || undefined
      };
    });

    return { data, columns };
  }

  protected async executeInternal(
    input: AnalyzeConfigureImportInput,
    context: any,
    onProgress?: (progress: number, message: string) => void
  ): Promise<any> {
    try {
      // Validate file exists
      onProgress?.(10, 'Checking file...');
      try {
        await fs.access(input.filePath);
      } catch {
        return {
          success: false,
          error: `File not found: ${input.filePath}`
        };
      }

      // Analyze file structure
      onProgress?.(20, 'Analyzing file structure...');
      const { data, columns } = await this.analyzeFile(input.filePath);

      // Separate mapped vs unmapped columns
      const mappedColumns = columns.filter(c => c.isMapped);
      const unmappedColumns = columns.filter(c => !c.isMapped);

      onProgress?.(40, `Found ${columns.length} columns (${mappedColumns.length} mapped, ${unmappedColumns.length} new)`);

      // Create custom fields for unmapped columns (skip if dry run)
      const fieldsCreated: any[] = [];
      if (!input.dryRun && input.autoCreateFields !== false && unmappedColumns.length > 0) {
        onProgress?.(50, `Creating ${unmappedColumns.length} custom fields...`);
        
        for (const col of unmappedColumns) {
          const fieldKey = col.normalizedName;
          
          // Check if field already exists (case-insensitive)
          const [existing] = await db
            .select()
            .from(globalCustomFields)
            .where(
              and(
                eq(globalCustomFields.tenantId, context.tenantId),
                eq(globalCustomFields.environment, context.environment),
                eq(globalCustomFields.fieldKey, fieldKey)
              )
            )
            .limit(1);

          if (!existing) {
            const fieldConfig: any = {};
            
            // For select fields, populate options from unique values (cap at 50)
            if (col.inferredType === 'select' && col.uniqueValues.length > 0) {
              const options = col.uniqueValues
                .filter(v => v != null && String(v).trim() !== '')
                .slice(0, 50)
                .map(v => ({ value: String(v).trim(), label: String(v).trim() }));
              fieldConfig.options = options;
            }

            // Use schema validation
            const fieldData = insertGlobalCustomFieldSchema.parse({
              tenantId: context.tenantId,
              environment: context.environment,
              fieldKey,
              displayName: col.name,
              fieldType: col.inferredType,
              config: fieldConfig,
              isRequired: col.nullCount === 0,
              isSearchable: true,
              isVisible: true,
              isDeleted: false,
              createdBy: context.userId,
              updatedBy: context.userId
            });

            const [newField] = await db
              .insert(globalCustomFields)
              .values([fieldData])
              .returning();

            fieldsCreated.push(newField);
          } else {
            fieldsCreated.push({ ...existing, action: 'already_exists' });
          }
        }
      } else if (input.dryRun && unmappedColumns.length > 0) {
        // Dry run - preview fields without creating
        fieldsCreated.push(...unmappedColumns.map(col => ({
          fieldKey: col.normalizedName,
          displayName: col.name,
          fieldType: col.inferredType,
          action: 'preview_only'
        })));
      }

      if (input.dryRun) {
        return {
          success: true,
          dryRun: true,
          summary: {
            totalRows: data.length,
            columnsAnalyzed: columns.length,
            columnsMapped: mappedColumns.length,
            columnsNew: unmappedColumns.length,
            fieldsCreated: fieldsCreated.length
          },
          columns,
          fieldsCreated,
          message: `Preview: ${data.length} records ready to import`
        };
      }

      // Import data (ONLY for lead-generation for now)
      if (input.moduleId !== 'lead-generation' || input.entityType !== 'lead') {
        return {
          success: false,
          error: `Import only supported for leads at this time. Module '${input.moduleId}' under development.`
        };
      }

      onProgress?.(70, `Importing ${data.length} leads...`);

      const results = {
        total: data.length,
        success: 0,
        failed: 0,
        errors: [] as any[]
      };

      // Build column mapping
      const mapping: Record<string, string> = {};
      columns.forEach(col => {
        if (col.mappedTo) {
          mapping[col.mappedTo] = col.name;
        }
      });

      for (let i = 0; i < data.length; i++) {
        const row = data[i] as any;
        try {
          // Build custom field values from unmapped columns
          const customFieldValues: Record<string, any> = {};
          unmappedColumns.forEach(col => {
            const value = row[col.name];
            if (value != null && String(value).trim() !== '') {
              customFieldValues[col.normalizedName] = String(value).trim();
            }
          });

          const leadData: any = {
            tenantId: context.tenantId,
            environment: context.environment,
            createdBy: context.userId,
            fullName: mapping.fullName ? String(row[mapping.fullName] || '').trim() : '',
            email: mapping.email ? String(row[mapping.email] || '').trim() : '',
            phone: mapping.phone ? String(row[mapping.phone] || '').trim() : null,
            company: mapping.company ? String(row[mapping.company] || '').trim() : null,
            jobTitle: mapping.jobTitle ? String(row[mapping.jobTitle] || '').trim() : null,
            leadSource: mapping.leadSource ? String(row[mapping.leadSource] || '').trim() : 'import',
            // Store custom field values in metadata JSONB column
            metadata: Object.keys(customFieldValues).length > 0 ? customFieldValues : null
          };

          // Validate with schema (let schema enforce its own rules)
          const validated = insertAngariacaoLeadSchema.omit({ id: true, createdAt: true }).parse(leadData);
          await db.insert(angariacaoLeads).values([validated]);
          
          results.success++;
        } catch (error: any) {
          results.failed++;
          results.errors.push({
            rowIndex: i + 2, // Excel row (1-indexed + header)
            identifier: row[mapping.fullName] || row[mapping.email] || `Row ${i + 1}`,
            data: { fullName: row[mapping.fullName], email: row[mapping.email] },
            error: error.message
          });
        }
      }

      onProgress?.(100, 'Import completed!');

      return {
        success: true,
        summary: {
          moduleId: input.moduleId,
          entityType: input.entityType,
          columnsAnalyzed: columns.length,
          fieldsMapped: mappedColumns.length,
          fieldsCreated: fieldsCreated.filter(f => f.action !== 'already_exists').length,
          recordsImported: results.success,
          recordsFailed: results.failed
        },
        fieldsCreated,
        importResults: results,
        message: `✅ Import completed: ${results.success} ${input.entityType}s imported out of ${results.total} total`
      };
    } catch (error: any) {
      console.error('[AnalyzeConfigureImport] Error:', error);
      return {
        success: false,
        error: error.message || 'Error analyzing and importing file'
      };
    }
  }
}
