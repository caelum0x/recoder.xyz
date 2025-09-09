// Simple in-memory rate limiting implementation
// In production, consider using Redis or similar for distributed rate limiting

interface RateLimitRecord {
  count: number
  resetTime: number
}

interface RateLimitResult {
  success: boolean
  limit: number
  remaining: number
  reset: Date
}

class SimpleRateLimit {
  private requests = new Map<string, RateLimitRecord>()
  private maxRequests: number
  private windowMs: number

  constructor(maxRequests: number, windowMs: number) {
    this.maxRequests = maxRequests
    this.windowMs = windowMs
  }

  async limit(identifier: string): Promise<RateLimitResult> {
    const now = Date.now()
    const key = `ratelimit:${identifier}`
    const record = this.requests.get(key)

    // Clean up expired records periodically
    this.cleanup()

    if (!record || now > record.resetTime) {
      this.requests.set(key, { count: 1, resetTime: now + this.windowMs })
      return { 
        success: true, 
        limit: this.maxRequests, 
        remaining: this.maxRequests - 1, 
        reset: new Date(now + this.windowMs) 
      }
    }

    if (record.count >= this.maxRequests) {
      return { 
        success: false, 
        limit: this.maxRequests, 
        remaining: 0, 
        reset: new Date(record.resetTime) 
      }
    }

    record.count++
    this.requests.set(key, record)
    return { 
      success: true, 
      limit: this.maxRequests, 
      remaining: this.maxRequests - record.count, 
      reset: new Date(record.resetTime) 
    }
  }

  private cleanup() {
    const now = Date.now()
    for (const [key, record] of this.requests.entries()) {
      if (now > record.resetTime) {
        this.requests.delete(key)
      }
    }
  }
}

// Create rate limit instances
export const ratelimit = new SimpleRateLimit(10, 60 * 1000) // 10 requests per minute
export const apiKeyRatelimit = new SimpleRateLimit(5, 60 * 1000) // 5 API key operations per minute
export const authRatelimit = new SimpleRateLimit(5, 15 * 60 * 1000) // 5 auth attempts per 15 minutes

// Helper function to get client IP
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  const realIP = request.headers.get('x-real-ip')
  
  if (forwarded) {
    return forwarded.split(',')[0].trim()
  }
  
  if (realIP) {
    return realIP
  }
  
  return '127.0.0.1'
}
