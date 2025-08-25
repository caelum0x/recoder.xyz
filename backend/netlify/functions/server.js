const serverless = require('serverless-http');

// Set environment to production for serverless
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

// Import the compiled Express app
const app = require('../../dist/server');

// Wrap the Express app with serverless-http
const handler = serverless(app);

module.exports.handler = async (event, context) => {
  // Add serverless context
  context.callbackWaitsForEmptyEventLoop = false;
  
  // Call the handler
  return await handler(event, context);
};
