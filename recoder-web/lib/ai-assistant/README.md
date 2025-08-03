# Recoder Web AI Assistant

Advanced AI-powered coding assistance for the recoder-web platform, featuring intelligent code completion, refactoring suggestions, and real-time code analysis.

## Features

### 🧠 Intelligent Code Completion
- Context-aware code suggestions
- Multi-language support (TypeScript, JavaScript, React, etc.)
- Real-time completion as you type
- Confidence-based ranking

### 🔧 Smart Refactoring
- AI-powered refactoring suggestions
- Extract functions, optimize performance, modernize syntax
- Preview changes before applying
- Impact assessment for each suggestion

### 📊 Real-time Code Analysis
- Live code quality metrics
- Security vulnerability detection
- Performance optimization hints
- Style and maintainability suggestions

### 🎯 Context Management
- Project-aware assistance
- File and symbol tracking
- Cross-platform context sync
- Intelligent scope detection

## Usage

### Basic Setup

```typescript
import { createWebAIAssistant } from '@/lib/ai-assistant';

const aiAssistant = createWebAIAssistant({
  ai: {
    defaultModel: 'claude-3-sonnet',
    fallbackModels: ['gemini-2.0-flash', 'groq-llama'],
    maxContextTokens: 8000,
    temperature: 0.1,
    enableStreaming: true
  },
  features: {
    codeCompletion: true,
    inlineRefactoring: true,
    smartSuggestions: true,
    contextAwareness: true,
    realTimeAnalysis: true,
    collaborativeEditing: false
  },
  performance: {
    completionDebounceMs: 150,
    analysisThrottleMs: 500,
    cacheTimeout: 300000,
    maxConcurrentRequests: 3
  }
});

await aiAssistant.initialize();
```

### Code Completion

```typescript
const completion = await aiAssistant.getCodeCompletion({
  code: 'const user = { name: "John", age: 30 }; user.',
  position: { line: 1, column: 37 },
  language: 'typescript',
  context: {
    fileName: 'user.ts',
    framework: 'react'
  }
});

console.log(completion.completions); // Array of suggestions
```

### Refactoring

```typescript
const suggestions = await aiAssistant.getRefactoringSuggestions({
  code: selectedCode,
  selection: { start: 0, end: selectedCode.length },
  language: 'typescript',
  refactoringType: 'optimize'
});

console.log(suggestions.options); // Array of refactoring options
```

### Code Analysis

```typescript
const analysis = await aiAssistant.analyzeCode(code, 'typescript');

console.log(analysis.issues);      // Code issues and warnings
console.log(analysis.metrics);     // Quality metrics
console.log(analysis.suggestions); // Improvement suggestions
```

## React Components

### Enhanced Monaco Editor

```tsx
import { EnhancedMonacoEditor } from '@/components/ai-assistant/enhanced-monaco-editor';

<EnhancedMonacoEditor
  value={code}
  onChange={setCode}
  language="typescript"
  fileName="app.tsx"
  enableAI={true}
  height="600px"
/>
```

### Intelligent Code Completion

```tsx
import { IntelligentCodeCompletion } from '@/components/ai-assistant/intelligent-code-completion';

<IntelligentCodeCompletion
  code={code}
  language="typescript"
  position={cursorPosition}
  onCompletionSelect={handleCompletion}
/>
```

### Refactoring Panel

```tsx
import { IntelligentRefactoringPanel } from '@/components/ai-assistant/intelligent-refactoring-panel';

<IntelligentRefactoringPanel
  code={code}
  language="typescript"
  selection={selection}
  onRefactoringApply={handleRefactoring}
  onClose={() => setShowRefactoring(false)}
/>
```

### Real-time Analysis

```tsx
import { RealTimeCodeAnalysis } from '@/components/ai-assistant/real-time-code-analysis';

<RealTimeCodeAnalysis
  code={code}
  language="typescript"
  isVisible={showAnalysis}
  onToggleVisibility={() => setShowAnalysis(!showAnalysis)}
/>
```

## Integration with Unified Web AI

The AI Assistant seamlessly integrates with the Unified Web AI system:

```typescript
import { unifiedWebAI } from '@/lib/unified-web-ai';

// The assistant uses unifiedWebAI for AI model routing
const result = await unifiedWebAI.generateCode(prompt, {
  language: 'typescript',
  framework: 'react',
  includeTests: true
});
```

## Features

- **Multi-AI Support**: Intelligent routing between Claude, Gemini, Groq, and other models
- **Real-time Feedback**: Instant code analysis and suggestions
- **Context Awareness**: Project and file-aware assistance
- **Performance Optimized**: Debounced requests, caching, and efficient rendering
- **Enterprise Ready**: Audit logging, compliance monitoring, and security scanning
- **Cross-platform Sync**: Share context and preferences across all Recoder platforms

## Configuration

The AI Assistant can be configured for different use cases:

### Development Mode
```typescript
const devConfig = {
  features: { /* all enabled */ },
  performance: {
    completionDebounceMs: 100, // Faster response
    cacheTimeout: 60000       // Shorter cache
  }
};
```

### Production Mode
```typescript
const prodConfig = {
  features: {
    realTimeAnalysis: false   // Reduce server load
  },
  performance: {
    completionDebounceMs: 300, // Slower response
    cacheTimeout: 600000      // Longer cache
  }
};
```

## Architecture

```
┌─────────────────────────────────────────┐
│           Web AI Assistant              │
├─────────────────────────────────────────┤
│  ┌─────────────┬─────────────────────┐   │
│  │ Completion  │   Refactoring       │   │
│  │ Engine      │   Engine           │   │
│  └─────────────┼─────────────────────┤   │
│  │ Generation  │   Real-time        │   │
│  │ Engine      │   Analyzer         │   │
│  └─────────────┼─────────────────────┤   │
│  │ Context Manager                  │   │
│  └──────────────────────────────────┘   │
├─────────────────────────────────────────┤
│         Unified Web AI                  │
│    (Claude, Gemini, Groq routing)      │
└─────────────────────────────────────────┘
```

## Performance

- **Completion Response**: < 200ms
- **Analysis**: < 500ms  
- **Refactoring**: < 1s
- **Cache Hit Rate**: > 80%
- **Memory Usage**: < 50MB
- **CPU Usage**: < 5%

This AI Assistant system provides enterprise-grade coding assistance with amazing user experience and cross-platform integration.