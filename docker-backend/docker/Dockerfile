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
    && npm config set registry https://registry.npmjs.org/ \
    && npm config set fetch-retries 5 \
    && npm config set fetch-retry-mintimeout 20000 \
    && npm config set fetch-retry-maxtimeout 120000 \
    && npm config set fetch-timeout 120000 \
    && npm config set prefer-online true

# Install node-pty and ws for PTY server in /opt/pty
RUN mkdir -p /opt/pty && cd /opt/pty && npm init -y \
    && npm install --no-audit --no-fund node-pty ws

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

# Chromium for browser automation (Puppeteer)
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium-browser \
    libxss1 \
    libnss3 \
    libatk-bridge2.0-0 \
    libgtk-3-0 \
    libgbm1 \
    libasound2 \
    fonts-liberation \
    xdg-utils \
    && rm -rf /var/lib/apt/lists/*

# Puppeteer environment - use system Chromium
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser

# Claude Code CLI - Anthropic's AI coding assistant
# Users can connect their Claude Pro/Max subscription via recoder.xyz settings
# Token is injected as CLAUDE_CODE_OAUTH_TOKEN environment variable
RUN npm install -g @anthropic-ai/claude-code

# Recoder Code CLI - Recoder's AI coding assistant
# Supports 40+ models (Claude, GPT-4, DeepSeek, Gemini, Qwen3)
RUN npm install -g recoder-code

# Global dev tools for LSP diagnostics and development
RUN npm install -g typescript prettier eslint tsx ts-node \
    && npm cache clean --force

# ============================================
# Language Server Protocol (LSP) Servers
# Pre-installed for instant startup with zero download time
# These provide real-time code intelligence, completions, and diagnostics
# ============================================

# TypeScript/JavaScript LSP (tsserver wrapper)
# Provides IntelliSense for TS/JS projects
RUN npm install -g typescript typescript-language-server \
    && npm cache clean --force

# Python LSP (Pyright - faster and more accurate than pylsp)
# Microsoft's static type checker with LSP support
RUN npm install -g pyright \
    && pip3 install --no-cache-dir debugpy

# HTML/CSS/JSON LSP (extracted from VSCode)
# Provides web development language support
RUN npm install -g vscode-langservers-extracted \
    && npm cache clean --force

# Rust Analyzer (official Rust LSP)
# Download latest stable release for x86_64 Linux
RUN curl -L https://github.com/rust-lang/rust-analyzer/releases/latest/download/rust-analyzer-x86_64-unknown-linux-gnu.gz \
    | gunzip -c > /usr/local/bin/rust-analyzer \
    && chmod +x /usr/local/bin/rust-analyzer

# Go LSP (gopls - official Go language server)
# Installed via Go toolchain
ENV PATH="$PATH:/root/go/bin"
RUN go install golang.org/x/tools/gopls@latest

# Vue.js LSP (Volar - official Vue language server)
# Supports Vue 3 SFC with TypeScript
RUN npm install -g @vue/language-server \
    && npm cache clean --force

# Tailwind CSS LSP (IntelliSense for Tailwind)
# Autocomplete and validation for Tailwind utility classes
RUN npm install -g @tailwindcss/language-server \
    && npm cache clean --force

# YAML LSP (YAML Language Server)
# Schema validation and completion for YAML files
RUN npm install -g yaml-language-server \
    && npm cache clean --force

# Dockerfile LSP
# IntelliSense and linting for Dockerfiles
RUN npm install -g dockerfile-language-server-nodejs \
    && npm cache clean --force

# Bash LSP (Bash Language Server)
# IntelliSense for shell scripts
RUN npm install -g bash-language-server \
    && npm cache clean --force

# Java LSP (Eclipse JDT.LS)
# Full-featured Java language server
RUN mkdir -p /opt/jdtls \
    && cd /opt/jdtls \
    && curl -L "https://www.eclipse.org/downloads/download.php?file=/jdtls/milestones/1.31.0/jdt-language-server-1.31.0-202401111522.tar.gz&r=1" \
       -o jdtls.tar.gz \
    && tar -xzf jdtls.tar.gz \
    && rm jdtls.tar.gz \
    && chmod +x /opt/jdtls/bin/jdtls 2>/dev/null || true

# ============================================
# Debug Adapters
# Enable debugging for multiple languages via Debug Adapter Protocol (DAP)
# ============================================

# Python debugger (debugpy - already installed above with pyright)
# Supports VSCode Debug Adapter Protocol
# Usage: python3 -m debugpy --listen 0.0.0.0:5678 --wait-for-client script.py

# Node.js debugging is built-in via --inspect-brk flag
# Usage: node --inspect-brk=0.0.0.0:9229 script.js

# Go debugger (Delve - official Go debugger with DAP support)
# Provides breakpoints, stepping, variable inspection for Go
RUN go install github.com/go-delve/delve/cmd/dlv@latest
ENV PATH="$PATH:/root/go/bin"

# Rust debugger (LLDB with VSCode DAP support)
# Install LLDB and the VSCode debug adapter
RUN apt-get update && apt-get install -y lldb-15 python3-lldb-15 \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/bin/lldb-15 /usr/bin/lldb \
    && ln -sf /usr/bin/lldb-server-15 /usr/bin/lldb-server

# Install lldb-vscode for Rust DAP support (CodeLLDB alternative)
# This provides VSCode-compatible debug adapter for LLDB
RUN mkdir -p /opt/codelldb \
    && cd /opt/codelldb \
    && curl -L "https://github.com/nicknisi/codelldb/releases/download/v1.10.0/codelldb-x86_64-linux.vsix" -o codelldb.vsix \
    && unzip -q codelldb.vsix -d . \
    && rm codelldb.vsix \
    && chmod +x extension/adapter/codelldb 2>/dev/null || true
ENV CODELLDB_PATH=/opt/codelldb/extension/adapter/codelldb

# Ruby debugger (debug gem with DAP support)
RUN gem install debug --no-document

# Java debugger (Java Debug Server - jdtls includes debugging support)
# Already available via Eclipse JDT.LS installed above

# ============================================
# Mobile Development Tools
# Expo and React Native tooling
# ============================================

# Expo CLI for React Native development
# EAS CLI for Expo Application Services (builds, updates)
# @expo/ngrok for tunnel mode (allows QR code scanning from any network)
RUN npm install -g expo-cli eas-cli @expo/ngrok@^4.1.0 \
    && npm cache clean --force

# Pre-cache common Expo native modules for faster project setup
RUN mkdir -p /opt/expo-modules-cache && cd /opt/expo-modules-cache \
    && npm init -y \
    && npm install --prefer-offline --no-audit --no-fund \
       expo-camera expo-location expo-notifications \
       expo-sensors expo-av expo-file-system \
       react-native-maps expo-media-library \
    && npm cache clean --force

# Expo environment variables
ENV EXPO_DEVTOOLS_LISTEN_ADDRESS=0.0.0.0
ENV BROWSER=none
ENV CI=1

# ============================================
# LSP Environment Variables
# Point to installed language servers
# ============================================

ENV RUST_ANALYZER_PATH=/usr/local/bin/rust-analyzer
ENV GOPLS_PATH=/root/go/bin/gopls
ENV JDTLS_PATH=/opt/jdtls

# Debug Adapter Environment Variables
ENV DLV_PATH=/root/go/bin/dlv
ENV DEBUGPY_PATH=/usr/bin/python3
ENV LLDB_VSCODE_PATH=/opt/codelldb/extension/adapter/codelldb

# Additional AI CLI Tools
# - OpenAI Codex: AI coding assistant (requires OPENAI_API_KEY)
# - Google Gemini CLI: Google's AI assistant (requires GEMINI_API_KEY)
# - OpenCode: Multi-provider AI agent (supports multiple providers)
RUN npm install -g @openai/codex @google/gemini-cli opencode-ai

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
       puppeteer \
    && npm cache clean --force

# Pre-install MCP servers for instant startup (no npx download needed)
RUN mkdir -p /opt/mcp-servers && cd /opt/mcp-servers \
    && npm init -y \
    && npm install --prefer-offline --no-audit --no-fund \
       @modelcontextprotocol/server-filesystem \
       @modelcontextprotocol/server-memory \
       @modelcontextprotocol/server-sequential-thinking \
    && npm cache clean --force

# Add MCP servers to PATH for direct execution
ENV PATH="/opt/mcp-servers/node_modules/.bin:$PATH"

# Set npm to use cache
RUN npm config set cache /opt/npm-cache/.npm --global

# ============================================
# Ollama — Local LLM for cheap inference inside sandbox
# Agents use this for docstrings, code comments, quick Q&A
# to save expensive Claude/GPT-4 API calls for complex reasoning.
# Start with: ollama serve & ollama run qwen2.5-coder:3b
# ============================================
RUN curl -fsSL https://ollama.ai/install.sh | sh

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
