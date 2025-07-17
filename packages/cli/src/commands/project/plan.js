const { Command } = require('commander');
const { ProjectPlanner } = require('../../planners/project-planner');
const { RequirementAnalyzer } = require('../../analyzers/requirement-analyzer');
const { logger } = require('../../utils/logger');
const { spinner } = require('../../utils/spinner');

class PlanCommand {
  constructor() {
    this.command = new Command('plan');
    this.planner = new ProjectPlanner();
    this.requirementAnalyzer = new RequirementAnalyzer();
    this.setupCommand();
  }

  setupCommand() {
    this.command
      .description('Create a detailed project plan')
      .argument('<description>', 'Project description or requirements file')
      .option('-t, --type <type>', 'Project type (web, mobile, blockchain, ai, fullstack)', 'web')
      .option('-o, --output <file>', 'Output plan file', 'project-plan.md')
      .option('--interactive', 'Interactive planning mode')
      .option('--template <template>', 'Use planning template')
      .option('--validate', 'Validate plan for production readiness')
      .action(this.createPlan.bind(this));
  }

  async createPlan(description, options) {
    const planningSpinner = spinner('Analyzing requirements and creating plan...');
    
    try {
      planningSpinner.start();

      // Step 1: Analyze requirements
      const requirements = await this.requirementAnalyzer.analyze(description, {
        type: options.type,
        interactive: options.interactive
      });

      // Step 2: Create detailed plan
      const plan = await this.planner.createPlan(requirements, {
        type: options.type,
        template: options.template,
        validate: options.validate
      });

      // Step 3: Generate plan document
      const planDocument = this.generatePlanDocument(plan, requirements);
      
      planningSpinner.stop();

      // Save plan
      require('fs').writeFileSync(options.output, planDocument);
      
      logger.success(`Project plan created: ${options.output}`);
      logger.info(`Project: ${plan.name}`);
      logger.info(`Type: ${plan.type}`);
      logger.info(`Estimated duration: ${plan.estimatedDuration}`);
      logger.info(`Complexity: ${plan.complexity}`);
      
      console.log('\\n📋 Plan Overview:');
      plan.phases.forEach((phase, index) => {
        console.log(`${index + 1}. ${phase.name} (${phase.duration})`);
        phase.tasks.forEach(task => {
          console.log(`   • ${task.name}`);
        });
      });

      if (options.validate) {
        console.log('\\n✅ Production Readiness Checks:');
        plan.validationChecks.forEach(check => {
          const status = check.passed ? '✅' : '❌';
          console.log(`${status} ${check.name}: ${check.description}`);
        });
      }

      return plan;
    } catch (error) {
      planningSpinner.stop();
      logger.error('Failed to create plan:', error.message);
      process.exit(1);
    }
  }

  generatePlanDocument(plan, requirements) {
    return `# ${plan.name} - Project Plan

## Overview
- **Type**: ${plan.type}
- **Complexity**: ${plan.complexity}
- **Estimated Duration**: ${plan.estimatedDuration}
- **Budget Estimate**: ${plan.budgetEstimate}

## Requirements
${requirements.functional.map(req => `- ${req}`).join('\\n')}

## Technical Stack
${Object.entries(plan.techStack).map(([category, items]) => 
  `### ${category}\\n${items.map(item => `- ${item}`).join('\\n')}`
).join('\\n\\n')}

## Project Phases
${plan.phases.map((phase, index) => `
### Phase ${index + 1}: ${phase.name}
**Duration**: ${phase.duration}
**Description**: ${phase.description}

**Tasks**:
${phase.tasks.map(task => `- [ ] ${task.name} (${task.duration})`).join('\\n')}

**Deliverables**:
${phase.deliverables.map(deliverable => `- ${deliverable}`).join('\\n')}
`).join('\\n')}

## Architecture
\`\`\`
${plan.architecture.diagram}
\`\`\`

## Integrations
${plan.integrations.map(integration => `
### ${integration.name}
- **Type**: ${integration.type}
- **Purpose**: ${integration.purpose}
- **Implementation**: ${integration.implementation}
`).join('\\n')}

## Production Considerations
${plan.productionConsiderations.map(consideration => `- ${consideration}`).join('\\n')}

## Risk Assessment
${plan.risks.map(risk => `
### ${risk.name} (${risk.severity})
**Impact**: ${risk.impact}
**Mitigation**: ${risk.mitigation}
`).join('\\n')}
`;
  }
}

module.exports = { PlanCommand };