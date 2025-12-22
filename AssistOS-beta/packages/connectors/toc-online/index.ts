import axios, { AxiosInstance, CreateAxiosDefaults } from 'axios';
import type { IConnector } from '../base/connector-interface';
import type {
  ConnectorContext,
  ConnectorConfig,
  SyncOptions,
  SyncResult,
  ConnectorStatusResponse,
  ConnectorCapability,
} from '../base/types';

export interface TOCOnlineConfig extends ConnectorConfig {
  clientId: string;
  clientSecret: string;
  oauthUrl?: string;
  apiUrl?: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
  scope?: string;
}

export interface TOCOnlineTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token: string;
  token_type: string;
}

export interface TOCOnlineProduct {
  type: 'products';
  id: string;
  attributes: {
    code?: string;
    name?: string;
    description?: string;
    unit_price?: number;
    tax_rate?: number;
    item_family_id?: number;
    is_active?: boolean;
  };
}

export interface TOCOnlineService {
  type: 'services';
  id: string;
  attributes: {
    code?: string;
    name?: string;
    description?: string;
    unit_price?: number;
    tax_rate?: number;
    is_active?: boolean;
  };
}

export interface TOCOnlineCountry {
  type: 'countries';
  id: string;
  attributes: {
    default_name: string;
    iso_alpha_2: string;
    iso_alpha_3: string;
    tax_country_region: string;
  };
}

export interface TOCOnlineClient {
  type: 'customers';
  id: string;
  attributes: {
    code?: string;
    name?: string;
    tax_number?: string;
    email?: string;
    phone?: string;
    address?: string;
    city?: string;
    postal_code?: string;
    country_id?: string;
    is_active?: boolean;
  };
}

export interface TOCOnlineInvoice {
  type: 'invoices';
  id: string;
  attributes: {
    number?: string;
    date?: string;
    due_date?: string;
    customer_id?: string;
    status?: string;
    total_net?: number;
    total_tax?: number;
    total_gross?: number;
    currency?: string;
    notes?: string;
  };
  relationships?: {
    lines?: {
      data: Array<{
        type: 'invoice_lines';
        id: string;
      }>;
    };
  };
}

export class TOCOnlineConnector implements IConnector {
  type = 'toc_online' as const;
  name = 'TOC Online';
  description = 'Plataforma de contabilidade certificada portuguesa (OAuth 2.0)';
  capabilities: ConnectorCapability[] = ['accounting', 'invoicing'];
  authType = 'oauth2' as const;

  private context?: ConnectorContext;
  private config?: TOCOnlineConfig;
  private httpClient?: AxiosInstance;
  private lastSyncAt?: Date;
  private lastSyncStatus?: string;
  private lastSyncError?: string;

  static readonly DEFAULT_OAUTH_URL = 'https://app3.toconline.pt/oauth';
  static readonly DEFAULT_API_URL = 'https://api3.toconline.pt';
  static readonly DEFAULT_SCOPE = 'commercial';

  async configure(config: ConnectorConfig, context: ConnectorContext): Promise<void> {
    const tocConfig = config as TOCOnlineConfig;

    if (!tocConfig.clientId || typeof tocConfig.clientId !== 'string') {
      throw new Error('TOC Online: clientId é obrigatório');
    }

    if (!tocConfig.clientSecret || typeof tocConfig.clientSecret !== 'string') {
      throw new Error('TOC Online: clientSecret é obrigatório');
    }

    this.context = context;
    this.config = {
      clientId: tocConfig.clientId,
      clientSecret: tocConfig.clientSecret,
      oauthUrl: tocConfig.oauthUrl || TOCOnlineConnector.DEFAULT_OAUTH_URL,
      apiUrl: tocConfig.apiUrl || TOCOnlineConnector.DEFAULT_API_URL,
      accessToken: tocConfig.accessToken,
      refreshToken: tocConfig.refreshToken,
      tokenExpiresAt: tocConfig.tokenExpiresAt,
      scope: tocConfig.scope || TOCOnlineConnector.DEFAULT_SCOPE,
    };

    if (this.config.accessToken) {
      this.createHttpClient();
    }

    console.log(`[TOCOnline] Configured for tenant ${context.tenantId}`);
  }

  private createHttpClient(): void {
    if (!this.config?.accessToken) {
      throw new Error('TOC Online: Access token not available');
    }

    const axiosConfig = {
      baseURL: this.config.apiUrl,
      headers: {
        'Authorization': `Bearer ${this.config.accessToken}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    };

    this.httpClient = axios.create(axiosConfig as any);
  }

  getAuthorizationUrl(redirectUri: string, state: string): string {
    if (!this.config) {
      throw new Error('TOC Online: Connector not configured');
    }

    const params = new URLSearchParams({
      client_id: this.config.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: this.config.scope || TOCOnlineConnector.DEFAULT_SCOPE,
      state: state,
    });

    return `${this.config.oauthUrl}/authorize?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, redirectUri: string): Promise<TOCOnlineTokenResponse> {
    if (!this.config) {
      throw new Error('TOC Online: Connector not configured');
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    try {
      const response = await axios.post<TOCOnlineTokenResponse>(
        `${this.config.oauthUrl}/token`,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: code,
          redirect_uri: redirectUri,
          scope: this.config.scope || TOCOnlineConnector.DEFAULT_SCOPE,
        }).toString(),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
        }
      );

      this.config.accessToken = response.data.access_token;
      this.config.refreshToken = response.data.refresh_token;
      this.config.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

      this.createHttpClient();

      console.log('[TOCOnline] Token exchange successful');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error_description || error.response?.data?.error || error.message;
        throw new Error(`TOC Online token exchange failed: ${message}`);
      }
      throw error;
    }
  }

  async refreshAccessToken(): Promise<TOCOnlineTokenResponse> {
    if (!this.config || !this.config.refreshToken) {
      throw new Error('TOC Online: No refresh token available');
    }

    const credentials = Buffer.from(
      `${this.config.clientId}:${this.config.clientSecret}`
    ).toString('base64');

    try {
      const response = await axios.post<TOCOnlineTokenResponse>(
        `${this.config.oauthUrl}/token`,
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.config.refreshToken,
          scope: this.config.scope || TOCOnlineConnector.DEFAULT_SCOPE,
        }).toString(),
        {
          headers: {
            'Authorization': `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
            'Accept': 'application/json',
          },
        }
      );

      this.config.accessToken = response.data.access_token;
      this.config.refreshToken = response.data.refresh_token;
      this.config.tokenExpiresAt = Date.now() + (response.data.expires_in * 1000);

      this.createHttpClient();

      console.log('[TOCOnline] Token refresh successful');
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const message = error.response?.data?.error_description || error.response?.data?.error || error.message;
        throw new Error(`TOC Online token refresh failed: ${message}`);
      }
      throw error;
    }
  }

  private async ensureValidToken(): Promise<void> {
    if (!this.config) {
      throw new Error('TOC Online: Connector not configured');
    }

    if (!this.config.accessToken) {
      throw new Error('TOC Online: Not authenticated. Complete OAuth flow first.');
    }

    if (this.config.tokenExpiresAt && Date.now() >= this.config.tokenExpiresAt - 60000) {
      console.log('[TOCOnline] Token expired or expiring soon, refreshing...');
      await this.refreshAccessToken();
    }
  }

  async testConnection(): Promise<boolean> {
    if (!this.config) {
      throw new Error('TOC Online: Connector not configured');
    }

    if (!this.config.accessToken) {
      console.log('[TOCOnline] No access token - OAuth flow not completed');
      return false;
    }

    try {
      await this.ensureValidToken();

      const response = await this.httpClient!.get('/api/countries', {
        params: { 'filter[iso_alpha_2]': 'PT' }
      });

      if (response.data && response.data.data) {
        console.log('[TOCOnline] Connection test successful');
        return true;
      }

      console.warn('[TOCOnline] Connection test: unexpected response format');
      return false;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const status = error.response?.status;
        if (status === 401) {
          console.error('[TOCOnline] Connection test failed: Token invalid or expired');
        } else {
          console.error(`[TOCOnline] Connection test failed: ${error.message}`);
        }
      } else {
        console.error('[TOCOnline] Connection test failed:', error);
      }
      return false;
    }
  }

  async sync(options?: SyncOptions): Promise<SyncResult> {
    if (!this.httpClient || !this.config) {
      throw new Error('TOC Online: Connector not configured');
    }

    await this.ensureValidToken();

    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: Array<{ record?: any; error: string }> = [];

    try {
      const filters = options?.filters || {};
      const {
        syncProducts = true,
        syncServices = true,
        syncCustomers = true,
      } = filters;

      if (syncProducts) {
        try {
          const products = await this.getProducts();
          recordsProcessed += products.length;
          console.log(`[TOCOnline] Synced ${products.length} products`);
        } catch (error) {
          recordsFailed++;
          errors.push({
            error: `Failed to sync products: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      if (syncServices) {
        try {
          const services = await this.getServices();
          recordsProcessed += services.length;
          console.log(`[TOCOnline] Synced ${services.length} services`);
        } catch (error) {
          recordsFailed++;
          errors.push({
            error: `Failed to sync services: ${error instanceof Error ? error.message : 'Unknown error'}`,
          });
        }
      }

      if (syncCustomers) {
        try {
          const customers = await this.getCustomers();
          recordsProcessed += customers.length;
          console.log(`[TOCOnline] Synced ${customers.length} customers`);
        } catch (error) {
          recordsFailed++;
          errors.push({
            error: `Failed to sync customers: ${error instanceof Error ? error.message : 'Unknown error'}`,
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

      return {
        success,
        recordsProcessed,
        recordsFailed,
        duration,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown sync error';

      this.lastSyncAt = new Date();
      this.lastSyncStatus = 'failed';
      this.lastSyncError = errorMessage;

      return {
        success: false,
        recordsProcessed,
        recordsFailed: recordsFailed + 1,
        duration,
        errors: [{ error: errorMessage }],
      };
    }
  }

  async disconnect(): Promise<void> {
    this.context = undefined;
    this.config = undefined;
    this.httpClient = undefined;
    this.lastSyncAt = undefined;
    this.lastSyncStatus = undefined;
    this.lastSyncError = undefined;
    console.log('[TOCOnline] Disconnected');
  }

  async getStatus(): Promise<ConnectorStatusResponse> {
    if (!this.context) {
      throw new Error('TOC Online: Connector not configured');
    }

    let status: 'active' | 'paused' | 'error' | 'disabled' = 'disabled';
    if (this.config?.accessToken) {
      if (this.lastSyncError) {
        status = 'error';
      } else {
        status = 'active';
      }
    }

    return {
      connectorId: this.context.connectorId,
      status,
      lastSyncAt: this.lastSyncAt,
      lastSyncStatus: this.lastSyncStatus,
      lastSyncError: this.lastSyncError,
      config: this.config ? {
        apiUrl: this.config.apiUrl,
        hasAccessToken: !!this.config.accessToken,
        tokenExpiresAt: this.config.tokenExpiresAt,
      } : undefined,
      metadata: {
        oauthConfigured: !!(this.config?.clientId && this.config?.clientSecret),
        isAuthenticated: !!this.config?.accessToken,
      },
    };
  }

  async getProducts(): Promise<TOCOnlineProduct[]> {
    if (!this.httpClient) {
      throw new Error('TOC Online: Not authenticated');
    }

    await this.ensureValidToken();

    try {
      const response = await this.httpClient.get<{ data: TOCOnlineProduct[] }>('/api/products');
      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get products: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async getServices(): Promise<TOCOnlineService[]> {
    if (!this.httpClient) {
      throw new Error('TOC Online: Not authenticated');
    }

    await this.ensureValidToken();

    try {
      const response = await this.httpClient.get<{ data: TOCOnlineService[] }>('/api/services');
      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get services: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async getCustomers(): Promise<TOCOnlineClient[]> {
    if (!this.httpClient) {
      throw new Error('TOC Online: Not authenticated');
    }

    await this.ensureValidToken();

    try {
      const response = await this.httpClient.get<{ data: TOCOnlineClient[] }>('/api/customers');
      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get customers: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async getCountries(filter?: { iso_alpha_2?: string }): Promise<TOCOnlineCountry[]> {
    if (!this.httpClient) {
      throw new Error('TOC Online: Not authenticated');
    }

    await this.ensureValidToken();

    try {
      const params: Record<string, string> = {};
      if (filter?.iso_alpha_2) {
        params['filter[iso_alpha_2]'] = filter.iso_alpha_2;
      }

      const response = await this.httpClient.get<{ data: TOCOnlineCountry[] }>('/api/countries', { params });
      return response.data.data || [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to get countries: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async updateProduct(productId: string, updates: Partial<TOCOnlineProduct['attributes']>): Promise<TOCOnlineProduct> {
    if (!this.httpClient) {
      throw new Error('TOC Online: Not authenticated');
    }

    await this.ensureValidToken();

    try {
      const response = await this.httpClient.patch<{ data: TOCOnlineProduct }>('/api/products', {
        data: {
          type: 'products',
          id: productId,
          attributes: updates,
        },
      });
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to update product: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  async updateService(serviceId: string, updates: Partial<TOCOnlineService['attributes']>): Promise<TOCOnlineService> {
    if (!this.httpClient) {
      throw new Error('TOC Online: Not authenticated');
    }

    await this.ensureValidToken();

    try {
      const response = await this.httpClient.patch<{ data: TOCOnlineService }>('/api/services', {
        data: {
          type: 'services',
          id: serviceId,
          attributes: updates,
        },
      });
      return response.data.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(`Failed to update service: ${error.response?.data?.error || error.message}`);
      }
      throw error;
    }
  }

  getTokens(): { accessToken?: string; refreshToken?: string; expiresAt?: number } {
    return {
      accessToken: this.config?.accessToken,
      refreshToken: this.config?.refreshToken,
      expiresAt: this.config?.tokenExpiresAt,
    };
  }

  setTokens(accessToken: string, refreshToken: string, expiresAt: number): void {
    if (!this.config) {
      throw new Error('TOC Online: Connector not configured');
    }

    this.config.accessToken = accessToken;
    this.config.refreshToken = refreshToken;
    this.config.tokenExpiresAt = expiresAt;

    this.createHttpClient();
  }
}
