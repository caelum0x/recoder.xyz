// Let's understand what Better Auth expects
console.log(`
Better Auth expects these models with camelCase fields:

model user {
  id            String
  email         String
  emailVerified Boolean
  name          String
  createdAt     DateTime
  updatedAt     DateTime
  image         String?
}

model session {
  id        String
  expiresAt DateTime
  token     String
  createdAt DateTime
  updatedAt DateTime
  ipAddress String?
  userAgent String?
  userId    String
}

model account {
  id                    String
  accountId             String
  providerId            String
  userId                String
  accessToken           String?
  refreshToken          String?
  idToken               String?
  accessTokenExpiresAt  DateTime?
  refreshTokenExpiresAt DateTime?
  scope                 String?
  password              String?
  createdAt             DateTime
  updatedAt             DateTime
}

Our database has snake_case columns (user_id, account_id, etc.)
Our Prisma schema uses @map to bridge this (userId maps to user_id)
Better Auth's Prisma adapter queries the DB directly and doesn't respect @map

Solution: Our custom adapter uses Prisma's ORM which DOES respect @map!
`);
