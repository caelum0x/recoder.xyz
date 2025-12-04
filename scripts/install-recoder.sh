#!/bin/bash
# Recoder Code CLI Installer
# Usage: curl -fsSL https://recoder.xyz/install.sh | bash

set -e

REPO="recoder-team/recoder"
INSTALL_DIR="${RECODER_INSTALL_DIR:-$HOME/.recoder}"
BIN_DIR="${RECODER_BIN_DIR:-$HOME/.local/bin}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

print_banner() {
    echo -e "${BLUE}"
    echo "██████╗ ███████╗ ██████╗ ██████╗ ██████╗ ███████╗██████╗ "
    echo "██╔══██╗██╔════╝██╔════╝██╔═══██╗██╔══██╗██╔════╝██╔══██╗"
    echo "██████╔╝█████╗  ██║     ██║   ██║██║  ██║█████╗  ██████╔╝"
    echo "██╔══██╗██╔══╝  ██║     ██║   ██║██║  ██║██╔══╝  ██╔══██╗"
    echo "██║  ██║███████╗╚██████╗╚██████╔╝██████╔╝███████╗██║  ██║"
    echo "╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝╚═╝  ╚═╝"
    echo -e "${NC}"
    echo "AI-Powered Coding Assistant CLI"
    echo ""
}

detect_os() {
    case "$(uname -s)" in
        Linux*)     OS=linux;;
        Darwin*)    OS=darwin;;
        MINGW*|MSYS*|CYGWIN*) OS=windows;;
        *)          OS=unknown;;
    esac
    
    case "$(uname -m)" in
        x86_64|amd64) ARCH=x64;;
        arm64|aarch64) ARCH=arm64;;
        *)            ARCH=unknown;;
    esac
    
    echo -e "${GREEN}Detected:${NC} $OS ($ARCH)"
}

check_dependencies() {
    echo -e "${YELLOW}Checking dependencies...${NC}"
    
    # Check Node.js
    if command -v node &> /dev/null; then
        NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [ "$NODE_VERSION" -ge 20 ]; then
            echo -e "  ${GREEN}✓${NC} Node.js $(node -v)"
        else
            echo -e "  ${RED}✗${NC} Node.js $(node -v) - requires v20+"
            NEED_NODE=true
        fi
    else
        echo -e "  ${RED}✗${NC} Node.js not found"
        NEED_NODE=true
    fi
    
    # Check npm
    if command -v npm &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} npm $(npm -v)"
    fi
    
    # Check git
    if command -v git &> /dev/null; then
        echo -e "  ${GREEN}✓${NC} git $(git --version | cut -d' ' -f3)"
    else
        echo -e "  ${YELLOW}!${NC} git not found (optional)"
    fi
}

install_node_if_needed() {
    if [ "$NEED_NODE" = true ]; then
        echo ""
        echo -e "${YELLOW}Node.js 20+ is required. Install options:${NC}"
        echo ""
        
        if [ "$OS" = "darwin" ]; then
            echo "  brew install node@20"
            echo "  # or"
            echo "  curl -fsSL https://fnm.vercel.app/install | bash && fnm install 20"
        elif [ "$OS" = "linux" ]; then
            echo "  curl -fsSL https://fnm.vercel.app/install | bash && fnm install 20"
            echo "  # or"
            echo "  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -"
            echo "  sudo apt-get install -y nodejs"
        fi
        echo ""
        read -p "Install Node.js automatically? (y/n) " -n 1 -r
        echo
        if [[ $REPLY =~ ^[Yy]$ ]]; then
            install_node
        else
            echo -e "${RED}Please install Node.js 20+ and run this script again.${NC}"
            exit 1
        fi
    fi
}

install_node() {
    echo -e "${YELLOW}Installing Node.js via fnm...${NC}"
    curl -fsSL https://fnm.vercel.app/install | bash
    export PATH="$HOME/.local/share/fnm:$PATH"
    eval "$(fnm env)"
    fnm install 20
    fnm use 20
    echo -e "${GREEN}✓${NC} Node.js installed"
}

install_recoder() {
    echo ""
    echo -e "${YELLOW}Installing recoder-code...${NC}"
    
    # Create directories
    mkdir -p "$INSTALL_DIR"
    mkdir -p "$BIN_DIR"
    
    # Install via npm globally
    npm install -g recoder-code-cli
    
    echo -e "${GREEN}✓${NC} recoder-code installed"
}

setup_path() {
    # Add to PATH if not already there
    if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
        SHELL_RC=""
        if [ -f "$HOME/.zshrc" ]; then
            SHELL_RC="$HOME/.zshrc"
        elif [ -f "$HOME/.bashrc" ]; then
            SHELL_RC="$HOME/.bashrc"
        fi
        
        if [ -n "$SHELL_RC" ]; then
            echo "" >> "$SHELL_RC"
            echo "# Recoder Code CLI" >> "$SHELL_RC"
            echo "export PATH=\"\$PATH:$BIN_DIR\"" >> "$SHELL_RC"
            echo -e "${GREEN}✓${NC} Added to PATH in $SHELL_RC"
        fi
    fi
}

verify_installation() {
    echo ""
    echo -e "${YELLOW}Verifying installation...${NC}"
    
    if command -v recoder &> /dev/null; then
        echo -e "${GREEN}✓${NC} recoder command available"
        recoder --version
    elif command -v recoder-code &> /dev/null; then
        echo -e "${GREEN}✓${NC} recoder-code command available"
        recoder-code --version
    else
        echo -e "${RED}✗${NC} Installation verification failed"
        echo "  Try running: npm install -g recoder-code-cli"
        exit 1
    fi
}

print_success() {
    echo ""
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo -e "${GREEN}  Installation complete!${NC}"
    echo -e "${GREEN}════════════════════════════════════════════════════════════${NC}"
    echo ""
    echo "  Get started:"
    echo "    recoder                    # Start interactive mode"
    echo "    recoder init               # Initialize .recoder folder"
    echo "    recoder plan create \"App\" # Create a project plan"
    echo "    recoder --help             # Show all commands"
    echo ""
    echo "  Documentation: https://recoder.xyz/docs"
    echo ""
}

# Main
print_banner
detect_os
check_dependencies
install_node_if_needed
install_recoder
setup_path
verify_installation
print_success
