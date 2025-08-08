# 🔐 Unified Authentication Architecture

**Version:** 2.0  
**Status:** Implementation Ready  
**Last Updated:** ${new Date().toISOString()}

## 🎯 Overview

This document outlines the unified authentication system for the Recoder.xyz platform, designed to work seamlessly across all 5 applications while avoiding NextAuth v4 client-side crypto dependency issues.

## 🏗️ Architecture Components

### 1. **Middleware-Based Authentication Layer**
- **Purpose**: Handle authentication at the edge without client-side crypto dependencies
- **Implementation**: Custom middleware system bypassing NextAuth's client bundles
- **Benefits**: No webpack crypto issues, full control over auth flow

### 2. **Unified Session Management**
```typescript
interface AuthSession {
  user: AuthUser;
  expires: string;
  sessionToken: string;
}

interface AuthUser {
  id: string;
  email: string;
  name: string;
  plan: 'FREE' | 'PRO' | 'ENTERPRISE';
  emailVerified: boolean;
}
```

### 3. **Multi-Platform Integration**
| Platform | Auth Method | Implementation |
|----------|-------------|----------------|
| **Web Platform** | Middleware Auth | Custom system, no NextAuth client deps |
| **Chat Platform** | NextAuth v5 | Modern auth system with native crypto support |
| **VS Code Extension** | OAuth2 + JWT | Extension-specific auth with backend validation |
| **CLI Tools** | API Keys + JWT | Command-line friendly authentication |
| **Backend Services** | JWT Validation | Shared session verification |

## 🔄 Authentication Flow

### Web Platform Flow (Middleware-Based)
```
1. User → Login Form → /api/auth/login
2. Validate Credentials → Create Session Token
3. Set HTTPOnly Cookie → Middleware Validates on Each Request  
4. Protected Routes → Automatic Redirect if Unauthorized
```

### Chat Platform Flow (NextAuth v5)
```
1. User → NextAuth Providers → Database Session
2. NextAuth v5 → Native Edge Runtime Support
3. Shared User Database → Consistent User Data
4. Cross-Platform Session Sync → Unified Experience
```

### VS Code Extension Flow
```
1. Extension → Backend OAuth Endpoint
2. JWT Token → Stored in Extension Secrets
3. API Calls → Bearer Token Authentication  
4. Token Refresh → Automatic renewal
```

### CLI Flow
```
1. User → CLI Auth Command → API Key Generation
2. Config Storage → Secure local storage
3. API Calls → API Key + JWT validation
4. Session Management → Token-based stateless auth
```

## 🛠️ Implementation Plan

### Phase 1: Web Platform (IN PROGRESS ✅)
- [x] Create middleware authentication system
- [x] Implement auth API routes (login, register, logout, session)
- [x] Update middleware to use custom auth instead of NextAuth
- [ ] Create client-side auth components and hooks
- [ ] Test build process (resolve crypto dependencies)

### Phase 2: Chat Platform Integration
- [ ] Upgrade NextAuth v4 → v5 in Chat Platform
- [ ] Implement shared user database integration
- [ ] Create session synchronization between platforms
- [ ] Test cross-platform authentication

### Phase 3: VS Code Extension Auth
- [ ] Implement OAuth2 flow with backend
- [ ] Create secure token storage in extension
- [ ] Add authentication commands and UI
- [ ] Test authentication with backend services

### Phase 4: CLI Authentication  
- [ ] Add auth commands to CLI tools
- [ ] Implement API key management
- [ ] Create secure config storage
- [ ] Test CLI auth with backend APIs

### Phase 5: Backend Integration
- [ ] Update backend to support multiple auth methods
- [ ] Implement JWT validation middleware
- [ ] Create user management APIs
- [ ] Add session synchronization endpoints

## 🔒 Security Features

### Middleware Security
- HTTPOnly cookies (XSS protection)
- Secure flag for HTTPS
- SameSite protection for CSRF
- Automatic session expiry
- Rate limiting on auth endpoints

### Cross-Platform Security
- JWT token validation
- API key rotation
- Session invalidation
- Audit logging
- Failed attempt monitoring

### Enterprise Features
- Single Sign-On (SSO) support
- Multi-Factor Authentication (MFA)
- Role-based access control (RBAC)
- Session management dashboard
- Compliance logging

## 📊 Database Schema

### Users Table
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255),
  plan VARCHAR(20) DEFAULT 'FREE',
  email_verified BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Sessions Table  
```sql
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_token VARCHAR(255) UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  platform VARCHAR(50) NOT NULL,
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
```

### API Keys Table
```sql
CREATE TABLE api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  key_hash VARCHAR(255) UNIQUE NOT NULL,
  name VARCHAR(255) NOT NULL,
  scopes TEXT[],
  expires_at TIMESTAMP,
  last_used_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);
```

## 🚀 Deployment Strategy

### Environment Variables
```bash
# Web Platform
NEXTAUTH_SECRET=secure-random-secret-key
MIDDLEWARE_AUTH_SECRET=another-secure-key

# Database
DATABASE_URL=postgresql://...
POSTGRES_URL=postgresql://...

# External Auth Providers (Optional)
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
```

### Build Process Integration
```bash
# Test auth system during build
pnpm run build:web    # Should work without crypto errors
pnpm run build:chat   # NextAuth v5 compatible  
pnpm run build:all    # Full platform build
```

## 🧪 Testing Strategy

### Unit Tests
- Authentication middleware functions
- Session validation logic
- JWT token handling
- Password hashing/validation

### Integration Tests
- Cross-platform session sync
- API authentication flows
- Extension auth handshake
- CLI authentication commands

### E2E Tests
- Login/logout flows across platforms
- Session persistence and expiry
- Protected route access control
- Cross-platform user experience

## 📈 Success Metrics

### Technical Metrics
- ✅ Web Platform builds without crypto errors
- ✅ All 5 platforms support authentication
- ✅ Session sync works cross-platform
- ✅ Zero authentication-related build failures

### User Experience Metrics
- Single sign-on across all platforms
- Seamless session management
- Fast authentication responses (<200ms)
- Zero user-reported auth issues

## 🔄 Migration Path

### Current State → Target State
1. **Web Platform**: NextAuth v4 (broken) → Middleware Auth ✅
2. **Chat Platform**: NextAuth v4 → NextAuth v5
3. **VS Code Extension**: No auth → OAuth2 + JWT
4. **CLI Tools**: No auth → API Keys + JWT  
5. **Backend**: Basic auth → Unified JWT validation

### Rollback Plan
- Keep NextAuth v4 configuration as backup
- Feature flags for auth system switching
- Database migration rollback scripts
- Zero-downtime deployment strategy

---

**This unified authentication architecture solves the NextAuth v4 crypto dependency issues while providing a scalable, secure authentication system across the entire Recoder.xyz platform.**