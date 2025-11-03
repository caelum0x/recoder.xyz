# JSX Runtime Error - Root Cause Analysis

## The Error
```
TypeError: __vite_ssr_import_3__.jsxDEV is not a function
```

## Root Cause

The issue occurs because of a mismatch between how Vite transforms JSX and how React's JSX runtime is packaged:

### What's Happening:

1. **Vite transforms JSX** to use the automatic JSX runtime:
   - Converts `<Component />` to `import { jsxDEV } from 'react/jsx-dev-runtime'`

2. **React's jsx-dev-runtime.js is CommonJS**:
   ```javascript
   // node_modules/react/jsx-dev-runtime.js
   'use strict';
   if (process.env.NODE_ENV === 'production') {
     module.exports = require('./cjs/react-jsx-dev-runtime.production.min.js');
   } else {
     module.exports = require('./cjs/react-jsx-dev-runtime.development.js');
   }
   ```

3. **Vite SSR treats it as ESM**:
   - Vite's SSR tries to import the file as ES modules
   - CommonJS `module.exports` and `require()` don't exist in ESM context
   - Result: `module is not defined` or `jsxDEV is not a function`

## Why This Happens

Vite has two modes:
- **Client-side**: Can properly handle CommonJS → ESM transformation
- **SSR (Server-side)**: Has issues with React's CommonJS JSX runtime

When React is externalized for SSR (which is correct for Node.js), Vite still tries to transform the JSX runtime imports, but Node.js can't load the CommonJS file through Vite's ESM transformation layer.

## Current Vite Config Status

```typescript
esbuild: {
  jsx: 'automatic',  // Tells esbuild to use automatic JSX transform
  jsxImportSource: 'react',  // Import from react
},
ssr: {
  external: ['react', 'react-dom'],  // Externalize for Node.js
  noExternal: ['remix-island'],
},
```

## The Problem

Even with `external: ['react', 'react-dom']`, Vite still transforms:
- `<Component />` → `import { jsxDEV } from 'react/jsx-dev-runtime'`

But when Node.js tries to load `react/jsx-dev-runtime`, it gets the CommonJS file which uses `module.exports`.

## Possible Solutions

### Solution 1: Use Vite Plugin to Transform JSX Runtime (COMPLEX)
Create a Vite plugin that intercepts `react/jsx-dev-runtime` and transforms it to ESM.

### Solution 2: Use React 17 JSX Transform (BACKWARDS)
Revert to classic JSX transform, but this defeats the purpose of automatic runtime.

### Solution 3: Force Node.js ESM Mode (RISKY)
This could break other parts of the application.

### Solution 4: Patch React Package (HACKY)
Create ESM wrappers for jsx-dev-runtime.js.

### Solution 5: Update Remix/Vite Configuration (RECOMMENDED)
This is likely a known issue with Remix + Vite + Cloudflare Workers setup.

## Investigation Needed

1. **Check if this is a known Remix + Vite issue**
   - Search Remix GitHub issues
   - Check Remix Vite plugin documentation

2. **Check Remix Vite plugin version**
   - Current: `@remix-run/dev@2.17.1`
   - Latest might have fixes

3. **Check if Cloudflare Workers affects this**
   - The cloudflare-proxy-plugin might be causing issues
   - Try disabling it temporarily

4. **Check other Remix + Vite projects**
   - See how they handle this
   - Look at official Remix templates

## Testing Commands

```bash
# Test if React can be imported in Node.js
node -e "const React = require('react'); console.log(React.version)"

# Test jsx-dev-runtime
node -e "const jsx = require('react/jsx-dev-runtime'); console.log(jsx)"

# Check if ESM import works
node --input-type=module -e "import('react').then(r => console.log(r.version))"
```

## Next Steps

1. Try updating Remix to latest version
2. Check Remix Vite plugin options
3. Look for similar issues in Remix/Vite repositories
4. Consider if the issue is specific to Cloudflare Workers environment

## Files Modified in Attempted Fixes

- `vite.config.ts` - Multiple attempts to configure esbuild, ssr, optimizeDeps
- All attempts failed because the root issue is architectural

## Recommendation

This appears to be an environmental/configuration issue with the Remix + Vite + Cloudflare Workers stack rather than a simple configuration fix. The proper solution likely requires:

1. Updating to latest Remix/Vite versions
2. Or using a known working configuration from official templates
3. Or waiting for Remix team to fully support Vite SSR + Cloudflare Workers

For now, the **production build works fine** because it uses a different transformation pipeline that properly handles React's CommonJS JSX runtime.
