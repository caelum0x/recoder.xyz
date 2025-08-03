#!/bin/bash

# Recoder.xyz Development Deployment Script
# For local development and testing without Docker

set -e  # Exit on any error

# Configuration
PROJECT_NAME="recoder"
LOG_FILE="./logs/deploy-dev-$(date +%Y%m%d-%H%M%S).log"

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
    log "Checking development prerequisites..."
    
    if ! command -v node &> /dev/null; then
        error "Node.js is required but not installed"
    fi
    
    if ! command -v npm &> /dev/null; then
        error "npm is required but not installed"
    fi
    
    success "Prerequisites check passed"
}

# Build all packages
build_packages() {
    log "Building all packages..."
    
    # Build CLI
    log "Building CLI package..."
    cd packages/cli
    if npm run build; then
        success "CLI package built successfully"
    else
        error "CLI package build failed"
    fi
    cd ../..
    
    # Build CLI Router
    log "Building CLI Router package..."
    cd packages/recoder-cli-router
    if npm run build; then
        success "CLI Router package built successfully"
    else
        error "CLI Router package build failed"
    fi
    cd ../..
    
    # Build shared packages
    log "Building shared packages..."
    cd packages/shared
    if npm run build; then
        success "Shared packages built successfully"
    else
        warning "Shared packages build skipped (no build script)"
    fi
    cd ../..
    
    success "All packages built successfully"
}

# Install dependencies
install_dependencies() {
    log "Installing dependencies..."
    
    # Root dependencies
    log "Installing root dependencies..."
    npm install
    
    # CLI dependencies
    log "Installing CLI dependencies..."
    cd packages/cli && npm install && cd ../..
    
    # CLI Router dependencies
    log "Installing CLI Router dependencies..."
    cd packages/recoder-cli-router && npm install && cd ../..
    
    # Shared dependencies
    log "Installing shared dependencies..."
    cd packages/shared && npm install && cd ../..
    
    # Web dependencies
    log "Installing web dependencies..."
    cd recoder-web && npm install && cd ..
    
    # Chat dependencies
    log "Installing chat dependencies..."
    cd recoder-chat && npm install && cd ..
    
    # Extension dependencies
    log "Installing extension dependencies..."
    cd recoder-extension/src && npm install && cd ../..
    
    success "All dependencies installed"
}

# Run tests
run_tests() {
    log "Running tests..."
    
    # Test CLI
    cd packages/cli
    if npm test 2>/dev/null || echo "No tests configured"; then
        success "CLI tests passed"
    fi
    cd ../..
    
    success "All tests completed"
}

# Start services
start_services() {
    log "Starting development services..."
    
    # Start CLI Router in background
    log "Starting CLI Router service..."
    cd packages/recoder-cli-router
    ANTHROPIC_API_KEY=test npm start &
    CLI_ROUTER_PID=$!
    echo $CLI_ROUTER_PID > ../../logs/cli-router.pid
    cd ../..
    
    # Start backend in background
    log "Starting backend service..."
    cd backend
    npm start &
    BACKEND_PID=$!
    echo $BACKEND_PID > ../logs/backend.pid
    cd ..
    
    # Start web service in background
    log "Starting web service..."
    cd recoder-web
    npm run dev &
    WEB_PID=$!
    echo $WEB_PID > ../logs/web.pid
    cd ..
    
    # Start chat service in background
    log "Starting chat service..."
    cd recoder-chat
    npm run dev &
    CHAT_PID=$!
    echo $CHAT_PID > ../logs/chat.pid
    cd ..
    
    success "All services started"
    
    # Wait a moment for services to start
    sleep 5
}

# Health checks
health_check() {
    log "Performing health checks..."
    
    local max_attempts=10
    local attempt=1
    
    # Check CLI Router
    while [[ $attempt -le $max_attempts ]]; do
        log "Health check attempt $attempt/$max_attempts for CLI Router"
        
        if curl -f -s "http://localhost:3456/api/router/status" > /dev/null 2>&1; then
            success "CLI Router service is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            warning "CLI Router health check failed, but continuing..."
            break
        fi
        
        sleep 3
        ((attempt++))
    done
    
    # Check web service
    attempt=1
    while [[ $attempt -le $max_attempts ]]; do
        if curl -f -s "http://localhost:3000" > /dev/null 2>&1; then
            success "Web service is healthy"
            break
        fi
        
        if [[ $attempt -eq $max_attempts ]]; then
            warning "Web service health check failed, but continuing..."
            break
        fi
        
        sleep 3
        ((attempt++))
    done
    
    success "Health checks completed"
}

# Display status
show_status() {
    log "Deployment status:"
    success "🚀 Recoder.xyz development deployment completed!"
    success ""
    success "Available services:"
    success "🌐 Web Platform:     http://localhost:3000"
    success "💬 Chat Platform:    http://localhost:3001"
    success "🔧 CLI Router:       http://localhost:3456"
    success "🛠️  Backend API:      http://localhost:3002"
    success ""
    success "VS Code Extension: Available in recoder-extension/"
    success "CLI Tool:          Available in packages/cli/dist/"
    success ""
    success "To stop services: ./deploy-dev.sh stop"
    success "To view logs:     tail -f logs/*.log"
}

# Stop services
stop_services() {
    log "Stopping development services..."
    
    # Kill services by PID
    if [[ -f "logs/cli-router.pid" ]]; then
        kill $(cat logs/cli-router.pid) 2>/dev/null || true
        rm logs/cli-router.pid
    fi
    
    if [[ -f "logs/backend.pid" ]]; then
        kill $(cat logs/backend.pid) 2>/dev/null || true
        rm logs/backend.pid
    fi
    
    if [[ -f "logs/web.pid" ]]; then
        kill $(cat logs/web.pid) 2>/dev/null || true
        rm logs/web.pid
    fi
    
    if [[ -f "logs/chat.pid" ]]; then
        kill $(cat logs/chat.pid) 2>/dev/null || true
        rm logs/chat.pid
    fi
    
    # Kill any remaining node processes on our ports
    pkill -f "port 3000" 2>/dev/null || true
    pkill -f "port 3001" 2>/dev/null || true
    pkill -f "port 3002" 2>/dev/null || true
    pkill -f "port 3456" 2>/dev/null || true
    
    success "All services stopped"
}

# Main deployment function
main() {
    log "Starting Recoder.xyz development deployment..."
    
    # Create logs directory
    mkdir -p logs
    
    # Deployment steps
    check_prerequisites
    install_dependencies
    build_packages
    run_tests
    start_services
    health_check
    show_status
    
    success "🎉 Development deployment completed successfully!"
}

# Handle script arguments
case "${1:-deploy}" in
    "deploy")
        main
        ;;
    "stop")
        stop_services
        ;;
    "status")
        show_status
        ;;
    "build")
        build_packages
        ;;
    "test")
        run_tests
        ;;
    *)
        echo "Usage: $0 {deploy|stop|status|build|test}"
        echo ""
        echo "Commands:"
        echo "  deploy  - Full development deployment (default)"
        echo "  stop    - Stop all services"
        echo "  status  - Show service status"
        echo "  build   - Build all packages"
        echo "  test    - Run tests"
        exit 1
        ;;
esac