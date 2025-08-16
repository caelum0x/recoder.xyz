/**
 * ENTERPRISE TELEMETRY AND ANALYTICS SYSTEM
 * Production-grade monitoring, analytics, and performance tracking
 */

const { EventEmitter } = require('events');
const fs = require('fs').promises;
const path = require('path');
const os = require('os');

class EnterpriseTelemetryService extends EventEmitter {
    constructor() {
        super();
        this.sessionId = this.generateSessionId();
        this.startTime = Date.now();
        this.metrics = {
            performance: new Map(),
            usage: new Map(),
            errors: new Map(),
            services: new Map(),
            ai: new Map(),
            user: new Map()
        };
        
        this.config = {
            enabled: true,
            batchSize: 50,
            flushInterval: 30000, // 30 seconds
            retentionDays: 30,
            anonymize: true,
            endpoints: {
                metrics: process.env.TELEMETRY_ENDPOINT || null,
                errors: process.env.ERROR_REPORTING_ENDPOINT || null
            }
        };
        
        this.queue = [];
        this.flushTimer = null;
        this.isInitialized = false;
        
        console.log(`📊 Enterprise Telemetry initialized - Session: ${this.sessionId}`);
    }

    async initialize() {
        try {
            console.log('📊 Initializing Enterprise Telemetry Service...');
            
            // Setup data directory
            await this.setupDataDirectory();
            
            // Start periodic flushing
            this.startPeriodicFlush();
            
            // Track session start
            await this.trackEvent('session:start', {
                sessionId: this.sessionId,
                platform: process.platform,
                arch: process.arch,
                nodeVersion: process.version,
                electronVersion: process.versions.electron,
                appVersion: require('../../package.json').version,
                timestamp: Date.now()
            });
            
            // Setup system monitoring
            this.setupSystemMonitoring();
            
            this.isInitialized = true;
            console.log('✅ Enterprise Telemetry Service initialized');
            
            return true;
            
        } catch (error) {
            console.error('❌ Failed to initialize telemetry:', error);
            return false;
        }
    }

    async setupDataDirectory() {
        const dataDir = path.join(os.homedir(), '.recoder-desktop', 'telemetry');
        
        try {
            await fs.mkdir(dataDir, { recursive: true });
            this.dataDirectory = dataDir;
            console.log(`📂 Telemetry data directory: ${dataDir}`);
        } catch (error) {
            console.error('Failed to create telemetry directory:', error);
            throw error;
        }
    }

    startPeriodicFlush() {
        this.flushTimer = setInterval(async () => {
            await this.flushMetrics();
        }, this.config.flushInterval);
        
        console.log('⏰ Periodic telemetry flush started');
    }

    setupSystemMonitoring() {
        // Monitor system resources every 10 seconds
        setInterval(() => {
            this.collectSystemMetrics();
        }, 10000);
        
        // Monitor memory leaks every minute
        setInterval(() => {
            this.checkMemoryLeaks();
        }, 60000);
        
        console.log('🖥️ System monitoring started');
    }

    collectSystemMetrics() {
        try {
            const memUsage = process.memoryUsage();
            const cpuUsage = process.cpuUsage();
            
            this.trackMetric('system:memory', {
                rss: memUsage.rss,
                heapUsed: memUsage.heapUsed,
                heapTotal: memUsage.heapTotal,
                external: memUsage.external,
                arrayBuffers: memUsage.arrayBuffers
            });
            
            this.trackMetric('system:cpu', {
                user: cpuUsage.user,
                system: cpuUsage.system
            });
            
            // System load average
            const loadAvg = os.loadavg();
            this.trackMetric('system:load', {
                '1min': loadAvg[0],
                '5min': loadAvg[1],
                '15min': loadAvg[2]
            });
            
        } catch (error) {
            console.error('Failed to collect system metrics:', error);
        }
    }

    checkMemoryLeaks() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        
        // Alert if heap usage exceeds 500MB
        if (heapUsedMB > 500) {
            this.trackEvent('performance:memory-warning', {
                heapUsedMB,
                rssUsedMB: Math.round(memUsage.rss / 1024 / 1024),
                timestamp: Date.now()
            });
            
            console.warn(`⚠️ High memory usage detected: ${heapUsedMB}MB heap`);
        }
    }

    // PERFORMANCE TRACKING
    trackPerformance(operation, duration, metadata = {}) {
        const metric = {
            operation,
            duration,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        this.metrics.performance.set(`${operation}_${Date.now()}`, metric);
        this.queueMetric('performance', metric);
        
        // Emit for real-time monitoring
        this.emit('performance', metric);
    }

    // SERVICE HEALTH TRACKING
    trackServiceHealth(serviceId, status, responseTime, metadata = {}) {
        const metric = {
            serviceId,
            status,
            responseTime,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        this.metrics.services.set(serviceId, metric);
        this.queueMetric('service-health', metric);
        
        this.emit('service-health', metric);
    }

    // AI USAGE TRACKING
    trackAIUsage(provider, model, operation, tokens, cost = null, metadata = {}) {
        const metric = {
            provider,
            model,
            operation,
            tokens,
            cost,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        const key = `${provider}_${operation}_${Date.now()}`;
        this.metrics.ai.set(key, metric);
        this.queueMetric('ai-usage', metric);
        
        this.emit('ai-usage', metric);
    }

    // USER INTERACTION TRACKING
    trackUserAction(action, context, metadata = {}) {
        const metric = {
            action,
            context,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            ...metadata
        };
        
        this.metrics.user.set(`${action}_${Date.now()}`, metric);
        this.queueMetric('user-action', metric);
        
        this.emit('user-action', metric);
    }

    // ERROR TRACKING
    trackError(error, context, severity = 'error', metadata = {}) {
        const errorMetric = {
            message: error.message,
            stack: error.stack,
            name: error.name,
            context,
            severity,
            timestamp: Date.now(),
            sessionId: this.sessionId,
            platform: process.platform,
            appVersion: require('../../package.json').version,
            ...metadata
        };
        
        this.metrics.errors.set(`error_${Date.now()}`, errorMetric);
        this.queueMetric('error', errorMetric);
        
        this.emit('error', errorMetric);
        
        console.error(`🚨 Telemetry Error [${severity}]:`, error.message);
    }

    // GENERIC EVENT TRACKING
    async trackEvent(eventName, data = {}) {
        const event = {
            eventName,
            data: this.config.anonymize ? this.anonymizeData(data) : data,
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        this.queueMetric('event', event);
        this.emit('event', event);
    }

    // GENERIC METRIC TRACKING
    trackMetric(metricName, value, tags = {}) {
        const metric = {
            metricName,
            value,
            tags,
            timestamp: Date.now(),
            sessionId: this.sessionId
        };
        
        this.queueMetric('metric', metric);
        this.emit('metric', metric);
    }

    // QUEUE MANAGEMENT
    queueMetric(type, data) {
        if (!this.config.enabled) return;
        
        this.queue.push({
            type,
            data,
            timestamp: Date.now()
        });
        
        // Flush if queue is full
        if (this.queue.length >= this.config.batchSize) {
            this.flushMetrics();
        }
    }

    async flushMetrics() {
        if (this.queue.length === 0) return;
        
        const batch = [...this.queue];
        this.queue = [];
        
        try {
            // Save to local storage
            await this.saveToLocalStorage(batch);
            
            // Send to remote endpoints if configured
            if (this.config.endpoints.metrics) {
                await this.sendToRemote(batch);
            }
            
            // Use safer logging to prevent EPIPE errors
            this.safeLog(`📤 Flushed ${batch.length} telemetry metrics`);
            
        } catch (error) {
            this.safeLog('Failed to flush telemetry metrics: ' + error.message);
            // Put batch back in queue for retry
            this.queue = [...batch, ...this.queue];
        }
    }

    async saveToLocalStorage(batch) {
        const date = new Date().toISOString().split('T')[0];
        const filename = `metrics-${date}.jsonl`;
        const filepath = path.join(this.dataDirectory, filename);
        
        const lines = batch.map(item => JSON.stringify(item)).join('\n') + '\n';
        
        await fs.appendFile(filepath, lines, 'utf8');
    }

    async sendToRemote(batch) {
        // Implementation for sending to remote telemetry service
        // This would be implemented based on your telemetry backend
        this.safeLog(`🌐 Would send ${batch.length} metrics to remote service`);
    }

    // DATA ANONYMIZATION
    anonymizeData(data) {
        if (typeof data !== 'object' || data === null) return data;
        
        const anonymized = { ...data };
        
        // Remove or hash sensitive fields
        const sensitiveFields = ['email', 'username', 'path', 'filename', 'url'];
        
        for (const field of sensitiveFields) {
            if (anonymized[field]) {
                anonymized[field] = this.hashString(anonymized[field]);
            }
        }
        
        return anonymized;
    }

    hashString(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // Convert to 32-bit integer
        }
        return `hashed_${Math.abs(hash).toString(36)}`;
    }

    // ANALYTICS AND REPORTING
    async generateReport(timeframe = '24h') {
        try {
            const endTime = Date.now();
            const startTime = endTime - this.parseTimeframe(timeframe);
            
            const report = {
                timeframe,
                startTime,
                endTime,
                sessionId: this.sessionId,
                performance: await this.getPerformanceReport(startTime, endTime),
                usage: await this.getUsageReport(startTime, endTime),
                errors: await this.getErrorReport(startTime, endTime),
                services: await this.getServiceReport(startTime, endTime),
                ai: await this.getAIReport(startTime, endTime)
            };
            
            return report;
            
        } catch (error) {
            console.error('Failed to generate telemetry report:', error);
            return null;
        }
    }

    async getPerformanceReport(startTime, endTime) {
        const metrics = Array.from(this.metrics.performance.values())
            .filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
        
        if (metrics.length === 0) return null;
        
        const durations = metrics.map(m => m.duration);
        
        return {
            totalOperations: metrics.length,
            averageDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            minDuration: Math.min(...durations),
            maxDuration: Math.max(...durations),
            p95Duration: this.calculatePercentile(durations, 0.95),
            slowestOperations: metrics
                .sort((a, b) => b.duration - a.duration)
                .slice(0, 5)
                .map(m => ({ operation: m.operation, duration: m.duration }))
        };
    }

    async getUsageReport(startTime, endTime) {
        const actions = Array.from(this.metrics.user.values())
            .filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
        
        const actionCounts = {};
        actions.forEach(action => {
            actionCounts[action.action] = (actionCounts[action.action] || 0) + 1;
        });
        
        return {
            totalActions: actions.length,
            uniqueActions: Object.keys(actionCounts).length,
            topActions: Object.entries(actionCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .map(([action, count]) => ({ action, count }))
        };
    }

    async getErrorReport(startTime, endTime) {
        const errors = Array.from(this.metrics.errors.values())
            .filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
        
        const errorCounts = {};
        const severityCounts = {};
        
        errors.forEach(error => {
            errorCounts[error.message] = (errorCounts[error.message] || 0) + 1;
            severityCounts[error.severity] = (severityCounts[error.severity] || 0) + 1;
        });
        
        return {
            totalErrors: errors.length,
            uniqueErrors: Object.keys(errorCounts).length,
            bySeverity: severityCounts,
            topErrors: Object.entries(errorCounts)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 10)
                .map(([message, count]) => ({ message, count }))
        };
    }

    async getServiceReport(startTime, endTime) {
        const services = Array.from(this.metrics.services.values())
            .filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
        
        const serviceHealth = {};
        services.forEach(service => {
            if (!serviceHealth[service.serviceId]) {
                serviceHealth[service.serviceId] = {
                    checks: 0,
                    healthy: 0,
                    responseTimes: []
                };
            }
            
            serviceHealth[service.serviceId].checks++;
            if (service.status === 'healthy') {
                serviceHealth[service.serviceId].healthy++;
            }
            if (service.responseTime) {
                serviceHealth[service.serviceId].responseTimes.push(service.responseTime);
            }
        });
        
        // Calculate uptime and average response times
        Object.keys(serviceHealth).forEach(serviceId => {
            const data = serviceHealth[serviceId];
            data.uptime = data.checks > 0 ? (data.healthy / data.checks) * 100 : 0;
            data.avgResponseTime = data.responseTimes.length > 0 
                ? data.responseTimes.reduce((a, b) => a + b, 0) / data.responseTimes.length 
                : 0;
            delete data.responseTimes; // Remove raw data
        });
        
        return serviceHealth;
    }

    async getAIReport(startTime, endTime) {
        const aiUsage = Array.from(this.metrics.ai.values())
            .filter(m => m.timestamp >= startTime && m.timestamp <= endTime);
        
        const providerUsage = {};
        let totalTokens = 0;
        let totalCost = 0;
        
        aiUsage.forEach(usage => {
            if (!providerUsage[usage.provider]) {
                providerUsage[usage.provider] = {
                    operations: 0,
                    tokens: 0,
                    cost: 0
                };
            }
            
            providerUsage[usage.provider].operations++;
            providerUsage[usage.provider].tokens += usage.tokens || 0;
            providerUsage[usage.provider].cost += usage.cost || 0;
            
            totalTokens += usage.tokens || 0;
            totalCost += usage.cost || 0;
        });
        
        return {
            totalOperations: aiUsage.length,
            totalTokens,
            totalCost,
            byProvider: providerUsage
        };
    }

    // UTILITY METHODS
    parseTimeframe(timeframe) {
        const units = {
            h: 3600000,
            d: 86400000,
            w: 604800000,
            m: 2629746000
        };
        
        const match = timeframe.match(/^(\d+)([hdwm])$/);
        if (!match) return 86400000; // Default to 24h
        
        const [, number, unit] = match;
        return parseInt(number) * units[unit];
    }

    calculatePercentile(arr, percentile) {
        const sorted = arr.sort((a, b) => a - b);
        const index = percentile * sorted.length;
        
        if (Math.floor(index) === index) {
            return sorted[index - 1];
        } else {
            return sorted[Math.floor(index)];
        }
    }

    generateSessionId() {
        return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    // CLEANUP
    async cleanup() {
        console.log('🧹 Cleaning up Enterprise Telemetry...');
        
        if (this.flushTimer) {
            clearInterval(this.flushTimer);
        }
        
        // Final flush
        await this.flushMetrics();
        
        // Track session end
        await this.trackEvent('session:end', {
            sessionId: this.sessionId,
            duration: Date.now() - this.startTime,
            timestamp: Date.now()
        });
        
        // Final flush for session end
        await this.flushMetrics();
        
        console.log('✅ Enterprise Telemetry cleanup complete');
    }

    // PUBLIC API METHODS
    isEnabled() {
        return this.config.enabled && this.isInitialized;
    }

    disable() {
        this.config.enabled = false;
        console.log('📊 Enterprise Telemetry disabled');
    }

    enable() {
        this.config.enabled = true;
        console.log('📊 Enterprise Telemetry enabled');
    }

    getSessionId() {
        return this.sessionId;
    }

    getMetricsSummary() {
        return {
            performance: this.metrics.performance.size,
            usage: this.metrics.usage.size,
            errors: this.metrics.errors.size,
            services: this.metrics.services.size,
            ai: this.metrics.ai.size,
            user: this.metrics.user.size,
            queueSize: this.queue.length,
            sessionId: this.sessionId,
            uptime: Date.now() - this.startTime
        };
    }

    // Safe logging to prevent EPIPE errors
    safeLog(message) {
        try {
            if (process.stdout && !process.stdout.destroyed) {
                console.log(message);
            }
        } catch (error) {
            // Silently fail to prevent blocking
        }
    }
}

module.exports = { EnterpriseTelemetryService };