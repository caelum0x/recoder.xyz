const express = require('express')
const { Worker } = require('worker_threads')
const Redis = require('redis')
const { FFmpegProcessor } = require('./lib/media-processing/ffmpeg-processor')

const app = express()
const port = process.env.PORT || 3001

// Redis connection for job queue
const redis = Redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
})

// FFmpeg processor instance
const ffmpegProcessor = new FFmpegProcessor()

// Active workers map
const activeWorkers = new Map()

app.use(express.json())

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    activeJobs: activeWorkers.size,
    timestamp: new Date().toISOString()
  })
})

// Job status endpoint
app.get('/jobs/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params
    const jobData = await redis.hget('jobs', jobId)
    
    if (!jobData) {
      return res.status(404).json({ error: 'Job not found' })
    }

    res.json(JSON.parse(jobData))
  } catch (error) {
    console.error('Error fetching job status:', error)
    res.status(500).json({ error: 'Failed to fetch job status' })
  }
})

// Process job endpoint
app.post('/process', async (req, res) => {
  try {
    const {
      jobId,
      userId,
      fileId,
      filePath,
      operation,
      parameters,
      outputFormat,
      quality
    } = req.body

    if (!jobId || !filePath || !operation) {
      return res.status(400).json({ error: 'Missing required parameters' })
    }

    // Create job data
    const jobData = {
      id: jobId,
      userId,
      fileId,
      filePath,
      operation,
      parameters,
      outputFormat,
      quality,
      status: 'processing',
      progress: 0,
      startedAt: new Date().toISOString(),
      pid: process.pid
    }

    // Store job in Redis
    await redis.hset('jobs', jobId, JSON.stringify(jobData))

    // Start processing
    processJob(jobData)

    res.json({ success: true, jobId })

  } catch (error) {
    console.error('Error starting job:', error)
    res.status(500).json({ error: 'Failed to start processing' })
  }
})

async function processJob(jobData) {
  const { id: jobId, filePath, operation, parameters, outputFormat, quality } = jobData

  try {
    // Generate output path
    const outputPath = generateOutputPath(filePath, operation, outputFormat)

    // Update job status
    await updateJobStatus(jobId, 'processing', 0)

    // Process with FFmpeg
    const result = await ffmpegProcessor.process({
      inputPath: filePath,
      outputPath,
      operation: { type: operation, parameters },
      quality,
      onProgress: async (progress) => {
        await updateJobStatus(jobId, 'processing', progress)
      },
      onError: async (error) => {
        console.error(`Job ${jobId} error:`, error)
        await updateJobStatus(jobId, 'failed', 0, error)
      }
    })

    if (result.success) {
      // Job completed successfully
      await updateJobStatus(jobId, 'completed', 100, null, {
        outputPath: result.outputPath,
        outputSize: result.metadata?.outputSize,
        completedAt: new Date().toISOString()
      })

      // Notify main application
      await notifyJobCompletion(jobId, 'completed', result)

    } else {
      // Job failed
      await updateJobStatus(jobId, 'failed', 0, result.error)
      await notifyJobCompletion(jobId, 'failed', result)
    }

  } catch (error) {
    console.error(`Fatal error processing job ${jobId}:`, error)
    await updateJobStatus(jobId, 'failed', 0, error.message)
    await notifyJobCompletion(jobId, 'failed', { error: error.message })
  } finally {
    // Clean up
    activeWorkers.delete(jobId)
  }
}

async function updateJobStatus(jobId, status, progress, error = null, additionalData = {}) {
  try {
    const jobData = await redis.hget('jobs', jobId)
    if (jobData) {
      const job = JSON.parse(jobData)
      const updatedJob = {
        ...job,
        status,
        progress,
        error,
        updatedAt: new Date().toISOString(),
        ...additionalData
      }

      await redis.hset('jobs', jobId, JSON.stringify(updatedJob))
      
      // Also publish to a channel for real-time updates
      await redis.publish('job-updates', JSON.stringify({
        jobId,
        status,
        progress,
        error
      }))
    }
  } catch (updateError) {
    console.error('Error updating job status:', updateError)
  }
}

async function notifyJobCompletion(jobId, status, result) {
  try {
    // Send webhook to main application
    const webhookUrl = process.env.WEBHOOK_URL || 'http://localhost:3000/api/media-processing/webhook'
    
    const response = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jobId,
        status,
        result,
        timestamp: new Date().toISOString()
      })
    })

    if (!response.ok) {
      console.error('Failed to send webhook notification')
    }

  } catch (error) {
    console.error('Error sending job completion notification:', error)
  }
}

function generateOutputPath(inputPath, operation, outputFormat) {
  const path = require('path')
  const crypto = require('crypto')
  
  const inputDir = path.dirname(inputPath)
  const inputName = path.basename(inputPath, path.extname(inputPath))
  const timestamp = Date.now()
  const hash = crypto.createHash('md5').update(`${inputPath}${operation}${timestamp}`).digest('hex').substring(0, 8)
  
  return path.join(inputDir, '..', 'output', `${inputName}_${operation}_${hash}.${outputFormat}`)
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('Received SIGTERM, shutting down gracefully...')
  
  // Wait for active jobs to complete or timeout after 30 seconds
  const timeout = setTimeout(() => {
    console.log('Shutdown timeout reached, forcing exit...')
    process.exit(1)
  }, 30000)

  // Wait for all active workers to finish
  while (activeWorkers.size > 0) {
    console.log(`Waiting for ${activeWorkers.size} active jobs to complete...`)
    await new Promise(resolve => setTimeout(resolve, 1000))
  }

  clearTimeout(timeout)
  await redis.disconnect()
  console.log('Media worker shut down successfully')
  process.exit(0)
})

// Error handling
process.on('uncaughtException', (error) => {
  console.error('Uncaught exception:', error)
  process.exit(1)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled rejection at:', promise, 'reason:', reason)
  process.exit(1)
})

// Start server
app.listen(port, () => {
  console.log(`Media processing worker listening on port ${port}`)
  console.log(`Process ID: ${process.pid}`)
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`)
})

// Connect to Redis
redis.connect().then(() => {
  console.log('Connected to Redis')
}).catch((error) => {
  console.error('Failed to connect to Redis:', error)
  process.exit(1)
})
