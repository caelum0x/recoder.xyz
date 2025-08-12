#!/bin/bash

# Recoder.xyz Deployment Validation Script
# Comprehensive testing for production deployment

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Configuration
DOMAIN="${1:-recoder.xyz}"
COMPOSE_FILE="docker-compose.domain.yml"
ENV_FILE=".env.domain"

# Test results
PASSED_TESTS=0
FAILED_TESTS=0
TOTAL_TESTS=0

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[✓ PASS]${NC} $1"
    ((PASSED_TESTS++))
}

log_fail() {
    echo -e "${RED}[✗ FAIL]${NC} $1"
    ((FAILED_TESTS++))
}

log_warning() {
    echo -e "${YELLOW}[⚠ WARN]${NC} $1"
}

log_test() {
    echo -e "${PURPLE}[TEST]${NC} $1"
    ((TOTAL_TESTS++))
}

# Banner
show_banner() {
    echo -e "${CYAN}"
    echo "=============================================="
    echo "  RECODER.XYZ DEPLOYMENT VALIDATION"
    echo "=============================================="
    echo -e "${NC}"
    echo "🔍 Domain: $DOMAIN"
    echo "🧪 Testing: Infrastructure, Security, Performance"
    echo "📊 Report: Comprehensive validation results"
    echo ""
}

# Test DNS resolution
test_dns_resolution() {
    echo -e "${CYAN}🌐 DNS RESOLUTION TESTS${NC}"
    echo "======================================"
    
    local subdomains=("" "chat" "api" "engine" "traefik" "grafana" "prometheus" "ollama")
    
    for subdomain in "${subdomains[@]}"; do
        local test_domain="${subdomain:+$subdomain.}$DOMAIN"
        log_test "DNS resolution for $test_domain"
        
        if nslookup "$test_domain" &> /dev/null; then
            log_success "DNS resolves for $test_domain"
        else
            log_fail "DNS does not resolve for $test_domain"
        fi
    done
    echo ""
}

# Test SSL certificates
test_ssl_certificates() {
    echo -e "${CYAN}🔒 SSL CERTIFICATE TESTS${NC}"
    echo "======================================"
    
    local ssl_domains=("$DOMAIN" "chat.$DOMAIN" "api.$DOMAIN" "engine.$DOMAIN")
    
    for domain in "${ssl_domains[@]}"; do
        log_test "SSL certificate for $domain"
        
        # Check certificate validity
        if openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null | openssl x509 -noout -dates &> /dev/null; then
            log_success "Valid SSL certificate for $domain"
            
            # Check certificate expiry
            local expiry_date=$(openssl s_client -connect "$domain:443" -servername "$domain" </dev/null 2>/dev/null | openssl x509 -noout -enddate | cut -d= -f2)
            local expiry_timestamp=$(date -d "$expiry_date" +%s)
            local current_timestamp=$(date +%s)
            local days_until_expiry=$(( (expiry_timestamp - current_timestamp) / 86400 ))
            
            if [[ $days_until_expiry -gt 30 ]]; then
                log_success "SSL certificate for $domain expires in $days_until_expiry days"
            elif [[ $days_until_expiry -gt 7 ]]; then
                log_warning "SSL certificate for $domain expires in $days_until_expiry days (renew soon)"
            else
                log_fail "SSL certificate for $domain expires in $days_until_expiry days (critical)"
            fi
        else
            log_fail "Invalid or missing SSL certificate for $domain"
        fi
    done
    echo ""
}

# Test service endpoints
test_service_endpoints() {
    echo -e "${CYAN}🚀 SERVICE ENDPOINT TESTS${NC}"
    echo "======================================"
    
    local endpoints=(
        "https://$DOMAIN:Main Website"
        "https://chat.$DOMAIN:Chat Platform"
        "https://api.$DOMAIN/api/health:Backend API Health"
        "https://engine.$DOMAIN/api/health:Production Engine Health"
        "https://grafana.$DOMAIN:Grafana Dashboard"
        "https://prometheus.$DOMAIN:Prometheus Metrics"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local url="${endpoint%:*}"
        local name="${endpoint#*:}"
        
        log_test "Service endpoint: $name"
        
        local response_code=$(curl -s -o /dev/null -w "%{http_code}" -k --max-time 10 "$url" || echo "000")
        
        if [[ "$response_code" -ge 200 && "$response_code" -lt 400 ]]; then
            log_success "$name responding (HTTP $response_code)"
        elif [[ "$response_code" -eq 401 || "$response_code" -eq 403 ]]; then
            log_success "$name protected (HTTP $response_code - auth required)"
        else
            log_fail "$name not responding (HTTP $response_code)"
        fi
    done
    echo ""
}

# Test security headers
test_security_headers() {
    echo -e "${CYAN}🛡️ SECURITY HEADER TESTS${NC}"
    echo "======================================"
    
    local test_url="https://$DOMAIN"
    log_test "Security headers for $test_url"
    
    local headers=$(curl -I -s -k --max-time 10 "$test_url" 2>/dev/null || echo "FAILED")
    
    if [[ "$headers" == "FAILED" ]]; then
        log_fail "Could not fetch headers from $test_url"
        echo ""
        return
    fi
    
    # Check specific security headers
    local security_headers=(
        "Strict-Transport-Security:HSTS"
        "X-Frame-Options:Frame Protection"
        "X-Content-Type-Options:Content Type Protection"
        "Referrer-Policy:Referrer Policy"
    )
    
    for header_check in "${security_headers[@]}"; do
        local header="${header_check%:*}"
        local name="${header_check#*:}"
        
        if echo "$headers" | grep -qi "$header"; then
            log_success "$name header present"
        else
            log_fail "$name header missing"
        fi
    done
    
    # Check for insecure headers
    if echo "$headers" | grep -qi "server:"; then
        log_warning "Server header exposed (information disclosure)"
    else
        log_success "Server header hidden"
    fi
    
    echo ""
}

# Test Docker containers
test_docker_containers() {
    echo -e "${CYAN}🐳 DOCKER CONTAINER TESTS${NC}"
    echo "======================================"
    
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_fail "Docker Compose file $COMPOSE_FILE not found"
        echo ""
        return
    fi
    
    local services=$(docker-compose -f "$COMPOSE_FILE" config --services 2>/dev/null || echo "")
    
    if [[ -z "$services" ]]; then
        log_fail "Could not read Docker Compose services"
        echo ""
        return
    fi
    
    while IFS= read -r service; do
        log_test "Docker service: $service"
        
        local container_status=$(docker-compose -f "$COMPOSE_FILE" ps -q "$service" 2>/dev/null | xargs docker inspect --format='{{.State.Status}}' 2>/dev/null || echo "not_found")
        
        case "$container_status" in
            "running")
                log_success "Service $service is running"
                ;;
            "exited")
                log_fail "Service $service has exited"
                ;;
            "not_found")
                log_fail "Service $service container not found"
                ;;
            *)
                log_warning "Service $service status: $container_status"
                ;;
        esac
    done <<< "$services"
    echo ""
}

# Test database connectivity
test_database_connectivity() {
    echo -e "${CYAN}💾 DATABASE CONNECTIVITY TESTS${NC}"
    echo "======================================"
    
    log_test "PostgreSQL database connectivity"
    
    if docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U recoder &> /dev/null; then
        log_success "PostgreSQL database is ready"
        
        # Test database connection
        local db_version=$(docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U recoder -d recoder_production -t -c "SELECT version();" 2>/dev/null | head -1 | xargs)
        if [[ -n "$db_version" ]]; then
            log_success "Database connection successful"
        else
            log_fail "Database connection failed"
        fi
    else
        log_fail "PostgreSQL database is not ready"
    fi
    
    log_test "Redis cache connectivity"
    
    if docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli ping &> /dev/null; then
        log_success "Redis cache is responding"
    else
        log_fail "Redis cache is not responding"
    fi
    echo ""
}

# Test performance metrics
test_performance_metrics() {
    echo -e "${CYAN}⚡ PERFORMANCE TESTS${NC}"
    echo "======================================"
    
    local test_url="https://$DOMAIN"
    
    log_test "Website response time"
    
    local response_time=$(curl -o /dev/null -s -w "%{time_total}" -k --max-time 30 "$test_url" 2>/dev/null || echo "timeout")
    
    if [[ "$response_time" == "timeout" ]]; then
        log_fail "Website response timed out"
    elif (( $(echo "$response_time < 2.0" | bc -l) )); then
        log_success "Website response time: ${response_time}s (excellent)"
    elif (( $(echo "$response_time < 5.0" | bc -l) )); then
        log_success "Website response time: ${response_time}s (good)"
    else
        log_warning "Website response time: ${response_time}s (slow)"
    fi
    
    log_test "API response time"
    
    local api_response_time=$(curl -o /dev/null -s -w "%{time_total}" -k --max-time 30 "https://api.$DOMAIN/api/health" 2>/dev/null || echo "timeout")
    
    if [[ "$api_response_time" == "timeout" ]]; then
        log_fail "API response timed out"
    elif (( $(echo "$api_response_time < 1.0" | bc -l) )); then
        log_success "API response time: ${api_response_time}s (excellent)"
    elif (( $(echo "$api_response_time < 3.0" | bc -l) )); then
        log_success "API response time: ${api_response_time}s (good)"
    else
        log_warning "API response time: ${api_response_time}s (slow)"
    fi
    echo ""
}

# Test monitoring systems
test_monitoring_systems() {
    echo -e "${CYAN}📊 MONITORING SYSTEM TESTS${NC}"
    echo "======================================"
    
    log_test "Prometheus metrics collection"
    
    local prometheus_url="https://prometheus.$DOMAIN/api/v1/query?query=up"
    local prometheus_response=$(curl -s -k --max-time 10 "$prometheus_url" 2>/dev/null || echo "FAILED")
    
    if [[ "$prometheus_response" != "FAILED" ]] && echo "$prometheus_response" | grep -q '"status":"success"'; then
        log_success "Prometheus is collecting metrics"
    else
        log_fail "Prometheus metrics collection failed"
    fi
    
    log_test "Grafana dashboard accessibility"
    
    local grafana_response_code=$(curl -s -o /dev/null -w "%{http_code}" -k --max-time 10 "https://grafana.$DOMAIN" 2>/dev/null || echo "000")
    
    if [[ "$grafana_response_code" -eq 200 || "$grafana_response_code" -eq 302 ]]; then
        log_success "Grafana dashboard accessible"
    else
        log_fail "Grafana dashboard not accessible (HTTP $grafana_response_code)"
    fi
    echo ""
}

# Test backup systems
test_backup_systems() {
    echo -e "${CYAN}💼 BACKUP SYSTEM TESTS${NC}"
    echo "======================================"
    
    log_test "Backup directory structure"
    
    if [[ -d "backups" ]]; then
        log_success "Backup directory exists"
        
        local backup_count=$(find backups -name "*.tar.gz" -type f | wc -l)
        if [[ $backup_count -gt 0 ]]; then
            log_success "Found $backup_count backup archives"
        else
            log_warning "No backup archives found"
        fi
    else
        log_fail "Backup directory missing"
    fi
    
    log_test "Database backup capability"
    
    if docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump --help &> /dev/null; then
        log_success "Database backup tools available"
    else
        log_fail "Database backup tools not available"
    fi
    echo ""
}

# Generate report
generate_report() {
    echo -e "${CYAN}📋 VALIDATION REPORT${NC}"
    echo "======================================"
    echo ""
    
    local success_rate=$((PASSED_TESTS * 100 / TOTAL_TESTS))
    
    echo "📊 Test Summary:"
    echo "  Total Tests: $TOTAL_TESTS"
    echo "  Passed: $PASSED_TESTS"
    echo "  Failed: $FAILED_TESTS"
    echo "  Success Rate: $success_rate%"
    echo ""
    
    if [[ $success_rate -ge 90 ]]; then
        echo -e "${GREEN}✅ DEPLOYMENT STATUS: EXCELLENT${NC}"
        echo "Your Recoder.xyz deployment is production-ready!"
    elif [[ $success_rate -ge 80 ]]; then
        echo -e "${YELLOW}⚠️  DEPLOYMENT STATUS: GOOD${NC}"
        echo "Your deployment is functional but has some issues to address."
    elif [[ $success_rate -ge 70 ]]; then
        echo -e "${YELLOW}⚠️  DEPLOYMENT STATUS: NEEDS ATTENTION${NC}"
        echo "Several issues need to be resolved before production use."
    else
        echo -e "${RED}❌ DEPLOYMENT STATUS: CRITICAL${NC}"
        echo "Major issues detected. Do not use in production until resolved."
    fi
    echo ""
    
    if [[ $FAILED_TESTS -gt 0 ]]; then
        echo -e "${RED}🔧 RECOMMENDED ACTIONS:${NC}"
        echo "1. Review failed tests above"
        echo "2. Check service logs: docker-compose logs [service]"
        echo "3. Verify DNS and SSL configuration"
        echo "4. Ensure all required environment variables are set"
        echo "5. Check firewall and network connectivity"
        echo "6. Run: ./deploy-domain.sh --status for detailed info"
        echo ""
    fi
    
    echo -e "${BLUE}🔗 USEFUL COMMANDS:${NC}"
    echo "  Check status:     ./deploy-domain.sh --status"
    echo "  View logs:        ./deploy-domain.sh --logs"
    echo "  Update services:  ./deploy-domain.sh --update"
    echo "  Create backup:    ./deploy-domain.sh --backup"
    echo "  Renew SSL:        ./deploy-domain.sh --renew-ssl"
    echo ""
}

# Main validation function
main_validation() {
    show_banner
    test_dns_resolution
    test_ssl_certificates
    test_service_endpoints
    test_security_headers
    test_docker_containers
    test_database_connectivity
    test_performance_metrics
    test_monitoring_systems
    test_backup_systems
    generate_report
}

# Check dependencies
check_dependencies() {
    local dependencies=("curl" "openssl" "nslookup" "docker-compose" "bc")
    
    for dep in "${dependencies[@]}"; do
        if ! command -v "$dep" &> /dev/null; then
            log_fail "Required dependency '$dep' is not installed"
            exit 1
        fi
    done
}

# Show help
show_help() {
    echo "Recoder.xyz Deployment Validation Script"
    echo ""
    echo "Usage: $0 [DOMAIN]"
    echo ""
    echo "Arguments:"
    echo "  DOMAIN    Domain to validate (default: recoder.xyz)"
    echo ""
    echo "Examples:"
    echo "  $0                    # Validate recoder.xyz"
    echo "  $0 mydomain.com      # Validate mydomain.com"
    echo ""
    echo "This script performs comprehensive validation of:"
    echo "  - DNS resolution"
    echo "  - SSL certificates"
    echo "  - Service endpoints"
    echo "  - Security headers"
    echo "  - Docker containers"
    echo "  - Database connectivity"
    echo "  - Performance metrics"
    echo "  - Monitoring systems"
    echo "  - Backup systems"
    echo ""
}

# Main script logic
case "${1:-}" in
    --help|-h)
        show_help
        exit 0
        ;;
    *)
        check_dependencies
        main_validation
        ;;
esac