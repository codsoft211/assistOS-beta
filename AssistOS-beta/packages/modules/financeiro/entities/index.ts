/**
 * FinanceiroModule - Entity Definitions
 * 
 * Core financial entities: invoices, payments, bank accounts, tax rates
 */

import type { EntityDefinition } from '../../base/module.interface';

export const financeiroEntities: EntityDefinition[] = [
  {
    name: 'invoices',
    schema: {
      fields: [
        { name: 'id', type: 'text', required: true },
        { name: 'tenantId', type: 'text', required: true },
        { name: 'invoiceNumber', type: 'text', required: true },
        { name: 'clientId', type: 'text', required: false },
        { name: 'issueDate', type: 'date', required: true },
        { name: 'dueDate', type: 'date', required: true },
        { name: 'subtotal', type: 'decimal', required: true },
        { name: 'taxAmount', type: 'decimal', required: true },
        { name: 'totalAmount', type: 'decimal', required: true },
        { name: 'status', type: 'text', required: true },
        { name: 'items', type: 'json', required: true },
        { name: 'notes', type: 'text', required: false },
      ],
      timestamps: true,
      tenantIsolation: true
    },
    relationships: [
      { type: 'belongsTo', target: 'clients', foreignKey: 'clientId' },
      { type: 'hasMany', target: 'payments', foreignKey: 'invoiceId' },
      { type: 'hasMany', target: 'invoiceItems', foreignKey: 'invoiceId' }
    ]
  },
  
  {
    name: 'payments',
    schema: {
      fields: [
        { name: 'id', type: 'text', required: true },
        { name: 'tenantId', type: 'text', required: true },
        { name: 'invoiceId', type: 'text', required: false },
        { name: 'paymentDate', type: 'date', required: true },
        { name: 'amount', type: 'decimal', required: true },
        { name: 'paymentMethod', type: 'text', required: true },
        { name: 'reference', type: 'text', required: false },
        { name: 'status', type: 'text', required: true },
        { name: 'notes', type: 'text', required: false },
      ],
      timestamps: true,
      tenantIsolation: true
    },
    relationships: [
      { type: 'belongsTo', target: 'invoices', foreignKey: 'invoiceId' }
    ]
  },
  
  {
    name: 'bankAccounts',
    schema: {
      fields: [
        { name: 'id', type: 'text', required: true },
        { name: 'tenantId', type: 'text', required: true },
        { name: 'accountName', type: 'text', required: true },
        { name: 'bankName', type: 'text', required: true },
        { name: 'accountNumber', type: 'text', required: true },
        { name: 'iban', type: 'text', required: false },
        { name: 'swift', type: 'text', required: false },
        { name: 'currency', type: 'text', required: true },
        { name: 'balance', type: 'decimal', required: true },
        { name: 'status', type: 'text', required: true },
      ],
      timestamps: true,
      tenantIsolation: true
    },
    relationships: [
      { type: 'hasMany', target: 'bankTransactions', foreignKey: 'accountId' }
    ]
  },
  
  {
    name: 'taxRates',
    schema: {
      fields: [
        { name: 'id', type: 'text', required: true },
        { name: 'tenantId', type: 'text', required: true },
        { name: 'name', type: 'text', required: true },
        { name: 'rate', type: 'decimal', required: true },
        { name: 'type', type: 'text', required: true },
        { name: 'isDefault', type: 'boolean', required: true },
        { name: 'isActive', type: 'boolean', required: true },
      ],
      timestamps: true,
      tenantIsolation: true
    },
    relationships: []
  }
];
