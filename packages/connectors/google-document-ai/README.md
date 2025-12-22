# Google Document AI Connector

**Status:** ✅ Fully Implemented

## Overview
Complete integration with Google Document AI for OCR and document processing capabilities for Portuguese fiscal documents.

## Capabilities
- `ocr` - Optical Character Recognition
- Text extraction from PDFs and images
- Entity extraction with confidence scores
- Table detection and extraction
- Multi-language support (including Portuguese)

## Authentication
- **Type:** Service Account
- **Required Credentials:**
  - Service account JSON key file
  - Project ID
  - Processor ID (full resource name)

## Configuration

```typescript
{
  projectId: string;
  processorId: string; // Format: "projects/{project}/locations/{location}/processors/{processor}"
  serviceAccountKey: {
    type: string;
    project_id: string;
    private_key_id: string;
    private_key: string;
    client_email: string;
    client_id: string;
    auth_uri: string;
    token_uri: string;
    auth_provider_x509_cert_url: string;
    client_x509_cert_url: string;
  }
}
```

## Usage Example

```typescript
import { GoogleDocumentAIConnector } from './packages/connectors/google-document-ai';

const connector = new GoogleDocumentAIConnector();

await connector.configure({
  projectId: 'my-project-id',
  processorId: 'projects/123/locations/us/processors/abc',
  serviceAccountKey: { /* service account JSON */ }
}, {
  tenantId: 'tenant-123',
  userId: 'user-456',
  connectorId: 'conn-789'
});

const isConnected = await connector.testConnection();

const result = await connector.processDocument(pdfBuffer, {
  mimeType: 'application/pdf'
});

console.log(result.text);
console.log(result.entities);
console.log(result.tables);
```

## Methods

### configure(config, context)
Configures the connector with Google Cloud credentials and validates:
- Project ID presence
- Service account key validity
- Processor ID format (must match: `projects/{project}/locations/{location}/processors/{processor}`)

### testConnection()
Tests connectivity with Google Document AI API by fetching the processor details.

### processDocument(file: Buffer, options)
Processes a document (PDF or image) and extracts:
- **text**: Full text content from the document
- **entities**: Structured entities with type, value, and confidence score
- **tables**: Detected tables with rows, columns, and cell data

**Options:**
- `mimeType`: Document MIME type (e.g., 'application/pdf', 'image/png', 'image/jpeg')
- `processorId`: Optional override for the default processor

### disconnect()
Closes the Google API client and clears configuration.

### getStatus()
Returns current connector status (active/disabled/error) and configuration metadata.

## Supported Document Types
- PDF documents (`.pdf`)
- PNG images (`.png`)
- JPEG images (`.jpg`, `.jpeg`)
- TIFF images (`.tiff`)
- GIF images (`.gif`)

## Features
- ✅ Full OCR text extraction
- ✅ Entity recognition with confidence scores
- ✅ Table detection and extraction
- ✅ Multi-page document support
- ✅ Error handling and validation
- ✅ Connection testing
- ✅ Service account authentication
- ✅ Portuguese language support

## Error Handling
The connector includes comprehensive error handling:
- Configuration validation errors
- Invalid processor ID format detection
- Service account credential validation
- API connectivity errors
- Document processing failures

All errors are logged and thrown with descriptive messages for easy debugging.
