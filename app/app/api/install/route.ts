import { NextResponse } from 'next/server';

const INSTALL_SCRIPT = `#!/bin/bash
set -e

RED='\\033[0;31m'
GREEN='\\033[0;32m'
YELLOW='\\033[1;33m'
NC='\\033[0m'

echo ""
echo -e "\${GREEN}Installing Recoder Code CLI...\${NC}"
echo ""

if ! command -v node &> /dev/null; then
    echo -e "\${RED}Error: Node.js is required.\${NC}"
    echo "Install: brew install node@20 (macOS) or see https://nodejs.org"
    exit 1
fi

NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 20 ]; then
    echo -e "\${RED}Error: Node.js 20+ required, found v$NODE_VERSION\${NC}"
    exit 1
fi

echo -e "\${GREEN}✓\${NC} Node.js $(node -v)"
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

export async function GET() {
  return new NextResponse(INSTALL_SCRIPT, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
