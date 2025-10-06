# 🚀 Bolt.new Integration Plan - Modernized with Claude Sonnet 4.5 & OpenRouter

## Current Bolt.new Architecture (Analyzed)

### AI Integration (OLD - 9 months ago)
```typescript
// app/lib/.server/llm/model.ts
export function getAnthropicModel(apiKey: string) {
  const anthropic = createAnthropic({ apiKey });
  return anthropic('claude-3-5-sonnet-20240620'); // ❌ OLD MODEL
}

// MAX_TOKENS = 8192 // ❌ OUTDATED
```

### Key Components Found
1. **`stream-text.ts`** - AI streaming with Anthropic SDK
2. **`model.ts`** - Claude 3.5 Sonnet (June 2024 - OLD)
3. **`prompts.ts`** - System prompts
4. **WebContainer** - In-browser code execution
5. **Workbench** - Code editor + terminal + preview
6. **FileTree** - File management
7. **Artifact** - Code artifact rendering

## 🎯 Modernization Strategy

### 1. Update AI Models (Priority 1)

**From:**
- ❌ Claude 3.5 Sonnet (June 2024)
- ❌ 8192 max tokens
- ❌ Single provider (Anthropic only)

**To:**
- ✅ Claude Sonnet 4.5 (Latest - Jan 2025)
- ✅ OpenRouter multi-provider
- ✅ 200K max tokens
- ✅ Fallback chain (OpenRouter → Groq → Together)

### 2. Multi-Provider Architecture

```typescript
// NEW: lib/ai/bolt-providers.ts
export const boltProviders = {
  // Primary: Claude Sonnet 4.5 via OpenRouter
  premium: 'anthropic/claude-sonnet-4.5',
  
  // Fast: Groq for quick responses
  fast: 'groq/llama-3.3-70b-versatile',
  
  // Free: DeepSeek for unlimited dev
  free: 'deepseek/deepseek-r1:free',
  
  // Coding: Specialized for code
  coding: 'qwen/qwen-3-coder-480b',
};
```

### 3. Core Features to Extract

#### A. WebContainer Integration
```
bolt.new/app/lib/webcontainer/
├── webcontainer.ts       → In-browser Node.js runtime
├── terminal.ts           → Terminal emulator integration
└── preview-url.ts        → Live preview URL generation
```

**Implementation:**
- Copy WebContainer setup from bolt.new
- Integrate with recoder-web workbench
- Add hot reload and file watching

#### B. Streaming & Artifacts
```
bolt.new/app/components/chat/
├── BaseChat.tsx          → Streaming chat interface
├── Artifact.tsx          → Code artifact rendering
└── Messages.client.tsx   → Real-time message updates
```

**Implementation:**
- Adapt streaming to work with OpenRouter
- Add artifact parsing and rendering
- Integrate with recoder-web UI

#### C. Workbench Components
```
bolt.new/app/components/workbench/
├── Workbench.client.tsx  → Main workbench container
├── EditorPanel.tsx       → CodeMirror integration
├── Preview.tsx           → Live preview iframe
├── FileTree.tsx          → File system navigation
└── Terminal.tsx          → Xterm.js terminal
```

**Implementation:**
- Port workbench to recoder-web
- Add split-screen with resizable panels
- Integrate terminal and preview

## 📋 Implementation Steps

### Phase 1: Modernize AI Layer (2-3 hours)

1. **Create `lib/ai/bolt-ai-provider.ts`**
   ```typescript
   import { streamText } from 'ai';
   
   export async function createBoltStream(messages: Message[], options: {
     model?: 'premium' | 'fast' | 'free' | 'coding';
     maxTokens?: number;
   }) {
     const modelId = getBoltModel(options.model);
     
     return streamText({
       model: openrouter(modelId),
       system: getBoltSystemPrompt(),
       messages: messages,
       maxTokens: options.maxTokens || 16000,
       temperature: 0.2,
     });
   }
   ```

2. **Update Model Selection**
   - Claude Sonnet 4.5: `anthropic/claude-sonnet-4.5`
   - Increase max tokens: `16000` (or up to 200K for Sonnet 4.5)
   - Add provider fallbacks

3. **Create OpenRouter Integration**
   ```typescript
   export function getOpenRouterProvider() {
     return createOpenRouter({
       apiKey: process.env.OPENROUTER_API_KEY,
       baseURL: 'https://openrouter.ai/api/v1',
     });
   }
   ```

### Phase 2: Extract WebContainer (1-2 hours)

1. **Copy WebContainer Files**
   ```bash
   cp -r bolt.new/app/lib/webcontainer recoder-web/lib/
   ```

2. **Install Dependencies**
   ```bash
   pnpm add @webcontainer/api @xterm/xterm @xterm/addon-fit
   ```

3. **Create WebContainer Hook**
   ```typescript
   export function useWebContainer() {
     const [container, setContainer] = useState<WebContainer | null>(null);
     
     useEffect(() => {
       WebContainer.boot().then(setContainer);
     }, []);
     
     return container;
   }
   ```

### Phase 3: Integrate Workbench (2-3 hours)

1. **Port Workbench Components**
   - Copy `Workbench.client.tsx` → `app/(main)/components/Workbench.tsx`
   - Copy `EditorPanel.tsx` → `app/(main)/components/Editor.tsx`
   - Copy `Preview.tsx` → `app/(main)/components/Preview.tsx`

2. **Update UI to Bolt.new Style**
   - Dark theme with exact color scheme
   - Split-screen layout (chat | workbench)
   - Resizable panels (already have react-resizable-panels)

3. **Integrate File System**
   - Use bolt.new's FileTree component
   - Connect to WebContainer FS
   - Add file creation/editing/deletion

### Phase 4: Streaming & Artifacts (1-2 hours)

1. **Adapt Streaming**
   ```typescript
   export async function handleBoltStream(chatId: string, messages: Message[]) {
     const stream = await createBoltStream(messages, {
       model: 'premium',
       maxTokens: 16000,
     });
     
     for await (const chunk of stream.textStream) {
       // Parse artifacts (code blocks, file operations)
       // Update WebContainer files
       // Render in UI
     }
   }
   ```

2. **Artifact Parsing**
   - Extract code blocks from AI response
   - Identify file operations (create, update, delete)
   - Apply to WebContainer
   - Show in preview

## 🔧 Technical Details

### Dependencies to Add
```json
{
  "@ai-sdk/openrouter": "latest",
  "@webcontainer/api": "^1.1.9",
  "@xterm/xterm": "^5.3.0",
  "@xterm/addon-fit": "^0.8.0",
  "@xterm/addon-web-links": "^0.9.0",
  "@codemirror/lang-javascript": "^6.2.1",
  "@codemirror/lang-typescript": "^6.0.5",
  "ai": "^3.0.0"
}
```

### Environment Variables
```bash
# Claude Sonnet 4.5 via OpenRouter
OPENROUTER_API_KEY=sk-or-v1-...

# Or direct Anthropic (fallback)
ANTHROPIC_API_KEY=sk-ant-api03-...

# Groq for fast mode
GROQ_API_KEY=gsk_...
```

### File Structure After Integration
```
recoder-web/
├── app/(main)/
│   ├── components/
│   │   ├── Workbench.tsx        ← From bolt.new
│   │   ├── Editor.tsx           ← From bolt.new
│   │   ├── Preview.tsx          ← From bolt.new
│   │   ├── FileTree.tsx         ← From bolt.new
│   │   └── Terminal.tsx         ← From bolt.new
│   ├── actions.ts               ← Updated for bolt streaming
│   └── page.tsx                 ← Updated UI layout
├── lib/
│   ├── ai/
│   │   └── bolt-ai-provider.ts  ← NEW: Modern AI integration
│   └── webcontainer/            ← From bolt.new
│       ├── webcontainer.ts
│       └── terminal.ts
```

## 🎯 Success Criteria

### Must Have (MVP)
- ✅ Claude Sonnet 4.5 via OpenRouter
- ✅ WebContainer running in browser
- ✅ Live code preview
- ✅ Streaming AI responses
- ✅ File tree navigation
- ✅ Terminal integration

### Nice to Have
- ✅ Multi-provider fallback
- ✅ Artifact parsing
- ✅ Hot reload
- ✅ Syntax highlighting
- ✅ Error handling

## 📊 Performance Targets

### AI Response Times
- **Premium (Claude Sonnet 4.5)**: 2-5s first token
- **Fast (Groq Llama 3.3)**: 0.5-1s first token
- **Free (DeepSeek R1)**: 1-3s first token

### WebContainer
- **Boot time**: <2s
- **File operations**: <100ms
- **Preview refresh**: <500ms

## 🚀 Next Actions

1. ✅ Create `lib/ai/bolt-ai-provider.ts` with Claude Sonnet 4.5
2. ✅ Update model to `anthropic/claude-sonnet-4.5`
3. ✅ Increase max tokens to 16000
4. ✅ Add OpenRouter integration
5. ✅ Extract WebContainer files
6. ✅ Port Workbench components
7. ✅ Test end-to-end flow

**Time Estimate: 6-10 hours total**
**Current Progress: Architecture analyzed, ready to implement!**
