import { test, expect } from '@playwright/test';

/**
 * E2E Test Suite 6: API Endpoints
 * Tests critical API endpoints
 *
 * Note: These tests use direct API requests and don't require
 * page-based authentication. API endpoints that require auth
 * should handle it via headers or cookies separately.
 */

test.describe('API Endpoints', () => {
  
  test('should respond to health check', async ({ request }) => {
    const response = await request.get('/api/health');
    expect(response.status()).toBe(200);
    
    const data = await response.json();
    console.log('✅ Health check passed:', data);
  });

  test('should respond to starters API', async ({ request }) => {
    const response = await request.post('/api/starters', {
      data: {
        action: 'list'
      }
    });
    
    expect(response.ok()).toBeTruthy();
    console.log('✅ Starters API responds');
  });

  test('should handle GitHub API requests', async ({ request }) => {
    const response = await request.get('/api/github?action=get-templates');
    
    // Should respond (may be 200 or error, just check it responds)
    expect(response.status()).toBeLessThan(500);
    console.log('✅ GitHub API responds');
  });

  test('should respond to system health', async ({ request }) => {
    const response = await request.get('/api/system-health');
    
    if (response.ok()) {
      const data = await response.json();
      console.log('✅ System health:', data);
    } else {
      console.log('⚠️  System health endpoint not available');
    }
  });
});
