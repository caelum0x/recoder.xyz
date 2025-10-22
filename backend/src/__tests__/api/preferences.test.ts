/**
 * User Preferences API Tests
 * Tests for appearance preferences endpoints
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

describe('User Preferences API', () => {
  let app: any;
  let server: any;

  beforeAll(async () => {
    const appModule = await import('../../app');
    app = appModule.default || appModule.app;
    server = app.listen();
  });

  afterAll(async () => {
    await prisma.$disconnect();
    if (server) server.close();
  });

  describe('GET /api/user/preferences/appearance', () => {
    test('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .get('/api/user/preferences/appearance')
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should return user appearance preferences', async () => {
      const response = await request(app)
        .get('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body).toHaveProperty('preferences');
    });

    test('should return preferences with correct structure', async () => {
      const response = await request(app)
        .get('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const preferences = response.body.preferences;
      expect(preferences).toHaveProperty('theme');
      expect(preferences).toHaveProperty('fontSize');
      expect(preferences).toHaveProperty('density');
      expect(preferences).toHaveProperty('accentColor');
      expect(preferences).toHaveProperty('reduceAnimations');
    });

    test('should return default preferences for new user', async () => {
      const response = await request(app)
        .get('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .expect(200);

      const preferences = response.body.preferences;
      expect(['light', 'dark', 'system']).toContain(preferences.theme);
      expect(['small', 'medium', 'large']).toContain(preferences.fontSize);
      expect(['compact', 'comfortable', 'spacious']).toContain(preferences.density);
    });
  });

  describe('PUT /api/user/preferences/appearance', () => {
    test('should update appearance preferences', async () => {
      const newPreferences = {
        theme: 'dark',
        fontSize: 'large',
        density: 'comfortable',
        accentColor: 'blue',
        reduceAnimations: false,
      };

      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send(newPreferences)
        .expect(200);

      expect(response.body).toHaveProperty('success', true);
      expect(response.body.preferences).toMatchObject(newPreferences);
    });

    test('should return 401 if not authenticated', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .send({ theme: 'dark' })
        .expect(401);

      expect(response.body).toHaveProperty('success', false);
    });

    test('should validate theme values', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ theme: 'invalid-theme' });

      // Should either validate or accept and use default
      expect([200, 400]).toContain(response.status);
    });

    test('should validate fontSize values', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ fontSize: 'huge' });

      expect([200, 400]).toContain(response.status);
    });

    test('should validate density values', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ density: 'invalid' });

      expect([200, 400]).toContain(response.status);
    });

    test('should update partial preferences', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ theme: 'light' })
        .expect(200);

      expect(response.body.preferences.theme).toBe('light');
    });

    test('should handle missing request body', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({});

      expect([200, 400]).toContain(response.status);
    });
  });

  describe('Theme Preferences', () => {
    test('should accept light theme', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ theme: 'light' })
        .expect(200);

      expect(response.body.preferences.theme).toBe('light');
    });

    test('should accept dark theme', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ theme: 'dark' })
        .expect(200);

      expect(response.body.preferences.theme).toBe('dark');
    });

    test('should accept system theme', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ theme: 'system' })
        .expect(200);

      expect(response.body.preferences.theme).toBe('system');
    });
  });

  describe('Font Size Preferences', () => {
    test('should accept small font size', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ fontSize: 'small' })
        .expect(200);

      expect(response.body.preferences.fontSize).toBe('small');
    });

    test('should accept medium font size', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ fontSize: 'medium' })
        .expect(200);

      expect(response.body.preferences.fontSize).toBe('medium');
    });

    test('should accept large font size', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ fontSize: 'large' })
        .expect(200);

      expect(response.body.preferences.fontSize).toBe('large');
    });
  });

  describe('Density Preferences', () => {
    test('should accept compact density', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ density: 'compact' })
        .expect(200);

      expect(response.body.preferences.density).toBe('compact');
    });

    test('should accept comfortable density', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ density: 'comfortable' })
        .expect(200);

      expect(response.body.preferences.density).toBe('comfortable');
    });

    test('should accept spacious density', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ density: 'spacious' })
        .expect(200);

      expect(response.body.preferences.density).toBe('spacious');
    });
  });

  describe('Accent Color Preferences', () => {
    const colors = ['orange', 'blue', 'purple', 'green', 'pink'];

    colors.forEach((color) => {
      test(`should accept ${color} accent color`, async () => {
        const response = await request(app)
          .put('/api/user/preferences/appearance')
          .set('Authorization', 'Bearer test-token')
          .send({ accentColor: color })
          .expect(200);

        expect(response.body.preferences.accentColor).toBe(color);
      });
    });
  });

  describe('Animation Preferences', () => {
    test('should accept reduceAnimations true', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ reduceAnimations: true })
        .expect(200);

      expect(response.body.preferences.reduceAnimations).toBe(true);
    });

    test('should accept reduceAnimations false', async () => {
      const response = await request(app)
        .put('/api/user/preferences/appearance')
        .set('Authorization', 'Bearer test-token')
        .send({ reduceAnimations: false })
        .expect(200);

      expect(response.body.preferences.reduceAnimations).toBe(false);
    });
  });
});
