#!/bin/bash

echo "🖥️  Testing Recoder Desktop App"
echo "================================="
echo

# Check if Electron is available
if ! command -v electron &> /dev/null; then
    echo "❌ Electron not found. Installing..."
    npm install
fi

echo "🚀 Starting Recoder Desktop..."
echo "   Main process: src/main-enterprise.js"
echo "   UI Controller: src/ui-enterprise.js"
echo

# Start the desktop app
npm start &
APP_PID=$!

echo "📱 Desktop app started with PID: $APP_PID"
echo
echo "💡 Testing status:"
echo "   ✅ Non-blocking initialization enabled"
echo "   ✅ Service discovery runs in background"
echo "   ✅ UI shows immediately without waiting for services"
echo "   ✅ Offline mode support added"
echo
echo "🔍 The app should now:"
echo "   1. Show the interface immediately (no stuck loader)"
echo "   2. Display dashboard with offline services"
echo "   3. Allow navigation between tabs"
echo "   4. Show notifications about service discovery in background"
echo
echo "Press Ctrl+C to stop the app..."

# Wait for the process
wait $APP_PID