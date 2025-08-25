#!/bin/bash

# Health Check Script for Recoder Web Platform
# Monitors multiple deployment endpoints

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

# Endpoints to check
NETLIFY_URL="https://recoder-web.netlify.app"
VERCEL_URL="https://recoder-9pbb0n3fs-arhansubas-projects.vercel.app"
LOCAL_URL="http://localhost:3000"

check_endpoint() {
    local url=$1
    local name=$2
    
    echo -n "Checking $name... "
    
    response=$(curl -s -o /dev/null -w "%{http_code}" "$url" --max-time 10)
    
    if [ "$response" = "200" ]; then
        echo -e "${GREEN}✅ HEALTHY${NC} (HTTP $response)"
        echo "  URL: $url"
        echo "  Response time: $(curl -s -o /dev/null -w "%{time_total}s" "$url" --max-time 10)"
    elif [ "$response" = "000" ]; then
        echo -e "${RED}❌ UNREACHABLE${NC}"
        echo "  URL: $url"
    else
        echo -e "${YELLOW}⚠️ ISSUES${NC} (HTTP $response)"
        echo "  URL: $url"
    fi
    echo ""
}

echo "🔍 Recoder Web Platform - Health Check"
echo "======================================="
echo ""

# Check Netlify
check_endpoint "$NETLIFY_URL" "Netlify (Primary)"

# Check Vercel
check_endpoint "$VERCEL_URL" "Vercel (Secondary)"

# Check Local if running
check_endpoint "$LOCAL_URL" "Local Development"

# Check API endpoints
echo "🔌 API Health Checks:"
echo "---------------------"
check_endpoint "$NETLIFY_URL/api/health" "Netlify API"
check_endpoint "$NETLIFY_URL/api/status" "Status Endpoint"

echo "🏁 Health check completed at $(date)"
