// Sprint 1 - Test Setup
// Configures test environment for Vitest

import { beforeAll, afterAll, afterEach } from 'vitest';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import type { Application } from 'express';
import request from 'supertest';
import { tenants, users, userTenants, notifications } from '../../../shared/schema';
import { eq, and } from 'drizzle-orm';

// Mock environment variables for tests
process.env.OPENAI_API_KEY = 'sk-test-mock-key';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/test';
process.env.NODE_ENV = 'test';
process.env.SESSION_SECRET = 'test-session-secret';

// Setup: Run before all tests
beforeAll(async () => {
  console.log('🧪 Test environment initialized');
});

// Cleanup: Run after all tests
afterAll(async () => {
  console.log('✅ Test environment cleaned up');
});

// Cleanup: Run after each test to ensure isolation
afterEach(async () => {
  // Clean up test data in reverse order of dependencies
  await db.delete(notifications).where(sql`${notifications.id} LIKE 'test-%'`);
  await db.delete(userTenants).where(sql`${userTenants.userId} LIKE 'test-%'`);
  await db.delete(users).where(sql`${users.id} LIKE 'test-%'`);
  
  // Clean up entity embeddings
  await db.delete(supplierEmbeddings).where(sql`${supplierEmbeddings.id} LIKE 'test-%' OR ${supplierEmbeddings.supplierId} LIKE 'test-%'`);
  await db.delete(invoiceEmbeddings).where(sql`${invoiceEmbeddings.id} LIKE 'test-%' OR ${invoiceEmbeddings.invoiceId} LIKE 'test-%'`);
  await db.delete(projectEmbeddings).where(sql`${projectEmbeddings.id} LIKE 'test-%' OR ${projectEmbeddings.projectId} LIKE 'test-%'`);
  await db.delete(clientEmbeddings).where(sql`${clientEmbeddings.id} LIKE 'test-%' OR ${clientEmbeddings.clientId} LIKE 'test-%'`);
  await db.delete(productEmbeddings).where(sql`${productEmbeddings.id} LIKE 'test-%' OR ${productEmbeddings.productId} LIKE 'test-%'`);
  
  // Clean up entities
  await db.delete(purchasingInvoices).where(sql`${purchasingInvoices.id} LIKE 'test-%'`);
  await db.delete(suppliers).where(sql`${suppliers.id} LIKE 'test-%'`);
  await db.delete(projects).where(sql`${projects.id} LIKE 'test-%'`);
  await db.delete(clients).where(sql`${clients.id} LIKE 'test-%'`);
  await db.delete(products).where(sql`${products.id} LIKE 'test-%'`);
  
  await db.delete(tenants).where(sql`${tenants.id} LIKE 'test-%'`);
});

// ==================== EXPRESS APP BOOTSTRAP ====================

let cachedApp: Application | null = null;

export async function getTestApp(): Promise<Application> {
  if (cachedApp) return cachedApp;
  
  const { default: app } = await import('../index.js');
  cachedApp = app;
  return app;
}

// ==================== DATABASE FIXTURES ====================

export async function createTestTenant(tenantData?: Partial<typeof tenants.$inferInsert>) {
  const [tenant] = await db.insert(tenants).values({
    id: `test-tenant-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    name: tenantData?.name || 'Test Tenant',
    slug: tenantData?.slug || `test-tenant-${Date.now()}`,
    status: 'active',
    ...tenantData
  }).returning();
  
  return tenant;
}

export async function createTestUser(tenantId: string, userData?: Partial<typeof users.$inferInsert>) {
  const [user] = await db.insert(users).values({
    id: `test-user-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    email: userData?.email || `test-${Date.now()}@example.com`,
    firstName: userData?.firstName || 'Test',
    lastName: userData?.lastName || 'User',
    password: userData?.password || 'test-password',
    isActive: true,
    ...userData
  }).returning();
  
  // Create user-tenant relationship
  await db.insert(userTenants).values({
    userId: user.id,
    tenantId,
    role: 'user',
    permissions: null,
    scopes: null
  });
  
  return user;
}

export async function createTestNotification(
  tenantId: string,
  userId: string,
  notificationData?: Partial<typeof notifications.$inferInsert>
) {
  const [notification] = await db.insert(notifications).values({
    id: `test-notif-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    tenantId,
    userId,
    type: notificationData?.type || 'test_notification',
    title: notificationData?.title || 'Test Notification',
    message: notificationData?.message || 'This is a test notification',
    read: notificationData?.read || false,
    ...notificationData
  }).returning();
  
  return notification;
}

// ==================== AUTHENTICATION HELPERS ====================

export interface AuthenticatedRequest {
  get: (url: string) => request.Test;
  post: (url: string) => request.Test;
  put: (url: string) => request.Test;
  patch: (url: string) => request.Test;
  delete: (url: string) => request.Test;
}

export function createAuthenticatedAgent(
  app: Application,
  tenantId: string,
  userId: string
): AuthenticatedRequest {
  return {
    get: (url: string) => request(app)
      .get(url)
      .set('X-Test-Tenant-Id', tenantId)
      .set('X-Test-User-Id', userId),
    post: (url: string) => request(app)
      .post(url)
      .set('X-Test-Tenant-Id', tenantId)
      .set('X-Test-User-Id', userId),
    put: (url: string) => request(app)
      .put(url)
      .set('X-Test-Tenant-Id', tenantId)
      .set('X-Test-User-Id', userId),
    patch: (url: string) => request(app)
      .patch(url)
      .set('X-Test-Tenant-Id', tenantId)
      .set('X-Test-User-Id', userId),
    delete: (url: string) => request(app)
      .delete(url)
      .set('X-Test-Tenant-Id', tenantId)
      .set('X-Test-User-Id', userId),
  };
}

// ==================== TEST CONTEXT ====================

export function createTestContext(tenantId: string, userId: string) {
  return {
    tenantId,
    userId,
    permissions: ['*'], // Full permissions for tests
    metadata: {}
  };
}

// ==================== MOCK OPENAI ====================

export const mockOpenAIEmbedding = Array(1536).fill(0).map(() => Math.random() * 2 - 1);

export const mockOpenAIResponse = {
  data: [{ embedding: mockOpenAIEmbedding }],
  usage: { prompt_tokens: 10, total_tokens: 10 }
};

// ==================== ENTITY FIXTURES (Sprint 1 Regression Tests) ====================

import { 
  suppliers, 
  purchasingInvoices, 
  projects, 
  clients, 
  products,
  supplierEmbeddings,
  invoiceEmbeddings,
  projectEmbeddings,
  clientEmbeddings,
  productEmbeddings
} from '../../../shared/schema';

/**
 * Creates a test supplier with minimal required fields
 */
export async function createTestSupplier(
  tenantId: string,
  environment: 'production' | 'sandbox' = 'production',
  supplierData?: Partial<typeof suppliers.$inferInsert>
) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const [supplier] = await db.insert(suppliers).values({
    id: `test-supplier-${uniqueId}`,
    tenantId,
    environment,
    code: supplierData?.code || `SUP-${uniqueId}`,
    name: supplierData?.name || `Test Supplier ${uniqueId}`,
    taxId: supplierData?.taxId || `999${uniqueId.substring(0, 6)}`,
    category: supplierData?.category || 'services',
    ...supplierData
  }).returning();
  
  return supplier;
}

/**
 * Creates a test invoice with minimal required fields
 */
export async function createTestInvoice(
  tenantId: string,
  supplierId: string,
  environment: 'production' | 'sandbox' = 'production',
  invoiceData?: Partial<typeof purchasingInvoices.$inferInsert>
) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const [invoice] = await db.insert(purchasingInvoices).values({
    id: `test-invoice-${uniqueId}`,
    tenantId,
    environment,
    supplierId,
    invoiceNumber: invoiceData?.invoiceNumber || `INV-${uniqueId}`,
    invoiceDate: invoiceData?.invoiceDate || new Date().toISOString().split('T')[0],
    totalAmount: invoiceData?.totalAmount || '1000.00',
    currency: invoiceData?.currency || 'EUR',
    status: invoiceData?.status || 'pending',
    ...invoiceData
  }).returning();
  
  return invoice;
}

/**
 * Creates a test project with minimal required fields
 */
export async function createTestProject(
  tenantId: string,
  environment: 'production' | 'sandbox' = 'production',
  projectData?: Partial<typeof projects.$inferInsert>
) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const [project] = await db.insert(projects).values({
    id: `test-project-${uniqueId}`,
    tenantId,
    environment,
    projectCode: projectData?.projectCode || `PROJ-${uniqueId}`,
    name: projectData?.name || `Test Project ${uniqueId}`,
    clientName: projectData?.clientName || 'Test Client',
    status: projectData?.status || 'active',
    projectType: projectData?.projectType || 'consulting',
    ...projectData
  }).returning();
  
  return project;
}

/**
 * Creates a test client with minimal required fields
 */
export async function createTestClient(
  tenantId: string,
  environment: 'production' | 'sandbox' = 'production',
  clientData?: Partial<typeof clients.$inferInsert>
) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const [client] = await db.insert(clients).values({
    id: `test-client-${uniqueId}`,
    tenantId,
    environment,
    code: clientData?.code || `CLI-${uniqueId}`,
    name: clientData?.name || `Test Client ${uniqueId}`,
    nif: clientData?.nif || `999${uniqueId.substring(0, 6)}`,
    ...clientData
  }).returning();
  
  return client;
}

/**
 * Creates a test product with minimal required fields
 */
export async function createTestProduct(
  tenantId: string,
  environment: 'production' | 'sandbox' = 'production',
  productData?: Partial<typeof products.$inferInsert>
) {
  const uniqueId = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const [product] = await db.insert(products).values({
    id: `test-product-${uniqueId}`,
    tenantId,
    environment,
    code: productData?.code || `PROD-${uniqueId}`,
    name: productData?.name || `Test Product ${uniqueId}`,
    category: productData?.category || 'general',
    isActive: true,
    ...productData
  }).returning();
  
  return product;
}
