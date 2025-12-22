import type { IConnector } from '../base/connector-interface';
import type {
  ConnectorContext,
  ConnectorConfig,
  SyncOptions,
  SyncResult,
  ConnectorStatusResponse,
  ConnectorCapability,
} from '../base/types';
import axios, { AxiosInstance } from 'axios';

// SIBS Open Banking Configuration
export interface OpenBankingConfig extends ConnectorConfig {
  clientId: string;
  clientSecret: string;
  environment: 'sandbox' | 'production';
  redirectUri: string;
  accessToken?: string;
  refreshToken?: string;
  tokenExpiresAt?: number;
}

// SIBS API Types (Berlin Group NextGenPSD2)
export interface BankAccount {
  accountId: string;
  iban: string;
  currency: string;
  name?: string;
  product?: string;
  cashAccountType?: string;
  status?: string;
  balances?: AccountBalance[];
}

export interface AccountBalance {
  balanceType: string;
  balanceAmount: {
    currency: string;
    amount: string;
  };
  referenceDate?: string;
}

export interface Transaction {
  transactionId: string;
  bookingDate: string;
  valueDate: string;
  transactionAmount: {
    currency: string;
    amount: string;
  };
  creditorName?: string;
  creditorAccount?: {
    iban?: string;
  };
  debtorName?: string;
  debtorAccount?: {
    iban?: string;
  };
  remittanceInformationUnstructured?: string;
  purposeCode?: string;
  bankTransactionCode?: string;
}

export interface ConsentResponse {
  consentId: string;
  consentStatus: string;
  _links?: {
    scaRedirect?: {
      href: string;
    };
  };
}

export interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  scope?: string;
}

export class OpenBankingConnector implements IConnector {
  type = 'open_banking' as const;
  name = 'SIBS Open Banking';
  description = 'SIBS Market Open Banking integration for Portuguese bank account synchronization (24+ banks)';
  capabilities: ConnectorCapability[] = ['banking'];
  authType = 'oauth2' as const;

  private context?: ConnectorContext;
  private config?: OpenBankingConfig;
  private apiClient?: AxiosInstance;
  private baseUrl: string = '';
  private consentId?: string;

  /**
   * Configure the connector with credentials and context
   */
  async configure(config: ConnectorConfig, context: ConnectorContext): Promise<void> {
    // Validate required fields
    if (!config.clientId || typeof config.clientId !== 'string') {
      throw new Error('clientId is required and must be a string');
    }
    if (!config.clientSecret || typeof config.clientSecret !== 'string') {
      throw new Error('clientSecret is required and must be a string');
    }
    if (!config.redirectUri || typeof config.redirectUri !== 'string') {
      throw new Error('redirectUri is required and must be a string');
    }
    if (!config.environment || !['sandbox', 'production'].includes(config.environment)) {
      throw new Error('environment is required and must be "sandbox" or "production"');
    }

    this.context = context;
    this.config = config as OpenBankingConfig;

    // Set base URL based on environment
    this.baseUrl = config.environment === 'sandbox' 
      ? 'https://sandbox.sibspayments.com'
      : 'https://api.sibspayments.com';

    // Initialize API client
    this.apiClient = axios.create({
      baseURL: this.baseUrl,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      timeout: 30000,
    });

    console.log(`[OpenBanking] Configured for tenant ${context.tenantId} in ${config.environment} mode`);
  }

  /**
   * Create AIS (Account Information Service) consent
   * This is the first step in the Berlin Group OAuth flow for SIBS Open Banking
   * @param psuIpAddress - The IP address of the Payment Service User (end user)
   * @returns Consent response with consentId and scaRedirect URL
   */
  async createConsent(psuIpAddress: string): Promise<ConsentResponse> {
    if (!this.config || !this.apiClient) {
      throw new Error('Connector not configured');
    }

    try {
      // Berlin Group consent request body
      const validUntil = new Date();
      validUntil.setDate(validUntil.getDate() + 90); // 90 days validity

      const consentBody = {
        access: {
          accounts: [],
          balances: [],
          transactions: []
        },
        recurringIndicator: true,
        validUntil: validUntil.toISOString().split('T')[0],
        frequencyPerDay: 4,
        combinedServiceIndicator: false
      };

      const response = await this.apiClient.post<ConsentResponse>('/v1/consents', consentBody, {
        headers: {
          'Content-Type': 'application/json',
          'X-Request-ID': this.generateRequestId(),
          'PSU-IP-Address': psuIpAddress,
          'TPP-Redirect-URI': this.config.redirectUri,
        },
      });

      console.log(`[OpenBanking] Created consent: ${response.data.consentId}`);
      
      return response.data;
    } catch (error: any) {
      console.error('[OpenBanking] Error creating consent:', error.response?.data || error.message);
      throw new Error(`Failed to create consent: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Generate OAuth authorization URL for user to authorize bank access
   * Step 1 of Berlin Group OAuth flow - creates consent and returns SCA redirect URL
   * @param psuIpAddress - The IP address of the Payment Service User (end user)
   * @param state - Optional state parameter for OAuth security
   * @returns The SCA redirect URL where user should be redirected for authorization
   */
  async getAuthorizationUrl(psuIpAddress: string, state?: string): Promise<string> {
    if (!this.config) {
      throw new Error('Connector not configured');
    }

    // Step 1: Create consent first (Berlin Group flow)
    const consent = await this.createConsent(psuIpAddress);
    
    // Store consent ID for subsequent API calls
    this.consentId = consent.consentId;
    
    // Step 2: Return the SCA redirect URL from the consent response
    const scaRedirectUrl = consent._links?.scaRedirect?.href;
    
    if (!scaRedirectUrl) {
      throw new Error('No SCA redirect URL provided in consent response');
    }
    
    // Optionally append state parameter if provided
    if (state) {
      const url = new URL(scaRedirectUrl);
      url.searchParams.set('state', state);
      console.log(`[OpenBanking] Generated SCA redirect URL with consent ${consent.consentId} and state: ${state}`);
      return url.toString();
    }
    
    console.log(`[OpenBanking] Generated SCA redirect URL with consent ${consent.consentId}`);
    return scaRedirectUrl;
  }

  /**
   * Exchange authorization code for access token
   * Step 2 of OAuth flow
   */
  async exchangeAuthCode(authorizationCode: string): Promise<TokenResponse> {
    if (!this.config || !this.apiClient) {
      throw new Error('Connector not configured');
    }

    try {
      const response = await this.apiClient.post<TokenResponse>('/oauth2/token', 
        new URLSearchParams({
          grant_type: 'authorization_code',
          code: authorizationCode,
          redirect_uri: this.config.redirectUri,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokenData = response.data;

      // Store tokens in config
      this.config.accessToken = tokenData.access_token;
      this.config.refreshToken = tokenData.refresh_token;
      this.config.tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000);

      console.log(`[OpenBanking] Successfully exchanged authorization code for access token`);
      
      return tokenData;
    } catch (error: any) {
      console.error('[OpenBanking] Error exchanging authorization code:', error.response?.data || error.message);
      throw new Error(`Failed to exchange authorization code: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Refresh the access token using refresh token
   */
  async refreshAccessToken(): Promise<TokenResponse> {
    if (!this.config || !this.apiClient) {
      throw new Error('Connector not configured');
    }

    if (!this.config.refreshToken) {
      throw new Error('No refresh token available');
    }

    try {
      const response = await this.apiClient.post<TokenResponse>('/oauth2/token',
        new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.config.refreshToken,
          client_id: this.config.clientId,
          client_secret: this.config.clientSecret,
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
        }
      );

      const tokenData = response.data;

      // Update tokens in config
      this.config.accessToken = tokenData.access_token;
      if (tokenData.refresh_token) {
        this.config.refreshToken = tokenData.refresh_token;
      }
      this.config.tokenExpiresAt = Date.now() + (tokenData.expires_in * 1000);

      console.log(`[OpenBanking] Successfully refreshed access token`);
      
      return tokenData;
    } catch (error: any) {
      console.error('[OpenBanking] Error refreshing token:', error.response?.data || error.message);
      throw new Error(`Failed to refresh token: ${error.response?.data?.error_description || error.message}`);
    }
  }

  /**
   * Ensure we have a valid access token (refresh if needed)
   */
  private async ensureValidToken(): Promise<void> {
    if (!this.config) {
      throw new Error('Connector not configured');
    }

    if (!this.config.accessToken) {
      throw new Error('No access token available. Please authorize first using getAuthorizationUrl() and exchangeAuthCode()');
    }

    // Check if token is expired or about to expire (within 5 minutes)
    if (this.config.tokenExpiresAt && this.config.tokenExpiresAt < Date.now() + 300000) {
      console.log('[OpenBanking] Token expired or expiring soon, refreshing...');
      await this.refreshAccessToken();
    }
  }

  /**
   * Test connection by making a simple API call
   */
  async testConnection(): Promise<boolean> {
    if (!this.apiClient || !this.config) {
      throw new Error('Connector not configured');
    }

    try {
      await this.ensureValidToken();
      
      // Try to get accounts as a test
      const accounts = await this.getAccounts();
      
      console.log(`[OpenBanking] Connection test successful, found ${accounts.length} accounts`);
      return true;
    } catch (error: any) {
      console.error('[OpenBanking] Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Get all bank accounts
   * @param psuIpAddress - Optional PSU IP address
   */
  async getAccounts(psuIpAddress?: string): Promise<BankAccount[]> {
    if (!this.apiClient || !this.config) {
      throw new Error('Connector not configured');
    }

    await this.ensureValidToken();

    if (!this.consentId) {
      throw new Error('No consent ID available. Please complete authorization flow first.');
    }

    try {
      const response = await this.apiClient.get('/v1/accounts', {
        headers: this.getHeaders(psuIpAddress),
      });

      const accounts = response.data.accounts || [];
      
      console.log(`[OpenBanking] Retrieved ${accounts.length} bank accounts`);
      
      return accounts;
    } catch (error: any) {
      console.error('[OpenBanking] Error fetching accounts:', error.response?.data || error.message);
      throw new Error(`Failed to fetch accounts: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get transactions for a specific account
   * @param accountId - The account ID
   * @param dateFrom - Start date (YYYY-MM-DD format)
   * @param dateTo - End date (YYYY-MM-DD format)
   * @param psuIpAddress - Optional PSU IP address
   */
  async getTransactions(
    accountId: string, 
    dateFrom?: string, 
    dateTo?: string,
    psuIpAddress?: string
  ): Promise<Transaction[]> {
    if (!this.apiClient || !this.config) {
      throw new Error('Connector not configured');
    }

    await this.ensureValidToken();

    if (!this.consentId) {
      throw new Error('No consent ID available. Please complete authorization flow first.');
    }

    try {
      const params: any = {};
      
      if (dateFrom) {
        params.dateFrom = dateFrom; // Format: YYYY-MM-DD
      }
      if (dateTo) {
        params.dateTo = dateTo; // Format: YYYY-MM-DD
      }

      const response = await this.apiClient.get(`/v1/accounts/${accountId}/transactions`, {
        headers: this.getHeaders(psuIpAddress),
        params,
      });

      const transactions = response.data.transactions?.booked || [];
      
      console.log(`[OpenBanking] Retrieved ${transactions.length} transactions for account ${accountId}`);
      
      return transactions;
    } catch (error: any) {
      console.error('[OpenBanking] Error fetching transactions:', error.response?.data || error.message);
      throw new Error(`Failed to fetch transactions: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Get account balances
   * @param accountId - The account ID
   * @param psuIpAddress - Optional PSU IP address
   */
  async getBalances(accountId: string, psuIpAddress?: string): Promise<AccountBalance[]> {
    if (!this.apiClient || !this.config) {
      throw new Error('Connector not configured');
    }

    await this.ensureValidToken();

    if (!this.consentId) {
      throw new Error('No consent ID available. Please complete authorization flow first.');
    }

    try {
      const response = await this.apiClient.get(`/v1/accounts/${accountId}/balances`, {
        headers: this.getHeaders(psuIpAddress),
      });

      const balances = response.data.balances || [];
      
      console.log(`[OpenBanking] Retrieved ${balances.length} balances for account ${accountId}`);
      
      return balances;
    } catch (error: any) {
      console.error('[OpenBanking] Error fetching balances:', error.response?.data || error.message);
      throw new Error(`Failed to fetch balances: ${error.response?.data?.message || error.message}`);
    }
  }

  /**
   * Synchronize bank accounts and transactions
   * 
   * NOTE: This connector fetches data but does NOT persist to storage.
   * Persistence should be handled by the calling service using the returned data.
   * 
   * @param options - Sync options including filters and PSU IP address
   * @returns Sync result with statistics
   */
  async sync(options?: SyncOptions & { psuIpAddress?: string }): Promise<SyncResult> {
    if (!this.config || !this.context) {
      throw new Error('Connector not configured');
    }

    // Default to localhost if no PSU IP address provided
    const psuIpAddress = options?.psuIpAddress || '127.0.0.1';

    const startTime = Date.now();
    let recordsProcessed = 0;
    let recordsFailed = 0;
    const errors: Array<{ record?: any; error: string }> = [];

    try {
      console.log('[OpenBanking] Starting sync...');

      // Step 1: Fetch all accounts (with PSU IP address)
      const accounts = await this.getAccounts(psuIpAddress);
      recordsProcessed += accounts.length;

      // Step 2: For each account, fetch balances and transactions
      for (const account of accounts) {
        try {
          // Fetch balances (with PSU IP address)
          const balances = await this.getBalances(account.accountId, psuIpAddress);
          account.balances = balances;

          // Fetch transactions
          // Get transactions from the last 90 days by default
          const dateFrom = options?.filters?.dateFrom || this.getDateNDaysAgo(90);
          const dateTo = options?.filters?.dateTo || this.getToday();

          const transactions = await this.getTransactions(
            account.accountId,
            dateFrom,
            dateTo,
            psuIpAddress
          );

          recordsProcessed += transactions.length;

          console.log(`[OpenBanking] Synced account ${account.iban}: ${transactions.length} transactions`);
        } catch (error: any) {
          recordsFailed++;
          errors.push({
            record: account,
            error: error.message,
          });
          console.error(`[OpenBanking] Error syncing account ${account.accountId}:`, error.message);
        }
      }

      const duration = Date.now() - startTime;

      console.log(`[OpenBanking] Sync completed: ${recordsProcessed} records processed, ${recordsFailed} failed, ${duration}ms`);

      return {
        success: recordsFailed === 0,
        recordsProcessed,
        recordsFailed,
        duration,
        errors: errors.length > 0 ? errors : undefined,
      };
    } catch (error: any) {
      const duration = Date.now() - startTime;
      console.error('[OpenBanking] Sync failed:', error.message);
      
      return {
        success: false,
        recordsProcessed,
        recordsFailed: recordsFailed + 1,
        duration,
        errors: [{ error: error.message }],
      };
    }
  }

  /**
   * Disconnect and clear tokens
   */
  async disconnect(): Promise<void> {
    if (this.config) {
      // Clear sensitive data
      delete this.config.accessToken;
      delete this.config.refreshToken;
      delete this.config.tokenExpiresAt;
    }

    this.context = undefined;
    this.config = undefined;
    this.apiClient = undefined;
    this.consentId = undefined;

    console.log('[OpenBanking] Disconnected');
  }

  /**
   * Get connector status
   */
  async getStatus(): Promise<ConnectorStatusResponse> {
    if (!this.context) {
      throw new Error('Connector not configured');
    }

    return {
      connectorId: this.context.connectorId,
      status: this.config?.accessToken ? 'active' : 'disabled',
      config: this.config ? {
        clientId: this.config.clientId,
        environment: this.config.environment,
        redirectUri: this.config.redirectUri,
        hasAccessToken: !!this.config.accessToken,
        hasRefreshToken: !!this.config.refreshToken,
        tokenExpiresAt: this.config.tokenExpiresAt,
        hasConsentId: !!this.consentId,
        consentId: this.consentId,
      } : undefined,
      metadata: {
        baseUrl: this.baseUrl,
        authType: this.authType,
        capabilities: this.capabilities,
      },
    };
  }

  // Helper methods

  /**
   * Generate headers required for Berlin Group API calls
   * Includes mandatory headers: Authorization, Consent-ID, X-Request-ID, PSU-IP-Address, TPP-Redirect-URI
   * @param psuIpAddress - Optional PSU IP address (Payment Service User)
   * @returns Headers object for API requests
   */
  private getHeaders(psuIpAddress?: string): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': this.generateRequestId(),
    };

    // Add Authorization header if we have an access token
    if (this.config?.accessToken) {
      headers['Authorization'] = `Bearer ${this.config.accessToken}`;
    }

    // Add Consent-ID header (MANDATORY for account/transaction endpoints)
    if (this.consentId) {
      headers['Consent-ID'] = this.consentId;
    }

    // Add PSU-IP-Address if provided (frequently mandatory)
    if (psuIpAddress) {
      headers['PSU-IP-Address'] = psuIpAddress;
    }

    // Add TPP-Redirect-URI if configured
    if (this.config?.redirectUri) {
      headers['TPP-Redirect-URI'] = this.config.redirectUri;
    }

    return headers;
  }

  private generateRandomState(): string {
    return Math.random().toString(36).substring(2, 15) + 
           Math.random().toString(36).substring(2, 15);
  }

  private generateRequestId(): string {
    return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private getToday(): string {
    return new Date().toISOString().split('T')[0];
  }

  private getDateNDaysAgo(days: number): string {
    const date = new Date();
    date.setDate(date.getDate() - days);
    return date.toISOString().split('T')[0];
  }
}
