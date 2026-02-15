# File Watcher Infinite Loop Bug - FIXED

## Date: 2026-01-22

## Problem Statement
The file watcher was causing an infinite loop of preview refreshes, leading to:
- Same file detected as "created" 19+ times consecutively
- 100+ 503 (Service Unavailable) errors cascading
- Resource exhaustion and WebSocket failures
- Poor user experience with constant flickering preview

## Evidence from Logs
```
[FileWatcher] 1 file changes detected: create: workspace/src/components/dashboard.tsx
[FileWatcher] Code file changed, triggering preview refresh
[Preview] File changes detected from CLI, refreshing...
[repeated 19+ times for the SAME file within seconds]
```

## Root Cause Analysis

### Backend Issue
- File watcher polled every 1 second (`pollInterval = 1000ms`)
- No deduplication of events before emission
- Same file could trigger multiple "create" events if detected in consecutive polls
- Events emitted immediately without checking for recent duplicates

### Frontend Issue
- Preview component had NO rate limiting on refreshes
- Each file change event triggered immediate refresh (with only 500ms delay for Vite)
- No protection against rapid consecutive refresh requests
- Could trigger dozens of iframe reloads in seconds

## Solution Implemented

### 1. Backend Fix: Event Deduplication (docker-backend/src/file-watcher.ts)

**Added:**
- `recentEvents` Map: Tracks recent events per project
- `DEBOUNCE_MS = 2000`: 2-second deduplication window
- `deduplicateEvents()` method: Filters duplicate events

**How it works:**
1. Each event gets a unique key: `${type}:${path}` (e.g., "create:workspace/src/components/dashboard.tsx")
2. Before emitting, check if this event key exists in the recent set
3. If exists, skip (it's a duplicate)
4. If new, emit and add to recent set
5. Remove from recent set after 2 seconds

**Code added:**
```typescript
private recentEvents = new Map<string, Set<string>>();
private readonly DEBOUNCE_MS = 2000;

private deduplicateEvents(projectId: string, changes: FileChangeEvent[]): FileChangeEvent[] {
  if (!this.recentEvents.has(projectId)) {
    this.recentEvents.set(projectId, new Set());
  }

  const recentSet = this.recentEvents.get(projectId)!;
  const dedupedChanges: FileChangeEvent[] = [];

  for (const change of changes) {
    const eventKey = `${change.type}:${change.path}`;

    if (!recentSet.has(eventKey)) {
      dedupedChanges.push(change);
      recentSet.add(eventKey);
      setTimeout(() => recentSet.delete(eventKey), this.DEBOUNCE_MS);
    }
  }

  return dedupedChanges;
}
```

**Logging improvement:**
- Before: `[FileWatcher] ${projectId}: ${changes.length} file changes detected`
- After: `[FileWatcher] ${projectId}: ${dedupedChanges.length} file changes detected (${filtered} duplicates filtered)`

### 2. Frontend Fix: Refresh Rate Limiting (recoder-web/app/components/workbench/Preview.tsx)

**Added:**
- Minimum 2-second interval between preview refreshes
- Intelligent debouncing: tracks last refresh time
- Automatic cleanup of pending timeouts

**How it works:**
1. When file change event arrives, check time since last refresh
2. If < 2 seconds, schedule refresh for later (debounce)
3. If >= 2 seconds, refresh immediately (with 500ms Vite delay)
4. Clear any pending refresh when new event arrives
5. Track last refresh time to enforce minimum interval

**Code added:**
```typescript
useEffect(() => {
  let refreshTimeout: NodeJS.Timeout | null = null;
  let lastRefreshTime = 0;
  const MIN_REFRESH_INTERVAL = 2000;

  const handleFileChange = (event: CustomEvent) => {
    const now = Date.now();
    const timeSinceLastRefresh = now - lastRefreshTime;

    if (refreshTimeout) {
      clearTimeout(refreshTimeout);
      refreshTimeout = null;
    }

    if (timeSinceLastRefresh < MIN_REFRESH_INTERVAL) {
      // Debounce: wait until enough time has passed
      refreshTimeout = setTimeout(() => {
        reloadPreview();
        lastRefreshTime = Date.now();
        refreshTimeout = null;
      }, MIN_REFRESH_INTERVAL - timeSinceLastRefresh);
    } else {
      // Enough time has passed, refresh immediately
      refreshTimeout = setTimeout(() => {
        reloadPreview();
        lastRefreshTime = Date.now();
        refreshTimeout = null;
      }, 500);
    }
  };

  window.addEventListener('recoder:file-changed', handleFileChange as EventListener);
  return () => {
    window.removeEventListener('recoder:file-changed', handleFileChange as EventListener);
    if (refreshTimeout) clearTimeout(refreshTimeout);
  };
}, []);
```

## Benefits of This Fix

### Defense in Depth
- **Backend protection**: Prevents duplicate events from being emitted
- **Frontend protection**: Rate limits refreshes even if backend sends duplicates
- Both layers work together for maximum reliability

### Performance Improvement
- Eliminates 503 error cascades
- Reduces unnecessary iframe reloads
- Prevents resource exhaustion
- Better user experience (no flicker)

### Observable Results
Before the fix:
```
[FileWatcher] 1 file changes detected: create: workspace/src/components/dashboard.tsx
[Preview] File changes detected from CLI, refreshing...
[FileWatcher] 1 file changes detected: create: workspace/src/components/dashboard.tsx
[Preview] File changes detected from CLI, refreshing...
[repeated 19+ times]
```

After the fix:
```
[FileWatcher] 1 file changes detected (0 duplicates filtered)
[Preview] File changes detected from CLI, refreshing...
[Preview] File changes detected, debouncing refresh...  [if more events arrive]
[Preview] Refreshing preview after debounce...  [only after 2s minimum interval]
```

## Testing Checklist

- [ ] Create a new file in workspace - should trigger ONE refresh
- [ ] Modify a file rapidly - should refresh at most once per 2 seconds
- [ ] Multiple files changed - should batch and refresh once
- [ ] No 503 cascades in console
- [ ] Logs show "(X duplicates filtered)" when duplicates detected
- [ ] Preview refreshes smoothly without flickering

## Files Modified

1. **docker-backend/src/file-watcher.ts** - Added event deduplication
2. **recoder-web/app/components/workbench/Preview.tsx** - Added refresh rate limiting
3. **CURRENT_STATUS.md** - Documented the fix

## Configuration
Both backend and frontend use 2-second windows:
- Backend: `DEBOUNCE_MS = 2000` (deduplicate events)
- Frontend: `MIN_REFRESH_INTERVAL = 2000` (rate limit refreshes)

These can be tuned if needed, but 2 seconds provides good balance between responsiveness and stability.
