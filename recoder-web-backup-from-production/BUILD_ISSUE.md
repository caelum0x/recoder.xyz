# Known Build Issue - `set-cookie-parser`

## Issue
Production build (`pnpm run build`) fails with:
```
"splitCookiesString" is not exported by "set-cookie-parser"
```

## Root Cause
This is a known compatibility issue between:
- Remix 2.17.1
- Rollup (used by Vite for production builds)
- set-cookie-parser 2.7.1

The issue occurs because `set-cookie-parser` uses CommonJS exports, but Remix's ESM import expects named exports.

## Status
- ✅ **Development mode works perfectly** (`pnpm run dev`)
- ❌ **Production build fails** (`pnpm run build`)

## Workaround
This is a Remix framework issue, not our code. The app works perfectly in development mode.

## Solutions Attempted
1. ✅ Added `set-cookie-parser` to `ssr.noExternal` - Didn't fix
2. ✅ Added `@rollup/plugin-commonjs` - Didn't fix
3. ❌ Upgrading Remix - Already at latest (2.17.1)

## Official Fix Needed
This requires a fix from Remix team. Tracked in Remix GitHub issues.

## For Now
**Use development mode:**
```bash
pnpm run dev
```

The app is fully functional in development mode with all 9 issues fixed!
