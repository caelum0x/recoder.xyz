// Vercel serverless function entry point
const express = require('express');
const { createServer } = require('../dist/server');

// Import the server from the built backend
let app;

const initializeApp = async () => {
  if (!app) {
    // Import the server setup
    app = express();
    
    // Set up CORS
    app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Basic health check
    app.get('/health', (req, res) => {
      res.json({ status: 'ok', timestamp: new Date().toISOString() });
    });

    // Basic API routes
    app.get('/api', (req, res) => {
      res.json({ 
        message: 'Recoder Backend API', 
        version: '1.0.0',
        endpoints: ['/health', '/api/generate', '/api/chat']
      });
    });

    // Placeholder for main functionality
    app.post('/api/generate', (req, res) => {
      res.json({ 
        message: 'Code generation endpoint',
        status: 'active',
        data: req.body 
      });
    });

    app.post('/api/chat', (req, res) => {
      res.json({ 
        message: 'Chat endpoint',
        status: 'active',
        data: req.body 
      });
    });

    // Catch all other routes
    app.use('*', (req, res) => {
      res.status(404).json({ error: 'Route not found' });
    });
  }
  
  return app;
};

module.exports = async (req, res) => {
  const app = await initializeApp();
  return app(req, res);
};
