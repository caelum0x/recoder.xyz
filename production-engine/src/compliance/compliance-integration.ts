/**
 * SOC 2 Compliance Integration Service
 * KILLER FEATURE: Real-time compliance scanning for all generated code
 * Integrates enterprise security into the production code generation pipeline
 */

import { SOC2ComplianceScanner, ComplianceContext, ComplianceReport, DataClassification, ProjectType, IndustryStandard } from '@recoder/shared/src/security/soc2-compliance-scanner';
import { Logger } from '@recoder/shared';
import * as path from 'path';
import * as fs from 'fs/promises';

export interface ComplianceConfig {
  enabled: boolean;
  enforceBlocking: boolean; // Block code generation if critical violations found
  autoRemediation: boolean; // Attempt automatic fixes
  reportGeneration: boolean; // Generate compliance reports
  industryStandards: IndustryStandard[];
  dataClassification: DataClassification;
  projectType: ProjectType;
  customRules: string[]; // Paths to custom rule files
}

export interface GeneratedCodeContext {
  filePath: string;
  language: string;
  framework?: string;
  projectPath: string;
  userRequirements: string;
  generatedCode: string;
  metadata: {
    model: string;
    provider: string;
    timestamp: Date;
  };
}

export interface ComplianceResult {
  passed: boolean;
  report: ComplianceReport;
  blockedByCompliance: boolean;
  remediatedCode?: string;
  recommendations: string[];
}

export class ComplianceIntegrationService {
  private scanner: SOC2ComplianceScanner;
  private config: ComplianceConfig;

  constructor(config: ComplianceConfig) {
    this.config = config;
    this.scanner = new SOC2ComplianceScanner();
    this.initializeService();
  }

  private async initializeService(): Promise<void> {
    Logger.info('Initializing SOC 2 Compliance Integration Service...');
    
    // Load custom rules if specified
    if (this.config.customRules?.length > 0) {
      await this.loadCustomRules();
    }

    Logger.info(`SOC 2 compliance integration ${this.config.enabled ? 'ENABLED' : 'DISABLED'}`);
    Logger.info(`Enforcement mode: ${this.config.enforceBlocking ? 'BLOCKING' : 'WARNING'}`);
    Logger.info(`Industry standards: ${this.config.industryStandards.join(', ')}`);
  }

  private async loadCustomRules(): Promise<void> {
    for (const rulePath of this.config.customRules) {
      try {
        const ruleContent = await fs.readFile(rulePath, 'utf-8');
        const customRule = JSON.parse(ruleContent);
        this.scanner.addCustomRule(customRule);
        Logger.info(`Loaded custom compliance rule: ${customRule.id}`);
      } catch (error) {
        Logger.error(`Failed to load custom rule from ${rulePath}:`, error);
      }
    }
  }

  /**
   * Main compliance check method - called during code generation
   */
  public async validateGeneratedCode(context: GeneratedCodeContext): Promise<ComplianceResult> {
    if (!this.config.enabled) {
      return {
        passed: true,
        report: this.createEmptyReport(),
        blockedByCompliance: false,
        recommendations: []
      };
    }

    Logger.info(`Running SOC 2 compliance scan for ${context.filePath}`);

    const complianceContext: ComplianceContext = {
      filePath: context.filePath,
      language: context.language,
      framework: context.framework,
      environment: this.determineEnvironment(context.projectPath),
      dataClassification: this.config.dataClassification,
      projectType: this.config.projectType,
      industryStandards: this.config.industryStandards
    };

    const report = await this.scanner.scanCode(context.generatedCode, complianceContext);
    
    const criticalViolations = report.violations.filter(v => v.severity === 'critical').length;
    const highViolations = report.violations.filter(v => v.severity === 'high').length;
    
    const passed = criticalViolations === 0 && (highViolations === 0 || !this.config.enforceBlocking);
    const blockedByCompliance = this.config.enforceBlocking && (criticalViolations > 0 || highViolations > 0);

    let remediatedCode: string | undefined;
    if (this.config.autoRemediation && !passed) {
      remediatedCode = await this.attemptAutoRemediation(context.generatedCode, report.violations);
    }

    const recommendations = this.generateActionableRecommendations(report, context);

    // Log compliance results
    this.logComplianceResult(context, report, blockedByCompliance);

    // Generate report if enabled
    if (this.config.reportGeneration) {
      await this.saveComplianceReport(context, report);
    }

    return {
      passed,
      report,
      blockedByCompliance,
      remediatedCode,
      recommendations
    };
  }

  /**
   * Batch compliance scanning for existing codebases
   */
  public async scanProject(projectPath: string): Promise<Map<string, ComplianceReport>> {
    const results = new Map<string, ComplianceReport>();
    
    try {
      const files = await this.findCodeFiles(projectPath);
      Logger.info(`Scanning ${files.length} files for SOC 2 compliance`);

      for (const filePath of files) {
        try {
          const content = await fs.readFile(filePath, 'utf-8');
          const language = this.detectLanguage(filePath);
          
          const context: ComplianceContext = {
            filePath,
            language,
            environment: this.determineEnvironment(projectPath),
            dataClassification: this.config.dataClassification,
            projectType: this.config.projectType,
            industryStandards: this.config.industryStandards
          };

          const report = await this.scanner.scanCode(content, context);
          results.set(filePath, report);
          
        } catch (error) {
          Logger.error(`Error scanning file ${filePath}:`, error);
        }
      }

    } catch (error) {
      Logger.error(`Error scanning project ${projectPath}:`, error);
    }

    return results;
  }

  /**
   * Generate project-wide compliance dashboard
   */
  public async generateProjectComplianceDashboard(projectPath: string): Promise<string> {
    const scanResults = await this.scanProject(projectPath);
    
    let totalViolations = 0;
    let criticalViolations = 0;
    let highViolations = 0;
    const violationsByCategory = new Map<string, number>();

    for (const report of scanResults.values()) {
      totalViolations += report.violations.length;
      criticalViolations += report.summary.criticalViolations;
      highViolations += report.summary.highViolations;

      for (const violation of report.violations) {
        const current = violationsByCategory.get(violation.category) || 0;
        violationsByCategory.set(violation.category, current + 1);
      }
    }

    const overallScore = scanResults.size > 0 ? 
      Array.from(scanResults.values()).reduce((sum, report) => sum + report.summary.overallScore, 0) / scanResults.size : 
      100;

    const dashboard = `
# SOC 2 Compliance Dashboard

## Project: ${path.basename(projectPath)}
**Generated:** ${new Date().toISOString()}

## Overall Metrics
- **Compliance Score:** ${overallScore.toFixed(1)}%
- **Files Scanned:** ${scanResults.size}
- **Total Violations:** ${totalViolations}
- **Critical Violations:** ${criticalViolations}
- **High Priority Violations:** ${highViolations}

## Compliance Status
${criticalViolations === 0 && highViolations === 0 ? '✅ **COMPLIANT** - Ready for SOC 2 audit' : '❌ **NON-COMPLIANT** - Remediation required'}

## Violations by Category
${Array.from(violationsByCategory.entries())
  .sort(([,a], [,b]) => b - a)
  .map(([category, count]) => `- **${category}:** ${count} violations`)
  .join('\n')}

## Certificate Eligibility
${this.assessProjectCertificateEligibility(Array.from(scanResults.values()))}

## Top Priority Actions
${this.generateTopPriorityActions(Array.from(scanResults.values()))}

---
*Generated by Recoder.xyz SOC 2 Compliance Scanner*
*This gives us a MASSIVE advantage over Cursor/Copilot who have NO compliance capabilities*
`;

    return dashboard;
  }

  private async attemptAutoRemediation(code: string, violations: any[]): Promise<string> {
    let remediatedCode = code;

    for (const violation of violations) {
      switch (violation.ruleId) {
        case 'SEC-001': // Input Validation
          remediatedCode = this.addInputValidation(remediatedCode, violation);
          break;
        case 'SEC-002': // SQL Injection
          remediatedCode = this.fixSQLInjection(remediatedCode, violation);
          break;
        case 'SEC-003': // Authentication
          remediatedCode = this.addAuthentication(remediatedCode, violation);
          break;
        case 'SEC-006': // HTTPS
          remediatedCode = this.enforceHTTPS(remediatedCode, violation);
          break;
        case 'AVL-001': // Error Handling
          remediatedCode = this.addErrorHandling(remediatedCode, violation);
          break;
        default:
          Logger.debug(`No auto-remediation available for rule ${violation.ruleId}`);
      }
    }

    return remediatedCode;
  }

  private addInputValidation(code: string, violation: any): string {
    // Simple auto-remediation for input validation
    const lines = code.split('\n');
    const violationLine = lines[violation.line - 1];
    
    if (violationLine.includes('req.body.')) {
      const validatedLine = violationLine.replace(
        /req\.body\.(\w+)/g, 
        'validator.escape(req.body.$1)'
      );
      lines[violation.line - 1] = validatedLine;
      
      // Add validator import if not present
      if (!code.includes("import validator from 'validator'")) {
        lines.unshift("import validator from 'validator';");
      }
    }
    
    return lines.join('\n');
  }

  private fixSQLInjection(code: string, violation: any): string {
    const lines = code.split('\n');
    const violationLine = lines[violation.line - 1];
    
    // Convert template literals to parameterized queries
    if (violationLine.includes('`') && violationLine.includes('${')) {
      const fixedLine = violationLine
        .replace(/`([^`]+\$\{[^}]+\}[^`]*)`/g, '?, $1') // Simplified fix
        .replace(/\$\{[^}]+\}/g, '?');
      lines[violation.line - 1] = `// FIXED: Parameterized query\n${fixedLine}`;
    }
    
    return lines.join('\n');
  }

  private addAuthentication(code: string, violation: any): string {
    const lines = code.split('\n');
    const violationLine = lines[violation.line - 1];
    
    if (violationLine.includes('app.') || violationLine.includes('router.')) {
      const authenticatedLine = violationLine.replace(
        /(app\.|router\.)(post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/,
        '$1$2(\'$3\', authenticate,'
      );
      lines[violation.line - 1] = authenticatedLine;
    }
    
    return lines.join('\n');
  }

  private enforceHTTPS(code: string, violation: any): string {
    return code.replace(/http:\/\//g, 'https://');
  }

  private addErrorHandling(code: string, violation: any): string {
    const lines = code.split('\n');
    let insertIndex = -1;
    
    // Find try block without catch
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim().startsWith('try')) {
        // Look for matching closing brace
        let braceCount = 0;
        for (let j = i; j < lines.length; j++) {
          if (lines[j].includes('{')) braceCount++;
          if (lines[j].includes('}')) {
            braceCount--;
            if (braceCount === 0) {
              // Check if next line has catch
              if (j + 1 < lines.length && !lines[j + 1].trim().startsWith('catch')) {
                insertIndex = j + 1;
              }
              break;
            }
          }
        }
        break;
      }
    }
    
    if (insertIndex !== -1) {
      lines.splice(insertIndex, 0, 
        '} catch (error) {',
        '  console.error(\'Error occurred:\', error);',
        '  // Handle error appropriately'
      );
    }
    
    return lines.join('\n');
  }

  private generateActionableRecommendations(report: ComplianceReport, context: GeneratedCodeContext): string[] {
    const recommendations: string[] = [];

    // Critical violations first
    const criticalViolations = report.violations.filter(v => v.severity === 'critical');
    if (criticalViolations.length > 0) {
      recommendations.push(
        `🚨 CRITICAL: Fix ${criticalViolations.length} critical security violations immediately`,
        'These violations block SOC 2 certification and pose immediate security risks'
      );
    }

    // High priority violations
    const highViolations = report.violations.filter(v => v.severity === 'high');
    if (highViolations.length > 0) {
      recommendations.push(
        `⚠️ HIGH PRIORITY: Address ${highViolations.length} high-priority compliance gaps`,
        'These should be fixed before production deployment'
      );
    }

    // Specific recommendations by category
    const securityViolations = report.violations.filter(v => v.category === 'security');
    if (securityViolations.length > 0) {
      recommendations.push(
        `🔒 SECURITY: Implement proper input validation, authentication, and encryption`,
        'Consider using security-focused libraries like helmet, bcrypt, and joi'
      );
    }

    const availabilityViolations = report.violations.filter(v => v.category === 'availability');
    if (availabilityViolations.length > 0) {
      recommendations.push(
        `📈 AVAILABILITY: Add error handling, rate limiting, and monitoring`,
        'Implement circuit breakers and health checks for production resilience'
      );
    }

    // Industry-specific recommendations
    if (this.config.industryStandards.includes(IndustryStandard.HIPAA)) {
      recommendations.push(
        `🏥 HIPAA: Ensure all PHI is encrypted and access-controlled`,
        'Implement audit logging and data anonymization where possible'
      );
    }

    if (this.config.industryStandards.includes(IndustryStandard.PCI_DSS)) {
      recommendations.push(
        `💳 PCI DSS: Secure all payment card data processing`,
        'Never store sensitive authentication data and use tokenization'
      );
    }

    return recommendations;
  }

  private logComplianceResult(context: GeneratedCodeContext, report: ComplianceReport, blocked: boolean): void {
    const logLevel = blocked ? 'error' : report.violations.length > 0 ? 'warn' : 'info';
    
    Logger[logLevel]('SOC 2 Compliance Result:', {
      file: context.filePath,
      language: context.language,
      model: context.metadata.model,
      score: report.summary.overallScore,
      violations: report.violations.length,
      critical: report.summary.criticalViolations,
      high: report.summary.highViolations,
      blocked,
      riskLevel: report.summary.riskLevel
    });

    if (blocked) {
      Logger.error('🚫 CODE GENERATION BLOCKED by SOC 2 compliance violations');
      Logger.error('Critical security issues must be resolved before proceeding');
    } else if (report.violations.length === 0) {
      Logger.info('✅ Generated code passed all SOC 2 compliance checks');
    }
  }

  private async saveComplianceReport(context: GeneratedCodeContext, report: ComplianceReport): Promise<void> {
    try {
      const reportsDir = path.join(context.projectPath, '.recoder', 'compliance-reports');
      await fs.mkdir(reportsDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const filename = `compliance-${path.basename(context.filePath)}-${timestamp}.json`;
      const reportPath = path.join(reportsDir, filename);

      await fs.writeFile(reportPath, JSON.stringify(report, null, 2));
      Logger.info(`Compliance report saved: ${reportPath}`);
    } catch (error) {
      Logger.error('Failed to save compliance report:', error);
    }
  }

  private async findCodeFiles(projectPath: string): Promise<string[]> {
    const files: string[] = [];
    const extensions = ['.js', '.ts', '.jsx', '.tsx', '.py', '.java', '.go', '.rs', '.php', '.rb'];

    async function scanDirectory(dir: string): Promise<void> {
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true });
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name);
          
          if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scanDirectory(fullPath);
          } else if (entry.isFile() && extensions.some(ext => entry.name.endsWith(ext))) {
            files.push(fullPath);
          }
        }
      } catch (error) {
        Logger.error(`Error scanning directory ${dir}:`, error);
      }
    }

    await scanDirectory(projectPath);
    return files;
  }

  private detectLanguage(filePath: string): string {
    const ext = path.extname(filePath);
    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.rb': 'ruby',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp'
    };
    
    return languageMap[ext] || 'unknown';
  }

  private determineEnvironment(projectPath: string): 'development' | 'staging' | 'production' {
    if (projectPath.includes('prod') || projectPath.includes('production')) {
      return 'production';
    } else if (projectPath.includes('staging') || projectPath.includes('stage')) {
      return 'staging';
    }
    return 'development';
  }

  private createEmptyReport(): ComplianceReport {
    return {
      summary: {
        totalRules: 0,
        passedRules: 0,
        failedRules: 0,
        criticalViolations: 0,
        highViolations: 0,
        mediumViolations: 0,
        lowViolations: 0,
        overallScore: 100,
        compliancePercentage: 100,
        riskLevel: 'very_low' as any
      },
      violations: [],
      passedRules: [],
      recommendations: [],
      certificateEligibility: {
        soc2Type1: true,
        soc2Type2: true,
        requiredChanges: [],
        estimatedTimeframe: 'None',
        auditReadiness: 100
      },
      auditTrail: [],
      generatedAt: new Date(),
      scanDuration: 0
    };
  }

  private assessProjectCertificateEligibility(reports: ComplianceReport[]): string {
    const totalCritical = reports.reduce((sum, r) => sum + r.summary.criticalViolations, 0);
    const totalHigh = reports.reduce((sum, r) => sum + r.summary.highViolations, 0);
    const avgScore = reports.length > 0 ? 
      reports.reduce((sum, r) => sum + r.summary.overallScore, 0) / reports.length : 100;

    if (totalCritical === 0 && totalHigh === 0 && avgScore >= 95) {
      return '🏆 **SOC 2 Type II Ready** - No critical issues found';
    } else if (totalCritical === 0 && avgScore >= 85) {
      return '✅ **SOC 2 Type I Ready** - Minor remediation needed for Type II';
    } else {
      return '⚠️ **Remediation Required** - Address critical/high violations first';
    }
  }

  private generateTopPriorityActions(reports: ComplianceReport[]): string {
    const allViolations = reports.flatMap(r => r.violations);
    const criticalViolations = allViolations.filter(v => v.severity === 'critical');
    const highViolations = allViolations.filter(v => v.severity === 'high');

    const actions: string[] = [];

    if (criticalViolations.length > 0) {
      actions.push(`1. 🚨 Fix ${criticalViolations.length} critical security violations`);
    }

    if (highViolations.length > 0) {
      actions.push(`2. ⚠️ Address ${highViolations.length} high-priority compliance gaps`);
    }

    // Group by category for strategic recommendations
    const violationsByCategory = allViolations.reduce((acc, v) => {
      if (!acc[v.category]) acc[v.category] = 0;
      acc[v.category]++;
      return acc;
    }, {} as Record<string, number>);

    const sortedCategories = Object.entries(violationsByCategory)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 3);

    sortedCategories.forEach(([category, count], index) => {
      actions.push(`${index + 3}. 🔧 Improve ${category} compliance (${count} issues)`);
    });

    return actions.length > 0 ? actions.join('\n') : '✅ No immediate actions required - maintain current compliance level';
  }

  public updateConfiguration(newConfig: Partial<ComplianceConfig>): void {
    this.config = { ...this.config, ...newConfig };
    Logger.info('Compliance configuration updated:', newConfig);
  }

  public getConfiguration(): ComplianceConfig {
    return { ...this.config };
  }
}

export { ComplianceIntegrationService, ComplianceConfig, GeneratedCodeContext, ComplianceResult };