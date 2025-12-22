# Moloni Connector

**Status:** ✅ Fully Implemented

## Overview
Complete integration with Moloni, a Portuguese cloud-based invoicing and accounting platform. Supports OAuth 2.0 authentication and full CRUD operations for customers, invoices, and products.

## Capabilities
- `accounting` - Chart of accounts, fiscal year management
- `invoicing` - Invoice, receipt, and credit note management

## Authentication
- **Type:** OAuth2
- **Flow:** Authorization Code Grant
- **API Base:** `https://api.moloni.pt/v1/`

## OAuth 2.0 Flow

### Step 1: Get Authorization URL
```typescript
const connector = new MoloniConnector();
await connector.configure(config, context);
const authUrl = connector.getAuthorizationUrl();
// Redirect user to authUrl
```

### Step 2: Exchange Authorization Code
```typescript
// After user authorizes and returns with code
const tokens = await connector.exchangeAuthCode(code);
// Tokens are automatically stored in config
```

### Step 3: Token Refresh (Automatic)
The connector automatically refreshes tokens when they expire. You can also manually refresh:
```typescript
await connector.refreshAccessToken();
```

## Configuration

```typescript
interface MoloniConfig {
  clientId: string;          // Required: OAuth client ID
  clientSecret: string;      // Required: OAuth client secret
  redirectUri: string;       // Required: OAuth redirect URI
  companyId?: number;        // Optional: Auto-selected on first connection
  accessToken?: string;      // Auto-populated after auth
  refreshToken?: string;     // Auto-populated after auth
  tokenExpiresAt?: number;   // Auto-populated after auth
}
```

## Methods

### Authentication Methods

#### `getAuthorizationUrl(): string`
Generates the OAuth authorization URL for user redirect.

```typescript
const authUrl = connector.getAuthorizationUrl();
// Returns: https://api.moloni.pt/v1/authorize/?response_type=code&client_id=...
```

#### `exchangeAuthCode(code: string): Promise<TokenResponse>`
Exchanges authorization code for access and refresh tokens.

```typescript
const tokens = await connector.exchangeAuthCode(authCode);
// Returns: { access_token, refresh_token, expires_in, token_type }
```

#### `refreshAccessToken(): Promise<void>`
Manually refreshes the access token using the refresh token.

```typescript
await connector.refreshAccessToken();
```

### Connection Methods

#### `testConnection(): Promise<boolean>`
Tests the connection and auto-selects the first available company.

```typescript
const isConnected = await connector.testConnection();
```

#### `getCompanies(): Promise<MoloniCompany[]>`
Retrieves all companies accessible with current credentials.

```typescript
const companies = await connector.getCompanies();
```

### Data Retrieval Methods

#### `getCustomers(): Promise<MoloniCustomer[]>`
Retrieves all customers for the configured company.

```typescript
const customers = await connector.getCustomers();
```

#### `getInvoices(): Promise<MoloniInvoice[]>`
Retrieves all invoices for the configured company.

```typescript
const invoices = await connector.getInvoices();
```

#### `getProducts(): Promise<MoloniProduct[]>`
Retrieves all products for the configured company.

```typescript
const products = await connector.getProducts();
```

### Data Creation Methods

#### `createCustomer(data: CreateCustomerData): Promise<MoloniCustomer>`
Creates a new customer in Moloni.

```typescript
const customer = await connector.createCustomer({
  vat: 'PT123456789',
  number: 'C001',
  name: 'ACME Corporation',
  email: 'contact@acme.pt',
  phone: '+351912345678',
  address: 'Rua Example, 123',
  zip_code: '1000-001',
  city: 'Lisboa',
  country_id: 1 // Portugal
});
```

#### `createInvoice(data: CreateInvoiceData): Promise<MoloniInvoice>`
Creates a new invoice in Moloni.

```typescript
const invoice = await connector.createInvoice({
  customer_id: 12345,
  date: '2025-11-05',
  document_set_id: 1,
  products: [
    {
      name: 'Product A',
      qty: 2,
      price: 100.00,
      discount: 0,
      taxes: [
        { tax_id: 1, value: 23 } // IVA 23%
      ]
    }
  ],
  notes: 'Payment due in 30 days',
  status: 0 // Draft
});
```

### Synchronization

#### `sync(options?: SyncOptions): Promise<SyncResult>`
Synchronizes customers, invoices, and products from Moloni.

```typescript
const result = await connector.sync({
  filters: {
    syncCustomers: true,
    syncInvoices: true,
    syncProducts: true
  }
});
```

### Utility Methods

#### `disconnect(): Promise<void>`
Disconnects and clears all stored tokens.

```typescript
await connector.disconnect();
```

#### `getStatus(): Promise<ConnectorStatusResponse>`
Gets the current connector status and configuration.

```typescript
const status = await connector.getStatus();
// Returns: { connectorId, status: 'active'|'disabled'|'error', config, metadata }
```

## Types

### MoloniCustomer
```typescript
interface MoloniCustomer {
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
```

### MoloniInvoice
```typescript
interface MoloniInvoice {
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
```

### MoloniProduct
```typescript
interface MoloniProduct {
  product_id: number;
  category_id?: number;
  name: string;
  reference?: string;
  price: number;
  unit_id?: number;
  has_stock?: number;
  stock?: number;
}
```

## Error Handling

The connector implements robust error handling:

- **Automatic Token Refresh**: When a 401 response is received, the connector automatically attempts to refresh the token and retry the request
- **Validation Errors**: Configuration errors are thrown immediately with clear messages
- **API Errors**: All API errors are caught, logged, and re-thrown with descriptive messages
- **Sync Errors**: Individual sync failures don't stop the entire sync process; errors are collected and returned in the result

## Usage Example

```typescript
import { MoloniConnector } from '@/packages/connectors/moloni';

// Step 1: Configure the connector
const connector = new MoloniConnector();
await connector.configure({
  clientId: 'your-client-id',
  clientSecret: 'your-client-secret',
  redirectUri: 'https://your-app.com/callback'
}, {
  tenantId: 'tenant-123',
  userId: 'user-456',
  connectorId: 'moloni-1'
});

// Step 2: Get authorization URL and redirect user
const authUrl = connector.getAuthorizationUrl();
// Redirect user to authUrl...

// Step 3: Exchange code for tokens (in callback handler)
await connector.exchangeAuthCode(authCode);

// Step 4: Test connection (auto-selects company)
const connected = await connector.testConnection();

// Step 5: Use the connector
const customers = await connector.getCustomers();
const invoices = await connector.getInvoices();

// Create new customer
const newCustomer = await connector.createCustomer({
  vat: 'PT999999999',
  number: 'C100',
  name: 'New Customer'
});

// Sync all data
const syncResult = await connector.sync();
console.log(`Synced ${syncResult.recordsProcessed} records`);
```

## Features

✅ **OAuth 2.0 Authentication** - Complete authorization code flow  
✅ **Automatic Token Refresh** - Handles token expiration automatically  
✅ **Multi-company Support** - Auto-selects or manually set company ID  
✅ **Customer Management** - List and create customers  
✅ **Invoice Management** - List and create invoices  
✅ **Product Catalog** - Retrieve product information  
✅ **Bulk Synchronization** - Sync customers, invoices, and products  
✅ **Error Handling** - Robust error handling and retry logic  
✅ **TypeScript Support** - Fully typed interfaces and responses  

## API Reference
Official Documentation: https://www.moloni.pt/dev/

## Notes
- Moloni is widely used in Portugal for SME invoicing and accounting
- The connector automatically handles IVA (Portuguese VAT) calculations
- Company ID is auto-selected on first connection if not provided
- All POST requests require an access_token parameter
- Tokens are automatically refreshed 60 seconds before expiration
