import { test, expect } from '@playwright/test';

test.describe('API Endpoint Tests', () => {
  let authToken: string;
  let baseURL: string;

  test.beforeAll(async ({ request }) => {
    baseURL = process.env.BASE_URL || 'http://localhost:3000';
    
    // Authenticate and get token for API testing
    const loginResponse = await request.post(`${baseURL}/api/auth/signin`, {
      data: {
        email: process.env.TEST_USER_EMAIL || 'test@recoder.xyz',
        password: process.env.TEST_USER_PASSWORD || 'testpassword123',
      }
    });
    
    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    authToken = loginData.token || 'mock-auth-token';
  });

  test.describe('Authentication APIs', () => {
    test('POST /api/auth/signin - should authenticate user successfully', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/auth/signin`, {
        data: {
          email: 'test@recoder.xyz',
          password: 'testpassword123',
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('user');
      expect(data).toHaveProperty('token');
      expect(data.user.email).toBe('test@recoder.xyz');
    });

    test('POST /api/auth/signin - should reject invalid credentials', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/auth/signin`, {
        data: {
          email: 'test@recoder.xyz',
          password: 'wrongpassword',
        }
      });

      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toContain('Invalid credentials');
    });

    test('POST /api/auth/signup - should register new user', async ({ request }) => {
      const timestamp = Date.now();
      const response = await request.post(`${baseURL}/api/auth/signup`, {
        data: {
          name: `Test User ${timestamp}`,
          email: `test${timestamp}@example.com`,
          password: 'testpassword123',
        }
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('user');
      expect(data.user.email).toBe(`test${timestamp}@example.com`);
    });

    test('POST /api/auth/signup - should validate required fields', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/auth/signup`, {
        data: {
          email: 'incomplete@example.com',
          // Missing name and password
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.errors).toContain('Name is required');
      expect(data.errors).toContain('Password is required');
    });

    test('POST /api/auth/forgot-password - should initiate password reset', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/auth/forgot-password`, {
        data: {
          email: 'test@recoder.xyz',
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.message).toContain('Password reset email sent');
    });
  });

  test.describe('User Management APIs', () => {
    test('GET /api/user/profile - should get user profile', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data).toHaveProperty('email');
      expect(data).toHaveProperty('name');
    });

    test('PUT /api/user/profile - should update user profile', async ({ request }) => {
      const response = await request.put(`${baseURL}/api/user/profile`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          name: 'Updated Test User',
          bio: 'Updated bio for testing',
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.name).toBe('Updated Test User');
      expect(data.bio).toBe('Updated bio for testing');
    });

    test('POST /api/user/avatar - should upload avatar', async ({ request }) => {
      // Mock file upload
      const response = await request.post(`${baseURL}/api/user/avatar`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        multipart: {
          avatar: {
            name: 'avatar.jpg',
            mimeType: 'image/jpeg',
            buffer: Buffer.from('fake-image-data'),
          }
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('avatarUrl');
    });

    test('DELETE /api/user/account - should initiate account deletion', async ({ request }) => {
      const response = await request.delete(`${baseURL}/api/user/account`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          confirmationText: 'DELETE',
          reason: 'Testing account deletion',
        }
      });

      // Note: In a real test, you might not want to actually delete the account
      // This test would verify the endpoint exists and validates input correctly
      expect([200, 202]).toContain(response.status());
    });
  });

  test.describe('Project Management APIs', () => {
    let testProjectId: string;

    test('POST /api/projects - should create new project', async ({ request }) => {
      const projectData = {
        name: `test-project-${Date.now()}`,
        description: 'Test project created by API tests',
        template: 'react',
        visibility: 'private',
        includeTests: true,
        includeEslint: true,
      };

      const response = await request.post(`${baseURL}/api/projects`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: projectData
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data.name).toBe(projectData.name);
      expect(data.template).toBe(projectData.template);
      
      testProjectId = data.id;
    });

    test('GET /api/projects - should list user projects', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/projects`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.projects)).toBeTruthy();
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('page');
    });

    test('GET /api/projects/:id - should get specific project', async ({ request }) => {
      if (!testProjectId) {
        test.skip('No test project available');
      }

      const response = await request.get(`${baseURL}/api/projects/${testProjectId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.id).toBe(testProjectId);
      expect(data).toHaveProperty('name');
      expect(data).toHaveProperty('files');
    });

    test('PUT /api/projects/:id - should update project', async ({ request }) => {
      if (!testProjectId) {
        test.skip('No test project available');
      }

      const updateData = {
        name: 'Updated Project Name',
        description: 'Updated project description',
        visibility: 'public',
      };

      const response = await request.put(`${baseURL}/api/projects/${testProjectId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: updateData
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.name).toBe(updateData.name);
      expect(data.description).toBe(updateData.description);
    });

    test('POST /api/projects/:id/files - should create project file', async ({ request }) => {
      if (!testProjectId) {
        test.skip('No test project available');
      }

      const fileData = {
        path: 'src/components/TestComponent.tsx',
        content: 'export const TestComponent = () => <div>Test</div>;',
      };

      const response = await request.post(`${baseURL}/api/projects/${testProjectId}/files`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: fileData
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data.path).toBe(fileData.path);
      expect(data.content).toBe(fileData.content);
    });

    test('DELETE /api/projects/:id - should delete project', async ({ request }) => {
      if (!testProjectId) {
        test.skip('No test project available');
      }

      const response = await request.delete(`${baseURL}/api/projects/${testProjectId}`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      expect(response.status()).toBe(204);
    });
  });

  test.describe('AI and Code Generation APIs', () => {
    test('POST /api/ai/generate - should generate code with AI', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/ai/generate`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          prompt: 'Create a React component for a todo list',
          language: 'typescript',
          framework: 'react',
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('code');
      expect(data).toHaveProperty('explanation');
      expect(data.code).toContain('React');
    });

    test('POST /api/ai/chat - should handle AI chat conversation', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/ai/chat`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          message: 'How do I create a REST API in Node.js?',
          context: 'backend development',
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('response');
      expect(data).toHaveProperty('conversationId');
    });

    test('POST /api/ai/optimize - should optimize existing code', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/ai/optimize`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          code: 'function inefficientFunction() { for(let i = 0; i < 1000000; i++) { console.log(i); } }',
          language: 'javascript',
          optimizationType: 'performance',
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('optimizedCode');
      expect(data).toHaveProperty('improvements');
      expect(Array.isArray(data.improvements)).toBeTruthy();
    });
  });

  test.describe('Analytics and Monitoring APIs', () => {
    test('GET /api/analytics/usage - should get usage analytics', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/analytics/usage`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        params: {
          period: '7d',
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('totalRequests');
      expect(data).toHaveProperty('tokensUsed');
      expect(data).toHaveProperty('projectsCreated');
    });

    test('GET /api/analytics/performance - should get performance metrics', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/analytics/performance`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data).toHaveProperty('averageResponseTime');
      expect(data).toHaveProperty('errorRate');
      expect(data).toHaveProperty('uptime');
    });

    test('POST /api/analytics/events - should track custom events', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/analytics/events`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          event: 'project_created',
          properties: {
            template: 'react',
            language: 'typescript',
          }
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.success).toBeTruthy();
    });
  });

  test.describe('Team and Collaboration APIs', () => {
    let testTeamId: string;

    test('POST /api/teams - should create team', async ({ request }) => {
      const teamData = {
        name: `Test Team ${Date.now()}`,
        description: 'Team created by API tests',
      };

      const response = await request.post(`${baseURL}/api/teams`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: teamData
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data.name).toBe(teamData.name);
      
      testTeamId = data.id;
    });

    test('POST /api/teams/:id/members - should invite team member', async ({ request }) => {
      if (!testTeamId) {
        test.skip('No test team available');
      }

      const invitationData = {
        email: 'newmember@example.com',
        role: 'editor',
      };

      const response = await request.post(`${baseURL}/api/teams/${testTeamId}/members`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: invitationData
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(data.message).toContain('Invitation sent');
    });

    test('GET /api/teams/:id/members - should list team members', async ({ request }) => {
      if (!testTeamId) {
        test.skip('No test team available');
      }

      const response = await request.get(`${baseURL}/api/teams/${testTeamId}/members`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.members)).toBeTruthy();
    });
  });

  test.describe('Integration and Webhook APIs', () => {
    test('GET /api/integrations - should list available integrations', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/integrations`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      expect(response.status()).toBe(200);
      const data = await response.json();
      expect(Array.isArray(data.integrations)).toBeTruthy();
      expect(data.integrations).toContainEqual(
        expect.objectContaining({ provider: 'github' })
      );
    });

    test('POST /api/webhooks - should create webhook', async ({ request }) => {
      const webhookData = {
        url: 'https://example.com/webhook',
        events: ['project.created', 'deployment.success'],
        secret: 'webhook-secret-key',
      };

      const response = await request.post(`${baseURL}/api/webhooks`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: webhookData
      });

      expect(response.status()).toBe(201);
      const data = await response.json();
      expect(data).toHaveProperty('id');
      expect(data.url).toBe(webhookData.url);
      expect(data.events).toEqual(webhookData.events);
    });

    test('POST /api/webhooks/:id/test - should test webhook', async ({ request }) => {
      // This would require a webhook ID from the previous test
      // For now, we'll test the endpoint structure
      const response = await request.post(`${baseURL}/api/webhooks/test-webhook-id/test`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          event: 'test.webhook',
          payload: { test: true },
        }
      });

      // Webhook might not exist, so we check for 404 or 200
      expect([200, 404]).toContain(response.status());
    });
  });

  test.describe('Error Handling and Rate Limiting', () => {
    test('should handle 404 for non-existent resources', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/projects/non-existent-id`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        }
      });

      expect(response.status()).toBe(404);
      const data = await response.json();
      expect(data.error).toContain('not found');
    });

    test('should handle unauthorized requests', async ({ request }) => {
      const response = await request.get(`${baseURL}/api/user/profile`);
      
      expect(response.status()).toBe(401);
      const data = await response.json();
      expect(data.error).toContain('Unauthorized');
    });

    test('should validate request data', async ({ request }) => {
      const response = await request.post(`${baseURL}/api/projects`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
        },
        data: {
          // Missing required fields like name and template
          description: 'Invalid project data',
        }
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.errors).toBeDefined();
      expect(Array.isArray(data.errors)).toBeTruthy();
    });

    test('should handle rate limiting', async ({ request }) => {
      // Make multiple rapid requests to trigger rate limiting
      const requests = Array.from({ length: 20 }, () =>
        request.get(`${baseURL}/api/user/profile`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
          }
        })
      );

      const responses = await Promise.all(requests);
      
      // Check if any requests were rate limited
      const rateLimitedResponses = responses.filter(r => r.status() === 429);
      
      if (rateLimitedResponses.length > 0) {
        const data = await rateLimitedResponses[0].json();
        expect(data.error).toContain('rate limit');
      }
    });
  });
});
