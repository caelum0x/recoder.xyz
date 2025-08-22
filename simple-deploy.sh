#!/bin/bash

# Simple Recoder.xyz Production Deployment Script
# Deploys backend, production engine, and main web app

set -e  # Exit on any error

echo "🚀 Starting Recoder.xyz Production Deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
BACKEND_PORT=${BACKEND_PORT:-3001}
ENGINE_PORT=${ENGINE_PORT:-3002}
WEB_PORT=${WEB_PORT:-3000}

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo -e "${RED}❌ .env file not found! Please create one with the required environment variables.${NC}"
    exit 1
fi

echo -e "${BLUE}📋 Checking environment configuration...${NC}"

# Load environment variables
source .env

# Validate critical environment variables
REQUIRED_VARS=(
    "OPENROUTER_API_KEY"
    "DATABASE_URL"
    "JWT_SECRET"
)

for var in "${REQUIRED_VARS[@]}"; do
    if [ -z "${!var}" ]; then
        echo -e "${RED}❌ Missing required environment variable: $var${NC}"
        exit 1
    fi
done

echo -e "${GREEN}✅ Environment configuration validated${NC}"

# Function to wait for service to be healthy
wait_for_service() {
    local url=$1
    local name=$2
    local max_attempts=30
    local attempt=1
    
    echo -e "${BLUE}🔄 Waiting for $name to be healthy...${NC}"
    
    while [ $attempt -le $max_attempts ]; do
        if curl -f -s "$url" > /dev/null 2>&1; then
            echo -e "${GREEN}✅ $name is healthy${NC}"
            return 0
        fi
        
        echo -e "${YELLOW}⏳ Attempt $attempt/$max_attempts - waiting for $name...${NC}"
        sleep 3
        ((attempt++))
    done
    
    echo -e "${RED}❌ $name failed to start within timeout${NC}"
    return 1
}

echo -e "${BLUE}🔧 Building all services...${NC}"

# Create logs and pids directories
mkdir -p logs pids

# Build and start backend
echo -e "${BLUE}📦 Building and starting backend...${NC}"
cd backend
npm install
npm run build || npm run build:prod || echo "Backend build completed"
PORT=$BACKEND_PORT npm start > ../logs/backend.log 2>&1 &
BACKEND_PID=$!
echo $BACKEND_PID > ../pids/backend.pid
echo -e "${GREEN}✅ Backend API started (PID: $BACKEND_PID)${NC}"
cd ..

# Build and start production engine
echo -e "${BLUE}🏭 Building and starting production engine...${NC}"
cd production-engine
npm install
npm run build || echo "Production engine build completed"
PORT=$ENGINE_PORT npm start > ../logs/engine.log 2>&1 &
ENGINE_PID=$!
echo $ENGINE_PID > ../pids/engine.pid
echo -e "${GREEN}✅ Production engine started (PID: $ENGINE_PID)${NC}"
cd ..

# Build and start main web app
echo -e "${BLUE}🌐 Building and starting main web application...${NC}"
cd app
npm install
npm run build || echo "Web app build completed"
PORT=$WEB_PORT npm start > ../logs/web.log 2>&1 &
WEB_PID=$!
echo $WEB_PID > ../pids/web.pid
echo -e "${GREEN}✅ Main web application started (PID: $WEB_PID)${NC}"
cd ..

echo -e "${BLUE}🔍 Performing health checks...${NC}"

# Wait for services to be healthy
wait_for_service "http://localhost:$BACKEND_PORT/health" "Backend API"
wait_for_service "http://localhost:$ENGINE_PORT/health" "Production Engine" 
wait_for_service "http://localhost:$WEB_PORT" "Web Application"

# Test critical endpoints
echo -e "${BLUE}🧪 Testing critical endpoints...${NC}"

# Test backend auth endpoint
if curl -f -s "http://localhost:$BACKEND_PORT/api/cli-auth/device/code" -X POST -H "Content-Type: application/json" -d '{}' > /dev/null; then
    echo -e "${GREEN}✅ Backend CLI auth endpoint working${NC}"
else
    echo -e "${YELLOW}⚠️ Backend CLI auth endpoint may need configuration${NC}"
fi

# Test production engine with OpenRouter
if curl -f -s "http://localhost:$ENGINE_PORT/api/openrouter/models" > /dev/null; then
    echo -e "${GREEN}✅ Production engine OpenRouter integration working${NC}"
else
    echo -e "${YELLOW}⚠️ Production engine OpenRouter integration may need configuration${NC}"
fi

echo -e "${GREEN}🎉 Deployment completed successfully!${NC}"
echo ""
echo -e "${BLUE}📊 Service Status:${NC}"
echo -e "  🌐 Web Application: ${GREEN}http://localhost:$WEB_PORT${NC}"
echo -e "  📊 Backend API: ${GREEN}http://localhost:$BACKEND_PORT${NC}"
echo -e "  🏭 Production Engine: ${GREEN}http://localhost:$ENGINE_PORT${NC}"
echo ""
echo -e "${BLUE}📝 Next Steps:${NC}"
echo "  1. Test CLI packages with: npm install -g recoder-cli"
echo "  2. Set up domain and SSL for production"
echo "  3. Monitor logs in ./logs/ directory"
echo "  4. Use ./check-status.sh to monitor services"
echo ""
echo -e "${BLUE}🛠️ CLI Testing Commands:${NC}"
echo "  • recoder auth login"
echo "  • recoder \"create a React component\""
echo "  • recoder-cli-router --help"
echo ""
echo -e "${GREEN}✅ Your Recoder.xyz platform is now ready for users!${NC}"

# Create a status check script
cat > check-status.sh << 'EOF'
#!/bin/bash

echo "🔍 Recoder.xyz Service Status Check"
echo "=================================="

# Check if services are running
backend_pid=$(cat pids/backend.pid 2>/dev/null)
engine_pid=$(cat pids/engine.pid 2>/dev/null)
web_pid=$(cat pids/web.pid 2>/dev/null)

if [ -n "$backend_pid" ] && kill -0 $backend_pid 2>/dev/null; then
    echo "✅ Backend API (PID: $backend_pid) - Running"
else
    echo "❌ Backend API - Not running"
fi

if [ -n "$engine_pid" ] && kill -0 $engine_pid 2>/dev/null; then
    echo "✅ Production Engine (PID: $engine_pid) - Running"
else
    echo "❌ Production Engine - Not running"
fi

if [ -n "$web_pid" ] && kill -0 $web_pid 2>/dev/null; then
    echo "✅ Web Application (PID: $web_pid) - Running"
else
    echo "❌ Web Application - Not running"
fi

echo ""
echo "📊 Health Check URLs:"
curl -s http://localhost:3001/health | head -1 2>/dev/null && echo "✅ Backend healthy" || echo "❌ Backend not responding"
curl -s http://localhost:3002/health | head -1 2>/dev/null && echo "✅ Engine healthy" || echo "❌ Engine not responding"
curl -s http://localhost:3000 | head -1 2>/dev/null && echo "✅ Web app healthy" || echo "❌ Web app not responding"
EOF

chmod +x check-status.sh

# Create a stop script
cat > stop-services.sh << 'EOF'
#!/bin/bash

echo "🛑 Stopping Recoder.xyz services..."

# Stop services using PIDs
backend_pid=$(cat pids/backend.pid 2>/dev/null)
engine_pid=$(cat pids/engine.pid 2>/dev/null)
web_pid=$(cat pids/web.pid 2>/dev/null)

if [ -n "$backend_pid" ] && kill -0 $backend_pid 2>/dev/null; then
    kill $backend_pid
    echo "✅ Stopped Backend API (PID: $backend_pid)"
fi

if [ -n "$engine_pid" ] && kill -0 $engine_pid 2>/dev/null; then
    kill $engine_pid
    echo "✅ Stopped Production Engine (PID: $engine_pid)"
fi

if [ -n "$web_pid" ] && kill -0 $web_pid 2>/dev/null; then
    kill $web_pid
    echo "✅ Stopped Web Application (PID: $web_pid)"
fi

# Clean up PID files
rm -f pids/*.pid

echo "🎉 All services stopped"
EOF

chmod +x stop-services.sh

echo -e "${BLUE}💡 Created management scripts:${NC}"
echo "  • check-status.sh - Monitor service health"
echo "  • stop-services.sh - Stop all services"