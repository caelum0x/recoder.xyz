/**
 * Centralized Package Integration Manager
 * Manages all monorepo package integrations for the CLI
 */

import { Logger } from '../utils/logger'
import { backendClient, BackendClient } from './backend-client'
import { productionEngineClient, ProductionEngineClient } from './production-engine-client'

// Analytics integration - monitoring and cost tracking
let analyticsPackage: any = null
try {
  analyticsPackage = require('@recoder/analytics')
} catch (error) {
  Logger.warn('Analytics package not available:', error)
}

// Intelligence integration - performance optimization and AI learning
let intelligencePackage: any = null
try {
  intelligencePackage = require('@recoder/intelligence')
} catch (error) {
  Logger.warn('Intelligence package not available:', error)
}

// Security integration - vulnerability scanning and compliance
let securityPackage: any = null
try {
  securityPackage = require('@recoder/security')
} catch (error) {
  Logger.warn('Security package not available:', error)
}

// CLI Router integration - originally claude-code-router, now recoder-code-router
let cliRouter: any = null
try {
  // Try to import the router src index directly
  cliRouter = require('../../../recoder-cli-router/src')
} catch (error) {
  try {
    // Try dist version
    cliRouter = require('../../../recoder-cli-router/dist')
  } catch (error2) {
    try {
      // Try to import specific modules we can use
      const routerUtils = require('../../../recoder-cli-router/src/utils/router')
      const providers = require('../../../recoder-cli-router/src/api/providers')
      cliRouter = { router: routerUtils, providers }
    } catch (error3) {
      Logger.warn('CLI Router package not available - using fallback mode')
      // Create a minimal mock for testing
      cliRouter = {
        route: () => null,
        providers: { getAll: () => [] },
        providerSelection: { selectOptimal: () => null },
        initialize: () => true
      }
    }
  }
}

// Roo Code Types integration
let rooCodeTypes: any = null
try {
  rooCodeTypes = require('@roo-code/types')
} catch (error) {
  Logger.warn('Roo Code Types package not available:', error)
}

/**
 * Analytics Service Integration
 */
export class AnalyticsIntegration {
  private analytics: any

  constructor() {
    this.analytics = analyticsPackage
  }

  isAvailable(): boolean {
    return !!this.analytics
  }

  trackUsage(event: string, data: any = {}) {
    if (!this.isAvailable()) return
    
    try {
      return this.analytics.tracking?.trackUsage?.(event, {
        ...data,
        timestamp: new Date().toISOString(),
        source: 'recoder-cli'
      })
    } catch (error) {
      Logger.warn('Analytics tracking failed:', error)
    }
  }

  trackCostOptimization(provider: string, savings: number, details: any = {}) {
    if (!this.isAvailable()) return
    
    try {
      return this.analytics.costOptimization?.track?.(provider, savings, {
        ...details,
        timestamp: new Date().toISOString()
      })
    } catch (error) {
      Logger.warn('Cost optimization tracking failed:', error)
    }
  }

  getPerformanceMetrics() {
    if (!this.isAvailable()) return null
    
    try {
      return this.analytics.performanceMetrics?.getMetrics?.()
    } catch (error) {
      Logger.warn('Performance metrics retrieval failed:', error)
      return null
    }
  }

  generateDashboard() {
    if (!this.isAvailable()) return null
    
    try {
      return this.analytics.dashboard?.generate?.()
    } catch (error) {
      Logger.warn('Dashboard generation failed:', error)
      return null
    }
  }
}

/**
 * Intelligence Service Integration
 */
export class IntelligenceIntegration {
  private intelligence: any

  constructor() {
    this.intelligence = intelligencePackage
  }

  isAvailable(): boolean {
    return !!this.intelligence
  }

  optimizePerformance(context: any) {
    if (!this.isAvailable()) return context
    
    try {
      return this.intelligence.performanceOptimizer?.optimize?.(context) || context
    } catch (error) {
      Logger.warn('Performance optimization failed:', error)
      return context
    }
  }

  analyzeUserPatterns(userActions: any[]) {
    if (!this.isAvailable()) return null
    
    try {
      return this.intelligence.userPatternAnalyzer?.analyze?.(userActions)
    } catch (error) {
      Logger.warn('User pattern analysis failed:', error)
      return null
    }
  }

  getRecommendations(context: any) {
    if (!this.isAvailable()) return []
    
    try {
      return this.intelligence.recommendationEngine?.getRecommendations?.(context) || []
    } catch (error) {
      Logger.warn('Recommendation generation failed:', error)
      return []
    }
  }

  manageContextMemory(action: 'store' | 'retrieve' | 'clear', data?: any) {
    if (!this.isAvailable()) return null
    
    try {
      const contextMemory = this.intelligence.contextMemory
      if (!contextMemory) return null

      switch (action) {
        case 'store':
          return contextMemory.store?.(data)
        case 'retrieve':
          return contextMemory.retrieve?.(data)
        case 'clear':
          return contextMemory.clear?.()
        default:
          return null
      }
    } catch (error) {
      Logger.warn('Context memory operation failed:', error)
      return null
    }
  }
}

/**
 * Security Service Integration  
 */
export class SecurityIntegration {
  private security: any

  constructor() {
    this.security = securityPackage
  }

  isAvailable(): boolean {
    return !!this.security
  }

  sanitizePrompt(prompt: string): string {
    if (!this.isAvailable()) return prompt
    
    try {
      return this.security.aiPromptSanitizer?.sanitize?.(prompt) || prompt
    } catch (error) {
      Logger.warn('Prompt sanitization failed:', error)
      return prompt
    }
  }

  scanForVulnerabilities(code: string): any[] {
    if (!this.isAvailable()) return []
    
    try {
      return this.security.codeVulnerabilityScanner?.scan?.(code) || []
    } catch (error) {
      Logger.warn('Vulnerability scanning failed:', error)
      return []
    }
  }

  detectSecrets(content: string): any[] {
    if (!this.isAvailable()) return []
    
    try {
      return this.security.secretDetector?.detect?.(content) || []
    } catch (error) {
      Logger.warn('Secret detection failed:', error)
      return []
    }
  }

  createAuditTrail(action: string, details: any) {
    if (!this.isAvailable()) return
    
    try {
      return this.security.auditTrail?.log?.(action, {
        ...details,
        timestamp: new Date().toISOString(),
        source: 'recoder-cli'
      })
    } catch (error) {
      Logger.warn('Audit trail logging failed:', error)
    }
  }

  encryptData(data: any): string | null {
    if (!this.isAvailable()) return null
    
    try {
      return this.security.dataEncryption?.encrypt?.(data)
    } catch (error) {
      Logger.warn('Data encryption failed:', error)
      return null
    }
  }

  decryptData(encryptedData: string): any | null {
    if (!this.isAvailable()) return null
    
    try {
      return this.security.dataEncryption?.decrypt?.(encryptedData)
    } catch (error) {
      Logger.warn('Data decryption failed:', error)
      return null
    }
  }
}

/**
 * CLI Router Integration (formerly claude-code-router, now recoder-code-router)
 */
export class RouterIntegration {
  private router: any

  constructor() {
    this.router = cliRouter
  }

  isAvailable(): boolean {
    return !!this.router
  }

  routeRequest(request: any, options: any = {}) {
    if (!this.isAvailable()) {
      Logger.warn('CLI Router not available, falling back to direct routing')
      return null
    }
    
    try {
      return this.router.route?.(request, {
        ...options,
        source: 'recoder-cli'
      })
    } catch (error) {
      Logger.warn('CLI Router request failed:', error)
      return null
    }
  }

  getAvailableProviders() {
    if (!this.isAvailable()) return []
    
    try {
      return this.router.providers?.getAll?.() || []
    } catch (error) {
      Logger.warn('Router providers retrieval failed:', error)
      return []
    }
  }

  selectOptimalProvider(criteria: any) {
    if (!this.isAvailable()) return null
    
    try {
      return this.router.providerSelection?.selectOptimal?.(criteria)
    } catch (error) {
      Logger.warn('Optimal provider selection failed:', error)
      return null
    }
  }

  initializeRouter(config: any = {}) {
    if (!this.isAvailable()) return false
    
    try {
      return this.router.initialize?.({
        ...config,
        integrationSource: 'recoder-cli'
      }) !== false
    } catch (error) {
      Logger.warn('Router initialization failed:', error)
      return false
    }
  }
}

/**
 * Roo Code Types Integration
 */
export class TypesIntegration {
  private types: any

  constructor() {
    this.types = rooCodeTypes
  }

  isAvailable(): boolean {
    return !!this.types
  }

  validateProvider(providerName: string): boolean {
    if (!this.isAvailable()) return true // Allow by default if types not available
    
    try {
      return this.types.providerSettings?.isValidProvider?.(providerName) !== false
    } catch (error) {
      Logger.warn('Provider validation failed:', error)
      return true
    }
  }

  getProviderTypes() {
    if (!this.isAvailable()) return []
    
    try {
      return this.types.providers || []
    } catch (error) {
      Logger.warn('Provider types retrieval failed:', error)
      return []
    }
  }

  validateConfiguration(config: any): boolean {
    if (!this.isAvailable()) return true
    
    try {
      return this.types.validation?.validateConfig?.(config) !== false
    } catch (error) {
      Logger.warn('Configuration validation failed:', error)
      return true
    }
  }
}

/**
 * Centralized Package Integration Manager
 */
export class PackageIntegrationManager {
  public analytics: AnalyticsIntegration
  public intelligence: IntelligenceIntegration
  public security: SecurityIntegration
  public router: RouterIntegration
  public types: TypesIntegration
  public backend: BackendIntegration
  public productionEngine: ProductionEngineIntegration

  private initialized = false

  constructor() {
    this.analytics = new AnalyticsIntegration()
    this.intelligence = new IntelligenceIntegration()
    this.security = new SecurityIntegration()
    this.router = new RouterIntegration()
    this.types = new TypesIntegration()
    this.backend = new BackendIntegration()
    this.productionEngine = new ProductionEngineIntegration()
  }

  async initialize() {
    if (this.initialized) return true

    try {
      Logger.info('🔧 Initializing package integrations...')

      // Initialize router first as other services may depend on it
      if (this.router.isAvailable()) {
        const routerInit = this.router.initializeRouter({
          enableLogging: true,
          fallbackToDefault: true
        })
        if (routerInit) {
          Logger.info('✅ Recoder CLI Router initialized successfully')
        } else {
          Logger.warn('⚠️ Recoder CLI Router initialization failed')
        }
      }

      // Initialize backend and production engine
      await this.backend.initialize()
      await this.productionEngine.initialize()

      // Log available integrations
      const available = this.getAvailableIntegrations()
      if (available.length > 0) {
        Logger.info(`✅ Available integrations: ${available.join(', ')}`)
      } else {
        Logger.warn('⚠️ No package integrations available')
      }

      this.initialized = true
      return true
    } catch (error) {
      Logger.error('❌ Package integration initialization failed:', error)
      return false
    }
  }

  getAvailableIntegrations(): string[] {
    const integrations = []
    
    if (this.analytics.isAvailable()) integrations.push('analytics')
    if (this.intelligence.isAvailable()) integrations.push('intelligence')
    if (this.security.isAvailable()) integrations.push('security')
    if (this.router.isAvailable()) integrations.push('cli-router')
    if (this.types.isAvailable()) integrations.push('types')
    if (this.backend.isAvailable()) integrations.push('backend')
    if (this.productionEngine.isAvailable()) integrations.push('production-engine')
    
    return integrations
  }

  isFullyIntegrated(): boolean {
    return this.getAvailableIntegrations().length >= 3 // At least 3 integrations for "full"
  }

  getIntegrationStatus() {
    return {
      initialized: this.initialized,
      available: this.getAvailableIntegrations(),
      analytics: this.analytics.isAvailable(),
      intelligence: this.intelligence.isAvailable(),
      security: this.security.isAvailable(),
      router: this.router.isAvailable(),
      types: this.types.isAvailable(),
      backend: this.backend.isAvailable(),
      productionEngine: this.productionEngine.isAvailable(),
      fullyIntegrated: this.isFullyIntegrated()
    }
  }
}

/**
 * Backend Integration - Connects CLI to the recoder.xyz backend
 */
export class BackendIntegration {
  private backendClient: BackendClient
  private initialized = false
  private isBackendOnline = false

  constructor() {
    this.backendClient = backendClient
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true

    try {
      this.isBackendOnline = await this.backendClient.isBackendAvailable()
      if (this.isBackendOnline) {
        // Mark CLI as active
        await this.backendClient.updatePlatformStatus('cli', true)
        Logger.info('✅ Backend integration initialized')
      } else {
        Logger.info('📍 Backend offline - running in local mode')
      }
      
      this.initialized = true
      return true
    } catch (error) {
      Logger.warn('⚠️ Backend integration initialization failed:', error)
      return false
    }
  }

  isAvailable(): boolean {
    return true // Always available (graceful fallback)
  }

  getStatus(): string {
    const session = this.backendClient.getCurrentSession()
    if (session) {
      return `authenticated as ${session.email} (${session.plan})`
    }
    return this.isBackendOnline ? 'online (not authenticated)' : 'offline mode'
  }

  getCapabilities(): string[] {
    const session = this.backendClient.getCurrentSession()
    const capabilities = ['offline-mode', 'local-generation']
    
    if (this.isBackendOnline) {
      capabilities.push('backend-connection')
    }
    
    if (session) {
      capabilities.push(
        'user-authentication',
        'quota-tracking', 
        'cross-platform-sync',
        'project-history',
        'usage-analytics'
      )
    }
    
    return capabilities
  }

  // Expose backend client methods
  async checkQuota(estimatedTokens?: number): Promise<boolean> {
    return this.backendClient.checkQuota(estimatedTokens)
  }

  async trackUsage(usage: any): Promise<void> {
    return this.backendClient.trackUsage(usage)
  }

  async saveProject(project: any): Promise<void> {
    return this.backendClient.saveProject(project)
  }

  getCurrentSession() {
    return this.backendClient.getCurrentSession()
  }

  isAuthenticated(): boolean {
    return this.backendClient.isAuthenticated()
  }

  isOnline(): boolean {
    return this.isBackendOnline
  }
}

/**
 * Production Engine Integration - Real code generation and validation
 */
export class ProductionEngineIntegration {
  private productionEngineClient: ProductionEngineClient
  private initialized = false
  private engineAvailable = false

  constructor() {
    this.productionEngineClient = productionEngineClient
  }

  async initialize(): Promise<boolean> {
    if (this.initialized) return true

    try {
      this.engineAvailable = await this.productionEngineClient.isEngineAvailable()
      if (this.engineAvailable) {
        Logger.info('✅ Production Engine connected')
      } else {
        Logger.info('📍 Production Engine offline - using local AI fallback')
      }
      
      this.initialized = true
      return true
    } catch (error) {
      Logger.warn('⚠️ Production Engine integration failed:', error)
      return false
    }
  }

  isAvailable(): boolean {
    return true // Always available (has local fallback)
  }

  getStatus(): string {
    if (this.engineAvailable) {
      return 'connected to production engine'
    }
    return 'local AI fallback mode'
  }

  getCapabilities(): string[] {
    const capabilities = [
      'local-ai-generation',
      'code-parsing',
      'file-generation',
      'project-scaffolding',
      'ai-hub-fallback'
    ]
    
    if (this.engineAvailable) {
      capabilities.push(
        'production-validation',
        'security-scanning',
        'real-functionality-testing',
        'multi-provider-access',
        'enhanced-code-generation'
      )
    }
    
    return capabilities
  }

  // Expose production engine methods
  async generateCode(request: any) {
    return this.productionEngineClient.generateCode(request)
  }

  async getAvailableProviders(): Promise<string[]> {
    return this.productionEngineClient.getAvailableProviders()
  }

  isEngineConnected(): boolean {
    return this.engineAvailable
  }

  getEngineClient(): ProductionEngineClient {
    return this.productionEngineClient
  }
}

// Export singleton instance
export const packageIntegration = new PackageIntegrationManager()