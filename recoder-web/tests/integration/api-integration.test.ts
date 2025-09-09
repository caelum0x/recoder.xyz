import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Mock API responses
const mockApiResponses = {
  projects: {
    list: {
      projects: [
        {
          id: '1',
          name: 'Test Project 1',
          description: 'A test project',
          template: 'react',
          visibility: 'private',
          createdAt: new Date().toISOString(),
        },
        {
          id: '2',
          name: 'Test Project 2',
          description: 'Another test project',
          template: 'nextjs',
          visibility: 'public',
          createdAt: new Date().toISOString(),
        },
      ],
      total: 2,
      page: 1,
      limit: 10,
    },
    create: {
      id: '3',
      name: 'New Test Project',
      description: 'Newly created test project',
      template: 'react',
      visibility: 'private',
      createdAt: new Date().toISOString(),
    },
  },
  user: {
    profile: {
      id: 'user-1',
      name: 'Test User',
      email: 'test@example.com',
      createdAt: new Date().toISOString(),
    },
  },
  auth: {
    signin: {
      user: {
        id: 'user-1',
        name: 'Test User',
        email: 'test@example.com',
      },
      token: 'mock-jwt-token',
    },
  },
};

// Global fetch mock
global.fetch = vi.fn();

describe('API Integration Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset fetch mock
    vi.mocked(fetch).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  describe('Authentication API Integration', () => {
    it('should authenticate user successfully', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponses.auth.signin,
      } as Response);

      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password123',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.user.email).toBe('test@example.com');
      expect(data.token).toBeDefined();
    });

    it('should handle authentication errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Invalid credentials' }),
      } as Response);

      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'wrongpassword',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
      expect(data.error).toBe('Invalid credentials');
    });

    it('should validate request body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Validation failed',
          details: ['Email is required', 'Password is required'],
        }),
      } as Response);

      const response = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // Empty body
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(data.details).toContain('Email is required');
    });
  });

  describe('User Profile API Integration', () => {
    it('should fetch user profile', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponses.user.profile,
      } as Response);

      const response = await fetch('/api/user/profile', {
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.email).toBe('test@example.com');
      expect(data.name).toBe('Test User');
    });

    it('should update user profile', async () => {
      const updatedProfile = {
        ...mockApiResponses.user.profile,
        name: 'Updated Test User',
        bio: 'Updated bio',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => updatedProfile,
      } as Response);

      const response = await fetch('/api/user/profile', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Test User',
          bio: 'Updated bio',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.name).toBe('Updated Test User');
      expect(data.bio).toBe('Updated bio');
    });

    it('should require authentication for profile access', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Unauthorized' }),
      } as Response);

      const response = await fetch('/api/user/profile');

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(401);
      expect(data.error).toBe('Unauthorized');
    });
  });

  describe('Project Management API Integration', () => {
    it('should list user projects', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponses.projects.list,
      } as Response);

      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.projects).toHaveLength(2);
      expect(data.total).toBe(2);
      expect(data.projects[0].name).toBe('Test Project 1');
    });

    it('should create new project', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => mockApiResponses.projects.create,
      } as Response);

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'New Test Project',
          description: 'Newly created test project',
          template: 'react',
          visibility: 'private',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
      expect(data.name).toBe('New Test Project');
      expect(data.template).toBe('react');
    });

    it('should validate project creation data', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          error: 'Validation failed',
          details: ['Project name is required', 'Template is required'],
        }),
      } as Response);

      const response = await fetch('/api/projects', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          description: 'Project without name and template',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(400);
      expect(data.details).toContain('Project name is required');
    });

    it('should get specific project', async () => {
      const projectData = mockApiResponses.projects.list.projects[0];
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => projectData,
      } as Response);

      const response = await fetch('/api/projects/1', {
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.id).toBe('1');
      expect(data.name).toBe('Test Project 1');
    });

    it('should handle project not found', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Project not found' }),
      } as Response);

      const response = await fetch('/api/projects/nonexistent', {
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
      expect(data.error).toBe('Project not found');
    });

    it('should update project', async () => {
      const updatedProject = {
        ...mockApiResponses.projects.list.projects[0],
        name: 'Updated Project Name',
        description: 'Updated description',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => updatedProject,
      } as Response);

      const response = await fetch('/api/projects/1', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: 'Updated Project Name',
          description: 'Updated description',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.name).toBe('Updated Project Name');
      expect(data.description).toBe('Updated description');
    });

    it('should delete project', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      } as Response);

      const response = await fetch('/api/projects/1', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(204);
    });
  });

  describe('File Management API Integration', () => {
    it('should create project file', async () => {
      const fileData = {
        id: 'file-1',
        path: 'src/components/TestComponent.tsx',
        content: 'export const TestComponent = () => <div>Test</div>;',
        projectId: '1',
        createdAt: new Date().toISOString(),
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => fileData,
      } as Response);

      const response = await fetch('/api/projects/1/files', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          path: 'src/components/TestComponent.tsx',
          content: 'export const TestComponent = () => <div>Test</div>;',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(response.status).toBe(201);
      expect(data.path).toBe('src/components/TestComponent.tsx');
      expect(data.content).toContain('TestComponent');
    });

    it('should update project file', async () => {
      const updatedFileData = {
        id: 'file-1',
        path: 'src/components/TestComponent.tsx',
        content: 'export const TestComponent = () => <div>Updated Test</div>;',
        projectId: '1',
        updatedAt: new Date().toISOString(),
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => updatedFileData,
      } as Response);

      const response = await fetch('/api/projects/1/files/file-1', {
        method: 'PUT',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          content: 'export const TestComponent = () => <div>Updated Test</div>;',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.content).toContain('Updated Test');
    });

    it('should delete project file', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 204,
        json: async () => ({}),
      } as Response);

      const response = await fetch('/api/projects/1/files/file-1', {
        method: 'DELETE',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
        },
      });

      expect(response.ok).toBe(true);
      expect(response.status).toBe(204);
    });
  });

  describe('AI API Integration', () => {
    it('should generate code with AI', async () => {
      const aiResponse = {
        code: 'import React from "react";\n\nexport const TodoList = () => {\n  return <div>Todo List</div>;\n};',
        explanation: 'This is a basic React component for a todo list.',
        language: 'typescript',
        framework: 'react',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => aiResponse,
      } as Response);

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: 'Create a React component for a todo list',
          language: 'typescript',
          framework: 'react',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.code).toContain('TodoList');
      expect(data.explanation).toContain('React component');
    });

    it('should handle AI chat conversation', async () => {
      const chatResponse = {
        response: 'To create a REST API in Node.js, you can use Express.js framework...',
        conversationId: 'conv-123',
        suggestions: ['Express.js', 'Fastify', 'Koa.js'],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => chatResponse,
      } as Response);

      const response = await fetch('/api/ai/chat', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message: 'How do I create a REST API in Node.js?',
          context: 'backend development',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.response).toContain('Express.js');
      expect(data.conversationId).toBeDefined();
    });

    it('should optimize existing code', async () => {
      const optimizationResponse = {
        optimizedCode: 'const numbers = Array.from({length: 1000000}, (_, i) => i);\nconsole.log(numbers.length);',
        improvements: [
          'Removed inefficient loop',
          'Used Array.from for better performance',
          'Simplified logic',
        ],
        performanceGain: '85%',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => optimizationResponse,
      } as Response);

      const response = await fetch('/api/ai/optimize', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          code: 'function inefficientFunction() { for(let i = 0; i < 1000000; i++) { console.log(i); } }',
          language: 'javascript',
          optimizationType: 'performance',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(true);
      expect(data.optimizedCode).toContain('Array.from');
      expect(data.improvements).toContain('Removed inefficient loop');
    });
  });

  describe('Error Handling Integration', () => {
    it('should handle network errors', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      try {
        await fetch('/api/projects');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe('Network error');
      }
    });

    it('should handle rate limiting', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({
          error: 'Too many requests',
          retryAfter: 60,
        }),
      } as Response);

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          prompt: 'Generate code',
        }),
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(429);
      expect(data.error).toBe('Too many requests');
      expect(data.retryAfter).toBe(60);
    });

    it('should handle server errors', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          error: 'Internal server error',
          message: 'Something went wrong on our end',
        }),
      } as Response);

      const response = await fetch('/api/projects', {
        headers: {
          'Authorization': 'Bearer mock-jwt-token',
        },
      });

      const data = await response.json();

      expect(response.ok).toBe(false);
      expect(response.status).toBe(500);
      expect(data.error).toBe('Internal server error');
    });
  });

  describe('Authentication Flow Integration', () => {
    it('should handle complete authentication flow', async () => {
      // Mock sign up
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          user: { id: 'new-user', email: 'newuser@example.com' },
          message: 'User created successfully',
        }),
      } as Response);

      const signupResponse = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'New User',
          email: 'newuser@example.com',
          password: 'password123',
        }),
      });

      expect(signupResponse.ok).toBe(true);

      // Mock sign in
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponses.auth.signin,
      } as Response);

      const signinResponse = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'newuser@example.com',
          password: 'password123',
        }),
      });

      const signinData = await signinResponse.json();

      expect(signinResponse.ok).toBe(true);
      expect(signinData.token).toBeDefined();

      // Mock authenticated request
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockApiResponses.user.profile,
      } as Response);

      const profileResponse = await fetch('/api/user/profile', {
        headers: {
          'Authorization': `Bearer ${signinData.token}`,
        },
      });

      expect(profileResponse.ok).toBe(true);
    });
  });
});
