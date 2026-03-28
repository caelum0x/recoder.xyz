#!/bin/bash
# Fix LLM Model — Run this on the Hetzner server via SSH
# ssh -i ~/.ssh/id_ed25519_hetzner root@77.42.23.19
#
# This script installs Ollama and configures the backend to use a local model.
# Ollama is FREE, runs locally, no API keys needed.

set -e

echo "=== Recoder LLM Fix ==="
echo ""

# Option 1: Install Ollama (recommended — free, fast, local)
echo "Installing Ollama..."
if ! command -v ollama &>/dev/null; then
  curl -fsSL https://ollama.com/install.sh | sh
  echo "Ollama installed."
else
  echo "Ollama already installed."
fi

# Start Ollama service
systemctl enable ollama 2>/dev/null || true
systemctl start ollama 2>/dev/null || true

# Pull a good model for tool calling (qwen2.5-coder:7b = ~5GB RAM, supports function calling)
echo "Pulling qwen2.5-coder:7b model (this takes a few minutes on first run)..."
ollama pull qwen2.5-coder:7b

echo ""
echo "Ollama is running at http://localhost:11434"
echo ""

# Update backend .env to use Ollama
BACKEND_ENV="/root/recoder.xyz/backend/.env"
echo "Updating $BACKEND_ENV..."

# Remove old MAIN_LLM settings if they exist
sed -i '/^MAIN_LLM=/d' "$BACKEND_ENV"
sed -i '/^MAIN_LLM_MODEL=/d' "$BACKEND_ENV"

# Add Ollama config
cat >> "$BACKEND_ENV" << 'EOF'

# LLM Model — Ollama (local, free)
MAIN_LLM=openrouter
MAIN_LLM_MODEL=ollama_chat/qwen2.5-coder:7b
OLLAMA_API_BASE=http://localhost:11434
EOF

echo "Backend .env updated."
echo ""

# Restart backend
echo "Restarting backend..."
cd /root/recoder.xyz
pm2 restart recoder-backend

echo ""
echo "=== Done ==="
echo "The backend now uses Ollama qwen2.5-coder:7b (local, free, supports tool calling)."
echo ""
echo "To test: curl https://api.recoder.xyz/v1/health"
echo ""
echo "Alternative: If you want to use a free OpenRouter model instead:"
echo "  Edit /root/recoder.xyz/backend/.env and set:"
echo "  MAIN_LLM=openrouter"
echo "  MAIN_LLM_MODEL=openrouter/google/gemini-2.0-flash-exp:free"
echo "  Then: pm2 restart recoder-backend"
