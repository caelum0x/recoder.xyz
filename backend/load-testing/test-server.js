// Simple test server for load testing validation
// Simulates the Recoder.xyz API without database dependencies

const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// Simulate response times and processing
const simulateProcessing = (minMs = 10, maxMs = 100) => {
  return new Promise(resolve => {
    const delay = Math.random() * (maxMs - minMs) + minMs;
    setTimeout(resolve, delay);
  });
};

// Generate random data for testing
const generateRandomCode = (complexity = 'simple') => {
  const templates = {
    simple: `function helloWorld() {\n  return "Hello, World!";\n}`,
    medium: `class ApiClient {\n  constructor(baseUrl) {\n    this.baseUrl = baseUrl;\n  }\n  async get(endpoint) {\n    return fetch(\`\${this.baseUrl}/\${endpoint}\`);\n  }\n}`,
    complex: `// Complex microservices architecture\nclass MicroserviceOrchestrator {\n  constructor() {\n    this.services = new Map();\n    this.loadBalancer = new LoadBalancer();\n  }\n  async deployService(service) {\n    // Complex deployment logic\n  }\n}`
  };
  return templates[complexity] || templates.simple;
};

// Routes

// Health check
app.get('/health', async (req, res) => {
  await simulateProcessing(5, 20);
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    systems: {
      aiProviders: 'healthy',
      cache: 'healthy',
      database: 'healthy'
    },
    performance: {
      activeFailovers: 0,
      cacheHitRate: 0.75,
      dbUtilization: 0.45
    }
  });
});

// Metrics endpoint
app.get('/metrics', async (req, res) => {
  await simulateProcessing(10, 50);
  res.json({
    performance: {
      status: 'healthy',
      score: 95,
      activeAlerts: 0,
      metrics: {
        responseTime: { avg: 150, p95: 300 },
        throughput: { rps: 500 + Math.random() * 200 },
        system: { cpu: 45 + Math.random() * 10, memory: 60 + Math.random() * 10 },
        errors: { rate: Math.random() * 0.02 }
      }
    },
    cache: {
      status: 'healthy',
      hitRate: 0.7 + Math.random() * 0.2,
      connected: true
    },
    timestamp: new Date().toISOString()
  });
});

// Authentication
app.post('/api/auth/login', async (req, res) => {
  await simulateProcessing(50, 200);
  const { email, password } = req.body;
  
  if (email && password) {
    res.json({
      token: `test-token-${Date.now()}`,
      user: { id: 'test-user', email },
      expires: new Date(Date.now() + 3600000).toISOString()
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
});

app.get('/api/auth/me', async (req, res) => {
  await simulateProcessing(20, 100);
  const auth = req.headers.authorization;
  
  if (auth && auth.startsWith('Bearer ')) {
    res.json({
      id: 'test-user',
      email: 'test@recoder.xyz',
      subscription: 'enterprise'
    });
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
});

// AI Generation - Main feature
app.post('/api/ai/generate', async (req, res) => {
  const { prompt, context = {}, constraints = {} } = req.body;
  const complexity = context.complexity || 'simple';
  
  // Simulate AI processing time based on complexity
  const processingTime = {
    simple: [100, 500],
    medium: [200, 1000],
    complex: [500, 2000]
  };
  
  const [min, max] = processingTime[complexity] || processingTime.simple;
  await simulateProcessing(min, max);
  
  // Simulate cache hits
  const cacheHit = context.useCache && Math.random() > 0.3;
  if (cacheHit) {
    res.set('X-Cache-Status', 'hit');
    await simulateProcessing(10, 50); // Fast cache response
  } else {
    res.set('X-Cache-Status', 'miss');
  }
  
  // Simulate occasional errors for realistic testing
  if (Math.random() < 0.02) { // 2% error rate
    return res.status(500).json({
      error: 'AI provider temporarily unavailable',
      code: 'AI_PROVIDER_ERROR',
      retryAfter: 5
    });
  }
  
  res.json({
    result: generateRandomCode(complexity),
    metadata: {
      provider: 'test-provider',
      model: `test-model-${complexity}`,
      tokens: 100 + Math.random() * 500,
      cost: 0.001 + Math.random() * 0.01,
      processingTime: max - min + Math.random() * (max - min),
      cached: cacheHit
    },
    timestamp: new Date().toISOString()
  });
});

// AI Chat
app.post('/api/ai/chat', async (req, res) => {
  const { message, context = {} } = req.body;
  
  await simulateProcessing(200, 800);
  
  res.json({
    response: `I understand you're asking about: "${message}". Here's a helpful response with code examples and best practices.`,
    metadata: {
      provider: 'test-chat-provider',
      tokens: 50 + Math.random() * 200,
      useRAG: context.useRAG || false
    },
    timestamp: new Date().toISOString()
  });
});

// AI Providers
app.get('/api/ai/providers', async (req, res) => {
  await simulateProcessing(30, 100);
  
  res.json({
    providers: [
      { id: 'anthropic', name: 'Claude', status: 'healthy', priority: 1 },
      { id: 'groq', name: 'Groq', status: 'healthy', priority: 2 },
      { id: 'gemini', name: 'Gemini', status: 'healthy', priority: 3 },
      { id: 'deepseek', name: 'DeepSeek', status: 'degraded', priority: 4 }
    ]
  });
});

// RAG System
app.post('/api/rag/analyze', async (req, res) => {
  const { code, language, analysisType } = req.body;
  
  await simulateProcessing(300, 1500); // RAG analysis takes longer
  
  res.json({
    analysis: {
      complexity: Math.random() > 0.5 ? 'medium' : 'high',
      quality: 0.7 + Math.random() * 0.3,
      suggestions: [
        'Consider using async/await for better readability',
        'Add error handling for edge cases',
        'Optimize for performance with caching'
      ]
    },
    insights: {
      patterns: ['functional-programming', 'error-handling'],
      performance: 'good',
      security: 'secure'
    },
    processingTime: 1000 + Math.random() * 500
  });
});

app.get('/api/rag/search', async (req, res) => {
  const { q } = req.query;
  
  await simulateProcessing(100, 500);
  
  res.json({
    results: [
      {
        title: 'Authentication Best Practices',
        snippet: 'Secure authentication implementation with JWT...',
        relevance: 0.9,
        source: 'internal-docs'
      },
      {
        title: 'Node.js Security Guide',
        snippet: 'Comprehensive security practices for Node.js...',
        relevance: 0.8,
        source: 'community'
      }
    ],
    totalResults: 15,
    processingTime: 200 + Math.random() * 300
  });
});

app.post('/api/rag/embed', async (req, res) => {
  const { content, type } = req.body;
  
  await simulateProcessing(200, 800);
  
  // Generate fake embedding vector
  const embedding = Array.from({ length: 1536 }, () => Math.random() * 2 - 1);
  
  res.json({
    embedding,
    dimensions: 1536,
    model: 'test-embedding-model',
    processingTime: 500 + Math.random() * 300
  });
});

// Projects
app.get('/api/projects', async (req, res) => {
  await simulateProcessing(50, 200);
  
  res.json({
    projects: [
      { id: '1', name: 'E-commerce App', status: 'active', createdAt: new Date().toISOString() },
      { id: '2', name: 'API Gateway', status: 'completed', createdAt: new Date().toISOString() }
    ],
    total: 2
  });
});

app.post('/api/projects', async (req, res) => {
  const { name, description, template } = req.body;
  
  await simulateProcessing(100, 500);
  
  res.status(201).json({
    id: Date.now().toString(),
    name,
    description,
    template,
    status: 'created',
    createdAt: new Date().toISOString()
  });
});

// Templates
app.get('/api/templates', async (req, res) => {
  await simulateProcessing(30, 150);
  
  res.json({
    templates: [
      { id: 'basic-web-app', name: 'Basic Web App', category: 'web' },
      { id: 'api-server', name: 'API Server', category: 'backend' },
      { id: 'microservice', name: 'Microservice', category: 'architecture' }
    ]
  });
});

// Analytics
app.get('/api/analytics/usage', async (req, res) => {
  await simulateProcessing(100, 400);
  
  res.json({
    usage: {
      requests: 1500 + Math.random() * 500,
      tokens: 50000 + Math.random() * 20000,
      cost: 15.50 + Math.random() * 10,
      period: 'current_month'
    },
    trends: {
      growth: 0.15 + Math.random() * 0.1,
      peakHours: [9, 10, 11, 14, 15, 16]
    }
  });
});

// Billing
app.get('/api/billing/subscription', async (req, res) => {
  await simulateProcessing(50, 200);
  
  res.json({
    plan: 'enterprise',
    status: 'active',
    billing: {
      current: 125.50,
      nextBillingDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    }
  });
});

// Error simulation middleware
app.use((req, res, next) => {
  // Randomly simulate server errors (very low rate)
  if (Math.random() < 0.001) { // 0.1% chance of server error
    return res.status(500).json({
      error: 'Internal server error',
      code: 'RANDOM_SERVER_ERROR'
    });
  }
  next();
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    path: req.originalUrl
  });
});

// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Test server running on port ${PORT}`);
  console.log(`📊 Ready for load testing`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`📈 Metrics: http://localhost:${PORT}/metrics`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('Shutting down test server...');
  server.close();
});

module.exports = app;