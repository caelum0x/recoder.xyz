#!/bin/bash

echo "======================================"
echo "🔍 Authentication System Test"
echo "======================================"
echo ""

# Check if server is running
echo "1️⃣  Checking if dev server is running..."
if lsof -Pi :3000 -sTCP:LISTEN -t >/dev/null ; then
    echo "   ✅ Server is running on port 3000"
else
    echo "   ❌ Server is NOT running!"
    echo "   Run: npm run dev"
    exit 1
fi

echo ""
echo "2️⃣  Checking environment configuration..."

# Check .env file
if [ -f .env ]; then
    echo "   ✅ .env file exists"
    
    # Check for email config
    if grep -q "RESEND_API_KEY" .env && grep -v "^#" .env | grep -q "RESEND_API_KEY"; then
        echo "   ✅ Resend configured"
    elif grep -q "SMTP_USER" .env && grep -v "^#" .env | grep -q "SMTP_USER"; then
        echo "   ✅ SMTP configured"
    else
        echo "   ⚠️  No email service configured (using console logs)"
    fi
else
    echo "   ❌ .env file not found!"
fi

echo ""
echo "3️⃣  Checking database connection..."
DATABASE_URL=$(grep "^DATABASE_URL" .env | cut -d '=' -f2-)
if [ -n "$DATABASE_URL" ]; then
    echo "   ✅ DATABASE_URL configured"
else
    echo "   ❌ DATABASE_URL not set!"
fi

echo ""
echo "4️⃣  Test URLs:"
echo "   📝 Signup:           http://localhost:3000/auth/signup"
echo "   🔐 Sign In:          http://localhost:3000/auth/signin"
echo "   🔑 Forgot Password:  http://localhost:3000/auth/forgot-password"
echo "   ⚙️  Settings:         http://localhost:3000/settings/security"
echo "   📊 Dashboard:        http://localhost:3000/dashboard"

echo ""
echo "5️⃣  Quick Tests:"
echo ""
echo "   Test A: Email Signup with Temporary Password"
echo "   ─────────────────────────────────────────────"
echo "   1. Go to: http://localhost:3000/auth/signup"
echo "   2. Check ✅ 'Send me a temporary password via email'"
echo "   3. Enter name and email"
echo "   4. Click 'Create Account'"
echo "   5. Check terminal for temporary password"
echo "   6. Sign in with that password"
echo ""
echo "   Test B: Forgot Password"
echo "   ───────────────────────"
echo "   1. Go to: http://localhost:3000/auth/forgot-password"
echo "   2. Enter your email"
echo "   3. Check terminal for reset URL"
echo "   4. Copy URL to browser"
echo "   5. Set new password"
echo ""
echo "   Test C: Session Persistence"
echo "   ────────────────────────────"
echo "   1. Sign in"
echo "   2. Close browser completely"
echo "   3. Reopen and visit dashboard"
echo "   4. Should still be logged in"
echo ""

echo "======================================"
echo "📧 Email Logs:"
echo "======================================"
echo "Watch terminal output for emails like:"
echo ""
echo "📧 ==================== EMAIL ===================="
echo "To: user@example.com"
echo "Subject: Your Temporary Password - Recoder.xyz"
echo "TEMPORARY PASSWORD: abc123def456"
echo "================================================"
echo ""

echo "✅ Ready to test!"
echo ""
echo "💡 Tip: Keep this terminal open to see email logs"
echo "💡 Tip: Open http://localhost:3000 in your browser"
echo ""
