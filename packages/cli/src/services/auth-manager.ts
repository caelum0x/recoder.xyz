import axios from 'axios'
import { promises as fs } from 'fs'
import { join } from 'path'
import { homedir } from 'os'
import open from 'open'
import { createServer } from 'http'
import { URL } from 'url'
import chalk from 'chalk'
import ora from 'ora'

export interface UserSubscription {
  id: string
  email: string
  plan: 'free' | 'premium' | 'pro' | 'enterprise'
  usage: {
    tokensUsed: number
    requestsUsed: number
    tokensLimit: number
    requestsLimit: number
    resetDate: string
  }
  features: string[]
  isActive: boolean
  expiresAt?: string
}

export interface AuthToken {
  accessToken: string
  refreshToken: string
  expiresAt: number
  user: {
    id: string
    email: string
    plan: string
  }
}

export class AuthManager {
  private configDir: string
  private authFile: string
  private baseURL: string

  constructor() {
    this.configDir = join(homedir(), '.recoder')
    this.authFile = join(this.configDir, 'auth.json')
    this.baseURL = process.env.RECODER_API_URL || 'https://api.recoder.xyz'
  }

  async ensureConfigDir(): Promise<void> {
    try {
      await fs.mkdir(this.configDir, { recursive: true })
    } catch (error) {
      // Directory already exists
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const authData = await this.getStoredAuth()
      if (!authData) return false

      // Check if token is expired
      if (Date.now() >= authData.expiresAt) {
        await this.refreshToken()
      }

      return true
    } catch (error) {
      return false
    }
  }

  async getStoredAuth(): Promise<AuthToken | null> {
    try {
      await this.ensureConfigDir()
      const authData = await fs.readFile(this.authFile, 'utf-8')
      return JSON.parse(authData)
    } catch (error) {
      return null
    }
  }

  async storeAuth(authData: AuthToken): Promise<void> {
    await this.ensureConfigDir()
    await fs.writeFile(this.authFile, JSON.stringify(authData, null, 2))
  }

  async clearAuth(): Promise<void> {
    try {
      await fs.unlink(this.authFile)
    } catch (error) {
      // File doesn't exist, that's fine
    }
  }

  async login(): Promise<boolean> {
    const spinner = ora('Initiating authentication...').start()

    try {
      // Start local server to receive auth callback
      const authResult = await this.startAuthFlow()
      
      if (authResult.success && authResult.tokens) {
        await this.storeAuth(authResult.tokens)
        spinner.succeed(chalk.green('✅ Successfully authenticated!'))
        
        // Display user info
        console.log(chalk.blue('\\n🎉 Welcome to Recoder.xyz!'))
        console.log(chalk.gray(`Email: ${authResult.tokens.user.email}`))
        console.log(chalk.gray(`Plan: ${authResult.tokens.user.plan.toUpperCase()}`))
        
        return true
      } else {
        spinner.fail(chalk.red('❌ Authentication failed'))
        return false
      }
    } catch (error) {
      spinner.fail(chalk.red('❌ Authentication error: ' + (error as Error).message))
      return false
    }
  }

  private async startAuthFlow(): Promise<{
    success: boolean
    tokens?: AuthToken
    error?: string
  }> {
    return new Promise(async (resolve) => {
      // Use PortManager to get available port for auth service
      const { portManager } = await import('../utils/port-manager')
      const port = await portManager.getPortForService('auth-service')
      const callbackUrl = `http://localhost:${port}/callback`
      const authUrl = `https://recoder.xyz/auth/cli?callback=${encodeURIComponent(callbackUrl)}`

      // Create temporary server for callback
      const server = createServer(async (req, res) => {
        if (req.url?.startsWith('/callback')) {
          const url = new URL(req.url, `http://localhost:${port}`)
          const code = url.searchParams.get('code')
          const error = url.searchParams.get('error')

          if (error) {
            res.writeHead(400, { 'Content-Type': 'text/html' })
            res.end(`
              <html>
                <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                  <h2 style="color: #ef4444;">❌ Authentication Failed</h2>
                  <p>Error: ${error}</p>
                  <p>You can close this window and try again.</p>
                </body>
              </html>
            `)
            server.close()
            resolve({ success: false, error })
            return
          }

          if (code) {
            try {
              // Exchange code for tokens
              const tokens = await this.exchangeCodeForTokens(code)
              
              res.writeHead(200, { 'Content-Type': 'text/html' })
              res.end(`
                <html>
                  <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h2 style="color: #10b981;">✅ Authentication Successful!</h2>
                    <p>Welcome to Recoder.xyz, ${tokens.user.email}!</p>
                    <p>Plan: <strong>${tokens.user.plan.toUpperCase()}</strong></p>
                    <p>You can close this window and return to your terminal.</p>
                    <script>setTimeout(() => window.close(), 3000);</script>
                  </body>
                </html>
              `)
              
              server.close()
              resolve({ success: true, tokens })
            } catch (error) {
              res.writeHead(500, { 'Content-Type': 'text/html' })
              res.end(`
                <html>
                  <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
                    <h2 style="color: #ef4444;">❌ Token Exchange Failed</h2>
                    <p>Please try again or contact support.</p>
                  </body>
                </html>
              `)
              server.close()
              resolve({ success: false, error: (error as Error).message })
            }
          }
        }
      })

      server.listen(port, () => {
        console.log(chalk.blue('🌐 Opening browser for authentication...'))
        open(authUrl)
      })

      // Timeout after 5 minutes
      setTimeout(() => {
        server.close()
        resolve({ success: false, error: 'Authentication timeout' })
      }, 300000)
    })
  }

  private async exchangeCodeForTokens(code: string): Promise<AuthToken> {
    const response = await axios.post(`${this.baseURL}/auth/cli/token`, {
      code,
      clientId: 'recoder-cli'
    })

    return response.data
  }

  async refreshToken(): Promise<void> {
    const authData = await this.getStoredAuth()
    if (!authData?.refreshToken) {
      throw new Error('No refresh token available')
    }

    const response = await axios.post(`${this.baseURL}/auth/refresh`, {
      refreshToken: authData.refreshToken
    })

    const newTokens = response.data
    await this.storeAuth({
      ...authData,
      accessToken: newTokens.accessToken,
      expiresAt: newTokens.expiresAt
    })
  }

  async getUserSubscription(): Promise<UserSubscription> {
    const authData = await this.getStoredAuth()
    if (!authData) {
      throw new Error('Not authenticated')
    }

    const response = await axios.get(`${this.baseURL}/user/subscription`, {
      headers: {
        'Authorization': `Bearer ${authData.accessToken}`
      }
    })

    return response.data
  }

  async checkUsageLimit(tokensNeeded: number = 0): Promise<{
    allowed: boolean
    reason?: string
    usage: UserSubscription['usage']
  }> {
    try {
      const subscription = await this.getUserSubscription()
      
      if (!subscription.isActive) {
        return {
          allowed: false,
          reason: 'Subscription is not active',
          usage: subscription.usage
        }
      }

      if (subscription.plan === 'free') {
        return {
          allowed: true, // Free users can use local models
          usage: subscription.usage
        }
      }

      // Check token limit
      if (subscription.usage.tokensUsed + tokensNeeded > subscription.usage.tokensLimit) {
        return {
          allowed: false,
          reason: 'Token limit exceeded',
          usage: subscription.usage
        }
      }

      // Check request limit
      if (subscription.usage.requestsUsed >= subscription.usage.requestsLimit) {
        return {
          allowed: false,
          reason: 'Request limit exceeded',
          usage: subscription.usage
        }
      }

      return {
        allowed: true,
        usage: subscription.usage
      }
    } catch (error) {
      // If can't check usage, allow local models only
      return {
        allowed: false,
        reason: 'Unable to verify subscription',
        usage: {
          tokensUsed: 0,
          requestsUsed: 0,
          tokensLimit: 0,
          requestsLimit: 0,
          resetDate: new Date().toISOString()
        }
      }
    }
  }

  async trackUsage(tokensUsed: number): Promise<void> {
    try {
      const authData = await this.getStoredAuth()
      if (!authData) return

      await axios.post(`${this.baseURL}/user/usage`, {
        tokensUsed,
        requestsUsed: 1
      }, {
        headers: {
          'Authorization': `Bearer ${authData.accessToken}`
        }
      })
    } catch (error) {
      console.warn(chalk.yellow('⚠️ Failed to track usage'))
    }
  }

  async logout(): Promise<void> {
    const spinner = ora('Logging out...').start()
    
    try {
      const authData = await this.getStoredAuth()
      if (authData) {
        // Revoke token on server
        try {
          await axios.post(`${this.baseURL}/auth/logout`, {
            refreshToken: authData.refreshToken
          })
        } catch (error) {
          // Continue with local cleanup even if server call fails
        }
      }
      
      await this.clearAuth()
      spinner.succeed(chalk.green('✅ Successfully logged out'))
    } catch (error) {
      spinner.fail(chalk.red('❌ Logout error: ' + (error as Error).message))
    }
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const authData = await this.getStoredAuth()
    if (!authData) {
      throw new Error('Not authenticated')
    }

    return {
      'Authorization': `Bearer ${authData.accessToken}`,
      'User-Agent': 'Recoder CLI v1.0.0'
    }
  }

  async requiresPremium(feature: string): Promise<boolean> {
    try {
      const subscription = await this.getUserSubscription()
      
      const premiumFeatures = [
        'cloud-ai-models',
        'production-engine',
        'advanced-templates',
        'team-collaboration'
      ]

      if (premiumFeatures.includes(feature)) {
        return !['premium', 'pro', 'enterprise'].includes(subscription.plan)
      }

      return false
    } catch (error) {
      return true // Require premium if can't verify
    }
  }
}