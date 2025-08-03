# Recoder.xyz Production Monitoring

Complete monitoring stack for the Recoder.xyz platform including metrics collection, visualization, and alerting.

## 🚀 Quick Start

```bash
# Start monitoring stack
docker-compose -f docker-compose.monitoring.yml up -d

# View services
docker-compose -f docker-compose.monitoring.yml ps

# View logs
docker-compose -f docker-compose.monitoring.yml logs -f
```

## 📊 Services

### Prometheus (Port 9090)
- **URL**: http://localhost:9090
- **Purpose**: Metrics collection and storage
- **Targets**: All Recoder services, system metrics, external endpoints

### Grafana (Port 3001)
- **URL**: http://localhost:3001
- **Login**: admin / admin123 (change in production)
- **Purpose**: Metrics visualization and dashboards

### Alertmanager (Port 9093)
- **URL**: http://localhost:9093
- **Purpose**: Alert routing and notification management

### Uptime Kuma (Port 3002)
- **URL**: http://localhost:3002
- **Purpose**: Uptime monitoring and status page

## 🔧 Configuration

### Environment Variables

```bash
# Required for production
GRAFANA_PASSWORD=your-secure-password
SLACK_WEBHOOK_URL=your-slack-webhook-url
SMTP_PASSWORD=your-smtp-password
```

### Custom Dashboards

Add Grafana dashboards in `grafana/provisioning/dashboards/`

### Alert Rules

Modify `alert_rules.yml` to customize alerting thresholds and conditions.

## 📈 Monitored Metrics

### System Metrics
- CPU usage, memory usage, disk space
- Network I/O, disk I/O
- Container resource usage

### Application Metrics
- HTTP response times and status codes
- API endpoint availability
- Service uptime and health checks

### Business Metrics
- User registrations and activity
- Code generation requests
- Extension installations

### External Services
- VS Code Marketplace availability
- NPM registry status
- Third-party API status

## 🚨 Alerts

### Critical Alerts
- Service down (immediate notification)
- High memory usage (>90%)
- Disk space low (<10%)
- Main platform unreachable

### Warning Alerts
- High CPU usage (>80%)
- High response times (>1s)
- Container restarts
- External service issues

## 📱 Notification Channels

### Email
- Configure SMTP settings in `alertmanager.yml`
- Alerts sent to admin@recoder.xyz

### Slack
- Set `SLACK_WEBHOOK_URL` environment variable
- Alerts posted to #alerts channel

### PagerDuty (Optional)
- Add PagerDuty integration for critical alerts
- Configure in `alertmanager.yml`

## 🔍 Troubleshooting

### Common Issues

1. **Prometheus targets down**
   ```bash
   # Check if services are running
   docker ps | grep recoder
   
   # Check Prometheus targets
   curl http://localhost:9090/api/v1/targets
   ```

2. **Grafana dashboard empty**
   - Verify Prometheus data source is configured
   - Check if metrics are being collected
   - Ensure time range is appropriate

3. **Alerts not firing**
   - Check alert rules syntax: `promtool check rules alert_rules.yml`
   - Verify Alertmanager configuration
   - Check notification channel settings

### Log Analysis

```bash
# View all monitoring logs
docker-compose -f docker-compose.monitoring.yml logs

# View specific service logs
docker-compose -f docker-compose.monitoring.yml logs prometheus
docker-compose -f docker-compose.monitoring.yml logs grafana
docker-compose -f docker-compose.monitoring.yml logs alertmanager
```

## 🔒 Security

### Production Hardening
1. Change default Grafana password
2. Enable HTTPS with reverse proxy
3. Restrict access with firewall rules
4. Use secrets management for sensitive data
5. Regular security updates

### Access Control
- Grafana: Role-based access control
- Prometheus: IP whitelist recommended
- Alertmanager: Authentication required

## 🚀 Scaling

### High Availability
- Deploy Prometheus in HA mode
- Use external storage (e.g., Thanos)
- Load balance Grafana instances
- Cluster Alertmanager

### Performance Optimization
- Adjust retention policies
- Configure recording rules
- Optimize query performance
- Use metric relabeling

## 📚 Resources

- [Prometheus Documentation](https://prometheus.io/docs/)
- [Grafana Documentation](https://grafana.com/docs/)
- [Alertmanager Documentation](https://prometheus.io/docs/alerting/latest/alertmanager/)
- [Uptime Kuma Documentation](https://github.com/louislam/uptime-kuma)