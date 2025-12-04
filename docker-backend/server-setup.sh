#!/bin/bash
set -e

echo "🔧 Setting up Recoder Docker Backend Server"

# Update system
apt-get update && apt-get upgrade -y

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
systemctl start docker

# Install Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Create deployment directory
mkdir -p /opt/recoder-backend/ssl

# Install certbot for SSL
apt-get install -y certbot

# Pull the universal container image
docker pull ubuntu:22.04

# Build the recoder-universal image
cat > /tmp/Dockerfile.universal << 'EOF'
FROM ubuntu:22.04
ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/root/.local/bin:/root/.cargo/bin:/root/.bun/bin:$PATH"

RUN apt-get update && apt-get install -y \
    curl wget git bash build-essential unzip \
    software-properties-common ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm yarn

# Python 3.11
RUN add-apt-repository ppa:deadsnakes/ppa -y \
    && apt-get update \
    && apt-get install -y python3.11 python3.11-venv python3-pip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python

# Bun
RUN curl -fsSL https://bun.sh/install | bash

WORKDIR /workspace
CMD ["/bin/bash"]
EOF

docker build -t recoder-universal:latest -f /tmp/Dockerfile.universal /tmp

echo "✅ Server setup complete!"
echo ""
echo "Next steps:"
echo "1. Get SSL certificate: certbot certonly --standalone -d docker.recoder.xyz"
echo "2. Copy certs to /opt/recoder-backend/ssl/"
echo "3. Run deploy.sh from your local machine"
