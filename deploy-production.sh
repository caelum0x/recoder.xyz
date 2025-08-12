#!/bin/bash

# Recoder.xyz Production Deployment Script
# Automates complete production deployment with Docker Compose

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_NAME="recoder"
COMPOSE_FILE="docker-compose.production.yml"
ENV_FILE=".env.production"
ENV_TEMPLATE=".env.production.template"

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

# Banner
show_banner() {
    echo -e "${BLUE}"
    echo "=================================="
    echo "  RECODER.XYZ PRODUCTION DEPLOY"
    echo "=================================="
    echo -e "${NC}"
    echo "🚀 Deploying AI-powered development platform"
    echo "🏗️  Full stack: Web + Chat + API + Engine"
    echo "🐳 Docker containerized with SSL termination"
    echo ""
}

# Prerequisites check
check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check Docker
    if ! command -v docker &> /dev/null; then
        log_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    # Check Docker Compose
    if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
        log_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    # Check if Docker daemon is running
    if ! docker info &> /dev/null; then
        log_error "Docker daemon is not running. Please start Docker first."
        exit 1
    fi
    
    log_success "Prerequisites check passed"
}

# Environment setup
setup_environment() {
    log_info "Setting up environment configuration..."
    
    if [[ ! -f "$ENV_FILE" ]]; then
        if [[ -f "$ENV_TEMPLATE" ]]; then
            log_warning "Environment file not found. Creating from template..."
            cp "$ENV_TEMPLATE" "$ENV_FILE"
            log_warning "Please edit $ENV_FILE with your production values before continuing."
            log_warning "Key values to update:"
            echo "  - Domain URLs (WEB_URL, CHAT_URL, etc.)"
            echo "  - Database passwords (DB_PASSWORD, REDIS_PASSWORD)"
            echo "  - JWT secrets (JWT_SECRET, NEXTAUTH_SECRET)"
            echo "  - API keys (ANTHROPIC_API_KEY, GROQ_API_KEY, etc.)"
            echo "  - SSL email (ACME_EMAIL)"
            echo ""
            read -p "Have you updated the environment file? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                log_error "Please update $ENV_FILE and run the script again."
                exit 1
            fi
        else
            log_error "Environment template not found. Please create $ENV_FILE manually."
            exit 1
        fi
    fi
    
    log_success "Environment configuration ready"
}

# Create required directories
create_directories() {
    log_info "Creating required directories..."
    
    local directories=(
        "data/postgres"
        "data/redis"
        "data/ollama"
        "data/grafana"
        "data/prometheus"
        "logs/traefik"
        "logs/app"
        "ssl/certs"
        "backups"
    )
    
    for dir in "${directories[@]}"; do
        mkdir -p "$dir"
        log_info "Created directory: $dir"
    done
    
    # Set proper permissions
    chmod 755 data/
    chmod 700 ssl/certs/
    
    log_success "Directory structure created"
}

# Generate monitoring configurations
generate_monitoring_configs() {
    log_info "Generating monitoring configurations..."
    
    # Prometheus configuration
    cat > data/prometheus/prometheus.yml << 'EOF'
global:
  scrape_interval: 15s
  evaluation_interval: 15s

rule_files:
  - "alert_rules.yml"

scrape_configs:
  - job_name: 'prometheus'
    static_configs:
      - targets: ['localhost:9090']

  - job_name: 'recoder-web'
    static_configs:
      - targets: ['recoder-web:3000']
    metrics_path: '/api/metrics'

  - job_name: 'recoder-chat'
    static_configs:
      - targets: ['recoder-chat:3001']
    metrics_path: '/api/metrics'

  - job_name: 'recoder-api'
    static_configs:
      - targets: ['recoder-api:8000']
    metrics_path: '/api/metrics'

  - job_name: 'production-engine'
    static_configs:
      - targets: ['production-engine:8001']
    metrics_path: '/api/metrics'

  - job_name: 'postgres'
    static_configs:
      - targets: ['postgres:5432']

  - job_name: 'redis'
    static_configs:
      - targets: ['redis:6379']

alerting:
  alertmanagers:
    - static_configs:
        - targets:
          - alertmanager:9093
EOF

    # Grafana datasource configuration
    mkdir -p data/grafana/provisioning/datasources
    cat > data/grafana/provisioning/datasources/prometheus.yml << 'EOF'
apiVersion: 1

datasources:
  - name: Prometheus
    type: prometheus
    access: proxy
    url: http://prometheus:9090
    isDefault: true
    editable: true
EOF

    log_success "Monitoring configurations generated"
}

# Build Docker images
build_images() {
    log_info "Building Docker images..."
    
    # Build all services
    docker-compose -f "$COMPOSE_FILE" build --parallel
    
    log_success "Docker images built successfully"
}

# Deploy infrastructure services
deploy_infrastructure() {
    log_info "Deploying infrastructure services..."
    
    # Start infrastructure services first
    docker-compose -f "$COMPOSE_FILE" up -d \
        postgres \
        redis \
        traefik \
        prometheus \
        grafana
    
    # Wait for database to be ready
    log_info "Waiting for database to be ready..."
    sleep 10
    
    # Check database connectivity
    local retries=0
    local max_retries=30
    while ! docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
        retries=$((retries + 1))
        if [[ $retries -eq $max_retries ]]; then
            log_error "Database failed to start after $max_retries attempts"
            return 1
        fi
        log_info "Waiting for database... ($retries/$max_retries)"
        sleep 2
    done
    
    log_success "Infrastructure services deployed"
}

# Deploy application services
deploy_applications() {
    log_info "Deploying application services..."
    
    # Start application services
    docker-compose -f "$COMPOSE_FILE" up -d \
        recoder-api \
        production-engine \
        recoder-web \
        recoder-chat \
        ollama
    
    log_success "Application services deployed"
}

# Health checks
run_health_checks() {
    log_info "Running health checks..."
    
    local services=(
        "http://localhost:3000/api/health:Web Platform"
        "http://localhost:3001/api/health:Chat Platform"
        "http://localhost:8000/api/health:Backend API"
        "http://localhost:8001/api/health:Production Engine"
    )
    
    for service in "${services[@]}"; do
        local url="${service%:*}"
        local name="${service#*:}"
        
        log_info "Checking $name..."
        local retries=0
        local max_retries=30
        
        while true; do
            if curl -f -s "$url" > /dev/null 2>&1; then
                log_success "$name is healthy"
                break
            fi
            
            retries=$((retries + 1))
            if [[ $retries -eq $max_retries ]]; then
                log_warning "$name health check failed after $max_retries attempts"
                break
            fi
            
            sleep 2
        done
    done
    
    log_success "Health checks completed"
}

# Show deployment info
show_deployment_info() {
    echo ""
    echo -e "${GREEN}🎉 DEPLOYMENT COMPLETED SUCCESSFULLY! 🎉${NC}"
    echo ""
    echo "📊 SERVICES STATUS:"
    docker-compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "🌐 ACCESS URLS:"
    echo "  Web Platform:     http://localhost:3000"
    echo "  Chat Platform:    http://localhost:3001"
    echo "  Backend API:      http://localhost:8000"
    echo "  Production Engine: http://localhost:8001"
    echo "  Traefik Dashboard: http://localhost:8080"
    echo "  Grafana:          http://localhost:3002"
    echo "  Prometheus:       http://localhost:9090"
    echo ""
    echo "🔧 MANAGEMENT COMMANDS:"
    echo "  View logs:        docker-compose -f $COMPOSE_FILE logs -f [service]"
    echo "  Stop all:         docker-compose -f $COMPOSE_FILE down"
    echo "  Restart service:  docker-compose -f $COMPOSE_FILE restart [service]"
    echo "  Update & redeploy: ./deploy-production.sh --update"
    echo ""
    echo "📚 NEXT STEPS:"
    echo "  1. Configure your domain DNS to point to this server"
    echo "  2. Update .env.production with your actual domain URLs"
    echo "  3. Run './deploy-production.sh --ssl' to enable HTTPS"
    echo "  4. Test all functionality and API endpoints"
    echo ""
}

# Update deployment
update_deployment() {
    log_info "Updating deployment..."
    
    # Pull latest images
    docker-compose -f "$COMPOSE_FILE" pull
    
    # Rebuild and restart services
    docker-compose -f "$COMPOSE_FILE" up -d --build
    
    # Clean up old images
    docker image prune -f
    
    log_success "Deployment updated"
}

# Enable SSL/HTTPS
enable_ssl() {
    log_info "Enabling SSL/HTTPS..."
    
    # Check if ACME_EMAIL is set
    if ! grep -q "ACME_EMAIL=.*@" "$ENV_FILE"; then
        log_error "ACME_EMAIL not properly configured in $ENV_FILE"
        exit 1
    fi
    
    # Restart Traefik to acquire certificates
    docker-compose -f "$COMPOSE_FILE" restart traefik
    
    log_success "SSL/HTTPS enabled. Certificates will be automatically acquired."
}

# Backup function
backup_data() {
    log_info "Creating backup..."
    
    local backup_dir="backups/$(date +%Y%m%d_%H%M%S)"
    mkdir -p "$backup_dir"
    
    # Backup database
    docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_dump -U postgres recoder_production > "$backup_dir/database.sql"
    
    # Backup Redis
    docker-compose -f "$COMPOSE_FILE" exec -T redis redis-cli BGSAVE
    docker cp "$(docker-compose -f "$COMPOSE_FILE" ps -q redis)":/data/dump.rdb "$backup_dir/redis.rdb"
    
    # Backup configuration
    cp "$ENV_FILE" "$backup_dir/"
    
    log_success "Backup created in $backup_dir"
}

# Cleanup function
cleanup() {
    log_info "Cleaning up..."
    
    # Stop all services
    docker-compose -f "$COMPOSE_FILE" down
    
    # Remove orphaned containers
    docker container prune -f
    
    # Remove unused images
    docker image prune -f
    
    # Remove unused volumes (be careful!)
    read -p "Remove unused volumes? This will delete all unattached data! (y/N): " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker volume prune -f
    fi
    
    log_success "Cleanup completed"
}

# Show help
show_help() {
    echo "Recoder.xyz Production Deployment Script"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  (no option)   Full deployment (default)"
    echo "  --update      Update existing deployment"
    echo "  --ssl         Enable SSL/HTTPS certificates"
    echo "  --backup      Create data backup"
    echo "  --cleanup     Stop services and cleanup"
    echo "  --status      Show deployment status"
    echo "  --logs        Show service logs"
    echo "  --help        Show this help message"
    echo ""
}

# Show status
show_status() {
    echo "📊 DEPLOYMENT STATUS:"
    echo ""
    docker-compose -f "$COMPOSE_FILE" ps
    echo ""
    echo "🔍 SERVICE HEALTH:"
    run_health_checks
}

# Show logs
show_logs() {
    docker-compose -f "$COMPOSE_FILE" logs -f --tail=100
}

# Main deployment function
main_deploy() {
    show_banner
    check_prerequisites
    setup_environment
    create_directories
    generate_monitoring_configs
    build_images
    deploy_infrastructure
    deploy_applications
    run_health_checks
    show_deployment_info
}

# Main script logic
main() {
    cd "$SCRIPT_DIR"
    
    case "${1:-}" in
        --update)
            update_deployment
            run_health_checks
            ;;
        --ssl)
            enable_ssl
            ;;
        --backup)
            backup_data
            ;;
        --cleanup)
            cleanup
            ;;
        --status)
            show_status
            ;;
        --logs)
            show_logs
            ;;
        --help)
            show_help
            ;;
        "")
            main_deploy
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
}

# Error handling
trap 'log_error "Deployment failed! Check the logs above for details."' ERR

# Run main function
main "$@"