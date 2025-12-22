import { Page } from '@playwright/test';
import { db } from '../apps/api/db';
import { users, tenants, userTenants, userGmailAccounts, oauthStates, tenantWorkflows, workflowExecutions } from '../shared/schema';
import { eq, and, desc } from 'drizzle-orm';
import bcrypt from 'bcrypt';
import { workflowScheduler } from '../packages/execution/WorkflowScheduler';

export interface TestUser {
  id: string;
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  tenantId: string;
  tenantName: string;
}

/**
 * Create a test user with tenant for testing
 */
export async function createTestUser(
  email: string = `test-${Date.now()}@example.com`,
  password: string = 'TestPassword123!'
): Promise<TestUser> {
  const hashedPassword = await bcrypt.hash(password, 10);
  
  // Create user
  const [user] = await db.insert(users).values({
    email,
    firstName: 'Test',
    lastName: 'User',
    password: hashedPassword,
    isActive: true,
  }).returning();

  // Create tenant
  const [tenant] = await db.insert(tenants).values({
    name: `Test Tenant ${Date.now()}`,
    slug: `test-${Date.now()}`,
    status: 'active',
  }).returning();

  // Add user to tenant
  await db.insert(userTenants).values({
    userId: user.id,
    tenantId: tenant.id,
    role: 'owner',
  });

  return {
    id: user.id,
    email,
    password,
    firstName: user.firstName,
    lastName: user.lastName,
    tenantId: tenant.id,
    tenantName: tenant.name,
  };
}

/**
 * Delete test user and all related data
 */
export async function deleteTestUser(userId: string) {
  // Delete user (cascades to tenants, gmail accounts, etc.)
  await db.delete(users).where(eq(users.id, userId));
}

/**
 * Login as a test user via UI
 */
export async function loginAsUser(page: Page, email: string, password: string) {
  await page.goto('/login');
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  
  // Wait for redirect after successful login
  await page.waitForURL('/dashboard', { timeout: 10000 });
}

/**
 * Create a Gmail account for a user (for testing)
 */
export async function createGmailAccount(
  userId: string,
  tenantId: string,
  email: string,
  isPrimary: boolean = false
) {
  const [account] = await db.insert(userGmailAccounts).values({
    userId,
    tenantId,
    email,
    displayName: email,
    accessToken: JSON.stringify({
      encrypted: 'test-encrypted-access-token',
      iv: 'test-iv',
      authTag: 'test-auth-tag'
    }),
    refreshToken: JSON.stringify({
      encrypted: 'test-encrypted-refresh-token',
      iv: 'test-iv',
      authTag: 'test-auth-tag'
    }),
    expiresAt: new Date(Date.now() + 3600 * 1000),
    scopes: ['https://www.googleapis.com/auth/gmail.send'],
    isPrimary,
    isActive: true,
  }).returning();

  return account;
}

/**
 * Delete all Gmail accounts for a user
 */
export async function deleteAllGmailAccounts(userId: string, tenantId: string) {
  await db.delete(userGmailAccounts)
    .where(and(
      eq(userGmailAccounts.userId, userId),
      eq(userGmailAccounts.tenantId, tenantId)
    ));
}

/**
 * Create an OAuth state for testing
 */
export async function createOAuthState(
  userId: string,
  tenantId: string,
  state: string
) {
  const [oauthState] = await db.insert(oauthStates).values({
    userId,
    tenantId,
    provider: 'gmail',
    state,
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  }).returning();

  return oauthState;
}

/**
 * Deactivate a user (set isActive = false)
 */
export async function deactivateUser(userId: string) {
  await db.update(users)
    .set({ isActive: false })
    .where(eq(users.id, userId));
}

/**
 * Count Gmail accounts for a user
 */
export async function countGmailAccounts(userId: string, tenantId: string): Promise<number> {
  const accounts = await db.query.userGmailAccounts.findMany({
    where: and(
      eq(userGmailAccounts.userId, userId),
      eq(userGmailAccounts.tenantId, tenantId)
    ),
  });
  return accounts.length;
}

/**
 * Check if OAuth state exists
 */
export async function oauthStateExists(state: string): Promise<boolean> {
  const record = await db.query.oauthStates.findFirst({
    where: eq(oauthStates.state, state),
  });
  return !!record;
}

/**
 * Create a test workflow for testing
 */
export async function createTestWorkflow(
  tenantId: string,
  userId: string,
  config: {
    name: string;
    steps: Array<{
      action: string;
      config: Record<string, any>;
    }>;
  }
): Promise<string> {
  // Convert steps to workflow format
  const steps = config.steps.map((step, index) => ({
    id: `step-${index + 1}`,
    type: step.action, // 'type' in DB corresponds to 'action' in executor
    name: `Step ${index + 1}`,
    config: step.config,
    nextSteps: index < config.steps.length - 1 ? [`step-${index + 2}`] : [],
    order: index + 1,
  }));

  const [workflow] = await db.insert(tenantWorkflows).values({
    tenantId,
    name: config.name,
    description: 'Test workflow',
    steps,
    triggerType: 'manual',
    isActive: true,
    createdBy: userId,
  }).returning();

  return workflow.id;
}

/**
 * Trigger workflow execution via workflowScheduler
 */
export async function triggerWorkflow(
  workflowId: string,
  tenantId: string,
  userId: string,
  input?: any
): Promise<string> {
  const executionId = await workflowScheduler.executeNow(
    workflowId,
    tenantId,
    userId,
    input
  );
  return executionId;
}

/**
 * Get the latest workflow execution for a workflow
 */
export async function getWorkflowExecution(workflowId: string): Promise<any> {
  const execution = await db.query.workflowExecutions.findFirst({
    where: eq(workflowExecutions.workflowId, workflowId),
    orderBy: [desc(workflowExecutions.startedAt)],
  });
  return execution;
}

/**
 * Get Gmail account from database
 */
export async function getGmailAccount(
  tenantId: string,
  userId: string,
  email: string
): Promise<any> {
  const account = await db.query.userGmailAccounts.findFirst({
    where: and(
      eq(userGmailAccounts.tenantId, tenantId),
      eq(userGmailAccounts.userId, userId),
      eq(userGmailAccounts.email, email)
    ),
  });
  return account;
}

/**
 * Wait for workflow execution to complete
 */
export async function waitForWorkflowCompletion(
  workflowId: string,
  timeoutMs: number = 5000
): Promise<any> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeoutMs) {
    const execution = await getWorkflowExecution(workflowId);
    
    if (execution && (execution.status === 'completed' || execution.status === 'failed')) {
      return execution;
    }
    
    // Wait 100ms before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  throw new Error(`Workflow execution did not complete within ${timeoutMs}ms`);
}
