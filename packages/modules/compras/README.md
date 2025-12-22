# Compras Module (Procurement & Purchasing)

**AI-First Procurement Automation for AssistOS**

The Compras module is a comprehensive, enterprise-grade procurement system designed for AI-first workflows. It automates the entire purchase-to-pay cycle, from requisition creation to supplier payment, with intelligent tools for supplier management, RFQ processing, 3-way matching, OCR invoice extraction, and financial analytics.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Database Entities](#database-entities)
3. [AI Tools (35 Total)](#ai-tools-35-total)
4. [Workflows (8 Total)](#workflows-8-total)
5. [API Routes (113 Total)](#api-routes-113-total)
6. [Integrations](#integrations)
7. [Setup & Configuration](#setup--configuration)
8. [Usage Examples](#usage-examples)
9. [Best Practices](#best-practices)
10. [Troubleshooting](#troubleshooting)

---

## Architecture Overview

### Vision: AI-First Procurement

The Compras module transforms traditional procurement into an AI-driven, conversational experience. Users can manage their entire purchasing lifecycle through natural language interactions with AssistOS agents.

**Key Capabilities:**

- 🤖 **AI-Powered Automation**: 35 specialized tools for procurement tasks
- 📊 **3-Way Matching**: Automated validation between PO, Receipt, and Invoice
- 📸 **OCR Invoice Extraction**: AI-powered data extraction from PDF/image invoices
- 📧 **Email Integration**: Automated PO emails with supplier invoice portals
- 🔒 **Multi-Tenant Isolation**: Strict tenant separation for security
- 📈 **Advanced Analytics**: Demand forecasting and spend analysis
- 🚀 **Quick Purchase Flow**: Streamlined bulk purchasing with minimal steps

### Core Design Principles

1. **Tenant Isolation**: All operations strictly enforce tenant boundaries
2. **Conversational AI**: Every feature accessible through natural language
3. **Audit Trail**: Complete tracking of all procurement activities
4. **Workflow Automation**: Intelligent state management with approval chains
5. **Data Accuracy**: 3-way matching ensures invoice accuracy
6. **Supplier Self-Service**: Public portal for invoice submission

### Integration with AssistOS Ecosystem

```
┌─────────────────────────────────────────────────────────────┐
│                    AssistOS Core                            │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  AI Agents   │  │   Context    │  │  Permissions │     │
│  │ Orchestrator │  │   Manager    │  │   Service    │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │             │
└─────────┼──────────────────┼──────────────────┼─────────────┘
          │                  │                  │
┌─────────▼──────────────────▼──────────────────▼─────────────┐
│                  Compras Module                              │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │  35 AI Tools │  │  8 Workflows │  │ 113 API      │     │
│  │              │  │              │  │ Routes       │     │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘     │
│         │                  │                  │             │
│  ┌──────▼──────────────────▼──────────────────▼───────┐   │
│  │          20 Database Entities                       │   │
│  │  (Suppliers, RFQs, POs, Invoices, Payments, etc.)  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐     │
│  │ Email        │  │ OCR Service  │  │ Public       │     │
│  │ Service      │  │ (OpenAI)     │  │ Portal       │     │
│  └──────────────┘  └──────────────┘  └──────────────┘     │
└──────────────────────────────────────────────────────────────┘
```

---

## Database Entities

The Compras module manages **20 database entities** organized into 6 functional groups.

### 1. Suppliers (3 entities)

#### `suppliers`

Master supplier registry with performance metrics and contact information.

**Key Fields:**

- `code`: Unique supplier identifier
- `name`, `legalName`, `taxId`: Company information
- `email`, `phone`, `website`: Contact details
- `type`: Supplier classification (`preferred`, `approved`, `trial`, `blocked`)
- `rating`: Overall supplier score (0-5)
- `paymentTerms`, `deliveryTerms`: Standard terms
- **Performance Metrics:**
  - `onTimeDeliveryRate`, `qualityScore`, `priceCompetitiveness`
  - `totalOrdersCount`, `totalOrdersValue`, `averageOrderValue`
  - `defectRate`, `returnRate`, `complaintCount`
- `bankName`, `iban`, `swiftBic`: Payment information

#### `product_suppliers`

Links products to suppliers with pricing and lead times.

**Key Fields:**

- `productId`, `supplierId`: Relationship keys
- `currentPrice`, `currency`: Current pricing
- `priceValidFrom`, `priceValidTo`: Price validity period
- `leadTimeDays`, `leadTimeVariance`: Delivery expectations
- `minimumOrderQuantity`, `quantityMultiple`: Order constraints
- `isPreferred`, `priority`: Supplier preference ranking

#### `supplier_price_history`

Historical pricing data for trend analysis and forecasting.

**Key Fields:**

- `productSupplierId`: Link to product-supplier relationship
- `effectiveDate`, `endDate`: Price validity period
- `price`, `currency`: Historical price point
- `priceChangeReason`: Reason for price change

### 2. Requisitions & RFQs (6 entities)

#### `purchase_requisitions`

Internal purchase requests requiring approval.

**Key Fields:**

- `code`: Unique requisition identifier
- `requestDate`, `requiredByDate`: Timing
- `requestedBy`, `approvedBy`: User tracking
- `departmentId`, `projectId`: Cost allocation
- `priority`: `low`, `normal`, `high`, `urgent`
- `status`: `draft`, `pending_approval`, `approved`, `rejected`, `partially_approved`, `converted_to_po`
- `approvalDate`, `rejectionReason`: Approval workflow

#### `purchase_requisition_lines`

Line items for each requisition.

**Key Fields:**

- `requisitionId`, `productId`: Relationship keys
- `quantity`, `uom`: Quantity details
- `estimatedPrice`, `estimatedTotal`: Cost estimates
- `suggestedSupplierId`: Supplier recommendation

#### `rfqs` (Request for Quotations)

RFQ master records sent to suppliers.

**Key Fields:**

- `code`: Unique RFQ identifier
- `issueDate`, `deadline`: Timeline
- `status`: `draft`, `sent`, `quotes_received`, `quote_selected`, `closed`, `cancelled`
- `selectedQuoteId`: Winning quote reference

#### `rfq_lines`

Items requested in RFQ.

**Key Fields:**

- `rfqId`, `productId`: Relationship keys
- `quantity`, `uom`: Quantity requested
- `specifications`: Technical requirements
- `targetPrice`: Desired price point

#### `rfq_quotes`

Supplier responses to RFQs.

**Key Fields:**

- `rfqId`, `supplierId`: Relationship keys
- `quoteDate`, `validUntil`: Quote validity
- `totalAmount`, `currency`: Quote value
- `deliveryLeadTime`: Promised delivery time
- **Scoring:**
  - `priceScore`, `leadTimeScore`, `supplierScore`, `overallScore`
  - `recommendation`: `recommended`, `acceptable`, `not_recommended`

#### `rfq_quote_lines`

Line-level quote details.

**Key Fields:**

- `quoteId`, `rfqLineId`: Relationship keys
- `unitPrice`, `lineTotal`: Pricing
- `leadTimeDays`: Item-specific lead time
- `notes`: Supplier comments

### 3. Purchase Orders (2 entities)

#### `purchase_orders`

Confirmed orders sent to suppliers.

**Key Fields:**

- `code`: Unique PO number
- `orderDate`, `expectedDeliveryDate`, `confirmedDeliveryDate`
- `supplierId`: Supplier reference
- `subtotal`, `taxTotal`, `totalAmount`, `currency`: Financial details
- `paymentTerms`, `deliveryTerms`: Order terms
- `status`: `draft`, `pending_approval`, `approved`, `sent_to_supplier`, `acknowledged_by_supplier`, `partially_received`, `fully_received`, `completed`, `cancelled`
- **Email Integration:**
  - `invoiceSubmissionToken`: Secure token for supplier invoice upload
  - `invoiceSubmissionTokenExpiresAt`: Token expiration (48 hours)
  - `sentToSupplierAt`, `acknowledgedBySupplierAt`: Communication tracking

#### `purchase_order_lines`

PO line items with receipt tracking.

**Key Fields:**

- `poId`, `productId`, `requisitionLineId`: Relationship keys
- `quantity`, `unitPrice`, `lineTotal`: Pricing
- `receivedQuantity`, `remainingQuantity`: Receipt tracking
- `taxRate`, `taxAmount`: Tax details

### 4. Receipts & Returns (4 entities)

#### `receipts`

Goods receipt notes (GRN) for received shipments.

**Key Fields:**

- `code`: Unique receipt identifier
- `receiptDate`: When goods were received
- `poId`, `warehouseId`: Location tracking
- `receivedBy`: User who received goods
- `receivedQuantity`, `acceptedQuantity`: Quality control
- `status`: `pending`, `partially_accepted`, `completed`, `discrepancy_reported`
- `discrepancyReported`, `discrepancyResolved`: Quality issues

#### `receipt_lines`

Line-level receipt details with quality checks.

**Key Fields:**

- `receiptId`, `poLineId`, `productId`: Relationship keys
- `orderedQuantity`, `receivedQuantity`, `acceptedQuantity`, `rejectedQuantity`
- `discrepancyReason`: Quality issue description
- `batchNumber`, `serialNumbers`: Traceability

#### `supplier_returns`

Return merchandise authorization (RMA) to suppliers.

**Key Fields:**

- `code`: Unique return identifier
- `returnDate`: When return was initiated
- `supplierId`, `poId`, `receiptId`: Relationship keys
- `returnReason`: `defective`, `wrong_item`, `excess_quantity`, `damaged`, `expired`, `other`
- `status`: `draft`, `approved_by_supplier`, `shipped_back`, `received_by_supplier`, `credit_issued`, `completed`, `cancelled`
- **Credit Note Tracking:**
  - `creditNoteNumber`, `creditNoteDate`, `creditNoteAmount`

#### `supplier_return_lines`

Items being returned.

**Key Fields:**

- `returnId`, `receiptLineId`, `productId`: Relationship keys
- `quantity`: Return quantity
- `returnReason`: Item-specific reason
- `batchNumber`: Traceability

### 5. Invoices & Payments (4 entities)

#### `supplier_invoices`

Supplier invoices with 3-way matching.

**Key Fields:**

- `code`: Internal invoice code
- `invoiceNumber`: Supplier invoice number
- `invoiceDate`, `dueDate`: Payment timeline
- `supplierId`, `poId`, `receiptId`: 3-way match references
- `subtotal`, `taxTotal`, `totalAmount`, `currency`: Financial details
- **3-Way Match Status:**
  - `threeWayMatchStatus`: `pending`, `matched`, `discrepancy`, `override`
  - `poDiscrepancy`, `poDiscrepancyAmount`: PO mismatch details
  - `receiptDiscrepancy`, `priceDiscrepancy`: Other mismatches
- **OCR Integration:**
  - `ocrExtracted`, `ocrData`, `ocrConfidence`: Extraction results
  - `submissionSource`: `manual`, `ocr`, `email`, `web_form`
- **Payment Tracking:**
  - `paidAmount`, `remainingAmount`: Payment status
- **Approval:**
  - `approvedBy`, `approvalDate`, `rejectionReason`
  - `overrideReason`, `overrideApprovedBy`: Override justification

#### `supplier_invoice_lines`

Invoice line items for 3-way matching.

**Key Fields:**

- `invoiceId`, `poLineId`: Relationship keys
- `description`, `quantity`, `unitPrice`, `lineTotal`
- `taxRate`, `taxAmount`: Tax details
- `matchedToPoLine`, `matchedToReceiptLine`: Match status

#### `supplier_payments`

Payments made to suppliers.

**Key Fields:**

- `code`: Payment reference
- `paymentDate`, `valueDate`: Payment timing
- `supplierId`, `bankAccountId`: Payment routing
- `amount`, `currency`: Payment value
- `paymentMethod`: `bank_transfer`, `check`, `credit_card`, `cash`, `other`
- `referenceNumber`, `checkNumber`: Payment reference
- `allocatedAmount`, `unappliedAmount`: Allocation tracking
- `status`: `draft`, `processed`, `completed`, `voided`

#### `payment_allocations`

Links payments to invoices.

**Key Fields:**

- `paymentId`, `invoiceId`: Relationship keys
- `allocatedAmount`: Portion of payment allocated
- `allocationDate`: When allocation occurred

### 6. Employee Expenses (1 entity)

#### `employee_expenses`

Employee reimbursement requests.

**Key Fields:**

- `code`: Expense identifier
- `expenseDate`: When expense occurred
- `employeeId`, `departmentId`, `projectId`: Cost allocation
- `category`: `travel`, `meals`, `accommodation`, `supplies`, `fuel`, `parking`, `other`
- `description`, `merchantName`: Expense details
- `amount`, `currency`: Cost
- `paymentMethod`: `company_card`, `personal_reimbursement`, `petty_cash`
- `receiptAttached`, `receiptUrl`: Receipt tracking
- `status`: `draft`, `submitted`, `pending_approval`, `approved`, `rejected`, `reimbursed`
- **Project Allocation:**
  - `allocatedToProject`, `allocationPercentage`: Project cost tracking
- **Approval:**
  - `approvedBy`, `approvalDate`, `rejectionReason`

---

## AI Tools (35 Total)

The Compras module provides 35 specialized AI tools organized into 11 functional categories. Each tool can be invoked through natural language conversations with AssistOS agents.

### 1. Suppliers (4 tools)

#### `list_suppliers`

Search and filter suppliers with performance metrics.

**Parameters:**

- `search` (string, optional): Search by name, code, or category
- `status` (enum, optional): `active`, `inactive`, `pending_approval`, `blacklisted`
- `category` (string, optional): Filter by supplier category
- `minRating` (number, optional): Minimum rating (0-5)
- `limit` (number, default: 20): Results limit

**Returns:**

```json
{
  "success": true,
  "count": 5,
  "suppliers": [
    {
      "id": "sup_123",
      "code": "SUP-001",
      "name": "Acme Corp",
      "rating": 4.5,
      "status": "active",
      "category": "Materials",
      "email": "sales@acme.com",
      "phone": "+351 21 123 4567",
      "paymentTerms": "Net 30",
      "totalOrdersValue": "125000.00",
      "onTimeDeliveryRate": "95.5"
    }
  ]
}
```

**Usage Example:**

```
User: "Show me all approved material suppliers with rating above 4"
Agent: *Uses list_suppliers with minRating=4, category="Materials", status="active"*
```

#### `create_supplier`

Register a new supplier in the system.

**Parameters:**

- `name` (string, required): Supplier name
- `code` (string, required): Unique supplier code
- `taxId` (string, optional): Tax identification number
- `email` (string, optional): Contact email
- `phone` (string, optional): Contact phone
- `category` (string, optional): Supplier category
- `paymentTerms` (string, optional): Default payment terms
- `deliveryLeadTimeDays` (number, optional): Average lead time
- `address` (string, optional): Full address
- `notes` (string, optional): Additional notes

**Returns:**

```json
{
  "success": true,
  "message": "Fornecedor 'Acme Corp' criado com sucesso (status: pending_approval)",
  "supplier": {
    /* supplier object */
  }
}
```

**Usage Example:**

```
User: "Create a new supplier called Tech Solutions with code SUP-042, email sales@techsol.com"
Agent: *Uses create_supplier*
```

#### `update_supplier`

Update supplier information and performance metrics.

**Parameters:**

- `supplierId` (string, required): Supplier ID
- `status` (enum, optional): New status
- `rating` (number, optional): Updated rating (0-5)
- `paymentTerms` (string, optional): Updated payment terms
- `deliveryLeadTimeDays` (number, optional): Updated lead time
- `notes` (string, optional): Updated notes

**Returns:** Updated supplier object

**Usage Example:**

```
User: "Update supplier Acme Corp rating to 4.8 and mark them as preferred"
Agent: *Uses update_supplier with rating=4.8, status="preferred"*
```

#### `score_supplier`

Calculate comprehensive supplier performance score.

**Parameters:**

- `supplierId` (string, required): Supplier ID to evaluate
- `includePriceHistory` (boolean, default: true): Include price stability analysis
- `includeDeliveryPerformance` (boolean, default: true): Include delivery metrics

**Returns:**

```json
{
  "success": true,
  "scores": {
    "supplierId": "sup_123",
    "supplierName": "Acme Corp",
    "currentRating": 4.2,
    "breakdown": {
      "priceStability": {
        "recordsAnalyzed": 12,
        "score": 4.5,
        "notes": "Histórico de preços consistente"
      },
      "deliveryPerformance": {
        "averageLeadTime": 7,
        "score": 5.0,
        "notes": "Baseado em lead time configurado"
      }
    },
    "overallScore": 4.75,
    "recommendations": ["Fornecedor RECOMENDADO - Excelente performance"]
  }
}
```

### 2. Quick Purchase Flow (5 tools - CRITICAL FEATURE)

The Quick Purchase Flow is designed for rapid procurement with minimal steps.

#### `bulk_create_purchase_requests`

Create multiple purchase requisitions in one operation.

**Parameters:**

- `items` (array, required): List of products to requisition
  - `productCode` (string): Product identifier
  - `quantity` (number): Quantity needed
  - `notes` (string, optional): Item-specific notes
- `priority` (enum, default: normal): `low`, `normal`, `high`, `urgent`
- `notes` (string, optional): General notes

**Returns:**

```json
{
  "success": true,
  "message": "Requisição REQ-1730123456 criada com 3 itens",
  "requisition": {
    /* requisition object */
  },
  "lines": [
    /* array of line items */
  ]
}
```

**Usage Example:**

```
User: "I need to order 50 units of product ABC and 20 units of product XYZ urgently"
Agent: *Uses bulk_create_purchase_requests with items and priority=urgent*
```

#### `auto_generate_purchase_orders`

Automatically convert approved requisitions into purchase orders.

**Parameters:**

- `requisitionIds` (array of strings, required): Requisition IDs to convert
- `autoSelectSuppliers` (boolean, default: true): Auto-select best suppliers by score
- `paymentTerms` (string, optional): Override payment terms

**Returns:**

```json
{
  "success": true,
  "message": "PO PO-1730123456 gerado automaticamente com 3 linhas",
  "po": {
    /* purchase order object */
  },
  "lines": [
    /* PO line items */
  ]
}
```

**Usage Example:**

```
User: "Generate purchase orders for all approved requisitions"
Agent: *Uses auto_generate_purchase_orders with requisitionIds from approved requisitions*
```

#### `send_po_with_invoice_request`

Email PO to supplier with secure invoice submission link.

**Parameters:**

- `poId` (string, required): Purchase Order ID
- `supplierEmail` (string, required): Supplier contact email
- `customMessage` (string, optional): Custom message in email
- `includeInvoiceRequestLink` (boolean, default: true): Include submission link

**Returns:**

```json
{
  "success": true,
  "message": "PO PO-001 enviado para Acme Corp",
  "po": {
    /* PO object */
  },
  "supplier": {
    "id": "sup_123",
    "name": "Acme Corp",
    "email": "sales@acme.com"
  },
  "submissionToken": "uuid-token",
  "invoiceSubmitUrl": "https://app.assistos.com/supplier-invoice/uuid-token",
  "emailSent": true,
  "emailMessageId": "msg_xyz"
}
```

**Security Note:** The submission token expires in 48 hours.

**Usage Example:**

```
User: "Send PO-001 to the supplier and ask them to submit their invoice"
Agent: *Uses send_po_with_invoice_request*
```

#### `process_supplier_invoice_submission`

Process invoice submitted by supplier through public portal.

**Parameters:**

- `submissionToken` (string, required): Secure token from email
- `invoiceNumber` (string, required): Supplier invoice number
- `invoiceDate` (string, required): Invoice date (YYYY-MM-DD)
- `totalAmount` (number, required): Invoice total
- `attachmentUrl` (string, optional): PDF/image file path
- `lineItems` (array, optional): Invoice line items

**Returns:**

```json
{
  "success": true,
  "message": "Invoice INV-123 processada com sucesso",
  "invoice": {
    /* invoice object */
  },
  "lines": [
    /* invoice lines */
  ],
  "matchResult": {
    "status": "matched",
    "poTotal": 1000.0,
    "invoiceTotal": 1000.0,
    "discrepancy": 0,
    "approved": true
  }
}
```

**Usage Example:**

```
User: "Process the invoice that was just submitted by the supplier"
Agent: *Uses process_supplier_invoice_submission with token and invoice data*
```

#### `get_accounts_payable_summary`

Get comprehensive accounts payable dashboard.

**Parameters:**

- `includeAgingBreakdown` (boolean, default: true): Include aging buckets
- `includeTopSuppliers` (boolean, default: true): Include top 10 suppliers by amount due

**Returns:**

```json
{
  "success": true,
  "summary": {
    "totalPendingInvoices": 25,
    "totalAmountDue": 125000.5,
    "currency": "EUR",
    "agingBreakdown": {
      "current": 50000.0,
      "days31to60": 40000.0,
      "days61to90": 25000.5,
      "over90": 10000.0
    },
    "topSuppliers": [{ "supplierId": "sup_123", "pendingAmount": 45000.0 }]
  }
}
```

### 3. Requisitions (3 tools)

#### `list_requisitions`

Query purchase requisitions with filters.

**Parameters:**

- `status`, `priority`, `requestedBy`, `search`, `limit`

**Returns:** List of requisitions with lines

#### `create_requisition`

Create new purchase requisition.

**Parameters:**

- `items` (array, required): Products to requisition
- `priority`, `departmentId`, `projectId`, `notes`

**Returns:** Created requisition with lines

#### `approve_requisition`

Approve or reject requisition.

**Parameters:**

- `requisitionId` (string, required)
- `action` (enum, required): `approve`, `reject`, `approve_partial`
- `approvedLineIds` (array, optional): For partial approval
- `comments` (string, optional)

**Returns:** Updated requisition status

### 4. RFQs (3 tools)

#### `create_rfq`

Create Request for Quotation sent to multiple suppliers.

**Parameters:**

- `supplierIds` (array, required): Suppliers to request quotes from
- `items` (array, required): Products/services needed
- `daysUntilDeadline` (number, default: 7)
- `notes` (string, optional)

**Returns:** RFQ with lines and supplier list

#### `evaluate_rfq_quotes`

Evaluate and rank supplier quotes.

**Parameters:**

- `rfqId` (string, required)
- `priceWeight` (number, default: 0.6): Price importance
- `leadTimeWeight` (number, default: 0.2): Lead time importance
- `supplierScoreWeight` (number, default: 0.2): Supplier rating importance

**Returns:**

```json
{
  "success": true,
  "rfqId": "rfq_123",
  "quotesEvaluated": 3,
  "quotes": [
    {
      "id": "quote_1",
      "supplierName": "Acme Corp",
      "scores": {
        "priceScore": 5.0,
        "leadTimeScore": 4.5,
        "supplierScore": 4.2,
        "overallScore": 4.72
      }
    }
  ],
  "bestQuote": {
    /* highest scoring quote */
  }
}
```

#### `select_best_quote`

Mark winning quote and update RFQ status.

**Parameters:**

- `rfqId`, `quoteId`, `reason` (optional)

**Returns:** Selected quote confirmation

### 5. Purchase Orders (4 tools)

#### `list_purchase_orders`

Query POs with filters.

**Parameters:** `status`, `supplierId`, `search`, `limit`

#### `create_purchase_order`

Create new purchase order.

**Parameters:**

- `supplierId`, `items`, `paymentTerms`, `deliveryAddress`, `notes`

**Returns:** Created PO with lines

#### `track_po_delivery`

Track PO delivery status with receipt information.

**Parameters:** `poId`

**Returns:**

```json
{
  "tracking": {
    "poCode": "PO-001",
    "status": "partially_received",
    "totalOrdered": 100,
    "totalReceived": 60,
    "percentReceived": "60.00",
    "receipts": [
      /* receipt history */
    ],
    "pendingLines": [
      /* items not yet received */
    ]
  }
}
```

#### `cancel_po`

Cancel purchase order.

**Parameters:** `poId`, `reason` (required)

**Returns:** Cancelled PO

### 6. Receipts (2 tools)

#### `create_receipt`

Record goods receipt with quality control.

**Parameters:**

- `poId` (required)
- `items` (array): Each with `poLineId`, `receivedQuantity`, `acceptedQuantity`, `discrepancyReason`, `batchNumber`
- `warehouseId`, `receivedBy`, `notes`

**Returns:** Receipt with lines and updated PO status

#### `validate_receipt_vs_po`

Validate receipt against original PO.

**Parameters:**

- `receiptId`, `strictMode` (boolean, default: false)

**Returns:**

```json
{
  "validation": {
    "passed": false,
    "discrepanciesCount": 2,
    "warningsCount": 1,
    "discrepancies": [
      {
        "lineId": "line_1",
        "issue": "Over-received: Ordered 100, Received 110",
        "severity": "high",
        "action": "Retornar excesso ao fornecedor"
      }
    ],
    "overallStatus": "REJECTED"
  }
}
```

### 7. Invoices (4 tools - includes OCR)

#### `list_invoices`

Query supplier invoices.

**Parameters:** `status`, `supplierId`, `threeWayMatchStatus`, `search`, `limit`

#### `process_invoice_ocr`

Extract invoice data using OCR (pdf-parse + OpenAI Vision).

**Parameters:**

- `invoiceId`, `attachmentUrl`, `ocrEngine` (optional)

**Returns:**

```json
{
  "success": true,
  "message": "OCR processado com 92% de confiança",
  "ocrData": {
    "invoiceNumber": "INV-2024-001",
    "invoiceDate": "2024-10-31",
    "supplierName": "Acme Corp",
    "totalAmount": 1230.0,
    "currency": "EUR",
    "lineItems": [
      {
        "description": "Product ABC",
        "quantity": 50,
        "unitPrice": 24.6,
        "total": 1230.0
      }
    ],
    "confidence": 0.92
  },
  "engine": "pdf-parse+openai"
}
```

#### `three_way_match_validation`

Validate Invoice vs PO vs Receipt.

**Parameters:**

- `invoiceId`, `tolerancePercent` (default: 5)

**Returns:**

```json
{
  "matchStatus": "discrepancy",
  "discrepanciesCount": 1,
  "discrepancies": [
    {
      "type": "total_amount",
      "severity": "high",
      "poAmount": 1000.0,
      "invoiceAmount": 1100.0,
      "difference": 100.0,
      "toleranceExceeded": true
    }
  ],
  "summary": {
    "invoiceTotal": 1100.0,
    "poTotal": 1000.0,
    "receiptTotal": 1000.0,
    "tolerancePercent": 5,
    "passed": false
  }
}
```

#### `approve_invoice`

Approve or reject invoice.

**Parameters:**

- `invoiceId`, `action` (`approve`, `reject`, `approve_with_override`)
- `overrideReason` (required for override)
- `rejectionReason` (required for reject)

**Returns:** Approved invoice

### 8. Payments (3 tools)

#### `list_pending_payments`

List invoices awaiting payment with aging.

**Parameters:** `supplierId`, `overdueOnly`, `limit`

**Returns:**

```json
{
  "count": 15,
  "totalPending": 45000.0,
  "invoices": [
    {
      "id": "inv_123",
      "invoiceNumber": "INV-001",
      "totalAmount": 1000.0,
      "remainingAmount": 1000.0,
      "dueDate": "2024-10-15",
      "daysOverdue": 16,
      "overdue": true
    }
  ]
}
```

#### `create_payment`

Record payment to supplier.

**Parameters:**

- `supplierId`, `amount`, `paymentMethod`
- `bankAccountId`, `referenceNumber`, `notes`

**Returns:** Payment record

#### `allocate_payment_to_invoices`

Distribute payment across invoices.

**Parameters:**

- `paymentId`
- `allocations` (array): Each with `invoiceId`, `amount`

**Returns:**

```json
{
  "message": "3 alocações criadas - Total: €1000.00",
  "allocations": [
    /* allocation records */
  ],
  "paymentStatus": "completed"
}
```

### 9. Returns (2 tools)

#### `create_return`

Create supplier return (RMA).

**Parameters:**

- `supplierId`, `returnReason`, `items`
- `receiptId`, `poId`, `returnReasonDetails`, `notes`

**Returns:** Return with lines

#### `process_return`

Update return status through workflow.

**Parameters:**

- `returnId`
- `action`: `approve_by_supplier`, `ship_back`, `mark_received_by_supplier`, `issue_credit_note`, `complete`
- `trackingNumber`, `shippingMethod`, `creditNoteNumber`, `creditNoteAmount`

**Returns:** Updated return

### 10. Employee Expenses (3 tools)

#### `create_employee_expense`

Create employee reimbursement request.

**Parameters:**

- `employeeId`, `category`, `amount`, `expenseDate`
- `description`, `merchantName`, `projectId`, `receiptUrl`, `paymentMethod`

**Returns:** Expense record

#### `approve_expense`

Approve or reject expense.

**Parameters:** `expenseId`, `action`, `rejectionReason`

**Returns:** Approved expense

#### `allocate_expense_to_project`

Allocate expense to project for cost tracking.

**Parameters:**

- `expenseId`, `projectId`, `allocationPercentage` (1-100)

**Returns:** Updated expense with allocation

### 11. Analytics (2 tools)

#### `forecast_demand`

Forecast product demand based on purchase history.

**Parameters:**

- `productId`, `forecastMonths` (default: 3), `historicalMonths` (default: 12)

**Returns:**

```json
{
  "forecast": {
    "forecastMonths": 3,
    "dataPoints": 12,
    "avgMonthlyDemand": 120.5,
    "forecastedDemand": 361.5,
    "trend": "increasing",
    "confidence": "high"
  },
  "recommendation": {
    "reorderPoint": 180.75,
    "safetyStock": 60.25,
    "suggestedOrderQty": 361.5
  }
}
```

#### `spend_analysis_by_supplier`

Analyze spending patterns by supplier.

**Parameters:**

- `supplierId`, `startDate`, `endDate`, `topN` (default: 10)

**Returns:**

```json
{
  "summary": {
    "totalSpend": 450000.0,
    "totalPOs": 125,
    "uniqueSuppliers": 23,
    "avgPOValue": 3600.0
  },
  "topSuppliers": [
    {
      "supplierId": "sup_123",
      "supplierName": "Acme Corp",
      "supplierRating": 4.5,
      "totalSpend": 125000.0,
      "poCount": 45,
      "avgOrderValue": 2777.78
    }
  ]
}
```

---

## Workflows (8 Total)

Compras implements 8 intelligent workflows for procurement automation.

### 1. Quick Purchase Automation

**Purpose:** Streamlined end-to-end purchasing from requisition to payment

**States:**

- `draft` → `auto_generated` → `po_created` → `receipt_registered` → `invoice_received` → `payment_scheduled` → `completed`

**Automations:**

- Auto-generate POs when state becomes `auto_generated`
- Send PO with invoice request link when `po_created`
- Run 3-way match validation when `invoice_received`

**Use Case:** Rapid procurement for regular purchases

### 2. Requisition Approval Workflow

**Purpose:** Multi-stage approval for purchase requisitions

**States:**

- `pending` → `submitted` → `manager_review` → `finance_review` → `approved` / `rejected`

**Transitions:**

- Manager approval required for amounts > threshold
- Finance approval required for high-value purchases
- Can reject at any stage with reason

### 3. RFQ Process Workflow

**Purpose:** Competitive bidding and supplier selection

**States:**

- `draft` → `sent_to_suppliers` → `quotes_received` → `evaluation` → `quote_selected` → `po_generated`

**Automations:**

- Email RFQ to suppliers at `sent_to_suppliers`
- Score quotes at `evaluation`
- Generate PO from winning quote at `quote_selected`

### 4. Purchase Order Lifecycle

**Purpose:** Track PO from creation to delivery

**States:**

- `draft` → `approved` → `sent_to_supplier` → `acknowledged` → `partially_received` → `fully_received` → `completed`

**Automations:**

- Send email to supplier at `sent_to_supplier`
- Update to `partially_received` when first receipt created
- Update to `fully_received` when all lines received

### 5. Goods Receipt Validation

**Purpose:** Quality control and discrepancy management

**States:**

- `pending` → `inspection` → `accepted` / `rejected` / `partial_acceptance`

**Validations:**

- Quantity check against PO
- Quality inspection
- Batch/serial number tracking

### 6. Invoice 3-Way Match

**Purpose:** Automated invoice validation

**States:**

- `received` → `ocr_processing` → `matching` → `matched` / `discrepancy` → `approved` / `rejected`

**Automations:**

- Run OCR if PDF attached
- Execute 3-way match validation
- Auto-approve if matched within tolerance
- Route to approval if discrepancies found

### 7. Payment Processing

**Purpose:** Supplier payment workflow

**States:**

- `scheduled` → `approved` → `processed` → `completed`

**Validations:**

- Verify invoice approved
- Check payment terms
- Validate bank details

### 8. Supplier Return Process

**Purpose:** Return defective/incorrect goods

**States:**

- `draft` → `approved_by_supplier` → `shipped_back` → `received_by_supplier` → `credit_issued` → `completed`

**Automations:**

- Notify supplier at `approved_by_supplier`
- Track shipment at `shipped_back`
- Process credit note at `credit_issued`

---

## API Routes (113 Total)

All routes require authentication and enforce tenant isolation.

### Base Path

All Compras routes are prefixed with `/api/compras`

### 1. Suppliers (15 routes)

| Method | Path                          | Handler                  | Permissions      | Description                 |
| ------ | ----------------------------- | ------------------------ | ---------------- | --------------------------- |
| GET    | `/suppliers`                  | listSuppliers            | purchasing.read  | Query suppliers             |
| POST   | `/suppliers`                  | createSupplier           | purchasing.write | Create supplier             |
| GET    | `/suppliers/:id`              | getSupplier              | purchasing.read  | Get supplier details        |
| PATCH  | `/suppliers/:id`              | updateSupplier           | purchasing.write | Update supplier             |
| DELETE | `/suppliers/:id`              | deleteSupplier           | purchasing.write | Delete supplier             |
| POST   | `/suppliers/:id/score`        | scoreSupplier            | purchasing.write | Calculate supplier score    |
| GET    | `/product-suppliers`          | listProductSuppliers     | purchasing.read  | List product-supplier links |
| POST   | `/product-suppliers`          | createProductSupplier    | purchasing.write | Link product to supplier    |
| GET    | `/product-suppliers/:id`      | getProductSupplier       | purchasing.read  | Get link details            |
| PATCH  | `/product-suppliers/:id`      | updateProductSupplier    | purchasing.write | Update link                 |
| DELETE | `/product-suppliers/:id`      | deleteProductSupplier    | purchasing.write | Remove link                 |
| GET    | `/supplier-price-history`     | listSupplierPriceHistory | purchasing.read  | Query price history         |
| GET    | `/supplier-price-history/:id` | getSupplierPriceHistory  | purchasing.read  | Get price record            |

### 2. Purchase Requisitions (7 routes)

| Method | Path                              | Handler            | Permissions        |
| ------ | --------------------------------- | ------------------ | ------------------ |
| GET    | `/requisitions`                   | listRequisitions   | purchasing.read    |
| POST   | `/requisitions`                   | createRequisition  | purchasing.write   |
| GET    | `/requisitions/:id`               | getRequisition     | purchasing.read    |
| PATCH  | `/requisitions/:id`               | updateRequisition  | purchasing.write   |
| DELETE | `/requisitions/:id`               | deleteRequisition  | purchasing.write   |
| POST   | `/requisitions/:id/approve`       | approveRequisition | purchasing.approve |
| POST   | `/requisitions/:id/convert-to-po` | convertToPO        | purchasing.write   |

### 3. RFQs (13 routes)

**RFQs:**
| Method | Path | Handler | Permissions |
|--------|------|---------|-------------|
| GET | `/rfqs` | listRFQs | purchasing.read |
| POST | `/rfqs` | createRFQ | purchasing.write |
| GET | `/rfqs/:id` | getRFQ | purchasing.read |
| PATCH | `/rfqs/:id` | updateRFQ | purchasing.write |
| DELETE | `/rfqs/:id` | deleteRFQ | purchasing.write |
| POST | `/rfqs/:id/send` | sendRFQ | purchasing.write |
| POST | `/rfqs/:id/select-quote` | selectQuote | purchasing.approve |

**RFQ Quotes:**
| Method | Path | Handler | Permissions |
|--------|------|---------|-------------|
| GET | `/rfq-quotes` | listRFQQuotes | purchasing.read |
| POST | `/rfq-quotes` | createRFQQuote | purchasing.write |
| GET | `/rfq-quotes/:id` | getRFQQuote | purchasing.read |
| PATCH | `/rfq-quotes/:id` | updateRFQQuote | purchasing.write |
| DELETE | `/rfq-quotes/:id` | deleteRFQQuote | purchasing.write |
| POST | `/rfq-quotes/:id/evaluate` | evaluateQuote | purchasing.write |

### 4. Purchase Orders (10 routes)

| Method | Path                               | Handler             | Permissions        |
| ------ | ---------------------------------- | ------------------- | ------------------ |
| GET    | `/purchase-orders`                 | listPurchaseOrders  | purchasing.read    |
| POST   | `/purchase-orders`                 | createPurchaseOrder | purchasing.write   |
| GET    | `/purchase-orders/:id`             | getPurchaseOrder    | purchasing.read    |
| PATCH  | `/purchase-orders/:id`             | updatePurchaseOrder | purchasing.write   |
| DELETE | `/purchase-orders/:id`             | deletePurchaseOrder | purchasing.write   |
| POST   | `/purchase-orders/:id/send`        | sendPOToSupplier    | purchasing.write   |
| POST   | `/purchase-orders/:id/confirm`     | confirmPO           | purchasing.write   |
| POST   | `/purchase-orders/:id/cancel`      | cancelPO            | purchasing.approve |
| GET    | `/purchase-orders/:id/tracking`    | trackPODelivery     | purchasing.read    |
| POST   | `/purchase-orders/:id/acknowledge` | acknowledgePO       | purchasing.write   |

### 5. Goods Receipts (7 routes)

| Method | Path                          | Handler             | Permissions      |
| ------ | ----------------------------- | ------------------- | ---------------- |
| GET    | `/receipts`                   | listReceipts        | purchasing.read  |
| POST   | `/receipts`                   | createReceipt       | purchasing.write |
| GET    | `/receipts/:id`               | getReceipt          | purchasing.read  |
| PATCH  | `/receipts/:id`               | updateReceipt       | purchasing.write |
| DELETE | `/receipts/:id`               | deleteReceipt       | purchasing.write |
| POST   | `/receipts/:id/validate`      | validateReceipt     | purchasing.write |
| POST   | `/receipts/:id/quality-check` | performQualityCheck | purchasing.write |

### 6. Supplier Returns (8 routes)

| Method | Path                        | Handler         | Permissions        |
| ------ | --------------------------- | --------------- | ------------------ |
| GET    | `/returns`                  | listReturns     | purchasing.read    |
| POST   | `/returns`                  | createReturn    | purchasing.write   |
| GET    | `/returns/:id`              | getReturn       | purchasing.read    |
| PATCH  | `/returns/:id`              | updateReturn    | purchasing.write   |
| DELETE | `/returns/:id`              | deleteReturn    | purchasing.write   |
| POST   | `/returns/:id/approve`      | approveReturn   | purchasing.approve |
| POST   | `/returns/:id/ship-back`    | shipReturnBack  | purchasing.write   |
| POST   | `/returns/:id/issue-credit` | issueCreditNote | compras.payments   |

### 7. Purchasing Invoices (10 routes)

| Method | Path                    | Handler           | Permissions        |
| ------ | ----------------------- | ----------------- | ------------------ |
| GET    | `/invoices`             | listInvoices      | purchasing.read    |
| POST   | `/invoices`             | createInvoice     | purchasing.write   |
| GET    | `/invoices/:id`         | getInvoice        | purchasing.read    |
| PATCH  | `/invoices/:id`         | updateInvoice     | purchasing.write   |
| DELETE | `/invoices/:id`         | deleteInvoice     | purchasing.write   |
| POST   | `/invoices/:id/ocr`     | processInvoiceOCR | purchasing.write   |
| POST   | `/invoices/:id/match`   | threeWayMatch     | purchasing.write   |
| POST   | `/invoices/:id/approve` | approveInvoice    | purchasing.approve |
| POST   | `/invoices/:id/reject`  | rejectInvoice     | purchasing.approve |
| POST   | `/invoices/upload`      | uploadInvoice     | purchasing.write   |

### 8. Payments (13 routes)

**Payments:**
| Method | Path | Handler | Permissions |
|--------|------|---------|-------------|
| GET | `/payments` | listPayments | compras.payments |
| POST | `/payments` | createPayment | compras.payments |
| GET | `/payments/:id` | getPayment | compras.payments |
| PATCH | `/payments/:id` | updatePayment | compras.payments |
| DELETE | `/payments/:id` | deletePayment | compras.payments |
| POST | `/payments/:id/confirm` | confirmPayment | compras.payments |
| POST | `/payments/:id/void` | voidPayment | compras.payments |

**Payment Allocations:**
| Method | Path | Handler | Permissions |
|--------|------|---------|-------------|
| GET | `/payment-allocations` | listAllocations | compras.payments |
| POST | `/payment-allocations` | createAllocation | compras.payments |
| GET | `/payment-allocations/:id` | getAllocation | compras.payments |
| PATCH | `/payment-allocations/:id` | updateAllocation | compras.payments |
| DELETE | `/payment-allocations/:id` | deleteAllocation | compras.payments |
| POST | `/payments/:id/allocate` | allocatePayment | compras.payments |

### 9. Employee Expenses (10 routes)

| Method | Path                      | Handler           | Permissions        |
| ------ | ------------------------- | ----------------- | ------------------ |
| GET    | `/expenses`               | listExpenses      | purchasing.read    |
| POST   | `/expenses`               | createExpense     | purchasing.write   |
| GET    | `/expenses/:id`           | getExpense        | purchasing.read    |
| PATCH  | `/expenses/:id`           | updateExpense     | purchasing.write   |
| DELETE | `/expenses/:id`           | deleteExpense     | purchasing.write   |
| POST   | `/expenses/:id/submit`    | submitExpense     | purchasing.write   |
| POST   | `/expenses/:id/approve`   | approveExpense    | purchasing.approve |
| POST   | `/expenses/:id/reject`    | rejectExpense     | purchasing.approve |
| POST   | `/expenses/:id/reimburse` | reimburseExpense  | compras.payments   |
| POST   | `/expenses/:id/allocate`  | allocateToProject | purchasing.write   |

### 10. Quick Purchase (8 routes)

| Method | Path                                         | Handler                   | Permissions      |
| ------ | -------------------------------------------- | ------------------------- | ---------------- |
| POST   | `/quick-purchase/bulk-requisitions`          | bulkCreateRequisitions    | purchasing.write |
| POST   | `/quick-purchase/auto-generate-pos`          | autoGeneratePOs           | purchasing.write |
| POST   | `/quick-purchase/send-po-email`              | sendPOWithInvoiceRequest  | purchasing.write |
| POST   | `/quick-purchase/process-invoice-submission` | processSupplierInvoice    | purchasing.write |
| GET    | `/quick-purchase/ap-summary`                 | getAPSummary              | purchasing.read  |
| POST   | `/quick-purchase/upload-receipt`             | uploadReceipt             | purchasing.write |
| POST   | `/quick-purchase/bulk-payments`              | bulkCreatePayments        | compras.payments |
| GET    | `/quick-purchase/dashboard`                  | getQuickPurchaseDashboard | purchasing.read  |

### 11. Accounts Payable Analytics (10 routes)

| Method | Path                               | Handler                 | Permissions     |
| ------ | ---------------------------------- | ----------------------- | --------------- |
| GET    | `/analytics/ap-summary`            | getAPSummary            | purchasing.read |
| GET    | `/analytics/ap-aging`              | getAPAging              | purchasing.read |
| GET    | `/analytics/cash-flow-forecast`    | getCashFlowForecast     | purchasing.read |
| GET    | `/analytics/supplier-balances`     | getSupplierBalances     | purchasing.read |
| GET    | `/analytics/supplier-performance`  | getSupplierPerformance  | purchasing.read |
| GET    | `/analytics/spend-by-category`     | getSpendByCategory      | purchasing.read |
| GET    | `/analytics/spend-by-supplier`     | getSpendBySupplier      | purchasing.read |
| GET    | `/analytics/demand-forecast`       | getDemandForecast       | purchasing.read |
| GET    | `/analytics/purchase-trends`       | getPurchaseTrends       | purchasing.read |
| GET    | `/analytics/savings-opportunities` | getSavingsOpportunities | purchasing.read |

### 12. Public Routes (NO AUTH) (2 routes)

**Supplier Invoice Portal:**

| Method | Path                                           | Handler       | Auth | Description               |
| ------ | ---------------------------------------------- | ------------- | ---- | ------------------------- |
| GET    | `/api/public/supplier-invoice/:token/validate` | validateToken | None | Validate submission token |
| POST   | `/api/public/supplier-invoice/:token`          | submitInvoice | None | Submit invoice via token  |

**Security:** Token-based authentication with 48-hour expiration

---

## Integrations

### 1. Email Service (SMTP)

**Purpose:** Automated PO emails to suppliers with invoice submission links

**Configuration:**

```env
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-password
EMAIL_FROM=procurement@yourcompany.com
BASE_URL=https://your-domain.com
```

**Features:**

- Professional HTML email templates
- Plain text fallback
- Secure invoice submission links (48-hour expiry)
- Custom messages support
- Email tracking (message IDs)

**Template Example:**

```typescript
import { generatePOEmailTemplate } from "./services/email-templates";

const { subject, html, text } = generatePOEmailTemplate({
  supplierName: "Acme Corp",
  poNumber: "PO-001",
  totalAmount: 1230.0,
  currency: "EUR",
  invoiceSubmissionUrl: "https://app.com/supplier-invoice/token",
  customMessage: "Please expedite this order.",
});
```

**Graceful Degradation:** If SMTP not configured, system logs email details without failing operations.

### 2. OCR Service (Invoice Data Extraction)

**Purpose:** Extract invoice data from PDF/image files using AI

**Technology Stack:**

- **pdf-parse**: Extract text from PDF files
- **OpenAI GPT-4 Vision**: Parse invoice structure and extract fields

**Configuration:**

```env
OPENAI_API_KEY=sk-...your-api-key
```

**Supported Formats:**

- PDF files (`.pdf`)
- Images (`.png`, `.jpg`, `.jpeg`)
- Maximum file size: 10MB

**Extraction Process:**

1. **File Validation**

   - Check file extension and size
   - Prevent directory traversal attacks
   - Validate file exists in uploads directory

2. **PDF Text Extraction**

   ```typescript
   import { extractInvoiceData } from "./services/invoice-ocr.service";

   const result = await extractInvoiceData({
     filePath: "uploads/invoices/invoice.pdf",
     tenantId: "tenant_123",
   });
   ```

3. **AI-Powered Parsing**
   - Sends extracted text to OpenAI
   - Requests structured JSON output
   - Validates with Zod schema

**Extracted Data:**

```typescript
{
  invoiceNumber: string;
  invoiceDate: string; // YYYY-MM-DD
  supplierName: string;
  totalAmount: number;
  currency?: 'EUR' | 'USD' | 'GBP';
  lineItems: Array<{
    description: string;
    quantity: number;
    unitPrice: number;
    total: number;
  }>;
  confidence: number; // 0-1
  extractionMethod: 'pdf-parse+openai' | 'openai-vision';
}
```

**Confidence Scores:**

- 0.9-1.0: High confidence, auto-approve candidate
- 0.7-0.9: Medium confidence, review recommended
- < 0.7: Low confidence, manual review required

**Error Handling:**

- Invalid file format → Clear error message
- OCR failure → Returns error without breaking workflow
- Missing OPENAI_API_KEY → Graceful error with setup instructions

### 3. Public Supplier Portal

**Purpose:** Secure, token-based invoice submission for suppliers

**Security Model:**

- **Token Generation:** UUID v4 tokens generated when PO is sent
- **Token Expiration:** 48 hours from generation
- **One-Time Use:** Token can be used multiple times (allows corrections)
- **Rate Limiting:** Applied to prevent abuse
- **No Authentication:** Suppliers don't need accounts

**Workflow:**

```
┌─────────────────────────────────────────────────────────┐
│ 1. Company sends PO to supplier via email               │
│    - Includes secure submission link with token         │
│    - Token: https://app.com/supplier-invoice/{token}    │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ 2. Supplier clicks link and accesses public form        │
│    - No login required                                   │
│    - Token validated server-side                         │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ 3. Supplier fills form and uploads invoice PDF          │
│    - Invoice number, date, amount                        │
│    - PDF/image attachment (optional)                     │
└────────────────────────┬────────────────────────────────┘
                         │
┌────────────────────────▼────────────────────────────────┐
│ 4. System processes submission                           │
│    - Creates purchasing_invoice record                   │
│    - Runs OCR if file attached                           │
│    - Executes 3-way match validation                     │
│    - Routes to approval workflow                         │
└──────────────────────────────────────────────────────────┘
```

**Validation Schema:**

```typescript
const submitInvoiceSchema = z.object({
  invoiceNumber: z.string().min(1),
  invoiceDate: z.string().refine((val) => !isNaN(Date.parse(val))),
  totalAmount: z
    .string()
    .transform((val) => parseFloat(val))
    .refine((val) => val > 0),
  currency: z.string().default("EUR"),
  notes: z.string().optional(),
});
```

**File Upload:**

- Stored in `uploads/invoices/` directory
- Filename format: `{poCode}_{timestamp}.pdf`
- Cleanup: Temp files removed on error

**API Endpoints:**

```typescript
// Validate token
GET /api/public/supplier-invoice/:token/validate
Response: { valid: true, poNumber: "PO-001", message: "..." }

// Submit invoice
POST /api/public/supplier-invoice/:token
Body: FormData with invoice fields + file
Response: { success: true, invoice: {...}, message: "..." }
```

**Error Responses:**

- 404: Invalid token / Token not found
- 410: Token expired
- 400: Validation errors
- 500: Server errors

---

## Setup & Configuration

### 1. Environment Variables

Create a `.env` file with the following variables:

```env
# Database (automatically configured by Replit)
DATABASE_URL=postgresql://...

# SMTP Email Configuration (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
EMAIL_FROM=procurement@yourcompany.com

# OpenAI for OCR (Optional but recommended)
OPENAI_API_KEY=sk-...your-api-key

# Base URL for Invoice Submission Links
BASE_URL=https://your-domain.com
# Or use REPLIT_DOMAINS for automatic domain
REPLIT_DOMAINS=your-repl-name.replit.app

# Application Settings
NODE_ENV=production
PORT=5000
```

**Required Variables:**

- `DATABASE_URL` - PostgreSQL connection (auto-configured on Replit)

**Optional but Recommended:**

- `OPENAI_API_KEY` - Enables OCR invoice extraction
- `SMTP_*` - Enables email sending to suppliers
- `BASE_URL` or `REPLIT_DOMAINS` - For public invoice submission links

### 2. Database Setup

**Using Drizzle ORM (Recommended):**

```bash
# Generate database schema
npm run db:generate

# Push schema to database
npm run db:push

# If there are warnings about data loss, force push
npm run db:push --force
```

**Manual Setup:**
The Compras module entities are already defined in `shared/schema.ts`. The database will be automatically created when you run migrations.

### 3. Module Registration

The Compras module is automatically registered with AssistOS. Verify registration:

```typescript
// packages/modules/register-modules.ts
import { ComprasModule } from "./compras/index.js";

export function registerModules() {
  const modules = [
    new ComprasModule(),
    // ... other modules
  ];
  return modules;
}
```

### 4. Permissions Setup

Create tenant-specific permissions in the database:

```sql
-- Insert Compras permissions
INSERT INTO permissions (key, name, description, module)
VALUES
  ('purchasing.read', 'View Procurement Data', 'View suppliers, POs, invoices', 'compras'),
  ('purchasing.write', 'Create/Edit Procurement Data', 'Create and edit procurement records', 'compras'),
  ('purchasing.delete', 'Delete Procurement Data', 'Delete suppliers, POs, etc.', 'compras'),
  ('purchasing.approve', 'Approve Requisitions & Invoices', 'Approve purchase requests and invoices', 'compras'),
  ('compras.payments', 'Manage Supplier Payments', 'Create and manage payments', 'compras');
```

Assign permissions to roles using the AssistOS admin interface.

### 5. First-Time Setup Checklist

- [ ] Database migrated successfully
- [ ] Environment variables configured
- [ ] SMTP tested (send test email)
- [ ] OpenAI API key validated (test OCR)
- [ ] Permissions created and assigned
- [ ] First supplier created
- [ ] Test purchase flow executed
- [ ] Public invoice portal tested

### 6. Testing the Setup

**Test Supplier Creation:**

```bash
curl -X POST http://localhost:5000/api/compras/suppliers \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "code": "SUP-001",
    "name": "Test Supplier",
    "email": "supplier@example.com",
    "type": "approved"
  }'
```

**Test AI Tool (via Agent):**

```
User: "List all active suppliers"
Agent: *Executes list_suppliers tool*
Response: "Found 1 supplier: Test Supplier (SUP-001)"
```

---

## Usage Examples

### Example 1: Quick Purchase Flow

**Scenario:** Order office supplies from approved supplier

```
User: "I need to order 50 notebooks and 100 pens urgently"

Agent: *Uses bulk_create_purchase_requests*
Response: "Created requisition REQ-001 with 2 items (urgent priority)"

User: "Generate the purchase order"

Agent: *Uses auto_generate_purchase_orders*
Response: "Generated PO-001 for supplier Office Depot (€245.00)"

User: "Send it to the supplier"

Agent: *Uses send_po_with_invoice_request*
Response: "PO-001 sent to supplier@officedepot.com with invoice submission link (expires in 48h)"

[Supplier submits invoice via public portal]

Agent: *Auto-processes submission via process_supplier_invoice_submission*
Response: "Invoice INV-2024-001 received. 3-way match: PASSED. Auto-approved."

User: "Schedule the payment"

Agent: *Uses create_payment and allocate_payment_to_invoices*
Response: "Payment scheduled for €245.00, due in 30 days"
```

### Example 2: RFQ Process

**Scenario:** Get quotes from 3 suppliers for bulk purchase

```
User: "Create an RFQ for 1000 units of product XYZ, send to our top 3 suppliers, deadline in 7 days"

Agent: *Uses create_rfq with supplier selection*
Response: "RFQ-001 created and sent to Acme Corp, Tech Solutions, Global Supplies"

[Suppliers respond with quotes]

User: "Evaluate the quotes we received"

Agent: *Uses evaluate_rfq_quotes*
Response: "Evaluated 3 quotes:
1. Acme Corp: €8,500 (Score: 4.72) - RECOMMENDED
2. Global Supplies: €8,800 (Score: 4.21)
3. Tech Solutions: €9,200 (Score: 3.85)"

User: "Select the best quote"

Agent: *Uses select_best_quote*
Response: "Acme Corp quote selected. Ready to generate PO."
```

### Example 3: Invoice OCR & 3-Way Match

**Scenario:** Process supplier invoice with OCR

```
User: "Process the invoice that was just uploaded"

Agent: *Uses process_invoice_ocr*
Response: "OCR extracted with 94% confidence:
- Invoice: INV-2024-042
- Supplier: Acme Corp
- Total: €1,230.00
- 2 line items"

Agent: *Auto-executes three_way_match_validation*
Response: "3-way match validation:
⚠️ DISCREPANCY FOUND
- PO Total: €1,200.00
- Invoice Total: €1,230.00
- Difference: €30.00 (2.5%)
- Reason: Additional shipping charges

Action required: Approve with override or reject"

User: "Approve it with override - shipping charge is acceptable"

Agent: *Uses approve_invoice with override*
Response: "Invoice approved with override. Reason logged: Shipping charges acceptable"
```

### Example 4: Supplier Performance Analysis

**Scenario:** Evaluate supplier before contract renewal

```
User: "Analyze our spending with Acme Corp over the last 12 months"

Agent: *Uses spend_analysis_by_supplier*
Response: "Acme Corp analysis (Jan-Dec 2024):
- Total Spend: €125,000
- Purchase Orders: 45
- Average Order Value: €2,778
- On-Time Delivery: 96%
- Quality Score: 4.5/5"

User: "Score this supplier"

Agent: *Uses score_supplier*
Response: "Supplier Score Analysis:
- Price Stability: 4.5/5 (12 price records analyzed)
- Delivery Performance: 5.0/5 (avg 7-day lead time)
- Overall Score: 4.75/5
Recommendation: PREFERRED SUPPLIER - Excellent performance"
```

### Example 5: Demand Forecasting

**Scenario:** Determine reorder quantities

```
User: "What should I order for product ABC based on our purchase history?"

Agent: *Uses forecast_demand*
Response: "Demand Forecast for Product ABC:
- Historical Analysis: 12 months, 24 data points
- Average Monthly Demand: 120.5 units
- 3-Month Forecast: 362 units
- Trend: Increasing (+15%)
- Confidence: High

Recommendations:
- Reorder Point: 181 units
- Safety Stock: 60 units
- Suggested Order Quantity: 400 units"
```

---

## Best Practices

### 1. Supplier Management

**DO:**

- ✅ Regularly update supplier ratings based on performance
- ✅ Maintain accurate contact information
- ✅ Set realistic lead times based on historical data
- ✅ Use supplier categorization (preferred, approved, trial, blocked)
- ✅ Track supplier pricing history for trend analysis

**DON'T:**

- ❌ Create duplicate suppliers (use search before creating)
- ❌ Skip supplier scoring - it's crucial for RFQ evaluation
- ❌ Ignore supplier communications (acknowledgments, confirmations)

### 2. Purchase Orders

**DO:**

- ✅ Always include detailed line items with accurate quantities
- ✅ Set clear payment and delivery terms
- ✅ Use the email integration to automatically notify suppliers
- ✅ Track PO acknowledgment from suppliers
- ✅ Monitor delivery status regularly

**DON'T:**

- ❌ Create POs without approved requisitions (unless quick purchase)
- ❌ Modify PO after supplier acknowledgment (create amendment instead)
- ❌ Skip expected delivery dates - needed for tracking

### 3. Invoice Processing

**DO:**

- ✅ Use OCR for invoice data extraction - saves time and reduces errors
- ✅ Always run 3-way match validation before approval
- ✅ Document override reasons when approving discrepant invoices
- ✅ Set realistic tolerance percentages (3-5% typical)
- ✅ Process invoices promptly to avoid late payment penalties

**DON'T:**

- ❌ Approve invoices with critical discrepancies without investigation
- ❌ Skip receipt validation - it's part of 3-way match
- ❌ Manually enter invoice data if OCR is available

### 4. Payment Processing

**DO:**

- ✅ Batch payments by supplier to reduce transaction fees
- ✅ Respect payment terms to maintain supplier relationships
- ✅ Allocate payments to oldest invoices first (FIFO)
- ✅ Monitor accounts payable aging regularly
- ✅ Use the AP summary dashboard for cash flow planning

**DON'T:**

- ❌ Pay invoices before approval
- ❌ Create payment without proper allocation
- ❌ Ignore overdue payments - can damage supplier relationships

### 5. Quick Purchase Flow

**DO:**

- ✅ Use for regular, low-risk purchases
- ✅ Verify supplier has email configured before sending PO
- ✅ Monitor supplier invoice submissions
- ✅ Set up email reminders for pending invoices

**DON'T:**

- ❌ Use quick purchase for high-value or complex orders
- ❌ Skip approval workflows for purchases above threshold
- ❌ Forget to validate invoice submission tokens

### 6. Data Quality

**DO:**

- ✅ Use consistent product codes across all transactions
- ✅ Maintain accurate UOM (units of measure)
- ✅ Record batch/serial numbers for traceability
- ✅ Document all discrepancies with clear reasons
- ✅ Keep notes updated for audit trail

**DON'T:**

- ❌ Leave financial fields blank or zero
- ❌ Use generic descriptions ("misc item")
- ❌ Skip quality control on receipts

### 7. Workflow Automation

**DO:**

- ✅ Configure approval thresholds based on risk
- ✅ Use AI tools for routine tasks (scoring, matching, forecasting)
- ✅ Monitor workflow state transitions for stuck records
- ✅ Set up notifications for critical workflow states

**DON'T:**

- ❌ Override workflows without valid business reason
- ❌ Skip automation setup - it saves significant time
- ❌ Ignore workflow validation errors

### 8. Security & Compliance

**DO:**

- ✅ Enforce permission model strictly
- ✅ Rotate invoice submission tokens regularly
- ✅ Audit high-value transactions
- ✅ Backup financial data regularly
- ✅ Review override approvals monthly

**DON'T:**

- ❌ Share invoice submission links publicly
- ❌ Grant payment permissions to unauthorized users
- ❌ Skip financial reconciliation

---

## Troubleshooting

### Common Issues

#### 1. Email Not Sending

**Symptoms:** PO emails fail to send, error in logs

**Solutions:**

```bash
# Check SMTP configuration
echo $SMTP_HOST
echo $SMTP_PORT
echo $SMTP_USER

# Test SMTP connection
node -e "
const nodemailer = require('nodemailer');
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: process.env.SMTP_PORT,
  auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
});
transporter.verify().then(console.log).catch(console.error);
"
```

**Common Causes:**

- Missing SMTP credentials
- Firewall blocking port 587
- Gmail requiring app-specific password
- Invalid EMAIL_FROM address

#### 2. OCR Extraction Fails

**Symptoms:** "OCR extraction failed" error

**Solutions:**

```bash
# Verify OpenAI API key
echo $OPENAI_API_KEY

# Check file permissions
ls -la uploads/invoices/

# Test OpenAI connection
curl https://api.openai.com/v1/models \
  -H "Authorization: Bearer $OPENAI_API_KEY"
```

**Common Causes:**

- Missing or invalid OPENAI_API_KEY
- File not in allowed directory (uploads/)
- Unsupported file format
- File too large (>10MB)
- Network issues connecting to OpenAI

#### 3. 3-Way Match Discrepancies

**Symptoms:** Invoices stuck in "discrepancy" status

**Debug Steps:**

```sql
-- Check invoice vs PO amounts
SELECT
  i.code as invoice_code,
  i.total_amount as invoice_total,
  po.total_amount as po_total,
  i.three_way_match_status,
  i.po_discrepancy_amount
FROM supplier_invoices i
JOIN purchase_orders po ON i.po_id = po.id
WHERE i.three_way_match_status = 'discrepancy';
```

**Common Causes:**

- Price changes after PO creation
- Unexpected shipping/handling charges
- Tax calculation differences
- Quantity discrepancies from receipt
- Wrong tolerance percentage

**Solutions:**

- Adjust tolerance percentage if reasonable
- Approve with override and document reason
- Contact supplier to issue credit note
- Reject invoice and request correction

#### 4. Public Portal Token Invalid

**Symptoms:** Supplier cannot access invoice submission form

**Debug:**

```sql
-- Check token expiration
SELECT
  code,
  invoice_submission_token,
  invoice_submission_token_expires_at,
  CASE
    WHEN invoice_submission_token_expires_at < NOW()
    THEN 'EXPIRED'
    ELSE 'VALID'
  END as token_status
FROM purchase_orders
WHERE invoice_submission_token = 'token-value';
```

**Solutions:**

- Regenerate token and resend email
- Extend expiration if needed
- Verify BASE_URL or REPLIT_DOMAINS is correct

#### 5. Payment Allocation Errors

**Symptoms:** Cannot allocate payment to invoice

**Common Causes:**

- Payment amount < invoice remaining amount
- Invoice not approved
- Invoice already fully paid
- Supplier mismatch

**Debug:**

```sql
-- Check invoice payment status
SELECT
  code,
  invoice_number,
  total_amount,
  paid_amount,
  remaining_amount,
  status,
  supplier_id
FROM supplier_invoices
WHERE id = 'invoice-id';
```

#### 6. Performance Issues

**Symptoms:** Slow queries, timeouts

**Optimization:**

```sql
-- Add indexes for common queries
CREATE INDEX idx_purchase_orders_tenant_status
  ON purchase_orders(tenant_id, status);

CREATE INDEX idx_supplier_invoices_tenant_status
  ON supplier_invoices(tenant_id, status);

CREATE INDEX idx_suppliers_tenant_code
  ON suppliers(tenant_id, code);

-- Analyze query performance
EXPLAIN ANALYZE
SELECT * FROM purchase_orders
WHERE tenant_id = 'tenant-id' AND status = 'approved';
```

#### 7. Data Validation Errors

**Symptoms:** "Validation error" when creating records

**Common Issues:**

- Invalid enum values (check entity definitions)
- Missing required fields
- Decimal/numeric type mismatches
- Date format issues (use YYYY-MM-DD)

**Validation Schema Reference:**

```typescript
// Check route schemas in packages/modules/compras/routes/schemas.ts
import { createSupplierSchema } from "./routes/schemas";

// Validate before sending
const result = createSupplierSchema.safeParse(data);
if (!result.success) {
  console.error(result.error.format());
}
```

### Getting Help

1. **Check Logs:**

   ```bash
   # Application logs
   npm run dev

   # Database logs
   tail -f /tmp/logs/database.log
   ```

2. **Enable Debug Mode:**

   ```env
   NODE_ENV=development
   DEBUG=compras:*
   ```

3. **Community Support:**

   - AssistOS Discord: [link]
   - GitHub Issues: [link]
   - Documentation: [link]

4. **Report Bugs:**
   Include:
   - Steps to reproduce
   - Expected vs actual behavior
   - Relevant log excerpts
   - Environment (dev/production)
   - Module version

---

## License

MIT License - See LICENSE file for details

---

## Contributing

Contributions welcome! Please:

1. Fork the repository
2. Create feature branch
3. Add tests for new features
4. Submit pull request with clear description

---

**Version:** 1.0.0  
**Last Updated:** October 31, 2025  
**Module ID:** `compras`  
**Category:** `operacoes`
