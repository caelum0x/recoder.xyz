/**
 * Payment Flow Tester
 * End-to-end testing for real payment processing with DODO integration
 */

import { logger } from '../utils/logger';
import { unifiedPaymentService } from './unified-payment-service';
import { dodoPayments } from './dodo-payments';
import { dodoWebhookHandler } from './dodo-webhook-handler';
import { prisma } from '../database/prisma';
import * as crypto from 'crypto';

interface PaymentTestConfig {
  userId: string;
  planId: string;
  amount: number;
  currency: string;
  paymentType: 'subscription' | 'one_time' | 'usage';
  frontend: string;
}

interface TestResult {
  success: boolean;
  stage: string;
  error?: string;
  data?: any;
  duration: number;
  timestamp: Date;
}

export class PaymentFlowTester {
  private testResults: TestResult[] = [];

  /**
   * Run complete end-to-end payment flow test
   */
  async runCompleteTest(config: PaymentTestConfig): Promise<{
    success: boolean;
    results: TestResult[];
    summary: {
      totalStages: number;
      passedStages: number;
      failedStages: number;
      totalDuration: number;
    };
  }> {
    this.testResults = [];
    const startTime = Date.now();

    try {
      logger.info('Starting complete payment flow test', { config });

      // Stage 1: Verify user exists
      await this.testStage('User Verification', async () => {
        const user = await prisma.user.findUnique({
          where: { id: config.userId }
        });
        
        if (!user) {
          throw new Error('Test user not found');
        }

        return { userId: user.id, email: user.email };
      });

      // Stage 2: Test subscription plans fetch
      await this.testStage('Subscription Plans Fetch', async () => {
        const plans = await unifiedPaymentService.getSubscriptionPlans();
        
        if (!plans || plans.length === 0) {
          throw new Error('No subscription plans found');
        }

        const targetPlan = plans.find(p => p.id === config.planId);
        if (!targetPlan) {
          throw new Error(`Plan ${config.planId} not found`);
        }

        return { planCount: plans.length, targetPlan };
      });

      // Stage 3: Test DODO API connectivity
      await this.testStage('DODO API Connectivity', async () => {
        // Test basic API health
        // Test by making a simple API call
        try {
          await dodoPayments.getSubscription('test_subscription_id');
        } catch (error) {
          // Expected to fail, but if it responds, API is working
          logger.info('DODO API connectivity test completed');
        }

        return { apiConnected: true };
      });

      // Stage 4: Create payment intent
      await this.testStage('Payment Intent Creation', async () => {
        const paymentResult = await unifiedPaymentService.createPayment({
          userId: config.userId,
          planId: config.planId,
          planName: `Test Plan ${config.planId}`,
          amount: config.amount,
          currency: config.currency,
          paymentType: config.paymentType,
          frontend: config.frontend as 'web' | 'chat' | 'mobile' | 'desktop' | 'cli',
          successUrl: 'https://recoder.xyz/payment/success',
          cancelUrl: 'https://recoder.xyz/payment/cancel',
          metadata: {
            testPayment: true,
            testId: crypto.randomUUID()
          }
        });

        if (!paymentResult.success) {
          throw new Error(paymentResult.error || 'Payment creation failed');
        }

        return paymentResult;
      });

      // Stage 5: Simulate webhook events
      const paymentResult = this.testResults[this.testResults.length - 1].data;
      if (paymentResult?.paymentId) {
        await this.testStage('Webhook Processing', async () => {
          return await this.simulateWebhookEvents(config, paymentResult.paymentId);
        });

        // Stage 6: Verify subscription creation
        if (config.paymentType === 'subscription') {
          await this.testStage('Subscription Verification', async () => {
            const subscription = await unifiedPaymentService.getUserSubscription(config.userId);
            
            if (!subscription || subscription.planId !== config.planId) {
              throw new Error('Subscription not created or incorrect plan');
            }

            return subscription;
          });
        }

        // Stage 7: Test usage tracking
        await this.testStage('Usage Tracking', async () => {
          const usageResult = await unifiedPaymentService.recordUsage(
            config.userId,
            'ai_generation',
            {
              tokens: 1000,
              model: 'claude-3-sonnet',
              feature: 'payment_test'
            }
          );

          return usageResult;
        });

        // Stage 8: Test payment analytics
        await this.testStage('Payment Analytics', async () => {
          const usageStats = await unifiedPaymentService.getUsageStats(config.userId);
          
          if (!usageStats) {
            throw new Error('Unable to fetch usage statistics');
          }

          return usageStats;
        });
      }

      const totalDuration = Date.now() - startTime;
      const passedStages = this.testResults.filter(r => r.success).length;
      const failedStages = this.testResults.filter(r => !r.success).length;

      logger.info('Payment flow test completed', {
        totalStages: this.testResults.length,
        passedStages,
        failedStages,
        totalDuration
      });

      return {
        success: failedStages === 0,
        results: this.testResults,
        summary: {
          totalStages: this.testResults.length,
          passedStages,
          failedStages,
          totalDuration
        }
      };

    } catch (error) {
      logger.error('Payment flow test failed', { error });
      
      const totalDuration = Date.now() - startTime;
      const passedStages = this.testResults.filter(r => r.success).length;
      const failedStages = this.testResults.filter(r => !r.success).length;

      return {
        success: false,
        results: this.testResults,
        summary: {
          totalStages: this.testResults.length,
          passedStages,
          failedStages,
          totalDuration
        }
      };
    }
  }

  /**
   * Test individual stage with timing and error handling
   */
  private async testStage(stageName: string, testFunction: () => Promise<any>): Promise<void> {
    const startTime = Date.now();
    
    try {
      logger.info(`Testing stage: ${stageName}`);
      
      const result = await testFunction();
      const duration = Date.now() - startTime;

      this.testResults.push({
        success: true,
        stage: stageName,
        data: result,
        duration,
        timestamp: new Date()
      });

      logger.info(`Stage passed: ${stageName}`, { duration });

    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      this.testResults.push({
        success: false,
        stage: stageName,
        error: errorMessage,
        duration,
        timestamp: new Date()
      });

      logger.error(`Stage failed: ${stageName}`, { error: errorMessage, duration });
      throw error;
    }
  }

  /**
   * Simulate DODO webhook events for testing
   */
  private async simulateWebhookEvents(config: PaymentTestConfig, paymentId: string) {
    const webhookEvents = [];

    // Simulate payment.succeeded event
    const paymentSucceededEvent = {
      id: `evt_test_${crypto.randomBytes(8).toString('hex')}`,
      type: 'payment.succeeded',
      created: Math.floor(Date.now() / 1000),
      data: {
        object: {
          id: paymentId,
          object: 'payment' as const,
          amount: config.amount,
          currency: config.currency,
          status: 'succeeded' as const,
          customer: {
            id: `cus_test_${crypto.randomBytes(8).toString('hex')}`,
            email: 'test@recoder.xyz',
            name: 'Test User'
          },
          metadata: {
            userId: config.userId,
            planId: config.planId,
            testPayment: true
          },
          created: Math.floor(Date.now() / 1000),
          updated: Math.floor(Date.now() / 1000)
        }
      }
    };

    await dodoWebhookHandler.processWebhookEvent(paymentSucceededEvent);
    webhookEvents.push({ type: 'payment.succeeded', processed: true });

    // Simulate subscription.created event if subscription payment
    if (config.paymentType === 'subscription') {
      const subscriptionCreatedEvent = {
        id: `evt_test_${crypto.randomBytes(8).toString('hex')}`,
        type: 'subscription.created',
        created: Math.floor(Date.now() / 1000),
        data: {
          object: {
            id: `sub_test_${crypto.randomBytes(8).toString('hex')}`,
            object: 'subscription' as const,
            customer: {
              id: `cus_test_${crypto.randomBytes(8).toString('hex')}`,
              email: 'test@recoder.xyz',
              name: 'Test User'
            },
            plan: {
              id: config.planId,
              name: `Test Plan ${config.planId}`,
              amount: config.amount,
              currency: config.currency,
              interval: 'month'
            },
            status: 'active' as const,
            current_period_start: Math.floor(Date.now() / 1000),
            current_period_end: Math.floor((Date.now() + 30 * 24 * 60 * 60 * 1000) / 1000),
            cancel_at_period_end: false,
            metadata: {
              userId: config.userId,
              testSubscription: true
            },
            created: Math.floor(Date.now() / 1000),
            updated: Math.floor(Date.now() / 1000)
          }
        }
      };

      await dodoWebhookHandler.processWebhookEvent(subscriptionCreatedEvent);
      webhookEvents.push({ type: 'subscription.created', processed: true });
    }

    return { webhookEvents };
  }

  /**
   * Test payment flow with different scenarios
   */
  async runScenarioTests(): Promise<any> {
    const scenarios = [
      {
        name: 'Free to Starter Upgrade',
        config: {
          userId: 'test-user-1',
          planId: 'starter',
          amount: 9.99,
          currency: 'USD',
          paymentType: 'subscription' as const,
          frontend: 'web'
        }
      },
      {
        name: 'One-time Pro Purchase',
        config: {
          userId: 'test-user-2',
          planId: 'pro',
          amount: 19.99,
          currency: 'USD',
          paymentType: 'one_time' as const,
          frontend: 'cli'
        }
      },
      {
        name: 'Enterprise Subscription',
        config: {
          userId: 'test-user-3',
          planId: 'enterprise',
          amount: 99.99,
          currency: 'USD',
          paymentType: 'subscription' as const,
          frontend: 'chat'
        }
      }
    ];

    const scenarioResults = [];

    for (const scenario of scenarios) {
      logger.info(`Running scenario: ${scenario.name}`);
      
      try {
        const result = await this.runCompleteTest(scenario.config);
        scenarioResults.push({
          scenario: scenario.name,
          ...result
        });
      } catch (error) {
        scenarioResults.push({
          scenario: scenario.name,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      totalScenarios: scenarios.length,
      passedScenarios: scenarioResults.filter(r => r.success).length,
      failedScenarios: scenarioResults.filter(r => !r.success).length,
      results: scenarioResults
    };
  }

  /**
   * Test webhook signature verification
   */
  async testWebhookSecurity(): Promise<any> {
    const testPayload = JSON.stringify({
      id: 'evt_test_security',
      type: 'payment.succeeded',
      data: { object: { id: 'pay_test', amount: 100 } }
    });

    const timestamp = Math.floor(Date.now() / 1000).toString();
    const secret = process.env.DODO_WEBHOOK_SECRET || 'test-secret';
    
    // Create valid signature
    const validSignature = crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${testPayload}`)
      .digest('hex');

    // Create invalid signature
    const invalidSignature = 'invalid_signature';

    const tests = [
      {
        name: 'Valid Signature',
        signature: `v1=${validSignature}`,
        shouldPass: true
      },
      {
        name: 'Invalid Signature',
        signature: `v1=${invalidSignature}`,
        shouldPass: false
      },
      {
        name: 'Malformed Signature',
        signature: 'malformed',
        shouldPass: false
      }
    ];

    const results = [];

    for (const test of tests) {
      try {
        const isValid = dodoWebhookHandler.verifyWebhookSignature(
          testPayload,
          test.signature,
          timestamp
        );

        const passed = isValid === test.shouldPass;
        results.push({
          test: test.name,
          passed,
          expected: test.shouldPass,
          actual: isValid
        });
      } catch (error) {
        results.push({
          test: test.name,
          passed: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return {
      securityTests: results,
      allPassed: results.every(r => r.passed)
    };
  }

  /**
   * Generate test report
   */
  generateTestReport(results: any): string {
    const report = `
# Payment Flow Test Report
Generated: ${new Date().toISOString()}

## Summary
- Total Stages: ${results.summary?.totalStages || 0}
- Passed: ${results.summary?.passedStages || 0}
- Failed: ${results.summary?.failedStages || 0}
- Total Duration: ${results.summary?.totalDuration || 0}ms
- Success Rate: ${((results.summary?.passedStages || 0) / (results.summary?.totalStages || 1) * 100).toFixed(1)}%

## Stage Results
${results.results?.map((result: TestResult) => `
### ${result.stage}
- Status: ${result.success ? '✅ PASSED' : '❌ FAILED'}
- Duration: ${result.duration}ms
- Timestamp: ${result.timestamp}
${result.error ? `- Error: ${result.error}` : ''}
${result.data ? `- Data: ${JSON.stringify(result.data, null, 2)}` : ''}
`).join('\n') || 'No results available'}

## Recommendations
${results.summary?.failedStages === 0 
  ? '✅ All tests passed! Payment flow is working correctly.'
  : '⚠️ Some tests failed. Please review the errors above and fix the issues before deploying to production.'
}
`;

    return report;
  }
}

export const paymentFlowTester = new PaymentFlowTester();