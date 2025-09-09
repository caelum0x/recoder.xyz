#!/bin/bash

# Multi-language Code Generator - Docker Build Script
# Builds all language containers for the code execution platform

set -e

echo "🚀 Building Multi-language Code Generator Containers..."
echo "================================================="

cd "$(dirname "$0")/docker/code-generator"

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker Desktop."
    exit 1
fi

echo "📦 Building language containers..."

# Build all containers using docker-compose
docker-compose build --no-cache

echo ""
echo "✅ All containers built successfully!"
echo ""
echo "🐳 Available containers:"
echo "  - recoder-javascript (Node.js, Deno, Bun)"
echo "  - recoder-python (CPython, pip)"
echo "  - recoder-java (OpenJDK, Maven)"
echo "  - recoder-cpp (GCC, Clang, vcpkg)"
echo "  - recoder-rust (rustc, cargo)"
echo "  - recoder-go (Go compiler, modules)"
echo ""
echo "🚀 Start containers with: docker-compose up -d"
echo "🔍 View containers: docker ps"
echo "📊 Test API: curl -X POST http://localhost:3003/api/code-generator/execute"
echo ""
echo "================================================="
echo "✅ Multi-language Code Generator Ready!"
