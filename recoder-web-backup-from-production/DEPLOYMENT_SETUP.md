# Deployment Setup Guide

The deployment feature is currently configured but requires API credentials to function. Here's how to set it up:

## Current Status

✅ Deployment UI is fully functional
✅ API endpoints are implemented
✅ File gathering and preparation works
⚠️ Platform API integrations need credentials and implementation

## Quick Setup

### 1. Create `.dev.vars` file in project root

```bash
# For Vercel deployments
VERCEL_TOKEN=your_vercel_token_here

# For Netlify deployments
NETLIFY_TOKEN=your_netlify_token_here

# For Cloudflare Pages deployments
CLOUDFLARE_API_TOKEN=your_cloudflare_token_here
CLOUDFLARE_ACCOUNT_ID=your_account_id_here
```

### 2. Get Your API Tokens

#### Vercel
1. Go to https://vercel.com/account/tokens
2. Click "Create Token"
3. Give it a name (e.g., "Recoder Deployments")
4. Copy the token and add to `.dev.vars`

#### Netlify
1. Go to https://app.netlify.com/user/applications#personal-access-tokens
2. Click "New access token"
3. Give it a description
4. Copy the token and add to `.dev.vars`

#### Cloudflare Pages
1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click "Create Token"
3. Use the "Edit Cloudflare Workers" template
4. Copy the token
5. Get your Account ID from the Cloudflare dashboard
6. Add both to `.dev.vars`

## Implementation Status

### What's Working Now
- ✅ Deployment UI with platform selection
- ✅ Configuration form for deployment settings
- ✅ File collection from workbench
- ✅ API endpoint routing
- ✅ Deployment status tracking
- ✅ Error handling with helpful messages

### What Needs Implementation

The actual platform API integrations are marked with TODO comments. Each deployment function needs:

#### For Vercel (`deployToVercel`)
```typescript
// TODO: Implement in app/lib/.server/deployment/deployment-manager.ts
// Use Vercel's API: https://vercel.com/docs/rest-api/endpoints/deployments
// Steps:
// 1. Create deployment via API
// 2. Upload files
// 3. Trigger build
// 4. Poll for status
// 5. Return deployment URL
```

#### For Netlify (`deployToNetlify`)
```typescript
// TODO: Implement in app/lib/.server/deployment/deployment-manager.ts
// Use Netlify's API: https://docs.netlify.com/api/get-started/
// Steps:
// 1. Create new site
// 2. Upload files via ZIP
// 3. Trigger deploy
// 4. Wait for build
// 5. Return site URL
```

#### For Cloudflare Pages (`deployToCloudflare`)
```typescript
// TODO: Implement in app/lib/.server/deployment/deployment-manager.ts
// Use CF Pages API: https://developers.cloudflare.com/api/operations/pages-project-create-project
// Steps:
// 1. Create Pages project
// 2. Create deployment
// 3. Upload files
// 4. Wait for build
// 5. Return pages.dev URL
```

## Alternative: Use CLI Tools

While API integration is being implemented, users can deploy manually using CLI tools:

### Vercel CLI
```bash
npm i -g vercel
vercel deploy
```

### Netlify CLI
```bash
npm i -g netlify-cli
netlify deploy
```

### Wrangler (Cloudflare)
```bash
npm i -g wrangler
wrangler pages deploy
```

## Error Messages

The deployment system now provides clear error messages:

- **Missing Credentials**: Tells you exactly which token to add and where to get it
- **Not Implemented**: Provides steps to either:
  - Add credentials and implement API integration
  - Use CLI tools as an alternative

## Next Steps for Full Implementation

1. **Choose a platform** to implement first (recommend Vercel as it's most popular)

2. **Install platform SDK**:
   ```bash
   npm install @vercel/client
   # or
   npm install netlify
   # or
   npm install @cloudflare/workers-types
   ```

3. **Implement the deployment function** in:
   `app/lib/.server/deployment/deployment-manager.ts`

4. **Test with real credentials** in `.dev.vars`

5. **Handle edge cases**:
   - Large file uploads
   - Build timeouts
   - Failed deployments
   - Retry logic

## Testing Without Real Deployments

For testing the UI and flow without actual deployments:

1. Comment out the `throw new Error(...)` lines in deployment functions
2. Uncomment the simulation code:
   ```typescript
   await new Promise(resolve => setTimeout(resolve, 3000));
   return `https://${projectName}.vercel.app`;
   ```
3. This will simulate a 3-second deployment

## Security Notes

- ⚠️ Never commit `.dev.vars` to git (it's in `.gitignore`)
- ⚠️ API tokens have full access - treat them like passwords
- ⚠️ Consider using environment-specific tokens (dev vs prod)
- ⚠️ Rotate tokens periodically for security

## Files Modified

- `app/lib/.server/deployment/deployment-manager.ts` - Added helpful error messages
- `app/components/deployment/DeploymentManager.tsx` - Already functional
- `app/routes/api.deployments.ts` - Already functional

## Support

If you need help implementing any of these integrations, check:
- Vercel API Docs: https://vercel.com/docs/rest-api
- Netlify API Docs: https://docs.netlify.com/api/get-started/
- Cloudflare API Docs: https://developers.cloudflare.com/api/

---

**Status**: Infrastructure ready, API integrations need credentials + implementation
**Estimated Time**: 2-4 hours per platform to implement fully
