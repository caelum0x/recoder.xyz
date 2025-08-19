/**
 * Monitoring Dashboard Data Endpoint
 * Provides real-time data for the monitoring dashboard
 */

const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

// Dashboard data (in production, this would come from your monitoring database)
let dashboardData = {
  "timestamp": "2025-08-19T21:21:24.856Z",
  "services": {
    "backend": {
      "status": "healthy",
      "responseTime": 19,
      "lastCheck": "2025-08-19T21:21:24.879Z",
      "metrics": {},
      "uptime": "Unknown",
      "version": "Unknown"
    },
    "productionEngine": {
      "status": "healthy",
      "responseTime": 2,
      "lastCheck": "2025-08-19T21:21:24.882Z",
      "metrics": {},
      "uptime": 227.398783542,
      "version": "1.0.0"
    },
    "webPlatform": {
      "status": "healthy",
      "responseTime": 213,
      "lastCheck": "2025-08-19T21:21:25.095Z",
      "metrics": {},
      "uptime": 89862.9228275,
      "version": "1.0.0"
    },
    "chatPlatform": {
      "status": "healthy",
      "responseTime": 8,
      "lastCheck": "2025-08-19T21:21:25.103Z",
      "metrics": {},
      "uptime": "Unknown",
      "version": "1.0.0"
    }
  },
  "metrics": {
    "systemHealth": {
      "overall": "healthy",
      "healthyServices": 4,
      "totalServices": 4,
      "availabilityPercentage": "100.0"
    }
  },
  "alerts": [
    {
      "id": "alert_1755638485104_oajtr209y",
      "type": "security",
      "title": "Critical Security Issues",
      "message": "2 critical security issues detected",
      "severity": "critical",
      "timestamp": "2025-08-19T21:21:25.104Z",
      "resolved": false
    }
  ],
  "performance": {
    "responseTime": {
      "avg": 61,
      "p95": 213,
      "p99": 0
    },
    "throughput": {
      "rps": 0,
      "rpm": 0
    },
    "errorRate": 0,
    "availability": 100,
    "systemLoad": {
      "cpu": 43,
      "memory": 47,
      "disk": 23
    }
  },
  "security": {
    "securityScore": 83.3,
    "criticalIssues": 2,
    "authAttempts": 128,
    "rateLimitHits": 17,
    "securityEvents": [],
    "lastSecurityScan": "2025-08-19T21:15:38.660Z"
  },
  "business": {
    "users": {
      "total": 5118,
      "active": 1952,
      "new": 68
    },
    "aiRequests": {
      "total": 27063,
      "successful": 32783,
      "failed": 0,
      "successRate": "121.1"
    },
    "costOptimization": {
      "totalSavings": 2307,
      "freeModelUsage": 80,
      "avgCostPerRequest": "0.0073"
    },
    "revenue": {
      "monthly": 17579,
      "daily": 1095,
      "arpu": "44.77"
    }
  }
};

// Real-time data endpoint
app.get('/api/dashboard/data', (req, res) => {
  // Update timestamp
  dashboardData.timestamp = new Date();
  
  // Simulate real-time metric updates
  if (dashboardData.performance) {
    dashboardData.performance.systemLoad.cpu = Math.round(Math.random() * 30 + 20);
    dashboardData.performance.systemLoad.memory = Math.round(Math.random() * 20 + 40);
  }

  res.json(dashboardData);
});

// Health endpoint for the dashboard service itself
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'monitoring-dashboard',
    timestamp: new Date(),
    uptime: process.uptime()
  });
});

const PORT = process.env.DASHBOARD_PORT || 3005;
app.listen(PORT, () => {
  console.log(`📊 Monitoring Dashboard API running on port ${PORT}`);
  console.log(`🌐 Dashboard data: http://localhost:${PORT}/api/dashboard/data`);
});

module.exports = app;