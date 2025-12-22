import type { IConnector } from '../base/connector-interface';
import type {
  ConnectorContext,
  ConnectorConfig,
  SyncOptions,
  SyncResult,
  ConnectorStatusResponse,
  ConnectorCapability,
} from '../base/types';
import axios, { AxiosInstance, AxiosError } from 'axios';

// ============================================================================
// TypeScript Types for Primavera ERP v10
// ============================================================================

export interface PrimaveraConfig extends ConnectorConfig {
  serverUrl: string;        // https://server/WebApi
  username: string;         // ERP username
  password: string;         // ERP password
  company: string;          // Company identifier
  instance: string;         // Database instance
  line: string;             // Company line
  accessToken?: string;     // JWT token
  tokenExpiresAt?: number;  // Token expiration timestamp
}

export interface PrimaveraTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface PrimaveraCustomer {
  Cliente: string;           // Customer code
  Nome: string;              // Customer name
  NomeAbreviado?: string;    // Abbreviated name
  NumContribuinte?: string;  // Tax number (NIF)
  Moeda?: string;            // Currency
  Telefone?: string;         // Phone
  Fax?: string;             // Fax
  Email?: string;            // Email
  Morada?: string;           // Address
  Localidade?: string;       // City
  CodigoPostal?: string;     // Postal code
  Distrito?: string;         // District
  Pais?: string;             // Country
  Vendedor?: string;         // Sales rep
  CondPag?: string;          // Payment terms
  ModoPag?: string;          // Payment method
  Inactivo?: boolean;        // Inactive flag
}

export interface PrimaveraSupplier {
  Fornecedor: string;        // Supplier code
  Nome: string;              // Supplier name
  NomeAbreviado?: string;    // Abbreviated name
  NumContribuinte?: string;  // Tax number (NIF)
  Moeda?: string;            // Currency
  Telefone?: string;         // Phone
  Fax?: string;             // Fax
  Email?: string;            // Email
  Morada?: string;           // Address
  Localidade?: string;       // City
  CodigoPostal?: string;     // Postal code
  Distrito?: string;         // District
  Pais?: string;             // Country
  CondPag?: string;          // Payment terms
  ModoPag?: string;          // Payment method
  Inactivo?: boolean;        // Inactive flag
}

export interface PrimaveraInvoice {
  TipoDoc: string;           // Document type
  Serie?: string;            // Series
  NumDoc: number;            // Document number
  Entidade: string;          // Customer/Supplier code
  NomeEntidade?: string;     // Customer/Supplier name
  DataDoc?: string;          // Document date (ISO format)
  DataVenc?: string;         // Due date
  TotalMerc?: number;        // Merchandise total
  TotalIVA?: number;         // VAT total
  TotalDocumento?: number;   // Total amount
  Moeda?: string;            // Currency
  EstadoDoc?: string;        // Document status
  Linhas?: PrimaveraInvoiceLine[];
}

export interface PrimaveraInvoiceLine {
  NumLinha?: number;         // Line number
  Artigo?: string;           // Product code
  Descricao: string;         // Description
  Quantidade: number;        // Quantity
  Unidade?: string;          // Unit
  PrecoLiquido: number;      // Net price
  Desconto1?: number;        // Discount 1 (%)
  Desconto2?: number;        // Discount 2 (%)
  TaxaIVA?: number;          // VAT rate (%)
  PrecoTotal?: number;       // Total price
}

export interface PrimaveraProduct {
  Artigo: string;            // Product code
  Descricao: string;         // Description
  Familia?: string;          // Product family
  SubFamilia?: string;       // Product subfamily
  Unidade?: string;          // Unit
  PVP1?: number;             // Price 1
  PVP2?: number;             // Price 2
  PrecoCusto?: number;       // Cost price
  TaxaIVA?: number;          // Default VAT rate
  STKActual?: number;        // Current stock
  Inactivo?: boolean;        // Inactive flag
  CDU_Campo1?: string;       // Custom field 1
  CDU_Campo2?: string;       // Custom field 2
}

export interface PrimaveraCompanyInfo {
  Empresa?: string;          // Company code
  Nome?: string;             // Company name
  Moeda?: string;            // Base currency
  NumContribuinte?: string;  // Tax number
}

export interface CreateInvoiceData {
  TipoDoc: string;           // Document type (e.g., 'FA' for Fatura)
  Serie?: string;            // Series
  Entidade: string;          // Customer code
  DataDoc?: string;          // Document date (ISO format)
  Linhas: Array<{
    Artigo?: string;         // Product code (optional)
    Descricao: string;       // Description
    Quantidade: number;      // Quantity
    Unidade?: string;        // Unit
    PrecoLiquido: number;    // Net price
    TaxaIVA?: number;        // VAT rate (%)
  }>;
  Observacoes?: string;      // Notes
}

// ============================================================================
// Primavera ERP Connector Implementation
// ============================================================================

export class PrimaveraConnector implements IConnector {
  type = 'primavera' as const;
  name = 'Primavera ERP';
  description = 'Integration with Primavera ERP v10 REST API (Portuguese ERP system)';
  capabilities: ConnectorCapability[] = ['accounting', 'invoicing', 'erp_sync'];
  authType = 'basic_auth' as const;

  private context?: ConnectorContext;
  private config?: PrimaveraConfig;
  private httpClient?: AxiosInstance;
  private lastSyncAt?: Date;
  private lastSyncStatus?: string;
  private lastSyncError?: string;

  // ============================================================================
  // Core Connector Methods
  // ============================================================================

  /**
   * Configure the Primavera ERP connector
   * Validates required credentials and initializes the connector
   */
  async configure(config: ConnectorConfig, context: ConnectorContext): Promise<void> {
    const primaveraConfig = config as PrimaveraConfig;

    // Validate required configuration
    if (!primaveraConfig.serverUrl) {
      throw new Error('Primavera: serverUrl is required');
    }
    if (!primaveraConfig.username) {
      throw new Error('Primavera: username is required');
    }
    if (!primaveraConfig.password) {
      throw new Error('Primavera: password is required');
    }
    if (!primaveraConfig.company) {
      throw new Error('Primavera: company is required');
    }
    if (!primaveraConfig.instance) {
      throw new Error('Primavera: instance is required');
    }
    if (!primaveraConfig.line) {
      throw new Error('Primavera: line is required');
    }

    // Ensure serverUrl doesn't have trailing slash
    const serverUrl = primaveraConfig.serverUrl.replace(/\/$/, '');

    this.context = context;
    this.config = {
      ...primaveraConfig,
      serverUrl,
    };

    console.log(`[Primavera] Configured for tenant ${context.tenantId}, company ${primaveraConfig.company}`);
  }

  /**
   * Authenticate with Primavera ERP using OAuth 2.0 password grant
   * Stores access token and expiration time
   */
  async authenticate(): Promise<PrimaveraTokenResponse> {
    if (!this.config) {
      throw new Error('Primavera: Connector not configured. Call configure() first.');
    }

    try {
      // Prepare form-urlencoded data for OAuth 2.0 password grant
      const params = new URLSearchParams({
        grant_type: 'password',
        username: this.config.username,
        password: this.config.password,
        line: this.config.line,
        company: this.config.company,
        instance: this.config.instance,
      });

      // Make authentication request
      const response = await axios.post<PrimaveraTokenResponse>(
        `${this.config.serverUrl}/token`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 30000,
        }
      );

      // Store token and calculate expiration time
      this.config.accessToken = response.data.access_token;
      this.config.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

      // Initialize HTTP client with token
      this.initializeHttpClient();

      console.log('[Primavera] Successfully authenticated - token expires in', response.data.expires_in, 'seconds');
      return response.data;
    } catch (error) {
      console.error('[Primavera] Authentication failed:', error);
      throw new Error(`Failed to authenticate with Primavera: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Initialize HTTP client with Bearer token authentication
   */
  private initializeHttpClient(): void {
    if (!this.config?.accessToken) {
      throw new Error('Primavera: No access token available');
    }

    this.httpClient = axios.create({
      baseURL: this.config.serverUrl,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });
  }

  /**
   * Ensure we have a valid access token
   * Auto-refreshes if token is expired or about to expire
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.config?.accessToken) {
      console.log('[Primavera] No access token, authenticating...');
      await this.authenticate();
      return;
    }

    // Check if token is expired or about to expire (60 second buffer)
    if (this.config.tokenExpiresAt && Date.now() >= this.config.tokenExpiresAt - 60000) {
      console.log('[Primavera] Token expired or about to expire, re-authenticating...');
      try {
        await this.authenticate();
      } catch (error) {
        // Clear token on authentication failure
        this.config.accessToken = undefined;
        this.config.tokenExpiresAt = undefined;
        this.httpClient = undefined;
        throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please re-authenticate.`);
      }
    }
  }

  /**
   * Test connection to Primavera ERP
   * Validates authentication and connectivity
   */
  async testConnection(): Promise<boolean> {
    if (!this.config) {
      throw new Error('Primavera: Connector not configured. Call configure() first.');
    }

    try {
      // Authenticate first
      await this.ensureValidToken();

      if (!this.httpClient) {
        throw new Error('HTTP client not initialized');
      }

      // Try to get company info to validate connection
      const response = await this.httpClient.get<PrimaveraCompanyInfo>('/api/plataforma/info');

      if (response.data) {
        console.log(`[Primavera] Connection test successful - Company: ${response.data.Nome || this.config.company}`);
        return true;
      }

      console.warn('[Primavera] Connection test failed: Invalid response');
      return false;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || error.message;
        
        if (status === 401 || status === 403) {
          console.error('[Primavera] Connection test failed: Invalid credentials');
        } else if (status === 404) {
          console.error('[Primavera] Connection test failed: API endpoint not found');
        } else {
          console.error(`[Primavera] Connection test failed: ${message}`);
        }
      } else {
        console.error('[Primavera] Connection test failed:', error);
      }
      return false;
    }
  }

  /**
   * Synchronize data from Primavera ERP
   * Supports syncing customers, suppliers, invoices, and products
   */
  async sync(options?: SyncOptions): Promise<SyncResult> {
    if (!this.config) {
      throw new Error('Primavera: Connector not configured. Call configure() first.');
    }

    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: Array<{ record?: any; error: string }> = [];

    try {
      // Ensure we have a valid token
      await this.ensureValidToken();

      const filters = options?.filters || {};
      const {
        syncCustomers = true,
        syncSuppliers = true,
        syncInvoices = true,
        syncProducts = true,
      } = filters;

      console.log('[Primavera] Starting sync...');

      // Sync customers
      if (syncCustomers) {
        try {
          const customers = await this.getCustomers();
          recordsProcessed += customers.length;
          console.log(`[Primavera] Synced ${customers.length} customers`);
        } catch (error) {
          recordsFailed++;
          errors.push({
            error: `Failed to sync customers: ${this.getErrorMessage(error)}`,
          });
        }
      }

      // Sync suppliers
      if (syncSuppliers) {
        try {
          const suppliers = await this.getSuppliers();
          recordsProcessed += suppliers.length;
          console.log(`[Primavera] Synced ${suppliers.length} suppliers`);
        } catch (error) {
          recordsFailed++;
          errors.push({
            error: `Failed to sync suppliers: ${this.getErrorMessage(error)}`,
          });
        }
      }

      // Sync invoices
      if (syncInvoices) {
        try {
          const invoices = await this.getInvoices();
          recordsProcessed += invoices.length;
          console.log(`[Primavera] Synced ${invoices.length} invoices`);
        } catch (error) {
          recordsFailed++;
          errors.push({
            error: `Failed to sync invoices: ${this.getErrorMessage(error)}`,
          });
        }
      }

      // Sync products
      if (syncProducts) {
        try {
          const products = await this.getProducts();
          recordsProcessed += products.length;
          console.log(`[Primavera] Synced ${products.length} products`);
        } catch (error) {
          recordsFailed++;
          errors.push({
            error: `Failed to sync products: ${this.getErrorMessage(error)}`,
          });
        }
      }

      const duration = Date.now() - startTime;
      const success = recordsFailed === 0;

      this.lastSyncAt = new Date();
      this.lastSyncStatus = success ? 'completed' : 'completed_with_errors';
      if (!success && errors.length > 0) {
        this.lastSyncError = errors[0].error;
      }

      console.log(`[Primavera] Sync ${success ? 'completed' : 'completed with errors'}: ${recordsProcessed} processed, ${recordsFailed} failed in ${duration}ms`);

      return {
        success,
        recordsProcessed,
        recordsFailed,
        duration,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = this.getErrorMessage(error);
      
      this.lastSyncAt = new Date();
      this.lastSyncStatus = 'failed';
      this.lastSyncError = errorMessage;

      console.error('[Primavera] Sync failed:', errorMessage);

      return {
        success: false,
        recordsProcessed,
        recordsFailed: recordsFailed + 1,
        duration,
        errors: [{ error: errorMessage }],
      };
    }
  }

  /**
   * Disconnect from Primavera ERP
   * Clears configuration, token, and HTTP client
   */
  async disconnect(): Promise<void> {
    if (this.config) {
      this.config.accessToken = undefined;
      this.config.tokenExpiresAt = undefined;
    }
    
    this.context = undefined;
    this.config = undefined;
    this.httpClient = undefined;
    this.lastSyncAt = undefined;
    this.lastSyncStatus = undefined;
    this.lastSyncError = undefined;
    
    console.log('[Primavera] Disconnected');
  }

  /**
   * Get current connector status
   */
  async getStatus(): Promise<ConnectorStatusResponse> {
    if (!this.context) {
      throw new Error('Primavera: Connector not configured');
    }

    const hasAuth = !!this.config?.accessToken;
    const isTokenValid = this.config?.tokenExpiresAt ? Date.now() < this.config.tokenExpiresAt : false;

    let status: 'active' | 'paused' | 'error' | 'disabled' = 'disabled';
    if (hasAuth) {
      if (isTokenValid) {
        status = this.lastSyncError ? 'error' : 'active';
      } else {
        status = 'error';
      }
    }

    return {
      connectorId: this.context.connectorId,
      status,
      lastSyncAt: this.lastSyncAt,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError,
      config: this.config ? {
        serverUrl: this.config.serverUrl,
        company: this.config.company,
        instance: this.config.instance,
        line: this.config.line,
        username: this.config.username,
        hasAccessToken: !!this.config.accessToken,
      } : undefined,
      metadata: this.config ? {
        tokenExpiresAt: this.config.tokenExpiresAt,
        isTokenValid,
      } : undefined,
    };
  }

  // ============================================================================
  // Helper Methods for Data Synchronization
  // ============================================================================

  /**
   * Get all customers from Primavera ERP
   */
  async getCustomers(): Promise<PrimaveraCustomer[]> {
    await this.ensureValidToken();

    if (!this.httpClient) {
      throw new Error('Primavera: HTTP client not initialized');
    }

    try {
      const response = await this.httpClient.get<PrimaveraCustomer[]>('/api/base/clientes');
      return response.data || [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Token might be invalid, try to re-authenticate once
        await this.authenticate();
        const response = await this.httpClient.get<PrimaveraCustomer[]>('/api/base/clientes');
        return response.data || [];
      }
      throw new Error(`Failed to get customers from Primavera: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Get all suppliers from Primavera ERP
   */
  async getSuppliers(): Promise<PrimaveraSupplier[]> {
    await this.ensureValidToken();

    if (!this.httpClient) {
      throw new Error('Primavera: HTTP client not initialized');
    }

    try {
      const response = await this.httpClient.get<PrimaveraSupplier[]>('/api/base/fornecedores');
      return response.data || [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Token might be invalid, try to re-authenticate once
        await this.authenticate();
        const response = await this.httpClient.get<PrimaveraSupplier[]>('/api/base/fornecedores');
        return response.data || [];
      }
      throw new Error(`Failed to get suppliers from Primavera: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Get all sales invoices from Primavera ERP
   */
  async getInvoices(): Promise<PrimaveraInvoice[]> {
    await this.ensureValidToken();

    if (!this.httpClient) {
      throw new Error('Primavera: HTTP client not initialized');
    }

    try {
      const response = await this.httpClient.get<PrimaveraInvoice[]>('/api/vendas/faturas');
      return response.data || [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Token might be invalid, try to re-authenticate once
        await this.authenticate();
        const response = await this.httpClient.get<PrimaveraInvoice[]>('/api/vendas/faturas');
        return response.data || [];
      }
      throw new Error(`Failed to get invoices from Primavera: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Get all products/items from Primavera ERP
   */
  async getProducts(): Promise<PrimaveraProduct[]> {
    await this.ensureValidToken();

    if (!this.httpClient) {
      throw new Error('Primavera: HTTP client not initialized');
    }

    try {
      const response = await this.httpClient.get<PrimaveraProduct[]>('/api/inventario/artigos');
      return response.data || [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Token might be invalid, try to re-authenticate once
        await this.authenticate();
        const response = await this.httpClient.get<PrimaveraProduct[]>('/api/inventario/artigos');
        return response.data || [];
      }
      throw new Error(`Failed to get products from Primavera: ${this.getErrorMessage(error)}`);
    }
  }

  // ============================================================================
  // Bonus Methods: Create Documents
  // ============================================================================

  /**
   * Create a new sales invoice in Primavera ERP
   */
  async createInvoice(invoiceData: CreateInvoiceData): Promise<PrimaveraInvoice> {
    await this.ensureValidToken();

    if (!this.httpClient) {
      throw new Error('Primavera: HTTP client not initialized');
    }

    // Validate required fields
    if (!invoiceData.TipoDoc) {
      throw new Error('Primavera: TipoDoc (document type) is required to create invoice');
    }
    if (!invoiceData.Entidade) {
      throw new Error('Primavera: Entidade (customer code) is required to create invoice');
    }
    if (!invoiceData.Linhas || invoiceData.Linhas.length === 0) {
      throw new Error('Primavera: At least one line item is required to create invoice');
    }

    try {
      const response = await this.httpClient.post<PrimaveraInvoice>(
        '/api/vendas/faturas',
        invoiceData
      );

      console.log(`[Primavera] Invoice created successfully: ${response.data.TipoDoc}/${response.data.Serie}/${response.data.NumDoc}`);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        const message = error.response?.data?.message || this.getErrorMessage(error);
        
        if (status === 401) {
          // Try to re-authenticate once and retry
          await this.authenticate();
          const response = await this.httpClient.post<PrimaveraInvoice>(
            '/api/vendas/faturas',
            invoiceData
          );
          console.log(`[Primavera] Invoice created successfully after re-auth: ${response.data.TipoDoc}/${response.data.NumDoc}`);
          return response.data;
        } else if (status === 400) {
          throw new Error(`Invalid invoice data: ${message}`);
        } else if (status === 404) {
          throw new Error(`Customer not found: ${invoiceData.Entidade}`);
        }
      }
      throw new Error(`Failed to create invoice in Primavera: ${this.getErrorMessage(error)}`);
    }
  }

  /**
   * Get purchase invoices from Primavera ERP
   */
  async getPurchaseInvoices(): Promise<PrimaveraInvoice[]> {
    await this.ensureValidToken();

    if (!this.httpClient) {
      throw new Error('Primavera: HTTP client not initialized');
    }

    try {
      const response = await this.httpClient.get<PrimaveraInvoice[]>('/api/compras/faturas');
      return response.data || [];
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        // Token might be invalid, try to re-authenticate once
        await this.authenticate();
        const response = await this.httpClient.get<PrimaveraInvoice[]>('/api/compras/faturas');
        return response.data || [];
      }
      throw new Error(`Failed to get purchase invoices from Primavera: ${this.getErrorMessage(error)}`);
    }
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Extract error message from various error types
   */
  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (axios.isAxiosError(error)) {
      return error.response?.data?.message || error.message;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return 'Unknown error';
  }
}
