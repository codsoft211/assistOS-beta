import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import type { IConnector } from '../base/connector-interface';
import type {
  ConnectorContext,
  ConnectorConfig,
  SyncOptions,
  SyncResult,
  ConnectorStatusResponse,
  ConnectorCapability,
} from '../base/types';

export interface GoogleDocumentAIConfig extends ConnectorConfig {
  projectId: string;
  serviceAccountKey: {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
  };
  processorId: string;
}

export interface ProcessDocumentOptions {
  mimeType: string;
  processorId?: string;
}

export interface ProcessDocumentResult {
  text: string;
  entities: Array<{
    type: string;
    value: string;
    confidence: number;
  }>;
  tables?: Array<{
    rows: number;
    columns: number;
    data: string[][];
  }>;
}

export class GoogleDocumentAIConnector implements IConnector {
  type = 'google_document_ai' as const;
  name = 'Google Document AI';
  description = 'OCR and document processing using Google Document AI';
  capabilities: ConnectorCapability[] = ['ocr'];
  authType = 'service_account' as const;

  private context?: ConnectorContext;
  private config?: GoogleDocumentAIConfig;
  private client?: DocumentProcessorServiceClient;

  async configure(config: ConnectorConfig, context: ConnectorContext): Promise<void> {
    const typedConfig = config as GoogleDocumentAIConfig;
    
    if (!typedConfig.projectId) {
      throw new Error('Missing required field: projectId');
    }
    
    if (!typedConfig.serviceAccountKey) {
      throw new Error('Missing required field: serviceAccountKey');
    }
    
    if (!typedConfig.processorId) {
      throw new Error('Missing required field: processorId');
    }

    if (!typedConfig.serviceAccountKey.private_key || !typedConfig.serviceAccountKey.client_email) {
      throw new Error('Invalid service account key: missing private_key or client_email');
    }

    const processorIdPattern = /^projects\/[^\/]+\/locations\/[^\/]+\/processors\/[^\/]+$/;
    if (!processorIdPattern.test(typedConfig.processorId)) {
      throw new Error('Invalid processorId format. Expected: projects/{project}/locations/{location}/processors/{processor}');
    }

    try {
      const locationMatch = typedConfig.processorId.match(/locations\/([^\/]+)\//);
      const location = locationMatch ? locationMatch[1] : 'us';
      const apiEndpoint = `${location}-documentai.googleapis.com`;

      this.client = new DocumentProcessorServiceClient({
        credentials: {
          client_email: typedConfig.serviceAccountKey.client_email,
          private_key: typedConfig.serviceAccountKey.private_key,
        },
        projectId: typedConfig.projectId,
        apiEndpoint,
      });
      
      this.context = context;
      this.config = typedConfig;
      
      console.log(`[GoogleDocumentAI] Configured for tenant ${context.tenantId} with processor ${typedConfig.processorId} at endpoint ${apiEndpoint}`);
    } catch (error) {
      throw new Error(`Failed to configure Google Document AI client: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.client || !this.config) {
      throw new Error('Connector not configured');
    }

    try {
      const [processor] = await this.client.getProcessor({
        name: this.config.processorId,
      });

      console.log(`[GoogleDocumentAI] Successfully connected to processor: ${processor.displayName || processor.name}`);
      return true;
    } catch (error) {
      console.error('[GoogleDocumentAI] Connection test failed:', error);
      return false;
    }
  }

  async processDocument(file: Buffer, options: ProcessDocumentOptions): Promise<ProcessDocumentResult> {
    if (!this.client || !this.config) {
      throw new Error('Connector not configured');
    }

    const processorName = options.processorId || this.config.processorId;
    
    // VALIDATE: If processorId override, must be same region!
    if (options.processorId && options.processorId !== this.config.processorId) {
      const configLocation = this.config.processorId.match(/locations\/([^\/]+)\//)?.[1];
      const optionsLocation = options.processorId.match(/locations\/([^\/]+)\//)?.[1];
      
      if (configLocation !== optionsLocation) {
        throw new Error(
          `Cannot process document with different region processor. ` +
          `Configured region: ${configLocation}, requested: ${optionsLocation}. ` +
          `Please reconfigure connector to use ${optionsLocation} region.`
        );
      }
    }

    try {
      const request = {
        name: processorName,
        rawDocument: {
          content: file.toString('base64'),
          mimeType: options.mimeType,
        },
      };

      const [result] = await this.client.processDocument(request);
      const { document } = result;

      if (!document) {
        throw new Error('No document returned from processing');
      }

      const text = document.text || '';
      
      const entities = (document.entities || []).map(entity => ({
        type: entity.type || 'unknown',
        value: entity.mentionText || '',
        confidence: entity.confidence || 0,
      }));

      const tables = (document.pages || []).flatMap(page => {
        if (!page.tables || page.tables.length === 0) {
          return [];
        }

        return page.tables.map(table => {
          const rows = (table.headerRows?.length || 0) + (table.bodyRows?.length || 0);
          const columns = Math.max(
            ...(table.headerRows?.[0]?.cells?.length ? [table.headerRows[0].cells.length] : [0]),
            ...(table.bodyRows?.map(row => row.cells?.length || 0) || [0])
          );

          const data: string[][] = [];

          if (table.headerRows) {
            for (const row of table.headerRows) {
              const rowData: string[] = [];
              for (const cell of row.cells || []) {
                const cellText = this.extractTextFromLayout(cell.layout, text);
                rowData.push(cellText);
              }
              data.push(rowData);
            }
          }

          if (table.bodyRows) {
            for (const row of table.bodyRows) {
              const rowData: string[] = [];
              for (const cell of row.cells || []) {
                const cellText = this.extractTextFromLayout(cell.layout, text);
                rowData.push(cellText);
              }
              data.push(rowData);
            }
          }

          return {
            rows,
            columns,
            data,
          };
        });
      });

      console.log(`[GoogleDocumentAI] Processed document: ${text.length} chars, ${entities.length} entities, ${tables.length} tables`);

      return {
        text,
        entities,
        tables: tables.length > 0 ? tables : undefined,
      };
    } catch (error) {
      console.error('[GoogleDocumentAI] Document processing failed:', error);
      throw new Error(`Failed to process document: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  private extractTextFromLayout(layout: any, fullText: string): string {
    if (!layout || !layout.textAnchor || !layout.textAnchor.textSegments) {
      return '';
    }

    let text = '';
    for (const segment of layout.textAnchor.textSegments) {
      const startIndex = Number(segment.startIndex) || 0;
      const endIndex = Number(segment.endIndex) || fullText.length;
      text += fullText.substring(startIndex, endIndex);
    }
    return text.trim();
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.close();
      this.client = undefined;
    }
    this.context = undefined;
    this.config = undefined;
    console.log('[GoogleDocumentAI] Disconnected');
  }

  async sync(options?: SyncOptions): Promise<SyncResult> {
    console.log('[GoogleDocumentAI] Sync not applicable for OCR connector');
    return {
      success: true,
      recordsProcessed: 0,
      recordsFailed: 0,
      duration: 0,
    };
  }

  async getStatus(): Promise<ConnectorStatusResponse> {
    if (!this.context) {
      throw new Error('Connector not configured');
    }

    let status: 'active' | 'disabled' | 'error' = 'disabled';
    
    if (this.client && this.config) {
      try {
        const isConnected = await this.testConnection();
        status = isConnected ? 'active' : 'error';
      } catch (error) {
        status = 'error';
      }
    }

    return {
      connectorId: this.context.connectorId,
      status,
      config: this.config ? {
        projectId: this.config.projectId,
        processorId: this.config.processorId,
      } : undefined,
      metadata: this.config ? {
        processorType: 'OCR Processor',
        capabilities: this.capabilities,
      } : undefined,
    };
  }
}
