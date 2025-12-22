import type { IConnector } from '../base/connector-interface';
import type {
  ConnectorContext,
  ConnectorConfig,
  SyncOptions,
  SyncResult,
  ConnectorStatusResponse,
  ConnectorCapability,
} from '../base/types';
import axios, { AxiosError, AxiosInstance } from 'axios';

export interface SAPConfig extends ConnectorConfig {
  serverUrl: string;
  companyDB: string;
  username: string;
  password: string;
  accessToken?: string;
}

export interface SessionInfo {
  sessionId: string;
  routeId: string;
  sessionTimeout?: number;
  version?: string;
}

export interface SAPBusinessPartner {
  CardCode: string;
  CardName: string;
  CardType: 'cCustomer' | 'cSupplier' | 'cLid';
  Phone1?: string;
  EmailAddress?: string;
  Address?: string;
  City?: string;
  Country?: string;
  Currency?: string;
  FederalTaxID?: string;
  GroupCode?: number;
  Valid?: string;
}

export interface SAPInvoice {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName?: string;
  DocDate: string;
  DocDueDate?: string;
  DocTotal: number;
  DocCurrency?: string;
  Comments?: string;
  DocumentLines?: SAPDocumentLine[];
}

export interface SAPDocumentLine {
  ItemCode?: string;
  ItemDescription?: string;
  Quantity: number;
  Price: number;
  Currency?: string;
  WarehouseCode?: string;
  TaxCode?: string;
}

export interface SAPItem {
  ItemCode: string;
  ItemName: string;
  ItemType?: string;
  ItemPrices?: SAPItemPrice[];
  QuantityOnStock?: number;
  BarCode?: string;
  PurchaseItem?: string;
  SalesItem?: string;
}

export interface SAPItemPrice {
  PriceList: number;
  Price: number;
  Currency?: string;
}

export interface CreateInvoiceData {
  CardCode: string;
  DocDate: string;
  DocDueDate?: string;
  Comments?: string;
  DocumentLines: Array<{
    ItemCode?: string;
    ItemDescription?: string;
    Quantity: number;
    Price: number;
    WarehouseCode?: string;
    TaxCode?: string;
  }>;
}

export interface ODataResponse<T> {
  value: T[];
  'odata.metadata'?: string;
  'odata.count'?: number;
  'odata.nextLink'?: string;
}

export class SAPBusinessOneConnector implements IConnector {
  type = 'sap_b1' as const;
  name = 'SAP Business One';
  description = 'Integration with SAP Business One ERP using Service Layer REST API (OData v4)';
  capabilities: ConnectorCapability[] = ['accounting', 'invoicing', 'erp_sync'];
  authType = 'basic_auth' as const;

  private context?: ConnectorContext;
  private config?: SAPConfig;
  private session?: SessionInfo;
  private axiosInstance?: AxiosInstance;

  async configure(config: ConnectorConfig, context: ConnectorContext): Promise<void> {
    const sapConfig = config as SAPConfig;

    if (!sapConfig.serverUrl) {
      throw new Error('SAP serverUrl is required');
    }
    if (!sapConfig.companyDB) {
      throw new Error('SAP companyDB is required');
    }
    if (!sapConfig.username && !sapConfig.accessToken) {
      throw new Error('SAP username or accessToken is required');
    }
    if (!sapConfig.accessToken && !sapConfig.password) {
      throw new Error('SAP password is required when not using OAuth');
    }

    this.context = context;
    this.config = sapConfig;

    this.axiosInstance = axios.create({
      baseURL: this.getBaseUrl(),
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
      validateStatus: (status) => status < 500,
    });

    console.log(`[SAP B1] Configured for tenant ${context.tenantId} - Company: ${sapConfig.companyDB}`);
  }

  private getBaseUrl(): string {
    if (!this.config?.serverUrl) {
      throw new Error('Server URL not configured');
    }
    const baseUrl = this.config.serverUrl.replace(/\/$/, '');
    return `${baseUrl}/b1s/v1`;
  }

  private getSessionCookies(): string {
    if (!this.session) {
      throw new Error('Not authenticated. Please login first.');
    }
    return `B1SESSION=${this.session.sessionId}; ROUTEID=${this.session.routeId}`;
  }

  async login(): Promise<boolean> {
    if (!this.config) {
      throw new Error('Connector not configured');
    }

    if (!this.axiosInstance) {
      throw new Error('Axios instance not initialized');
    }

    try {
      const loginData = this.config.accessToken
        ? {
            CompanyDB: this.config.companyDB,
            access_token: this.config.accessToken,
          }
        : {
            CompanyDB: this.config.companyDB,
            UserName: this.config.username,
            Password: this.config.password,
          };

      console.log(`[SAP B1] Attempting login to ${this.config.companyDB}...`);

      const response = await this.axiosInstance.post('/Login', loginData);

      if (response.status !== 200) {
        console.error(`[SAP B1] Login failed with status ${response.status}:`, response.data);
        return false;
      }

      const setCookieHeader = response.headers['set-cookie'];
      if (!setCookieHeader) {
        console.error('[SAP B1] Login response missing set-cookie header');
        return false;
      }

      let sessionId = '';
      let routeId = '';

      setCookieHeader.forEach((cookie: string) => {
        if (cookie.startsWith('B1SESSION=')) {
          sessionId = cookie.split(';')[0].replace('B1SESSION=', '');
        } else if (cookie.startsWith('ROUTEID=')) {
          routeId = cookie.split(';')[0].replace('ROUTEID=', '');
        }
      });

      if (!sessionId || !routeId) {
        console.error('[SAP B1] Failed to extract session cookies');
        return false;
      }

      this.session = {
        sessionId,
        routeId,
        sessionTimeout: response.data?.SessionTimeout,
        version: response.data?.Version,
      };

      console.log(`[SAP B1] Successfully logged in - Session: ${sessionId.substring(0, 8)}...`);
      return true;
    } catch (error) {
      console.error('[SAP B1] Login error:', this.getErrorMessage(error));
      return false;
    }
  }

  async logout(): Promise<void> {
    if (!this.session || !this.axiosInstance) {
      console.log('[SAP B1] No active session to logout');
      return;
    }

    try {
      await this.axiosInstance.post('/Logout', {}, {
        headers: {
          Cookie: this.getSessionCookies(),
        },
      });

      console.log('[SAP B1] Successfully logged out');
    } catch (error) {
      console.error('[SAP B1] Logout error:', this.getErrorMessage(error));
    } finally {
      this.session = undefined;
    }
  }

  async testConnection(): Promise<boolean> {
    try {
      const isLoggedIn = await this.login();
      if (!isLoggedIn) {
        return false;
      }

      if (!this.axiosInstance) {
        return false;
      }

      const response = await this.axiosInstance.get('/$metadata', {
        headers: {
          Cookie: this.getSessionCookies(),
        },
      });

      if (response.status === 200) {
        console.log('[SAP B1] Connection test successful - Service Layer accessible');
        return true;
      }

      console.error(`[SAP B1] Connection test failed with status ${response.status}`);
      return false;
    } catch (error) {
      console.error('[SAP B1] Connection test failed:', this.getErrorMessage(error));
      return false;
    }
  }

  private async makeRequest<T>(
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
    endpoint: string,
    data?: any
  ): Promise<T> {
    if (!this.session) {
      const loginSuccess = await this.login();
      if (!loginSuccess) {
        throw new Error('Failed to authenticate with SAP Business One');
      }
    }

    if (!this.axiosInstance) {
      throw new Error('Axios instance not initialized');
    }

    try {
      const config = {
        headers: {
          Cookie: this.getSessionCookies(),
        },
      };

      let response;
      switch (method) {
        case 'GET':
          response = await this.axiosInstance.get(endpoint, config);
          break;
        case 'POST':
          response = await this.axiosInstance.post(endpoint, data, config);
          break;
        case 'PATCH':
          response = await this.axiosInstance.patch(endpoint, data, config);
          break;
        case 'DELETE':
          response = await this.axiosInstance.delete(endpoint, config);
          break;
      }

      if (response.status === 401) {
        console.log('[SAP B1] Session expired, re-authenticating...');
        this.session = undefined;
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('Re-authentication failed');
        }
        return this.makeRequest<T>(method, endpoint, data);
      }

      if (response.status >= 400) {
        throw new Error(
          `Request failed with status ${response.status}: ${JSON.stringify(response.data)}`
        );
      }

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        console.log('[SAP B1] Session expired, re-authenticating...');
        this.session = undefined;
        const loginSuccess = await this.login();
        if (!loginSuccess) {
          throw new Error('Re-authentication failed');
        }
        return this.makeRequest<T>(method, endpoint, data);
      }
      throw error;
    }
  }

  async getBusinessPartners(cardType?: 'cCustomer' | 'cSupplier'): Promise<SAPBusinessPartner[]> {
    try {
      const filter = cardType ? `$filter=CardType eq '${cardType}'` : '';
      const select = '$select=CardCode,CardName,CardType,Phone1,EmailAddress,Address,City,Country,Currency,FederalTaxID';
      const endpoint = `/BusinessPartners?${select}${filter ? '&' + filter : ''}`;

      const response = await this.makeRequest<ODataResponse<SAPBusinessPartner>>('GET', endpoint);
      
      console.log(`[SAP B1] Fetched ${response.value.length} business partners${cardType ? ` (${cardType})` : ''}`);
      return response.value;
    } catch (error) {
      console.error('[SAP B1] Error fetching business partners:', error);
      throw new Error(`Failed to fetch business partners: ${this.getErrorMessage(error)}`);
    }
  }

  async getCustomers(): Promise<SAPBusinessPartner[]> {
    return this.getBusinessPartners('cCustomer');
  }

  async getSuppliers(): Promise<SAPBusinessPartner[]> {
    return this.getBusinessPartners('cSupplier');
  }

  async getInvoices(options?: { top?: number; skip?: number }): Promise<SAPInvoice[]> {
    try {
      const select = '$select=DocEntry,DocNum,CardCode,CardName,DocDate,DocDueDate,DocTotal,DocCurrency,Comments';
      const top = options?.top ? `$top=${options.top}` : '';
      const skip = options?.skip ? `$skip=${options.skip}` : '';
      
      const params = [select, top, skip].filter(Boolean).join('&');
      const endpoint = `/Invoices?${params}`;

      const response = await this.makeRequest<ODataResponse<SAPInvoice>>('GET', endpoint);
      
      console.log(`[SAP B1] Fetched ${response.value.length} invoices`);
      return response.value;
    } catch (error) {
      console.error('[SAP B1] Error fetching invoices:', error);
      throw new Error(`Failed to fetch invoices: ${this.getErrorMessage(error)}`);
    }
  }

  async getItems(options?: { top?: number; skip?: number }): Promise<SAPItem[]> {
    try {
      const select = '$select=ItemCode,ItemName,ItemType,QuantityOnStock,BarCode,PurchaseItem,SalesItem,ItemPrices';
      const top = options?.top ? `$top=${options.top}` : '';
      const skip = options?.skip ? `$skip=${options.skip}` : '';
      
      const params = [select, top, skip].filter(Boolean).join('&');
      const endpoint = `/Items?${params}`;

      const response = await this.makeRequest<ODataResponse<SAPItem>>('GET', endpoint);
      
      console.log(`[SAP B1] Fetched ${response.value.length} items`);
      return response.value;
    } catch (error) {
      console.error('[SAP B1] Error fetching items:', error);
      throw new Error(`Failed to fetch items: ${this.getErrorMessage(error)}`);
    }
  }

  async createInvoice(data: CreateInvoiceData): Promise<SAPInvoice> {
    try {
      const response = await this.makeRequest<SAPInvoice>('POST', '/Invoices', data);
      
      console.log(`[SAP B1] Invoice created: DocEntry ${response.DocEntry}, DocNum ${response.DocNum}`);
      return response;
    } catch (error) {
      console.error('[SAP B1] Error creating invoice:', error);
      throw new Error(`Failed to create invoice: ${this.getErrorMessage(error)}`);
    }
  }

  async sync(options?: SyncOptions): Promise<SyncResult> {
    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: Array<{ record?: any; error: string }> = [];

    try {
      console.log('[SAP B1] Starting sync...');

      const syncCustomers = options?.filters?.syncCustomers !== false;
      const syncInvoices = options?.filters?.syncInvoices !== false;
      const syncProducts = options?.filters?.syncProducts !== false;
      const syncSuppliers = options?.filters?.syncSuppliers === true;

      if (syncCustomers) {
        try {
          const customers = await this.getCustomers();
          recordsProcessed += customers.length;
          console.log(`[SAP B1] Synced ${customers.length} customers`);
        } catch (error) {
          recordsFailed++;
          errors.push({ error: `Failed to sync customers: ${this.getErrorMessage(error)}` });
        }
      }

      if (syncSuppliers) {
        try {
          const suppliers = await this.getSuppliers();
          recordsProcessed += suppliers.length;
          console.log(`[SAP B1] Synced ${suppliers.length} suppliers`);
        } catch (error) {
          recordsFailed++;
          errors.push({ error: `Failed to sync suppliers: ${this.getErrorMessage(error)}` });
        }
      }

      if (syncInvoices) {
        try {
          const invoices = await this.getInvoices({ top: options?.batchSize || 100 });
          recordsProcessed += invoices.length;
          console.log(`[SAP B1] Synced ${invoices.length} invoices`);
        } catch (error) {
          recordsFailed++;
          errors.push({ error: `Failed to sync invoices: ${this.getErrorMessage(error)}` });
        }
      }

      if (syncProducts) {
        try {
          const items = await this.getItems({ top: options?.batchSize || 100 });
          recordsProcessed += items.length;
          console.log(`[SAP B1] Synced ${items.length} items/products`);
        } catch (error) {
          recordsFailed++;
          errors.push({ error: `Failed to sync items: ${this.getErrorMessage(error)}` });
        }
      }

      const duration = Date.now() - startTime;
      const success = recordsFailed === 0;

      console.log(
        `[SAP B1] Sync completed in ${duration}ms - ${recordsProcessed} records processed, ${recordsFailed} failed`
      );

      return {
        success,
        recordsProcessed,
        recordsFailed,
        duration,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      console.error('[SAP B1] Sync failed:', error);

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
    await this.logout();
    this.context = undefined;
    this.config = undefined;
    this.axiosInstance = undefined;
    console.log('[SAP B1] Disconnected');
  }

  async getStatus(): Promise<ConnectorStatusResponse> {
    if (!this.context) {
      throw new Error('Connector not configured');
    }

    const hasSession = !!this.session;
    const hasConfig = !!(this.config?.serverUrl && this.config?.companyDB);

    return {
      connectorId: this.context.connectorId,
      status: hasSession ? 'active' : hasConfig ? 'paused' : 'disabled',
      config: {
        serverUrl: this.config?.serverUrl,
        companyDB: this.config?.companyDB,
        username: this.config?.username,
        hasSession: hasSession,
        usingOAuth: !!this.config?.accessToken,
      },
      metadata: {
        sessionId: this.session?.sessionId?.substring(0, 8) + '...',
        version: this.session?.version,
        sessionTimeout: this.session?.sessionTimeout,
      },
    };
  }

  private getErrorMessage(error: unknown): string {
    if (axios.isAxiosError(error)) {
      if (error.response?.data?.error?.message?.value) {
        return error.response.data.error.message.value;
      }
      if (error.response?.data?.error) {
        return JSON.stringify(error.response.data.error);
      }
      if (error.response?.data) {
        return JSON.stringify(error.response.data);
      }
      return error.message;
    }
    if (error instanceof Error) {
      return error.message;
    }
    if (typeof error === 'string') {
      return error;
    }
    return 'Unknown error';
  }
}
