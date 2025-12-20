#!/bin/bash

# Production deployment for docker-backend
set -e

echo "🚀 Deploying docker-backend to production..."

# Build the project
npm run build

# Stop existing PM2 process
pm2 stop docker-backend 2>/dev/null || true
pm2 delete docker-backend 2>/dev/null || true

# Start with PM2
pm2 start dist/server.js --name docker-backend --env production

# Save PM2 configuration
pm2 save

echo "✅ Docker backend deployed successfully"
echo "📊 Status: pm2 status"
pm2 status
