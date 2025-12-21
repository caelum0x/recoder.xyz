#!/bin/bash

# Pre-Deployment Test Script for recoder-web
# Run this before deploying to production

set -e

echo "🚀 RECODER-WEB PRE-DEPLOYMENT TESTS"
echo "===================================="
echo ""

ERRORS=0
WARNINGS=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

pass() { echo -e "${GREEN}✓${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; ((ERRORS++)); }
warn() { echo -e "${YELLOW}⚠${NC} $1"; ((WARNINGS++)); }

# 1. Build Test
echo "📦 1. BUILD TEST"
echo "----------------"
if npm run build > /dev/null 2>&1; then
  pass "Production build successful"
else
  fail "Production build failed"
fi

# 2. TypeScript Check (warnings only)
echo ""
echo "📝 2. TYPESCRIPT CHECK"
echo "----------------------"
TS_ERRORS=$(npx tsc --noEmit 2>&1 | grep -c "error TS" || true)
if [ "$TS_ERRORS" -eq 0 ]; then
  pass "No TypeScript errors"
else
  warn "TypeScript has $TS_ERRORS errors (build still works)"
fi

# 3. Required Files Check
echo ""
echo "📁 3. REQUIRED FILES"
echo "--------------------"
FILES=(
  "public/favicon-32.png"
  "public/favicon-16.png"
  "public/apple-touch-icon.png"
  "app/root.tsx"
  "app/routes/_index.tsx"
  "wrangler.toml"
  ".env.production"
)
for f in "${FILES[@]}"; do
  if [ -f "$f" ]; then
    pass "$f exists"
  else
    fail "$f missing"
  fi
done

# 4. Environment Variables Check
echo ""
echo "🔐 4. ENVIRONMENT VARIABLES"
echo "---------------------------"
if [ -f ".env.production" ]; then
  ENV_VARS=("VITE_" "DATABASE_URL" "OPENROUTER")
  for var in "${ENV_VARS[@]}"; do
    if grep -q "$var" .env.production 2>/dev/null; then
      pass "$var configured"
    else
      warn "$var not found in .env.production"
    fi
  done
else
  fail ".env.production not found"
fi

# 5. API Routes Check
echo ""
echo "🔌 5. API ROUTES"
echo "----------------"
API_ROUTES=(
  "app/routes/api.chat-history.ts"
  "app/routes/api.analytics.ts"
  "app/routes/api.system-health.ts"
  "app/routes/api.projects.ts"
)
for route in "${API_ROUTES[@]}"; do
  if [ -f "$route" ]; then
    pass "$route exists"
  else
    warn "$route missing"
  fi
done

# 6. Component Check
echo ""
echo "🧩 6. KEY COMPONENTS"
echo "--------------------"
COMPONENTS=(
  "app/components/chat/Chat.client.tsx"
  "app/components/sidebar/Menu.client.tsx"
  "app/components/admin/SystemMonitor.tsx"
  "app/components/analytics/OptimizationDashboard.tsx"
)
for comp in "${COMPONENTS[@]}"; do
  if [ -f "$comp" ]; then
    pass "$comp exists"
  else
    fail "$comp missing"
  fi
done

# 7. No Debug/Console Spam Check
echo ""
echo "🔍 7. CODE QUALITY"
echo "------------------"
DEBUG_COUNT=$(grep -r "console.log" app/routes/*.ts 2>/dev/null | wc -l | tr -d ' ')
if [ "$DEBUG_COUNT" -lt 20 ]; then
  pass "Console logs acceptable ($DEBUG_COUNT in routes)"
else
  warn "Many console.logs in routes ($DEBUG_COUNT) - consider cleanup"
fi

# 8. Build Output Check
echo ""
echo "📊 8. BUILD OUTPUT"
echo "------------------"
if [ -d "build/client" ] && [ -d "build/server" ]; then
  CLIENT_SIZE=$(du -sh build/client 2>/dev/null | cut -f1)
  SERVER_SIZE=$(du -sh build/server 2>/dev/null | cut -f1)
  pass "Client bundle: $CLIENT_SIZE"
  pass "Server bundle: $SERVER_SIZE"
else
  fail "Build output directories missing"
fi

# 9. Wrangler Config Check
echo ""
echo "☁️  9. CLOUDFLARE CONFIG"
echo "------------------------"
if [ -f "wrangler.toml" ]; then
  if grep -q "name" wrangler.toml; then
    pass "Wrangler project name configured"
  else
    fail "Wrangler project name missing"
  fi
  if grep -q "compatibility_date" wrangler.toml; then
    pass "Compatibility date set"
  else
    warn "Compatibility date not set"
  fi
else
  fail "wrangler.toml not found"
fi

# 10. Package.json Scripts Check
echo ""
echo "📜 10. DEPLOYMENT SCRIPTS"
echo "-------------------------"
if grep -q '"deploy"' package.json; then
  pass "Deploy script exists"
else
  warn "No deploy script in package.json"
fi
if grep -q '"build"' package.json; then
  pass "Build script exists"
else
  fail "Build script missing"
fi

# Summary
echo ""
echo "===================================="
echo "📋 SUMMARY"
echo "===================================="
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✓ All critical checks passed!${NC}"
else
  echo -e "${RED}✗ $ERRORS critical errors found${NC}"
fi
if [ $WARNINGS -gt 0 ]; then
  echo -e "${YELLOW}⚠ $WARNINGS warnings${NC}"
fi
echo ""

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}🚀 Ready for deployment!${NC}"
  echo ""
  echo "Deploy commands:"
  echo "  npm run deploy        # Deploy to Cloudflare"
  echo "  wrangler pages deploy # Manual deploy"
  exit 0
else
  echo -e "${RED}❌ Fix errors before deploying${NC}"
  exit 1
fi
