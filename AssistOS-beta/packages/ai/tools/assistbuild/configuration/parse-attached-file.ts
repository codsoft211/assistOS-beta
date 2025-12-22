/**
 * Parse Attached File Tool
 * 
 * Parses CSV, XLSX, XLS, and JSON files attached to AssistBuild conversations.
 * Returns structured data that can be used for:
 * - Creating custom tables
 * - Configuring company data
 * - Importing entity data
 * - Any configuration that requires tabular data
 */

import { ToolBase, type ToolManifest } from '../../kernel';
import { z } from 'zod';
import * as xlsx from 'xlsx';

const inputSchema = z.object({
  attachmentId: z.string().optional().describe('ID of the attachment to parse (from the message attachments)'),
  fileContent: z.string().optional().describe('Base64 encoded file content (alternative to attachmentId)'),
  fileName: z.string().describe('Original file name with extension'),
  mimeType: z.string().optional().describe('MIME type of the file'),
  maxRows: z.number().optional().default(1000).describe('Maximum rows to parse (default 1000)'),
  analyzeColumns: z.boolean().optional().default(true).describe('Analyze column types and statistics'),
});

type ParseAttachedFileInput = z.infer<typeof inputSchema>;

interface ColumnAnalysis {
  name: string;
  inferredType: 'string' | 'number' | 'boolean' | 'date' | 'email' | 'phone' | 'currency' | 'url' | 'uuid';
  sampleValues: any[];
  uniqueCount: number;
  nullCount: number;
  totalCount: number;
  minLength?: number;
  maxLength?: number;
  suggestedDbType: string;
}

export class ParseAttachedFileTool extends ToolBase<ParseAttachedFileInput, any> {
  manifest: ToolManifest = {
    name: 'parse_attached_file',
    category: 'configuration',
    description: `Parse attached CSV, XLSX, XLS, or JSON files and return structured data with column analysis.
Use this tool when the user attaches a file to:
- Understand the data structure before creating custom tables
- Extract data for company configuration
- Prepare data for entity imports
- Analyze file contents for any configuration purpose

Returns: parsed rows, column analysis (types, samples), and schema suggestions.`,
    parameters: [
      { 
        name: 'attachmentId', 
        type: 'string', 
        description: 'ID of the attachment to parse (preferred - looks up from message attachments)', 
        required: false 
      },
      { 
        name: 'fileContent', 
        type: 'string', 
        description: 'Base64 encoded file content (alternative to attachmentId)', 
        required: false 
      },
      { 
        name: 'fileName', 
        type: 'string', 
        description: 'Original file name with extension (e.g., "data.csv", "clients.xlsx")', 
        required: true 
      },
      { 
        name: 'mimeType', 
        type: 'string', 
        description: 'MIME type of the file', 
        required: false 
      },
      { 
        name: 'maxRows', 
        type: 'number', 
        description: 'Maximum rows to parse (default 1000, use lower for previews)', 
        required: false 
      },
      { 
        name: 'analyzeColumns', 
        type: 'boolean', 
        description: 'Perform column type analysis (default true)', 
        required: false 
      },
    ],
    scope: 'tenant',
    requiresAuth: true,
    progressSupport: false,
  };

  protected async executeInternal(
    input: ParseAttachedFileInput,
    context: any
  ): Promise<any> {
    const validated = inputSchema.parse(input);
    let { attachmentId, fileContent, fileName, mimeType, maxRows, analyzeColumns } = validated;
    
    // If attachmentId provided, look up from context attachments
    if (attachmentId && !fileContent) {
      const attachments = (context as any).attachments || [];
      const attachment = attachments.find((a: any) => a.id === attachmentId);
      
      if (!attachment) {
        return {
          success: false,
          error: 'Attachment not found',
          message: `No attachment found with ID "${attachmentId}". Available attachments: ${attachments.map((a: any) => `${a.name} (${a.id})`).join(', ') || 'none'}`,
        };
      }
      
      fileContent = attachment.base64Content;
      if (!mimeType) mimeType = attachment.type;
      if (!fileName) fileName = attachment.name;
      
      console.log(`[ParseAttachedFile] Found attachment: ${attachment.name} (${attachment.size} bytes)`);
    }
    
    // Validate we have file content
    if (!fileContent) {
      return {
        success: false,
        error: 'No file content',
        message: 'Either attachmentId or fileContent must be provided',
      };
    }
    
    // Determine file type from extension or MIME type
    const ext = fileName.toLowerCase().split('.').pop() || '';
    const fileType = this.detectFileType(ext, mimeType);
    
    if (!fileType) {
      return {
        success: false,
        error: 'Unsupported file type',
        message: `File "${fileName}" has unsupported format. Supported: CSV, XLSX, XLS, JSON`,
        supportedFormats: ['csv', 'xlsx', 'xls', 'json'],
      };
    }

    try {
      // Decode base64 content
      const buffer = Buffer.from(fileContent, 'base64');
      
      let rows: any[] = [];
      let headers: string[] = [];

      if (fileType === 'json') {
        const parsed = this.parseJSON(buffer);
        rows = parsed.rows;
        headers = parsed.headers;
      } else {
        const parsed = this.parseSpreadsheet(buffer, fileType);
        rows = parsed.rows;
        headers = parsed.headers;
      }

      if (rows.length === 0) {
        return {
          success: false,
          error: 'Empty file',
          message: 'The file contains no data rows',
        };
      }

      // Limit rows if needed
      const limitedRows = rows.slice(0, maxRows || 1000);
      const wasTruncated = rows.length > limitedRows.length;

      // Analyze columns if requested
      let columnAnalysis: ColumnAnalysis[] = [];
      if (analyzeColumns) {
        columnAnalysis = this.analyzeColumns(headers, rows);
      }

      // Generate schema suggestion for custom table creation
      const schemaSuggestion = this.generateSchemaSuggestion(columnAnalysis, fileName);

      return {
        success: true,
        fileName,
        fileType,
        totalRows: rows.length,
        parsedRows: limitedRows.length,
        wasTruncated,
        headers,
        columns: columnAnalysis,
        data: limitedRows,
        schemaSuggestion,
        message: `Successfully parsed ${limitedRows.length} rows from "${fileName}"${wasTruncated ? ` (truncated from ${rows.length})` : ''}`,
      };
    } catch (error: any) {
      return {
        success: false,
        error: 'Parse error',
        message: `Failed to parse file: ${error.message}`,
        details: error.stack,
      };
    }
  }

  private detectFileType(ext: string, mimeType?: string): 'csv' | 'xlsx' | 'xls' | 'json' | null {
    // Check extension first
    if (['csv', 'txt'].includes(ext)) return 'csv';
    if (ext === 'xlsx') return 'xlsx';
    if (ext === 'xls') return 'xls';
    if (ext === 'json') return 'json';

    // Check MIME type as fallback
    if (mimeType) {
      if (mimeType === 'text/csv' || mimeType === 'text/plain') return 'csv';
      if (mimeType === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') return 'xlsx';
      if (mimeType === 'application/vnd.ms-excel') return 'xls';
      if (mimeType === 'application/json') return 'json';
    }

    return null;
  }

  private parseJSON(buffer: Buffer): { rows: any[]; headers: string[] } {
    const content = buffer.toString('utf-8');
    const parsed = JSON.parse(content);
    
    // Handle array of objects
    if (Array.isArray(parsed)) {
      if (parsed.length === 0) return { rows: [], headers: [] };
      
      // Collect all unique keys from all objects
      const allKeys = new Set<string>();
      parsed.forEach(item => {
        if (typeof item === 'object' && item !== null) {
          Object.keys(item).forEach(key => allKeys.add(key));
        }
      });
      
      return {
        rows: parsed,
        headers: Array.from(allKeys),
      };
    }
    
    // Handle single object with array values (e.g., { "data": [...] })
    if (typeof parsed === 'object' && parsed !== null) {
      for (const key of Object.keys(parsed)) {
        if (Array.isArray(parsed[key])) {
          const rows = parsed[key];
          if (rows.length === 0) return { rows: [], headers: [] };
          
          const allKeys = new Set<string>();
          rows.forEach((item: any) => {
            if (typeof item === 'object' && item !== null) {
              Object.keys(item).forEach(k => allKeys.add(k));
            }
          });
          
          return {
            rows,
            headers: Array.from(allKeys),
          };
        }
      }
      
      // Single object - treat as one row
      return {
        rows: [parsed],
        headers: Object.keys(parsed),
      };
    }
    
    throw new Error('Invalid JSON structure. Expected array of objects or object with array.');
  }

  private parseSpreadsheet(buffer: Buffer, type: 'csv' | 'xlsx' | 'xls'): { rows: any[]; headers: string[] } {
    const workbook = xlsx.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // Get range to determine headers
    const range = xlsx.utils.decode_range(worksheet['!ref'] || 'A1');
    
    // Parse to JSON with headers
    const rows = xlsx.utils.sheet_to_json(worksheet, {
      raw: false,  // Convert all values to strings for consistent type inference
      defval: null,  // Use null for empty cells
    });
    
    if (rows.length === 0) return { rows: [], headers: [] };
    
    // Collect all unique headers from all rows
    const allHeaders = new Set<string>();
    rows.forEach((row: any) => {
      Object.keys(row).forEach(key => allHeaders.add(key));
    });
    
    return {
      rows,
      headers: Array.from(allHeaders),
    };
  }

  private analyzeColumns(headers: string[], rows: any[]): ColumnAnalysis[] {
    return headers.map(header => {
      const values = rows.map(row => row[header]);
      const nonNullValues = values.filter(v => v !== null && v !== undefined && v !== '');
      
      // Count unique values (limit to prevent memory issues)
      const uniqueValues = new Set(nonNullValues.slice(0, 5000).map(v => String(v)));
      
      // Infer type from values
      const inferredType = this.inferColumnType(nonNullValues);
      
      // Calculate lengths for strings
      let minLength: number | undefined;
      let maxLength: number | undefined;
      if (inferredType === 'string' || inferredType === 'email' || inferredType === 'phone') {
        const lengths = nonNullValues.map(v => String(v).length).filter(l => l > 0);
        if (lengths.length > 0) {
          minLength = Math.min(...lengths);
          maxLength = Math.max(...lengths);
        }
      }

      return {
        name: header,
        inferredType,
        sampleValues: nonNullValues.slice(0, 5),
        uniqueCount: uniqueValues.size,
        nullCount: values.length - nonNullValues.length,
        totalCount: values.length,
        minLength,
        maxLength,
        suggestedDbType: this.getSuggestedDbType(inferredType, maxLength),
      };
    });
  }

  private inferColumnType(values: any[]): ColumnAnalysis['inferredType'] {
    if (values.length === 0) return 'string';
    
    // Sample values for type inference
    const sample = values.slice(0, 100);
    
    // Check patterns
    let emailCount = 0;
    let phoneCount = 0;
    let numberCount = 0;
    let booleanCount = 0;
    let dateCount = 0;
    let urlCount = 0;
    let uuidCount = 0;
    let currencyCount = 0;

    for (const value of sample) {
      const str = String(value).trim();
      
      // Email pattern
      if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(str)) {
        emailCount++;
        continue;
      }
      
      // UUID pattern
      if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)) {
        uuidCount++;
        continue;
      }
      
      // URL pattern
      if (/^https?:\/\/[^\s]+$/i.test(str)) {
        urlCount++;
        continue;
      }
      
      // Phone pattern (various formats)
      if (/^[\d\s\-\+\(\)]{8,20}$/.test(str) && /\d{6,}/.test(str.replace(/\D/g, ''))) {
        phoneCount++;
        continue;
      }
      
      // Currency pattern
      if (/^[$€£¥₹]?\s*[\d,.]+\s*[$€£¥₹]?$/.test(str) && /\d/.test(str)) {
        currencyCount++;
        continue;
      }
      
      // Boolean pattern
      if (['true', 'false', 'yes', 'no', 'sim', 'não', '1', '0'].includes(str.toLowerCase())) {
        booleanCount++;
        continue;
      }
      
      // Number pattern
      const numValue = parseFloat(str.replace(/,/g, '.').replace(/[^\d.-]/g, ''));
      if (!isNaN(numValue) && /^-?[\d,.]+$/.test(str.replace(/\s/g, ''))) {
        numberCount++;
        continue;
      }
      
      // Date pattern (various formats)
      const datePatterns = [
        /^\d{4}-\d{2}-\d{2}$/,  // ISO
        /^\d{2}\/\d{2}\/\d{4}$/,  // DD/MM/YYYY
        /^\d{2}-\d{2}-\d{4}$/,  // DD-MM-YYYY
        /^\d{4}\/\d{2}\/\d{2}$/,  // YYYY/MM/DD
      ];
      if (datePatterns.some(p => p.test(str)) || !isNaN(Date.parse(str))) {
        dateCount++;
      }
    }
    
    const threshold = sample.length * 0.7;  // 70% of values must match
    
    if (uuidCount >= threshold) return 'uuid';
    if (emailCount >= threshold) return 'email';
    if (urlCount >= threshold) return 'url';
    if (phoneCount >= threshold) return 'phone';
    if (currencyCount >= threshold) return 'currency';
    if (booleanCount >= threshold) return 'boolean';
    if (dateCount >= threshold) return 'date';
    if (numberCount >= threshold) return 'number';
    
    return 'string';
  }

  private getSuggestedDbType(inferredType: ColumnAnalysis['inferredType'], maxLength?: number): string {
    switch (inferredType) {
      case 'uuid': return 'uuid';
      case 'email': return 'varchar(255)';
      case 'url': return 'text';
      case 'phone': return 'varchar(50)';
      case 'currency': return 'decimal(19,4)';
      case 'boolean': return 'boolean';
      case 'date': return 'timestamp';
      case 'number': return 'decimal(19,4)';
      case 'string':
      default:
        if (maxLength && maxLength <= 255) {
          return `varchar(${Math.max(maxLength * 2, 50)})`;  // Give some buffer
        }
        return 'text';
    }
  }

  private generateSchemaSuggestion(columns: ColumnAnalysis[], fileName: string): any {
    // Generate a suggested table name from file name
    const baseName = fileName
      .replace(/\.[^.]+$/, '')  // Remove extension
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')  // Replace non-alphanumeric with underscore
      .replace(/_+/g, '_')  // Collapse multiple underscores
      .replace(/^_|_$/g, '');  // Remove leading/trailing underscores
    
    const tableName = baseName || 'imported_data';
    
    return {
      tableName,
      description: `Table created from ${fileName}`,
      category: 'custom',
      columns: [
        // Always include a UUID primary key
        {
          name: 'id',
          type: 'uuid',
          nullable: false,
          primaryKey: true,
          default: 'gen_random_uuid()',
        },
        // Include tenant_id for multi-tenancy
        {
          name: 'tenant_id',
          type: 'varchar',
          length: 36,
          nullable: false,
        },
        // Map file columns
        ...columns.map(col => ({
          name: this.sanitizeColumnName(col.name),
          type: col.suggestedDbType.split('(')[0],  // Get base type
          length: this.extractLength(col.suggestedDbType),
          nullable: col.nullCount > 0,
          description: `From column "${col.name}" (${col.inferredType})`,
        })),
        // Standard audit fields
        {
          name: 'created_at',
          type: 'timestamp',
          nullable: false,
          default: 'now()',
        },
        {
          name: 'updated_at',
          type: 'timestamp',
          nullable: false,
          default: 'now()',
        },
      ],
      indexes: [],
    };
  }

  private sanitizeColumnName(name: string): string {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '_')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '')
      .substring(0, 63)  // PostgreSQL max identifier length
      || 'column';
  }

  private extractLength(dbType: string): number | undefined {
    const match = dbType.match(/\((\d+)/);
    return match ? parseInt(match[1]) : undefined;
  }
}

