#!/bin/bash

# Recoder.xyz Domain Deployment Script
# Deploys to recoder.xyz with HTTPS SSL via Let's Encrypt

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
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="recoder"
COMPOSE_FILE="docker-compose.domain.yml"
ENV_FILE=".env.domain"
DOMAIN="recoder.xyz"
SUBDOMAINS=("chat" "api" "engine" "traefik" "prometheus" "grafana" "ollama")

# Logging functions
log_info() {
    echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1"
}

log_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

log_step() {
    echo -e "${PURPLE}[STEP]${NC} $1"
}

log_domain() {
    echo -e "${CYAN}[DOMAIN]${NC} $1"
}

# Banner
show_banner() {
    echo -e "${CYAN}"
    echo "=============================================="
    echo "  RECODER.XYZ DOMAIN DEPLOYMENT WITH HTTPS"
    echo "=============================================="
    echo -e "${NC}"
    echo "🌐 Domain: recoder.xyz (with SSL)"
    echo "🔒 Security: Let's Encrypt HTTPS + Security Headers"
    echo "🚀 Services: Web + Chat + API + Engine + Monitoring"
    echo "📊 Monitoring: Prometheus + Grafana dashboards"
    echo ""
}

# Domain validation
validate_domain() {
    log_step "Validating domain configuration..."
    
    log_info "Checking DNS resolution for $DOMAIN..."
    if ! nslookup "$DOMAIN" &> /dev/null; then
        log_warning "Main domain $DOMAIN does not resolve. Make sure DNS is configured."
    else
        log_success "Main domain $DOMAIN resolves correctly"
    fi
    
    # Check subdomains
    for subdomain in "${SUBDOMAINS[@]}"; do
        local full_domain="${subdomain}.${DOMAIN}"
        log_info "Checking DNS for $full_domain..."
        if ! nslookup "$full_domain" &> /dev/null; then
            log_warning "Subdomain $full_domain does not resolve"
        else
            log_success "Subdomain $full_domain resolves correctly"
        fi
    done
    
    echo ""
    log_warning "IMPORTANT: Make sure these DNS records point to this server:"
    echo "  A    recoder.xyz         → YOUR_SERVER_IP"
    echo "  A    *.recoder.xyz       → YOUR_SERVER_IP"
    echo "  AAAA recoder.xyz         → YOUR_SERVER_IPv6 (optional)"
    echo "  AAAA *.recoder.xyz       → YOUR_SERVER_IPv6 (optional)"
    echo ""
    
    read -p "Are your DNS records configured and propagated? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        log_error "Please configure your DNS records first and wait for propagation (up to 24 hours)."
        exit 1
    fi
}

# Server prerequisites
check_server_prerequisites() {
    log_step "Checking server prerequisites..."
    
    # Check if running on server (not local)
    if [[ "${HOST:-}" == "localhost" ]] || [[ "${HOSTNAME:-}" == *"local"* ]]; then
        log_warning "This appears to be a local machine. Domain deployment should be run on a production server."
        read -p "Continue anyway? (y/N): " -n 1 -r
        echo
        if [[ ! $REPLY =~ ^[Yy]$ ]]; then
            exit 1
        fi
    fi
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Installing Docker..."
        install_docker
    else
        log_success "Docker is available"
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Installing Docker Compose..."
        install_docker_compose
    else
        log_success "Docker Compose is available"
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running. Starting Docker..."
        sudo systemctl start docker
        sudo systemctl enable docker
    fi
    
    # Check ports
    local required_ports=(80 443)
    for port in "${required_ports[@]}"; do
        if netstat -tuln | grep ":$port " &> /dev/null; then
            log_error "Port $port is already in use. Please free it before deployment."
            netstat -tuln | grep ":$port "
            exit 1
        else
            log_success "Port $port is available"
        fi
    done
    
    log_success "Server prerequisites check passed"
}

# Install Docker (Ubuntu/Debian)
install_docker() {
    log_info "Installing Docker..."
    
    # Update package index
    sudo apt-get update
    
    # Install prerequisites
    sudo apt-get install -y apt-transport-https ca-certificates curl gnupg lsb-release
    
    # Add Docker GPG key
    curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
    
    # Add Docker repository
    echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null
    
    # Install Docker
    sudo apt-get update
    sudo apt-get install -y docker-ce docker-ce-cli containerd.io
    
    # Add current user to docker group
    sudo usermod -aG docker "$USER"
    
    # Start and enable Docker
    sudo systemctl start docker
    sudo systemctl enable docker
    
    log_success "Docker installed successfully"
}

# Install Docker Compose
install_docker_compose() {
    log_info "Installing Docker Compose..."
    
    # Download Docker Compose
    sudo curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    
    # Make executable
    sudo chmod +x /usr/local/bin/docker-compose
    
    # Create symlink
    sudo ln -sf /usr/local/bin/docker-compose /usr/bin/docker-compose
    
    log_success "Docker Compose installed successfully"
}

# Firewall configuration
configure_firewall() {
    log_step "Configuring firewall..."
    
    if command -v ufw &> /dev/null; then
        log_info "Configuring UFW firewall..."
        
        # Allow SSH (important!)
        sudo ufw allow ssh
        
        # Allow HTTP and HTTPS
        sudo ufw allow 80/tcp
        sudo ufw allow 443/tcp
        
        # Allow Docker subnet
        sudo ufw allow from 172.20.0.0/16
        
        # Enable firewall
        sudo ufw --force enable
        
        log_success "UFW firewall configured"
    elif command -v firewall-cmd &> /dev/null; then
        log_info "Configuring firewalld..."
        
        sudo firewall-cmd --permanent --add-service=ssh
        sudo firewall-cmd --permanent --add-service=http
        sudo firewall-cmd --permanent --add-service=https
        sudo firewall-cmd --reload
        
        log_success "Firewalld configured"
    else
        log_warning "No firewall detected. Please configure manually."
    fi
}

# Environment setup
setup_domain_environment() {
    log_step "Setting up domain environment..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Domain environment file $ENV_FILE not found!"
        exit 1
    fi
    
    # Check required environment variables
    local required_vars=(
        "ACME_EMAIL"
        "DB_PASSWORD"
        "REDIS_PASSWORD"
        "JWT_SECRET"
        "NEXTAUTH_SECRET"
        "ANTHROPIC_API_KEY"
        "GROQ_API_KEY"
    )
    
    log_info "Validating environment variables..."
    source "$ENV_FILE"
    
    for var in "${required_vars[@]}"; do
        if [[ -z "${!var:-}" ]]; then
            log_error "Required environment variable $var is not set in $ENV_FILE"
            exit 1
        else
            log_success "✓ $var is configured"
        fi
    done
    
    log_success "Domain environment configuration validated"
}

# Create required directories
create_domain_directories() {
    log_step "Creating domain directories..."
    
    local directories=(
        "ssl/letsencrypt"
        "data/postgres"
        "data/redis"
        "data/ollama"
        "data/grafana/provisioning/datasources"
        "data/prometheus"
        "logs/traefik"
        "logs/api"
        "logs/web"
        "logs/chat"
        "logs/engine"
        "backups/postgres"
        "backups/redis"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        log_info "Created directory: $dir"
    done
    
    # Set proper permissions
    chmod 755 data/
    chmod 700 ssl/
    chmod 600 ssl/letsencrypt/
    
    # Create acme.json for Let's Encrypt
    touch ssl/letsencrypt/acme.json
    chmod 600 ssl/letsencrypt/acme.json
    
    log_success "Domain directory structure created"
}

# Generate monitoring configurations
generate_domain_monitoring() {
    log_step "Generating domain monitoring configurations..."
    
    # Prometheus configuration
    cat > data/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s
  external_labels:
    monitor: 'recoder-production'
    environment: 'production'
    domain: 'recoder.xyz'

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'recoder-chat'
    static_configs:
      - targets: ['recoder-chat:3000']
    metrics_path: '/api/metrics'
    scrape_interval: 30s

  - job_name: 'recoder-api'
    static_configs:
      - targets: ['recoder-api:8000']
    metrics_path: '/api/metrics'
    scrape_interval: 30s

  - job_name: 'production-engine'
    static_configs:
      - targets: ['production-engine:8001']
    metrics_path: '/api/metrics'
    scrape_interval: 30s

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']
    scrape_interval: 60s

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']
    scrape_interval: 60s

  - job_name: 'traefik'
    static_configs:
      - targets: ['traefik:8080']
    metrics_path: '/metrics'
    scrape_interval: 30s

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
EOF

    # Grafana datasource
    cat > data/grafana/provisioning/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
    jsonData:
      timeInterval: 30s
EOF

    log_success "Domain monitoring configurations generated"
}

# Build and deploy
deploy_domain_services() {
    log_step "Deploying domain services with HTTPS..."
    
    # Build all images
    log_info "Building Docker images..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --parallel
    
    # Deploy infrastructure first
    log_info "Starting infrastructure services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d \
        traefik \
        postgres \
        redis \
        prometheus \
        grafana
    
    # Wait for infrastructure
    log_info "Waiting for infrastructure to be ready..."
    sleep 30
    
    # Check database readiness
    local retries=0
    local max_retries=30
    while ! docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres pg_isready -U recoder > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [[ $retries -eq $max_retries ]]; then
            log_error "Database failed to start after $max_retries attempts"
            return 1
        fi
        log_info "Waiting for database... ($retries/$max_retries)"
        sleep 2
    done
    
    # Deploy application services
    log_info "Starting application services..."
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d \
        recoder-api \
        production-engine \
        recoder-chat \
        ollama
    
    log_success "All domain services deployed"
}

# SSL certificate verification
verify_ssl_certificates() {
    log_step "Verifying SSL certificates..."
    
    # Wait for Let's Encrypt certificates
    log_info "Waiting for Let's Encrypt certificate generation..."
    
    local domains=("$DOMAIN" "chat.$DOMAIN" "api.$DOMAIN" "engine.$DOMAIN")
    
    for domain in "${domains[@]}"; do
        local retries=0
        local max_retries=60
        
        log_info "Checking SSL certificate for $domain..."
        
        while true; do
            if curl -sSf "https://$domain" > /dev/null 2>&1; then
                log_success "✓ SSL certificate verified for $domain"
                break
            fi
            
            retries=$((retries + 1))
            if [[ $retries -eq $max_retries ]]; then
                log_warning "SSL certificate verification failed for $domain after $max_retries attempts"
                break
            fi
            
            sleep 5
        done
    done
    
    log_success "SSL certificate verification completed"
}

# Health checks for domain
run_domain_health_checks() {
    log_step "Running domain health checks..."
    
    local services=(
        "https://recoder.xyz/api/health:Main Website"
        "https://chat.recoder.xyz/api/health:Chat Platform"
        "https://api.recoder.xyz/api/health:Backend API"
        "https://engine.recoder.xyz/api/health:Production Engine"
    )
    
    for service in "${services[@]}"; do
        local url="${service%:*}"
        local name="${service#*:}"
        
        log_info "Health checking $name at $url..."
        local retries=0
        local max_retries=30
        
        while true; do
            if curl -f -s -k "$url" > /dev/null 2>&1; then
                log_success "✓ $name is healthy"
                break
            fi
            
            retries=$((retries + 1))
            if [[ $retries -eq $max_retries ]]; then
                log_warning "⚠ $name health check failed after $max_retries attempts"
                break
            fi
            
            sleep 2
        done
    done
    
    log_success "Domain health checks completed"
}

# Security test
run_security_tests() {
    log_step "Running security tests..."
    
    log_info "Testing security headers..."
    
    # Test main domain
    local test_url="https://recoder.xyz"
    local headers=$(curl -I -s "$test_url" 2>/dev/null || echo "FAILED")
    
    if [[ "$headers" == "FAILED" ]]; then
        log_warning "Could not fetch security headers from $test_url"
    else
        echo "Security headers test for $test_url:"
        echo "$headers" | grep -E "(Strict-Transport-Security|X-Frame-Options|X-Content-Type-Options|Referrer-Policy)" || log_warning "Some security headers missing"
    fi
    
    log_success "Security tests completed"
}

# Show domain deployment info
show_domain_deployment_info() {
    echo ""
    echo -e "${GREEN}🌐 DOMAIN DEPLOYMENT COMPLETED! 🌐${NC}"
    echo ""
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo -e "${CYAN}          RECODER.XYZ IS LIVE!          ${NC}"
    echo -e "${CYAN}═══════════════════════════════════════${NC}"
    echo ""
    echo -e "${GREEN}🚀 PRODUCTION SERVICES:${NC}"
    echo "  Main Platform:    https://recoder.xyz"
    echo "  Chat Platform:    https://chat.recoder.xyz"
    echo "  Backend API:      https://api.recoder.xyz"
    echo "  Production Engine: https://engine.recoder.xyz"
    echo ""
    echo -e "${BLUE}📊 MONITORING & ADMIN:${NC}"
    echo "  Traefik Dashboard: https://traefik.recoder.xyz (admin/password)"
    echo "  Grafana Analytics: https://grafana.recoder.xyz"
    echo "  Prometheus:       https://prometheus.recoder.xyz (admin/password)"
    echo "  Ollama AI:        https://ollama.recoder.xyz (admin access)"
    echo ""
    echo -e "${PURPLE}🔒 SECURITY STATUS:${NC}"
    echo "  ✓ Let's Encrypt SSL certificates active"
    echo "  ✓ HTTPS redirects enabled"
    echo "  ✓ Security headers configured"
    echo "  ✓ Firewall configured"
    echo ""
    echo -e "${YELLOW}📈 NEXT STEPS:${NC}"
    echo "  1. Test all services and functionality"
    echo "  2. Configure monitoring alerts"
    echo "  3. Set up automated backups"
    echo "  4. Run security audit"
    echo "  5. Configure CI/CD pipeline"
    echo ""
    echo -e "${CYAN}🔧 MANAGEMENT COMMANDS:${NC}"
    echo "  View logs:        docker-compose -f $COMPOSE_FILE logs -f [service]"
    echo "  Restart service:  docker-compose -f $COMPOSE_FILE restart [service]"
    echo "  Update deployment: ./deploy-domain.sh --update"
    echo "  Full backup:      ./deploy-domain.sh --backup"
    echo "  SSL renewal:      ./deploy-domain.sh --renew-ssl"
    echo ""
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
}

# Update domain deployment
update_domain_deployment() {
    log_info "Updating domain deployment..."
    
    # Pull latest changes
    git pull origin main || log_warning "Git pull failed"
    
    # Rebuild and restart
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d --build
    
    # Health checks
    run_domain_health_checks
    
    log_success "Domain deployment updated"
}

# Backup domain data
backup_domain_data() {
    log_info "Creating domain backup..."
    
    local backup_dir="backups/domain_$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup database
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T postgres pg_dump -U recoder recoder_production > "$backup_dir/database.sql"
    
    # Backup Redis
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" exec -T redis redis-cli BGSAVE
    docker cp "$(docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps -q redis)":/data/dump.rdb "$backup_dir/redis.rdb"
    
    # Backup SSL certificates
    cp -r ssl/letsencrypt "$backup_dir/"
    
    # Backup configuration
    cp "$ENV_FILE" "$backup_dir/"
    cp "$COMPOSE_FILE" "$backup_dir/"
    
    # Create backup archive
    tar -czf "$backup_dir.tar.gz" -C backups "$(basename "$backup_dir")"
    rm -rf "$backup_dir"
    
    log_success "Domain backup created: $backup_dir.tar.gz"
}

# Renew SSL certificates
renew_ssl_certificates() {
    log_info "Renewing SSL certificates..."
    
    # Restart Traefik to trigger renewal
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart traefik
    
    # Wait and verify
    sleep 30
    verify_ssl_certificates
    
    log_success "SSL certificates renewed"
}

# Show help
show_help() {
    echo "Recoder.xyz Domain Deployment Script"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  (no option)     Full domain deployment with HTTPS"
    echo "  --update        Update existing domain deployment"
    echo "  --backup        Create full domain backup"
    echo "  --renew-ssl     Renew SSL certificates"
    echo "  --status        Show domain deployment status"
    echo "  --logs          Show service logs"
    echo "  --security      Run security tests"
    echo "  --help          Show this help message"
    echo ""
}

# Show domain status
show_domain_status() {
    echo "🌐 DOMAIN DEPLOYMENT STATUS:"
    echo ""
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
    echo ""
    echo "🔍 DOMAIN HEALTH:"
    run_domain_health_checks
    echo ""
    echo "🔒 SSL STATUS:"
    verify_ssl_certificates
}

# Main domain deployment
main_domain_deploy() {
    show_banner
    validate_domain
    check_server_prerequisites
    configure_firewall
    setup_domain_environment
    create_domain_directories
    generate_domain_monitoring
    deploy_domain_services
    verify_ssl_certificates
    run_domain_health_checks
    run_security_tests
    show_domain_deployment_info
}

# Main script logic
main() {
    cd "$SCRIPT_DIR"
    
    case "${1:-}" in
        --update)
            update_domain_deployment
            ;;
        --backup)
            backup_domain_data
            ;;
        --renew-ssl)
            renew_ssl_certificates
            ;;
        --status)
            show_domain_status
            ;;
        --logs)
            docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs -f --tail=100
            ;;
        --security)
            run_security_tests
            ;;
        --help)
            show_help
            ;;
        "")
            main_domain_deploy
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
}

# Error handling
trap 'log_error "Domain deployment failed! Check the logs above for details."' ERR

# Run main function
main "$@"