const { Command } = require('commander');
const { CodeGenerator } = require('../../lib/code-generator');
const { ProductionGenerator } = require('../../generators/production-generator');
const { FunctionalityValidator } = require('../../validators/functionality-validator');
const { IntegrationValidator } = require('../../validators/integration-validator');
const { logger } = require('../../utils/logger');
const { spinner } = require('../../utils/spinner');
const fs = require('fs-extra');
const path = require('path');

class GenerateCommand {
  constructor() {
    this.command = new Command('generate');
    this.codeGenerator = new CodeGenerator();
    this.productionGenerator = new ProductionGenerator();
    this.functionalityValidator = new FunctionalityValidator();
    this.integrationValidator = new IntegrationValidator();
    this.setupCommand();
  }

  setupCommand() {
    this.command
      .description('Generate production-ready code with REAL functionality (no mocks)')
      .argument('<plan-file>', 'Project plan file (.md or .json)')
      .option('-o, --output <dir>', 'Output directory', './generated-project')
      .option('--validate', 'Validate for production readiness and real functionality', true)
      .option('--no-validate', 'Skip validation')
      .option('--real-only', 'Ensure only real functionality (no mocks/placeholders)', true)
      .option('--test', 'Generate comprehensive tests', true)
      .option('--deploy-config', 'Generate deployment configurations', true)
      .option('--env-template', 'Generate environment template', true)
      .option('--force', 'Overwrite existing output directory')
      .action(this.generateProject.bind(this));
  }

  async generateProject(planFile, options) {
    const generationSpinner = spinner('Generating production code...');
    
    try {
      generationSpinner.start();

      // Load and parse plan
      const plan = JSON.parse(require('fs').readFileSync(planFile, 'utf8'));
      
      // Generate project structure
      await this.productionGenerator.generateStructure(plan, options.output);
      
      // Generate core functionality
      const codeResults = await this.codeGenerator.generateFromPlan(plan, {
        outputDir: options.output,
        includeRealIntegrations: options.realIntegrations,
        generateTests: options.test,
        generateDeployConfig: options.deployConfig,
        generateEnvTemplate: options.envTemplate
      });

      // Generate real integrations if requested
      if (options.realIntegrations) {
        await this.generateRealIntegrations(plan, options.output);
      }

      // Validate functionality if requested
      let validationResults = null;
      if (options.validate) {
        validationResults = await this.integrationValidator.validateProject(
          options.output, 
          plan
        );
      }

      generationSpinner.stop();

      logger.success(`Project generated successfully in: ${options.output}`);
      
      console.log('\\n📁 Generated Structure:');
      codeResults.files.forEach(file => {
        console.log(`   ${file.path} (${file.type})`);
      });

      if (options.realIntegrations) {
        console.log('\\n🔌 Real Integrations:');
        codeResults.integrations.forEach(integration => {
          console.log(`   • ${integration.name} - ${integration.status}`);
        });
      }

      if (validationResults) {
        console.log('\\n✅ Validation Results:');
        validationResults.checks.forEach(check => {
          const status = check.passed ? '✅' : '❌';
          console.log(`   ${status} ${check.name}: ${check.result}`);
        });
      }

      console.log('\\n🚀 Next Steps:');
      console.log(`   1. cd ${options.output}`);
      console.log('   2. npm install');
      if (options.envTemplate) {
        console.log('   3. Configure .env file');
      }
      console.log('   4. npm run dev');

      return {
        outputDir: options.output,
        files: codeResults.files,
        integrations: codeResults.integrations,
        validation: validationResults
      };

    } catch (error) {
      generationSpinner.stop();
      logger.error('Code generation failed:', error.message);
      process.exit(1);
    }
  }

  async generateRealIntegrations(plan, outputDir) {
    const integrations = plan.integrations || [];
    
    for (const integration of integrations) {
      switch (integration.type) {
        case 'blockchain':
          await this.generateBlockchainIntegration(integration, outputDir);
          break;
        case 'payment':
          await this.generatePaymentIntegration(integration, outputDir);
          break;
        case 'ai':
          await this.generateAIIntegration(integration, outputDir);
          break;
        case 'database':
          await this.generateDatabaseIntegration(integration, outputDir);
          break;
        case 'cloud':
          await this.generateCloudIntegration(integration, outputDir);
          break;
      }
    }
  }

  async generateBlockchainIntegration(integration, outputDir) {
    const BlockchainGenerator = require('../../integrations/blockchain/solana');
    const generator = new BlockchainGenerator();
    
    return await generator.generateIntegration(integration, outputDir);
  }

  async generatePaymentIntegration(integration, outputDir) {
    const PaymentGenerator = require('../../integrations/payment/stripe');
    const generator = new PaymentGenerator();
    
    return await generator.generateIntegration(integration, outputDir);
  }

  async generateAIIntegration(integration, outputDir) {
    const AIGenerator = require('../../integrations/ai/openai');
    const generator = new AIGenerator();
    
    return await generator.generateIntegration(integration, outputDir);
  }

  async generateDatabaseIntegration(integration, outputDir) {
    const DatabaseGenerator = require('../../integrations/database/postgresql');
    const generator = new DatabaseGenerator();
    
    return await generator.generateIntegration(integration, outputDir);
  }

  async generateCloudIntegration(integration, outputDir) {
    const CloudGenerator = require('../../integrations/cloud/aws');
    const generator = new CloudGenerator();
    
    return await generator.generateIntegration(integration, outputDir);
  }
}

module.exports = { GenerateCommand };