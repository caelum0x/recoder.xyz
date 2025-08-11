#!/bin/bash

# Production Deployment Script for Recoder.xyz
# Automated production deployment with monitoring, health checks, and rollback

set -e
trap 'echo "❌ Deployment failed at line $LINENO"' ERR

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

# Configuration
DEPLOYMENT_ID="deploy_$(date +%s)"
BACKUP_DIR="./backups/deployment-$DEPLOYMENT_ID"
LOG_FILE="./logs/deployment-$DEPLOYMENT_ID.log"
COMPOSE_FILE="docker-compose.production-enhanced.yml"
ENV_FILE=".env.production"

# Ensure log directory exists
mkdir -p logs backups

# Logging function
log() {
    echo -e "$1" | tee -a "$LOG_FILE"
}

log_phase() {
    log "\n${PURPLE}🔸 PHASE: $1${NC}"
    log "${BLUE}════════════════════════════════════════${NC}"
}

log_step() {
    log "${CYAN}▶️  $1${NC}"
}

log_success() {
    log "${GREEN}✅ $1${NC}"
}

log_warning() {
    log "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    log "${RED}❌ $1${NC}"
}

# Header
log "${PURPLE}"
log "██████╗ ███████╗ ██████╗ ██████╗ ███████╗██████╗    ██╗  ██╗██╗   ██╗███████╗"
log "██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔════╝██╔══██╗   ╚██╗██╔╝╚██╗ ██╔╝╚══███╔╝"
log "██████╔╝█████╗  ██║     ██║   ██║█████╗  ██████╔╝    ╚███╔╝  ╚████╔╝   ███╔╝ "
log "██╔══██╗██╔══╝  ██║     ██║   ██║██╔══╝  ██╔══██╗    ██╔██╗   ╚██╔╝   ███╔╝  "
log "██║  ██║███████╗╚██████╗╚██████╔╝███████╗██║  ██║██╗██╔╝ ██╗   ██║   ███████╗"
log "╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝"
log "${NC}"
log "${CYAN}🚀 PRODUCTION DEPLOYMENT - RECODER.XYZ${NC}"
log "${BLUE}=============================================================${NC}"
log "Deployment ID: $DEPLOYMENT_ID"
log "Timestamp: $(date)"
log "Log File: $LOG_FILE"
log ""

# Pre-deployment validation
validate_environment() {
    log_phase "PRE-DEPLOYMENT VALIDATION"
    
    log_step "Checking required files..."
    
    if [[ ! -f "$COMPOSE_FILE" ]]; then
        log_error "Docker Compose file not found: $COMPOSE_FILE"
        exit 1
    fi
    
    if [[ ! -f "$ENV_FILE" ]]; then
        log_error "Environment file not found: $ENV_FILE"
        log_warning "Copy production.env.example to $ENV_FILE and configure"
        exit 1
    fi
    
    log_step "Checking required tools..."
    local missing_tools=()
    
    for tool in docker docker-compose curl; do
        if ! command -v $tool &> /dev/null; then
            missing_tools+=($tool)
        fi
    done
    
    if [ ${#missing_tools[@]} -ne 0 ]; then
        log_error "Missing required tools: ${missing_tools[*]}"
        exit 1
    fi
    
    log_step "Validating Docker daemon..."
    if ! docker info > /dev/null 2>&1; then
        log_error "Docker daemon is not running"
        exit 1
    fi
    
    log_step "Checking environment variables..."
    source "$ENV_FILE"
    
    local required_vars=(
        "DB_PASSWORD"
        "REDIS_PASSWORD" 
        "JWT_SECRET"
        "JWT_REFRESH_SECRET"
        "ENCRYPTION_KEY"
        "TOGETHER_API_KEY"
        "ACME_EMAIL"
    )
    
    local missing_vars=()
    for var in "${required_vars[@]}"; do
        if [ -z "${!var}" ]; then
            missing_vars+=($var)
        fi
    done
    
    if [ ${#missing_vars[@]} -ne 0 ]; then
        log_error "Missing required environment variables: ${missing_vars[*]}"
        log_warning "Check $ENV_FILE and ensure all required variables are set"
        exit 1
    fi
    
    log_step "Validating network connectivity..."
    if ! curl -s --connect-timeout 5 https://api.together.xyz > /dev/null; then
        log_warning "Cannot reach Together AI API - check internet connectivity"
    fi
    
    log_success "Pre-deployment validation completed"
}

# Backup existing data
backup_data() {
    log_phase "DATA BACKUP"
    
    mkdir -p "$BACKUP_DIR"
    
    log_step "Creating database backup..."
    if docker-compose ps | grep -q postgres; then
        docker-compose exec -T postgres pg_dump -U recoder recoder_production | gzip > "$BACKUP_DIR/database-backup.sql.gz"
        log_success "Database backup created: $BACKUP_DIR/database-backup.sql.gz"
    else
        log_warning "No existing database container found - skipping database backup"
    fi
    
    log_step "Backing up configuration files..."
    cp -r nginx/ "$BACKUP_DIR/nginx-config/" 2>/dev/null || true
    cp -r monitoring/ "$BACKUP_DIR/monitoring-config/" 2>/dev/null || true
    cp "$ENV_FILE" "$BACKUP_DIR/env-backup" 2>/dev/null || true
    
    log_step "Recording current state..."
    docker-compose ps > "$BACKUP_DIR/previous-containers.txt" 2>/dev/null || true
    docker images > "$BACKUP_DIR/previous-images.txt" 2>/dev/null || true
    
    log_success "Backup completed: $BACKUP_DIR"
}

# Build and deploy services
deploy_services() {
    log_phase "SERVICE DEPLOYMENT"
    
    log_step "Stopping existing services..."
    docker-compose -f "$COMPOSE_FILE" down || true
    
    log_step "Pulling latest base images..."
    docker-compose -f "$COMPOSE_FILE" pull postgres redis nginx grafana prometheus || true
    
    log_step "Building application images..."
    docker-compose -f "$COMPOSE_FILE" build --no-cache --parallel
    
    log_step "Starting core infrastructure..."
    docker-compose -f "$COMPOSE_FILE" up -d postgres redis
    
    log_step "Waiting for database to be ready..."
    local max_attempts=30
    local attempt=0
    
    while [ $attempt -lt $max_attempts ]; do
        if docker-compose -f "$COMPOSE_FILE" exec -T postgres pg_isready -U recoder -d recoder_production; then
            log_success "Database is ready"
            break
        fi
        
        attempt=$((attempt + 1))
        log_step "Waiting for database... (attempt $attempt/$max_attempts)"
        sleep 5
    done
    
    if [ $attempt -eq $max_attempts ]; then
        log_error "Database failed to start within timeout"
        exit 1
    fi
    
    log_step "Starting application services..."
    docker-compose -f "$COMPOSE_FILE" up -d backend production-engine web chat
    
    log_step "Starting reverse proxy..."
    docker-compose -f "$COMPOSE_FILE" up -d nginx
    
    log_step "Starting SSL certificate service..."
    docker-compose -f "$COMPOSE_FILE" up -d certbot
    
    log_step "Starting monitoring stack..."
    docker-compose -f "$COMPOSE_FILE" --profile monitoring up -d
    
    log_step "Starting additional services..."
    docker-compose -f "$COMPOSE_FILE" up -d ollama healthcheck
    
    log_success "All services started"
}

# Health check validation
validate_deployment() {
    log_phase "DEPLOYMENT VALIDATION"
    
    local services=(
        "postgres:5432"
        "redis:6379"
        "backend:3001"
        "web:3000"
        "chat:3000"
        "production-engine:3002"
    )
    
    log_step "Waiting for services to stabilize..."
    sleep 30
    
    log_step "Checking service health..."
    
    for service in "${services[@]}"; do
        IFS=':' read -r service_name port <<< "$service"
        
        log_step "Checking $service_name..."
        
        local max_attempts=10
        local attempt=0
        local healthy=false
        
        while [ $attempt -lt $max_attempts ]; do
            if docker-compose -f "$COMPOSE_FILE" exec -T "$service_name" sh -c "exit 0" 2>/dev/null; then
                healthy=true
                break
            fi
            
            attempt=$((attempt + 1))
            sleep 3
        done
        
        if [ "$healthy" = true ]; then
            log_success "$service_name is healthy"
        else
            log_error "$service_name is not responding"
            exit 1
        fi
    done
    
    log_step "Testing HTTP endpoints..."
    
    # Wait for Nginx to start
    sleep 10
    
    local endpoints=(
        "http://localhost/nginx-health:healthy"
        "http://localhost:3000/api/health:ok"
        "http://localhost:3001/api/health:ok"
        "http://localhost:3002/health:ok"
    )
    
    for endpoint in "${endpoints[@]}"; do
        IFS=':' read -r url expected <<< "$endpoint"
        
        log_step "Testing $url..."
        
        local response=$(curl -s --max-time 10 "$url" 2>/dev/null || echo "ERROR")
        
        if [[ "$response" == *"$expected"* ]]; then
            log_success "$url responded correctly"
        else
            log_error "$url failed (response: $response)"
            exit 1
        fi
    done
    
    log_success "All health checks passed"
}

# Post-deployment setup
post_deployment() {
    log_phase "POST-DEPLOYMENT SETUP"
    
    log_step "Recording deployment information..."
    cat > "./deployments/deployment-$DEPLOYMENT_ID.json" << EOF
{
    "deployment_id": "$DEPLOYMENT_ID",
    "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)",
    "status": "completed",
    "services": {
        "database": "postgres:15-alpine",
        "cache": "redis:7-alpine", 
        "backend": "recoder/backend:production",
        "web": "recoder/web:production",
        "chat": "recoder/chat:production",
        "production-engine": "recoder/production-engine:production",
        "proxy": "nginx:alpine"
    },
    "monitoring": {
        "grafana": "http://localhost:3004",
        "prometheus": "http://localhost:9090"
    }
}
EOF
    
    log_step "Setting up log rotation..."
    docker-compose -f "$COMPOSE_FILE" exec -T nginx sh -c "
        echo '0 2 * * * /usr/sbin/logrotate /etc/logrotate.conf' | crontab -
    " 2>/dev/null || true
    
    log_step "Starting backup cron job..."
    docker-compose -f "$COMPOSE_FILE" --profile backup up -d db-backup
    
    log_success "Post-deployment setup completed"
}

# Cleanup function
cleanup() {
    log_phase "CLEANUP"
    
    log_step "Removing unused Docker images..."
    docker image prune -f
    
    log_step "Removing unused volumes..."
    docker volume prune -f
    
    log_success "Cleanup completed"
}

# Rollback function (in case of failure)
rollback() {
    log_error "DEPLOYMENT FAILED - INITIATING ROLLBACK"
    
    if [[ -f "$BACKUP_DIR/database-backup.sql.gz" ]]; then
        log_step "Restoring database backup..."
        docker-compose -f "$COMPOSE_FILE" up -d postgres
        sleep 10
        zcat "$BACKUP_DIR/database-backup.sql.gz" | docker-compose -f "$COMPOSE_FILE" exec -T postgres psql -U recoder recoder_production
    fi
    
    log_step "Stopping failed deployment..."
    docker-compose -f "$COMPOSE_FILE" down
    
    log_error "Rollback completed. Check logs: $LOG_FILE"
    exit 1
}

# Main execution
main() {
    # Set trap for rollback on failure
    trap rollback ERR
    
    # Create directories
    mkdir -p deployments logs backups
    
    # Execute deployment phases
    validate_environment
    backup_data
    deploy_services
    validate_deployment
    post_deployment
    cleanup
    
    # Success summary
    log ""
    log "${GREEN}🎉 PRODUCTION DEPLOYMENT SUCCESSFUL! 🎉${NC}"
    log "${PURPLE}══════════════════════════════════════════${NC}"
    log ""
    log "${CYAN}🌐 Live Endpoints:${NC}"
    log "   • Main Website:    https://recoder.xyz"
    log "   • Chat Platform:   https://chat.recoder.xyz"  
    log "   • API Gateway:     https://api.recoder.xyz"
    log "   • Monitoring:      https://monitor.recoder.xyz"
    log "   • Local Access:    http://localhost (proxy)"
    log ""
    log "${CYAN}📊 Monitoring Access:${NC}"
    log "   • Grafana:         http://localhost:3004"
    log "   • Prometheus:      http://localhost:9090"
    log "   • Nginx Status:    http://localhost/nginx-health"
    log ""
    log "${CYAN}📁 Backup Location:${NC}"
    log "   • Backup Directory: $BACKUP_DIR"
    log "   • Deployment Log:   $LOG_FILE"
    log ""
    log "${CYAN}🎯 Next Steps:${NC}"
    log "   1. Configure DNS records for your domains"
    log "   2. Test SSL certificate automation"
    log "   3. Monitor application performance"
    log "   4. Set up external backup sync"
    log "   5. Configure monitoring alerts"
    log ""
    log "${GREEN}🏆 RECODER.XYZ IS LIVE IN PRODUCTION!${NC}"
    
    log_success "Production deployment completed successfully!"
}

# Execute main function with all arguments
main "$@"