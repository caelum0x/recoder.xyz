# Recoder Universal Dev Container
# Multi-language support with real PTY terminal

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/root/.local/bin:/root/.cargo/bin:/root/.bun/bin:$PATH"

# Base tools + build deps for node-pty and esbuild
RUN apt-get update && apt-get install -y \
    curl wget git bash build-essential unzip \
    software-properties-common ca-certificates \
    python3 make g++ pkg-config \
    && rm -rf /var/lib/apt/lists/*

# Node.js 20
RUN curl -fsSL https://deb.nodesource.com/setup_20.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g pnpm yarn \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000

# Install node-pty and ws for PTY server in /opt/pty
RUN mkdir -p /opt/pty && cd /opt/pty && npm init -y && npm install node-pty ws

# Python 3.11
RUN add-apt-repository ppa:deadsnakes/ppa -y \
    && apt-get update \
    && apt-get install -y python3.11 python3.11-venv python3-pip \
    && ln -sf /usr/bin/python3.11 /usr/bin/python \
    && ln -sf /usr/bin/python3.11 /usr/bin/python3

# Rust
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y

# Go
RUN wget https://go.dev/dl/go1.21.5.linux-amd64.tar.gz \
    && tar -C /usr/local -xzf go1.21.5.linux-amd64.tar.gz \
    && rm go1.21.5.linux-amd64.tar.gz
ENV PATH="$PATH:/usr/local/go/bin"

# Bun
RUN curl -fsSL https://bun.sh/install | bash

# Java (OpenJDK 17)
RUN apt-get update && apt-get install -y openjdk-17-jdk \
    && rm -rf /var/lib/apt/lists/*

# Ruby
RUN apt-get update && apt-get install -y ruby-full \
    && rm -rf /var/lib/apt/lists/*

# PHP
RUN apt-get update && apt-get install -y php php-cli php-mbstring \
    && rm -rf /var/lib/apt/lists/*

# PTY Server
COPY pty-server.js /opt/pty/pty-server.js

# Workspace
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Start PTY server
CMD ["node", "/opt/pty/pty-server.js"]
