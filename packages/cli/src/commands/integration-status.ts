/**
 * Integration Status Command
 * Shows the status of all monorepo package integrations
 */

import chalk from 'chalk'
import { Command } from 'commander'
import { Logger } from '../utils/logger'
import { packageIntegration } from '../services/package-integration'

export function createIntegrationStatusCommand(): Command {
  const command = new Command('integration-status')
    .alias('status')
    .description('📊 Show integration status of all monorepo packages')
    .option('--detailed', 'Show detailed integration information')
    .option('--test', 'Test all available integrations')
    .action(async (options) => {
      try {
        console.log(chalk.cyan('🔍 Checking integration status...\n'))

        // Get integration status
        const status = packageIntegration.getIntegrationStatus()

        // Display header
        console.log(chalk.bold('📦 RECODER CLI PACKAGE INTEGRATIONS'))
        console.log(chalk.gray('─'.repeat(50)))

        // Overall status
        const statusIcon = status.fullyIntegrated ? '✅' : status.available.length > 0 ? '⚠️' : '❌'
        const statusText = status.fullyIntegrated ? 'Fully Integrated' : 
                          status.available.length > 0 ? 'Partially Integrated' : 'Not Integrated'
        
        console.log(`${statusIcon} Overall Status: ${chalk.bold(statusText)}`)
        console.log(`📊 Initialized: ${status.initialized ? chalk.green('Yes') : chalk.red('No')}`)
        console.log(`🔢 Available: ${chalk.yellow(status.available.length)}/7 packages\n`)

        // Individual package status
        console.log(chalk.bold('📋 Package Status:'))
        
        const packages = [
          { name: 'Analytics', key: 'analytics', description: 'Monitoring, cost tracking, performance metrics' },
          { name: 'Intelligence', key: 'intelligence', description: 'AI optimization, learning, recommendations' },
          { name: 'Security', key: 'security', description: 'Vulnerability scanning, prompt sanitization' },
          { name: 'CLI Router', key: 'router', description: 'Optimal AI provider routing (recoder-code-router)' },
          { name: 'Types', key: 'types', description: 'Type definitions and validation' },
          { name: 'Backend', key: 'backend', description: 'User authentication, quota tracking, project sync' },
          { name: 'Production Engine', key: 'productionEngine', description: 'Real code generation and validation' }
        ]

        packages.forEach(pkg => {
          const isAvailable = (status as any)[pkg.key]
          const icon = isAvailable ? '✅' : '❌'
          const statusColor = isAvailable ? chalk.green : chalk.red
          const statusMsg = isAvailable ? 'Available' : 'Not Available'
          
          console.log(`  ${icon} ${chalk.bold(pkg.name)}: ${statusColor(statusMsg)}`)
          if (options.detailed) {
            console.log(`     ${chalk.gray(pkg.description)}`)
            
            // Show additional details for backend and production engine
            if (pkg.key === 'backend' && packageIntegration.backend) {
              const backendStatus = packageIntegration.backend.getStatus()
              console.log(`     ${chalk.gray('Status: ' + backendStatus)}`)
            }
            if (pkg.key === 'productionEngine' && packageIntegration.productionEngine) {
              const engineStatus = packageIntegration.productionEngine.getStatus()
              console.log(`     ${chalk.gray('Status: ' + engineStatus)}`)
            }
          }
        })

        // Show available integrations
        if (status.available.length > 0) {
          console.log(`\n🔧 Active Integrations: ${chalk.cyan(status.available.join(', '))}`)
        }

        // Test integrations if requested
        if (options.test) {
          console.log(chalk.cyan('\n🧪 Testing integrations...\n'))
          await testIntegrations()
        }

        // Show recommendations
        console.log(chalk.yellow('\n💡 Recommendations:'))
        if (!status.fullyIntegrated) {
          console.log('  • Install missing packages to enable full functionality')
          console.log('  • Run `npm install` to ensure all dependencies are available')
        }
        if (status.router) {
          console.log('  • CLI Router (recoder-code-router) is available for optimal AI routing')
        }
        if (status.analytics) {
          console.log('  • Analytics tracking is enabled for cost optimization')
        }
        if (status.security) {
          console.log('  • Security scanning is active for vulnerability detection')
        }

        console.log(chalk.gray('\n' + '─'.repeat(50)))
        console.log(chalk.gray('Use --detailed flag for more information'))
        console.log(chalk.gray('Use --test flag to test all integrations'))

      } catch (error) {
        Logger.error('Failed to get integration status:', error)
        process.exit(1)
      }
    })

  return command
}

/**
 * Test all available integrations
 */
async function testIntegrations() {
  const tests = [
    {
      name: 'Analytics',
      test: () => {
        if (!packageIntegration.analytics.isAvailable()) return 'Not Available'
        
        // Test usage tracking
        packageIntegration.analytics.trackUsage('integration_test', { 
          test: true, 
          timestamp: new Date().toISOString() 
        })
        
        // Test metrics retrieval
        const metrics = packageIntegration.analytics.getPerformanceMetrics()
        return metrics !== null ? 'Working' : 'Limited Functionality'
      }
    },
    {
      name: 'Intelligence',
      test: () => {
        if (!packageIntegration.intelligence.isAvailable()) return 'Not Available'
        
        // Test performance optimization
        const testContext = { type: 'test', complexity: 'simple', priority: 'speed' }
        const optimized = packageIntegration.intelligence.optimizePerformance(testContext)
        
        // Test recommendations
        const recommendations = packageIntegration.intelligence.getRecommendations({ test: true })
        
        return optimized && Array.isArray(recommendations) ? 'Working' : 'Limited Functionality'
      }
    },
    {
      name: 'Security',
      test: () => {
        if (!packageIntegration.security.isAvailable()) return 'Not Available'
        
        // Test prompt sanitization
        const testPrompt = 'Test prompt with potential issues'
        const sanitized = packageIntegration.security.sanitizePrompt(testPrompt)
        
        // Test vulnerability scanning
        const testCode = 'console.log("Hello World")'
        const vulnerabilities = packageIntegration.security.scanForVulnerabilities(testCode)
        
        return sanitized && Array.isArray(vulnerabilities) ? 'Working' : 'Limited Functionality'
      }
    },
    {
      name: 'CLI Router',
      test: () => {
        if (!packageIntegration.router.isAvailable()) return 'Not Available'
        
        // Test provider listing
        const providers = packageIntegration.router.getAvailableProviders()
        
        // Test optimal provider selection (with fallback)
        const criteria = { type: 'test', priority: 'speed' }
        const selected = packageIntegration.router.selectOptimalProvider(criteria)
        
        return Array.isArray(providers) ? 'Working' : 'Limited Functionality'
      }
    },
    {
      name: 'Types',
      test: () => {
        if (!packageIntegration.types.isAvailable()) return 'Not Available'
        
        // Test provider validation
        const isValid = packageIntegration.types.validateProvider('test-provider')
        
        // Test configuration validation
        const configValid = packageIntegration.types.validateConfiguration({ test: true })
        
        return typeof isValid === 'boolean' && typeof configValid === 'boolean' ? 'Working' : 'Limited Functionality'
      }
    },
    {
      name: 'Backend',
      test: () => {
        if (!packageIntegration.backend.isAvailable()) return 'Not Available'
        
        // Test basic functionality
        const session = packageIntegration.backend.getCurrentSession()
        const isAuth = packageIntegration.backend.isAuthenticated()
        const isOnline = packageIntegration.backend.isOnline()
        
        return typeof isAuth === 'boolean' ? 'Working' : 'Limited Functionality'
      }
    },
    {
      name: 'Production Engine',
      test: () => {
        if (!packageIntegration.productionEngine.isAvailable()) return 'Not Available'
        
        // Test basic functionality
        const isConnected = packageIntegration.productionEngine.isEngineConnected()
        const capabilities = packageIntegration.productionEngine.getCapabilities()
        
        return Array.isArray(capabilities) ? 'Working' : 'Limited Functionality'
      }
    }
  ]

  for (const { name, test } of tests) {
    try {
      const result = test()
      const icon = result === 'Working' ? '✅' : result === 'Limited Functionality' ? '⚠️' : '❌'
      const color = result === 'Working' ? chalk.green : result === 'Limited Functionality' ? chalk.yellow : chalk.red
      
      console.log(`  ${icon} ${name}: ${color(result)}`)
    } catch (error) {
      console.log(`  ❌ ${name}: ${chalk.red('Test Failed')} - ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  console.log('')
}