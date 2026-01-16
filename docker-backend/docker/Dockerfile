# Recoder Universal Dev Container
# Multi-language support with real PTY terminal

FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/root/.local/bin:/root/.cargo/bin:/root/.bun/bin:$PATH"

# Base tools + build deps for node-pty, esbuild, and dev utilities
RUN apt-get update && apt-get install -y \
    curl wget git bash build-essential unzip \
    software-properties-common ca-certificates \
    python3 make g++ pkg-config \
    # Search and text processing
    ripgrep \
    jq \
    # Process management
    procps \
    # Compression (tar, gzip, gunzip built-in, adding extras)
    gzip \
    zip \
    # Network utilities
    net-tools \
    iputils-ping \
    dnsutils \
    # Development helpers
    htop \
    vim nano \
    lsof \
    less \
    tree \
    file \
    # SQLite for better-sqlite3 npm package
    libsqlite3-dev \
    sqlite3 \
    # OpenSSL for crypto operations
    openssl libssl-dev \
    # Locales for proper encoding
    locales \
    && rm -rf /var/lib/apt/lists/* \
    && locale-gen en_US.UTF-8

ENV LANG=en_US.UTF-8
ENV LC_ALL=en_US.UTF-8

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

# Claude Code CLI - Anthropic's AI coding assistant
# Users can connect their Claude Pro/Max subscription via recoder.xyz settings
# Token is injected as CLAUDE_CODE_OAUTH_TOKEN environment variable
RUN npm install -g @anthropic-ai/claude-code

# Recoder Code CLI - Recoder's AI coding assistant
# Supports 40+ models (Claude, GPT-4, DeepSeek, Gemini, Qwen3)
RUN npm install -g recoder-code

# Global dev tools for LSP diagnostics and development
RUN npm install -g typescript pyright prettier eslint tsx ts-node

# Pre-cache common npm packages to speed up installs
RUN mkdir -p /opt/npm-cache && cd /opt/npm-cache \
    && npm init -y \
    && npm install --prefer-offline --no-audit --no-fund \
       react react-dom \
       vite @vitejs/plugin-react \
       typescript @types/react @types/react-dom @types/node \
       tailwindcss postcss autoprefixer \
       express cors \
       drizzle-orm better-sqlite3 \
    && npm cache clean --force

# Set npm to use cache
RUN npm config set cache /opt/npm-cache/.npm --global

# PTY Server
COPY pty-server.js /opt/pty/pty-server.js

# Entrypoint for smart dependency installation
COPY entrypoint.sh /opt/entrypoint.sh
RUN chmod +x /opt/entrypoint.sh

# Workspace
RUN mkdir -p /workspace && chmod 777 /workspace
WORKDIR /workspace

# Start PTY server
ENTRYPOINT ["/opt/entrypoint.sh"]
CMD ["node", "/opt/pty/pty-server.js"]
