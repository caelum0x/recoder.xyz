/**
 * Circuit Breaker Pattern
 * Prevents cascading failures from external services
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CircuitBreaker');

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerConfig {
  failureThreshold: number; // Number of failures before opening
  successThreshold: number; // Number of successes to close from half-open
  timeout: number; // Time in ms before attempting to close
  monitoringPeriod: number; // Time window for counting failures
}

export interface CircuitBreakerStats {
  state: CircuitState;
  failures: number;
  successes: number;
  lastFailureTime: number | null;
  nextAttemptTime: number | null;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failures: number = 0;
  private successes: number = 0;
  private lastFailureTime: number | null = null;
  private nextAttemptTime: number | null = null;
  private failureTimestamps: number[] = [];

  constructor(
    private name: string,
    private config: CircuitBreakerConfig
  ) {}

  /**
   * Execute function with circuit breaker protection
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    // Check if circuit is open
    if (this.state === 'OPEN') {
      if (Date.now() < (this.nextAttemptTime || 0)) {
        throw new Error(`Circuit breaker '${this.name}' is OPEN. Service unavailable.`);
      }

      // Move to half-open state
      this.state = 'HALF_OPEN';
      logger.info(`🔄 Circuit breaker '${this.name}' entering HALF_OPEN state`);
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  /**
   * Handle successful execution
   */
  private onSuccess(): void {
    this.successes++;

    if (this.state === 'HALF_OPEN') {
      if (this.successes >= this.config.successThreshold) {
        this.state = 'CLOSED';
        this.failures = 0;
        this.successes = 0;
        this.failureTimestamps = [];
        logger.info(`✅ Circuit breaker '${this.name}' CLOSED after recovery`);
      }
    }
  }

  /**
   * Handle failed execution
   */
  private onFailure(): void {
    const now = Date.now();
    this.failures++;
    this.lastFailureTime = now;
    this.failureTimestamps.push(now);

    // Clean up old failure timestamps outside monitoring period
    this.failureTimestamps = this.failureTimestamps.filter(
      timestamp => now - timestamp < this.config.monitoringPeriod
    );

    if (this.state === 'HALF_OPEN') {
      // Failed during half-open, go back to open
      this.state = 'OPEN';
      this.nextAttemptTime = now + this.config.timeout;
      this.successes = 0;
      logger.warn(`⚠️ Circuit breaker '${this.name}' reopened after failed recovery attempt`);
    } else if (this.failureTimestamps.length >= this.config.failureThreshold) {
      // Too many failures in monitoring period, open circuit
      this.state = 'OPEN';
      this.nextAttemptTime = now + this.config.timeout;
      this.successes = 0;
      logger.error(`❌ Circuit breaker '${this.name}' OPEN due to ${this.failures} failures`);
    }
  }

  /**
   * Get circuit breaker status
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failureTimestamps.length,
      successes: this.successes,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
    };
  }

  /**
   * Manually reset circuit breaker
   */
  reset(): void {
    this.state = 'CLOSED';
    this.failures = 0;
    this.successes = 0;
    this.lastFailureTime = null;
    this.nextAttemptTime = null;
    this.failureTimestamps = [];
    logger.info(`🔄 Circuit breaker '${this.name}' manually reset`);
  }

  /**
   * Check if circuit is allowing requests
   */
  isAvailable(): boolean {
    if (this.state === 'CLOSED' || this.state === 'HALF_OPEN') {
      return true;
    }

    if (this.state === 'OPEN' && Date.now() >= (this.nextAttemptTime || 0)) {
      return true;
    }

    return false;
  }
}

/**
 * Circuit breaker instances for different services
 */
export const anthropicCircuitBreaker = new CircuitBreaker('Anthropic API', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000, // 30 seconds
  monitoringPeriod: 60000, // 1 minute
});

export const openRouterCircuitBreaker = new CircuitBreaker('OpenRouter API', {
  failureThreshold: 5,
  successThreshold: 2,
  timeout: 30000,
  monitoringPeriod: 60000,
});

export const webContainerCircuitBreaker = new CircuitBreaker('WebContainer', {
  failureThreshold: 3,
  successThreshold: 1,
  timeout: 60000, // 1 minute
  monitoringPeriod: 120000, // 2 minutes
});

/**
 * Create circuit breaker error response
 */
export function createCircuitBreakerResponse(serviceName: string, stats: CircuitBreakerStats): Response {
  const retryAfter = stats.nextAttemptTime
    ? Math.ceil((stats.nextAttemptTime - Date.now()) / 1000)
    : 30;

  return new Response(
    JSON.stringify({
      error: 'Service Unavailable',
      message: `${serviceName} is temporarily unavailable due to repeated failures`,
      circuitState: stats.state,
      retryAfter: `${retryAfter} seconds`,
    }),
    {
      status: 503,
      statusText: 'Service Unavailable',
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': retryAfter.toString(),
      },
    }
  );
}
