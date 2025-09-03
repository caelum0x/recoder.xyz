import { NextRequest, NextResponse } from 'next/server'
import { auth } from '../../../../lib/auth'
import { performanceMonitor } from '../../../../lib/media-processing/performance-monitor'
import { rateLimit } from '../../../../lib/rate-limit'

export async function GET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const { searchParams } = new URL(request.url)
    const action = searchParams.get('action') || 'current'
    const hours = parseInt(searchParams.get('hours') || '24')

    switch (action) {
      case 'current': {
        const metrics = performanceMonitor.getCurrentMetrics()
        const healthScore = performanceMonitor.getHealthScore()
        const activeAlerts = performanceMonitor.getActiveAlerts()

        return NextResponse.json({
          success: true,
          data: {
            metrics,
            healthScore,
            activeAlerts,
            timestamp: new Date()
          }
        })
      }

      case 'historical': {
        const historicalData = performanceMonitor.getHistoricalMetrics(hours)
        
        return NextResponse.json({
          success: true,
          data: {
            ...historicalData,
            timeframe: { hours },
            timestamp: new Date()
          }
        })
      }

      case 'alerts': {
        const limit = parseInt(searchParams.get('limit') || '50')
        const alerts = performanceMonitor.getAllAlerts(limit)
        const activeCount = alerts.filter(alert => !alert.resolved).length

        return NextResponse.json({
          success: true,
          data: {
            alerts,
            activeCount,
            totalCount: alerts.length,
            timestamp: new Date()
          }
        })
      }

      case 'thresholds': {
        const thresholds = performanceMonitor.getThresholds()
        
        return NextResponse.json({
          success: true,
          data: {
            thresholds,
            timestamp: new Date()
          }
        })
      }

      case 'report': {
        const reportHours = parseInt(searchParams.get('hours') || '24')
        const report = performanceMonitor.generateReport(reportHours)
        
        return NextResponse.json({
          success: true,
          data: {
            report,
            generatedAt: new Date()
          }
        })
      }

      case 'stats': {
        const metrics = performanceMonitor.getCurrentMetrics()
        
        // Calculate derived statistics
        const stats = {
          monitoring: {
            isActive: true, // Assuming monitoring is active
            uptimeHours: Math.floor(process.uptime() / 3600),
            collectionInterval: 10000, // 10 seconds default
            lastCollection: new Date()
          },
          system: metrics.system ? {
            cpuCores: metrics.system.cpu.cores,
            totalMemory: Math.round(metrics.system.memory.total / (1024 * 1024 * 1024)), // GB
            totalDisk: Math.round(metrics.system.disk.total / (1024 * 1024 * 1024 * 1024)), // TB
            currentLoad: metrics.system.cpu.loadAverage[0]
          } : null,
          processing: metrics.processing ? {
            queueUtilization: metrics.processing.queueLength > 0 ? 
              Math.min((metrics.processing.queueLength / 50) * 100, 100) : 0, // Assume 50 is max efficient queue
            processingEfficiency: metrics.processing.throughput > 0 ? 
              Math.min((metrics.processing.completedJobs / metrics.processing.throughput) * 100, 100) : 0,
            errorPercentage: metrics.processing.errorRate
          } : null,
          cache: metrics.cache ? {
            efficiency: metrics.cache.hitRate,
            utilization: (metrics.cache.size / metrics.cache.maxSize) * 100,
            evictionRate: metrics.cache.evictions
          } : null
        }

        return NextResponse.json({
          success: true,
          data: {
            stats,
            timestamp: new Date()
          }
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action parameter' }, { status: 400 })
    }

  } catch (error) {
    console.error('Performance API error:', error)
    return NextResponse.json(
      { error: 'Failed to fetch performance data' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    const rateLimitResult = await rateLimit(request, 'performance-management', 10, 60000)
    if (!rateLimitResult.success) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please try again later.' },
        { status: 429 }
      )
    }

    const session = await auth()
    if (!session?.user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 })
    }

    const body = await request.json()
    const { action, ...params } = body

    switch (action) {
      case 'start_monitoring': {
        const interval = params.interval || 10000 // 10 seconds default
        
        if (interval < 5000 || interval > 300000) { // 5 seconds to 5 minutes range
          return NextResponse.json(
            { error: 'Interval must be between 5000ms and 300000ms' },
            { status: 400 }
          )
        }

        performanceMonitor.start(interval)
        
        return NextResponse.json({
          success: true,
          message: 'Performance monitoring started',
          config: {
            interval,
            startedAt: new Date()
          }
        })
      }

      case 'stop_monitoring': {
        performanceMonitor.stop()
        
        return NextResponse.json({
          success: true,
          message: 'Performance monitoring stopped',
          stoppedAt: new Date()
        })
      }

      case 'resolve_alert': {
        const { alertId } = params
        
        if (!alertId) {
          return NextResponse.json({ error: 'Alert ID required' }, { status: 400 })
        }

        const resolved = performanceMonitor.resolveAlert(alertId)
        
        return NextResponse.json({
          success: resolved,
          message: resolved ? 'Alert resolved successfully' : 'Alert not found or already resolved',
          alertId,
          resolvedAt: resolved ? new Date() : null
        })
      }

      case 'add_threshold': {
        const { threshold } = params
        
        if (!threshold || !threshold.metric || !threshold.operator || !threshold.value) {
          return NextResponse.json(
            { error: 'Complete threshold configuration required' },
            { status: 400 }
          )
        }

        // Validate threshold values
        if (!['gt', 'lt', 'eq'].includes(threshold.operator)) {
          return NextResponse.json(
            { error: 'Invalid operator. Use: gt, lt, or eq' },
            { status: 400 }
          )
        }

        if (!['info', 'warning', 'error', 'critical'].includes(threshold.severity)) {
          return NextResponse.json(
            { error: 'Invalid severity. Use: info, warning, error, or critical' },
            { status: 400 }
          )
        }

        performanceMonitor.addThreshold({
          metric: threshold.metric,
          operator: threshold.operator,
          value: Number(threshold.value),
          severity: threshold.severity,
          message: threshold.message || `${threshold.metric} threshold exceeded: {value}`,
          enabled: threshold.enabled !== false
        })
        
        return NextResponse.json({
          success: true,
          message: 'Alert threshold added',
          threshold,
          addedAt: new Date()
        })
      }

      case 'update_threshold': {
        const { metric, updates } = params
        
        if (!metric) {
          return NextResponse.json({ error: 'Metric name required' }, { status: 400 })
        }

        performanceMonitor.updateThreshold(metric, updates)
        
        return NextResponse.json({
          success: true,
          message: 'Threshold updated',
          metric,
          updates,
          updatedAt: new Date()
        })
      }

      case 'remove_threshold': {
        const { metric } = params
        
        if (!metric) {
          return NextResponse.json({ error: 'Metric name required' }, { status: 400 })
        }

        performanceMonitor.removeThreshold(metric)
        
        return NextResponse.json({
          success: true,
          message: 'Threshold removed',
          metric,
          removedAt: new Date()
        })
      }

      case 'reset_metrics': {
        // This would reset historical data - implement with caution
        return NextResponse.json({
          success: false,
          message: 'Metrics reset not implemented for safety reasons',
          availableActions: [
            'start_monitoring',
            'stop_monitoring', 
            'resolve_alert',
            'add_threshold',
            'update_threshold',
            'remove_threshold'
          ]
        })
      }

      case 'export_metrics': {
        const hours = params.hours || 24
        const format = params.format || 'json'
        
        const data = {
          historical: performanceMonitor.getHistoricalMetrics(hours),
          alerts: performanceMonitor.getAllAlerts(1000),
          thresholds: performanceMonitor.getThresholds(),
          report: performanceMonitor.generateReport(hours),
          exportedAt: new Date(),
          exportConfig: { hours, format }
        }

        return NextResponse.json({
          success: true,
          message: 'Metrics exported',
          data,
          downloadUrl: null // In production, generate temporary download URL
        })
      }

      default:
        return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
    }

  } catch (error) {
    console.error('Performance management error:', error)
    return NextResponse.json(
      { error: 'Performance management request failed' },
      { status: 500 }
    )
  }
}

// WebSocket endpoint for real-time performance monitoring
export async function WEBSOCKET(request: NextRequest) {
  try {
    const session = await auth()
    if (!session?.user) {
      return new Response('Authentication required', { status: 401 })
    }

    // WebSocket implementation would go here
    // This is a placeholder for real-time metrics streaming
    return new Response('WebSocket endpoint for real-time performance monitoring', {
      status: 501,
      headers: { 'Content-Type': 'text/plain' }
    })

  } catch (error) {
    console.error('Performance WebSocket error:', error)
    return new Response('WebSocket connection failed', { status: 500 })
  }
}