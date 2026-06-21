#!/bin/bash
set -e

echo "🚀 Setting up Recoder Docker Backend..."

# Check Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not installed. Please install Docker first."
    exit 1
fi

# Check Docker is running
if ! docker info &> /dev/null; then
    echo "❌ Docker daemon not running. Please start Docker."
    exit 1
fi

echo "✅ Docker is ready"

# Build the universal base image
echo "📦 Building recoder-universal image (this may take a few minutes)..."
cd docker
docker build -t recoder-universal:latest .
cd ..

echo "✅ Base image built"

# Install npm dependencies
echo "📦 Installing npm dependencies..."
npm install

# Copy env file
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file"
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "To start the server:"
echo "  npm run dev     # Development mode"
echo "  npm start       # Production mode"
echo ""
echo "Server will run on http://localhost:3100"
echo ""
echo "To use in your frontend, add to .env:"
echo "  VITE_DOCKER_BACKEND_URL=http://localhost:3100"
