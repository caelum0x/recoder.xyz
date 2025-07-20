# 🔒 Security & Compliance Framework

Enterprise-grade security and compliance layer for CodeCraft CLI providing comprehensive protection against threats, vulnerabilities, and regulatory violations.

## 🛡️ Components

### 1. AI Prompt Sanitization
- **Purpose**: Prevent prompt injection attacks and AI manipulation
- **Features**: 25+ injection patterns, risk scoring, real-time detection
- **Protection**: Jailbreak attempts, system manipulation, code execution

### 2. Code Vulnerability Scanner
- **Purpose**: Real-time SAST/DAST vulnerability detection
- **Features**: Multi-language support, 8 built-in rules, NPM audit integration
- **Detection**: SQL injection, XSS, command injection, weak crypto

### 3. End-to-End Encryption
- **Purpose**: Protect sensitive data with enterprise-grade encryption
- **Features**: AES-256-GCM, RSA support, key rotation, compression
- **Standards**: FIPS 140-2 compliant, tamper-evident

### 4. Secret Detection
- **Purpose**: Prevent API keys and credentials from being exposed
- **Features**: 15+ secret patterns, entropy analysis, auto-remediation
- **Coverage**: AWS, GitHub, Stripe, Google, database URLs, private keys

### 5. Compliance Engine
- **Purpose**: Automated compliance with regulatory frameworks
- **Features**: GDPR, SOC2, HIPAA support, PIA automation, data subject rights
- **Capabilities**: Privacy assessments, evidence collection, reporting

### 6. Audit Trail
- **Purpose**: Tamper-proof security event logging
- **Features**: Hash chains, digital signatures, real-time alerting
- **Formats**: JSON, CSV, Syslog, CEF export

### 7. Threat Detection
- **Purpose**: AI-powered behavioral threat analysis
- **Features**: 5 threat signatures, MITRE ATT&CK integration, threat hunting
- **Detection**: Brute force, privilege escalation, data exfiltration

### 8. Security Monitoring & Alerting
- **Purpose**: Real-time security dashboard and alerting system
- **Features**: Custom alert rules, metrics collection, SIEM integration
- **Integrations**: Slack, email, webhooks, Prometheus

## 🚀 Quick Start

```typescript
import { SecurityManager } from '@recoder/security';

// Initialize with default configuration
const security = new SecurityManager();

// Get all security components
const components = security.getComponents();

// Check overall security status
const status = await security.getSecurityStatus();

// Get real-time dashboard
const dashboard = await components.securityMonitor.getSecurityDashboard();
```

## 📋 Configuration

### Basic Configuration
```typescript
const security = new SecurityManager({
  encryption: {
    enabled: true,
    algorithm: 'aes-256-gcm',
    keyRotationDays: 90,
  },
  secretDetection: {
    enabled: true,
    scanGenerated: true,
    autoRemediate: true,
  },
  vulnerabilityScanning: {
    enabled: true,
    scanTypes: ['sast', 'dependency', 'secrets'],
    failOnSeverity: 'high',
  },
  compliance: {
    enabledFrameworks: ['gdpr', 'sox', 'hipaa'],
    automaticAssessment: true,
  },
  threatDetection: {
    enabled: true,
    realTimeMonitoring: true,
    behaviorAnalysis: true,
  },
});
```

### Monitoring Configuration
```typescript
const monitor = new SecurityMonitor({
  enabled: true,
  realTimeMonitoring: true,
  alertingEnabled: true,
  thresholds: {
    securityScore: { warning: 70, critical: 50 },
    vulnerabilities: { warning: 5, critical: 10 },
  },
  integrations: {
    slack: { enabled: true, webhook: 'https://hooks.slack.com/...' },
    siem: { enabled: true, endpoint: 'https://siem.company.com' },
  },
});
```

## 🔍 Usage Examples

### Scan Code for Vulnerabilities
```typescript
const scanner = components.vulnerabilityScanner;
const result = await scanner.scanCode('./src', {
  scanTypes: ['sast', 'secrets'],
  includeTests: false,
});

console.log(`Found ${result.findings.length} vulnerabilities`);
```

### Detect Secrets in Text
```typescript
const detector = components.secretDetector;
const detections = await detector.scanText(code, {
  scanType: 'pre_generation',
  userId: 'user123',
});

// Auto-remediate detected secrets
const cleanCode = await detector.remediateText(code, detections);
```

### Encrypt Sensitive Data
```typescript
const encryption = components.encryption;
const encrypted = await encryption.encryptData(
  'sensitive information',
  { purpose: 'user_data', classification: 'confidential' }
);

const decrypted = await encryption.decryptData(encrypted);
```

### Compliance Assessment
```typescript
const compliance = components.complianceEngine;
const report = await compliance.assessCompliance('gdpr');

console.log(`Compliance status: ${report.overallStatus}`);
console.log(`Findings: ${report.findings.length}`);
```

### Create Custom Alert Rules
```typescript
const monitor = components.securityMonitor;
const ruleId = monitor.createAlertRule({
  name: 'High Vulnerability Count',
  description: 'Alert when vulnerabilities exceed threshold',
  enabled: true,
  severity: 'high',
  condition: {
    metric: 'vulnerability_findings',
    operator: '>=',
    threshold: 10,
    timeWindow: 60,
  },
  actions: [
    {
      type: 'slack',
      config: { webhook: 'https://hooks.slack.com/...' },
      enabled: true,
    },
  ],
});
```

## 🏛️ Compliance Frameworks

### GDPR (General Data Protection Regulation)
- ✅ Consent management (Article 7)
- ✅ Right to erasure (Article 17)
- ✅ Security of processing (Article 32)
- ✅ Privacy Impact Assessments
- ✅ Data subject rights automation

### SOC 2 Type II
- ✅ Logical and physical access controls (CC6.1)
- ✅ Data transmission and disposal (CC6.7)
- ✅ Continuous monitoring
- ✅ Evidence collection

### HIPAA
- ✅ Administrative safeguards (164.308)
- ✅ Technical safeguards (164.312)
- ✅ PHI protection
- ✅ Audit controls

## 🔧 Security Standards

### Implemented Standards
- **OWASP Top 10**: Complete coverage of web application security risks
- **MITRE ATT&CK**: Threat detection based on adversary tactics
- **CWE**: Common Weakness Enumeration for vulnerability classification
- **NIST**: Cryptographic standards and key management
- **ISO 27001**: Information security management

### Cryptographic Standards
- **AES-256-GCM**: Authenticated encryption with associated data
- **RSA-4096**: Asymmetric key encryption
- **PBKDF2**: Password-based key derivation
- **SHA-256**: Cryptographic hashing
- **HMAC**: Message authentication codes

## 📊 Monitoring & Metrics

### Security Metrics
- Overall security score (0-100)
- Vulnerability count by severity
- Secret detection statistics
- Threat detection events
- Compliance assessment results

### Alert Types
- **Critical**: Immediate security threats requiring action
- **High**: Important security events needing attention
- **Medium**: Notable security events for awareness
- **Low**: Informational security events

### Integration Support
- **SIEM**: Forward events to security information systems
- **Slack**: Real-time notifications to team channels
- **Email**: Alert notifications to security teams
- **Webhooks**: Custom integrations with external systems
- **Prometheus**: Metrics export for monitoring platforms

## 🚨 Incident Response

### Automated Response Actions
1. **Threat Detection**: Automatic threat analysis and containment
2. **Secret Exposure**: Immediate secret redaction and alerting
3. **Vulnerability**: Risk assessment and remediation guidance
4. **Compliance Violation**: Automatic reporting and corrective actions

### Manual Response Procedures
1. **Alert Triage**: Severity-based prioritization
2. **Investigation**: Detailed forensic analysis
3. **Containment**: Isolation of affected systems
4. **Remediation**: Fix implementation and verification
5. **Recovery**: System restoration and monitoring
6. **Lessons Learned**: Process improvement

## 🔐 Security Architecture

### Defense in Depth
- **Perimeter Security**: Input validation and sanitization
- **Application Security**: Code scanning and vulnerability detection
- **Data Security**: Encryption and access controls
- **Monitoring**: Real-time threat detection and alerting
- **Compliance**: Regulatory framework adherence

### Zero Trust Principles
- **Verify Explicitly**: All security events are validated
- **Least Privilege**: Minimal access rights enforcement
- **Assume Breach**: Continuous monitoring and detection

## 📈 Performance

### Benchmarks
- **Vulnerability Scanning**: 1000+ files/minute
- **Secret Detection**: 10MB+ code/second
- **Encryption**: 50MB+ data/second
- **Threat Detection**: Real-time event processing
- **Compliance**: Automated assessment generation

### Resource Usage
- **Memory**: ~50MB baseline, scales with workload
- **CPU**: Low overhead, async processing
- **Storage**: Configurable retention periods
- **Network**: Minimal external dependencies

## 🤝 Contributing

We welcome contributions to improve the security framework:

1. **Security Vulnerabilities**: Report via private disclosure
2. **Feature Requests**: Submit via GitHub issues
3. **Bug Reports**: Include reproduction steps
4. **Documentation**: Help improve clarity and coverage

### Security Guidelines
- All code must pass security scanning
- Cryptographic changes require security review
- Compliance updates need legal validation
- Performance changes require benchmarking

## 📄 License

This security framework is part of the CodeCraft CLI project and follows the same licensing terms.

## 🆘 Support

For security-related issues:
- **Critical Security Issues**: security@codecraft.dev
- **General Support**: support@codecraft.dev
- **Documentation**: docs.codecraft.dev/security

---

**⚠️ Security Notice**: This framework provides enterprise-grade security capabilities but should be configured and deployed following your organization's security policies and regulatory requirements.