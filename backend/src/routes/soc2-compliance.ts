/**
 * SOC 2 Compliance API Rou}
import { realCodeGeneratorService } from '../../../production-engine/src/services/real-code-generator-service.js';

const router = express.Router(); * KILLER FEATURE: Enterprise compliance-as-a-service
 * Cursor/Copilot have ZERO compliance capabilities - we dominate enterprise sales!
 */

import express from 'express';
import { Logger } from 'recoder-shared';

// Define interfaces for compliance report structure
interface ComplianceSummary {
  overallScore: number;
  criticalViolations: number;
  highViolations: number;
  riskLevel: string;
}

interface ComplianceReport {
  summary: ComplianceSummary;
  violations: any[];
}

// Define compliance types locally until available in published package
enum DataClassification {
  PUBLIC = 'public',
  INTERNAL = 'internal', 
  CONFIDENTIAL = 'confidential',
  RESTRICTED = 'restricted'
}

enum ProjectType {
  WEB = 'web',
  MOBILE = 'mobile', 
  API = 'api',
  DESKTOP = 'desktop',
  CLI = 'cli'
}

enum IndustryStandard {
  SOC2 = 'SOC2',
  SOX = 'SOX',
  GDPR = 'GDPR',
  HIPAA = 'HIPAA', 
  PCI_DSS = 'PCI_DSS'
}
import { realCodeGeneratorService } from '../../../production-engine/dist/services/real-code-generator-service.js';

const router = express.Router();

// POST /api/compliance/scan-code - Scan code for SOC 2 compliance
router.post('/scan-code', async (req, res) => {
  try {
    const { 
      code, 
      filePath, 
      language, 
      framework, 
      dataClassification, 
      industryStandards,
      projectType 
    } = req.body;

    if (!code || !filePath) {
      return res.status(400).json({
        success: false,
        error: 'Code content and file path are required'
      });
    }

    // Create mock request for compliance scanning
    const mockRequest = {
      description: 'Compliance scan request',
      type: 'web' as const,
      framework: framework || 'react',
      outputPath: '/tmp/scan',
      compliance: {
        enabled: true,
        enforceBlocking: false,
        dataClassification: dataClassification || DataClassification.INTERNAL,
        industryStandards: industryStandards || [IndustryStandard.SOX],
        autoRemediation: true
      }
    };

    const files = [{
      path: filePath,
      content: code,
      type: 'code' as const
    }];

    const result = await realCodeGeneratorService['validateCompliance'](files, mockRequest);

    res.json({
      success: true,
      compliance: result.complianceValidation,
      blocked: result.blockedByCompliance,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Code compliance scan failed:', error);
    res.status(500).json({
      success: false,
      error: 'Compliance scan failed',
      details: error.message
    });
  }
});

// POST /api/compliance/scan-project - Full project compliance scan
router.post('/scan-project', async (req, res) => {
  try {
    const { projectPath } = req.body;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path is required'
      });
    }

    const scanResults = await realCodeGeneratorService.scanProjectCompliance(projectPath);
    const dashboard = await realCodeGeneratorService.generateComplianceDashboard(projectPath);

    res.json({
      success: true,
      scanResults: Array.from(scanResults.entries()).map(([path, report]) => ({
        filePath: path,
        complianceScore: (report as ComplianceReport).summary.overallScore,
        violations: (report as ComplianceReport).violations.length,
        criticalViolations: (report as ComplianceReport).summary.criticalViolations,
        highViolations: (report as ComplianceReport).summary.highViolations,
        riskLevel: (report as ComplianceReport).summary.riskLevel
      })),
      dashboard,
      timestamp: new Date().toISOString()
    });

  } catch (error: any) {
    Logger.error('Project compliance scan failed:', error);
    res.status(500).json({
      success: false,
      error: 'Project compliance scan failed',
      details: error.message
    });
  }
});

// GET /api/compliance/config - Get current compliance configuration
router.get('/config', (req, res) => {
  try {
    const config = realCodeGeneratorService.getComplianceConfiguration();
    
    res.json({
      success: true,
      configuration: config,
      availableStandards: Object.values(IndustryStandard),
      availableClassifications: Object.values(DataClassification),
      availableProjectTypes: Object.values(ProjectType)
    });

  } catch (error: any) {
    Logger.error('Failed to get compliance config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve compliance configuration'
    });
  }
});

// POST /api/compliance/config - Update compliance configuration
router.post('/config', async (req, res) => {
  try {
    const { configuration } = req.body;

    if (!configuration) {
      return res.status(400).json({
        success: false,
        error: 'Configuration object is required'
      });
    }

    realCodeGeneratorService.updateComplianceConfiguration(configuration);

    res.json({
      success: true,
      message: 'Compliance configuration updated successfully',
      configuration: realCodeGeneratorService.getComplianceConfiguration()
    });

  } catch (error: any) {
    Logger.error('Failed to update compliance config:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update compliance configuration'
    });
  }
});

// GET /api/compliance/rules - Get all available compliance rules
router.get('/rules', (req, res) => {
  try {
    // In production, this would get rules from the scanner
    const mockRules = [
      {
        id: 'SEC-001',
        name: 'Input Validation Required',
        category: 'security',
        severity: 'critical',
        description: 'All user input must be validated and sanitized'
      },
      {
        id: 'SEC-002', 
        name: 'SQL Injection Prevention',
        category: 'security',
        severity: 'critical',
        description: 'Prevent SQL injection through parameterized queries'
      },
      {
        id: 'SEC-003',
        name: 'Authentication Required',
        category: 'security',
        severity: 'high',
        description: 'Sensitive operations must require authentication'
      },
      {
        id: 'SEC-004',
        name: 'Authorization Controls',
        category: 'security',
        severity: 'high',
        description: 'Access control checks must be in place'
      },
      {
        id: 'SEC-005',
        name: 'Encryption at Rest',
        category: 'confidentiality',
        severity: 'critical',
        description: 'Sensitive data must be encrypted when stored'
      },
      {
        id: 'AVL-001',
        name: 'Error Handling',
        category: 'availability',
        severity: 'medium',
        description: 'Proper error handling must be implemented'
      },
      {
        id: 'PRI-001',
        name: 'PII Protection',
        category: 'privacy',
        severity: 'critical',
        description: 'Personally Identifiable Information must be protected'
      }
    ];

    res.json({
      success: true,
      rules: mockRules,
      totalRules: mockRules.length,
      categories: ['security', 'availability', 'processing_integrity', 'confidentiality', 'privacy']
    });

  } catch (error: any) {
    Logger.error('Failed to get compliance rules:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve compliance rules'
    });
  }
});

// GET /api/compliance/certificate-eligibility - Check SOC 2 certificate eligibility
router.get('/certificate-eligibility', async (req, res) => {
  try {
    const { projectPath } = req.query;

    if (!projectPath) {
      return res.status(400).json({
        success: false,
        error: 'Project path is required'
      });
    }

    const scanResults = await realCodeGeneratorService.scanProjectCompliance(projectPath as string);
    const reports = Array.from(scanResults.values()) as ComplianceReport[];

    const totalCritical = reports.reduce((sum, r) => sum + r.summary.criticalViolations, 0);
    const totalHigh = reports.reduce((sum, r) => sum + r.summary.highViolations, 0);
    const avgScore = reports.length > 0 ? 
      reports.reduce((sum, r) => sum + r.summary.overallScore, 0) / reports.length : 100;

    let eligibility = {
      soc2Type1: false,
      soc2Type2: false,
      auditReadiness: Math.round(avgScore),
      requiredChanges: [] as string[],
      estimatedTimeframe: '',
      blockers: [] as string[]
    };

    if (totalCritical > 0) {
      eligibility.blockers.push(`${totalCritical} critical security violations`);
      eligibility.requiredChanges.push('Fix all critical security violations');
    }

    if (totalHigh > 5) {
      eligibility.blockers.push(`${totalHigh} high-priority compliance issues`);
      eligibility.requiredChanges.push('Address high-priority compliance gaps');
    }

    if (avgScore < 85) {
      eligibility.blockers.push(`Compliance score too low: ${avgScore}%`);
      eligibility.requiredChanges.push('Improve overall compliance score to 85% minimum');
    }

    // Determine eligibility
    if (totalCritical === 0 && totalHigh === 0 && avgScore >= 95) {
      eligibility.soc2Type1 = true;
      eligibility.soc2Type2 = true;
      eligibility.estimatedTimeframe = 'Ready now';
    } else if (totalCritical === 0 && avgScore >= 85) {
      eligibility.soc2Type1 = true;
      eligibility.estimatedTimeframe = '2-4 weeks for Type II readiness';
    } else {
      eligibility.estimatedTimeframe = '1-3 months with remediation';
    }

    res.json({
      success: true,
      eligibility,
      summary: {
        filesScanned: scanResults.size,
        averageScore: Math.round(avgScore * 10) / 10,
        totalViolations: reports.reduce((sum, r) => sum + r.violations.length, 0),
        criticalViolations: totalCritical,
        highViolations: totalHigh
      },
      competitiveAdvantage: {
        message: "This comprehensive SOC 2 compliance analysis gives Recoder a MASSIVE advantage over Cursor and Copilot",
        features: [
          "Enterprise-grade compliance scanning",
          "SOC 2 audit readiness assessment", 
          "Automated violation detection",
          "Compliance certificate eligibility",
          "Industry standards integration",
          "Real-time compliance monitoring"
        ],
        competitors: "Cursor and Copilot have ZERO compliance capabilities"
      }
    });

  } catch (error: any) {
    Logger.error('Certificate eligibility check failed:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to check certificate eligibility'
    });
  }
});

// GET /api/compliance/demo-report - Generate a demo compliance report
router.get('/demo-report', (req, res) => {
  try {
    const demoReport = {
      projectName: "Enterprise Web Application",
      scanDate: new Date().toISOString(),
      summary: {
        overallScore: 87,
        compliancePercentage: 87,
        totalRules: 15,
        passedRules: 13,
        failedRules: 2,
        criticalViolations: 0,
        highViolations: 1,
        mediumViolations: 3,
        lowViolations: 2,
        riskLevel: "medium"
      },
      violations: [
        {
          ruleId: "SEC-003",
          ruleName: "Authentication Required",
          severity: "high",
          category: "security",
          message: "API endpoint without authentication middleware",
          file: "src/routes/api.ts",
          line: 45,
          remediation: "Add authentication middleware to protect sensitive endpoints"
        },
        {
          ruleId: "AVL-001",
          ruleName: "Error Handling",
          severity: "medium", 
          category: "availability",
          message: "Missing error handling in async function",
          file: "src/services/user-service.ts",
          line: 23,
          remediation: "Add proper try-catch blocks and error handling"
        },
        {
          ruleId: "PRI-002",
          ruleName: "Data Retention Policies",
          severity: "medium",
          category: "privacy",
          message: "User data processing without retention policy",
          file: "src/models/user.ts",
          line: 15,
          remediation: "Implement automated data retention and deletion policies"
        }
      ],
      certificateEligibility: {
        soc2Type1: true,
        soc2Type2: false,
        auditReadiness: 87,
        requiredChanges: [
          "Address 1 high-priority authentication issue",
          "Improve error handling coverage",
          "Implement data retention policies"
        ],
        estimatedTimeframe: "2-3 weeks"
      },
      recommendations: [
        "🔒 Add authentication middleware to all sensitive API endpoints",
        "⚠️ Implement comprehensive error handling throughout the application",
        "📋 Create and enforce data retention policies for user information",
        "🏛️ Consider upgrading to enterprise compliance monitoring for continuous oversight"
      ],
      competitiveAdvantage: {
        recoderFeatures: [
          "✅ Real-time SOC 2 compliance scanning",
          "✅ Automated violation detection and remediation",
          "✅ Certificate readiness assessment",
          "✅ Industry standards integration (HIPAA, PCI-DSS, GDPR)",
          "✅ Enterprise audit trail and reporting",
          "✅ Compliance-aware code generation"
        ],
        cursorFeatures: [
          "❌ No compliance capabilities",
          "❌ No security scanning", 
          "❌ No audit readiness assessment",
          "❌ No enterprise reporting",
          "❌ No regulatory compliance",
          "❌ No SOC 2 support"
        ],
        copilotFeatures: [
          "❌ No compliance capabilities",
          "❌ Basic security suggestions only",
          "❌ No audit readiness assessment", 
          "❌ No enterprise reporting",
          "❌ No regulatory compliance",
          "❌ No SOC 2 support"
        ]
      }
    };

    res.json({
      success: true,
      demoReport,
      message: "This is a sample compliance report showcasing Recoder's enterprise capabilities",
      note: "Recoder provides the ONLY AI coding assistant with built-in SOC 2 compliance scanning"
    });

  } catch (error: any) {
    Logger.error('Failed to generate demo report:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to generate demo report'
    });
  }
});

// Health check for compliance service
router.get('/health', (req, res) => {
  res.json({
    success: true,
    status: 'healthy',
    service: 'soc2-compliance',
    features: [
      'Real-time compliance scanning',
      'SOC 2 audit readiness',
      'Enterprise security validation',
      'Industry standards compliance',
      'Automated violation detection',
      'Certificate eligibility assessment'
    ],
    competitiveAdvantage: 'ONLY AI coding assistant with enterprise SOC 2 compliance',
    timestamp: new Date().toISOString()
  });
});

export { router as soc2ComplianceRouter };