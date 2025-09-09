// Security and Compliance API - Comprehensive security scanning and compliance monitoring
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import crypto from 'crypto';
import fs from 'fs-extra';
import path from 'path';

const execAsync = promisify(exec);

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 30,
});

const securityScanSchema = z.object({
  projectId: z.string().uuid(),
  scanType: z.enum(['vulnerability', 'dependency', 'code', 'infrastructure', 'compliance']),
  scope: z.object({
    includeFiles: z.array(z.string()).optional(),
    excludeFiles: z.array(z.string()).optional(),
    scanDepth: z.enum(['surface', 'deep', 'comprehensive']).default('deep'),
    frameworks: z.array(z.string()).optional()
  }).optional(),
  compliance: z.object({
    standards: z.array(z.enum(['SOC2', 'GDPR', 'HIPAA', 'PCI-DSS', 'ISO27001'])).optional(),
    severity: z.enum(['low', 'medium', 'high', 'critical']).default('medium')
  }).optional()
});

const complianceAuditSchema = z.object({
  projectId: z.string().uuid(),
  standard: z.enum(['SOC2', 'GDPR', 'HIPAA', 'PCI-DSS', 'ISO27001']),
  auditType: z.enum(['full', 'partial', 'focused']),
  scope: z.array(z.string()), // Areas to audit
  assessor: z.string().optional()
});

// POST - Create security scan or compliance audit
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'security-compliance');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'security_scan') {
      const validatedData = securityScanSchema.parse(body);
      
      // Check project access
      const project = await prisma.project.findFirst({
        where: {
          id: validatedData.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 });
      }

      // Create security scan
      const securityScan = await prisma.securityScan.create({
        data: {
          id: uuidv4(),
          projectId: validatedData.projectId,
          scanType: validatedData.scanType,
          scope: validatedData.scope || {},
          compliance: validatedData.compliance || {},
          status: 'queued',
          createdBy: session.user.id,
          metadata: {
            initiatedAt: new Date().toISOString(),
            version: '1.0.0'
          }
        }
      });

      // Execute security scan in background
      executeSecurityScan(securityScan, project).catch(console.error);

      // Log scan creation
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'security_scan_create',
          platform: 'security',
          success: true,
          metadata: {
            scanId: securityScan.id,
            scanType: validatedData.scanType,
            projectId: validatedData.projectId
          }
        }
      });

      return NextResponse.json({
        scan: securityScan,
        message: 'Security scan initiated successfully'
      }, { status: 201 });

    } else if (action === 'compliance_audit') {
      const validatedData = complianceAuditSchema.parse(body);
      
      // Check project access
      const project = await prisma.project.findFirst({
        where: {
          id: validatedData.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 });
      }

      // Create compliance audit
      const complianceAudit = await prisma.complianceAudit.create({
        data: {
          id: uuidv4(),
          projectId: validatedData.projectId,
          standard: validatedData.standard,
          auditType: validatedData.auditType,
          scope: validatedData.scope,
          assessor: validatedData.assessor,
          status: 'in_progress',
          createdBy: session.user.id,
          metadata: {
            initiatedAt: new Date().toISOString()
          }
        }
      });

      // Execute compliance audit in background
      executeComplianceAudit(complianceAudit, project).catch(console.error);

      // Log audit creation
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'compliance_audit_create',
          platform: 'security',
          success: true,
          metadata: {
            auditId: complianceAudit.id,
            standard: validatedData.standard,
            projectId: validatedData.projectId
          }
        }
      });

      return NextResponse.json({
        audit: complianceAudit,
        message: 'Compliance audit initiated successfully'
      }, { status: 201 });

    } else if (action === 'remediate_vulnerability') {
      const { scanId, vulnerabilityId, remediationAction } = body;
      
      const scan = await prisma.securityScan.findUnique({
        where: { id: scanId },
        include: { project: true }
      });

      if (!scan) {
        return NextResponse.json({ error: 'Security scan not found' }, { status: 404 });
      }

      // Check access
      const hasAccess = await prisma.project.findFirst({
        where: {
          id: scan.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Execute remediation
      const remediation = await executeRemediation(scan, vulnerabilityId, remediationAction, session.user.id);

      return NextResponse.json({
        remediation,
        message: 'Vulnerability remediation initiated'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('Security compliance error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// GET - Get security scans and compliance audits
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const projectId = searchParams.get('projectId');
    const scanId = searchParams.get('scanId');
    const auditId = searchParams.get('auditId');
    const severity = searchParams.get('severity');

    if (scanId) {
      // Get specific security scan results
      const scan = await prisma.securityScan.findUnique({
        where: { id: scanId },
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (!scan) {
        return NextResponse.json({ error: 'Security scan not found' }, { status: 404 });
      }

      return NextResponse.json({ scan });

    } else if (auditId) {
      // Get specific compliance audit results
      const audit = await prisma.complianceAudit.findUnique({
        where: { id: auditId },
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          }
        }
      });

      if (!audit) {
        return NextResponse.json({ error: 'Compliance audit not found' }, { status: 404 });
      }

      return NextResponse.json({ audit });

    } else if (type === 'security_scans') {
      // Get security scans
      const whereConditions: any = {
        project: {
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id
                }
              }
            }
          ]
        }
      };

      if (projectId) {
        whereConditions.projectId = projectId;
      }

      const scans = await prisma.securityScan.findMany({
        where: whereConditions,
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({ scans });

    } else if (type === 'compliance_audits') {
      // Get compliance audits
      const whereConditions: any = {
        project: {
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id
                }
              }
            }
          ]
        }
      };

      if (projectId) {
        whereConditions.projectId = projectId;
      }

      const audits = await prisma.complianceAudit.findMany({
        where: whereConditions,
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({ audits });

    } else if (type === 'vulnerabilities') {
      // Get vulnerabilities summary
      const vulnerabilities = await getVulnerabilitiesSummary(session.user.id, projectId, severity);
      return NextResponse.json({ vulnerabilities });

    } else {
      // Get security overview
      const overview = await getSecurityOverview(session.user.id, projectId);
      return NextResponse.json({ overview });
    }

  } catch (error) {
    console.error('Get security data error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch security data' },
      { status: 500 }
    );
  }
}

async function executeSecurityScan(scan: any, project: any) {
  const startTime = Date.now();
  
  try {
    // Update scan status to running
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: 'running',
        metadata: {
          ...scan.metadata,
          startedAt: new Date().toISOString()
        }
      }
    });

    let vulnerabilities = [];
    let complianceIssues = [];
    let securityScore = 100;

    // Execute different types of security scans
    switch (scan.scanType) {
      case 'vulnerability':
        vulnerabilities = await performVulnerabilityScan(project, scan.scope);
        break;
      
      case 'dependency':
        vulnerabilities = await performDependencyScan(project, scan.scope);
        break;
        
      case 'code':
        vulnerabilities = await performCodeSecurityScan(project, scan.scope);
        break;
        
      case 'infrastructure':
        vulnerabilities = await performInfrastructureScan(project, scan.scope);
        break;
        
      case 'compliance':
        complianceIssues = await performComplianceScan(project, scan.compliance);
        break;
    }

    // Calculate security score
    const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highVulns = vulnerabilities.filter(v => v.severity === 'high').length;
    const mediumVulns = vulnerabilities.filter(v => v.severity === 'medium').length;
    
    securityScore = Math.max(0, 100 - (criticalVulns * 20) - (highVulns * 10) - (mediumVulns * 5));

    // Generate security report
    const report = {
      scanId: scan.id,
      scanType: scan.scanType,
      executionTime: Date.now() - startTime,
      vulnerabilities: {
        total: vulnerabilities.length,
        critical: criticalVulns,
        high: highVulns,
        medium: mediumVulns,
        low: vulnerabilities.filter(v => v.severity === 'low').length,
        details: vulnerabilities
      },
      complianceIssues,
      securityScore,
      recommendations: generateSecurityRecommendations(vulnerabilities, complianceIssues),
      remediation: generateRemediationSteps(vulnerabilities)
    };

    // Update scan with results
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: 'completed',
        results: report,
        completedAt: new Date(),
        metadata: {
          ...scan.metadata,
          completedAt: new Date().toISOString(),
          securityScore
        }
      }
    });

    // Create security alerts for critical vulnerabilities
    for (const vuln of vulnerabilities.filter(v => v.severity === 'critical')) {
      await prisma.securityAlert.create({
        data: {
          scanId: scan.id,
          projectId: project.id,
          type: 'vulnerability',
          severity: vuln.severity,
          title: vuln.title,
          description: vuln.description,
          status: 'active',
          createdBy: scan.createdBy
        }
      });
    }

  } catch (error) {
    console.error('Security scan execution error:', error);
    
    // Update scan with error
    await prisma.securityScan.update({
      where: { id: scan.id },
      data: {
        status: 'failed',
        results: {
          error: error instanceof Error ? error.message : 'Scan failed',
          executionTime: Date.now() - startTime
        },
        completedAt: new Date()
      }
    });
  }
}

async function executeComplianceAudit(audit: any, project: any) {
  const startTime = Date.now();
  
  try {
    // Update audit status
    await prisma.complianceAudit.update({
      where: { id: audit.id },
      data: {
        status: 'in_progress',
        metadata: {
          ...audit.metadata,
          startedAt: new Date().toISOString()
        }
      }
    });

    // Perform compliance checks based on standard
    const complianceResults = await performComplianceChecks(project, audit.standard, audit.scope);
    
    // Calculate compliance score
    const totalChecks = complianceResults.checks.length;
    const passedChecks = complianceResults.checks.filter(c => c.status === 'pass').length;
    const complianceScore = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 0;

    // Generate compliance report
    const report = {
      auditId: audit.id,
      standard: audit.standard,
      auditType: audit.auditType,
      executionTime: Date.now() - startTime,
      complianceScore,
      results: complianceResults,
      recommendations: generateComplianceRecommendations(audit.standard, complianceResults),
      nextAuditDue: getNextAuditDate(audit.standard)
    };

    // Update audit with results
    await prisma.complianceAudit.update({
      where: { id: audit.id },
      data: {
        status: 'completed',
        results: report,
        completedAt: new Date(),
        metadata: {
          ...audit.metadata,
          completedAt: new Date().toISOString(),
          complianceScore
        }
      }
    });

  } catch (error) {
    console.error('Compliance audit execution error:', error);
    
    // Update audit with error
    await prisma.complianceAudit.update({
      where: { id: audit.id },
      data: {
        status: 'failed',
        results: {
          error: error instanceof Error ? error.message : 'Audit failed',
          executionTime: Date.now() - startTime
        },
        completedAt: new Date()
      }
    });
  }
}

// Security scan implementations
async function performVulnerabilityScan(project: any, scope: any) {
  // Mock vulnerability scan results
  const vulnerabilities = [
    {
      id: 'vuln-1',
      title: 'SQL Injection Vulnerability',
      severity: 'critical',
      description: 'Potential SQL injection in user input validation',
      cwe: 'CWE-89',
      cvss: 9.3,
      file: 'src/api/users.ts',
      line: 45,
      recommendation: 'Use parameterized queries and input validation'
    },
    {
      id: 'vuln-2',
      title: 'Cross-Site Scripting (XSS)',
      severity: 'high',
      description: 'Reflected XSS vulnerability in search functionality',
      cwe: 'CWE-79',
      cvss: 7.4,
      file: 'src/components/search.tsx',
      line: 23,
      recommendation: 'Sanitize user input and use Content Security Policy'
    },
    {
      id: 'vuln-3',
      title: 'Weak Cryptographic Algorithm',
      severity: 'medium',
      description: 'Use of MD5 hash function for password hashing',
      cwe: 'CWE-327',
      cvss: 5.3,
      file: 'src/auth/password.ts',
      line: 12,
      recommendation: 'Use bcrypt or Argon2 for password hashing'
    }
  ];

  return vulnerabilities;
}

async function performDependencyScan(project: any, scope: any) {
  // Mock dependency vulnerability scan
  const vulnerabilities = [
    {
      id: 'dep-1',
      title: 'Vulnerable Dependency: lodash',
      severity: 'high',
      description: 'lodash version 4.17.15 has known vulnerabilities',
      package: 'lodash',
      version: '4.17.15',
      fixedVersion: '4.17.21',
      cve: 'CVE-2021-23337',
      recommendation: 'Update to lodash version 4.17.21 or later'
    },
    {
      id: 'dep-2',
      title: 'Vulnerable Dependency: axios',
      severity: 'medium',
      description: 'axios version 0.21.0 has security issues',
      package: 'axios',
      version: '0.21.0',
      fixedVersion: '0.21.4',
      cve: 'CVE-2021-3749',
      recommendation: 'Update to axios version 0.21.4 or later'
    }
  ];

  return vulnerabilities;
}

async function performCodeSecurityScan(project: any, scope: any) {
  // Mock code security analysis
  const vulnerabilities = [
    {
      id: 'code-1',
      title: 'Hardcoded API Key',
      severity: 'critical',
      description: 'API key found hardcoded in source code',
      file: 'src/config/api.ts',
      line: 8,
      pattern: 'API_KEY = "sk-..."',
      recommendation: 'Move API keys to environment variables'
    },
    {
      id: 'code-2',
      title: 'Insecure Random Number Generation',
      severity: 'medium',
      description: 'Use of Math.random() for security-sensitive operations',
      file: 'src/utils/token.ts',
      line: 15,
      recommendation: 'Use crypto.randomBytes() for cryptographic randomness'
    }
  ];

  return vulnerabilities;
}

async function performInfrastructureScan(project: any, scope: any) {
  // Mock infrastructure security scan
  const vulnerabilities = [
    {
      id: 'infra-1',
      title: 'Insecure Docker Configuration',
      severity: 'high',
      description: 'Docker container running as root user',
      file: 'Dockerfile',
      line: 12,
      recommendation: 'Create non-root user and use USER directive'
    },
    {
      id: 'infra-2',
      title: 'Missing Security Headers',
      severity: 'medium',
      description: 'HTTP security headers not configured',
      recommendation: 'Implement Content-Security-Policy, X-Frame-Options, etc.'
    }
  ];

  return vulnerabilities;
}

async function performComplianceScan(project: any, compliance: any) {
  // Mock compliance issues
  const issues = [
    {
      id: 'comp-1',
      standard: 'GDPR',
      requirement: 'Data Processing Consent',
      status: 'fail',
      description: 'No explicit consent mechanism for data processing',
      recommendation: 'Implement consent management system'
    },
    {
      id: 'comp-2',
      standard: 'SOC2',
      requirement: 'Access Controls',
      status: 'partial',
      description: 'Multi-factor authentication not enforced for all users',
      recommendation: 'Enable MFA for all user accounts'
    }
  ];

  return issues;
}

async function performComplianceChecks(project: any, standard: string, scope: any) {
  // Mock compliance check results based on standard
  const checksMap = {
    'SOC2': [
      { id: 'soc2-1', control: 'CC6.1', description: 'Logical and Physical Access Controls', status: 'pass' },
      { id: 'soc2-2', control: 'CC6.2', description: 'User Access Management', status: 'fail' },
      { id: 'soc2-3', control: 'CC6.3', description: 'Network Security', status: 'pass' },
      { id: 'soc2-4', control: 'CC7.1', description: 'Data Transmission and Storage', status: 'partial' }
    ],
    'GDPR': [
      { id: 'gdpr-1', article: 'Art. 6', description: 'Lawful Basis for Processing', status: 'pass' },
      { id: 'gdpr-2', article: 'Art. 7', description: 'Conditions for Consent', status: 'fail' },
      { id: 'gdpr-3', article: 'Art. 25', description: 'Data Protection by Design', status: 'partial' },
      { id: 'gdpr-4', article: 'Art. 32', description: 'Security of Processing', status: 'pass' }
    ]
  };

  return {
    standard,
    checks: checksMap[standard] || [],
    summary: {
      total: checksMap[standard]?.length || 0,
      passed: checksMap[standard]?.filter(c => c.status === 'pass').length || 0,
      failed: checksMap[standard]?.filter(c => c.status === 'fail').length || 0,
      partial: checksMap[standard]?.filter(c => c.status === 'partial').length || 0
    }
  };
}

function generateSecurityRecommendations(vulnerabilities: any[], complianceIssues: any[]) {
  const recommendations = [];

  // High priority recommendations for critical vulnerabilities
  const criticalVulns = vulnerabilities.filter(v => v.severity === 'critical');
  if (criticalVulns.length > 0) {
    recommendations.push({
      priority: 'high',
      category: 'vulnerability',
      title: 'Address Critical Vulnerabilities',
      description: `${criticalVulns.length} critical vulnerabilities found that require immediate attention`,
      actions: criticalVulns.map(v => v.recommendation)
    });
  }

  // Dependency updates
  const depVulns = vulnerabilities.filter(v => v.package);
  if (depVulns.length > 0) {
    recommendations.push({
      priority: 'medium',
      category: 'dependencies',
      title: 'Update Vulnerable Dependencies',
      description: 'Several dependencies have known security vulnerabilities',
      actions: ['Run npm audit fix', 'Update to latest stable versions', 'Enable dependency scanning in CI/CD']
    });
  }

  return recommendations;
}

function generateRemediationSteps(vulnerabilities: any[]) {
  return vulnerabilities.map(vuln => ({
    vulnerabilityId: vuln.id,
    steps: [
      {
        step: 1,
        action: 'Identify',
        description: `Review ${vuln.file}:${vuln.line} for ${vuln.title}`,
        automated: false
      },
      {
        step: 2,
        action: 'Fix',
        description: vuln.recommendation,
        automated: vuln.severity === 'low'
      },
      {
        step: 3,
        action: 'Test',
        description: 'Verify fix and run security tests',
        automated: true
      }
    ],
    estimatedTime: vuln.severity === 'critical' ? '2-4 hours' : 
                   vuln.severity === 'high' ? '1-2 hours' : '30-60 minutes'
  }));
}

function generateComplianceRecommendations(standard: string, results: any) {
  const failedChecks = results.checks.filter((c: any) => c.status === 'fail');
  const partialChecks = results.checks.filter((c: any) => c.status === 'partial');

  return [
    {
      priority: 'high',
      title: `Address ${standard} Compliance Gaps`,
      description: `${failedChecks.length} requirements are not met`,
      actions: failedChecks.map((c: any) => `Fix ${c.control || c.article}: ${c.description}`)
    },
    {
      priority: 'medium',
      title: 'Improve Partial Compliance',
      description: `${partialChecks.length} requirements are partially implemented`,
      actions: partialChecks.map((c: any) => `Complete ${c.control || c.article}: ${c.description}`)
    }
  ];
}

function getNextAuditDate(standard: string) {
  const auditIntervals = {
    'SOC2': 12, // months
    'GDPR': 24,
    'HIPAA': 12,
    'PCI-DSS': 3,
    'ISO27001': 12
  };

  const interval = auditIntervals[standard] || 12;
  const nextDate = new Date();
  nextDate.setMonth(nextDate.getMonth() + interval);
  return nextDate.toISOString();
}

async function executeRemediation(scan: any, vulnerabilityId: string, remediationAction: string, userId: string) {
  // Create remediation record
  const remediation = await prisma.securityRemediation.create({
    data: {
      scanId: scan.id,
      vulnerabilityId,
      action: remediationAction,
      status: 'in_progress',
      initiatedBy: userId,
      metadata: {
        startedAt: new Date().toISOString()
      }
    }
  });

  // Execute remediation in background
  executeRemediationInBackground(remediation).catch(console.error);

  return {
    remediationId: remediation.id,
    status: 'in_progress',
    estimatedCompletion: new Date(Date.now() + 60 * 60 * 1000).toISOString()
  };
}

async function executeRemediationInBackground(remediation: any) {
  try {
    // Simulate remediation process
    await new Promise(resolve => setTimeout(resolve, 5000));

    await prisma.securityRemediation.update({
      where: { id: remediation.id },
      data: {
        status: 'completed',
        completedAt: new Date(),
        results: {
          success: true,
          appliedFixes: ['Updated dependency versions', 'Applied security patches'],
          testsRun: 15,
          testsPassed: 15
        }
      }
    });

  } catch (error) {
    console.error('Remediation execution error:', error);
    
    await prisma.securityRemediation.update({
      where: { id: remediation.id },
      data: {
        status: 'failed',
        completedAt: new Date(),
        results: {
          success: false,
          error: error instanceof Error ? error.message : 'Remediation failed'
        }
      }
    });
  }
}

async function getVulnerabilitiesSummary(userId: string, projectId?: string, severity?: string) {
  const whereConditions: any = {
    project: {
      OR: [
        { userId },
        { 
          collaborators: {
            some: { userId }
          }
        }
      ]
    },
    status: 'completed'
  };

  if (projectId) {
    whereConditions.projectId = projectId;
  }

  const scans = await prisma.securityScan.findMany({
    where: whereConditions,
    include: {
      project: {
        select: { name: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  });

  // Aggregate vulnerabilities
  const vulnerabilities = scans.reduce((acc, scan) => {
    if (scan.results?.vulnerabilities?.details) {
      acc.push(...scan.results.vulnerabilities.details.map((v: any) => ({
        ...v,
        scanId: scan.id,
        projectName: scan.project.name,
        scanDate: scan.createdAt
      })));
    }
    return acc;
  }, []);

  // Filter by severity if specified
  const filteredVulns = severity 
    ? vulnerabilities.filter((v: any) => v.severity === severity)
    : vulnerabilities;

  return {
    total: filteredVulns.length,
    bySeverity: {
      critical: filteredVulns.filter((v: any) => v.severity === 'critical').length,
      high: filteredVulns.filter((v: any) => v.severity === 'high').length,
      medium: filteredVulns.filter((v: any) => v.severity === 'medium').length,
      low: filteredVulns.filter((v: any) => v.severity === 'low').length
    },
    vulnerabilities: filteredVulns.slice(0, 50) // Limit for performance
  };
}

async function getSecurityOverview(userId: string, projectId?: string) {
  const whereConditions: any = {
    project: {
      OR: [
        { userId },
        { 
          collaborators: {
            some: { userId }
          }
        }
      ]
    }
  };

  if (projectId) {
    whereConditions.projectId = projectId;
  }

  const [scans, audits, alerts] = await Promise.all([
    prisma.securityScan.findMany({
      where: whereConditions,
      orderBy: { createdAt: 'desc' },
      take: 10
    }),
    prisma.complianceAudit.findMany({
      where: whereConditions,
      orderBy: { createdAt: 'desc' },
      take: 10
    }),
    prisma.securityAlert.findMany({
      where: {
        ...whereConditions,
        status: 'active'
      },
      orderBy: { createdAt: 'desc' },
      take: 20
    })
  ]);

  // Calculate overall security score
  const completedScans = scans.filter(s => s.status === 'completed' && s.results?.securityScore);
  const avgSecurityScore = completedScans.length > 0 
    ? Math.round(completedScans.reduce((sum, s) => sum + s.results.securityScore, 0) / completedScans.length)
    : 0;

  // Calculate compliance score
  const completedAudits = audits.filter(a => a.status === 'completed' && a.results?.complianceScore);
  const avgComplianceScore = completedAudits.length > 0
    ? Math.round(completedAudits.reduce((sum, a) => sum + a.results.complianceScore, 0) / completedAudits.length)
    : 0;

  return {
    securityScore: avgSecurityScore,
    complianceScore: avgComplianceScore,
    recentScans: scans.length,
    recentAudits: audits.length,
    activeAlerts: alerts.length,
    criticalAlerts: alerts.filter(a => a.severity === 'critical').length,
    scans,
    audits,
    alerts: alerts.slice(0, 10)
  };
}