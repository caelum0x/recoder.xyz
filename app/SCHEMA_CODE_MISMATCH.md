# Schema-Code Mismatch Analysis

## Summary

The app folder has **652 TypeScript errors** (down from 740 after initial fixes). The root cause is a **significant mismatch** between the Prisma schema and the code expectations.

## What Was Fixed

✅ **Installed missing dependencies:**
- `@testing-library/react`
- `@types/jest`
- `@testing-library/jest-dom`

✅ **Regenerated Prisma Client**

✅ **Fixed model naming conventions:**
- `prisma.cliDeviceCode` → `prisma.deviceCode` (10 instances)
- `prisma.auditLog` → `prisma.audit_logs` (59 instances)
- `prisma.usageRecord` → `prisma.usage_records` (47 instances)
- `prisma.usersQuota` → `prisma.user_quota` (7 instances)
- `prisma.subscription` → `prisma.subscriptions`
- `prisma.project` → `prisma.projects`

✅ **Fixed field naming:**
- `.expiryMonth` → `.expMonth`
- `.expiryYear` → `.expYear`

## Remaining Issues (615 non-test errors)

### 1. **Users Model Mismatch**

**Schema has:**
```prisma
model users {
  subscription  String  @default("free")  // Just a string field
  // No subscriptionPlan, subscriptionStatus, subscriptionId
  // No subscriptionEndDate, plan, quota relation
}
```

**Code expects:**
- `user.subscriptionPlan`
- `user.subscriptionStatus`
- `user.subscriptionId`
- `user.subscriptionEndDate`
- `user.plan`
- `user.quota` (relation to user_quota)
- `user.usageRecords` (relation)

### 2. **Usage Records Model Mismatch**

**Schema has:**
```prisma
model usage_records {
  tokens   Int?    // Not tokensUsed
  type     String  // Not requestType
  // No model field, no platform field
}
```

**Code expects:**
- `tokensUsed` field
- `requestType` field
- `model` field (AI model name)
- `platform` field
- `isPriceyModel` field

### 3. **DeviceCode Model Issues**

**Schema requires:**
```prisma
model DeviceCode {
  id         String  @id       // Required
  clientId   String            // Required
  deviceCode String  @unique
  userCode   String  @unique
  // ...
}
```

**Code provides:**
```typescript
prisma.deviceCode.create({
  data: {
    deviceCode,
    userCode,
    status,
    // Missing: id, clientId
  }
})
```

### 4. **Audit Logs Model Mismatch**

**Issue:** The code passes `userId` but the schema may not accept it in the current structure, causing type errors.

### 5. **Missing Models**

Code references these models that may not exist:
- `prisma.platformApiKey`

### 6. **Missing Variables**

- `PRODUCTION_ENGINE_URL` not defined
- `session` variable not defined in some routes

### 7. **Include/Select Mismatches**

Code uses:
- `include: { apiKeys: true }` → should be `api_keys`
- `select: { onboardingStep: true }` → field doesn't exist
- `select: { preferredModels: true }` → field doesn't exist

## Resolution Options

### Option 1: Update Schema to Match Code (Recommended)

Add missing fields and relations to the Prisma schema:

```prisma
model users {
  // Add these fields
  subscriptionPlan      String?
  subscriptionStatus    String?
  subscriptionId        String?
  subscriptionEndDate   DateTime?
  plan                  String?
  onboardingStep        String?
  preferredModels       Json?

  // Add these relations
  quota                 user_quota?
  usageRecords          usage_records[]
}

model usage_records {
  // Rename/add fields
  tokensUsed  Int?     // rename from tokens or add both
  requestType String?  // rename from type or add both
  model       String?  // add
  platform    String?  // add
}

model DeviceCode {
  // Make these optional or provide defaults
  id         String  @id @default(cuid())
  clientId   String  @default("recoder-cli")
}

model platform_api_keys {
  // Create this new model
  id          String   @id @default(cuid())
  userId      String
  provider    String
  keyValue    String
  createdAt   DateTime @default(now())
  // ...
}
```

### Option 2: Update Code to Match Schema

This would require rewriting significant portions of:
- All service files (`lib/services/*.service.ts`)
- All API routes (`app/api/**/*.ts`)
- Type definitions and interfaces

**Estimated effort:** 3-4 hours of careful refactoring

### Option 3: Hybrid Approach

1. Fix critical schema issues (required fields, missing models)
2. Update code for non-breaking changes
3. Add backwards compatibility where needed

## Recommended Next Steps

1. **Review the schema**: Decide which fields/relations should exist
2. **Update schema**: Add missing fields that the business logic needs
3. **Run migrations**: `npx prisma migrate dev`
4. **Regenerate client**: `npx prisma generate`
5. **Fix remaining errors**: Address any lingering type issues

## Files Most Affected

The following files have the most errors and would benefit from attention:

1. `lib/services/auth.service.ts` (47 errors)
2. `lib/services/user.service.ts` (46 errors)
3. `lib/services/billing.service.ts` (26 errors)
4. `lib/services/cli-auth.service.ts` (26 errors)
5. `lib/usage-service.ts` (37 errors)
6. `app/api/dashboard/overview/route.ts` (13 errors)
7. `app/api/webhooks/dodo/route.ts` (13 errors)
8. `app/api/webhooks/paddle/route.ts` (13 errors)

## Error Breakdown

- **Total errors**: 652
- **Test-related**: 37 (testing library imports - mostly fixed)
- **Schema mismatches**: ~615
  - Field name mismatches: ~150
  - Missing fields: ~300
  - Type incompatibilities: ~165

---

*Generated: November 24, 2025*
