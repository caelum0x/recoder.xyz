/**
 * Security Audit CLI Command
 * Command-line interface for running comprehensive security audits
 */

import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { Logger } from '@recoder/shared';
import { 
  SecurityAuditor, 
  createSecurityAuditor, 
  SecurityAuditConfig,
  ComprehensiveSecurityReport 
} from 'recoder-security';
import { backendClient } from '../services/backend-client';
import fs from 'fs-extra';
import path from 'path';

interface SecurityAuditOptions {
  target?: string;
  scope?: string[];
  output?: string;
  format?: 'json' | 'html' | 'pdf';
  codebase?: string;
  penetration?: boolean;
  testing?: boolean;
  code?: boolean;
  router?: boolean;
  prompt?: boolean;
  aggressive?: boolean;
  quick?: boolean;
  config?: string;
}

export function registerSecurityAuditCommand(program: Command): void {
  const securityCommand = program
    .command('security')
    .description('Security testing and audit commands');

  securityCommand
    .command('audit')
    .description('Run comprehensive security audit')
    .option('-t, --target <url>', 'Target URL for security testing')
    .option('-s, --scope <paths...>', 'Scope paths to include in testing')
    .option('-o, --output <path>', 'Output file path for report')
    .option('-f, --format <format>', 'Report format (json, html, pdf)', 'json')
    .option('-c, --codebase <path>', 'Path to codebase for code security scanning')
    .option('--penetration', 'Enable penetration testing', true)
    .option('--testing', 'Enable security testing suite', true)
    .option('--code', 'Enable code security scanning', true)
    .option('--router', 'Enable router security analysis', true)
    .option('--prompt', 'Enable prompt security analysis', true)
    .option('--aggressive', 'Enable aggressive testing mode', false)
    .option('--quick', 'Quick scan mode (skip slow tests)', false)
    .option('--config <path>', 'Configuration file path')
    .action(async (options: SecurityAuditOptions) => {
      await runSecurityAudit(options);
    });

  securityCommand
    .command('scan')
    .description('Quick security scan')
    .option('-t, --target <url>', 'Target URL')
    .option('-o, --output <path>', 'Output file path')
    .action(async (options: { target?: string; output?: string }) => {
      await runQuickScan(options);
    });

  securityCommand
    .command('penetration')
    .description('Run penetration testing only')
    .option('-t, --target <url>', 'Target URL', 'http://localhost:3000')
    .option('-s, --scope <paths...>', 'Scope paths')
    .option('--aggressive', 'Aggressive mode', false)
    .action(async (options: { target: string; scope?: string[]; aggressive?: boolean }) => {
      await runPenetrationTest(options);
    });

  securityCommand
    .command('code-scan')
    .description('Run code security scanning')
    .option('-p, --path <path>', 'Path to codebase', process.cwd())
    .option('-o, --output <path>', 'Output file path')
    .action(async (options: { path: string; output?: string }) => {
      await runCodeScan(options);
    });

  securityCommand
    .command('report')
    .description('Generate security report from previous audit')
    .option('-i, --input <path>', 'Input audit data file')
    .option('-o, --output <path>', 'Output report file')
    .option('-f, --format <format>', 'Report format (json, html, pdf)', 'html')
    .action(async (options: { input: string; output?: string; format?: string }) => {
      await generateSecurityReport(options);
    });
}

/**
 * Run comprehensive security audit
 */
async function runSecurityAudit(options: SecurityAuditOptions): Promise<void> {
  const spinner = ora('Initializing security audit...').start();

  try {
    // Check authentication
    if (!backendClient.isAuthenticated()) {
      spinner.fail('Authentication required. Please run: recoder auth login');
      return;
    }

    // Load configuration
    const config = await loadSecurityConfig(options);
    
    spinner.text = 'Creating security audit configuration...';
    
    // Validate target
    if (!config.target.baseUrl) {
      spinner.fail('Target URL is required. Use --target <url>');
      return;
    }

    // Create security auditor
    const auditor = createSecurityAuditor(config);
    
    // Set up event listeners for progress reporting
    setupProgressReporting(auditor, spinner);

    spinner.succeed('Security audit initialized');
    console.log(chalk.blue('\n🔒 Starting Comprehensive Security Audit'));
    console.log(chalk.gray(`Target: ${config.target.baseUrl}`));
    console.log(chalk.gray(`Scope: ${config.target.scope.join(', ')}`));
    
    // Run audit
    const auditSpinner = ora('Running security audit...').start();
    const report = await auditor.runAudit();
    auditSpinner.succeed('Security audit completed');

    // Display results
    displayAuditResults(report);

    // Save report
    if (options.output) {
      await saveAuditReport(report, options.output, options.format || 'json');
      console.log(chalk.green(`\n📄 Report saved to: ${options.output}`));
    }

    // Track usage
    await backendClient.trackUsage({
      platform: 'cli',
      command: 'security audit',
      tokens: 0,
      model: 'security-audit',
      timestamp: new Date()
    });

  } catch (error) {
    spinner.fail(`Security audit failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    Logger.error('Security audit error:', error);
    process.exit(1);
  }
}

/**
 * Run quick security scan
 */
async function runQuickScan(options: { target?: string; output?: string }): Promise<void> {
  const target = options.target || 'http://localhost:3000';
  
  await runSecurityAudit({
    target,
    quick: true,
    output: options.output,
    penetration: true,
    testing: true,
    code: false,
    router: false,
    prompt: false
  });
}

/**
 * Run penetration testing only
 */
async function runPenetrationTest(options: { target: string; scope?: string[]; aggressive?: boolean }): Promise<void> {
  const spinner = ora('Running penetration test...').start();

  try {
    const config: SecurityAuditConfig = {
      target: {
        baseUrl: options.target,
        name: 'Penetration Test Target',
        scope: options.scope || ['/']
      },
      enabledTests: {
        penetrationTesting: true,
        securityTesting: false,
        codeScanning: false,
        routerSecurity: false,
        promptSanitization: false
      },
      penetrationTestConfig: {
        aggressive: options.aggressive || false
      },
      reportFormat: 'json'
    };

    const auditor = createSecurityAuditor(config);
    setupProgressReporting(auditor, spinner);

    const report = await auditor.runAudit();
    
    spinner.succeed('Penetration test completed');
    
    if (report.penetrationReport) {
      console.log(chalk.blue('\n🔍 Penetration Test Results'));
      console.log(chalk.gray(`Target: ${options.target}`));
      console.log(chalk.gray(`Tests: ${report.penetrationReport.totalTests}`));
      console.log(chalk.gray(`Findings: ${report.penetrationReport.totalFindings}`));
      
      if (report.penetrationReport.findings.length > 0) {
        console.log(chalk.yellow('\n⚠️  Security Findings:'));
        report.penetrationReport.findings.forEach(finding => {
          const severityColor = getSeverityColor(finding.severity);
          console.log(`  ${severityColor(`[${finding.severity.toUpperCase()}]`)} ${finding.title}`);
        });
      } else {
        console.log(chalk.green('\n✅ No security vulnerabilities found'));
      }
    }

  } catch (error) {
    spinner.fail(`Penetration test failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Run code security scanning
 */
async function runCodeScan(options: { path: string; output?: string }): Promise<void> {
  const spinner = ora('Scanning code for security vulnerabilities...').start();

  try {
    if (!await fs.pathExists(options.path)) {
      spinner.fail(`Path does not exist: ${options.path}`);
      return;
    }

    const config: SecurityAuditConfig = {
      target: {
        baseUrl: 'file://' + options.path,
        name: 'Code Security Scan',
        scope: []
      },
      enabledTests: {
        penetrationTesting: false,
        securityTesting: false,
        codeScanning: true,
        routerSecurity: false,
        promptSanitization: false
      },
      codebasePath: options.path,
      reportFormat: 'json'
    };

    const auditor = createSecurityAuditor(config);
    const report = await auditor.runAudit();
    
    spinner.succeed('Code security scan completed');
    
    if (report.codeSecurityReport) {
      console.log(chalk.blue('\n🔍 Code Security Scan Results'));
      console.log(chalk.gray(`Files scanned: ${report.codeSecurityReport.filesScanned}`));
      console.log(chalk.gray(`Vulnerabilities: ${report.codeSecurityReport.vulnerabilityCount}`));
      
      if (report.codeSecurityReport.vulnerabilityCount > 0) {
        console.log(chalk.red(`  Critical: ${report.codeSecurityReport.criticalIssues}`));
        console.log(chalk.yellow(`  High: ${report.codeSecurityReport.highIssues}`));
        console.log(chalk.blue(`  Medium: ${report.codeSecurityReport.mediumIssues}`));
        console.log(chalk.gray(`  Low: ${report.codeSecurityReport.lowIssues}`));
      } else {
        console.log(chalk.green('\n✅ No security vulnerabilities found in code'));
      }
    }

    if (options.output) {
      await saveAuditReport(report, options.output, 'json');
      console.log(chalk.green(`\n📄 Report saved to: ${options.output}`));
    }

  } catch (error) {
    spinner.fail(`Code scan failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Generate security report from audit data
 */
async function generateSecurityReport(options: { input: string; output?: string; format?: string }): Promise<void> {
  const spinner = ora('Generating security report...').start();

  try {
    if (!await fs.pathExists(options.input)) {
      spinner.fail(`Input file does not exist: ${options.input}`);
      return;
    }

    const auditData = await fs.readJson(options.input);
    const outputPath = options.output || `security-report.${options.format}`;
    
    switch (options.format) {
      case 'html':
        await generateHTMLReport(auditData, outputPath);
        break;
      case 'pdf':
        await generatePDFReport(auditData, outputPath);
        break;
      case 'json':
      default:
        await fs.writeJson(outputPath, auditData, { spaces: 2 });
        break;
    }

    spinner.succeed(`Security report generated: ${outputPath}`);

  } catch (error) {
    spinner.fail(`Report generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    process.exit(1);
  }
}

/**
 * Load security configuration
 */
async function loadSecurityConfig(options: SecurityAuditOptions): Promise<SecurityAuditConfig> {
  let config: Partial<SecurityAuditConfig> = {};

  // Load from config file if specified
  if (options.config && await fs.pathExists(options.config)) {
    config = await fs.readJson(options.config);
  }

  // Override with command line options
  return {
    target: {
      baseUrl: options.target || config.target?.baseUrl || 'http://localhost:3000',
      name: config.target?.name || 'Security Audit Target',
      scope: options.scope || config.target?.scope || ['/']
    },
    enabledTests: {
      penetrationTesting: options.penetration ?? config.enabledTests?.penetrationTesting ?? true,
      securityTesting: options.testing ?? config.enabledTests?.securityTesting ?? true,
      codeScanning: options.code ?? config.enabledTests?.codeScanning ?? false,
      routerSecurity: options.router ?? config.enabledTests?.routerSecurity ?? true,
      promptSanitization: options.prompt ?? config.enabledTests?.promptSanitization ?? true
    },
    codebasePath: options.codebase || config.codebasePath,
    reportFormat: (options.format as any) || config.reportFormat || 'json',
    outputPath: options.output || config.outputPath,
    penetrationTestConfig: {
      aggressive: options.aggressive || config.penetrationTestConfig?.aggressive || false,
      skipSlowTests: options.quick || config.penetrationTestConfig?.skipSlowTests || false,
      ...config.penetrationTestConfig
    }
  };
}

/**
 * Setup progress reporting for audit
 */
function setupProgressReporting(auditor: SecurityAuditor, spinner: ora.Ora): void {
  auditor.on('phaseStarted', (phase: string) => {
    spinner.text = `Running ${phase}...`;
  });

  auditor.on('phaseCompleted', (phase: string) => {
    spinner.succeed(`Completed ${phase}`);
    spinner.start();
  });

  auditor.on('auditError', (error: Error) => {
    spinner.fail(`Audit error: ${error.message}`);
  });
}

/**
 * Display audit results in console
 */
function displayAuditResults(report: ComprehensiveSecurityReport): void {
  console.log(chalk.blue('\n🔒 Security Audit Results'));
  console.log(chalk.gray('─'.repeat(50)));
  
  // Overall score and risk
  const scoreColor = report.overallSecurityScore >= 80 ? chalk.green : 
                    report.overallSecurityScore >= 60 ? chalk.yellow : chalk.red;
  console.log(`Overall Security Score: ${scoreColor(report.overallSecurityScore)}/100`);
  
  const riskColor = getRiskColor(report.riskLevel);
  console.log(`Risk Level: ${riskColor(report.riskLevel.toUpperCase())}`);
  
  // Findings summary
  if (report.consolidatedFindings.length > 0) {
    console.log(chalk.yellow('\n⚠️  Security Findings:'));
    
    const critical = report.consolidatedFindings.filter(f => f.severity === 'critical').length;
    const high = report.consolidatedFindings.filter(f => f.severity === 'high').length;
    const medium = report.consolidatedFindings.filter(f => f.severity === 'medium').length;
    const low = report.consolidatedFindings.filter(f => f.severity === 'low').length;
    
    if (critical > 0) console.log(`  ${chalk.red('Critical:')} ${critical}`);
    if (high > 0) console.log(`  ${chalk.red('High:')} ${high}`);
    if (medium > 0) console.log(`  ${chalk.yellow('Medium:')} ${medium}`);
    if (low > 0) console.log(`  ${chalk.gray('Low:')} ${low}`);
    
    // Show top findings
    console.log(chalk.yellow('\nTop Security Issues:'));
    report.consolidatedFindings.slice(0, 5).forEach((finding, index) => {
      const severityColor = getSeverityColor(finding.severity);
      console.log(`  ${index + 1}. ${severityColor(`[${finding.severity.toUpperCase()}]`)} ${finding.title}`);
    });
  } else {
    console.log(chalk.green('\n✅ No security vulnerabilities found'));
  }
  
  // Recommendations
  if (report.prioritizedRecommendations.length > 0) {
    console.log(chalk.blue('\n📋 Priority Recommendations:'));
    report.prioritizedRecommendations.slice(0, 3).forEach((rec, index) => {
      const priorityColor = getPriorityColor(rec.priority);
      console.log(`  ${index + 1}. ${priorityColor(`[${rec.priority.toUpperCase()}]`)} ${rec.title}`);
    });
  }
  
  console.log(chalk.gray(`\nAudit completed in ${report.executionTime}ms`));
}

/**
 * Save audit report to file
 */
async function saveAuditReport(report: ComprehensiveSecurityReport, outputPath: string, format: string): Promise<void> {
  const dir = path.dirname(outputPath);
  await fs.ensureDir(dir);
  
  switch (format) {
    case 'html':
      await generateHTMLReport(report, outputPath);
      break;
    case 'pdf':
      await generatePDFReport(report, outputPath);
      break;
    case 'json':
    default:
      await fs.writeJson(outputPath, report, { spaces: 2 });
      break;
  }
}

/**
 * Generate HTML report (simplified implementation)
 */
async function generateHTMLReport(report: ComprehensiveSecurityReport, outputPath: string): Promise<void> {
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Security Audit Report - ${report.target.name}</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; }
        .header { background: #f0f0f0; padding: 20px; border-radius: 5px; }
        .score { font-size: 24px; font-weight: bold; }
        .critical { color: #d32f2f; }
        .high { color: #f57c00; }
        .medium { color: #fbc02d; }
        .low { color: #388e3c; }
        .finding { margin: 10px 0; padding: 10px; border-left: 4px solid #ccc; }
    </style>
</head>
<body>
    <div class="header">
        <h1>Security Audit Report</h1>
        <p><strong>Target:</strong> ${report.target.name}</p>
        <p><strong>Date:</strong> ${report.timestamp.toLocaleString()}</p>
        <p class="score">Security Score: ${report.overallSecurityScore}/100</p>
        <p><strong>Risk Level:</strong> ${report.riskLevel.toUpperCase()}</p>
    </div>
    
    <h2>Executive Summary</h2>
    <p>${report.executiveSummary}</p>
    
    <h2>Security Findings (${report.consolidatedFindings.length})</h2>
    ${report.consolidatedFindings.map(finding => `
        <div class="finding">
            <h3 class="${finding.severity}">[${finding.severity.toUpperCase()}] ${finding.title}</h3>
            <p>${finding.description}</p>
            <p><strong>Remediation:</strong> ${finding.remediation}</p>
        </div>
    `).join('')}
    
    <h2>Recommendations</h2>
    <ul>
        ${report.prioritizedRecommendations.map(rec => `
            <li><strong>${rec.title}:</strong> ${rec.description}</li>
        `).join('')}
    </ul>
</body>
</html>`;

  await fs.writeFile(outputPath, html);
}

/**
 * Generate PDF report (placeholder - would need PDF library)
 */
async function generatePDFReport(report: ComprehensiveSecurityReport, outputPath: string): Promise<void> {
  // For now, generate HTML and note that PDF generation would require additional libraries
  const htmlPath = outputPath.replace('.pdf', '.html');
  await generateHTMLReport(report, htmlPath);
  
  console.log(chalk.yellow('Note: PDF generation requires additional dependencies. HTML report generated instead.'));
  console.log(chalk.gray(`HTML report: ${htmlPath}`));
}

/**
 * Helper functions for colors
 */
function getSeverityColor(severity: string): chalk.Chalk {
  switch (severity) {
    case 'critical': return chalk.red;
    case 'high': return chalk.red;
    case 'medium': return chalk.yellow;
    case 'low': return chalk.gray;
    default: return chalk.white;
  }
}

function getRiskColor(risk: string): chalk.Chalk {
  switch (risk) {
    case 'critical': return chalk.red;
    case 'high': return chalk.red;
    case 'medium': return chalk.yellow;
    case 'low': return chalk.green;
    default: return chalk.white;
  }
}

function getPriorityColor(priority: string): chalk.Chalk {
  switch (priority) {
    case 'immediate': return chalk.red;
    case 'high': return chalk.yellow;
    case 'medium': return chalk.blue;
    case 'low': return chalk.gray;
    default: return chalk.white;
  }
}