#!/bin/bash

echo "🧹 Cleaning up old processes..."

# Kill all background processes
pkill -f "tsx watch" 2>/dev/null
pkill -f "npm run dev" 2>/dev/null
pkill -f "next dev" 2>/dev/null
pkill -f "node.*dev" 2>/dev/null

# Wait for processes to die
sleep 3

# Find and kill anything on port 3001
lsof -ti:3001 | xargs kill -9 2>/dev/null

# Find and kill anything on port 3000
lsof -ti:3000 | xargs kill -9 2>/dev/null

sleep 2

echo "✅ All processes killed"
echo ""
echo "🚀 Starting backend on port 3001..."
cd /Users/arhansubasi/recoder.xyz/backend
PORT=3001 npm run dev > ../logs/backend.log 2>&1 &
BACKEND_PID=$!

sleep 5

echo "✅ Backend started (PID: $BACKEND_PID)"
echo ""
echo "🚀 Starting app on port 3000..."
cd /Users/arhansubasi/recoder.xyz/app
PORT=3000 npm run dev > ../logs/app.log 2>&1 &
APP_PID=$!

sleep 3

echo "✅ App started (PID: $APP_PID)"
echo ""
echo "📊 Services Status:"
echo "  Backend: http://localhost:3001 (PID: $BACKEND_PID)"
echo "  App:     http://localhost:3000 (PID: $APP_PID)"
echo ""
echo "📝 Logs:"
echo "  Backend: tail -f logs/backend.log"
echo "  App:     tail -f logs/app.log"
echo ""
echo "🛑 To stop all services:"
echo "  kill $BACKEND_PID $APP_PID"
