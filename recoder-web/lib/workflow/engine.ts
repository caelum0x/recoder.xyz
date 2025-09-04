import { prisma } from '@/lib/prisma'
import { WebSocket } from 'ws'
import { spawn } from 'child_process'
import { promises as fs } from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

// Workflow execution context
export interface WorkflowContext {
  executionId: string
  workflowId: string
  userId: string
  projectId?: string
  variables: Record<string, any>
  outputs: Record<string, any>
  stepResults: Map<string, any>
  startTime: number
  metadata: Record<string, any>
}

// Step execution result
export interface StepResult {
  success: boolean
  output?: any
  error?: string
  duration: number
  metadata?: Record<string, any>
}

// Workflow step definition
export interface WorkflowStep {
  id: string
  type: string
  name: string
  description?: string
  config: Record<string, any>
  dependencies: string[]
  retryPolicy?: {
    maxRetries: number
    backoffMs: number
  }
  timeout?: number
  condition?: string
}

// Workflow execution engine
export class WorkflowExecutionEngine {
  private wsConnections = new Map<string, WebSocket>()
  private activeExecutions = new Map<string, WorkflowContext>()

  async executeWorkflow(
    workflowId: string,
    userId: string,
    triggerData: Record<string, any> = {},
    variables: Record<string, any> = {}
  ): Promise<string> {
    
    // Mock workflow execution for development
    // In production, this would fetch from database
    const executionId = `exec_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    const mockWorkflow = {
      id: workflowId,
      userId,
      name: `Workflow ${workflowId}`,
      isActive: true,
      definition: {
        variables: { environment: 'development' },
        steps: []
      }
    }

    if (!mockWorkflow.isActive) {
      throw new Error('Workflow is not active')
    }

    // Create mock execution context
    const context: WorkflowContext = {
      executionId: executionId,
      workflowId,
      userId,
      projectId: undefined,
      variables: { ...mockWorkflow.definition.variables, ...variables },
      outputs: {},
      stepResults: new Map(),
      startTime: Date.now(),
      metadata: { triggerData }
    }

    this.activeExecutions.set(executionId, context)

    // Execute workflow asynchronously
    this.executeWorkflowSteps([], context)
      .catch(async (error) => {
        console.error(`Workflow execution ${executionId} failed:`, error)
        await this.markExecutionFailed(executionId, error.message)
      })

    return executionId
  }

  private async executeWorkflowSteps(steps: WorkflowStep[], context: WorkflowContext): Promise<void> {
    const stepMap = new Map(steps.map(step => [step.id, step]))
    const completedSteps = new Set<string>()
    const failedSteps = new Set<string>()
    const totalSteps = steps.length
    let completedCount = 0

    // Build dependency graph
    const getDependencies = (stepId: string): string[] => {
      const step = stepMap.get(stepId)
      return step?.dependencies || []
    }

    const canExecuteStep = (stepId: string): boolean => {
      const dependencies = getDependencies(stepId)
      return dependencies.every(dep => completedSteps.has(dep) && !failedSteps.has(dep))
    }

    // Execute steps in dependency order
    while (completedCount < totalSteps && failedSteps.size === 0) {
      const readySteps = steps.filter(step => 
        !completedSteps.has(step.id) && 
        !failedSteps.has(step.id) && 
        canExecuteStep(step.id)
      )

      if (readySteps.length === 0) {
        // Check for remaining incomplete steps
        const remainingSteps = steps.filter(step => !completedSteps.has(step.id))
        if (remainingSteps.length > 0) {
          throw new Error(`Workflow stuck - cannot execute remaining steps: ${remainingSteps.map(s => s.name).join(', ')}`)
        }
        break
      }

      // Execute ready steps in parallel
      const stepPromises = readySteps.map(async (step) => {
        try {
          const result = await this.executeStep(step, context)
          if (result.success) {
            completedSteps.add(step.id)
            context.stepResults.set(step.id, result)
            completedCount++
            
            // Update progress
            const progress = Math.round((completedCount / totalSteps) * 100)
            await this.updateExecutionProgress(context.executionId, progress, step.id)
            
            return { stepId: step.id, success: true, result }
          } else {
            failedSteps.add(step.id)
            throw new Error(`Step ${step.name} failed: ${result.error}`)
          }
        } catch (error) {
          failedSteps.add(step.id)
          console.error(`Step ${step.id} execution failed:`, error)
          throw error
        }
      })

      await Promise.all(stepPromises)
    }

    if (failedSteps.size > 0) {
      throw new Error(`Workflow failed - ${failedSteps.size} step(s) failed`)
    }

    // Mark execution as completed
    await this.markExecutionCompleted(context.executionId, context.outputs)
  }

  private async executeStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    // Check condition if present
    if (step.condition) {
      const conditionResult = this.evaluateCondition(step.condition, context)
      if (!conditionResult) {
        return {
          success: true,
          output: { skipped: true, reason: 'condition not met' },
          duration: Date.now() - startTime
        }
      }
    }

    let attempt = 0
    const maxRetries = step.retryPolicy?.maxRetries || 1
    const backoffMs = step.retryPolicy?.backoffMs || 1000

    while (attempt < maxRetries) {
      try {
        const result = await this.executeStepLogic(step, context)
        
        // Store step output for use by other steps
        if (result.output) {
          context.outputs[step.id] = result.output
        }

        return result

      } catch (error) {
        attempt++
        console.error(`Step ${step.id} attempt ${attempt} failed:`, error)

        if (attempt >= maxRetries) {
          return {
            success: false,
            error: error instanceof Error ? error.message : String(error),
            duration: Date.now() - startTime
          }
        }

        // Wait before retry
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, backoffMs * attempt))
        }
      }
    }

    return {
      success: false,
      error: 'Max retries exceeded',
      duration: Date.now() - startTime
    }
  }

  private async executeStepLogic(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()

    switch (step.type) {
      case 'build':
        return await this.executeBuildStep(step, context)
      
      case 'test':
        return await this.executeTestStep(step, context)
      
      case 'deploy':
        return await this.executeDeployStep(step, context)
      
      case 'media-processing':
        return await this.executeMediaProcessingStep(step, context)
      
      case 'ai-consensus':
        return await this.executeAIConsensusStep(step, context)
      
      case 'notification':
        return await this.executeNotificationStep(step, context)
      
      case 'conditional':
        return await this.executeConditionalStep(step, context)
      
      case 'parallel':
        return await this.executeParallelStep(step, context)
      
      case 'custom':
        return await this.executeCustomStep(step, context)
      
      default:
        throw new Error(`Unknown step type: ${step.type}`)
    }
  }

  private async executeBuildStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { command = 'npm run build', directory = '.' } = step.config
      
      // Execute build command (simplified - in production would use child_process)
      const buildResult = await this.executeCommand(command, directory, context)
      
      return {
        success: true,
        output: buildResult,
        duration: Date.now() - startTime,
        metadata: { command, directory }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  private async executeTestStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { command = 'npm test', directory = '.', coverage = false } = step.config
      
      const testResult = await this.executeCommand(command, directory, context)
      
      return {
        success: true,
        output: { 
          ...testResult,
          coverage: coverage ? await this.getCoverageReport(directory) : null
        },
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  private async executeDeployStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { platform, config } = step.config
      
      // Integrate with existing deployment automation
      const deploymentResult = await fetch('/api/deployment/deploy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          platform,
          projectId: context.projectId,
          config
        })
      })

      const result = await deploymentResult.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Deployment failed')
      }

      return {
        success: true,
        output: result.deployment,
        duration: Date.now() - startTime,
        metadata: { platform, deploymentId: result.deployment?.id }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  private async executeMediaProcessingStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { operation, files, parameters } = step.config
      
      // Integrate with existing media processing
      const processingResult = await fetch('/api/media-processing/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation,
          files,
          parameters
        })
      })

      const result = await processingResult.json()
      
      if (!result.success) {
        throw new Error(result.error || 'Media processing failed')
      }

      return {
        success: true,
        output: result.job,
        duration: Date.now() - startTime,
        metadata: { operation, jobId: result.job?.id }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  private async executeAIConsensusStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { prompt, validationTypes = ['syntax', 'logic'] } = step.config
      
      // Integrate with existing AI consensus system
      const consensusResult = await fetch('/api/ai-consensus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          validationTypes,
          projectId: context.projectId
        })
      })

      const result = await consensusResult.json()
      
      if (!result.success) {
        throw new Error(result.error || 'AI consensus failed')
      }

      return {
        success: true,
        output: result.consensus,
        duration: Date.now() - startTime,
        metadata: { consensusScore: result.consensus.score }
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  private async executeNotificationStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { type, recipients, message, template } = step.config
      
      // Send notifications (email, Slack, webhook, etc.)
      const notifications = await Promise.all(
        recipients.map(async (recipient: string) => {
          return await this.sendNotification(type, recipient, message, template, context)
        })
      )

      return {
        success: true,
        output: { sent: notifications.length, recipients },
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  private async executeConditionalStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { condition, trueSteps = [], falseSteps = [] } = step.config
      
      const conditionResult = this.evaluateCondition(condition, context)
      const stepsToExecute = conditionResult ? trueSteps : falseSteps
      
      // Execute conditional steps
      const results: StepResult[] = []
      for (const stepConfig of stepsToExecute) {
        const stepResult = await this.executeStepLogic(stepConfig, context)
        results.push(stepResult)
        if (!stepResult.success) {
          break
        }
      }

      return {
        success: results.every(r => r.success),
        output: { conditionResult, results },
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  private async executeParallelStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { steps: parallelSteps } = step.config
      
      // Execute steps in parallel
      const results = await Promise.allSettled(
        parallelSteps.map((stepConfig: WorkflowStep) => 
          this.executeStepLogic(stepConfig, context)
        )
      )

      const successful = results.filter(r => r.status === 'fulfilled' && r.value.success)
      const failed = results.filter(r => r.status === 'rejected' || !r.value.success)

      return {
        success: failed.length === 0,
        output: { 
          successful: successful.length, 
          failed: failed.length,
          results: results.map(r => r.status === 'fulfilled' ? r.value : { success: false, error: 'Promise rejected' })
        },
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  private async executeCustomStep(step: WorkflowStep, context: WorkflowContext): Promise<StepResult> {
    const startTime = Date.now()
    
    try {
      const { script, runtime = 'javascript' } = step.config
      
      // Execute custom script (simplified - in production would sandbox this)
      let result
      if (runtime === 'javascript') {
        result = await this.executeJavaScript(script, context)
      } else {
        throw new Error(`Unsupported runtime: ${runtime}`)
      }

      return {
        success: true,
        output: result,
        duration: Date.now() - startTime
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime
      }
    }
  }

  // Get all executions with optional filtering
  async getAllExecutions(userId?: string, filters?: {
    status?: string;
    workflowId?: string;
    limit?: number;
    offset?: number;
  }): Promise<any[]> {
    try {
      // Try to use database if workflow models exist
      const where: any = {}
      
      if (userId) {
        where.userId = userId
      }
      
      if (filters?.status && filters.status !== 'all') {
        where.status = filters.status
      }
      
      if (filters?.workflowId && filters.workflowId !== 'all') {
        where.workflowId = filters.workflowId
      }

      // Check if workflow models exist in Prisma schema
      if (prisma.workflowExecution) {
        const executions = await prisma.workflowExecution.findMany({
          where,
          orderBy: { startedAt: 'desc' },
          take: filters?.limit || 50,
          skip: filters?.offset || 0,
          include: {
            workflow: {
              select: { name: true, id: true }
            },
            user: {
              select: { name: true, email: true }
            }
          }
        })

        return executions.map(execution => ({
          id: execution.id,
          workflowId: execution.workflowId,
          workflowName: execution.workflow?.name || `Workflow ${execution.workflowId}`,
          userId: execution.userId,
          userName: execution.user?.name || execution.user?.email || 'Unknown User',
          status: execution.status,
          progress: execution.progress || 0,
          currentStep: execution.currentStep,
          startedAt: execution.startedAt,
          completedAt: execution.completedAt,
          error: execution.error,
          triggerData: execution.triggerData,
          variables: execution.variables,
          outputs: execution.outputs
        }))
      }
    } catch (error) {
      console.error('Error fetching workflow executions from database:', error)
    }
    
    // Fallback to mock data for development
    return this.getMockExecutions()
  }

  // Mock data for development when database is not available
  private getMockExecutions(): any[] {
    const statuses = ['completed', 'running', 'failed', 'queued']
    const mockExecutions: any[] = []
    
    for (let i = 0; i < 10; i++) {
      const status = statuses[Math.floor(Math.random() * statuses.length)]
      const startTime = new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000) // Last 7 days
      
      mockExecutions.push({
        id: `exec_${i + 1}`,
        workflowId: `workflow_${Math.floor(Math.random() * 5) + 1}`,
        workflowName: `Sample Workflow ${Math.floor(Math.random() * 5) + 1}`,
        userId: 'user_1',
        userName: 'Test User',
        status,
        progress: status === 'completed' ? 100 : status === 'running' ? Math.floor(Math.random() * 80) + 10 : 0,
        currentStep: status === 'running' ? `Step ${Math.floor(Math.random() * 5) + 1}` : undefined,
        startedAt: startTime,
        completedAt: status === 'completed' || status === 'failed' ? 
          new Date(startTime.getTime() + Math.random() * 30 * 60 * 1000) : undefined, // Up to 30 minutes later
        error: status === 'failed' ? 'Sample error message' : undefined,
        triggerData: { trigger: 'manual' },
        variables: { environment: 'development' },
        outputs: status === 'completed' ? { result: 'success' } : undefined
      })
    }
    
    return mockExecutions.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
  }

  // Helper methods
  private evaluateCondition(condition: string, context: WorkflowContext): boolean {
    try {
      // Simple condition evaluation (in production, use a safe evaluator)
      const func = new Function('context', `return ${condition}`)
      return Boolean(func(context))
    } catch (error) {
      console.error('Condition evaluation error:', error)
      return false
    }
  }

  private async executeCommand(command: string, directory: string, context: WorkflowContext): Promise<any> {
    return new Promise((resolve, reject) => {
      const [cmd, ...args] = command.split(' ')
      const child = spawn(cmd, args, {
        cwd: directory,
        shell: true,
        stdio: ['pipe', 'pipe', 'pipe']
      })

      let stdout = ''
      let stderr = ''

      child.stdout?.on('data', (data) => {
        stdout += data.toString()
      })

      child.stderr?.on('data', (data) => {
        stderr += data.toString()
      })

      child.on('close', (code) => {
        if (code === 0) {
          resolve({
            command,
            directory,
            exitCode: code,
            stdout: stdout.trim(),
            stderr: stderr.trim()
          })
        } else {
          reject(new Error(`Command failed with exit code ${code}: ${stderr || stdout}`))
        }
      })

      child.on('error', (error) => {
        reject(new Error(`Failed to execute command: ${error.message}`))
      })

      // Set timeout for long-running commands
      setTimeout(() => {
        child.kill('SIGTERM')
        reject(new Error('Command execution timeout'))
      }, 300000) // 5 minutes
    })
  }

  private async getCoverageReport(directory: string): Promise<any> {
    try {
      // Try to read coverage report from common locations
      const possiblePaths = [
        path.join(directory, 'coverage/coverage-summary.json'),
        path.join(directory, 'coverage/lcov-report/index.html'),
        path.join(directory, 'coverage/index.html'),
        path.join(directory, 'coverage.json')
      ]

      for (const filePath of possiblePaths) {
        try {
          const exists = await fs.access(filePath).then(() => true).catch(() => false)
          if (exists) {
            if (filePath.endsWith('.json')) {
              const content = await fs.readFile(filePath, 'utf-8')
              return JSON.parse(content)
            } else {
              // For HTML files, return basic info
              return { 
                path: filePath, 
                type: 'html',
                message: 'Coverage report available'
              }
            }
          }
        } catch (error) {
          continue
        }
      }

      return { 
        coverage: 'N/A', 
        message: 'No coverage report found' 
      }
    } catch (error) {
      return { 
        error: 'Failed to read coverage report',
        details: error instanceof Error ? error.message : String(error)
      }
    }
  }

  private async sendNotification(type: string, recipient: string, message: string, template: string, context: WorkflowContext): Promise<boolean> {
    try {
      switch (type.toLowerCase()) {
        case 'email':
          return await this.sendEmailNotification(recipient, message, template, context)
        
        case 'slack':
          return await this.sendSlackNotification(recipient, message, context)
        
        case 'webhook':
          return await this.sendWebhookNotification(recipient, message, context)
        
        case 'discord':
          return await this.sendDiscordNotification(recipient, message, context)
        
        default:
          console.error(`Unknown notification type: ${type}`)
          return false
      }
    } catch (error) {
      console.error(`Failed to send ${type} notification:`, error)
      return false
    }
  }

  private async sendEmailNotification(recipient: string, message: string, template: string, context: WorkflowContext): Promise<boolean> {
    try {
      // Use your preferred email service (SendGrid, AWS SES, etc.)
      const response = await fetch('/api/notifications/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: recipient,
          subject: `Workflow ${context.workflowId} Update`,
          message,
          template,
          context: {
            workflowId: context.workflowId,
            executionId: context.executionId,
            userId: context.userId
          }
        })
      })

      return response.ok
    } catch (error) {
      console.error('Email notification failed:', error)
      return false
    }
  }

  private async sendSlackNotification(webhook: string, message: string, context: WorkflowContext): Promise<boolean> {
    try {
      const slackMessage = {
        text: `Workflow Update: ${context.workflowId}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: message
            }
          },
          {
            type: 'context',
            elements: [
              {
                type: 'mrkdwn',
                text: `Execution ID: ${context.executionId} | Workflow: ${context.workflowId}`
              }
            ]
          }
        ]
      }

      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage)
      })

      return response.ok
    } catch (error) {
      console.error('Slack notification failed:', error)
      return false
    }
  }

  private async sendWebhookNotification(url: string, message: string, context: WorkflowContext): Promise<boolean> {
    try {
      const payload = {
        event: 'workflow_update',
        timestamp: new Date().toISOString(),
        data: {
          workflowId: context.workflowId,
          executionId: context.executionId,
          userId: context.userId,
          message,
          variables: context.variables,
          outputs: context.outputs
        }
      }

      const response = await fetch(url, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'User-Agent': 'Recoder-Workflow-Engine/1.0'
        },
        body: JSON.stringify(payload)
      })

      return response.ok
    } catch (error) {
      console.error('Webhook notification failed:', error)
      return false
    }
  }

  private async sendDiscordNotification(webhook: string, message: string, context: WorkflowContext): Promise<boolean> {
    try {
      const discordMessage = {
        content: message,
        embeds: [
          {
            title: `Workflow ${context.workflowId}`,
            description: message,
            color: 0x00ff00, // Green color
            fields: [
              {
                name: 'Execution ID',
                value: context.executionId,
                inline: true
              },
              {
                name: 'User ID',
                value: context.userId,
                inline: true
              }
            ],
            timestamp: new Date().toISOString()
          }
        ]
      }

      const response = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(discordMessage)
      })

      return response.ok
    } catch (error) {
      console.error('Discord notification failed:', error)
      return false
    }
  }

  private async executeJavaScript(script: string, context: WorkflowContext): Promise<any> {
    try {
      // Use Node.js built-in vm module for safer execution
      const vm = require('vm')
      
      // Create a restricted sandbox
      const sandbox: any = {
        // Provide safe access to context data
        workflowId: context.workflowId,
        executionId: context.executionId,
        userId: context.userId,
        variables: JSON.parse(JSON.stringify(context.variables)), // Deep copy
        outputs: JSON.parse(JSON.stringify(context.outputs)), // Deep copy
        stepResults: Object.fromEntries(context.stepResults),
        
        // Provide safe utilities
        console: {
          log: (...args: any[]) => console.log('[Workflow Script]:', ...args),
          error: (...args: any[]) => console.error('[Workflow Script]:', ...args),
          warn: (...args: any[]) => console.warn('[Workflow Script]:', ...args)
        },
        
        // Safe operations
        JSON: JSON,
        Date: Date,
        Math: Math,
        String: String,
        Number: Number,
        Array: Array,
        Object: {
          keys: Object.keys,
          values: Object.values,
          entries: Object.entries,
          assign: Object.assign
        },
        
        // Result holder
        __result: undefined
      }

      // Create VM context
      vm.createContext(sandbox)

      // Wrap script to capture result
      const wrappedScript = `
        try {
          __result = (function() {
            ${script}
          })();
        } catch (error) {
          __result = { error: error.message };
        }
      `

      // Execute with timeout
      vm.runInContext(wrappedScript, sandbox, {
        timeout: 30000, // 30 seconds
        displayErrors: true
      })

      return {
        success: !sandbox.__result?.error,
        result: sandbox.__result,
        executionTime: Date.now(),
        context: {
          workflowId: context.workflowId,
          executionId: context.executionId
        }
      }
    } catch (error) {
      console.error('JavaScript execution failed:', error)
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        context: {
          workflowId: context.workflowId,
          executionId: context.executionId
        }
      }
    }
  }

  private async updateExecutionProgress(executionId: string, progress: number, currentStep?: string): Promise<void> {
    try {
      // Try to update database if workflow models exist
      if (prisma.workflowExecution) {
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: { 
            progress,
            ...(currentStep && { currentStep })
          }
        })
      }
    } catch (error) {
      console.error('Failed to update execution progress in database:', error)
      // Continue execution even if database update fails
    }

    // Send WebSocket update if connection exists
    const ws = this.wsConnections.get(executionId)
    if (ws) {
      ws.send(JSON.stringify({
        type: 'progress',
        executionId,
        progress,
        currentStep
      }))
    }
  }

  private async markExecutionCompleted(executionId: string, outputs: Record<string, any>): Promise<void> {
    try {
      // Try to update database if workflow models exist
      if (prisma.workflowExecution) {
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'completed',
            completedAt: new Date(),
            progress: 100,
            outputs
          }
        })
      }
    } catch (error) {
      console.error('Failed to mark execution completed in database:', error)
    }

    this.activeExecutions.delete(executionId)

    // Send WebSocket completion notification
    const ws = this.wsConnections.get(executionId)
    if (ws) {
      ws.send(JSON.stringify({
        type: 'completed',
        executionId,
        outputs
      }))
    }
  }

  private async markExecutionFailed(executionId: string, error: string): Promise<void> {
    try {
      // Try to update database if workflow models exist
      if (prisma.workflowExecution) {
        await prisma.workflowExecution.update({
          where: { id: executionId },
          data: {
            status: 'failed',
            completedAt: new Date(),
            error
          }
        })
      }
    } catch (error) {
      console.error('Failed to mark execution failed in database:', error)
    }

    this.activeExecutions.delete(executionId)

    // Send WebSocket failure notification
    const ws = this.wsConnections.get(executionId)
    if (ws) {
      ws.send(JSON.stringify({
        type: 'failed',
        executionId,
        error
      }))
    }
  }

  // WebSocket management
  addWebSocketConnection(executionId: string, ws: WebSocket): void {
    this.wsConnections.set(executionId, ws)
    ws.on('close', () => {
      this.wsConnections.delete(executionId)
    })
  }

  removeWebSocketConnection(executionId: string): void {
    this.wsConnections.delete(executionId)
  }
}

// Singleton instance
export const workflowEngine = new WorkflowExecutionEngine()