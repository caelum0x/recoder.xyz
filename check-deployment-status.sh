#!/bin/bash

# 🔍 Recoder.xyz Production Deployment Status Checker
# Use this script to verify your deployment after running deploy-to-domains.sh

echo "🔍 Checking Recoder.xyz Deployment Status..."
echo "=============================================="

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_status() {
    echo -e "${BLUE}[CHECK]${NC} $1"
}

print_success() {
    echo -e "${GREEN}[✅]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[⚠️]${NC} $1"
}

print_error() {
    echo -e "${RED}[❌]${NC} $1"
}

# Check if Docker services are running
check_docker_services() {
    print_status "Checking Docker services..."
    
    if docker-compose -f docker-compose.domains.yml ps | grep -q "Up"; then
        print_success "Docker services are running"
        docker-compose -f docker-compose.domains.yml ps
    else
        print_error "Docker services are not running"
        return 1
    fi
}

# Check domain health endpoints
check_domain_health() {
    print_status "Checking domain health endpoints..."
    
    domains=(
        "https://recoder.xyz"
        "https://api.recoder.xyz/health"
        "https://engine.recoder.xyz/health"
        "https://app.recoder.xyz"
        "https://chat.recoder.xyz"
    )
    
    for domain in "${domains[@]}"; do
        print_status "Testing $domain..."
        
        if curl -sf --max-time 10 "$domain" > /dev/null 2>&1; then
            print_success "$domain is responding"
        else
            print_warning "$domain is not responding (may be due to DNS not propagated yet)"
        fi
    done
}

# Check local health endpoints (fallback if domains not ready)
check_local_health() {
    print_status "Checking local service endpoints..."
    
    local_endpoints=(
        "http://localhost:3000"
        "http://localhost:3001/health"
        "http://localhost:3002/health"
    )
    
    for endpoint in "${local_endpoints[@]}"; do
        if curl -sf --max-time 5 "$endpoint" > /dev/null 2>&1; then
            print_success "$endpoint is responding"
        else
            print_error "$endpoint is not responding"
        fi
    done
}

# Check SSL certificates
check_ssl_certificates() {
    print_status "Checking SSL certificates..."
    
    domains=("recoder.xyz" "api.recoder.xyz" "engine.recoder.xyz" "app.recoder.xyz" "chat.recoder.xyz")
    
    for domain in "${domains[@]}"; do
        print_status "Checking SSL for $domain..."
        
        if echo | timeout 5 openssl s_client -servername "$domain" -connect "$domain:443" -verify_hostname "$domain" 2>/dev/null | grep -q "Verify return code: 0"; then
            print_success "SSL certificate for $domain is valid"
        else
            print_warning "SSL certificate for $domain is not ready (Let's Encrypt may still be generating)"
        fi
    done
}

# Check DNS resolution
check_dns() {
    print_status "Checking DNS resolution..."
    
    domains=("recoder.xyz" "api.recoder.xyz" "engine.recoder.xyz" "app.recoder.xyz" "chat.recoder.xyz")
    
    for domain in "${domains[@]}"; do
        if nslookup "$domain" > /dev/null 2>&1; then
            print_success "$domain DNS resolves"
        else
            print_warning "$domain DNS not resolving yet"
        fi
    done
}

# Main execution
main() {
    echo "Starting deployment status check..."
    echo ""
    
    # Check Docker services first
    if check_docker_services; then
        echo ""
        check_local_health
        echo ""
        check_dns
        echo ""
        check_domain_health
        echo ""
        check_ssl_certificates
    else
        print_error "Docker services are not running. Please run deploy-to-domains.sh first."
        exit 1
    fi
    
    echo ""
    echo "📋 NEXT STEPS IF DOMAINS NOT WORKING:"
    echo "======================================"
    echo "1. Ensure DNS records point to your server IP"
    echo "2. Wait 5-10 minutes for DNS propagation"
    echo "3. Wait for Let's Encrypt SSL certificate generation"
    echo "4. Check Docker logs: docker-compose -f docker-compose.domains.yml logs"
    echo ""
    print_success "Status check completed!"
}

# Run main function
main