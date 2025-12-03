# MCP Integration - Quick Reference

## 🚀 Quick Start

### Install Your First Server

```bash
# 1. Start the app
npm run dev

# 2. Navigate to MCP settings
open http://localhost:3000/settings/mcp

# 3. Click "Quick Setup" and choose a template
```

## 📦 Available Servers

### Reference Servers (6)
- **Memory** - Persistent knowledge graph
- **Fetch** - Web content retrieval
- **Filesystem** - File operations
- **Git** - Repository management
- **Sequential Thinking** - Problem solving
- **Time** - Timezone utilities

### Custom Servers (2)
- **GitHub Integration** - Repo management
- **Recoder Workspace** - Project access

## 🎯 Quick Setups

### Essential (2 servers)
```bash
memory + filesystem
```

### Developer (3 servers)
```bash
git + filesystem + github
```

### Research (3 servers)
```bash
fetch + memory + sequential-thinking
```

## 🔧 API Usage

### Install a Server
```typescript
await fetch('/api/mcp/servers/install', {
  method: 'POST',
  body: JSON.stringify({ serverId: 'memory' })
});
```

### Call a Tool
```typescript
await fetch('/api/mcp/tools/call', {
  method: 'POST',
  body: JSON.stringify({
    serverId: 'memory',
    toolName: 'store',
    args: { key: 'test', value: 'data' }
  })
});
```

### Check Health
```typescript
const res = await fetch('/api/mcp/health');
const { healthy, servers } = await res.json();
```

## 🎨 UI Components

### Status Dashboard
```tsx
import { ServerStatusDashboard } from '@/components/mcp/ServerStatusDashboard';

<ServerStatusDashboard />
```

### Quick Install Modal
```tsx
import { QuickInstallModal } from '@/components/mcp/QuickInstallModal';

<QuickInstallModal 
  onClose={() => setShow(false)}
  onInstall={batchInstall}
/>
```

## 🪝 React Hooks

### Use MCP Tools
```tsx
import { useMCPTools } from '@/hooks/useMCPTools';

const { tools, loading, callTool } = useMCPTools();

// Call a tool
const result = await callTool('memory', 'store', { key: 'x', value: 'y' });
```

## 📊 Features

- ✅ 8 servers available
- ✅ Quick setup templates
- ✅ Real-time health monitoring
- ✅ Usage analytics
- ✅ Auto-updates
- ✅ Logs viewer
- ✅ Configuration UI
- ✅ Marketplace

## 📁 File Structure

```
lib/mcp/
├── registry.ts       # Server definitions
├── client.ts         # MCP client
├── templates.ts      # Quick setups
├── versioning.ts     # Version management
└── auto-update.ts    # Auto-updates

components/mcp/
├── ServerStatusDashboard.tsx
└── QuickInstallModal.tsx

hooks/
└── useMCPTools.ts

app/api/mcp/
├── health/
├── servers/
├── tools/
├── analytics/
├── templates/
└── updates/
```

## 🔗 Links

- [Full Documentation](./MCP_COMPLETE_IMPLEMENTATION.md)
- [Development Guide](./MCP_DEVELOPMENT_GUIDE.md)
- [MCP Official Docs](https://modelcontextprotocol.io)
