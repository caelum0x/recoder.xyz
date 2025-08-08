#!/bin/bash

# 🛑 RECODER.XYZ - STOP SCRIPT
# Gracefully stops all running platforms

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}🛑 STOPPING RECODER.XYZ PLATFORMS${NC}"
echo "=================================="

# Function to stop a platform
stop_platform() {
    local name=$1
    local pid_file="logs/$name.pid"
    
    if [[ -f "$pid_file" ]]; then
        local pid=$(cat "$pid_file")
        if kill -0 $pid 2>/dev/null; then
            echo -e "${YELLOW}Stopping $name (PID: $pid)...${NC}"
            kill $pid
            sleep 2
            
            # Force kill if still running
            if kill -0 $pid 2>/dev/null; then
                echo -e "${RED}Force stopping $name...${NC}"
                kill -9 $pid
            fi
            
            echo -e "${GREEN}✅ $name stopped${NC}"
        else
            echo -e "${YELLOW}⚠️  $name was not running${NC}"
        fi
        rm -f "$pid_file"
    else
        echo -e "${YELLOW}⚠️  No PID file found for $name${NC}"
    fi
}

# Stop all platforms
stop_platform "Web Platform"
stop_platform "Chat Platform"

# Kill any remaining node processes on our ports
echo -e "${BLUE}🔍 Checking for remaining processes...${NC}"

PORTS=(3000 3001 8000 8001)
for port in "${PORTS[@]}"; do
    PID=$(lsof -ti:$port 2>/dev/null)
    if [[ -n "$PID" ]]; then
        echo -e "${YELLOW}Stopping process on port $port (PID: $PID)${NC}"
        kill $PID 2>/dev/null || kill -9 $PID 2>/dev/null
    fi
done

echo ""
echo -e "${GREEN}✅ All Recoder.xyz platforms stopped${NC}"
echo -e "${CYAN}To restart: ./launch.sh${NC}"