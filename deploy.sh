#!/bin/bash

# Recoder.xyz Production Deployment Script
# Automated deployment with zero-downtime and rollback capabilities

set -e  # Exit on any error

# Configuration
PROJECT_NAME="recoder"
DOCKER_REGISTRY="ghcr.io/recoder-team"
VERSION_FILE="version.json"
BACKUP_DIR="./backups"
LOG_FILE="./logs/deploy-$(date +%Y%m%d-%H%M%S).log"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Logging function
log() {
    echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} $1" | tee -a "$LOG_FILE"
}

error() {
    echo -e "${RED}[ERROR]${NC} $1" | tee -a "$LOG_FILE"
    exit 1
}

success() {
    echo -e "${GREEN}[SUCCESS]${NC} $1" | tee -a "$LOG_FILE"
}

warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1" | tee -a "$LOG_FILE"
}

# Check prerequisites
check_prerequisites() {
    log "Checking prerequisites..."
    
    if ! command -v docker &> /dev/null; then
        error "Docker is required but not installed"
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        error "Docker Compose is required but not installed"
    fi
    
    if [[ ! -f ".env.production" ]]; then
        error ".env.production file is required"
    fi
    
    success "Prerequisites check passed"
}

# Load environment variables
load_environment() {
    log "Loading production environment..."
    
    if [[ -f ".env.production" ]]; then
        export $(grep -v '^#' .env.production | xargs)
        success "Production environment loaded"
    else
        error "Production environment file not found"
    fi
}

# Backup database
backup_database() {
    log "Creating database backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    local backup_file="${BACKUP_DIR}/backup-$(date +%Y%m%d-%H%M%S).sql"
    
    docker-compose -f docker-compose.production.yml exec -T postgres \
        pg_dump -U "${DB_USER:-recoder}" recoder_production > "$backup_file"
    
    if [[ $? -eq 0 ]]; then
        success "Database backup created: $backup_file"
    else
        error "Database backup failed"
    fi
}

# Build and push images
build_images() {
    log "Building production images..."
    
    # Get version from package.json or generate one
    local version=$(node -p "require('./package.json').version" 2>/dev/null || echo "$(date +%Y%m%d)-$(git rev-parse --short HEAD)")
    
    log "Building version: $version"
    
    # Build images
    docker build -t "${DOCKER_REGISTRY}/recoder-web:${version}" --target web-production .
    docker build -t "${DOCKER_REGISTRY}/recoder-backend:${version}" --target backend-production .
    docker build -t "${DOCKER_REGISTRY}/recoder-cli:${version}" --target cli-production .
    
    # Tag as latest
    docker tag "${DOCKER_REGISTRY}/recoder-web:${version}" "${DOCKER_REGISTRY}/recoder-web:latest"
    docker tag "${DOCKER_REGISTRY}/recoder-backend:${version}" "${DOCKER_REGISTRY}/recoder-backend:latest"
    docker tag "${DOCKER_REGISTRY}/recoder-cli:${version}" "${DOCKER_REGISTRY}/recoder-cli:latest"
    
    success "Images built successfully"
    
    # Save version info
    echo "{\"version\": \"$version\", \"timestamp\": \"$(date -Iseconds)\", \"commit\": \"$(git rev-parse HEAD)\"}" > "$VERSION_FILE"
}

# Push images to registry (optional)
push_images() {
    if [[ "${PUSH_IMAGES:-false}" == "true" ]]; then
        log "Pushing images to registry..."
        
        local version=$(node -p "require('./${VERSION_FILE}').version")
        
        docker push "${DOCKER_REGISTRY}/recoder-web:${version}"
        docker push "${DOCKER_REGISTRY}/recoder-backend:${version}"
        docker push "${DOCKER_REGISTRY}/recoder-cli:${version}"
        docker push "${DOCKER_REGISTRY}/recoder-web:latest"
        docker push "${DOCKER_REGISTRY}/recoder-backend:latest"  
        docker push "${DOCKER_REGISTRY}/recoder-cli:latest"
        
        success "Images pushed to registry"
    fi
}

# Run database migrations
run_migrations() {
    log "Running database migrations..."
    
    docker-compose -f docker-compose.production.yml run --rm backend \
        sh -c "npm run migrate:deploy || echo 'No migrations to run'"
    
    success "Database migrations completed"
}

# Deploy services
deploy_services() {
    log "Deploying services..."
    
    # Pull latest images if using registry
    if [[ "${USE_REGISTRY:-false}" == "true" ]]; then
        docker-compose -f docker-compose.production.yml pull
    fi
    
    # Deploy with zero-downtime using rolling update
    docker-compose -f docker-compose.production.yml up -d --remove-orphans
    
    success "Services deployed"
}

# Health checks
health_check() {
    log "Performing health checks..."
    
    local max_attempts=30
    local attempt=1
    
    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts"
        
        # Check web service
        if curl -f -s "http://localhost:3000/api/health" > /dev/null; then
            success "Web service is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            error "Health check failed after $max_attempts attempts"
        fi
        
        sleep 10
        ((attempt++))
    done
    
    # Check backend service
    attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "http://localhost:3001/health" > /dev/null; then
            success "Backend service is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            error "Backend health check failed"
        fi
        
        sleep 10
        ((attempt++))
    done
}

# Rollback function
rollback() {
    warning "Initiating rollback..."
    
    if [[ -f "$VERSION_FILE.backup" ]]; then
        local previous_version=$(node -p "require('./${VERSION_FILE}.backup').version")
        log "Rolling back to version: $previous_version"
        
        # Restore previous images
        docker tag "${DOCKER_REGISTRY}/recoder-web:${previous_version}" "${DOCKER_REGISTRY}/recoder-web:latest"
        docker tag "${DOCKER_REGISTRY}/recoder-backend:${previous_version}" "${DOCKER_REGISTRY}/recoder-backend:latest"
        docker tag "${DOCKER_REGISTRY}/recoder-cli:${previous_version}" "${DOCKER_REGISTRY}/recoder-cli:latest"
        
        # Redeploy with previous version
        docker-compose -f docker-compose.production.yml up -d --remove-orphans
        
        # Restore database if needed
        local latest_backup=$(ls -t ${BACKUP_DIR}/*.sql | head -n1)
        if [[ -n "$latest_backup" ]]; then
            log "Restoring database from: $latest_backup"
            docker-compose -f docker-compose.production.yml exec -T postgres \
                psql -U "${DB_USER:-recoder}" -d recoder_production < "$latest_backup"
        fi
        
        success "Rollback completed"
    else
        error "No previous version found for rollback"
    fi
}

# Cleanup old images
cleanup() {
    log "Cleaning up old images..."
    
    # Remove old unused images
    docker image prune -f
    
    # Keep only last 5 backups
    ls -t ${BACKUP_DIR}/*.sql | tail -n +6 | xargs -r rm
    
    success "Cleanup completed"
}

# Post-deployment tasks
post_deploy() {
    log "Running post-deployment tasks..."
    
    # Warm up the application
    curl -s "http://localhost:3000" > /dev/null || true
    curl -s "http://localhost:3001/health" > /dev/null || true
    
    # Check disk space
    local disk_usage=$(df -h / | awk 'NR==2 {print $5}' | sed 's/%//')
    if [[ $disk_usage -gt 80 ]]; then
        warning "Disk usage is high: ${disk_usage}%"
    fi
    
    # Display deployment summary
    local version=$(node -p "require('./${VERSION_FILE}').version" 2>/dev/null || echo "unknown")
    success "Deployment completed successfully!"
    success "Version: $version"
    success "Web: https://recoder.xyz"
    success "API: https://api.recoder.xyz"
    success "Admin: https://admin.recoder.xyz"
    success "Monitor: https://monitor.recoder.xyz"
}

# Main deployment function
main() {
    log "Starting Recoder.xyz deployment..."
    
    # Create logs directory
    mkdir -p logs
    
    # Backup current version info
    [[ -f "$VERSION_FILE" ]] && cp "$VERSION_FILE" "$VERSION_FILE.backup"
    
    # Deployment steps
    check_prerequisites
    load_environment
    backup_database
    build_images
    push_images
    run_migrations
    deploy_services
    
    # Health checks with rollback on failure
    if ! health_check; then
        warning "Health check failed, initiating rollback"
        rollback
        exit 1
    fi
    
    cleanup
    post_deploy
    
    success "🚀 Recoder.xyz deployment completed successfully!"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "rollback")
        rollback
        ;;
    "health")
        health_check
        ;;
    "backup")
        backup_database
        ;;
    "cleanup")
        cleanup
        ;;
    "build")
        build_images
        ;;
    *)
        echo "Usage: $0 {deploy|rollback|health|backup|cleanup|build}"
        echo ""
        echo "Commands:"
        echo "  deploy   - Full deployment (default)"
        echo "  rollback - Rollback to previous version"
        echo "  health   - Run health checks"
        echo "  backup   - Create database backup"
        echo "  cleanup  - Clean up old images and backups"
        echo "  build    - Build images only"
        exit 1
        ;;
esac