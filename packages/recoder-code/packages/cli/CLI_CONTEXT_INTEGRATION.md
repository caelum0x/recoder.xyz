# CLI Context Command Integration

## Files Created

The context command files are ready:
- `src/commands/context/index.ts` - Main command
- `src/commands/context/init.ts` - Init subcommand
- `src/commands/context/edit.ts` - Edit subcommand
- `src/lib/recoder-context.ts` - Context loader

## Integration Steps

### Option 1: Add to gemini.tsx (if using Commander.js)

If your CLI uses Commander.js, add this to `src/gemini.tsx`:

```typescript
import { createContextCommand } from './commands/context/index.js';

// In your program setup:
program.addCommand(createContextCommand());
```

### Option 2: Add as Standalone Command

If using a different CLI framework, register the command in your main entry point:

```typescript
// In main CLI file
import { createContextCommand } from './commands/context/index.js';

// Register command
cli.register(createContextCommand());
```

### Option 3: Manual Registration

Add to your command registry:

```typescript
const commands = {
  // ... existing commands
  context: {
    description: 'Manage .recoder/ project context',
    subcommands: {
      init: () => import('./commands/context/init.js'),
      edit: () => import('./commands/context/edit.js'),
    },
  },
};
```

## Testing

After integration, test the commands:

```bash
# Build CLI
npm run build

# Test commands
recoder context init
recoder context edit
recoder context edit --list
```

## Usage Examples

```bash
# Initialize .recoder/ directory
recoder context init

# Initialize with template
recoder context init --template nextjs

# Edit context file
recoder context edit

# Edit specific file
recoder context edit spec.md

# List available files
recoder context edit --list
```

## Integration with AI Commands

To use .recoder/ context in AI commands, add this to your AI command handler:

```typescript
import { loadRecoderContext, formatContextForAI } from '../lib/recoder-context.js';

// In AI command:
const context = await loadRecoderContext(process.cwd());
const contextPrompt = formatContextForAI(context);

// Add to system prompt
const systemPrompt = basePrompt + contextPrompt;
```

## Files Structure

```
src/
├── commands/
│   └── context/
│       ├── index.ts      # Main command (exports createContextCommand)
│       ├── init.ts       # Init subcommand
│       └── edit.ts       # Edit subcommand
└── lib/
    └── recoder-context.ts # Context loader
```

## Next Steps

1. Identify your CLI framework (Commander.js, yargs, etc.)
2. Add command registration to main entry point
3. Build and test
4. Update CLI documentation
5. Publish new version

## Support

If you need help integrating, check:
- Commander.js docs: https://github.com/tj/commander.js
- Your existing command structure in `src/commands/`
- How other commands are registered
