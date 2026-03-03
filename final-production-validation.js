#!/usr/bin/env node

const fs = require('fs');
const { spawn } = require('child_process');

const REQUIRED_SERVICES = [
  'redis',
  'docker-backend',
  'recoder-web',
  'recoder-app',
  'recoder-frontend',
  'openclaw-gateway',
  'prometheus',
  'alertmanager',
  'grafana',
];

const REQUIRED_ENV_FILES = [
  'app/.env.production',
  'recoder-web/.env',
  'docker-backend/.env',
  'recoder-agents/.env.local',
];

const REQUIRED_MONITORING_FILES = [
  'monitoring/prometheus.yml',
  'monitoring/alertmanager.yml',
  'monitoring/alert-rules.yml',
  'monitoring/grafana-datasources.yml',
  'monitoring/grafana-dashboards.yml',
];

class FinalProductionValidator {
  constructor() {
    this.results = {
      canonicalDeployPath: { passed: false, score: 0, details: [] },
      composeTopology: { passed: false, score: 0, details: [] },
      runtimeConfig: { passed: false, score: 0, details: [] },
      monitoringConfig: { passed: false, score: 0, details: [] },
      workspaceIdentity: { passed: false, score: 0, details: [] },
    };
    this.overallScore = 0;
  }

  log(message, type = 'info') {
    const prefix = {
      info: 'INFO',
      success: 'PASS',
      warning: 'WARN',
      error: 'FAIL',
    }[type];
    console.log(`[${prefix}] ${message}`);
  }

  async runCommand(command, args) {
    return new Promise((resolve, reject) => {
      const proc = spawn(command, args, { stdio: 'pipe' });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code === 0) {
          resolve({ stdout, stderr });
          return;
        }
        reject(new Error(stderr || stdout || `command failed: ${command}`));
      });
    });
  }

  validateCanonicalDeployPath() {
    this.log('Validating canonical deploy path...', 'info');
    let score = 0;
    const details = [];

    const checks = [
      ['scripts/deploy-all-services.sh', 'canonical deploy script'],
      ['scripts/post-rotation-verify.sh', 'canonical runtime verification'],
      ['docker-compose.deploy.yml', 'canonical compose manifest'],
      ['PRODUCTION_RUNBOOK.md', 'production runbook'],
      ['DEPLOYMENT_RUNBOOK.md', 'deployment runbook'],
    ];

    for (const [file, label] of checks) {
      if (fs.existsSync(file)) {
        details.push(`present: ${label} (${file})`);
        score += 20;
      } else {
        details.push(`missing: ${label} (${file})`);
      }
    }

    this.results.canonicalDeployPath = {
      passed: score === 100,
      score,
      details,
    };
  }

  async validateComposeTopology() {
    this.log('Validating canonical compose topology...', 'info');
    let score = 0;
    const details = [];

    if (!fs.existsSync('docker-compose.deploy.yml')) {
      this.results.composeTopology = {
        passed: false,
        score,
        details: ['missing: docker-compose.deploy.yml'],
      };
      return;
    }

    const composeSource = fs.readFileSync('docker-compose.deploy.yml', 'utf8');
    for (const service of REQUIRED_SERVICES) {
      if (composeSource.includes(`${service}:`)) {
        details.push(`present: service ${service}`);
        score += Math.floor(100 / REQUIRED_SERVICES.length);
      } else {
        details.push(`missing: service ${service}`);
      }
    }

    try {
      await this.runCommand('docker', ['compose', '-f', 'docker-compose.deploy.yml', 'config']);
      details.push('docker compose config: valid');
      score = Math.min(100, score + 10);
    } catch (error) {
      details.push(`docker compose config: failed (${error.message})`);
    }

    this.results.composeTopology = {
      passed: score >= 90,
      score,
      details,
    };
  }

  validateRuntimeConfig() {
    this.log('Validating runtime config files...', 'info');
    let score = 0;
    const details = [];

    for (const file of REQUIRED_ENV_FILES) {
      if (fs.existsSync(file)) {
        details.push(`present: ${file}`);
        score += 20;
      } else {
        details.push(`missing: ${file}`);
      }
    }

    if (fs.existsSync('scripts/credential-rotation-audit.sh')) {
      details.push('present: credential rotation audit script');
      score += 10;
    }

    this.results.runtimeConfig = {
      passed: score >= 90,
      score,
      details,
    };
  }

  validateMonitoringConfig() {
    this.log('Validating monitoring config...', 'info');
    let score = 0;
    const details = [];

    for (const file of REQUIRED_MONITORING_FILES) {
      if (fs.existsSync(file)) {
        details.push(`present: ${file}`);
        score += 15;
      } else {
        details.push(`missing: ${file}`);
      }
    }

    if (fs.existsSync('scripts/verify-monitoring-stack.sh')) {
      details.push('present: monitoring verification script');
      score += 25;
    }

    this.results.monitoringConfig = {
      passed: score >= 85,
      score,
      details,
    };
  }

  validateWorkspaceIdentity() {
    this.log('Validating ui.recoder.xyz workspace identity...', 'info');
    let score = 0;
    const details = [];

    if (fs.existsSync('apps/ui.giselles.ai/package.json')) {
      const pkg = JSON.parse(fs.readFileSync('apps/ui.giselles.ai/package.json', 'utf8'));
      if (pkg.name === 'ui.recoder.xyz') {
        details.push('package identity matches ui.recoder.xyz');
        score += 50;
      } else {
        details.push(`unexpected package identity: ${pkg.name}`);
      }
    } else {
      details.push('missing: apps/ui.giselles.ai/package.json');
    }

    if (fs.existsSync('docs/workspace-boundaries.md')) {
      const boundaries = fs.readFileSync('docs/workspace-boundaries.md', 'utf8');
      if (
        boundaries.includes('apps/ui.giselles.ai') &&
        boundaries.includes('ui.recoder.xyz')
      ) {
        details.push('workspace boundaries document legacy path and current identity');
        score += 50;
      } else {
        details.push('workspace boundaries missing legacy-path/current-identity note');
      }
    } else {
      details.push('missing: docs/workspace-boundaries.md');
    }

    this.results.workspaceIdentity = {
      passed: score === 100,
      score,
      details,
    };
  }

  generateReport() {
    this.overallScore = Math.round(
      Object.values(this.results).reduce((sum, result) => sum + result.score, 0) /
        Object.keys(this.results).length,
    );

    const allPassed = Object.values(this.results).every((result) => result.passed);
    const report = {
      timestamp: new Date().toISOString(),
      overallStatus: allPassed ? 'PRODUCTION_READY' : 'NEEDS_IMPROVEMENT',
      overallScore: this.overallScore,
      results: this.results,
      recommendations: allPassed
        ? [
            'Run bash scripts/deploy-all-services.sh for deployment.',
            'Run bash scripts/post-rotation-verify.sh after each production rotation.',
          ]
        : [
            'Fix any missing canonical deployment/runtime artifacts.',
            'Ensure docker-compose.deploy.yml remains the only supported production stack.',
            'Keep apps/ui.giselles.ai as a legacy path until a full repo move is executed.',
          ],
    };

    fs.writeFileSync('final-production-validation.json', JSON.stringify(report, null, 2));
    return report;
  }

  async run() {
    console.log('FINAL PRODUCTION VALIDATION');
    console.log('===========================\n');

    this.validateCanonicalDeployPath();
    await this.validateComposeTopology();
    this.validateRuntimeConfig();
    this.validateMonitoringConfig();
    this.validateWorkspaceIdentity();

    const report = this.generateReport();

    for (const [category, result] of Object.entries(this.results)) {
      const status = result.passed ? 'PASS' : 'WARN';
      console.log(`${status} ${category}: ${result.score}/100`);
      for (const detail of result.details) {
        console.log(`  - ${detail}`);
      }
    }

    console.log(`\nOverall: ${report.overallStatus} (${report.overallScore}/100)`);
    console.log('Report: final-production-validation.json');

    return report.overallStatus === 'PRODUCTION_READY';
  }
}

if (require.main === module) {
  const validator = new FinalProductionValidator();
  validator.run().then((success) => {
    process.exit(success ? 0 : 1);
  }).catch((error) => {
    console.error(`FAIL final validation failed: ${error.message}`);
    process.exit(1);
  });
}

module.exports = FinalProductionValidator;
