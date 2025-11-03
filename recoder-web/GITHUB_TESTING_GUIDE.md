# Testing Guide - GitHub Integration

## Quick Start Testing

### 1. Start Dev Server
```bash
npm run dev
```

### 2. Test Template Browsing
- Click "Browse Templates" button
- Should see 25+ templates
- Try filtering by category
- Try searching for "blog"
- Click a template to clone it

### 3. Test Custom Repository Import
- Click "Import Repository"
- Enter: `https://github.com/vercel/next.js`
- Click "Analyze" to see repo info
- Optional: Enter sub-path like `examples/blog-starter`
- Click "Import Repository"
- Wait 5-15 seconds
- Files should load in workspace

### 4. Test URL Formats
All these should work:
- `https://github.com/facebook/react`
- `github.com/facebook/react`
- `facebook/react`
- `facebook/react/tree/main`

### 5. Check Console (F12)
Should NOT see errors.
Network tab should show 200 status for `/api/github` requests.

## Common Issues

**Templates don't load**: Check `npm run typecheck` for errors
**Clone fails**: Check if repo is public and GitHub API is up
**Slow performance**: Normal for 50+ files, limited to avoid rate limits

## Success Criteria
- [x] Templates load
- [x] Filtering works
- [x] Search works
- [x] Custom import works
- [x] Files appear in editor
- [x] No console errors

See `GITHUB_INTEGRATION_COMPLETE.md` for full documentation.
