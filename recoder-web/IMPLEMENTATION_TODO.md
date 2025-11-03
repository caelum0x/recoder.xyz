# 📋 Implementation TODO List

## 🔴 Critical - Must Fix ASAP

### 1. Schema Generator - Close Button ❌
**Problem:** No way to close the schema generator modal  
**Impact:** Users get stuck in schema view  
**Priority:** CRITICAL  
**Effort:** 5 minutes

**Files to modify:**
- Find schema generator component (likely `app/routes/schema.tsx` or `app/components/database/SchemaGenerator.tsx`)
- Add close button in top-right corner
- Add onClick handler to navigate back

**Code to add:**
```tsx
<button
  onClick={() => navigate('/')}
  className="absolute top-4 right-4 p-2 hover:bg-gray-200 rounded-lg"
  title="Close"
>
  <div className="i-ph:x text-xl" />
</button>
```

---

### 2. Schema Generator - Import to Project ❌
**Problem:** Generated schemas can't be imported into current project  
**Impact:** Users can't use generated schemas  
**Priority:** CRITICAL  
**Effort:** 30 minutes

**Files to modify:**
- Schema generator component
- Add "Import to Project" button
- Connect to workbenchStore to write files

**Code to add:**
```tsx
import { workbenchStore } from '~/lib/stores/workbench';

const handleImport = async () => {
  const files = {
    'database/schema.sql': generatedSchemaSQL,
    'database/migrations/001_initial.sql': migrationSQL,
    'database/seeds/001_sample_data.sql': seedSQL,
  };
  
  // Write files to workbench
  for (const [path, content] of Object.entries(files)) {
    workbenchStore.addFile(path, content);
  }
  
  toast.success('Schema imported to project!');
};

<button
  onClick={handleImport}
  className="px-4 py-2 bg-blue-600 text-white rounded-lg"
>
  Import to Current Project
</button>
```

---

### 3. Chat History - Auto-Save Integration ❌
**Problem:** Chats not automatically saving to database  
**Impact:** History remains empty  
**Priority:** CRITICAL  
**Effort:** 1 hour

**Files to modify:**
- `app/components/chat/Chat.client.tsx`
- Add useChatHistory hook
- Auto-save on message sent

**Code to add:**
```tsx
import { useChatHistory, getAnonymousId } from '~/hooks/useChatHistory';

function Chat() {
  const { saveChat } = useChatHistory({
    anonymousId: getAnonymousId(),
  });
  
  // In your message handler:
  const handleSendMessage = async (message) => {
    // ... existing code ...
    
    // Auto-save after message
    await saveChat({
      urlId: chatId,
      description: firstUserMessage, // First message as description
      messages: allMessages,
    });
  };
}
```

---

### 4. Preview/WebContainer Not Working ❌
**Problem:** Preview pane shows errors or blank screen  
**Impact:** Can't see live preview of projects  
**Priority:** HIGH  
**Effort:** 2-4 hours (debugging)

**Steps to debug:**
1. Check console for WebContainer errors
2. Verify port forwarding is working
3. Check if dev server is starting in WebContainer
4. Test with simple HTML file first

**Files to check:**
- `app/lib/webcontainer.ts`
- `app/components/workbench/Preview.tsx`
- Any preview-related stores

---

### 5. GitHub Clone - Rate Limit Handling ❌
**Problem:** GitHub API rate limits hit when cloning  
**Impact:** Can't clone repos without auth  
**Priority:** HIGH  
**Effort:** 20 minutes

**Files to modify:**
- `app/lib/.server/github/operations.ts` (or similar)
- Add token check
- Better error messages

**Code to add:**
```typescript
async function cloneRepo(url: string) {
  const token = process.env.GITHUB_TOKEN;
  
  if (!token) {
    throw new Error(
      'GitHub token not configured. Add GITHUB_TOKEN to .env to avoid rate limits.'
    );
  }
  
  // Use token in API requests
  const headers = {
    Authorization: `Bearer ${token}`,
  };
  
  // ... rest of clone logic
}
```

---

## 🟡 Important - Should Complete Soon

### 6. MCP Tools - AI Integration ⚠️
**Problem:** AI can't automatically use MCP tools  
**Impact:** AI can't read/write files on its own  
**Priority:** HIGH  
**Effort:** 2-3 hours

**What to do:**
1. Add MCP tools to AI's system prompt
2. Parse AI's tool use requests
3. Execute tools and return results
4. Show tool results in chat

**Files to modify:**
- `app/routes/api.chat.ts`
- AI streaming handler
- Tool execution integration

---

### 7. Deployment History UI ⚠️
**Problem:** No way to see past deployments  
**Impact:** Can't track deployment history  
**Priority:** MEDIUM  
**Effort:** 2 hours

**What to do:**
1. Create DeploymentHistory component
2. Fetch from deployments table
3. Show list with rollback buttons
4. Add to deployment modal or header

---

### 8. History Sidebar - Show Chats ⚠️
**Problem:** History button doesn't show chat list  
**Impact:** Can't access old chats easily  
**Priority:** HIGH  
**Effort:** 1-2 hours

**What to do:**
1. Create or find HistorySidebar component
2. Use useChatHistory hook
3. Display list of chats
4. Add click to load chat
5. Add delete button per chat

---

## 🟢 Nice to Have - Future Enhancements

### 9. More Deployment Platforms 🔜
**Platforms:**
- Railway
- Render
- Fly.io
- Cloudflare Pages

**Effort:** 1-2 days per platform

---

### 10. Complete MCP Servers 🔜
**Servers needed:**
- GitHub (70% done)
- Database (60% done)
- API (50% done)
- npm/Package Manager (0%)
- Testing (0%)
- Documentation (0%)

**Effort:** 3-5 days total

---

### 11. MCP Settings UI 🔜
**Features:**
- Enable/disable servers
- Configure permissions
- View tool usage stats
- Rate limit settings

**Effort:** 1 day

---

### 12. Advanced Deployment Features 🔜
**Features:**
- Custom domains
- Environment variable management
- Build configuration
- Rollback to previous versions
- A/B testing
- Analytics integration

**Effort:** 1-2 weeks

---

## 🎯 Implementation Order

### Week 1 - Critical Fixes
```
Day 1:
- ✅ Schema Generator Close Button (5 min)
- ✅ Schema Generator Import (30 min)
- ✅ Chat Auto-Save Integration (1 hour)
- Test all three features

Day 2-3:
- ✅ Preview/WebContainer Debug (2-4 hours)
- ✅ GitHub Rate Limit Fix (20 min)
- Test deployments

Day 4-5:
- ✅ History Sidebar UI (1-2 hours)
- ✅ Deployment History UI (2 hours)
- Polish and bug fixes
```

### Week 2 - MCP Integration
```
Day 1-3:
- ✅ Connect MCP tools to AI
- ✅ Test file operations through chat
- ✅ Add tool execution feedback in UI

Day 4-5:
- ✅ Complete GitHub MCP server
- ✅ Complete Database MCP server
- ✅ Complete API MCP server
```

### Week 3 - Polish & New Features
```
Day 1-2:
- ✅ MCP Settings UI
- ✅ Advanced deployment options
- ✅ Documentation

Day 3-5:
- ✅ Railway deployment
- ✅ More platform integrations
- ✅ Performance optimization
```

---

## 📝 Detailed Task Breakdown

### Task 1: Schema Generator Close Button
**File:** `app/routes/schema.tsx` (or similar)
**Time:** 5 minutes

```tsx
// Find the Schema component
export default function Schema() {
  const navigate = useNavigate();
  
  return (
    <div className="relative">
      {/* Add close button */}
      <button
        onClick={() => navigate(-1)}
        className="absolute top-4 right-4 z-50 p-2 hover:bg-bolt-elements-background-depth-2 rounded-lg transition-colors"
        title="Close Schema Generator"
      >
        <div className="i-ph:x text-xl text-bolt-elements-textPrimary" />
      </button>
      
      {/* Rest of schema generator UI */}
      <SchemaGenerator />
    </div>
  );
}
```

**Test:** Click schema button → See close X → Click X → Return to chat

---

### Task 2: Schema Generator Import
**File:** Schema generator component
**Time:** 30 minutes

```tsx
import { workbenchStore } from '~/lib/stores/workbench';
import { useState } from 'react';

function SchemaGenerator() {
  const [generatedSchema, setGeneratedSchema] = useState('');
  const [isImporting, setIsImporting] = useState(false);
  
  const handleImport = async () => {
    setIsImporting(true);
    
    try {
      // Write schema files to workbench
      const files = {
        'database/schema.sql': generatedSchema.schema,
        'database/migrations/001_initial.sql': generatedSchema.migration,
        'database/seeds/data.sql': generatedSchema.seeds || '',
        'README.md': `# Database Schema\n\nGenerated at ${new Date().toISOString()}\n\n${generatedSchema.documentation}`,
      };
      
      for (const [path, content] of Object.entries(files)) {
        // Write to workbench
        const action = {
          type: 'file',
          filePath: path,
          content: content,
        };
        
        workbenchStore.addFile(path, { content });
      }
      
      // Show success message
      alert('✅ Schema imported to project!');
      
      // Optionally close modal
      navigate('/');
    } catch (error) {
      console.error('Import failed:', error);
      alert('❌ Failed to import schema');
    } finally {
      setIsImporting(false);
    }
  };
  
  return (
    <div>
      {/* Existing schema generator UI */}
      
      {generatedSchema && (
        <button
          onClick={handleImport}
          disabled={isImporting}
          className="mt-4 px-6 py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg font-medium"
        >
          {isImporting ? 'Importing...' : 'Import to Current Project'}
        </button>
      )}
    </div>
  );
}
```

**Test:** Generate schema → Click import → See files in workbench → Verify content

---

### Task 3: Chat Auto-Save
**File:** `app/components/chat/Chat.client.tsx`
**Time:** 1 hour

```tsx
import { useChatHistory, getAnonymousId } from '~/hooks/useChatHistory';
import { useEffect } from 'react';

export function Chat() {
  const { messages, chatId } = useChatStore();
  const { saveChat } = useChatHistory({
    anonymousId: getAnonymousId(),
  });
  
  // Auto-save on message changes
  useEffect(() => {
    if (messages.length === 0) return;
    
    // Debounce saves
    const timer = setTimeout(async () => {
      try {
        await saveChat({
          urlId: chatId,
          description: getFirstUserMessage(messages),
          messages: messages,
        });
        console.log('💾 Chat auto-saved');
      } catch (error) {
        console.error('Failed to auto-save:', error);
      }
    }, 2000); // Save 2 seconds after last message
    
    return () => clearTimeout(timer);
  }, [messages, chatId, saveChat]);
  
  // Helper to get first user message for description
  function getFirstUserMessage(msgs: Message[]): string {
    const firstUser = msgs.find(m => m.role === 'user');
    return firstUser?.content.slice(0, 100) || 'New Chat';
  }
  
  // ... rest of chat component
}
```

**Test:** Send messages → Wait 2 seconds → Reload page → See messages still there

---

## 🎓 Learning Resources

### Understanding MCP:
- MCP Protocol: https://modelcontextprotocol.io
- Tool execution patterns
- Security considerations

### Deployment Platforms:
- Vercel API: https://vercel.com/docs/rest-api
- Netlify API: https://docs.netlify.com/api/get-started/
- Railway API: https://docs.railway.app/reference/api

### Database with Neon:
- Neon docs: https://neon.tech/docs
- PostgreSQL basics
- Connection pooling

---

## ✅ Completion Checklist

### Must Complete (Week 1):
- [ ] Schema close button
- [ ] Schema import
- [ ] Chat auto-save
- [ ] Preview fix
- [ ] GitHub rate limit

### Should Complete (Week 2):
- [ ] History sidebar
- [ ] Deployment history
- [ ] MCP-AI integration

### Nice to Have (Week 3+):
- [ ] More platforms
- [ ] Complete MCP servers
- [ ] Advanced features

---

## 🚀 Getting Started

1. **Read this file** - Understand what needs to be done
2. **Start with Critical tasks** - Biggest impact, smallest effort
3. **Test each change** - Don't move on until it works
4. **Commit frequently** - Small, working changes
5. **Document as you go** - Update this file with status

---

## 📊 Progress Tracking

**Overall Progress: 70%**

- Core Infrastructure: 100% ✅
- Database Schema: 100% ✅
- MCP Servers: 40% ⚠️
- Deployment System: 80% ✅
- UI Components: 70% ⚠️
- Documentation: 90% ✅

**Estimated Time to 100%: 2-3 weeks**

---

## 🆘 Getting Help

If stuck on any task:
1. Check implementation docs
2. Look at similar working code
3. Test in isolation
4. Use console.log debugging
5. Ask for help with specific error

---

**Let's ship this! 🚀**
