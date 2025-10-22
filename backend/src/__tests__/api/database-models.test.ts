/**
 * Database Models Tests
 * Tests for new Prisma models (Notification, UserPreferences, etc.)
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

describe('Database Models', () => {
  let testUserId: string;

  beforeAll(async () => {
    // Create a test user
    try {
      const user = await prisma.user.create({
        data: {
          email: `test-${Date.now()}@example.com`,
          name: 'Test User',
          password: 'hashedpassword',
        },
      });
      testUserId = user.id;
    } catch (error) {
      console.error('Failed to create test user:', error);
    }
  });

  afterAll(async () => {
    // Clean up test data
    if (testUserId) {
      await prisma.notification.deleteMany({ where: { userId: testUserId } });
      await prisma.userPreferences.deleteMany({ where: { userId: testUserId } });
      await prisma.activity.deleteMany({ where: { userId: testUserId } });
      await prisma.user.delete({ where: { id: testUserId } });
    }
    await prisma.$disconnect();
  });

  describe('Notification Model', () => {
    test('should create notification', async () => {
      const notification = await prisma.notification.create({
        data: {
          userId: testUserId,
          type: 'info',
          title: 'Test Notification',
          message: 'This is a test notification',
          read: false,
        },
      });

      expect(notification).toHaveProperty('id');
      expect(notification.title).toBe('Test Notification');
      expect(notification.type).toBe('info');
      expect(notification.read).toBe(false);
    });

    test('should find notifications by user', async () => {
      await prisma.notification.create({
        data: {
          userId: testUserId,
          type: 'success',
          title: 'Success',
          message: 'Operation completed',
        },
      });

      const notifications = await prisma.notification.findMany({
        where: { userId: testUserId },
      });

      expect(notifications.length).toBeGreaterThan(0);
    });

    test('should filter unread notifications', async () => {
      await prisma.notification.create({
        data: {
          userId: testUserId,
          type: 'warning',
          title: 'Warning',
          message: 'Check this',
          read: false,
        },
      });

      const unreadNotifications = await prisma.notification.findMany({
        where: { userId: testUserId, read: false },
      });

      unreadNotifications.forEach((notification) => {
        expect(notification.read).toBe(false);
      });
    });

    test('should update notification to read', async () => {
      const notification = await prisma.notification.create({
        data: {
          userId: testUserId,
          type: 'info',
          title: 'Update Test',
          message: 'Testing update',
          read: false,
        },
      });

      const updated = await prisma.notification.update({
        where: { id: notification.id },
        data: { read: true },
      });

      expect(updated.read).toBe(true);
    });

    test('should delete notification', async () => {
      const notification = await prisma.notification.create({
        data: {
          userId: testUserId,
          type: 'error',
          title: 'Delete Test',
          message: 'Testing delete',
        },
      });

      await prisma.notification.delete({
        where: { id: notification.id },
      });

      const found = await prisma.notification.findUnique({
        where: { id: notification.id },
      });

      expect(found).toBeNull();
    });

    test('should support all notification types', async () => {
      const types = ['info', 'success', 'warning', 'error'];

      for (const type of types) {
        const notification = await prisma.notification.create({
          data: {
            userId: testUserId,
            type,
            title: `${type} notification`,
            message: 'Test message',
          },
        });

        expect(notification.type).toBe(type);
      }
    });

    test('should store optional link', async () => {
      const notification = await prisma.notification.create({
        data: {
          userId: testUserId,
          type: 'info',
          title: 'With Link',
          message: 'Click to view',
          link: '/dashboard',
        },
      });

      expect(notification.link).toBe('/dashboard');
    });

    test('should store metadata as JSON', async () => {
      const metadata = { projectId: '123', action: 'created' };
      
      const notification = await prisma.notification.create({
        data: {
          userId: testUserId,
          type: 'success',
          title: 'Project Created',
          message: 'Your project is ready',
          metadata,
        },
      });

      expect(notification.metadata).toEqual(metadata);
    });
  });

  describe('UserPreferences Model', () => {
    test('should create user preferences', async () => {
      const preferences = await prisma.userPreferences.create({
        data: {
          userId: testUserId,
          theme: 'dark',
          fontSize: 'medium',
          density: 'comfortable',
          accentColor: 'orange',
          reduceAnimations: false,
        },
      });

      expect(preferences).toHaveProperty('id');
      expect(preferences.theme).toBe('dark');
      expect(preferences.fontSize).toBe('medium');
    });

    test('should find preferences by user', async () => {
      const preferences = await prisma.userPreferences.findUnique({
        where: { userId: testUserId },
      });

      expect(preferences).toBeTruthy();
      expect(preferences?.userId).toBe(testUserId);
    });

    test('should update preferences', async () => {
      await prisma.userPreferences.upsert({
        where: { userId: testUserId },
        create: {
          userId: testUserId,
          theme: 'light',
          fontSize: 'small',
          density: 'compact',
        },
        update: {
          theme: 'dark',
          fontSize: 'large',
        },
      });

      const preferences = await prisma.userPreferences.findUnique({
        where: { userId: testUserId },
      });

      expect(preferences?.theme).toBe('dark');
      expect(preferences?.fontSize).toBe('large');
    });

    test('should have default values', async () => {
      const newUser = await prisma.user.create({
        data: {
          email: `defaults-${Date.now()}@example.com`,
          name: 'Default User',
          password: 'password',
        },
      });

      const preferences = await prisma.userPreferences.create({
        data: {
          userId: newUser.id,
        },
      });

      expect(preferences.theme).toBe('dark');
      expect(preferences.fontSize).toBe('medium');
      expect(preferences.density).toBe('comfortable');
      expect(preferences.reduceAnimations).toBe(false);

      // Cleanup
      await prisma.userPreferences.delete({ where: { userId: newUser.id } });
      await prisma.user.delete({ where: { id: newUser.id } });
    });
  });

  describe('Activity Model', () => {
    test('should create activity log', async () => {
      const activity = await prisma.activity.create({
        data: {
          userId: testUserId,
          type: 'project_created',
          action: 'Created new project',
          resource: 'project-123',
        },
      });

      expect(activity).toHaveProperty('id');
      expect(activity.type).toBe('project_created');
      expect(activity.action).toBe('Created new project');
    });

    test('should find activities by user', async () => {
      await prisma.activity.create({
        data: {
          userId: testUserId,
          type: 'login',
          action: 'User logged in',
        },
      });

      const activities = await prisma.activity.findMany({
        where: { userId: testUserId },
        orderBy: { createdAt: 'desc' },
      });

      expect(activities.length).toBeGreaterThan(0);
    });

    test('should filter activities by type', async () => {
      await prisma.activity.create({
        data: {
          userId: testUserId,
          type: 'deployment',
          action: 'Deployed application',
        },
      });

      const deploymentActivities = await prisma.activity.findMany({
        where: { userId: testUserId, type: 'deployment' },
      });

      deploymentActivities.forEach((activity) => {
        expect(activity.type).toBe('deployment');
      });
    });

    test('should store metadata', async () => {
      const metadata = {
        ip: '127.0.0.1',
        browser: 'Chrome',
        os: 'macOS',
      };

      const activity = await prisma.activity.create({
        data: {
          userId: testUserId,
          type: 'login',
          action: 'User logged in',
          metadata,
        },
      });

      expect(activity.metadata).toEqual(metadata);
    });

    test('should store IP address', async () => {
      const activity = await prisma.activity.create({
        data: {
          userId: testUserId,
          type: 'api_call',
          action: 'Made API request',
          ipAddress: '192.168.1.1',
        },
      });

      expect(activity.ipAddress).toBe('192.168.1.1');
    });

    test('should store user agent', async () => {
      const activity = await prisma.activity.create({
        data: {
          userId: testUserId,
          type: 'page_view',
          action: 'Viewed dashboard',
          userAgent: 'Mozilla/5.0...',
        },
      });

      expect(activity.userAgent).toBe('Mozilla/5.0...');
    });
  });

  describe('Model Relationships', () => {
    test('should relate notifications to user', async () => {
      const notification = await prisma.notification.create({
        data: {
          userId: testUserId,
          type: 'info',
          title: 'Test',
          message: 'Test message',
        },
        include: {
          user: true,
        },
      });

      expect(notification.user).toBeTruthy();
      expect(notification.user.id).toBe(testUserId);
    });

    test('should relate preferences to user', async () => {
      const preferences = await prisma.userPreferences.findUnique({
        where: { userId: testUserId },
        include: {
          user: true,
        },
      });

      expect(preferences?.user).toBeTruthy();
      expect(preferences?.user.id).toBe(testUserId);
    });

    test('should relate activities to user', async () => {
      const activity = await prisma.activity.create({
        data: {
          userId: testUserId,
          type: 'test',
          action: 'Test action',
        },
        include: {
          user: true,
        },
      });

      expect(activity.user).toBeTruthy();
      expect(activity.user.id).toBe(testUserId);
    });

    test('should cascade delete on user deletion', async () => {
      // This test verifies cascade deletion is configured
      // Create temporary user with related data
      const tempUser = await prisma.user.create({
        data: {
          email: `cascade-${Date.now()}@example.com`,
          name: 'Cascade Test',
          password: 'password',
        },
      });

      await prisma.notification.create({
        data: {
          userId: tempUser.id,
          type: 'info',
          title: 'Cascade Test',
          message: 'Test',
        },
      });

      await prisma.user.delete({ where: { id: tempUser.id } });

      const notifications = await prisma.notification.findMany({
        where: { userId: tempUser.id },
      });

      expect(notifications.length).toBe(0);
    });
  });
});
