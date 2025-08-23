#!/bin/bash

# 🚀 Recoder.xyz Vercel + Railway Deployment Script
# Deploy frontend to Vercel, backend to Railway

set -e  # Exit on any error

echo "🚀 Starting Recoder.xyz Vercel + Railway Deployment..."
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
    
    # Check if Vercel CLI is installed
    if ! command -v vercel &> /dev/null; then
        print_error "Vercel CLI is not installed. Installing..."
        npm install -g vercel
    fi
    
    # Check if Railway CLI is installed
    if ! command -v railway &> /dev/null; then
        print_error "Railway CLI is not installed. Installing..."
        npm install -g @railway/cli
    fi
    
    print_success "Prerequisites check passed"
}

# Deploy to Vercel
deploy_to_vercel() {
    print_status "Deploying frontend applications to Vercel..."
    
    # Deploy main website
    print_status "Deploying main website (recoder.xyz)..."
    cd app
    vercel --prod --yes
    cd ..
    print_success "Main website deployed"
    
    # Deploy web platform
    print_status "Deploying web platform (app.recoder.xyz)..."
    cd recoder-web
    vercel --prod --yes
    cd ..
    print_success "Web platform deployed"
    
    # Deploy chat platform
    print_status "Deploying chat platform (chat.recoder.xyz)..."
    cd recoder-chat
    vercel --prod --yes
    cd ..
    print_success "Chat platform deployed"
}

# Deploy to Railway
deploy_to_railway() {
    print_status "Deploying backend services to Railway..."
    
    # Deploy backend API
    print_status "Deploying backend API..."
    cd backend
    railway up --detach
    cd ..
    print_success "Backend API deployed"
    
    # Deploy production engine
    print_status "Deploying production engine..."
    cd production-engine
    railway up --detach
    cd ..
    print_success "Production engine deployed"
}

# Configure domains
configure_domains() {
    print_status "Domain configuration instructions..."
    
    echo ""
    echo "📋 MANUAL STEPS REQUIRED:"
    echo "========================"
    echo ""
    echo "1. 🌐 Configure DNS in Namecheap:"
    echo "   - Login to Namecheap > Domain List > Manage > Advanced DNS"
    echo "   - Add these records:"
    echo ""
    echo "   Type    Host      Value"
    echo "   ----    ----      -----"
    echo "   A       @         [Get from Railway backend deployment]"
    echo "   A       api       [Get from Railway backend deployment]"
    echo "   A       engine    [Get from Railway production-engine deployment]"
    echo "   CNAME   app       cname.vercel-dns.com"
    echo "   CNAME   chat      cname.vercel-dns.com"
    echo "   CNAME   www       recoder.xyz"
    echo ""
    echo "2. 🔗 Configure Vercel domains:"
    echo "   - Go to each Vercel project dashboard"
    echo "   - Add custom domains:"
    echo "     • Main website: recoder.xyz"
    echo "     • Web platform: app.recoder.xyz"
    echo "     • Chat platform: chat.recoder.xyz"
    echo ""
    echo "3. 🔗 Configure Railway custom domains:"
    echo "   - Go to Railway dashboard"
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
    echo "Railway (2 services): $10-20/month"  
    echo "Neon Database: Free tier (already using)"
    echo "Domain (Namecheap): ~$12/year"
    echo ""
    echo "Total: ~$70-80/month"
    echo ""
    echo "💡 Cost-saving alternatives:"
    echo "- Use Vercel Free tier: $0 (with limitations)"
    echo "- Use free Railway tier: $0 (with limitations)"
    echo "- Total with free tiers: $0/month"
}

# Main execution
main() {
    echo "Starting Vercel + Railway deployment..."
    echo "Current directory: $(pwd)"
    
    check_prerequisites
    
    print_status "Login to Vercel..."
    vercel login
    
    print_status "Login to Railway..."
    railway login
    
    deploy_to_vercel
    deploy_to_railway
    configure_domains
    test_deployment
    show_costs
    
    print_success "🎉 Deployment preparation completed!"
    print_warning "⚠️  Complete the manual DNS configuration steps above"
}

# Handle script interruption
trap 'print_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main

print_success "Deployment script completed! 🚀"