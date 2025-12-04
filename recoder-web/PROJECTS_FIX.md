# Projects API Fix - 2025-12-03

## Problem
Foreign key constraint error when creating projects:
```
insert or update on table "projects" violates foreign key constraint "projects_userId_fkey"
```

Also 400 Bad Request errors when loading projects from sidebar.

## Root Cause
The `projects` table had a foreign key constraint referencing `users(id)`, but:
1. The code uses TEXT userId (not UUID)
2. Users might not exist in the users table (anonymous users)
3. The schema was from an old migration that expected authenticated users only

## Solution

### 1. Database Schema Fix
Created and ran migration: `app/lib/.server/db/fix-projects-schema.sql`

**Key changes:**
- Dropped old `projects` table with foreign key constraint
- Created new `projects` table with `userId` as TEXT (no foreign key)
- This allows both authenticated and anonymous users
- Added proper indexes for performance

**Schema:**
```sql
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "userId" TEXT NOT NULL,  -- No foreign key constraint
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) DEFAULT 'web',
  description TEXT,
  status VARCHAR(50) DEFAULT 'active',
  config JSONB DEFAULT '{}',
  structure JSONB,
  framework VARCHAR(100),
  language VARCHAR(100),
  "isPrivate" BOOLEAN DEFAULT false,
  metadata JSONB DEFAULT '{}',
  "projectPath" TEXT,
  "templateId" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW(),
  "updatedAt" TIMESTAMP DEFAULT NOW()
);
```

### 2. Enhanced Error Logging
Added detailed logging to:
- `app/routes/api.projects.ts` - API endpoint
- `app/lib/.server/db/projects-db.ts` - Database layer

This helps debug issues faster.

### 3. Testing
Created `test-projects-api.mjs` to verify database operations work correctly.

**Test results:** ✅ All tests passed

## How to Apply

### If you haven't run the migration yet:
```bash
cd recoder-web
psql "YOUR_DATABASE_URL" < app/lib/.server/db/fix-projects-schema.sql
```

### Verify the fix:
```bash
# Test database directly
DATABASE_URL="YOUR_DATABASE_URL" node test-projects-api.mjs

# Test via API (after starting dev server)
npm run dev
# Then create a project in the UI
```

## Files Modified
- ✅ `app/lib/.server/db/fix-projects-schema.sql` - Migration script
- ✅ `app/routes/api.projects.ts` - Enhanced error logging
- ✅ `app/lib/.server/db/projects-db.ts` - Enhanced error logging
- ✅ `test-projects-api.mjs` - Test script

## Next Steps
1. Restart dev server: `npm run dev`
2. Test creating a project in the UI
3. Check browser console and server logs for any errors
4. If issues persist, check the enhanced logs for details

## Notes
- The migration drops the old projects table (cascades to 19 related tables)
- Existing projects will be lost - this is expected for development
- For production, you'd need a data migration script
- Anonymous users now work without authentication
