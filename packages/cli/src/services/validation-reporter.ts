/**
 * Validation Report Generator - Creates detailed reports from reality validation results
 */

import chalk from 'chalk';
import boxen from 'boxen';
import fs from 'fs-extra';
import path from 'path';
import { Logger } from '@recoder/shared';
import { 
  ValidationReport, 
  ValidationCategory, 
  ValidationRuleResult 
} from './reality-validator';

export interface ReportOptions {
  format: 'console' | 'html' | 'json' | 'markdown';
  outputFile?: string;
  includeDetails?: boolean;
  includeFixes?: boolean;
  showPassedRules?: boolean;
  groupByCategory?: boolean;
  minSeverity?: 'error' | 'warning' | 'info';
  colors?: boolean;
  compact?: boolean;
}

export interface ConsoleReportOptions extends ReportOptions {
  colors?: boolean;
  compact?: boolean;
  showProgress?: boolean;
}

export class ValidationReporter {
  private logger: Logger;

  constructor() {
    this.logger = Logger.getInstance();
  }

  public async generateReport(
    report: ValidationReport, 
    options: ReportOptions = { format: 'console' }
  ): Promise<string> {
    switch (options.format) {
      case 'console':
        return this.generateConsoleReport(report, options as ConsoleReportOptions);
      case 'html':
        return this.generateHTMLReport(report, options);
      case 'json':
        return this.generateJSONReport(report, options);
      case 'markdown':
        return this.generateMarkdownReport(report, options);
      default:
        throw new Error(`Unsupported report format: ${options.format}`);
    }
  }

  public async saveReport(
    report: ValidationReport, 
    options: ReportOptions
  ): Promise<void> {
    if (!options.outputFile) {
      throw new Error('Output file path required for saving reports');
    }

    const content = await this.generateReport(report, options);
    await fs.ensureDir(path.dirname(options.outputFile));
    await fs.writeFile(options.outputFile, content, 'utf8');
    
    this.logger.info('Validation report saved', { 
      file: options.outputFile, 
      format: options.format 
    });
  }

  private generateConsoleReport(
    report: ValidationReport, 
    options: ConsoleReportOptions
  ): string {
    const output: string[] = [];
    const colors = options.colors !== false;

    // Header
    output.push(
      boxen(
        colors ? 
          chalk.white.bold('🔍 REALITY VALIDATION REPORT') :
          '🔍 REALITY VALIDATION REPORT',
        {
          padding: 1,
          margin: 1,
          borderStyle: 'double',
          borderColor: colors ? 'cyan' : undefined,
          textAlignment: 'center'
        }
      )
    );

    // Summary
    output.push(this.generateSummarySection(report, colors));

    // Score visualization
    output.push(this.generateScoreVisualization(report, colors));

    // Category breakdown
    if (options.groupByCategory !== false) {
      for (const category of Object.values(ValidationCategory)) {
        const categoryData = report.categories[category];
        if (categoryData.rules.length > 0) {
          output.push(this.generateCategorySection(category, categoryData, colors, options));
        }
      }
    } else {
      // Flat list of all issues
      output.push(this.generateFlatIssuesList(report, colors, options));
    }

    // Fixes section
    if (options.includeFixes !== false && report.fixes.length > 0) {
      output.push(this.generateFixesSection(report, colors));
    }

    // Footer with recommendations
    output.push(this.generateRecommendationsSection(report, colors));

    return output.join('\n\n');
  }

  private generateSummarySection(report: ValidationReport, colors: boolean): string {
    const { summary } = report;
    const passRate = summary.totalRules > 0 ? (summary.passed / summary.totalRules * 100).toFixed(1) : '0';
    
    const summaryText = [
      `📊 Project: ${path.basename(report.projectPath)}`,
      `📅 Validation Time: ${report.timestamp.toLocaleString()}`,
      `🎯 Total Rules: ${summary.totalRules}`,
      `✅ Passed: ${summary.passed}`,
      `❌ Failed: ${summary.failed}`,
      `⚠️  Warnings: ${summary.warnings}`,
      `📈 Pass Rate: ${passRate}%`,
      `🏆 Reality Score: ${summary.score}/100`
    ].join('\n');

    return boxen(
      colors ? this.colorizeText(summaryText, summary.score) : summaryText,
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: colors ? this.getScoreColor(summary.score) : undefined,
        title: 'Summary'
      }
    );
  }

  private generateScoreVisualization(report: ValidationReport, colors: boolean): string {
    const score = report.summary.score;
    const barLength = 50;
    const filledLength = Math.round((score / 100) * barLength);
    const emptyLength = barLength - filledLength;
    
    const filledBar = '█'.repeat(filledLength);
    const emptyBar = '░'.repeat(emptyLength);
    
    let bar = filledBar + emptyBar;
    if (colors) {
      const color = this.getScoreColor(score);
      bar = chalk[color](filledBar) + chalk.gray(emptyBar);
    }
    
    const visualization = [
      `Reality Score: ${score}/100`,
      `[${bar}] ${score}%`,
      '',
      this.getScoreDescription(score)
    ].join('\n');

    return boxen(
      colors ? this.colorizeScoreDescription(visualization, score) : visualization,
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: colors ? this.getScoreColor(score) : undefined,
        title: 'Reality Score'
      }
    );
  }

  private generateCategorySection(
    category: ValidationCategory, 
    categoryData: any, 
    colors: boolean,
    options: ConsoleReportOptions
  ): string {
    const categoryName = this.getCategoryDisplayName(category);
    const icon = this.getCategoryIcon(category);
    
    const header = `${icon} ${categoryName}`;
    const stats = `✅ ${categoryData.passed} | ❌ ${categoryData.failed} | ⚠️ ${categoryData.warnings}`;
    
    const issues: string[] = [];
    
    for (const ruleResult of categoryData.rules) {
      if (this.shouldIncludeRule(ruleResult, options)) {
        issues.push(this.formatRuleResult(ruleResult, colors, options));
      }
    }

    const content = [header, stats, '', ...issues].join('\n');
    
    return boxen(
      content,
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: colors ? this.getCategoryColor(category) : undefined,
        title: categoryName
      }
    );
  }

  private generateFlatIssuesList(
    report: ValidationReport, 
    colors: boolean,
    options: ConsoleReportOptions
  ): string {
    const issues: string[] = [];
    
    for (const category of Object.values(ValidationCategory)) {
      const categoryData = report.categories[category];
      for (const ruleResult of categoryData.rules) {
        if (this.shouldIncludeRule(ruleResult, options)) {
          const categoryName = this.getCategoryDisplayName(category);
          const formattedResult = this.formatRuleResult(ruleResult, colors, options);
          issues.push(`[${categoryName}] ${formattedResult}`);
        }
      }
    }

    return boxen(
      issues.join('\n\n'),
      {
        padding: 1,
        borderStyle: 'round',
        title: 'Validation Issues'
      }
    );
  }

  private generateFixesSection(report: ValidationReport, colors: boolean): string {
    const uniqueFixes = [...new Set(report.fixes)];
    const fixesList = uniqueFixes.map((fix, index) => 
      `${index + 1}. ${fix}`
    ).join('\n');

    return boxen(
      colors ? chalk.yellow(fixesList) : fixesList,
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: colors ? 'yellow' : undefined,
        title: '🔧 Recommended Fixes'
      }
    );
  }

  private generateRecommendationsSection(report: ValidationReport, colors: boolean): string {
    const score = report.summary.score;
    const recommendations: string[] = [];

    if (score < 50) {
      recommendations.push(
        '🚨 Critical: This codebase has significant reality issues',
        '• Focus on eliminating mock data and placeholder functions',
        '• Implement proper API endpoints and database connections',
        '• Add comprehensive error handling and security measures'
      );
    } else if (score < 75) {
      recommendations.push(
        '⚠️ Warning: This codebase needs improvement for production',
        '• Address remaining mock implementations',
        '• Enhance security and monitoring configurations',
        '• Complete deployment and environment setup'
      );
    } else if (score < 90) {
      recommendations.push(
        '✅ Good: This codebase is mostly production-ready',
        '• Address minor configuration issues',
        '• Enhance monitoring and logging',
        '• Optimize performance and security'
      );
    } else {
      recommendations.push(
        '🎉 Excellent: This codebase appears production-ready!',
        '• Continue monitoring for any edge cases',
        '• Keep security measures up to date',
        '• Regular validation checks recommended'
      );
    }

    const content = recommendations.join('\n');
    
    return boxen(
      colors ? this.colorizeText(content, score) : content,
      {
        padding: 1,
        borderStyle: 'round',
        borderColor: colors ? this.getScoreColor(score) : undefined,
        title: 'Recommendations'
      }
    );
  }

  private generateHTMLReport(report: ValidationReport, options: ReportOptions): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Reality Validation Report</title>
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 20px; background: #f5f5f5; }
        .container { max-width: 1200px; margin: 0 auto; background: white; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
        .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; border-radius: 8px 8px 0 0; }
        .score { font-size: 3em; font-weight: bold; text-align: center; margin: 20px 0; }
        .score-bar { width: 100%; height: 20px; background: #eee; border-radius: 10px; overflow: hidden; margin: 20px 0; }
        .score-fill { height: 100%; background: linear-gradient(90deg, #ff4757, #ffa502, #2ed573); transition: width 0.3s ease; }
        .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; padding: 20px; }
        .metric { text-align: center; padding: 20px; background: #f8f9fa; border-radius: 8px; }
        .category { margin: 20px; padding: 20px; border-left: 4px solid #007bff; background: #f8f9fa; }
        .rule { margin: 10px 0; padding: 15px; border-radius: 6px; }
        .rule.passed { background: #d4edda; border-left: 4px solid #28a745; }
        .rule.failed { background: #f8d7da; border-left: 4px solid #dc3545; }
        .rule.warning { background: #fff3cd; border-left: 4px solid #ffc107; }
        .fixes { background: #e7f3ff; padding: 20px; margin: 20px; border-radius: 8px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🔍 Reality Validation Report</h1>
            <p>Project: ${path.basename(report.projectPath)}</p>
            <p>Generated: ${report.timestamp.toLocaleString()}</p>
        </div>
        
        <div class="score">${report.summary.score}/100</div>
        <div class="score-bar">
            <div class="score-fill" style="width: ${report.summary.score}%"></div>
        </div>
        
        <div class="summary">
            <div class="metric">
                <h3>Total Rules</h3>
                <div style="font-size: 2em; color: #6c757d;">${report.summary.totalRules}</div>
            </div>
            <div class="metric">
                <h3>Passed</h3>
                <div style="font-size: 2em; color: #28a745;">${report.summary.passed}</div>
            </div>
            <div class="metric">
                <h3>Failed</h3>
                <div style="font-size: 2em; color: #dc3545;">${report.summary.failed}</div>
            </div>
            <div class="metric">
                <h3>Warnings</h3>
                <div style="font-size: 2em; color: #ffc107;">${report.summary.warnings}</div>
            </div>
        </div>
        
        ${this.generateHTMLCategories(report, options)}
        
        ${report.fixes.length > 0 ? this.generateHTMLFixes(report) : ''}
    </div>
</body>
</html>`;
  }

  private generateHTMLCategories(report: ValidationReport, options: ReportOptions): string {
    let html = '';
    
    for (const [category, categoryData] of Object.entries(report.categories)) {
      if (categoryData.rules.length === 0) continue;
      
      const categoryName = this.getCategoryDisplayName(category as ValidationCategory);
      
      html += `<div class="category">
        <h2>${this.getCategoryIcon(category as ValidationCategory)} ${categoryName}</h2>
        <p>✅ ${categoryData.passed} passed | ❌ ${categoryData.failed} failed | ⚠️ ${categoryData.warnings} warnings</p>`;
      
      for (const ruleResult of categoryData.rules) {
        const status = ruleResult.result.passed ? 'passed' : 
                      ruleResult.rule.severity === 'error' ? 'failed' : 'warning';
        
        html += `<div class="rule ${status}">
          <h4>${ruleResult.rule.name}</h4>
          <p>${ruleResult.result.message}</p>
          ${ruleResult.result.details ? `<p><small>${ruleResult.result.details}</small></p>` : ''}
          ${ruleResult.result.fixes && options.includeFixes ? 
            `<ul>${ruleResult.result.fixes.map(fix => `<li>${fix}</li>`).join('')}</ul>` : ''}
        </div>`;
      }
      
      html += '</div>';
    }
    
    return html;
  }

  private generateHTMLFixes(report: ValidationReport): string {
    const uniqueFixes = [...new Set(report.fixes)];
    return `<div class="fixes">
      <h2>🔧 Recommended Fixes</h2>
      <ol>
        ${uniqueFixes.map(fix => `<li>${fix}</li>`).join('')}
      </ol>
    </div>`;
  }

  private generateJSONReport(report: ValidationReport, options: ReportOptions): string {
    const jsonReport = {
      metadata: {
        projectPath: report.projectPath,
        timestamp: report.timestamp.toISOString(),
        generator: 'Reality Validation System v1.0'
      },
      summary: report.summary,
      categories: report.categories,
      fixes: options.includeFixes !== false ? report.fixes : undefined
    };
    
    return JSON.stringify(jsonReport, null, 2);
  }

  private generateMarkdownReport(report: ValidationReport, options: ReportOptions): string {
    const lines: string[] = [];
    
    // Header
    lines.push('# 🔍 Reality Validation Report');
    lines.push('');
    lines.push(`**Project:** ${path.basename(report.projectPath)}`);
    lines.push(`**Generated:** ${report.timestamp.toLocaleString()}`);
    lines.push('');
    
    // Summary
    lines.push('## 📊 Summary');
    lines.push('');
    lines.push('| Metric | Value |');
    lines.push('|--------|-------|');
    lines.push(`| Reality Score | ${report.summary.score}/100 |`);
    lines.push(`| Total Rules | ${report.summary.totalRules} |`);
    lines.push(`| Passed | ${report.summary.passed} |`);
    lines.push(`| Failed | ${report.summary.failed} |`);
    lines.push(`| Warnings | ${report.summary.warnings} |`);
    lines.push('');
    
    // Categories
    for (const [category, categoryData] of Object.entries(report.categories)) {
      if (categoryData.rules.length === 0) continue;
      
      const categoryName = this.getCategoryDisplayName(category as ValidationCategory);
      lines.push(`## ${this.getCategoryIcon(category as ValidationCategory)} ${categoryName}`);
      lines.push('');
      lines.push(`**Stats:** ✅ ${categoryData.passed} passed | ❌ ${categoryData.failed} failed | ⚠️ ${categoryData.warnings} warnings`);
      lines.push('');
      
      for (const ruleResult of categoryData.rules) {
        const status = ruleResult.result.passed ? '✅' : 
                      ruleResult.rule.severity === 'error' ? '❌' : '⚠️';
        
        lines.push(`### ${status} ${ruleResult.rule.name}`);
        lines.push('');
        lines.push(ruleResult.result.message);
        
        if (ruleResult.result.details) {
          lines.push('');
          lines.push(`*${ruleResult.result.details}*`);
        }
        
        if (ruleResult.result.fixes && options.includeFixes !== false) {
          lines.push('');
          lines.push('**Fixes:**');
          for (const fix of ruleResult.result.fixes) {
            lines.push(`- ${fix}`);
          }
        }
        
        lines.push('');
      }
    }
    
    // Fixes
    if (options.includeFixes !== false && report.fixes.length > 0) {
      lines.push('## 🔧 Recommended Fixes');
      lines.push('');
      const uniqueFixes = [...new Set(report.fixes)];
      for (let i = 0; i < uniqueFixes.length; i++) {
        lines.push(`${i + 1}. ${uniqueFixes[i]}`);
      }
      lines.push('');
    }
    
    return lines.join('\n');
  }

  private shouldIncludeRule(ruleResult: ValidationRuleResult, options: ConsoleReportOptions): boolean {
    if (options.showPassedRules === false && ruleResult.result.passed) {
      return false;
    }
    
    if (options.minSeverity) {
      const severityOrder = { 'info': 0, 'warning': 1, 'error': 2 };
      const minLevel = severityOrder[options.minSeverity];
      const ruleLevel = severityOrder[ruleResult.rule.severity];
      if (ruleLevel < minLevel) {
        return false;
      }
    }
    
    return true;
  }

  private formatRuleResult(
    ruleResult: ValidationRuleResult, 
    colors: boolean,
    options: ConsoleReportOptions
  ): string {
    const { rule, result } = ruleResult;
    const status = result.passed ? '✅' : 
                   rule.severity === 'error' ? '❌' : '⚠️';
    
    let output = `${status} ${rule.name}: ${result.message}`;
    
    if (options.includeDetails !== false && result.details) {
      output += `\n   ${colors ? chalk.gray(result.details) : result.details}`;
    }
    
    if (result.file) {
      const fileInfo = result.line ? 
        `${path.basename(result.file)}:${result.line}` : 
        path.basename(result.file);
      output += `\n   📁 ${colors ? chalk.blue(fileInfo) : fileInfo}`;
    }
    
    if (options.includeFixes !== false && result.fixes) {
      const fixes = result.fixes.slice(0, 3); // Show only first 3 fixes
      output += '\n   🔧 ' + (colors ? chalk.yellow(fixes.join(', ')) : fixes.join(', '));
      if (result.fixes.length > 3) {
        output += colors ? chalk.gray(` (+${result.fixes.length - 3} more)`) : ` (+${result.fixes.length - 3} more)`;
      }
    }
    
    return output;
  }

  private colorizeText(text: string, score: number): string {
    const color = this.getScoreColor(score);
    return chalk[color](text);
  }

  private colorizeScoreDescription(text: string, score: number): string {
    const lines = text.split('\n');
    const color = this.getScoreColor(score);
    
    return lines.map((line, index) => {
      if (index === lines.length - 1) { // Last line is description
        return chalk[color](line);
      }
      return line;
    }).join('\n');
  }

  private getScoreColor(score: number): 'red' | 'yellow' | 'green' {
    if (score < 50) return 'red';
    if (score < 75) return 'yellow';
    return 'green';
  }

  private getScoreDescription(score: number): string {
    if (score >= 90) return '🎉 Excellent - Production Ready!';
    if (score >= 75) return '✅ Good - Minor issues to address';
    if (score >= 50) return '⚠️ Warning - Needs significant work';
    return '🚨 Critical - Major reality issues detected';
  }

  private getCategoryDisplayName(category: ValidationCategory): string {
    const names = {
      [ValidationCategory.CODE_QUALITY]: 'Code Quality',
      [ValidationCategory.INTEGRATION]: 'Integration',
      [ValidationCategory.BLOCKCHAIN]: 'Blockchain',
      [ValidationCategory.PRODUCTION]: 'Production Readiness'
    };
    return names[category];
  }

  private getCategoryIcon(category: ValidationCategory): string {
    const icons = {
      [ValidationCategory.CODE_QUALITY]: '🧹',
      [ValidationCategory.INTEGRATION]: '🔗',
      [ValidationCategory.BLOCKCHAIN]: '⛓️',
      [ValidationCategory.PRODUCTION]: '🚀'
    };
    return icons[category];
  }

  private getCategoryColor(category: ValidationCategory): string {
    const colors = {
      [ValidationCategory.CODE_QUALITY]: 'blue',
      [ValidationCategory.INTEGRATION]: 'magenta',
      [ValidationCategory.BLOCKCHAIN]: 'cyan',
      [ValidationCategory.PRODUCTION]: 'green'
    };
    return colors[category];
  }
}