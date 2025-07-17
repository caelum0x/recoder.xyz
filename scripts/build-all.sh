#!/bin/bash

# CodeCraft - Build All Script
# Builds all packages and services in the correct order

set -e  # Exit on any error

echo "🚀 CodeCraft - Building All Components"
echo "=================================="

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

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Function to build a package
build_package() {
    local package_name=$1
    local package_path=$2
    
    print_status "Building $package_name..."
    
    if [ ! -d "$package_path" ]; then
        print_error "Directory $package_path does not exist"
        return 1
    fi
    
    cd "$package_path"
    
    # Install dependencies if node_modules doesn't exist
    if [ ! -d "node_modules" ]; then
        print_status "Installing dependencies for $package_name..."
        npm install
    fi
    
    # Check if build script exists
    if npm run build --dry-run >/dev/null 2>&1; then
        npm run build
        print_success "$package_name built successfully"
    else
        print_warning "$package_name has no build script, skipping..."
    fi
    
    cd - >/dev/null
}

# Function to run tests for a package
test_package() {
    local package_name=$1
    local package_path=$2
    
    if [ "$SKIP_TESTS" = "true" ]; then
        print_warning "Skipping tests for $package_name (SKIP_TESTS=true)"
        return 0
    fi
    
    print_status "Testing $package_name..."
    
    cd "$package_path"
    
    if npm run test --dry-run >/dev/null 2>&1; then
        npm run test
        print_success "$package_name tests passed"
    else
        print_warning "$package_name has no test script, skipping..."
    fi
    
    cd - >/dev/null
}

# Check prerequisites
print_status "Checking prerequisites..."

if ! command_exists node; then
    print_error "Node.js is not installed. Please install Node.js 18+ and try again."
    exit 1
fi

if ! command_exists npm; then
    print_error "npm is not installed. Please install npm and try again."
    exit 1
fi

# Check Node.js version
NODE_VERSION=$(node --version | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    print_error "Node.js version 18 or higher is required. Current version: $(node --version)"
    exit 1
fi

print_success "Prerequisites check passed"

# Get script directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_ROOT"

print_status "Building from: $PROJECT_ROOT"

# Clean previous builds if requested
if [ "$CLEAN_BUILD" = "true" ]; then
    print_status "Cleaning previous builds..."
    rm -rf packages/*/dist packages/*/out packages/*/build
    rm -rf backend/dist production-engine/dist
    print_success "Clean completed"
fi

# Install root dependencies
print_status "Installing root dependencies..."
npm install

# Build packages in dependency order
echo ""
print_status "Building packages in dependency order..."

# 1. Build shared package first (dependency for others)
build_package "Shared Package" "packages/shared"

# 2. Build CLI package
build_package "CLI Package" "packages/cli"

# 3. Build VSCode extension
build_package "VSCode Extension" "packages/vscode-extension"

# 4. Build backend
build_package "Backend API" "backend"

# 5. Build production engine
build_package "Production Engine" "production-engine"

# 6. Build web dashboard (if exists)
if [ -d "packages/web" ]; then
    build_package "Web Dashboard" "packages/web"
fi

# Run tests if not skipped
if [ "$SKIP_TESTS" != "true" ]; then
    echo ""
    print_status "Running tests..."
    
    test_package "Shared Package" "packages/shared"
    test_package "CLI Package" "packages/cli"
    test_package "Backend API" "backend"
    test_package "Production Engine" "production-engine"
fi

# Build examples if requested
if [ "$BUILD_EXAMPLES" = "true" ]; then
    echo ""
    print_status "Building examples..."
    
    # Build Solana DEX example
    if [ -d "examples/dex-solana" ] && command_exists anchor; then
        print_status "Building Solana DEX example..."
        cd examples/dex-solana
        anchor build
        cd - >/dev/null
        print_success "Solana DEX example built"
    else
        print_warning "Skipping Solana DEX example (missing anchor or directory)"
    fi
    
    # Build NFT Marketplace example
    if [ -d "examples/nft-marketplace" ]; then
        build_package "NFT Marketplace Example" "examples/nft-marketplace"
    fi
    
    # Build other examples
    for example_dir in examples/*/; do
        if [ -d "$example_dir" ] && [ -f "$example_dir/package.json" ]; then
            example_name=$(basename "$example_dir")
            if [ "$example_name" != "dex-solana" ] && [ "$example_name" != "nft-marketplace" ]; then
                build_package "$example_name Example" "$example_dir"
            fi
        fi
    done
fi

# Generate documentation if requested
if [ "$BUILD_DOCS" = "true" ]; then
    echo ""
    print_status "Generating documentation..."
    
    if command_exists typedoc; then
        npm run docs:generate
        print_success "Documentation generated"
    else
        print_warning "TypeDoc not installed, skipping documentation generation"
    fi
fi

# Create distribution packages if requested
if [ "$CREATE_DIST" = "true" ]; then
    echo ""
    print_status "Creating distribution packages..."
    
    # Create CLI distribution
    if [ -d "packages/cli/dist" ]; then
        cd packages/cli
        npm pack
        cd - >/dev/null
        print_success "CLI distribution package created"
    fi
    
    # Create VSCode extension package
    if [ -d "packages/vscode-extension" ] && command_exists vsce; then
        cd packages/vscode-extension
        vsce package
        cd - >/dev/null
        print_success "VSCode extension package created"
    fi
fi

# Build summary
echo ""
print_success "🎉 Build completed successfully!"
echo ""
echo "Built components:"
echo "  ✅ Shared Package"
echo "  ✅ CLI Package"
echo "  ✅ VSCode Extension"
echo "  ✅ Backend API"
echo "  ✅ Production Engine"

if [ "$BUILD_EXAMPLES" = "true" ]; then
    echo "  ✅ Examples"
fi

if [ "$BUILD_DOCS" = "true" ]; then
    echo "  ✅ Documentation"
fi

echo ""
echo "Next steps:"
echo "  • Run 'npm run dev' to start development servers"
echo "  • Run 'npm run test' to run full test suite"
echo "  • Run 'npm run docker:build' to build Docker images"
echo "  • Check 'docs/' for generated documentation"

# Performance metrics
END_TIME=$(date +%s)
if [ -n "$START_TIME" ]; then
    DURATION=$((END_TIME - START_TIME))
    echo "  • Build completed in ${DURATION} seconds"
fi

echo ""
print_success "CodeCraft is ready for development! 🚀"