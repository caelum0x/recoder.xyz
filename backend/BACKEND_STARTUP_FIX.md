# Backend Server Startup Fix

## Issue Summary
The backend server was hanging during startup when trying to import and register the CLI authentication routes. The server would get stuck and never start listening on port 3001.

## Root Cause
The issue was caused by **ES6/CommonJS module export incompatibility** in two critical files:

### 1. Missing `authenticateToken` Export
**File:** `src/middleware/auth.ts`

The `authenticateToken` middleware was defined as an ES6 export:
```typescript
export const authenticateToken = authenticateUser;
```

However, it was **NOT included** in the CommonJS `module.exports` object at the bottom of the file. When other files tried to `require()` this module and access `authenticateToken`, they received `undefined`, which caused Express to hang when trying to register routes with this middleware.

### 2. CLI Auth Router Export Mismatch
**File:** `src/routes/cli-auth.ts`

The router was only exported using ES6 syntax:
```typescript
export default router;
```

When `server.ts` used `require('./routes/cli-auth')`, it received `{ default: router }` instead of the router directly. This caused `app.use('/api/cli-auth', cliAuthRoutes)` to fail silently and hang.

## Fixes Applied

### Fix 1: Add `authenticateToken` to CommonJS Exports
**File:** `src/middleware/auth.ts` (line 504)

Added `authenticateToken` to the `authExports` object:
```typescript
const authExports = {
  authenticate: authenticateUser,
  authenticateUser,
  authenticateToken: authenticateUser, // ← Added this line
  requireAdmin,
  requireSubscription,
  // ... other exports
};
```

### Fix 2: Add CommonJS Export to CLI Auth Router
**File:** `src/routes/cli-auth.ts` (line 428)

Added CommonJS compatibility:
```typescript
// Export for both ES6 and CommonJS compatibility
export default router;
module.exports = router;  // ← Added this line
```

### Fix 3: Remove Blocking Database Connection (Cleanup)
**File:** `src/database/prisma.ts` (line 334)

Removed the `setTimeout` block that was attempting to connect to the database during module initialization. Prisma will now connect lazily on first query, which is safer and doesn't block startup.

## Testing

After applying the fixes:

```bash
npm run dev
```

Server now starts successfully:
- ✅ All routes load without hanging
- ✅ CLI auth routes registered at `/api/cli-auth`
- ✅ Health endpoint responds: `http://localhost:3001/health`
- ✅ Server status: "degraded" (expected - database is unhealthy without proper DB connection)

### Test CLI Auth Endpoint
```bash
curl -X POST http://localhost:3001/api/cli-auth/authorize \
  -H "Content-Type: application/json" \
  -d '{}'
```

## Prevention

To avoid similar issues in the future:

1. **Use consistent module system**: Either use ES6 modules throughout OR CommonJS, but mixing them requires careful export management
2. **Always export both ways** when mixing module systems:
   ```typescript
   export default myModule;
   module.exports = myModule;
   ```
3. **Include all exports in CommonJS objects**: When using `module.exports = {}`, ensure ALL exported items are included
4. **Test server startup** after adding new routes or middleware
5. **Avoid blocking operations** at module initialization time (use lazy loading instead)

## Related Files Changed

- `src/middleware/auth.ts` - Added `authenticateToken` to CommonJS exports
- `src/routes/cli-auth.ts` - Added `module.exports = router`
- `src/database/prisma.ts` - Removed blocking database connection
- `src/services/redis-cache.ts` - Cleaned up debug logging

## Status: ✅ RESOLVED

The backend server now starts successfully with full CLI authentication support.
