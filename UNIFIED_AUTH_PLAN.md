# 🔐 Unified Authentication Architecture Plan
## Phase 3.1: Cross-Platform Authentication & Security

> **Objective**: Create a seamless, secure authentication system across Recoder Web, CLI, VS Code Extension, and Code Router with enterprise-grade security.

---

## 🎯 Current State Analysis

### ✅ **Strengths**
- **Unified Backend**: Single JWT-based auth service with comprehensive user management
- **Cross-Platform Sync**: Real-time session synchronization across platforms
- **Strong Security**: bcrypt passwords, JWT tokens, proper validation
- **Platform Adaptation**: NextAuth for web, file-based for CLI, extension storage

### ⚠️ **Gaps & Security Concerns**
- **Inconsistent Auth Flows**: Different mechanisms across platforms
- **Token Management**: No unified API key system for all platforms
- **Device Flow Missing**: Headless environments lack proper OAuth
- **Session Security**: No MFA, limited session monitoring
- **API Security**: Missing rate limiting and advanced threat detection

---

## 🏗️ Unified Architecture Design

### **Core Authentication Service**
```typescript
interface UnifiedAuthService {
  // Multi-platform authentication
  authenticateWeb(provider: 'github' | 'google'): Promise<WebSession>
  authenticateCLI(method: 'oauth' | 'device' | 'token'): Promise<CLISession>
  authenticateExtension(method: 'oauth' | 'device'): Promise<ExtensionSession>
  authenticateRouter(apiKey: string): Promise<RouterSession>
  
  // Unified session management
  syncSessions(userId: string): Promise<CrossPlatformSession>
  invalidateAllSessions(userId: string): Promise<void>
  refreshSession(platform: Platform, refreshToken: string): Promise<Session>
  
  // Security & monitoring
  validateRequest(request: AuthRequest): Promise<ValidationResult>
  trackActivity(userId: string, action: AuthAction): Promise<void>
  detectThreats(session: Session): Promise<ThreatAnalysis>
}
```

### **Security Architecture**

#### **1. Multi-Layer Token System**
```typescript
interface TokenHierarchy {
  // Short-lived access tokens (15 minutes)
  accessToken: JWT & {
    scope: string[]           // Fine-grained permissions
    platform: Platform       // Origin platform
    deviceId?: string        // Device identification
    restrictions?: string[]   // Usage limitations
  }
  
  // Medium-lived refresh tokens (7 days)
  refreshToken: JWT & {
    rotationPolicy: 'always' | 'conditional'
    maxUses: number
    linkedDevices: string[]
  }
  
  // Long-lived API keys (user-controlled)
  apiKey: {
    keyId: string            // Unique identifier
    hashedKey: string        // Secure storage
    scopes: string[]         // Permissions
    lastUsed: Date          // Usage tracking
    expiresAt?: Date        // Optional expiry
    restrictions: {
      ipWhitelist?: string[]
      rateLimit: number
      platforms: Platform[]
    }
  }
  
  // Device-specific tokens (30 days)
  deviceToken: JWT & {
    deviceFingerprint: string
    trustLevel: 'trusted' | 'unverified'
    capabilities: string[]
  }
}
```

#### **2. Multi-Factor Authentication**
```typescript
interface MFASystem {
  // TOTP (Time-based One-Time Password)
  setupTOTP(userId: string): Promise<TOTPSetup>
  verifyTOTP(userId: string, code: string): Promise<boolean>
  
  // Hardware Security Keys (FIDO2/WebAuthn)
  registerSecurityKey(userId: string): Promise<SecurityKeyRegistration>
  verifySecurityKey(userId: string, assertion: string): Promise<boolean>
  
  // SMS/Email backup codes
  generateBackupCodes(userId: string): Promise<string[]>
  verifyBackupCode(userId: string, code: string): Promise<boolean>
  
  // Risk-based authentication
  assessRisk(userId: string, context: AuthContext): Promise<RiskLevel>
  requireMFA(riskLevel: RiskLevel): boolean
}
```

#### **3. Device Flow for Headless Environments**
```typescript
interface DeviceFlowAuth {
  // OAuth 2.0 Device Authorization Grant
  initiateDeviceFlow(): Promise<{
    deviceCode: string      // For device polling
    userCode: string       // For user entry
    verificationUri: string // Where user goes
    verificationUriComplete: string // Direct link
    expiresIn: number      // Code lifetime
    interval: number       // Polling interval
  }>
  
  // Poll for authorization
  pollDeviceAuthorization(deviceCode: string): Promise<{
    status: 'pending' | 'authorized' | 'denied' | 'expired'
    accessToken?: string
    refreshToken?: string
  }>
  
  // Verify user code on web
  verifyUserCode(userCode: string): Promise<DeviceAuthRequest>
  authorizeDevice(userId: string, userCode: string): Promise<void>
}
```

---

## 🚀 Implementation Roadmap

### **Phase 3.1a: Backend Security Infrastructure** (Week 1-2)

#### **Enhanced Authentication Service**
```typescript
// /Users/arhansubasi/recoder.xyz/backend/src/services/unified-auth.js
class UnifiedAuthService {
  constructor() {
    this.tokenManager = new TokenManager()
    this.mfaService = new MFAService()
    this.deviceFlow = new DeviceFlowService()
    this.threatDetection = new ThreatDetectionService()
  }
  
  async authenticateRequest(req) {
    // Multi-layer validation
    const tokenValidation = await this.validateToken(req.headers.authorization)
    const riskAssessment = await this.assessRisk(req)
    const deviceValidation = await this.validateDevice(req)
    
    return {
      authenticated: tokenValidation.valid && riskAssessment.allowed,
      user: tokenValidation.user,
      session: tokenValidation.session,
      riskLevel: riskAssessment.level,
      requiresMFA: riskAssessment.requiresMFA
    }
  }
}
```

#### **API Key Management System**
```typescript
// /Users/arhansubasi/recoder.xyz/backend/src/services/api-key-manager.js
class APIKeyManager {
  async generateAPIKey(userId, options = {}) {
    const keyId = generateUniqueId()
    const apiKey = generateSecureKey(64) // 64-character secure key
    const hashedKey = await bcrypt.hash(apiKey, 12)
    
    await this.db.apiKeys.create({
      userId,
      keyId,
      hashedKey,
      scopes: options.scopes || ['basic'],
      restrictions: options.restrictions || {},
      createdAt: new Date(),
      expiresAt: options.expiresAt,
      lastUsed: null
    })
    
    return { keyId, apiKey: `rcd_${keyId}_${apiKey}` }
  }
  
  async validateAPIKey(apiKey) {
    const [prefix, keyId, key] = apiKey.split('_')
    if (prefix !== 'rcd') throw new Error('Invalid API key format')
    
    const storedKey = await this.db.apiKeys.findOne({ keyId, active: true })
    if (!storedKey) throw new Error('Invalid API key')
    
    const isValid = await bcrypt.compare(key, storedKey.hashedKey)
    if (!isValid) throw new Error('Invalid API key')
    
    // Update last used
    await this.db.apiKeys.update(keyId, { lastUsed: new Date() })
    
    return {
      valid: true,
      userId: storedKey.userId,
      scopes: storedKey.scopes,
      restrictions: storedKey.restrictions
    }
  }
}
```

### **Phase 3.1b: Web Platform Integration** (Week 2-3)

#### **Enhanced NextAuth Configuration**
```typescript
// /Users/arhansubasi/recoder.xyz/recoder-web/lib/auth.ts
export const authOptions: NextAuthOptions = {
  providers: [
    GitHubProvider({
      clientId: process.env.GITHUB_CLIENT_ID!,
      clientSecret: process.env.GITHUB_CLIENT_SECRET!,
      authorization: {
        params: {
          scope: 'read:user user:email'
        }
      }
    }),
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID!,
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    }),
    // Add device flow provider for CLI/Extension
    {
      id: 'device-flow',
      name: 'Device Authorization',
      type: 'oauth',
      authorization: {
        url: '/api/auth/device/authorize',
        params: { response_type: 'device_code' }
      },
      token: '/api/auth/device/token',
      userinfo: '/api/auth/device/userinfo'
    }
  ],
  callbacks: {
    async jwt({ token, user, account }) {
      if (account) {
        // Generate unified session token
        const unifiedToken = await generateUnifiedToken(user.id, 'web')
        token.unifiedSession = unifiedToken
        token.platform = 'web'
        
        // Sync with backend
        await syncSessionWithBackend(token.unifiedSession)
      }
      return token
    },
    async session({ session, token }) {
      // Include platform info and unified session
      session.platform = token.platform
      session.unifiedSession = token.unifiedSession
      
      // Check for cross-platform sessions
      const crossPlatformSessions = await getCrossPlatformSessions(session.user.id)
      session.activePlatforms = crossPlatformSessions.platforms
      
      return session
    }
  },
  events: {
    async signIn({ user, account, profile, isNewUser }) {
      // Track authentication event
      await trackAuthEvent('web_signin', user.id, {
        provider: account?.provider,
        isNewUser,
        userAgent: req.headers['user-agent'],
        ip: getClientIP(req)
      })
    },
    async signOut({ session, token }) {
      // Invalidate unified session
      await invalidateUnifiedSession(token.unifiedSession)
      
      // Track signout event
      await trackAuthEvent('web_signout', session.user.id)
    }
  }
}
```

#### **API Key Management UI**
```typescript
// /Users/arhansubasi/recoder.xyz/recoder-web/app/settings/api-keys/page.tsx
export default function APIKeysPage() {
  const [apiKeys, setApiKeys] = useState([])
  const [generatingKey, setGeneratingKey] = useState(false)
  
  const generateAPIKey = async (scopes, restrictions) => {
    setGeneratingKey(true)
    try {
      const response = await fetch('/api/auth/api-keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scopes, restrictions })
      })
      
      const { keyId, apiKey } = await response.json()
      
      // Show key once (security measure)
      setNewKeyDialog({ keyId, apiKey, show: true })
      
      // Refresh key list
      await loadAPIKeys()
    } finally {
      setGeneratingKey(false)
    }
  }
  
  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">API Keys</h1>
        <APIKeyGenerator onGenerate={generateAPIKey} />
      </div>
      
      <APIKeysList 
        keys={apiKeys}
        onRevoke={revokeAPIKey}
        onUpdate={updateAPIKey}
      />
      
      <SecuritySettings />
      <MFASettings />
    </div>
  )
}
```

### **Phase 3.1c: CLI Authentication Enhancement** (Week 3-4)

#### **Enhanced CLI Auth Commands**
```typescript
// /Users/arhansubasi/recoder.xyz/packages/cli/src/commands/auth.ts
export class AuthCommand {
  async login(options: { method?: 'oauth' | 'device' | 'api-key' } = {}) {
    const method = options.method || await this.detectBestAuthMethod()
    
    switch (method) {
      case 'oauth':
        return await this.oauthLogin()
      case 'device':
        return await this.deviceFlowLogin()
      case 'api-key':
        return await this.apiKeyLogin()
    }
  }
  
  private async deviceFlowLogin() {
    console.log('🔐 Starting device authentication...')
    
    // Initiate device flow
    const deviceAuth = await this.authService.initiateDeviceFlow()
    
    console.log(`
📱 Device Authentication Required

1. Open your browser and go to: ${deviceAuth.verificationUri}
2. Enter this code: ${deviceAuth.userCode}
3. Authorize the device in your browser

Waiting for authorization...`)
    
    // Poll for authorization
    const pollInterval = setInterval(async () => {
      try {
        const result = await this.authService.pollDeviceAuthorization(deviceAuth.deviceCode)
        
        if (result.status === 'authorized') {
          clearInterval(pollInterval)
          await this.saveSession({
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            platform: 'cli',
            authenticatedAt: new Date()
          })
          
          console.log('✅ Authentication successful!')
          return
        } else if (result.status === 'denied') {
          clearInterval(pollInterval)
          console.log('❌ Authentication denied')
          process.exit(1)
        }
      } catch (error) {
        console.error('Authentication error:', error.message)
      }
    }, deviceAuth.interval * 1000)
    
    // Set timeout
    setTimeout(() => {
      clearInterval(pollInterval)
      console.log('⏰ Authentication timeout')
      process.exit(1)
    }, deviceAuth.expiresIn * 1000)
  }
  
  private async apiKeyLogin() {
    const apiKey = await prompt('Enter your API key: ', { type: 'password' })
    
    try {
      const validation = await this.authService.validateAPIKey(apiKey)
      
      await this.saveSession({
        apiKey,
        userId: validation.userId,
        scopes: validation.scopes,
        platform: 'cli',
        authenticatedAt: new Date()
      })
      
      console.log('✅ API key authentication successful!')
    } catch (error) {
      console.log('❌ Invalid API key')
      process.exit(1)
    }
  }
  
  async status() {
    const session = await this.loadSession()
    if (!session) {
      console.log('❌ Not authenticated')
      return
    }
    
    // Get cross-platform status
    const status = await this.authService.getCrossPlatformStatus(session.userId)
    
    console.log(`
👤 User: ${status.user.name} (${status.user.email})
🔑 Authentication: ${session.apiKey ? 'API Key' : 'OAuth'}
📱 Active Platforms: ${status.activePlatforms.join(', ')}
📊 Usage: ${status.usage.current}/${status.usage.limit} requests
⏰ Session expires: ${session.expiresAt || 'Never'}
`)
  }
}
```

### **Phase 3.1d: VS Code Extension Integration** (Week 4-5)

#### **Extension OAuth Integration**
```typescript
// /Users/arhansubasi/recoder.xyz/recoder-extension/src/services/auth-service.ts
export class ExtensionAuthService {
  constructor(private context: vscode.ExtensionContext) {
    this.secretStorage = context.secrets
    this.authProvider = new RecoderAuthProvider()
  }
  
  async authenticate(): Promise<AuthSession> {
    // Try cached session first
    const cachedSession = await this.getCachedSession()
    if (cachedSession && await this.validateSession(cachedSession)) {
      return cachedSession
    }
    
    // Use VS Code's built-in authentication
    const session = await vscode.authentication.getSession('recoder', ['user:read'], {
      createIfNone: true
    })
    
    if (session) {
      const unifiedSession = await this.convertToUnifiedSession(session)
      await this.cacheSession(unifiedSession)
      return unifiedSession
    }
    
    throw new Error('Authentication failed')
  }
  
  async authenticateWithDevice(): Promise<AuthSession> {
    // Fallback to device flow for complex scenarios
    const deviceAuth = await this.authService.initiateDeviceFlow()
    
    // Show VS Code notification with instructions
    const action = await vscode.window.showInformationMessage(
      `Device authentication required. Click to open browser.`,
      'Open Browser',
      'Cancel'
    )
    
    if (action === 'Open Browser') {
      await vscode.env.openExternal(vscode.Uri.parse(deviceAuth.verificationUriComplete))
    }
    
    // Show progress while polling
    return await vscode.window.withProgress({
      location: vscode.ProgressLocation.Notification,
      title: 'Waiting for device authorization...',
      cancellable: true
    }, async (progress, token) => {
      return await this.pollDeviceAuthorization(deviceAuth.deviceCode, token)
    })
  }
  
  private async pollDeviceAuthorization(deviceCode: string, cancellationToken: vscode.CancellationToken): Promise<AuthSession> {
    while (!cancellationToken.isCancellationRequested) {
      try {
        const result = await this.authService.pollDeviceAuthorization(deviceCode)
        
        if (result.status === 'authorized') {
          const session = {
            accessToken: result.accessToken,
            refreshToken: result.refreshToken,
            platform: 'extension'
          }
          
          await this.cacheSession(session)
          return session
        } else if (result.status === 'denied') {
          throw new Error('Device authorization denied')
        }
        
        await new Promise(resolve => setTimeout(resolve, 5000)) // 5 second interval
      } catch (error) {
        throw new Error(`Device authorization failed: ${error.message}`)
      }
    }
    
    throw new Error('Device authorization cancelled')
  }
}
```

### **Phase 3.1e: Code Router Security** (Week 5-6)

#### **Enhanced Router Authentication**
```typescript
// /Users/arhansubasi/recoder.xyz/packages/recoder-cli-router/src/middleware/enhanced-auth.ts
export class EnhancedAuthMiddleware {
  constructor(private authService: UnifiedAuthService) {}
  
  async authenticate(req: Request, res: Response, next: NextFunction) {
    try {
      const authResult = await this.authService.authenticateRequest(req)
      
      if (!authResult.authenticated) {
        return res.status(401).json({
          error: 'Authentication required',
          supportedMethods: ['Bearer token', 'API key']
        })
      }
      
      // Check rate limits
      const rateLimitResult = await this.checkRateLimit(authResult.user, req)
      if (rateLimitResult.exceeded) {
        return res.status(429).json({
          error: 'Rate limit exceeded',
          resetTime: rateLimitResult.resetTime
        })
      }
      
      // Attach auth context
      req.auth = {
        user: authResult.user,
        session: authResult.session,
        scopes: authResult.session.scopes,
        platform: authResult.session.platform
      }
      
      // Track request
      await this.trackRequest(req.auth.user.id, req)
      
      next()
    } catch (error) {
      res.status(401).json({ error: 'Invalid authentication' })
    }
  }
  
  requireScope(requiredScopes: string[]) {
    return (req: Request, res: Response, next: NextFunction) => {
      const userScopes = req.auth?.scopes || []
      const hasRequiredScopes = requiredScopes.every(scope => 
        userScopes.includes(scope) || userScopes.includes('admin')
      )
      
      if (!hasRequiredScopes) {
        return res.status(403).json({
          error: 'Insufficient permissions',
          required: requiredScopes,
          current: userScopes
        })
      }
      
      next()
    }
  }
  
  private async checkRateLimit(user: User, req: Request): Promise<RateLimitResult> {
    const key = `rate_limit:${user.id}:${req.ip}`
    const limit = user.tier === 'premium' ? 1000 : 100 // requests per hour
    
    const current = await this.redis.incr(key)
    if (current === 1) {
      await this.redis.expire(key, 3600) // 1 hour
    }
    
    return {
      exceeded: current > limit,
      remaining: Math.max(0, limit - current),
      resetTime: new Date(Date.now() + 3600000) // 1 hour from now
    }
  }
}
```

---

## 🛡️ Security Implementation

### **1. Threat Detection & Prevention**
```typescript
// /Users/arhansubasi/recoder.xyz/backend/src/services/threat-detection.js
class ThreatDetectionService {
  async assessRisk(userId, context) {
    const riskFactors = []
    
    // Geographic anomaly detection
    const lastLocation = await this.getUserLastLocation(userId)
    if (lastLocation && this.calculateDistance(lastLocation, context.location) > 1000) {
      riskFactors.push({ type: 'geographic_anomaly', severity: 'medium' })
    }
    
    // Device fingerprinting
    const knownDevices = await this.getUserDevices(userId)
    if (!knownDevices.includes(context.deviceFingerprint)) {
      riskFactors.push({ type: 'unknown_device', severity: 'high' })
    }
    
    // Behavioral analysis
    const behaviorScore = await this.analyzeBehavior(userId, context)
    if (behaviorScore < 0.3) {
      riskFactors.push({ type: 'behavioral_anomaly', severity: 'high' })
    }
    
    // Failed attempt tracking
    const recentFailures = await this.getRecentFailedAttempts(userId)
    if (recentFailures > 3) {
      riskFactors.push({ type: 'multiple_failures', severity: 'critical' })
    }
    
    return this.calculateRiskLevel(riskFactors)
  }
  
  async analyzeBehavior(userId, context) {
    // Machine learning model for behavior analysis
    const features = await this.extractBehaviorFeatures(userId, context)
    return await this.behaviorModel.predict(features)
  }
}
```

### **2. Audit Logging & Monitoring**
```typescript
// /Users/arhansubasi/recoder.xyz/backend/src/services/audit-logger.js
class AuditLogger {
  async logAuthEvent(event) {
    const auditEntry = {
      timestamp: new Date(),
      userId: event.userId,
      action: event.action,
      platform: event.platform,
      ip: event.ip,
      userAgent: event.userAgent,
      success: event.success,
      riskLevel: event.riskLevel,
      metadata: event.metadata
    }
    
    // Store in secure audit database
    await this.auditDb.insert(auditEntry)
    
    // Real-time alerting for high-risk events
    if (event.riskLevel === 'critical') {
      await this.alertingService.sendSecurityAlert(auditEntry)
    }
    
    // SIEM integration
    await this.siemService.sendEvent(auditEntry)
  }
  
  async generateSecurityReport(userId, timeRange) {
    const events = await this.auditDb.query({
      userId,
      timestamp: { $gte: timeRange.start, $lte: timeRange.end }
    })
    
    return {
      totalEvents: events.length,
      failedAttempts: events.filter(e => !e.success).length,
      platforms: [...new Set(events.map(e => e.platform))],
      locations: [...new Set(events.map(e => e.ip))],
      riskEvents: events.filter(e => e.riskLevel === 'high' || e.riskLevel === 'critical'),
      recommendations: await this.generateSecurityRecommendations(events)
    }
  }
}
```

### **3. End-to-End Encryption for Sensitive Data**
```typescript
// /Users/arhansubasi/recoder.xyz/backend/src/services/encryption.js
class EncryptionService {
  constructor() {
    this.algorithm = 'aes-256-gcm'
    this.keyDerivation = 'pbkdf2'
  }
  
  async encryptUserData(data, userKey) {
    const salt = crypto.randomBytes(16)
    const iv = crypto.randomBytes(12)
    const key = crypto.pbkdf2Sync(userKey, salt, 100000, 32, 'sha256')
    
    const cipher = crypto.createCipherGCM(this.algorithm, key, iv)
    let encrypted = cipher.update(JSON.stringify(data), 'utf8', 'hex')
    encrypted += cipher.final('hex')
    
    const authTag = cipher.getAuthTag()
    
    return {
      encrypted,
      salt: salt.toString('hex'),
      iv: iv.toString('hex'),
      authTag: authTag.toString('hex')
    }
  }
  
  async decryptUserData(encryptedData, userKey) {
    const salt = Buffer.from(encryptedData.salt, 'hex')
    const iv = Buffer.from(encryptedData.iv, 'hex')
    const authTag = Buffer.from(encryptedData.authTag, 'hex')
    const key = crypto.pbkdf2Sync(userKey, salt, 100000, 32, 'sha256')
    
    const decipher = crypto.createDecipherGCM(this.algorithm, key, iv)
    decipher.setAuthTag(authTag)
    
    let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')
    
    return JSON.parse(decrypted)
  }
}
```

---

## 🧪 Security Testing & Validation

### **Penetration Testing Checklist**
- [ ] **Authentication Bypass Testing**
- [ ] **Session Management Vulnerabilities**
- [ ] **Token Manipulation Attacks**
- [ ] **Cross-Platform Session Hijacking**
- [ ] **API Rate Limiting Bypass**
- [ ] **Device Flow Security**
- [ ] **MFA Bypass Attempts**
- [ ] **Privilege Escalation Testing**

### **Automated Security Scanning**
```typescript
// /Users/arhansubasi/recoder.xyz/scripts/security-scan.ts
async function runSecurityScan() {
  const tests = [
    { name: 'Token Validation', test: testTokenValidation },
    { name: 'Rate Limiting', test: testRateLimiting },
    { name: 'Session Security', test: testSessionSecurity },
    { name: 'API Key Security', test: testAPIKeySecurity },
    { name: 'Cross-Platform Sync', test: testCrossPlatformSync },
    { name: 'Device Flow Security', test: testDeviceFlowSecurity }
  ]
  
  const results = []
  for (const test of tests) {
    console.log(`Running ${test.name}...`)
    const result = await test.test()
    results.push({ name: test.name, ...result })
  }
  
  return results
}
```

---

## 📊 Success Metrics

### **Security Metrics**
- **Zero** authentication bypass incidents
- **< 50ms** average authentication latency
- **99.9%** session sync reliability across platforms
- **< 1%** false positive rate for threat detection

### **User Experience Metrics**
- **Single sign-on** across all platforms
- **< 3 clicks** to authenticate on any platform
- **24/7** access to personal API keys and session management
- **Real-time** cross-platform session monitoring

---

## 🚀 Timeline & Deliverables

| Phase | Duration | Deliverables |
|-------|----------|--------------|
| **3.1a** | 2 weeks | Enhanced backend auth service, API key management |
| **3.1b** | 1 week | Web platform MFA, device flow, security dashboard |
| **3.1c** | 1 week | CLI device flow, API key auth, cross-platform sync |
| **3.1d** | 1 week | Extension OAuth integration, unified sessions |
| **3.1e** | 1 week | Router security enhancement, threat detection |
| **Testing** | 1 week | Security audit, penetration testing, fixes |

**Total Duration**: 7 weeks
**Security Review**: Continuous throughout implementation

---

This unified authentication system will provide enterprise-grade security while maintaining seamless user experience across all Recoder platforms. The modular architecture allows for future enhancements while ensuring backward compatibility and platform-specific optimizations.