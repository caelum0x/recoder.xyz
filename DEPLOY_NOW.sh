#!/bin/bash

# 🚀 Quick Deployment Script

echo "🚀 Recoder.xyz Deployment"
echo "========================="
echo ""
echo "This will deploy your backend and frontend to Vercel."
echo ""

read -p "Continue? (y/n) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    exit 1
fi

echo ""
echo "📦 Deploying Backend..."
cd backend && vercel --prod
echo ""

echo "📦 Deploying Frontend..."
cd ../app && vercel --prod
echo ""

echo "✅ Deployment complete!"
echo ""
echo "Next: Configure payment providers and webhooks"
echo "See DEPLOYMENT_READY.md for details"

cd ..
