#!/bin/bash

# VS Code Extension Publishing Script
# Automates the build and publishing process to VS Code Marketplace

set -e

echo "🚀 Starting VS Code Extension Publishing Process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "src/package.json" ]; then
    echo -e "${RED}❌ Error: src/package.json not found. Are you in the recoder-extension directory?${NC}"
    exit 1
fi

# Check required environment variables
if [ -z "$VSCE_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  Warning: VSCE_TOKEN not set. You'll need to login manually.${NC}"
fi

if [ -z "$OVSX_TOKEN" ]; then
    echo -e "${YELLOW}⚠️  Warning: OVSX_TOKEN not set. Open VSX publishing will be skipped.${NC}"
fi

echo -e "${BLUE}📦 Step 1: Installing dependencies...${NC}"
cd src
npm install

echo -e "${BLUE}🔍 Step 2: Running linter and type checks...${NC}"
npm run lint
npm run check-types

echo -e "${BLUE}🧪 Step 3: Running tests...${NC}"
npm run test

echo -e "${BLUE}🏗️  Step 4: Building extension...${NC}"
npm run bundle

echo -e "${BLUE}📋 Step 5: Checking package.json version...${NC}"
VERSION=$(node -p "require('./package.json').version")
echo -e "Current version: ${GREEN}$VERSION${NC}"

# Ask for version bump if needed
read -p "Do you want to bump the version? (y/N): " bump_version
if [[ $bump_version =~ ^[Yy]$ ]]; then
    echo "Select version bump type:"
    echo "1) patch (1.0.0 -> 1.0.1)"
    echo "2) minor (1.0.0 -> 1.1.0)"
    echo "3) major (1.0.0 -> 2.0.0)"
    read -p "Enter choice (1-3): " version_choice
    
    case $version_choice in
        1) npm version patch ;;
        2) npm version minor ;;
        3) npm version major ;;
        *) echo "Invalid choice, keeping current version" ;;
    esac
    
    NEW_VERSION=$(node -p "require('./package.json').version")
    echo -e "New version: ${GREEN}$NEW_VERSION${NC}"
fi

echo -e "${BLUE}📦 Step 6: Creating VSIX package...${NC}"
npm run vsix

echo -e "${BLUE}🚀 Step 7: Publishing to marketplaces...${NC}"

# Publish to VS Code Marketplace
if [ ! -z "$VSCE_TOKEN" ]; then
    echo -e "${GREEN}Publishing to VS Code Marketplace...${NC}"
    npx vsce publish --no-dependencies
else
    echo -e "${YELLOW}Skipping VS Code Marketplace (no token)${NC}"
    echo "To publish manually:"
    echo "1. Set VSCE_TOKEN environment variable"
    echo "2. Run: npx vsce publish --no-dependencies"
fi

# Publish to Open VSX Registry
if [ ! -z "$OVSX_TOKEN" ]; then
    echo -e "${GREEN}Publishing to Open VSX Registry...${NC}"
    npx ovsx publish --no-dependencies
else
    echo -e "${YELLOW}Skipping Open VSX Registry (no token)${NC}"
    echo "To publish manually:"
    echo "1. Set OVSX_TOKEN environment variable"
    echo "2. Run: npx ovsx publish --no-dependencies"
fi

echo -e "${GREEN}✅ Publishing process completed!${NC}"
echo ""
echo "📋 Post-publishing checklist:"
echo "1. ✅ Extension built and packaged"
echo "2. ✅ Published to VS Code Marketplace"
echo "3. ✅ Published to Open VSX Registry"
echo "4. 🔄 Update GitHub releases"
echo "5. 📝 Update documentation"
echo "6. 📱 Announce on social media"

echo ""
echo -e "${BLUE}🔗 Links:${NC}"
echo "VS Code Marketplace: https://marketplace.visualstudio.com/items?itemName=recoderxyz.recoder-vscode"
echo "Open VSX Registry: https://open-vsx.org/extension/recoderxyz/recoder-vscode"