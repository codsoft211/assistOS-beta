# TOC Online Connector

**Status:** ✅ Active (Fully Implemented)

## Overview
Integration with TOC Online, a Portuguese accounting and invoicing platform. Provides comprehensive data synchronization for clients, suppliers, and invoices.

## Capabilities
- `accounting` - Accounting data management
- `invoicing` - Invoice creation and management

## Authentication
- **Type:** API Key (Bearer Token)
- **Base URL:** `https://www.toconline.pt/api` (default)

## Configuration

```typescript
{
  apiKey: string;          // TOC Online API Key (required)
  companyId: string;       // Company ID in TOC Online (required)
  baseUrl?: string;        // API base URL (optional, defaults to https://www.toconline.pt/api)
}
```

## Implementation Status
✅ **Complete** - Full connector implementation with all required methods

## Features

### Core Methods
1. **configure()** - Validates credentials and initializes HTTP client with Axios
2. **testConnection()** - Tests API connection by fetching company info
3. **sync()** - Synchronizes data from TOC Online (clients, suppliers, invoices)
4. **disconnect()** - Clears configuration and HTTP client
5. **getStatus()** - Returns current connector status with sync history

### Data Synchronization Methods
- **syncClients()** - Fetches all clients from TOC Online
- **syncSuppliers()** - Fetches all suppliers from TOC Online
- **syncInvoices(dateFrom?, dateTo?)** - Fetches invoices with optional date filtering

### Bonus Methods
- **createInvoice(data)** - Creates a new invoice in TOC Online
- **getCompanyInfo()** - Fetches company information

## TypeScript Types

### TOCOnlineClient
```typescript
{
  id: string;
  name: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  address?: { street, city, postalCode, country };
  customerCode?: string;
  paymentTerms?: number;
  discount?: number;
  active?: boolean;
}
```

### TOCOnlineSupplier
```typescript
{
  id: string;
  name: string;
  taxNumber?: string;
  email?: string;
  phone?: string;
  address?: { street, city, postalCode, country };
  supplierCode?: string;
  paymentTerms?: number;
  active?: boolean;
}
```

### TOCOnlineInvoice
```typescript
{
  id: string;
  invoiceNumber: string;
  date: string;
  dueDate?: string;
  clientId: string;
  status: 'draft' | 'pending' | 'paid' | 'cancelled';
  totalNet: number;
  totalTax: number;
  totalGross: number;
  lines?: Array<{ description, quantity, unitPrice, taxRate, total }>;
}
```

## Usage Example

```typescript
import { TOCOnlineConnector } from '@/packages/connectors/toc-online';

const connector = new TOCOnlineConnector();

// Configure
await connector.configure(
  {
    apiKey: 'your-api-key',
    companyId: 'your-company-id',
    baseUrl: 'https://www.toconline.pt/api', // optional
  },
  {
    tenantId: 'tenant-123',
    userId: 'user-456',
    connectorId: 'connector-789',
  }
);

// Test connection
const isConnected = await connector.testConnection();

// Sync all data
const result = await connector.sync({
  filters: {
    syncClients: true,
    syncSuppliers: true,
    syncInvoices: true,
    dateFrom: '2025-01-01',
    dateTo: '2025-11-05',
  },
});

// Create invoice
const invoice = await connector.createInvoice({
  clientId: 'client-123',
  date: '2025-11-05',
  lines: [
    {
      description: 'Consulting Services',
      quantity: 10,
      unitPrice: 50,
      taxRate: 23,
    },
  ],
});

// Get status
const status = await connector.getStatus();
```

## API Endpoints

- `GET /companies/{companyId}/info` - Company information
- `GET /companies/{companyId}/clients` - List all clients
- `GET /companies/{companyId}/suppliers` - List all suppliers
- `GET /companies/{companyId}/invoices?dateFrom=&dateTo=` - List invoices with date filters
- `POST /companies/{companyId}/invoices` - Create new invoice

## Error Handling

The connector includes comprehensive error handling:
- **Configuration validation** - Validates required fields (apiKey, companyId)
- **Connection errors** - Handles 401, 403, 404 HTTP status codes
- **Sync errors** - Tracks failed records and provides detailed error messages
- **Type safety** - Full TypeScript type definitions for all entities

## Sync Options

```typescript
{
  filters: {
    syncClients?: boolean;    // Default: true
    syncSuppliers?: boolean;  // Default: true
    syncInvoices?: boolean;   // Default: true
    dateFrom?: string;        // ISO date format
    dateTo?: string;          // ISO date format
  }
}
```

## Related Files
- Implementation: `packages/connectors/toc-online/index.ts`
- Base Interface: `packages/connectors/base/connector-interface.ts`
- Legacy Reference: `packages/ai/tools/specialized/toconline.ts`
