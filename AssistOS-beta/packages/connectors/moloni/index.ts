import type { IConnector } from '../base/connector-interface';
import type {
  ConnectorContext,
  ConnectorConfig,
  SyncOptions,
  SyncResult,
  ConnectorStatusResponse,
  ConnectorCapability,
} from '../base/types';
import axios, { AxiosError } from 'axios';

const MOLONI_BASE_URL = 'https://api.moloni.pt/v1';

export interface MoloniConfig extends ConnectorConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  companyId?: number;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}

export interface TokenResponse {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  token_type: string;
}

export interface MoloniCustomer {
  customer_id: number;
  vat: string;
  number: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  zip_code?: string;
  city?: string;
  country_id?: number;
}

export interface MoloniInvoice {
  document_id: number;
  document_set_id: number;
  number: string;
  date: string;
  customer_id: number;
  customer_name: string;
  net_value: number;
  gross_value: number;
  status: number;
  products?: MoloniInvoiceProduct[];
}

export interface MoloniInvoiceProduct {
  product_id?: number;
  name: string;
  qty: number;
  price: number;
  discount?: number;
  taxes?: Array<{
    tax_id: number;
    value: number;
    cumulative?: number;
  }>;
}

export interface MoloniProduct {
  product_id: number;
  category_id?: number;
  name: string;
  reference?: string;
  price: number;
  unit_id?: number;
  has_stock?: number;
  stock?: number;
}

export interface MoloniCompany {
  company_id: number;
  name: string;
  vat: string;
  email: string;
}

export interface CreateInvoiceData {
  customer_id: number;
  date: string;
  document_set_id: number;
  products: MoloniInvoiceProduct[];
  notes?: string;
  status?: number;
}

export interface CreateCustomerData {
  vat: string;
  number: string;
  name: string;
  email?: string;
  phone?: string;
  address?: string;
  zip_code?: string;
  city?: string;
  country_id?: number;
}

export class MoloniConnector implements IConnector {
  type = 'moloni' as const;
  name = 'Moloni';
  description = 'Integration with Moloni invoicing and accounting system';
  capabilities: ConnectorCapability[] = ['accounting', 'invoicing'];
  authType = 'oauth2' as const;

  private context?: ConnectorContext;
  private config?: MoloniConfig;

  async configure(config: ConnectorConfig, context: ConnectorContext): Promise<void> {
    const moloniConfig = config as MoloniConfig;

    if (!moloniConfig.clientId) {
      throw new Error('Moloni clientId is required');
    }
    if (!moloniConfig.clientSecret) {
      throw new Error('Moloni clientSecret is required');
    }
    if (!moloniConfig.redirectUri) {
      throw new Error('Moloni redirectUri is required');
    }

    this.context = context;
    this.config = moloniConfig;
    console.log(`[Moloni] Configured for tenant ${context.tenantId}`);
  }

  getAuthorizationUrl(): string {
    if (!this.config) {
      throw new Error('Connector not configured');
    }

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.config.clientId,
      redirect_uri: this.config.redirectUri,
    });

    return `${MOLONI_BASE_URL}/authorize/?${params.toString()}`;
  }

  async exchangeAuthCode(code: string): Promise<TokenResponse> {
    if (!this.config) {
      throw new Error('Connector not configured');
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: code,
        redirect_uri: this.config.redirectUri,
      });

      const response = await axios.post<TokenResponse>(
        `${MOLONI_BASE_URL}/grant`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.config.accessToken = response.data.access_token;
      this.config.refreshToken = response.data.refresh_token;
      this.config.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

      console.log('[Moloni] Successfully exchanged auth code for tokens');
      return response.data;
    } catch (error) {
      console.error('[Moloni] Error exchanging auth code:', error);
      throw new Error(`Failed to exchange auth code: ${this.getErrorMessage(error)}`);
    }
  }

  async refreshAccessToken(): Promise<void> {
    if (!this.config?.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'refresh_token',
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: this.config.refreshToken,
      });

      const response = await axios.post<TokenResponse>(
        `${MOLONI_BASE_URL}/grant`,
        params.toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      this.config.accessToken = response.data.access_token;
      if (response.data.refresh_token) {
        this.config.refreshToken = response.data.refresh_token;
      }
      this.config.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

      console.log('[Moloni] Successfully refreshed access token');
    } catch (error) {
      console.error('[Moloni] Error refreshing token:', error);
      throw new Error(`Failed to refresh access token: ${this.getErrorMessage(error)}`);
    }
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.config?.accessToken) {
      throw new Error('Not authenticated. Please call exchangeAuthCode first.');
    }

    if (this.config.tokenExpiresAt && Date.now() >= this.config.tokenExpiresAt - 60000) {
      console.log('[Moloni] Token expired or about to expire, refreshing...');
      try {
        await this.refreshAccessToken();
      } catch (error) {
        this.config.accessToken = undefined;
        this.config.refreshToken = undefined;
        this.config.tokenExpiresAt = undefined;
        
        throw new Error(`Token refresh failed: ${error instanceof Error ? error.message : 'Unknown error'}. Please re-authenticate.`);
      }
    }
  }

  private async makeApiRequest<T>(endpoint: string, data?: any): Promise<T> {
    await this.ensureValidToken();

    if (!this.config?.accessToken) {
      throw new Error('No access token available');
    }

    const requestData = {
      access_token: this.config.accessToken,
      ...(this.config.companyId && { company_id: this.config.companyId }),
      ...data,
    };

    const response = await axios.post<T>(
      `${MOLONI_BASE_URL}${endpoint}`,
      requestData,
      {
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );

    return response.data;
  }

  async testConnection(): Promise<boolean> {
    try {
      const companies = await this.getCompanies();
      
      if (!this.config?.companyId && companies.length > 0) {
        this.config!.companyId = companies[0].company_id;
        console.log(`[Moloni] Auto-selected company: ${companies[0].name} (ID: ${companies[0].company_id})`);
      }
      
      console.log(`[Moloni] Connection test successful - ${companies.length} companies found`);
      return true;
    } catch (error) {
      console.error('[Moloni] Connection test failed:', error);
      return false;
    }
  }

  async getCompanies(): Promise<MoloniCompany[]> {
    try {
      const response = await this.makeApiRequest<MoloniCompany[]>('/companies/getAll');
      return response;
    } catch (error) {
      console.error('[Moloni] Error fetching companies:', error);
      throw new Error(`Failed to fetch companies: ${this.getErrorMessage(error)}`);
    }
  }

  async getCustomers(): Promise<MoloniCustomer[]> {
    if (!this.config?.companyId) {
      throw new Error('Company ID not set. Please run testConnection first.');
    }

    try {
      const response = await this.makeApiRequest<MoloniCustomer[]>('/customers/getAll');
      return response;
    } catch (error) {
      console.error('[Moloni] Error fetching customers:', error);
      throw new Error(`Failed to fetch customers: ${this.getErrorMessage(error)}`);
    }
  }

  async getInvoices(): Promise<MoloniInvoice[]> {
    if (!this.config?.companyId) {
      throw new Error('Company ID not set. Please run testConnection first.');
    }

    try {
      const response = await this.makeApiRequest<MoloniInvoice[]>('/invoices/getAll');
      return response;
    } catch (error) {
      console.error('[Moloni] Error fetching invoices:', error);
      throw new Error(`Failed to fetch invoices: ${this.getErrorMessage(error)}`);
    }
  }

  async getProducts(): Promise<MoloniProduct[]> {
    if (!this.config?.companyId) {
      throw new Error('Company ID not set. Please run testConnection first.');
    }

    try {
      const response = await this.makeApiRequest<MoloniProduct[]>('/products/getAll');
      return response;
    } catch (error) {
      console.error('[Moloni] Error fetching products:', error);
      throw new Error(`Failed to fetch products: ${this.getErrorMessage(error)}`);
    }
  }

  async createCustomer(data: CreateCustomerData): Promise<MoloniCustomer> {
    if (!this.config?.companyId) {
      throw new Error('Company ID not set. Please run testConnection first.');
    }

    try {
      const response = await this.makeApiRequest<MoloniCustomer>('/customers/insert', data);
      console.log(`[Moloni] Customer created: ${data.name}`);
      return response;
    } catch (error) {
      console.error('[Moloni] Error creating customer:', error);
      throw new Error(`Failed to create customer: ${this.getErrorMessage(error)}`);
    }
  }

  async createInvoice(data: CreateInvoiceData): Promise<MoloniInvoice> {
    if (!this.config?.companyId) {
      throw new Error('Company ID not set. Please run testConnection first.');
    }

    try {
      const response = await this.makeApiRequest<MoloniInvoice>('/invoices/insert', data);
      console.log(`[Moloni] Invoice created: ${response.number}`);
      return response;
    } catch (error) {
      console.error('[Moloni] Error creating invoice:', error);
      throw new Error(`Failed to create invoice: ${this.getErrorMessage(error)}`);
    }
  }

  async sync(options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: Array<{ record?: any; error: string }> = [];

    try {
      console.log('[Moloni] Starting sync...');

      const syncCustomers = options?.filters?.syncCustomers !== false;
      const syncInvoices = options?.filters?.syncInvoices !== false;
      const syncProducts = options?.filters?.syncProducts !== false;

      if (syncCustomers) {
        try {
          const customers = await this.getCustomers();
          recordsProcessed += customers.length;
          console.log(`[Moloni] Synced ${customers.length} customers`);
        } catch (error) {
          recordsFailed++;
          errors.push({ error: `Failed to sync customers: ${this.getErrorMessage(error)}` });
        }
      }

      if (syncInvoices) {
        try {
          const invoices = await this.getInvoices();
          recordsProcessed += invoices.length;
          console.log(`[Moloni] Synced ${invoices.length} invoices`);
        } catch (error) {
          recordsFailed++;
          errors.push({ error: `Failed to sync invoices: ${this.getErrorMessage(error)}` });
        }
      }

      if (syncProducts) {
        try {
          const products = await this.getProducts();
          recordsProcessed += products.length;
          console.log(`[Moloni] Synced ${products.length} products`);
        } catch (error) {
          recordsFailed++;
          errors.push({ error: `Failed to sync products: ${this.getErrorMessage(error)}` });
        }
      }

      const duration = Date.now() - startTime;
      const success = recordsFailed === 0;

      console.log(`[Moloni] Sync completed in ${duration}ms - ${recordsProcessed} records processed, ${recordsFailed} failed`);

      return {
        success,
        recordsProcessed,
        recordsFailed,
        duration,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[Moloni] Sync failed:', error);
      
      return {
        success: false,
        recordsProcessed,
        recordsFailed: recordsFailed + 1,
        duration,
        errors: [{ error: `Sync failed: ${this.getErrorMessage(error)}` }],
      };
    }
  }

  async disconnect(): Promise<void> {
    if (this.config) {
      this.config.accessToken = undefined;
      this.config.refreshToken = undefined;
      this.config.tokenExpiresAt = undefined;
    }
    
    this.context = undefined;
    this.config = undefined;
    console.log('[Moloni] Disconnected');
  }

  async getStatus(): Promise<ConnectorStatusResponse> {
    if (!this.context) {
      throw new Error('Connector not configured');
    }

    const hasAuth = !!(this.config?.accessToken && this.config?.refreshToken);
    const isTokenValid = this.config?.tokenExpiresAt ? Date.now() < this.config.tokenExpiresAt : false;

    return {
      connectorId: this.context.connectorId,
      status: hasAuth ? (isTokenValid ? 'active' : 'error') : 'disabled',
      config: {
        clientId: this.config?.clientId,
        redirectUri: this.config?.redirectUri,
        companyId: this.config?.companyId,
        hasAccessToken: !!this.config?.accessToken,
        hasRefreshToken: !!this.config?.refreshToken,
      },
      metadata: {
        tokenExpiresAt: this.config?.tokenExpiresAt,
        isTokenValid,
      },
    };
  }

  private getErrorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    if (error && typeof error === 'object' && 'message' in error) {
      return String(error.message);
    }
    return 'Unknown error';
  }
}
