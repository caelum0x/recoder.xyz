#!/bin/bash

# 📊 RECODER.XYZ - STATUS SCRIPT  
# Shows the status of all platforms and services

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
PURPLE='\033[0;35m'
CYAN='\033[0;36m'
NC='\033[0m'

echo -e "${BLUE}📊 RECODER.XYZ STATUS${NC}"
echo "=================================="

# Function to check if a service is running on a port
check_port() {
    local port=$1
    local name=$2
    
    if lsof -Pi :$port -sTCP:LISTEN -t >/dev/null; then
        echo -e "${GREEN}✅ $name (port $port) - Running${NC}"
        return 0
    else
        echo -e "${RED}❌ $name (port $port) - Stopped${NC}"
        return 1
    fi
}

# Function to check PID file
check_pid() {
    local name=$1
    local pid_file="logs/$name.pid"
    
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            echo -e "${GREEN}   PID: $pid - Active${NC}"
        else
            echo -e "${RED}   PID: $pid - Dead (stale PID file)${NC}"
            rm -f "$pid_file"
        fi
    else
        echo -e "${YELLOW}   No PID file found${NC}"
    fi
}

echo -e "${CYAN}🌐 Platform Status:${NC}"
check_port 3000 "Web Platform"
check_pid "Web Platform"

check_port 3001 "Chat Platform"  
check_pid "Chat Platform"

check_port 8000 "Backend API"
check_pid "Backend API"

check_port 8001 "Production Engine"
check_pid "Production Engine"

echo ""
echo -e "${CYAN}🗄️  Database Status:${NC}"
if [[ -n "$DATABASE_URL" ]]; then
    echo -e "${GREEN}✅ Neon PostgreSQL - Configured${NC}"
else
    echo -e "${RED}❌ Database URL not configured${NC}"
fi

echo ""
echo -e "${CYAN}🔐 Authentication:${NC}"
if [[ -n "$NEXTAUTH_SECRET" ]]; then
    echo -e "${GREEN}✅ NextAuth Secret - Configured${NC}"
else
    echo -e "${RED}❌ NextAuth Secret not configured${NC}"
fi

if [[ -n "$AUTH_SECRET" ]]; then
    echo -e "${GREEN}✅ Auth Secret - Configured${NC}"
else
    echo -e "${RED}❌ Auth Secret not configured${NC}"
fi

echo ""
echo -e "${CYAN}🤖 AI Providers:${NC}"
if [[ -n "$ANTHROPIC_API_KEY" ]]; then
    echo -e "${GREEN}✅ Anthropic (Claude) - Configured${NC}"
else
    echo -e "${RED}❌ Anthropic (Claude) - Missing API key${NC}"
fi

if [[ -n "$GROQ_API_KEY" ]]; then
    echo -e "${GREEN}✅ Groq - Configured${NC}"
else
    echo -e "${RED}❌ Groq - Missing API key${NC}"
fi

if [[ -n "$GOOGLE_API_KEY" ]]; then
    echo -e "${GREEN}✅ Google AI (Gemini) - Configured${NC}"
else
    echo -e "${YELLOW}⚠️  Google AI (Gemini) - Optional${NC}"
fi

if [[ -n "$OPENAI_API_KEY" ]]; then
    echo -e "${GREEN}✅ OpenAI - Configured${NC}"
else
    echo -e "${YELLOW}⚠️  OpenAI - Optional${NC}"
fi

echo ""
echo -e "${CYAN}💳 Payment Processing:${NC}"
if [[ -n "$DODO_PAYMENTS_API_KEY" ]]; then
    echo -e "${GREEN}✅ Dodo Pay - Configured${NC}"
else
    echo -e "${RED}❌ Dodo Pay - Missing API key${NC}"
fi

echo ""
echo -e "${CYAN}📁 Log Files:${NC}"
if [[ -d "logs" ]]; then
    for log_file in logs/*.log; do
        if [[ -f "$log_file" ]]; then
            local file_size=$(du -h "$log_file" | cut -f1)
            echo -e "${BLUE}   $(basename "$log_file"): ${CYAN}$file_size${NC}"
        fi
    done
else
    echo -e "${YELLOW}   No logs directory found${NC}"
fi

echo ""
echo -e "${CYAN}🌐 Access URLs:${NC}"
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null; then
    echo -e "${GREEN}• Web Platform:  http://localhost:3000${NC}"
else
    echo -e "${RED}• Web Platform:  http://localhost:3000 (offline)${NC}"
fi

if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null; then
    echo -e "${GREEN}• Chat Platform: http://localhost:3001${NC}"
else  
    echo -e "${RED}• Chat Platform: http://localhost:3001 (offline)${NC}"
fi

echo ""
echo -e "${CYAN}🔧 Management Commands:${NC}"
echo -e "• Start all: ${GREEN}./launch.sh${NC}"
echo -e "• Stop all: ${RED}./stop.sh${NC}"
echo -e "• View logs: ${YELLOW}tail -f logs/*.log${NC}"
echo -e "• Check logs: ${YELLOW}ls -la logs/${NC}"

echo ""
# Overall system health
RUNNING_SERVICES=0
TOTAL_SERVICES=2

if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null; then
    ((RUNNING_SERVICES++))
fi

if lsof -Pi :3001 -sTCP:LISTEN -t >/dev/null; then
    ((RUNNING_SERVICES++))
fi

if [[ $RUNNING_SERVICES -eq $TOTAL_SERVICES ]]; then
    echo -e "${GREEN}🎉 System Status: ALL SYSTEMS OPERATIONAL${NC}"
elif [[ $RUNNING_SERVICES -gt 0 ]]; then
    echo -e "${YELLOW}⚠️  System Status: PARTIAL SERVICE ($RUNNING_SERVICES/$TOTAL_SERVICES running)${NC}"
else
    echo -e "${RED}❌ System Status: ALL SERVICES OFFLINE${NC}"
fi