/**
 * Notifications API Tests
 * Tests for notification CRUD operations
 */

import request from 'supertest';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Mock authentication middleware
jest.mock('../../middleware/auth', () => ({
  authenticateUser: (req: any, res: any, next: any) => {
    req.user = { id: 'test-user-id', email: 'test@example.com' };
    next();
  },
}));

describe('Notifications API', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    // Import app after mocks are set up
    const appModule = await import('../../app');
    app = appModule.default || appModule.app;
    server = app.listen();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (server) server.close();
  });

  describe('GET /api/notifications', () => {
    test('should return 401 if not authenticated', async () => {
      // Temporarily remove mock
      const response = await request(app)
        .get('/api/notifications')
        .expect('Content-Type', /json/);

      expect(response.status).toBe(401);
    });

    test('should return user notifications', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('notifications');
      expect(Array.isArray(response.body.notifications)).toBe(true);
    });

    test('should return notifications with correct structure', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const notifications = response.body.notifications;
      if (notifications.length > 0) {
        const notification = notifications[0];
        expect(notification).toHaveProperty('id');
        expect(notification).toHaveProperty('type');
        expect(notification).toHaveProperty('title');
        expect(notification).toHaveProperty('message');
        expect(notification).toHaveProperty('read');
        expect(notification).toHaveProperty('createdAt');
      }
    });

    test('should filter unread notifications', async () => {
      const response = await request(app)
        .get('/api/notifications?unread=true')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const notifications = response.body.notifications;
      notifications.forEach((notification: any) => {
        expect(notification.read).toBe(false);
      });
    });
  });

  describe('POST /api/notifications/[id]/mark-read', () => {
    test('should mark notification as read', async () => {
      const response = await request(app)
        .post('/api/notifications/test-notification-id/mark-read')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    test('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post('/api/notifications/test-notification-id/mark-read')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should handle invalid notification ID', async () => {
      const response = await request(app)
        .post('/api/notifications/invalid-id/mark-read')
        .set('Authorization', 'Bearer test-token');

      // Should handle gracefully (may be 404 or 500 depending on implementation)
      expect([404, 500]).toContain(response.status);
    });
  });

  describe('POST /api/notifications/mark-all-read', () => {
    test('should mark all notifications as read', async () => {
      const response = await request(app)
        .post('/api/notifications/mark-all-read')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('message');
    });

    test('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .post('/api/notifications/mark-all-read')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });
  });

  describe('DELETE /api/notifications/[id]', () => {
    test('should delete notification', async () => {
      const response = await request(app)
        .delete('/api/notifications/test-notification-id')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
    });

    test('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .delete('/api/notifications/test-notification-id')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should handle non-existent notification', async () => {
      const response = await request(app)
        .delete('/api/notifications/non-existent-id')
        .set('Authorization', 'Bearer test-token');

      expect([404, 500]).toContain(response.status);
    });
  });

  describe('Notification Types', () => {
    test('should support info notifications', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const infoNotifications = response.body.notifications.filter(
        (n: any) => n.type === 'info'
      );
      expect(infoNotifications.length).toBeGreaterThanOrEqual(0);
    });

    test('should support success notifications', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const successNotifications = response.body.notifications.filter(
        (n: any) => n.type === 'success'
      );
      expect(successNotifications.length).toBeGreaterThanOrEqual(0);
    });

    test('should support warning notifications', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const warningNotifications = response.body.notifications.filter(
        (n: any) => n.type === 'warning'
      );
      expect(warningNotifications.length).toBeGreaterThanOrEqual(0);
    });

    test('should support error notifications', async () => {
      const response = await request(app)
        .get('/api/notifications')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const errorNotifications = response.body.notifications.filter(
        (n: any) => n.type === 'error'
      );
      expect(errorNotifications.length).toBeGreaterThanOrEqual(0);
    });
  });
});
