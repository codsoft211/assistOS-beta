# Open Banking Connector

**Status:** Wrapper for existing implementation

## Overview
Integration with Open Banking API for automatic bank account synchronization.

## Capabilities
- `banking` - Bank account and transaction synchronization

## Authentication
- **Type:** OAuth2
- **Flow:** Authorization Code with PKCE
- **Scopes:** `balances`, `transactions`, `accounts`

## Configuration

```typescript
{
  institutionId: string;
  country: string;
  accountIds?: string[];
}
```

## Implementation Status
✅ **Active** - Uses existing `openBankingConnections` schema

This connector wraps the existing Open Banking implementation that uses:
- `open_banking_connections` table
- `open_banking_accounts` table
- `open_banking_transactions` table

## Features
- Multi-bank support (via requisition management)
- Automatic transaction sync
- Balance updates
- Bank reconciliation support
- AI-powered transaction categorization

## Supported Banks
See `shared/schema.ts` for the current list of supported institutions.
