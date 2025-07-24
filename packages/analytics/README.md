# 📊 @recoder/analytics

**Comprehensive analytics and monitoring for the Recoder.xyz ecosystem**

Privacy-focused analytics with real-time monitoring, usage tracking, and performance metrics across CLI, Web Platform, and VS Code Extension.

## 🚀 Features

### Production Monitoring
- **Real-time System Health**: Monitor CLI, Web Platform, and VS Code Extension
- **AI Provider Monitoring**: Track Claude, Groq, Gemini, and Ollama performance
- **Intelligent Alerting**: Multi-channel alerts (Slack, Email, PagerDuty, SMS)
- **External Integrations**: DataDog, New Relic, Prometheus support

### Usage Analytics
- **Privacy-First**: User consent required, data anonymization, GDPR compliant
- **Cross-Platform Tracking**: Unified analytics across all Recoder platforms
- **Feature Usage**: Track most used commands, providers, and languages
- **Performance Metrics**: Response times, error rates, throughput

### Live Dashboard
- **Real-time Metrics**: Live updates every 5 seconds
- **Platform Overview**: Status and metrics for each platform
- **AI Provider Stats**: Request rates, success rates, response times
- **Smart Recommendations**: Performance and cost optimization suggestions

## 📦 Installation

```bash
npm install @recoder/analytics
```

## 🔧 Quick Start

### Initialize Analytics

```typescript
import { RecoderAnalytics } from '@recoder/analytics';

// Initialize for CLI
const { analytics, dashboard, monitoring } = await RecoderAnalytics.initialize('cli', {
  userId: 'user123',
  enableAnalytics: true,
  enableMonitoring: true
});

// Track events
analytics.trackCodeGeneration('claude', 'typescript', 1500, true);
analytics.trackCommandUsage('generate', ['--provider', 'claude'], true);
analytics.trackFeatureUsage('ai-routing', 'enabled');

// Get real-time metrics
const metrics = dashboard.getMetrics();
console.log('Active users:', metrics.overview.activeUsers);
```

### Platform-Specific Usage

#### CLI Analytics
```typescript
import { createCLIAnalytics } from '@recoder/analytics';

const analytics = createCLIAnalytics();
await analytics.initializeAnalytics();

analytics.trackCommandUsage('recoder generate', ['api'], true);
analytics.trackPerformance('generation_time', 2500, 'ms');
```

#### Web Platform Analytics  
```typescript
import { createWebAnalytics } from '@recoder/analytics';

const analytics = createWebAnalytics();
await analytics.initializeAnalytics();

analytics.trackEvent('project', 'created', { template: 'react' });
analytics.trackCodeGeneration('groq', 'javascript', 800, true);
```

#### VS Code Extension Analytics
```typescript
import { createExtensionAnalytics } from '@recoder/analytics';

const analytics = createExtensionAnalytics();
await analytics.initializeAnalytics();

analytics.trackFeatureUsage('ghost-mode', 'activated');
analytics.trackEvent('completion', 'accepted', { provider: 'claude' });
```

## 📊 Monitoring Dashboard

### Start Dashboard
```typescript
import { monitoringDashboard } from '@recoder/analytics';

// Start real-time monitoring
monitoringDashboard.start();

// Listen for updates
monitoringDashboard.on('dashboard:updated', (metrics) => {
  console.log('Current metrics:', metrics);
});

// Get comprehensive report
const report = monitoringDashboard.generateReport();
console.log('System health:', report.summary.overallHealth);
```

### Monitor Specific Platforms
```typescript
// Get CLI metrics
const cliMetrics = monitoringDashboard.getPlatformMetrics('cli');
console.log('CLI status:', cliMetrics.status);

// Get AI provider metrics
const claudeMetrics = monitoringDashboard.getAIProviderMetrics('claude');
console.log('Claude response time:', claudeMetrics.responseTime);
```

## 🔒 Privacy & Compliance

### Privacy Settings
```typescript
// Update privacy preferences
analytics.updatePrivacySettings({
  analyticsEnabled: true,
  errorReportingEnabled: true,
  performanceMetricsEnabled: true,  
  featureUsageEnabled: true,
  shareAnonymousStats: false // Keep data local
});

// Check current settings
const settings = analytics.getPrivacySettings();
console.log('Analytics enabled:', settings.analyticsEnabled);
```

### GDPR Compliance
```typescript
// Export user data (GDPR Article 20)
const userData = analytics.exportUserData();
console.log('User has', userData.totalEvents, 'tracked events');

// Delete user data (GDPR Article 17)
analytics.deleteUserData();
console.log('User data deleted');
```

## 📈 Production Monitoring

### Health Checks
```typescript
import { productionMonitoring } from '@recoder/analytics';

// Start monitoring
productionMonitoring.startMonitoring();

// Listen for health updates
productionMonitoring.on('system:health', (health) => {
  console.log('Overall system status:', health.overall);
  console.log('CLI uptime:', health.services.cli.uptime);
  console.log('Active users:', health.metrics.activeUsers);
});

// Listen for alerts
productionMonitoring.on('alert:triggered', (alert) => {
  console.log('ALERT:', alert.alert.name);
  console.log('Value:', alert.metric.value, alert.metric.unit);
});
```

### Custom Metrics
```typescript
// Record custom metrics
productionMonitoring.recordMetric({
  name: 'custom_feature_usage',
  value: 42,
  unit: 'count',
  platform: 'cli',
  dimensions: {
    feature: 'ai-routing',
    provider: 'claude'
  }
});
```

## 🛠️ Configuration

### Environment Variables
```bash
# External monitoring services (optional)
DATADOG_API_KEY=your-datadog-key
SLACK_WEBHOOK_URL=your-slack-webhook
DISCORD_WEBHOOK_URL=your-discord-webhook

# AI provider monitoring
ANTHROPIC_API_KEY=your-claude-key
GROQ_API_KEY=your-groq-key
GOOGLE_API_KEY=your-gemini-key
OLLAMA_BASE_URL=http://localhost:11434
```

### Alert Configuration
```typescript
// Custom alert rules
const alertRule = {
  id: 'high_error_rate',
  name: 'High Error Rate',
  metric: 'error_rate',
  condition: 'gt' as const,
  threshold: 5, // 5%
  duration: 300000, // 5 minutes
  severity: 'high' as const,
  channels: ['slack', 'email'],
  enabled: true
};
```

## 📊 Metrics Reference

### Platform Metrics
- **Users**: Active and total user counts
- **Requests**: API and command requests
- **Errors**: Error rates and counts
- **Uptime**: Service availability percentage
- **Response Time**: Average response times

### AI Provider Metrics  
- **Request Rate**: Requests per minute
- **Success Rate**: Successful completion percentage
- **Token Usage**: Average tokens per request
- **Response Time**: Average response time
- **Cost**: Usage costs (if available)

### Usage Analytics
- **Code Generations**: Total generations and success rate
- **Commands**: Most used CLI commands
- **Languages**: Popular programming languages
- **Features**: Feature adoption and usage patterns

## 🔄 Event Types

### System Events
- `system.analytics_started` - Analytics initialization
- `system.analytics_disabled` - Analytics disabled by user
- `session.session_started` - New user session
- `session.session_ended` - Session termination

### Code Generation Events
- `code_generation.generated` - Code generation completed
- `code_generation.failed` - Code generation failed
- `code_generation.cached` - Cached result returned

### Command Events
- `command.executed` - CLI command executed
- `command.failed` - Command execution failed
- `command.help_requested` - Help information requested

### Feature Events
- `feature.enabled` - Feature activated by user
- `feature.disabled` - Feature deactivated
- `feature.configured` - Feature settings changed

### Error Events
- `error.occurred` - Application error
- `error.network` - Network connectivity error
- `error.api` - AI provider API error

## 🏗️ Architecture

```
@recoder/analytics
├── monitoring/           # Production monitoring
│   └── production-monitoring.ts
├── dashboard/           # Real-time dashboard
│   └── monitoring-dashboard.ts
├── tracking/           # Usage analytics
│   └── usage-analytics.ts
└── index.ts           # Main exports
```

## 🤝 Contributing

1. **Follow Privacy Principles**: All analytics must be opt-in and privacy-compliant
2. **Test Thoroughly**: Include tests for all analytics functionality
3. **Document Events**: Document all tracked events and their purposes
4. **Respect User Choice**: Always honor user privacy preferences

## 📄 License

MIT License - see [LICENSE](LICENSE) for details.

## 🔗 Links

- **Documentation**: [https://docs.recoder.xyz/analytics](https://docs.recoder.xyz/analytics)
- **API Reference**: [https://docs.recoder.xyz/api/analytics](https://docs.recoder.xyz/api/analytics)
- **Privacy Policy**: [https://recoder.xyz/privacy](https://recoder.xyz/privacy)
- **GitHub**: [https://github.com/recoderxyz/recoder](https://github.com/recoderxyz/recoder)

---

**Built with privacy and performance in mind for the Recoder.xyz ecosystem** 🚀