#!/bin/bash
# Script to save your bolt.new fork to your own GitHub repository

echo "🔧 Save Your Bolt.new Fork to GitHub"
echo "===================================="
echo ""

# Check if git is configured
if ! git config user.name > /dev/null 2>&1; then
    echo "⚠️  Git user not configured. Let's set it up:"
    read -p "Enter your name: " git_name
    git config user.name "$git_name"
fi

if ! git config user.email > /dev/null 2>&1; then
    read -p "Enter your email: " git_email
    git config user.email "$git_email"
fi

echo ""
echo "Current changes:"
git status --short
echo ""

# Ask for commit message
echo "Enter a commit message (or press Enter for default):"
read -p "> " commit_msg
if [ -z "$commit_msg" ]; then
    commit_msg="Fix: Vite 504 errors, TypeScript issues, and Node.js compatibility"
fi

# Stage all changes
echo ""
echo "📦 Staging changes..."
git add -A

# Commit changes
echo "💾 Committing changes..."
git commit -m "$commit_msg"

echo ""
echo "✅ Changes committed locally!"
echo ""
echo "Next steps to push to YOUR GitHub:"
echo ""
echo "Option 1 - Create a new repository on GitHub:"
echo "  1. Go to https://github.com/new"
echo "  2. Create a new repository (e.g., 'bolt-new-fixed')"
echo "  3. DO NOT initialize with README"
echo "  4. Run these commands:"
echo ""
echo "     git remote remove origin"
echo "     git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git"
echo "     git push -u origin main"
echo ""
echo "Option 2 - Fork and push to your fork:"
echo "  1. Fork bolt.new on GitHub to your account"
echo "  2. Run these commands:"
echo ""
echo "     git remote set-url origin https://github.com/YOUR_USERNAME/bolt.new.git"
echo "     git push origin main"
echo ""
echo "Option 3 - Create a backup branch:"
echo "  1. Create a backup branch locally:"
echo ""
echo "     git checkout -b my-fixes"
echo "     git push origin my-fixes  # This will fail but that's ok"
echo ""
echo "Then follow Option 1 or 2 above."
echo ""
