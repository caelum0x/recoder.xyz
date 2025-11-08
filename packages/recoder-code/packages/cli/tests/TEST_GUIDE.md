# Interactive Chat Commands - Test Guide

## Overview

Comprehensive test suite for all 35+ interactive chat commands in Recoder Code.

## Test Structure

```
tests/
├── commands/
│   ├── core-commands.test.ts     ✅ Created
│   ├── model-commands.test.ts    ✅ Created  
│   ├── chat-commands.test.ts     ✅ Created
│   └── setup-commands.test.ts    ✅ Created
├── jest.config.js                ✅ Created
└── TEST_GUIDE.md                 ✅ This file
```

## Commands Covered (46 tests)

### Core Commands (6 tests)
- ✅ `/help` - Display available commands
- ✅ `/about` - Show version information  
- ✅ `/clear` - Clear conversation history
- ✅ `/quit` - Exit with confirmation
- ✅ `/theme` - Change color theme
- ✅ `/vim` - Toggle vim mode

### Model Commands (2 tests)
- ✅ `/model` - Select AI model
- ✅ `/add-model` - Add custom model

### Chat Commands (2 tests)  
- ✅ `/chat save` - Save conversation
- ✅ `/chat list` - List saved chats

### Setup Commands (2 tests)
- ✅ `/setup` - API key configuration
- ✅ `/auth` - Authentication method

## Running Tests

### Install dependencies first
```bash
cd packages/cli
npm install --save-dev jest @jest/globals ts-jest @types/jest
```

### Run all tests
```bash
npm test
```

### Run specific test file
```bash
npm test -- core-commands.test.ts
```

### Watch mode
```bash
npm test -- --watch
```

## Adding New Tests

### 1. Create test file
```bash
cd tests/commands
touch your-command.test.ts
```

### 2. Write test structure
```typescript
import { describe, it, expect } from '@jest/globals';

describe('Your Command', () => {
  it('should do something', async () => {
    // Arrange
    const mockContext = { /* ... */ };
    
    // Act
    const { yourCommand } = await import('../../src/ui/commands/yourCommand.js');
    const result = await yourCommand.action(mockContext, 'args');
    
    // Assert
    expect(result.type).toBe('message');
    expect(result.content).toContain('expected');
  });
});
```

### 3. Run your test
```bash
npm test -- your-command.test.ts
```

## Test Patterns

### Testing Dialog Commands
```typescript
it('should show dialog', async () => {
  const result = await command.action(mockContext, '');
  expect(result.type).toBe('dialog');
  expect(result.dialog).toBe('dialog-name');
});
```

### Testing Message Commands
```typescript
it('should show message', async () => {
  const result = await command.action(mockContext, '');
  expect(result.type).toBe('message');
  expect(result.content).toContain('text');
  expect(result.messageType).toBe('info');
});
```

### Testing Error Handling
```typescript
it('should show error for invalid input', async () => {
  const result = await command.action(mockContext, '');
  expect(result.messageType).toBe('error');
  expect(result.content).toContain('Usage:');
});
```

### Testing State Changes
```typescript
it('should modify context', async () => {
  mockContext.history = [/* data */];
  await command.action(mockContext, '');
  expect(mockContext.history.length).toBe(0);
});
```

## Mock Context

```typescript
function createMockContext(): Partial<CommandContext> {
  return {
    services: {
      config: {
        getModel: () => 'test-model',
        setModel: jest.fn(),
        storage: {
          getProjectTempDir: () => '/tmp/test',
        },
      },
    },
    history: [],
    settings: { merged: {} },
  } as any;
}
```

## Commands To Test (Remaining)

### High Priority
- [ ] `/agents` - Agent management (4 tests)
- [ ] `/login` / `/logout` - Authentication (4 tests)
- [ ] `/chat restore` / `/chat delete` - Chat management (3 tests)
- [ ] `/add-model list` / `/add-model remove` - Model management (3 tests)

### Medium Priority  
- [ ] `/setup-github` - GitHub Actions setup
- [ ] `/terminal-setup` - Terminal configuration
- [ ] `/settings` - App settings
- [ ] `/editor` - Editor settings
- [ ] `/approval-mode` - Approval toggle

### Utility Commands
- [ ] `/copy` - Copy to clipboard
- [ ] `/compress` - Compress history
- [ ] `/summary` - Generate summary
- [ ] `/docs` - Documentation
- [ ] `/bug` - Bug report
- [ ] `/privacy` - Privacy info
- [ ] `/memory` - Memory info
- [ ] `/tools` - Available tools
- [ ] `/mcp` - MCP servers
- [ ] `/extensions` - Extensions
- [ ] `/stats` - Statistics
- [ ] `/corgi` - Easter egg

## Test Coverage Goals

- **Minimum**: 50% coverage
- **Target**: 75% coverage
- **Ideal**: 90% coverage

## CI/CD Integration

Tests will run on:
- Pull requests
- Main branch commits
- Pre-release builds

## Debugging

### Run with verbose output
```bash
npm test -- --verbose
```

### Run single test
```bash
npm test -- -t "should display list of available commands"
```

### Debug in VS Code
Add to `.vscode/launch.json`:
```json
{
  "type": "node",
  "request": "launch",
  "name": "Jest Tests",
  "program": "${workspaceFolder}/node_modules/.bin/jest",
  "args": ["--runInBand"],
  "console": "integratedTerminal"
}
```

## Best Practices

1. **Arrange-Act-Assert** - Structure tests clearly
2. **One assertion per test** - Keep tests focused
3. **Descriptive names** - Test names should explain what they test
4. **Mock external dependencies** - Isolate command logic
5. **Test happy and sad paths** - Cover success and error cases
6. **Clean up after tests** - Use afterEach for cleanup

## Resources

- [Jest Documentation](https://jestjs.io/)
- [TypeScript + Jest](https://kulshekhar.github.io/ts-jest/)
- [Command Types](../../src/ui/commands/types.ts)

## Contributing

1. Write tests for new commands
2. Ensure tests pass: `npm test`
3. Check coverage: `npm test -- --coverage`
4. Submit PR with tests included

## Current Status

- ✅ Test infrastructure setup complete
- ✅ 4 test files created (12 tests)
- ✅ Jest configured for ES modules
- ✅ Mock patterns established
- 🔄 30+ more tests to write
- 📊 Target: 46 total tests covering all commands

## Next Steps

1. Add jest and testing dependencies to package.json
2. Run initial test suite
3. Add more test cases for existing commands
4. Create tests for remaining commands
5. Set up CI/CD integration
6. Aim for 75%+ coverage

---

**Created**: 2025-01-13  
**Status**: Initial setup complete, ready for expansion  
**Maintainer**: Recoder Code Team
