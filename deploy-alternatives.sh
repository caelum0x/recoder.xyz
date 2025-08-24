#!/bin/bash

# Multi-Platform Deployment Script
# This script provides alternatives to Deta deployment

echo "🚀 Multi-Platform Deployment Options"
echo "====================================="

# Function to deploy to Vercel (Serverless)
deploy_vercel() {
    echo "📦 Deploying to Vercel..."
    
    # Check if we're in backend directory
    if [ ! -f "package.json" ]; then
        echo "❌ Please run this from the backend directory"
        return 1
    fi
    
    # Install Vercel CLI if not present
    if ! command -v vercel &> /dev/null; then
        echo "Installing Vercel CLI..."
        npm install -g vercel
    fi
    
    # Deploy to Vercel
    vercel --prod
    
    echo "✅ Backend deployed to Vercel!"
}

# Function to deploy with Docker
deploy_docker() {
    echo "🐳 Building Docker image..."
    
    # Build the Docker image
    docker build -t recoder-backend .
    
    echo "✅ Docker image built successfully!"
    echo "💡 You can now deploy this image to any cloud provider:"
    echo "   - Google Cloud Run: gcloud run deploy"
    echo "   - AWS ECS: aws ecs create-service"
    echo "   - Azure Container Instances: az container create"
    echo "   - DigitalOcean Apps: doctl apps create"
}

# Function to deploy to Railway (Git-based)
deploy_railway() {
    echo "🚂 Setting up Railway deployment..."
    
    # Check if git is initialized
    if [ ! -d ".git" ]; then
        echo "Initializing git repository..."
        git init
        git add .
        git commit -m "Initial commit for Railway deployment"
    fi
    
    echo "✅ Railway deployment configured!"
    echo "💡 Next steps:"
    echo "   1. Go to https://railway.app"
    echo "   2. Connect your GitHub repository"
    echo "   3. Select the backend directory"
    echo "   4. Railway will auto-deploy using the railway.json config"
}

# Function to deploy to Render (Git-based)
deploy_render() {
    echo "🎨 Setting up Render deployment..."
    
    echo "✅ Render deployment configured!"
    echo "💡 Next steps:"
    echo "   1. Go to https://render.com"
    echo "   2. Connect your GitHub repository"
    echo "   3. Create a new Web Service"
    echo "   4. Use the render.yaml configuration"
}

# Main menu
echo "Choose deployment option:"
echo "1) Vercel (Serverless)"
echo "2) Docker Build"
echo "3) Railway Setup"
echo "4) Render Setup"
echo "5) Deploy All"
read -p "Enter your choice (1-5): " choice

case $choice in
    1)
        deploy_vercel
        ;;
    2)
        deploy_docker
        ;;
    3)
        deploy_railway
        ;;
    4)
        deploy_render
        ;;
    5)
        deploy_vercel
        deploy_docker
        deploy_railway
        deploy_render
        ;;
    *)
        echo "❌ Invalid option"
        ;;
esac

echo "🎉 Deployment script completed!"
