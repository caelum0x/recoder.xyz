# Critical Fixes - TODO List

## Summary of Current Status

### ✅ COMPLETED FIXES:
1. **Suggestions clickable** - Fixed in BaseChat.tsx
2. **Send button works** - Added logging
3. **API GitHub loader** - Added GET handler
4. **require() errors silenced** - starter-integration.ts fixed
5. **History save logic enhanced** - useChatHistory.ts improved with logging

### ❌ REMAINING CRITICAL ISSUES:

## 1. Chat History Still Empty (HIGHEST PRIORITY)

**Why it's empty:**
The history needs BOTH conditions:
- `urlId` must be set
- `description` must be set

But the Menu.client.tsx filters show only chats with BOTH:
```typescript
.then((list) => list.filter((item) => item.urlId && item.description))
```

**The Fix:**
The enhanced useChatHistory.ts I created should fix this, but you need to test:

1. Send a message
2. Check console for:
   ```
   💾 Storing chat history: X messages
   🆔 Created new chat ID: 1
   🔗 Set URL ID from chat ID: 1
   📝 Set description from first message: ...
   ✅ Chat history saved successfully
   ```

3. Open DevTools > Application > IndexedDB > boltHistory > chats
4. Verify entry exists with `urlId` and `description`

**If still not working:**
- Check if database is initialized: Look for `db` being undefined
- Check if messages array is empty when save is called
- Verify `firstArtifact` is being detected

## 2. History Button Placement (HIGH PRIORITY)

**Current State:**
- Button at `top-[80px] left-4` (below header, floating)
- Says "History" which takes space

**Desired State:**
- Next to "Recoder" logo in header
- Just icon, no text
- Top-left position

**Files to Modify:**
1. `app/components/header/Header.tsx` - Add history button
2. `app/components/sidebar/Menu.client.tsx` - Remove floating button OR move it

**Implementation:**
```typescript
// In Header.tsx, add import:
import { chatStore } from '~/lib/stores/chat';

// Add button next to logo:
<button
  onClick={() => {
    // Trigger menu open
    const event = new CustomEvent('toggle-history');
    window.dispatchEvent(event);
  }}
  className="ml-3 p-2 hover:bg-bolt-elements-background-depth-2 rounded-lg transition-colors"
  title="Chat History"
>
  <div className="i-ph:sidebar text-xl text-bolt-elements-textPrimary" />
</button>

// In Menu.client.tsx, listen for event:
useEffect(() => {
  const handleToggle = () => setOpen(!open);
  window.addEventListener('toggle-history', handleToggle);
  return () => window.removeEventListener('toggle-history', handleToggle);
}, [open]);
```

## 3. Schema Generator - Add Close Button (MEDIUM)

**Current State:**
No way to close the schema view once generated

**Fix:**
Add X button at top-right when result exists

**Implementation:**
```typescript
// At top of SchemaGenerator.tsx return, add:
{result && (
  <button
    onClick={() => {
      setResult(null);
      setDescription('');
    }}
    className="absolute top-4 right-4 z-10 p-2 bg-bolt-elements-background-depth-2 hover:bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor rounded-lg transition-colors"
    title="Close schema view"
  >
    <X className="w-5 h-5 text-bolt-elements-textPrimary" />
  </button>
)}
```

## 4. Schema Generator - Import to Project (MEDIUM)

**Current State:**
Can generate schema but can't add files to current project

**Fix:**
Add "Import to Project" button that creates files in workbench

**Implementation:**
```typescript
// Add import at top:
import { workbenchStore } from '~/lib/stores/workbench';
import { toast } from 'react-toastify';

// Add function:
const handleImportToProject = () => {
  if (!result) return;
  
  try {
    // Create schema files
    const timestamp = Date.now();
    workbenchStore.addFile(`schema-${timestamp}.sql`, result.schema.sql);
    workbenchStore.addFile(`types-${timestamp}.ts`, result.schema.typescript);
    
    if (result.schema.prisma) {
      workbenchStore.addFile('schema.prisma', result.schema.prisma);
    }
    
    if (result.seedData) {
      workbenchStore.addFile(`seed-${timestamp}.sql`, result.seedData.sql);
    }
    
    toast.success('Schema files imported to project!');
    setResult(null);
  } catch (error) {
    toast.error('Failed to import schema');
    console.error(error);
  }
};

// Add button in results section:
<button
  onClick={handleImportToProject}
  className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded-lg transition-colors"
>
  <FileCode className="w-4 h-4" />
  Import to Current Project
</button>
```

## 5. Preview Not Working (LOW PRIORITY)

**Likely Cause:**
WebContainer might not have started or port not exposed

**Debug Steps:**
1. Check console for webcontainer errors
2. Verify preview URL is correct format
3. Check if iframe has sandbox restrictions

**Quick Fix:**
Add error boundary and fallback message

## 6. GitHub Cloning - Rate Limit (LOW PRIORITY)

**Current Errors:**
- `rate limit exceeded`
- `Failed to fetch repository tree`

**Fix:**
Add GitHub token to `.dev.vars`:
```
GITHUB_TOKEN=your_github_personal_access_token
```

Then use it in API calls

## Testing Steps

### Test 1: Chat History
1. Clear IndexedDB (DevTools > Application > IndexedDB > Delete bolt History)
2. Refresh page
3. Send a message: "test message"
4. Check console for save logs
5. Check IndexedDB for entry
6. Reload page
7. Open history sidebar
8. Verify chat appears

### Test 2: History Button
1. Look at header - button should be near logo
2. Click it
3. Sidebar should open
4. Close sidebar
5. Button should still be visible

### Test 3: Schema Generator
1. Go to /schema page
2. Generate a schema
3. Look for X button top-right
4. Click X - should close
5. Generate again
6. Click "Import to Project"
7. Check workbench for files

## Priority Actions

**Do these first:**
1. Test if history is saving (check console logs)
2. If not saving, debug useChatHistory.ts
3. Move history button to header
4. Add schema close button

**Do these next:**
5. Add schema import functionality
6. Fix preview if broken
7. Add GitHub token for cloning

## Files Ready to Modify

All my fixes are in place except:
1. Header.tsx - needs history button
2. Menu.client.tsx - needs event listener
3. SchemaGenerator.tsx - needs close + import buttons

Would you like me to apply these remaining fixes now?
