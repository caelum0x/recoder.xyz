# TypeScript Error Fix Plan - 421 Errors Across 58 Files

## Summary
- FFmpeg is now installed ✅
- Build time: 3+ minutes (needs optimization)
- Current approach: Fix high-priority errors first, then batch fix similar patterns

## Priority 1: Core Infrastructure (15 errors)
1. **lib/database.ts** (1 error) - null check
2. **lib/auth/jwt.ts** (1 error) - JWT options 
3. **lib/database/client.ts** (14 errors) - crypto and type issues

## Priority 2: API Route Types (50+ errors)
- `.next/types/` errors - Next.js type generation issues
- Route parameter type mismatches
- Missing exports in API routes

## Priority 3: Integration Errors (150+ errors)
- **app/api/integrations/google/route.ts** (46 errors) - OAuth client types
- **app/api/integrations/sendgrid/route.ts** (42 errors) - API response types
- **app/api/integrations/auth0/route.ts** (26 errors) - Management client types

## Priority 4: Marketing Module (100+ errors)
- Promise type mismatches
- Array type conflicts
- Missing async/await handling

## Priority 5: Component Errors (15+ errors)
- Missing props
- Type mismatches
- React component issues

## Error Patterns to Fix in Batches:
1. **Null/undefined checks** - Add proper null checks
2. **Promise types** - Fix async/await type mismatches  
3. **Array types** - Fix array type conflicts
4. **Optional properties** - Add proper optional chaining
5. **API response types** - Standardize response interfaces

## Quick Wins (Can fix ~100 errors quickly):
- Add null checks: `?.` operator
- Fix string|null to string: `|| ''`
- Fix Promise types: proper async/await
- Add missing interface properties
