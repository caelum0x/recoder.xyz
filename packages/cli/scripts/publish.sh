#!/bin/bash

# NPM Package Publishing Script for @recoder/cli
# Automates the build, test, and publishing process

set -e

echo "🚀 Starting @recoder/cli NPM Publishing Process..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}❌ Error: package.json not found. Are you in the packages/cli directory?${NC}"
    exit 1
fi

# Check if user is logged into NPM
if ! npm whoami > /dev/null 2>&1; then
    echo -e "${RED}❌ Error: Not logged into NPM. Run 'npm login' first.${NC}"
    exit 1
fi

NPM_USER=$(npm whoami)
echo -e "${GREEN}✅ Logged into NPM as: $NPM_USER${NC}"

echo -e "${BLUE}📦 Step 1: Installing dependencies...${NC}"
npm install

echo -e "${BLUE}🔍 Step 2: Running linter and type checks...${NC}"
npm run lint
npm run typecheck

echo -e "${BLUE}🧪 Step 3: Running tests...${NC}"
npm run test

echo -e "${BLUE}🏗️  Step 4: Building package...${NC}"
npm run build

echo -e "${BLUE}📋 Step 5: Checking package.json...${NC}"
PACKAGE_NAME=$(node -p "require('./package.json').name")
VERSION=$(node -p "require('./package.json').version")
echo -e "Package: ${GREEN}$PACKAGE_NAME${NC}"
echo -e "Current version: ${GREEN}$VERSION${NC}"

# Check if package already exists at this version
if npm view $PACKAGE_NAME@$VERSION > /dev/null 2>&1; then
    echo -e "${YELLOW}⚠️  Warning: Version $VERSION already exists on NPM${NC}"
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
            *) 
                echo -e "${RED}Invalid choice. Exiting.${NC}"
                exit 1
                ;;
        esac
        
        NEW_VERSION=$(node -p "require('./package.json').version")
        echo -e "New version: ${GREEN}$NEW_VERSION${NC}"
    else
        echo -e "${RED}Cannot publish existing version. Exiting.${NC}"
        exit 1
    fi
fi

echo -e "${BLUE}🔍 Step 6: Package verification...${NC}"
echo "Package contents that will be published:"
npm pack --dry-run

echo ""
read -p "Do you want to proceed with publishing? (y/N): " confirm_publish

if [[ ! $confirm_publish =~ ^[Yy]$ ]]; then
    echo -e "${YELLOW}Publishing cancelled.${NC}"
    exit 0
fi

echo -e "${BLUE}🚀 Step 7: Publishing to NPM...${NC}"

# Publish to NPM
if npm publish --access public; then
    FINAL_VERSION=$(node -p "require('./package.json').version")
    echo -e "${GREEN}✅ Successfully published $PACKAGE_NAME@$FINAL_VERSION to NPM!${NC}"
    
    echo ""
    echo "📋 Post-publishing checklist:"
    echo "1. ✅ Package built and tested"
    echo "2. ✅ Published to NPM registry"
    echo "3. 🔄 Update GitHub releases"
    echo "4. 📝 Update documentation"
    echo "5. 🧪 Test installation: npm install -g @recoder/cli"
    echo "6. 📱 Announce release"
    
    echo ""
    echo -e "${BLUE}🔗 Links:${NC}"
    echo "NPM Package: https://www.npmjs.com/package/@recoder/cli"
    echo "Install globally: npm install -g @recoder/cli"
    echo "Usage: recoder --help"
    
else
    echo -e "${RED}❌ Publishing failed!${NC}"
    exit 1
fi