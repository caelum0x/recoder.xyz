#!/bin/bash

# 🚀 Recoder.xyz Vercel + Render Deployment Script
# Deploy frontend to Vercel, backend to Render (FREE TIER)

set -e  # Exit on any error

echo "🚀 Starting Recoder.xyz Vercel + Render Deployment..."
echo "====================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Vercel CLI is available
    if ! npx vercel --version &> /dev/null; then
        print_error "Cannot access Vercel CLI"
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Deploy to Vercel
deploy_to_vercel() {
    print_status "Deploying frontend applications to Vercel..."
    
    # Deploy main website
    print_status "Deploying main website (recoder.xyz)..."
    cd app
    npx vercel --prod --yes || print_error "Main website deployment failed"
    cd ..
    print_success "Main website deployed"
    
    # Deploy chat platform
    print_status "Deploying chat platform (chat.recoder.xyz)..."
    cd recoder-chat
    npx vercel --prod --yes || print_error "Chat platform deployment failed"
    cd ..
    print_success "Chat platform deployed"
}

# Instructions for Render deployment
render_instructions() {
    print_status "🏗️ Render Deployment Instructions..."
    
    echo ""
    echo "📋 RENDER DEPLOYMENT STEPS:"
    echo "=========================="
    echo ""
    echo "1. 🔗 Go to https://render.com and sign up/login"
    echo ""
    echo "2. 📂 Create New Web Services:"
    echo "   a) Backend API Service:"
    echo "      - Connect GitHub repo: recoder.xyz"
    echo "      - Root Directory: backend"
    echo "      - Build Command: npm install && npm run build"
    echo "      - Start Command: node dist/server.js"
    echo "      - Plan: Free"
    echo "      - Add Environment Variables from backend/render.yaml"
    echo "      - Add Custom Domain: api.recoder.xyz"
    echo ""
    echo "   b) Production Engine Service:"
    echo "      - Connect GitHub repo: recoder.xyz"
    echo "      - Root Directory: production-engine"
    echo "      - Build Command: npm install && npm run build"
    echo "      - Start Command: node dist/server.js"
    echo "      - Plan: Free"
    echo "      - Add Environment Variables from production-engine/render.yaml"
    echo "      - Add Custom Domain: engine.recoder.xyz"
    echo ""
    echo "3. 🚀 Deploy both services"
    echo ""
    echo "💡 Render YAML files have been created in backend/ and production-engine/"
}

# Configure domains
configure_domains() {
    print_status "Domain configuration instructions..."
    
    echo ""
    echo "📋 DNS CONFIGURATION:"
    echo "===================="
    echo ""
    echo "1. 🌐 Configure DNS in Namecheap:"
    echo "   - Login to Namecheap > Domain List > Manage > Advanced DNS"
    echo "   - Add these records:"
    echo ""
    echo "   Type    Host      Value"
    echo "   ----    ----      -----"
    echo "   A       @         [Get from Vercel main website]"
    echo "   CNAME   app       cname.vercel-dns.com"
    echo "   CNAME   chat      cname.vercel-dns.com"
    echo "   CNAME   api       [Get from Render backend service]"
    echo "   CNAME   engine    [Get from Render production-engine service]"
    echo "   CNAME   www       recoder.xyz"
    echo ""
    echo "2. 🔗 Configure Vercel domains:"
    echo "   - Go to each Vercel project dashboard"
    echo "   - Add custom domains:"
    echo "     • Main website: recoder.xyz"
    echo "     • Web platform: app.recoder.xyz"
    echo "     • Chat platform: chat.recoder.xyz"
    echo ""
    echo "3. 🔗 Configure Render custom domains:"
    echo "   - Go to Render dashboard for each service"
    echo "   - Add custom domains:"
    echo "     • Backend API: api.recoder.xyz"
    echo "     • Production Engine: engine.recoder.xyz"
    echo ""
}

# Test deployment
test_deployment() {
    print_status "Testing deployment..."
    
    print_status "Once DNS is configured, test these URLs:"
    echo "  https://recoder.xyz"
    echo "  https://app.recoder.xyz"
    echo "  https://chat.recoder.xyz"
    echo "  https://api.recoder.xyz/health"
    echo "  https://engine.recoder.xyz/health"
}

# Show costs
show_costs() {
    print_status "💰 Estimated Monthly Costs:"
    echo "=========================="
    echo "Vercel Pro (3 projects): $60/month"
    echo "Render (2 services): FREE TIER! 🎉"  
    echo "Neon Database: Free tier"
    echo "Domain (Namecheap): ~$12/year"
    echo ""
    echo "Total: ~$60/month (or FREE with Vercel free tier!)"
    echo ""
    echo "💡 Cost-saving (100% FREE option):"
    echo "- Use Vercel Free tier: $0"
    echo "- Use Render Free tier: $0"
    echo "- Use Neon Free tier: $0"
    echo "- Total: $0/month! 🚀"
}

# Main execution
main() {
    echo "Starting Vercel + Render deployment..."
    echo "Current directory: $(pwd)"
    
    check_prerequisites
    
    print_status "Login to Vercel..."
    npx vercel login || print_error "Vercel login failed"
    
    deploy_to_vercel
    render_instructions
    configure_domains
    test_deployment
    show_costs
    
    print_success "🎉 Frontend deployment completed!"
    print_warning "⚠️  Complete the Render deployment and DNS configuration steps above"
}

# Handle script interruption
trap 'print_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main

print_success "Deployment script completed! 🚀"