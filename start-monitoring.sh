#!/bin/bash
# Recoder.xyz Monitoring Dashboard Quick Start

echo "🚀 Starting Recoder.xyz Monitoring Dashboard..."

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is required but not installed."
    exit 1
fi

# Start the dashboard data endpoint
echo "📊 Starting dashboard data endpoint..."
node dashboard-data-endpoint.js &
DASHBOARD_PID=$!

# Wait for the endpoint to start
sleep 2

# Open the dashboard in the default browser
echo "🌐 Opening monitoring dashboard..."
if command -v open &> /dev/null; then
    open monitoring-dashboard.html
elif command -v xdg-open &> /dev/null; then
    xdg-open monitoring-dashboard.html
elif command -v start &> /dev/null; then
    start monitoring-dashboard.html
else
    echo "📁 Please manually open: monitoring-dashboard.html"
fi

echo "✅ Monitoring dashboard started successfully!"
echo "📊 Dashboard URL: http://localhost:3005/api/dashboard/data"
echo "🔄 Auto-refresh: Every 5 seconds"
echo ""
echo "Press Ctrl+C to stop monitoring..."

# Wait for user to stop
trap "kill $DASHBOARD_PID; echo 'Monitoring stopped.'; exit 0" INT
wait $DASHBOARD_PID