// Sprint 1 - Notification Routes Tests
// Real integration tests with supertest for notification API
// Tests HTTP responses AND database state with tenant/user isolation

import { describe, it, expect, beforeEach } from 'vitest';
import type { Application } from 'express';
import { db } from '../../db';
import { notifications } from '../../../../shared/schema';
import { eq, and } from 'drizzle-orm';
import {
  getTestApp,
  createTestTenant,
  createTestUser,
  createTestNotification,
  createAuthenticatedAgent,
  type AuthenticatedRequest
} from '../setup';

describe('Notification Routes - Integration Tests', () => {
  let app: Application;
  let testTenant: any;
  let testUser: any;
  let agent: AuthenticatedRequest;

  beforeEach(async () => {
    app = await getTestApp();
    testTenant = await createTestTenant();
    testUser = await createTestUser(testTenant.id);
    agent = createAuthenticatedAgent(app, testTenant.id, testUser.id);
  }, 30000); // Increase timeout to 30s for app loading

  describe('GET /api/notifications', () => {
    it('should list notifications for authenticated user', async () => {
      // Create test notifications
      const notif1 = await createTestNotification(testTenant.id, testUser.id, {
        title: 'Test Notification 1',
        message: 'Message 1'
      });
      const notif2 = await createTestNotification(testTenant.id, testUser.id, {
        title: 'Test Notification 2',
        message: 'Message 2',
        read: true
      });

      const response = await agent.get('/api/notifications');

      expect(response.status).toBe(200);
      expect(response.body.notifications).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.notifications[0].id).toBeDefined();
      expect(response.body.notifications[0].title).toBeDefined();
    });

    it('should filter notifications by tenantId (tenant isolation)', async () => {
      // Create notification for this tenant
      await createTestNotification(testTenant.id, testUser.id, {
        title: 'My Tenant Notification'
      });

      // Create another tenant and notification
      const otherTenant = await createTestTenant({ name: 'Other Tenant' });
      const otherUser = await createTestUser(otherTenant.id);
      await createTestNotification(otherTenant.id, otherUser.id, {
        title: 'Other Tenant Notification'
      });

      const response = await agent.get('/api/notifications');

      expect(response.status).toBe(200);
      expect(response.body.notifications).toHaveLength(1);
      expect(response.body.notifications[0].title).toBe('My Tenant Notification');
      expect(response.body.notifications[0].tenantId).toBe(testTenant.id);
    });

    it('should support unread filter', async () => {
      await createTestNotification(testTenant.id, testUser.id, {
        title: 'Unread 1',
        read: false
      });
      await createTestNotification(testTenant.id, testUser.id, {
        title: 'Read 1',
        read: true
      });
      await createTestNotification(testTenant.id, testUser.id, {
        title: 'Unread 2',
        read: false
      });

      const response = await agent.get('/api/notifications?unread=true');

      expect(response.status).toBe(200);
      expect(response.body.notifications).toHaveLength(2);
      expect(response.body.total).toBe(2);
      expect(response.body.notifications.every((n: any) => n.read === false)).toBe(true);
    });

    it('should support pagination', async () => {
      // Create 5 notifications
      for (let i = 0; i < 5; i++) {
        await createTestNotification(testTenant.id, testUser.id, {
          title: `Notification ${i}`
        });
      }

      const page1 = await agent.get('/api/notifications?limit=2&offset=0');
      expect(page1.status).toBe(200);
      expect(page1.body.notifications).toHaveLength(2);
      expect(page1.body.total).toBe(5);
      expect(page1.body.limit).toBe(2);
      expect(page1.body.offset).toBe(0);

      const page2 = await agent.get('/api/notifications?limit=2&offset=2');
      expect(page2.status).toBe(200);
      expect(page2.body.notifications).toHaveLength(2);
      expect(page2.body.total).toBe(5);
      expect(page2.body.offset).toBe(2);
    });
  });

  describe('PATCH /api/notifications/:id/read', () => {
    it('should mark notification as read and update database', async () => {
      const notif = await createTestNotification(testTenant.id, testUser.id, {
        title: 'Unread Notification',
        read: false
      });

      const response = await agent.patch(`/api/notifications/${notif.id}/read`);

      expect(response.status).toBe(200);
      expect(response.body.notification).toBeDefined();
      expect(response.body.notification.read).toBe(true);
      expect(response.body.notification.readAt).toBeDefined();

      // Verify database state
      const [dbNotif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif.id));
      
      expect(dbNotif.read).toBe(true);
      expect(dbNotif.readAt).toBeDefined();
    });

    it('should enforce user isolation (cannot mark other user notification)', async () => {
      // Create another user in same tenant
      const otherUser = await createTestUser(testTenant.id, {
        email: 'other@example.com'
      });
      const otherNotif = await createTestNotification(testTenant.id, otherUser.id, {
        title: 'Other User Notification'
      });

      const response = await agent.patch(`/api/notifications/${otherNotif.id}/read`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Notification not found');

      // Verify database state unchanged
      const [dbNotif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, otherNotif.id));
      
      expect(dbNotif.read).toBe(false);
    });

    it('should return 404 for non-existent notification', async () => {
      const response = await agent.patch('/api/notifications/non-existent-id/read');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Notification not found');
    });
  });

  describe('POST /api/notifications/mark-all-read', () => {
    it('should mark all user notifications as read', async () => {
      await createTestNotification(testTenant.id, testUser.id, {
        title: 'Unread 1',
        read: false
      });
      await createTestNotification(testTenant.id, testUser.id, {
        title: 'Unread 2',
        read: false
      });
      await createTestNotification(testTenant.id, testUser.id, {
        title: 'Already Read',
        read: true
      });

      const response = await agent.post('/api/notifications/mark-all-read');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(2);

      // Verify database state
      const allNotifs = await db
        .select()
        .from(notifications)
        .where(and(
          eq(notifications.tenantId, testTenant.id),
          eq(notifications.userId, testUser.id)
        ));

      expect(allNotifs.every(n => n.read === true)).toBe(true);
    });

    it('should only mark current user notifications (user isolation)', async () => {
      // Create notifications for test user
      await createTestNotification(testTenant.id, testUser.id, {
        title: 'My Unread',
        read: false
      });

      // Create another user with unread notifications
      const otherUser = await createTestUser(testTenant.id, {
        email: 'other@example.com'
      });
      const otherNotif = await createTestNotification(testTenant.id, otherUser.id, {
        title: 'Other User Unread',
        read: false
      });

      const response = await agent.post('/api/notifications/mark-all-read');

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(1);

      // Verify other user's notification is still unread
      const [dbOtherNotif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, otherNotif.id));

      expect(dbOtherNotif.read).toBe(false);
    });
  });

  describe('DELETE /api/notifications/:id', () => {
    it('should delete notification from database', async () => {
      const notif = await createTestNotification(testTenant.id, testUser.id, {
        title: 'To Delete'
      });

      const response = await agent.delete(`/api/notifications/${notif.id}`);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);

      // Verify deleted from database
      const [dbNotif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, notif.id));

      expect(dbNotif).toBeUndefined();
    });

    it('should enforce ownership (cannot delete other user notification)', async () => {
      const otherUser = await createTestUser(testTenant.id, {
        email: 'other@example.com'
      });
      const otherNotif = await createTestNotification(testTenant.id, otherUser.id, {
        title: 'Other User Notification'
      });

      const response = await agent.delete(`/api/notifications/${otherNotif.id}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Notification not found');

      // Verify still exists in database
      const [dbNotif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, otherNotif.id));

      expect(dbNotif).toBeDefined();
    });
  });

  describe('POST /api/notifications (create)', () => {
    it('should create notification and return it', async () => {
      const response = await agent.post('/api/notifications')
        .send({
          userId: testUser.id,
          type: 'task_assigned',
          title: 'New Task',
          message: 'You have been assigned a new task',
          link: '/tasks/123',
          linkText: 'View Task'
        });

      expect(response.status).toBe(201);
      expect(response.body.notification).toBeDefined();
      expect(response.body.notification.title).toBe('New Task');
      expect(response.body.notification.read).toBe(false);

      // Verify in database
      const [dbNotif] = await db
        .select()
        .from(notifications)
        .where(eq(notifications.id, response.body.notification.id));

      expect(dbNotif).toBeDefined();
      expect(dbNotif.title).toBe('New Task');
    });

    it('should validate required fields', async () => {
      const response = await agent.post('/api/notifications')
        .send({
          userId: testUser.id
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Failed to create notification');
    });
  });

  describe('GET /api/notifications/:id', () => {
    it('should get single notification by id', async () => {
      const notif = await createTestNotification(testTenant.id, testUser.id, {
        title: 'Single Notification',
        message: 'Test message'
      });

      const response = await agent.get(`/api/notifications/${notif.id}`);

      expect(response.status).toBe(200);
      expect(response.body.id).toBe(notif.id);
      expect(response.body.title).toBe('Single Notification');
    });

    it('should enforce ownership when getting single notification', async () => {
      const otherUser = await createTestUser(testTenant.id, {
        email: 'other@example.com'
      });
      const otherNotif = await createTestNotification(testTenant.id, otherUser.id, {
        title: 'Other User Notification'
      });

      const response = await agent.get(`/api/notifications/${otherNotif.id}`);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Notification not found');
    });
  });
});

describe('Notification Security Tests - CRITICAL', () => {
  let app: Application;

  beforeEach(async () => {
    app = await getTestApp();
  }, 30000); // Increase timeout for app loading

  it('should prevent cross-tenant notification access', async () => {
    // Tenant A
    const tenantA = await createTestTenant({ name: 'Tenant A' });
    const userA = await createTestUser(tenantA.id);
    const notifA = await createTestNotification(tenantA.id, userA.id, {
      title: 'Tenant A Notification'
    });

    // Tenant B
    const tenantB = await createTestTenant({ name: 'Tenant B' });
    const userB = await createTestUser(tenantB.id);

    // User B tries to access Tenant A's notification
    const agentB = createAuthenticatedAgent(app, tenantB.id, userB.id);
    
    const listResponse = await agentB.get('/api/notifications');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.notifications).toHaveLength(0);

    const getResponse = await agentB.get(`/api/notifications/${notifA.id}`);
    expect(getResponse.status).toBe(404);

    const patchResponse = await agentB.patch(`/api/notifications/${notifA.id}/read`);
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await agentB.delete(`/api/notifications/${notifA.id}`);
    expect(deleteResponse.status).toBe(404);

    // Verify Tenant A notification is unchanged
    const [dbNotif] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notifA.id));

    expect(dbNotif).toBeDefined();
    expect(dbNotif.read).toBe(false);
  });

  it('should prevent cross-user notification access within same tenant', async () => {
    const tenant = await createTestTenant();
    const user1 = await createTestUser(tenant.id, { email: 'user1@example.com' });
    const user2 = await createTestUser(tenant.id, { email: 'user2@example.com' });

    const user1Notif = await createTestNotification(tenant.id, user1.id, {
      title: 'User 1 Notification'
    });

    // User 2 tries to access User 1's notification
    const agent2 = createAuthenticatedAgent(app, tenant.id, user2.id);

    const listResponse = await agent2.get('/api/notifications');
    expect(listResponse.status).toBe(200);
    expect(listResponse.body.notifications).toHaveLength(0);

    const getResponse = await agent2.get(`/api/notifications/${user1Notif.id}`);
    expect(getResponse.status).toBe(404);

    const patchResponse = await agent2.patch(`/api/notifications/${user1Notif.id}/read`);
    expect(patchResponse.status).toBe(404);

    const deleteResponse = await agent2.delete(`/api/notifications/${user1Notif.id}`);
    expect(deleteResponse.status).toBe(404);

    // Verify User 1 notification is unchanged
    const [dbNotif] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, user1Notif.id));

    expect(dbNotif).toBeDefined();
    expect(dbNotif.read).toBe(false);
  });
});
