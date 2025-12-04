import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

const INSTALL_SCRIPT = `#!/bin/bash
set -e

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

echo ""
echo -e "\${GREEN}Installing Recoder Code CLI...\${NC}"
echo ""

# Check Node.js
if ! command -v node &> /dev/null; then
    echo -e "\${RED}Error: Node.js is required but not installed.\${NC}"
    echo ""
    echo "Install Node.js 20+:"
    echo "  macOS:  brew install node@20"
    echo "  Linux:  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    echo ""
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "\${RED}Error: Node.js 20+ required, found v$NODE_VERSION\${NC}"
    exit 1
fi

echo -e "\${GREEN}✓\${NC} Node.js $(node -v)"

# Install via npm
echo ""
echo "Installing recoder-code-cli..."
npm install -g recoder-code-cli

echo ""
echo -e "\${GREEN}✓ Installation complete!\${NC}"
echo ""
echo "Get started:"
echo "  recoder              # Start interactive mode"
echo "  recoder init         # Initialize project"
echo "  recoder --help       # Show commands"
echo ""
`;

export async function loader({ request }: LoaderFunctionArgs) {
  return new Response(INSTALL_SCRIPT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
