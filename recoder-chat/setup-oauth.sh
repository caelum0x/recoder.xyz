#!/bin/bash

# OAuth Setup Script for Recoder Chat
# This script helps you set up real OAuth credentials

echo "🔐 Setting up OAuth for Recoder Chat"
echo "=================================="
echo ""

echo "📋 You need to create OAuth applications:"
echo ""
echo "1. GOOGLE OAUTH:"
echo "   → Go to: https://console.cloud.google.com/"
echo "   → Create new project: 'Recoder Chat'"
echo "   → Enable Google+ API"
echo "   → Credentials → Create OAuth 2.0 Client"
echo "   → Web application"
echo "   → Authorized origins: https://recoder-chat.vercel.app"
echo "   → Authorized redirects: https://recoder-chat.vercel.app/api/auth/callback/google"
echo ""

echo "2. GITHUB OAUTH:"
echo "   → Go to: https://github.com/settings/developers"
echo "   → New OAuth App"
echo "   → Name: Recoder Chat"
echo "   → Homepage: https://recoder-chat.vercel.app"
echo "   → Callback: https://recoder-chat.vercel.app/api/auth/callback/github"
echo ""

echo "3. UPDATE ENVIRONMENT VARIABLES:"
echo "   Edit vercel.json and replace:"
echo "   - GOOGLE_CLIENT_ID with your real Google Client ID"
echo "   - GOOGLE_CLIENT_SECRET with your real Google Client Secret"
echo "   - GITHUB_ID with your real GitHub Client ID"  
echo "   - GITHUB_SECRET with your real GitHub Client Secret"
echo ""

echo "4. DEPLOY:"
echo "   → npx vercel --prod"
echo ""

echo "🚨 Current OAuth credentials are fake/invalid!"
echo "   OAuth sign-in will fail until you set up real credentials."
echo ""
echo "📧 For now, you can still use email/password authentication."
