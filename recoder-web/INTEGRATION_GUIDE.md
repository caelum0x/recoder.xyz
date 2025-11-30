# Integration Guide: Download & Push to GitHub Buttons

## Step 1: Add imports to BaseChat.tsx

Add these imports at the top of `/recoder-web/app/components/chat/BaseChat.tsx`:

```typescript
import { DownloadButton } from './DownloadButton';
import { PushToGitHubButton } from './PushToGitHubButton';
```

## Step 2: Add projectId prop to BaseChatProps interface

In the `BaseChatProps` interface (around line 18), add:

```typescript
interface BaseChatProps {
  chatId?: string;
  projectId?: string;  // ADD THIS LINE
  // ... rest of props
}
```

## Step 3: Add projectId to component destructuring

In the component function (around line 46), add projectId:

```typescript
export const BaseChat = React.forwardRef<HTMLDivElement, BaseChatProps>(
  (
    {
      chatId,
      projectId,  // ADD THIS LINE
      textareaRef,
      // ... rest of props
    },
    ref,
  ) => {
```

## Step 4: Add buttons to the UI

Find the section with GitHubBar (around line 130) and add the buttons after it:

```typescript
{/* GitHub Integration */}
{chatId && (
  <ClientOnly>
    {() => <GitHubBar chatId={chatId} />}
  </ClientOnly>
)}

{/* ADD THIS SECTION */}
{projectId && (
  <div className="flex gap-2 px-4 py-2 border-t border-bolt-elements-borderColor">
    <DownloadButton projectId={projectId} />
    <PushToGitHubButton projectId={projectId} />
  </div>
)}
```

## Step 5: Pass projectId from parent component

In the file that uses BaseChat (likely `routes/chat.$id.tsx` or similar), pass the projectId:

```typescript
<BaseChat
  chatId={chatId}
  projectId={currentProjectId}  // ADD THIS LINE
  // ... other props
/>
```

## Alternative: Add to Workbench Toolbar

If you want the buttons in the workbench toolbar instead, find the Workbench component and add:

```typescript
// In /recoder-web/app/components/workbench/Workbench.client.tsx
import { DownloadButton } from '~/components/chat/DownloadButton';
import { PushToGitHubButton } from '~/components/chat/PushToGitHubButton';

// In the toolbar section:
<div className="flex items-center gap-2">
  <DownloadButton projectId={workbench.projectId} />
  <PushToGitHubButton projectId={workbench.projectId} />
  {/* ... other toolbar items */}
</div>
```

## Step 6: GitHub Token Setup

Users need to connect their GitHub account. Add this to your auth flow:

```typescript
// After GitHub OAuth success, store token:
localStorage.setItem('github_token', accessToken);

// Or use a more secure approach with httpOnly cookies
```

## Testing

1. Start the dev server: `npm run dev`
2. Create or open a project
3. Click "Download Project" - should download a ZIP file
4. Click "Push to GitHub" - should open modal
5. Enter repo name and click "Create & Push"
6. Should create repo and open it in new tab

## Troubleshooting

**Download not working:**
- Check browser console for errors
- Verify project has files in database
- Check API endpoint is accessible

**Push to GitHub not working:**
- Verify GitHub token is stored
- Check GitHub OAuth scopes include `repo` permission
- Verify API endpoint has correct authentication
- Check Octokit errors in server logs

**Modal styling issues:**
- Verify bolt-elements CSS variables are defined
- Check z-index conflicts with other modals
- Adjust colors to match your theme
