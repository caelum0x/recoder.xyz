#!/bin/bash

##############################################################################
# Recoder.xyz Ecosystem Deployment Script
# 
# Deploys CLI, Web Platform, and VS Code Extension with automated validation
##############################################################################

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
DEPLOY_ENV=${1:-staging}
DEPLOY_COMPONENTS=${2:-all}
DRY_RUN=${3:-false}

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$(dirname "$SCRIPT_DIR")")"
CLI_DIR="$ROOT_DIR/packages/cli"
WEB_DIR="$ROOT_DIR/recoder-web"
EXTENSION_DIR="$ROOT_DIR/recoder-extension"

# Deployment targets
CLI_REGISTRY="npm"
WEB_PLATFORM="vercel"
EXTENSION_MARKETPLACE="vscode"

echo -e "${BLUE}🚀 Recoder.xyz Ecosystem Deployment${NC}"
echo -e "${BLUE}Environment: ${DEPLOY_ENV}${NC}"
echo -e "${BLUE}Components: ${DEPLOY_COMPONENTS}${NC}"
echo -e "${BLUE}Dry Run: ${DRY_RUN}${NC}"
echo "============================================"

##############################################################################
# Utility Functions
##############################################################################

log_info() {
    echo -e "${BLUE}ℹ️  $1${NC}"
}

log_success() {
    echo -e "${GREEN}✅ $1${NC}"
}

log_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

log_error() {
    echo -e "${RED}❌ $1${NC}"
}

check_prerequisites() {
    log_info "Checking prerequisites..."
    
    # Check required tools
    command -v node >/dev/null 2>&1 || { log_error "Node.js is required but not installed."; exit 1; }
    command -v npm >/dev/null 2>&1 || { log_error "npm is required but not installed."; exit 1; }
    command -v git >/dev/null 2>&1 || { log_error "git is required but not installed."; exit 1; }
    
    # Check Node.js version
    NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        log_error "Node.js 18+ is required. Current version: $(node --version)"
        exit 1
    fi
    
    # Check git status
    if [ ! -z "$(git status --porcelain)" ]; then
        log_warning "Working directory is not clean. Uncommitted changes detected."
        if [ "$DRY_RUN" = "false" ]; then
            read -p "Continue anyway? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
        fi
    fi
    
    log_success "Prerequisites check passed"
}

validate_environment() {
    log_info "Validating deployment environment..."
    
    case $DEPLOY_ENV in
        staging|production)
            log_success "Environment '$DEPLOY_ENV' is valid"
            ;;
        *)
            log_error "Invalid environment '$DEPLOY_ENV'. Use 'staging' or 'production'"
            exit 1
            ;;
    esac
    
    # Check environment variables
    if [ "$DEPLOY_ENV" = "production" ]; then
        required_vars=(
            "ANTHROPIC_API_KEY"
            "GROQ_API_KEY" 
            "GOOGLE_API_KEY"
            "VERCEL_TOKEN"
            "VSCE_PAT"
            "NPM_TOKEN"
        )
        
        for var in "${required_vars[@]}"; do
            if [ -z "${!var}" ]; then
                log_error "Required environment variable $var is not set"
                exit 1
            fi
        done
        
        log_success "Production environment variables validated"
    fi
}

run_tests() {
    log_info "Running comprehensive test suite..."
    
    # CLI tests
    if should_deploy_component "cli"; then
        log_info "Running CLI tests..."
        cd "$CLI_DIR"
        npm test || { log_error "CLI tests failed"; exit 1; }
        log_success "CLI tests passed"
    fi
    
    # Web platform tests
    if should_deploy_component "web"; then
        log_info "Running Web platform tests..."
        cd "$WEB_DIR"
        npm test || { log_error "Web platform tests failed"; exit 1; }
        log_success "Web platform tests passed"
    fi
    
    # Extension tests  
    if should_deploy_component "extension"; then
        log_info "Running Extension tests..."
        cd "$EXTENSION_DIR"
        npm test || { log_error "Extension tests failed"; exit 1; }
        log_success "Extension tests passed"
    fi
    
    log_success "All tests passed"
}

build_all_components() {
    log_info "Building all components..."
    
    # Build CLI
    if should_deploy_component "cli"; then
        log_info "Building CLI..."
        cd "$CLI_DIR"
        npm run build || { log_error "CLI build failed"; exit 1; }
        log_success "CLI built successfully"
    fi
    
    # Build Web platform
    if should_deploy_component "web"; then
        log_info "Building Web platform..."
        cd "$WEB_DIR"
        npm run build || { log_error "Web platform build failed"; exit 1; }
        log_success "Web platform built successfully"
    fi
    
    # Build Extension
    if should_deploy_component "extension"; then
        log_info "Building Extension..."
        cd "$EXTENSION_DIR/src"
        npm run bundle || { log_error "Extension build failed"; exit 1; }
        log_success "Extension built successfully"
    fi
}

should_deploy_component() {
    local component=$1
    if [ "$DEPLOY_COMPONENTS" = "all" ]; then
        return 0
    fi
    
    [[ "$DEPLOY_COMPONENTS" == *"$component"* ]]
}

##############################################################################
# CLI Deployment
##############################################################################

deploy_cli() {
    if ! should_deploy_component "cli"; then
        log_info "Skipping CLI deployment"
        return 0
    fi
    
    log_info "Deploying CLI to npm..."
    cd "$CLI_DIR"
    
    # Update version for production
    if [ "$DEPLOY_ENV" = "production" ]; then
        npm version patch --no-git-tag-version
        NEW_VERSION=$(node -p "require('./package.json').version")
        log_info "Updated CLI version to $NEW_VERSION"
    fi
    
    # Publish to npm
    if [ "$DRY_RUN" = "false" ]; then
        if [ "$DEPLOY_ENV" = "production" ]; then
            npm publish --access public
        else
            npm publish --tag beta --access public
        fi
        log_success "CLI deployed to npm"
    else
        log_info "[DRY RUN] Would publish CLI to npm"
    fi
    
    # Create GitHub release
    if [ "$DEPLOY_ENV" = "production" ] && [ "$DRY_RUN" = "false" ]; then
        create_github_release "cli" "$NEW_VERSION"
    fi
}

##############################################################################
# Web Platform Deployment
##############################################################################

deploy_web() {
    if ! should_deploy_component "web"; then
        log_info "Skipping Web platform deployment"
        return 0
    fi
    
    log_info "Deploying Web platform to Vercel..."
    cd "$WEB_DIR"
    
    # Install Vercel CLI if not present
    if ! command -v vercel >/dev/null 2>&1; then
        npm install -g vercel
    fi
    
    # Deploy to Vercel
    if [ "$DRY_RUN" = "false" ]; then
        if [ "$DEPLOY_ENV" = "production" ]; then
            vercel --prod --yes
        else
            vercel --yes
        fi
        log_success "Web platform deployed to Vercel"
    else
        log_info "[DRY RUN] Would deploy Web platform to Vercel"
    fi
    
    # Run post-deployment tests
    if [ "$DRY_RUN" = "false" ]; then
        run_web_health_checks
    fi
}

run_web_health_checks() {
    log_info "Running web platform health checks..."
    
    # Get deployment URL
    local deployment_url
    if [ "$DEPLOY_ENV" = "production" ]; then
        deployment_url="https://web.recoder.xyz"
    else
        deployment_url=$(vercel ls recoder-web | grep -E 'https://' | head -1 | awk '{print $2}')
    fi
    
    # Health check endpoints
    local endpoints=(
        "/"
        "/api/health"
        "/api/ai/providers"
    )
    
    for endpoint in "${endpoints[@]}"; do
        local url="${deployment_url}${endpoint}"
        log_info "Checking $url..."
        
        if curl -f -s "$url" > /dev/null; then
            log_success "✓ $endpoint is healthy"
        else
            log_error "✗ $endpoint failed health check"
            exit 1
        fi
    done
    
    log_success "All web platform health checks passed"
}

##############################################################################
# VS Code Extension Deployment
##############################################################################

deploy_extension() {
    if ! should_deploy_component "extension"; then
        log_info "Skipping Extension deployment"
        return 0
    fi
    
    log_info "Deploying VS Code Extension..."
    cd "$EXTENSION_DIR/src"
    
    # Install vsce if not present
    if ! command -v vsce >/dev/null 2>&1; then
        npm install -g vsce
    fi
    
    # Update version for production
    if [ "$DEPLOY_ENV" = "production" ]; then
        vsce publish patch --no-git-tag
        NEW_VERSION=$(node -p "require('./package.json').version")
        log_info "Updated Extension version to $NEW_VERSION"
    fi
    
    # Publish to marketplace
    if [ "$DRY_RUN" = "false" ]; then
        if [ "$DEPLOY_ENV" = "production" ]; then
            vsce publish --pat "$VSCE_PAT"
        else
            vsce publish --pre-release --pat "$VSCE_PAT"
        fi
        log_success "Extension deployed to VS Code Marketplace"
    else
        log_info "[DRY RUN] Would publish Extension to VS Code Marketplace"
    fi
    
    # Also publish to Open VSX
    if [ "$DRY_RUN" = "false" ] && command -v ovsx >/dev/null 2>&1; then
        ovsx publish --pat "$OVSX_PAT"
        log_success "Extension also published to Open VSX"
    fi
}

##############################################################################
# Post-deployment tasks
##############################################################################

create_github_release() {
    local component=$1
    local version=$2
    
    log_info "Creating GitHub release for $component v$version..."
    
    # Create release notes
    local release_notes="## Recoder $component $version

### What's New
- Production-ready code generation with multi-AI intelligence
- Enhanced security and vulnerability scanning
- Improved cross-platform integration
- Bug fixes and performance improvements

### Installation
\`\`\`bash
npm install -g @recoder/cli@$version
\`\`\`

### Full Changelog
See the [commits](https://github.com/recoderxyz/recoder-$component/commits) for detailed changes."
    
    # Create GitHub release using gh CLI
    if command -v gh >/dev/null 2>&1; then
        echo "$release_notes" | gh release create "v$version" --title "$component v$version" --notes-file -
        log_success "GitHub release created for $component v$version"
    else
        log_warning "GitHub CLI not found, skipping release creation"
    fi
}

update_documentation() {
    log_info "Updating documentation..."
    
    # Update version in documentation
    local docs_files=(
        "$ROOT_DIR/README.md"
        "$ROOT_DIR/docs/installation.md"
        "$ROOT_DIR/packages/cli/README.md"
        "$ROOT_DIR/recoder-web/README.md"
        "$ROOT_DIR/recoder-extension/README.md"
    )
    
    for file in "${docs_files[@]}"; do
        if [ -f "$file" ]; then
            # Update installation commands with latest versions
            sed -i.bak 's/npm install -g @recoder\/cli@.*/npm install -g @recoder\/cli@latest/' "$file"
            log_info "Updated $file"
        fi
    done
    
    log_success "Documentation updated"
}

send_deployment_notification() {
    log_info "Sending deployment notification..."
    
    local components_deployed=()
    should_deploy_component "cli" && components_deployed+=("CLI")
    should_deploy_component "web" && components_deployed+=("Web Platform")
    should_deploy_component "extension" && components_deployed+=("VS Code Extension")
    
    local components_list=$(IFS=", "; echo "${components_deployed[*]}")
    
    # Send notification (customize based on your notification preferences)
    local message="🚀 Recoder.xyz deployment completed successfully!

Components deployed: $components_list
Environment: $DEPLOY_ENV
Timestamp: $(date)

All systems are operational and ready for users."
    
    # Send to Slack, Discord, or other notification system
    if [ -n "$SLACK_WEBHOOK_URL" ] && [ "$DRY_RUN" = "false" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"text\":\"$message\"}" \
            "$SLACK_WEBHOOK_URL"
        log_success "Slack notification sent"
    fi
    
    if [ -n "$DISCORD_WEBHOOK_URL" ] && [ "$DRY_RUN" = "false" ]; then
        curl -X POST -H 'Content-type: application/json' \
            --data "{\"content\":\"$message\"}" \
            "$DISCORD_WEBHOOK_URL"
        log_success "Discord notification sent"
    fi
}

##############################################################################
# Main Deployment Flow
##############################################################################

main() {
    echo -e "${BLUE}Starting Recoder.xyz ecosystem deployment...${NC}"
    
    # Pre-deployment checks
    check_prerequisites
    validate_environment
    
    # Run tests
    log_info "Running pre-deployment validation..."
    run_tests
    
    # Build all components
    build_all_components
    
    # Deploy components
    log_info "Starting deployment process..."
    
    deploy_cli
    deploy_web
    deploy_extension
    
    # Post-deployment tasks
    if [ "$DRY_RUN" = "false" ]; then
        update_documentation
        send_deployment_notification
    fi
    
    log_success "🎉 Recoder.xyz ecosystem deployment completed successfully!"
    
    # Print summary
    echo
    echo "============================================"
    echo -e "${GREEN}Deployment Summary${NC}"
    echo "Environment: $DEPLOY_ENV"
    echo "Components: $DEPLOY_COMPONENTS"
    echo "Status: SUCCESS"
    echo "Timestamp: $(date)"
    echo
    
    if should_deploy_component "cli"; then
        echo "📦 CLI: Available on npm as @recoder/cli"
    fi
    
    if should_deploy_component "web"; then
        if [ "$DEPLOY_ENV" = "production" ]; then
            echo "🌐 Web Platform: https://web.recoder.xyz"
        else
            echo "🌐 Web Platform: Deployed to Vercel staging"
        fi
    fi
    
    if should_deploy_component "extension"; then
        echo "🔌 VS Code Extension: Available on VS Code Marketplace"
    fi
    
    echo "============================================"
}

# Handle script interruption
trap 'log_error "Deployment interrupted"; exit 1' INT TERM

# Run main function
main "$@"