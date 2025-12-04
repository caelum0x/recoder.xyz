# Recoder Web IDE - Development Guide

## Setup

### Prerequisites
- Node.js 20+
- pnpm 8+

### Installation
```bash
git clone https://github.com/recoder-team/recoder-web
cd recoder-web
pnpm install
```

### Environment
```bash
cp .env.example .env.local
```

Required variables:
```env
OPENROUTER_API_KEY=...
ANTHROPIC_API_KEY=...
DATABASE_URL=...
```

### Development Server
```bash
pnpm dev
```
Open http://localhost:5173

---

## Project Structure

```
recoder-web/
├── app/
│   ├── components/     # React components
│   │   ├── chat/       # Chat interface
│   │   ├── editor/     # Code editor
│   │   ├── workbench/  # Main IDE layout
│   │   └── ui/         # Shared UI components
│   ├── hooks/          # React hooks
│   ├── lib/            # Utilities & services
│   │   ├── stores/     # Nanostores state
│   │   └── runtime/    # WebContainer runtime
│   ├── routes/         # Remix routes
│   ├── styles/         # CSS files
│   └── types/          # TypeScript types
├── mcp/                # MCP server integration
├── starters/           # Project templates
├── tests/              # Test files
├── e2e/                # Playwright E2E tests
└── scripts/            # Build & utility scripts
```

---

## Key Technologies

- **Remix** - React framework
- **WebContainer** - In-browser Node.js
- **CodeMirror** - Code editor
- **xterm.js** - Terminal emulator
- **Nanostores** - State management
- **UnoCSS** - Styling
- **AI SDK** - AI integration

---

## Testing

### Unit Tests
```bash
pnpm test
```

### E2E Tests
```bash
pnpm test:e2e
```

### Specific Test
```bash
pnpm test -- --grep "chat"
```

---

## Building

### Production Build
```bash
pnpm build
```

### Preview Build
```bash
pnpm preview
```

---

## Deployment

### Cloudflare Pages
```bash
pnpm deploy
```

### Vercel
```bash
vercel
```

---

## Contributing

1. Fork the repository
2. Create feature branch
3. Make changes
4. Run tests
5. Submit PR

### Code Style
- TypeScript strict mode
- ESLint + Prettier
- Conventional commits
