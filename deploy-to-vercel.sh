#!/bin/bash

# Vercel Deployment Script for Recoder.xyz CLI Authentication
# Run this to configure and deploy your CLI auth system

echo "🚀 Recoder.xyz - Vercel Deployment Setup"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if Vercel CLI is installed
if ! command -v vercel &> /dev/null; then
    echo -e "${YELLOW}📦 Installing Vercel CLI...${NC}"
    npm i -g vercel
fi

# Login to Vercel
echo -e "${YELLOW}🔑 Logging in to Vercel...${NC}"
vercel login

# Navigate to app directory
cd /Users/arhansubasi/recoder.xyz/app

# Link to project
echo -e "${YELLOW}🔗 Linking to Vercel project...${NC}"
vercel link

# Generate secrets
echo ""
echo -e "${GREEN}🔐 Generating Security Secrets...${NC}"
NEXTAUTH_SECRET=$(openssl rand -base64 32)
API_ENCRYPTION_KEY=$(openssl rand -hex 32)
JWT_SECRET=$(openssl rand -base64 32)

echo "Generated secrets (save these):"
echo "NEXTAUTH_SECRET: $NEXTAUTH_SECRET"
echo "API_ENCRYPTION_KEY: $API_ENCRYPTION_KEY"
echo "JWT_SECRET: $JWT_SECRET"
echo ""

# Prompt for environment variables
echo -e "${YELLOW}📝 Setting up environment variables...${NC}"
echo ""

read -p "Do you want to add environment variables now? (y/n): " ADD_ENV

if [ "$ADD_ENV" = "y" ]; then
    # NEXTAUTH_SECRET
    echo "$NEXTAUTH_SECRET" | vercel env add NEXTAUTH_SECRET production
    
    # NEXTAUTH_URL
    echo "https://recoder.xyz" | vercel env add NEXTAUTH_URL production
    
    # DATABASE_URL
    echo ""
    echo -e "${YELLOW}📊 Enter your PostgreSQL connection string:${NC}"
    read -p "DATABASE_URL: " DATABASE_URL
    echo "$DATABASE_URL" | vercel env add DATABASE_URL production
    
    # API_ENCRYPTION_KEY
    echo "$API_ENCRYPTION_KEY" | vercel env add API_ENCRYPTION_KEY production
    
    # JWT_SECRET
    echo "$JWT_SECRET" | vercel env add JWT_SECRET production
    
    # NEXT_PUBLIC_APP_URL
    echo "https://recoder.xyz" | vercel env add NEXT_PUBLIC_APP_URL production
    
    echo ""
    echo -e "${GREEN}✅ Environment variables configured!${NC}"
fi

# Deploy to production
echo ""
echo -e "${YELLOW}🚀 Deploying to production...${NC}"
vercel --prod

echo ""
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "🌐 Production URL: https://recoder.xyz"
echo "📊 Dashboard: https://vercel.com/arhansubas-projects/app"
echo ""
echo "🧪 Test CLI Authentication:"
echo "   cd ../packages/cli"
echo "   recoder auth login --web"
echo ""
echo "📝 Next Steps:"
echo "   1. Run database migrations"
echo "   2. Configure OAuth providers"
echo "   3. Test all authentication flows"
echo "   4. Visit https://recoder.xyz/settings/api-keys"
echo ""
