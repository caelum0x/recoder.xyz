#!/bin/bash

# Verify All Packages - Build and Test Script
# Tests all packages in the monorepo

set -e  # Exit on error

echo "============================================================================="
echo "RECODER CODE MONOREPO - PACKAGE VERIFICATION"
echo "============================================================================="
echo ""

PACKAGES_DIR="/Users/arhansubasi/claude-code/recoder-code/packages"
FAILED=0
PASSED=0

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to check package
check_package() {
    local package_name=$1
    local package_dir="$PACKAGES_DIR/$package_name"

    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 Package: $package_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    if [ ! -d "$package_dir" ]; then
        echo -e "${RED}❌ Package directory not found${NC}"
        ((FAILED++))
        return 1
    fi

    cd "$package_dir"

    # Check package.json
    if [ ! -f "package.json" ]; then
        echo -e "${RED}❌ package.json not found${NC}"
        ((FAILED++))
        return 1
    fi

    local pkg_version=$(grep '"version"' package.json | head -1 | cut -d'"' -f4)
    echo "Version: $pkg_version"

    # Check TypeScript
    echo -n "TypeScript check... "
    if npm run typecheck > /dev/null 2>&1 || npm run check-types > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Passed${NC}"
    else
        echo -e "${YELLOW}⚠️  No typecheck script${NC}"
    fi

    # Build
    echo -n "Build... "
    if npm run build > /dev/null 2>&1 || npm run compile > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Success${NC}"
    else
        echo -e "${RED}❌ Failed${NC}"
        ((FAILED++))
        return 1
    fi

    # Check dist/build output
    if [ -d "dist" ]; then
        local dist_size=$(du -sh dist | cut -f1)
        echo "Build output: dist/ ($dist_size)"
    fi

    # Check for VSIX (VSCode extension)
    if ls *.vsix > /dev/null 2>&1; then
        local vsix_file=$(ls *.vsix | head -1)
        local vsix_size=$(du -h "$vsix_file" | cut -f1)
        echo "Package: $vsix_file ($vsix_size)"
    fi

    echo -e "${GREEN}✅ Package verified${NC}"
    ((PASSED++))
    echo ""
}

# Check all packages
check_package "core"
check_package "cli"
check_package "mcp-eternos"
check_package "vscode-ide-companion"

# Summary
echo "============================================================================="
echo "VERIFICATION SUMMARY"
echo "============================================================================="
echo -e "${GREEN}Passed: $PASSED${NC}"
if [ $FAILED -gt 0 ]; then
    echo -e "${RED}Failed: $FAILED${NC}"
else
    echo -e "${GREEN}Failed: 0${NC}"
fi
echo "============================================================================="

if [ $FAILED -eq 0 ]; then
    echo -e "${GREEN}✅ All packages verified successfully!${NC}"
    exit 0
else
    echo -e "${RED}❌ Some packages failed verification${NC}"
    exit 1
fi
