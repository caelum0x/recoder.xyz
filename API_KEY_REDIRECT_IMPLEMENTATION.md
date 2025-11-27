# API Key Redirect Flow Implementation

## Overview
Implemented seamless redirect flow that automatically sends users to the Web IDE after they add their first API key. This eliminates the need for users to manually navigate back and click "Launch Web IDE" again.

---

## User Journey (Before Fix)

1. User clicks "Launch Web IDE" button
2. System detects no API key → shows modal
3. User clicks "Add API Key Now" → goes to `/settings/ai-providers`
4. User adds API key → sees success message
5. **❌ User has to manually go back to dashboard**
6. **❌ User has to click "Launch Web IDE" button again**
7. Finally launches Web IDE

**Problem:** Too many steps, poor UX, confusing for new users

---

## User Journey (After Fix)

1. User clicks "Launch Web IDE" button
2. System detects no API key → shows modal
3. User clicks "Add API Key Now" → goes to `/settings/ai-providers?redirect=web-ide`
4. User adds API key → sees success message
5. **✅ Automatically redirected to Web IDE after 1.5 seconds**
6. Web IDE opens immediately

**Result:** Seamless onboarding, 2 fewer steps, professional UX

---

## Implementation Details

### Files Modified

#### 1. `/app/app/components/LaunchWebIDEButton.tsx`

**Change:** Added `?redirect=web-ide` query parameter to the API providers link

```typescript
// Before:
<Link href="/settings/ai-providers" ...>
  Add API Key Now
</Link>

// After:
<Link href="/settings/ai-providers?redirect=web-ide" ...>
  Add API Key Now
</Link>
```

**Location:** Line 117

---

#### 2. `/app/app/dashboard/page.tsx`

**Change:** Added same redirect parameter to dashboard modal's API key link

```typescript
// Before:
<Link href="/settings/ai-providers" ...>
  Add My First API Key
</Link>

// After:
<Link href="/settings/ai-providers?redirect=web-ide" ...>
  Add My First API Key
</Link>
```

**Why:** Dashboard also has an API key modal that should redirect to Web IDE

---

#### 3. `/app/app/settings/ai-providers/page.tsx`

**Changes:**
1. Added `useSearchParams` import
2. Added redirect detection logic
3. Added automatic redirect after successful API key addition
4. Enhanced success message with loading spinner

**Code:**
```typescript
// 1. Import useSearchParams
import { useSearchParams } from 'next/navigation';

// 2. Detect redirect parameter
const searchParams = useSearchParams();
const redirectToWebIDE = searchParams.get('redirect') === 'web-ide';

// 3. After successful API key addition
if (response.ok && data.success) {
  // Show appropriate success message
  if (redirectToWebIDE) {
    setSuccess('API key added successfully! Redirecting to Web IDE...');
  } else {
    setSuccess(data.message);
  }

  // ... existing code ...

  // If user came from "Launch Web IDE" flow, redirect them
  if (redirectToWebIDE) {
    setTimeout(() => {
      const webIdeUrl = process.env.NEXT_PUBLIC_RECODER_WEB_URL ||
        (process.env.NODE_ENV === 'production'
          ? 'https://web.recoder.xyz'
          : 'http://localhost:5173');
      window.location.href = webIdeUrl;
    }, 1500); // 1.5 second delay to show success message
  }
}

// 4. Enhanced success message display
{success && (
  <div className="mb-6 p-4 bg-green-500/10 border border-green-500/20 rounded-lg text-green-400 flex items-center gap-2">
    <CheckCircle2 className="w-5 h-5" />
    <span>{success}</span>
    {redirectToWebIDE && success.includes('Redirecting') && (
      <Loader2 className="w-5 h-5 animate-spin ml-2" />
    )}
  </div>
)}
```

---

## How It Works

### Flow Diagram

```
User clicks "Launch Web IDE"
    ↓
Has API key?
    ├─ YES → Launch Web IDE directly ✅
    └─ NO → Show "Add API Key" modal
              ↓
         User clicks "Add API Key Now"
              ↓
         Navigate to /settings/ai-providers?redirect=web-ide
              ↓
         User selects provider & adds API key
              ↓
         API key saved successfully
              ↓
         Show success message: "API key added successfully! Redirecting to Web IDE..."
              ↓
         Wait 1.5 seconds (user sees success)
              ↓
         Redirect to Web IDE automatically ✅
```

### Technical Flow

1. **Detection**: Page checks `searchParams.get('redirect') === 'web-ide'`
2. **Success Message**: If redirect=true, shows "Redirecting..." message with spinner
3. **Delay**: 1.5 second setTimeout to let user see success confirmation
4. **Redirect**: Uses `window.location.href` to navigate to Web IDE
5. **URL Resolution**:
   - Development: `http://localhost:5173`
   - Production: `https://web.recoder.xyz`
   - Configurable via `NEXT_PUBLIC_RECODER_WEB_URL` env var

---

## Environment Variables

The redirect uses the following environment variable priority:

```bash
# 1. Primary (if set)
NEXT_PUBLIC_RECODER_WEB_URL=https://web.recoder.xyz

# 2. Fallback based on NODE_ENV
# - Production: https://web.recoder.xyz
# - Development: http://localhost:5173
```

**Recommendation:** Set `NEXT_PUBLIC_RECODER_WEB_URL` in production `.env`

---

## Testing Guide

### Test Case 1: Normal API Key Flow (Without Redirect)

**Steps:**
1. Go to `/settings/ai-providers` directly (no query params)
2. Add an API key
3. Should see success message: "API key added successfully"
4. **Should NOT redirect** - stays on settings page

**Expected:** No redirect, normal behavior

---

### Test Case 2: Launch Web IDE Flow (With Redirect)

**Steps:**
1. Sign in to dashboard
2. Click "Launch Web IDE" button
3. Modal appears: "API Key Required"
4. Click "Add API Key Now"
5. URL should be `/settings/ai-providers?redirect=web-ide`
6. Select provider (e.g., OpenRouter)
7. Enter valid API key
8. Click "Add Key"
9. Should see: "API key added successfully! Redirecting to Web IDE..."
10. Should see loading spinner
11. After 1.5 seconds, automatically redirected to `http://localhost:5173` (or production URL)

**Expected:** Seamless redirect to Web IDE

---

### Test Case 3: Dashboard Modal Flow

**Steps:**
1. Go to `/dashboard` without API key
2. Click "Launch Web IDE" from hero section
3. Modal appears
4. Click "Add My First API Key"
5. Follow same steps as Test Case 2

**Expected:** Same seamless redirect

---

## UX Improvements

### Visual Feedback

1. **Success Message**: Clear "Redirecting to Web IDE..." text
2. **Loading Spinner**: Animated spinner appears during redirect
3. **Timing**: 1.5 second delay lets user see success before redirect
4. **Color Coding**: Green success banner stands out

### User Benefits

- **Fewer Clicks**: Saves 2 clicks (back to dashboard + launch IDE)
- **Less Confusion**: No need to remember what they were doing
- **Professional**: Feels polished and well-designed
- **Onboarding**: New users have smooth first experience
- **Contextual**: Only redirects when coming from "Launch" flow

---

## Edge Cases Handled

1. **Multiple API Keys**: Works even if user already has keys
2. **Error Handling**: If API key fails to save, no redirect happens
3. **Manual Navigation**: Users who go to settings directly won't be redirected
4. **Environment Detection**: Works in both dev and production
5. **URL Configuration**: Respects environment variables

---

## Future Enhancements

Possible improvements for later:

1. **Return URL Parameter**: Support returning to any page, not just Web IDE
   ```typescript
   ?redirect=<encoded-return-url>
   ```

2. **Skip Redirect Button**: Add "Stay Here" button during countdown
   ```tsx
   <button onClick={() => clearTimeout(redirectTimer)}>
     Stay on this page
   </button>
   ```

3. **Analytics**: Track how many users complete this flow
   ```typescript
   analytics.track('api_key_redirect_completed', {
     provider: selectedProvider,
     destination: 'web-ide'
   });
   ```

4. **Progressive Enhancement**: Use Next.js router for same-domain redirects
   ```typescript
   if (webIdeUrl.includes(window.location.hostname)) {
     router.push(webIdeUrl);
   } else {
     window.location.href = webIdeUrl;
   }
   ```

---

## Related Issues

This implementation fixes:
- ✅ Issue #4 from errors.md: "when we say launch ide it asks for api key thats okey but after that is succeful it should route us to recoder-web"
- ✅ Improves onboarding flow significantly
- ✅ Reduces user friction during first-time setup

---

## Status

**Implementation:** ✅ COMPLETE
**Testing:** ⚠️ PENDING (awaiting user testing)
**Documentation:** ✅ COMPLETE

---

## Quick Reference

**Query Parameter:** `?redirect=web-ide`

**Entry Points:**
- `/app/app/components/LaunchWebIDEButton.tsx:117`
- `/app/app/dashboard/page.tsx` (API key modal)

**Redirect Logic:**
- `/app/app/settings/ai-providers/page.tsx:109-131`

**Timing:** 1.5 seconds after successful key addition

**Environment Variable:** `NEXT_PUBLIC_RECODER_WEB_URL`

---

Now users have a seamless path from "Launch Web IDE" → "Add API Key" → **Automatically in Web IDE** 🚀
