#!/bin/bash

# 🚀 Recoder.xyz Production Domain Deployment Script
# This script deploys all 5 platforms to actual domains with SSL certificates

set -e  # Exit on any error

echo "🚀 Starting Recoder.xyz Production Domain Deployment..."
echo "=================================================="

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
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

# Check if running as root or with sudo
check_permissions() {
    if [[ $EUID -ne 0 ]]; then
        print_error "This script must be run as root or with sudo"
        exit 1
    fi
}

# Check prerequisites
check_prerequisites() {
    print_status "Checking prerequisites..."
    
    # Check if Docker is installed
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check if Docker Compose is installed
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if environment file exists
    if [ ! -f .env.production ]; then
        print_error ".env.production file not found. Please copy .env.production.template and configure it."
        exit 1
    fi
    
    print_success "Prerequisites check passed"
}

# Create necessary directories
create_directories() {
    print_status "Creating necessary directories..."
    
    mkdir -p /opt/recoder/{logs,data,certs}
    mkdir -p ./monitoring/{prometheus,grafana}/{config,data}
    mkdir -p ./database/init
    
    print_success "Directories created"
}

# Generate SSL certificates directory structure
setup_ssl() {
    print_status "Setting up SSL certificate structure..."
    
    mkdir -p ./certs/letsencrypt
    chmod 600 ./certs/letsencrypt
    
    print_success "SSL structure ready"
}

# Build all Docker images
build_images() {
    print_status "Building Docker images for production..."
    
    # Build main website
    print_status "Building main website..."
    docker build -t recoder/main-web:latest ./app
    
    # Build backend API
    print_status "Building backend API..."
    docker build -t recoder/backend-api:latest ./backend
    
    # Build production engine
    print_status "Building production engine..."
    docker build -t recoder/production-engine:latest ./production-engine
    
    # Build recoder web platform
    print_status "Building recoder web platform..."
    docker build -t recoder/recoder-web:latest ./recoder-web
    
    # Build chat platform
    print_status "Building chat platform..."
    docker build -t recoder/recoder-chat:latest ./recoder-chat
    
    print_success "All Docker images built successfully"
}

# Set up database
setup_database() {
    print_status "Setting up database..."
    
    # Start PostgreSQL container first
    docker-compose -f docker-compose.domains.yml up -d postgres
    
    # Wait for database to be ready
    print_status "Waiting for database to be ready..."
    sleep 30
    
    # Run database migrations
    print_status "Running database migrations..."
    docker-compose -f docker-compose.domains.yml exec backend-api npm run prisma:migrate:deploy
    
    print_success "Database setup complete"
}

# Deploy all services
deploy_services() {
    print_status "Deploying all services..."
    
    # Start all services
    docker-compose -f docker-compose.domains.yml up -d
    
    # Wait for services to be healthy
    print_status "Waiting for services to become healthy..."
    sleep 60
    
    print_success "All services deployed"
}

# Verify deployment
verify_deployment() {
    print_status "Verifying deployment..."
    
    # Check if services are running
    if ! docker-compose -f docker-compose.domains.yml ps | grep -q "Up"; then
        print_error "Some services are not running properly"
        exit 1
    fi
    
    # Test health endpoints (will work once domains are configured)
    print_warning "Domain health checks will work once DNS is configured:"
    echo "  - https://recoder.xyz/health"
    echo "  - https://api.recoder.xyz/health" 
    echo "  - https://engine.recoder.xyz/health"
    echo "  - https://app.recoder.xyz/health"
    echo "  - https://chat.recoder.xyz/health"
    
    print_success "Deployment verification complete"
}

# Show next steps
show_next_steps() {
    print_success "🎉 Deployment completed successfully!"
    echo ""
    echo "📋 NEXT STEPS:"
    echo "=============="
    echo ""
    echo "1. 🌐 Configure DNS records for your domain:"
    echo "   Point these domains to your server IP address:"
    echo "   - recoder.xyz"
    echo "   - api.recoder.xyz"
    echo "   - engine.recoder.xyz"
    echo "   - app.recoder.xyz"
    echo "   - chat.recoder.xyz"
    echo ""
    echo "2. 🔒 SSL certificates will be automatically generated by Let's Encrypt"
    echo "   once DNS propagation is complete (usually 5-10 minutes)"
    echo ""
    echo "3. 📊 Access monitoring dashboards:"
    echo "   - Traefik: https://traefik.recoder.xyz:8080"
    echo "   - Grafana: https://monitoring.recoder.xyz"
    echo "   - Prometheus: https://metrics.recoder.xyz"
    echo ""
    echo "4. 🔧 Monitor logs:"
    echo "   docker-compose -f docker-compose.domains.yml logs -f"
    echo ""
    echo "5. 🚀 Once DNS is configured, test your domains:"
    echo "   curl -I https://recoder.xyz"
    echo "   curl -I https://api.recoder.xyz/health"
    echo ""
}

# Main execution
main() {
    echo "Starting deployment process..."
    echo "Current directory: $(pwd)"
    
    check_prerequisites
    create_directories
    setup_ssl
    build_images
    setup_database
    deploy_services
    verify_deployment
    show_next_steps
}

# Handle script interruption
trap 'print_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main

print_success "Deployment script completed successfully! 🚀"