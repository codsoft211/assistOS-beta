# SAP Business One Connector

**Status:** Stub Implementation

## Overview
Integration with SAP Business One, a comprehensive ERP system for small and medium-sized enterprises.

## Capabilities
- `accounting` - General ledger, financial statements
- `invoicing` - Sales and purchase documents
- `erp_sync` - Full ERP data synchronization

## Authentication
- **Type:** Basic Auth (Session-based)
- **API:** Service Layer REST API
- **Version:** 9.3+

## Configuration

```typescript
{
  serviceLayerUrl: string; // e.g., https://server:50000/b1s/v1
  companyDb: string;
  username: string;
  password: string;
}
```

## Implementation Status
🚧 **To be implemented**

This is a stub implementation. Full integration pending.

## Future Features

### Master Data Sync
- Business Partners (customers/suppliers)
- Items (products/services)
- Warehouses
- Price lists
- Payment terms

### Document Management
- Sales Orders
- Sales Invoices
- Purchase Orders
- Purchase Invoices
- Deliveries
- Returns

### Financial
- Journal Entries
- Payment runs
- Bank statements
- Tax reports

### Integration Points
- Bi-directional sync
- Real-time webhooks (if available)
- Batch import/export
- Document attachments

## Technical Notes
- Uses SAP B1 Service Layer REST API
- Session management with cookies
- Supports multiple company databases
- OData query support for filtering

## API Reference
SAP Business One Service Layer Documentation
