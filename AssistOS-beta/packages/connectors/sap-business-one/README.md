# SAP Business One Connector

Complete integration with SAP Business One ERP using Service Layer REST API (OData v4).

## Features

- ✅ Session-based authentication (B1SESSION + ROUTEID cookies)
- ✅ OAuth 2.0 support (optional)
- ✅ Automatic session refresh on expiration
- ✅ OData v4 query support ($select, $filter, $top, $skip)
- ✅ Full CRUD operations for Business Partners, Invoices, and Items
- ✅ Comprehensive error handling
- ✅ TypeScript type safety

## Configuration

```typescript
import { SAPBusinessOneConnector } from '@/connectors/sap-business-one';

const connector = new SAPBusinessOneConnector();

await connector.configure(
  {
    serverUrl: 'https://server:50000',  // SAP B1 Service Layer URL
    companyDB: 'SBODEMOUS',              // Company database name
    username: 'manager',                 // SAP B1 username
    password: 'yourpassword',            // SAP B1 password
    // Optional: OAuth 2.0
    // accessToken: 'your_oauth_token'
  },
  {
    tenantId: 'your-tenant-id',
    userId: 'your-user-id',
    connectorId: 'connector-id'
  }
);
```

## Authentication

### Session-based (Basic Auth)

```typescript
// Login (automatically called by other methods)
const success = await connector.login();

// Logout
await connector.logout();

// Test connection
const isConnected = await connector.testConnection();
```

### OAuth 2.0

```typescript
await connector.configure(
  {
    serverUrl: 'https://server:50000',
    companyDB: 'SBODEMOUS',
    accessToken: 'your_oauth_token',
  },
  context
);
```

## Usage Examples

### Get Business Partners

```typescript
// Get all customers
const customers = await connector.getCustomers();

// Get all suppliers
const suppliers = await connector.getSuppliers();

// Get all business partners
const allPartners = await connector.getBusinessPartners();

// Response format
interface SAPBusinessPartner {
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
}
```

### Get Invoices

```typescript
// Get all invoices
const invoices = await connector.getInvoices();

// Get with pagination
const invoices = await connector.getInvoices({
  top: 50,
  skip: 0
});

// Response format
interface SAPInvoice {
  DocEntry: number;
  DocNum: number;
  CardCode: string;
  CardName?: string;
  DocDate: string;
  DocDueDate?: string;
  DocTotal: number;
  DocCurrency?: string;
  Comments?: string;
}
```

### Get Items/Products

```typescript
// Get all items
const items = await connector.getItems();

// Get with pagination
const items = await connector.getItems({
  top: 100,
  skip: 0
});

// Response format
interface SAPItem {
  ItemCode: string;
  ItemName: string;
  ItemType?: string;
  ItemPrices?: Array<{
    PriceList: number;
    Price: number;
    Currency?: string;
  }>;
  QuantityOnStock?: number;
  BarCode?: string;
}
```

### Create Invoice

```typescript
const newInvoice = await connector.createInvoice({
  CardCode: 'C00001',
  DocDate: '2025-11-05',
  DocDueDate: '2025-12-05',
  Comments: 'Test invoice',
  DocumentLines: [
    {
      ItemCode: 'A00001',
      ItemDescription: 'Product 1',
      Quantity: 10,
      Price: 100.00,
      WarehouseCode: 'WH01',
      TaxCode: 'VAT23'
    }
  ]
});

console.log(`Invoice created: DocNum ${newInvoice.DocNum}`);
```

### Synchronization

```typescript
// Full sync
const result = await connector.sync();

// Selective sync
const result = await connector.sync({
  filters: {
    syncCustomers: true,
    syncInvoices: true,
    syncProducts: true,
    syncSuppliers: false
  },
  batchSize: 100
});

// Response format
interface SyncResult {
  success: boolean;
  recordsProcessed: number;
  recordsFailed: number;
  duration: number;
  errors?: Array<{
    record?: any;
    error: string;
  }>;
}
```

### Get Status

```typescript
const status = await connector.getStatus();

// Response
{
  connectorId: 'connector-id',
  status: 'active' | 'paused' | 'error' | 'disabled',
  config: {
    serverUrl: 'https://server:50000',
    companyDB: 'SBODEMOUS',
    hasSession: true,
    usingOAuth: false
  },
  metadata: {
    sessionId: 'abc12345...',
    version: '10.0',
    sessionTimeout: 30
  }
}
```

## OData v4 Support

The connector uses OData v4 query parameters:

- **$select**: Choose specific fields
- **$filter**: Filter results
- **$top**: Limit number of results
- **$skip**: Skip first N results
- **$orderby**: Sort results

Example using raw request:
```typescript
// This is handled internally by the connector
GET /b1s/v1/BusinessPartners?$select=CardCode,CardName&$filter=CardType eq 'cCustomer'&$top=10
```

## Session Management

The connector automatically handles:
- Session cookie storage (B1SESSION, ROUTEID)
- Automatic re-authentication on 401 errors
- Session timeout handling

## Error Handling

```typescript
try {
  const customers = await connector.getCustomers();
} catch (error) {
  console.error('Failed to fetch customers:', error.message);
}
```

Common errors:
- `Connector not configured` - Call configure() first
- `Failed to authenticate` - Check credentials
- `Session expired` - Automatically re-authenticates
- `Request failed with status XXX` - SAP B1 API error

## Disconnect

```typescript
// Logout and clear session
await connector.disconnect();
```

## API Endpoints

All endpoints are relative to `https://{server}:{port}/b1s/v1/`:

- `POST /Login` - Authentication
- `POST /Logout` - End session
- `GET /$metadata` - Service metadata
- `GET /BusinessPartners` - Business partners (customers/suppliers)
- `GET /Invoices` - Sales invoices
- `GET /Items` - Products/items
- `POST /Invoices` - Create invoice
- And many more SAP B1 entities...

## Requirements

- SAP Business One with Service Layer enabled
- Service Layer accessible via HTTPS
- Valid SAP B1 user credentials or OAuth token
- Network access to SAP B1 server

## TypeScript Types

All TypeScript interfaces are exported:
- `SAPConfig`
- `SessionInfo`
- `SAPBusinessPartner`
- `SAPInvoice`
- `SAPItem`
- `CreateInvoiceData`
- `ODataResponse<T>`

## Notes

- Session cookies are stored in memory only (not persisted)
- Sessions expire based on SAP B1 configuration (default: 30 minutes)
- All timestamps should be in ISO 8601 format
- Prices and amounts are decimal numbers
- CardType: 'cCustomer' for customers, 'cSupplier' for suppliers

## References

- [SAP Business One Service Layer Documentation](https://help.sap.com/docs/SAP_BUSINESS_ONE/0e5efd24ac254d46982e25d28cf7e49a/deb285981e274932b8965e5e84cee2a3.html)
- [OData v4 Protocol](https://www.odata.org/documentation/)
