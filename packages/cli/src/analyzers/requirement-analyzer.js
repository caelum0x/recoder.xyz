const inquirer = require('inquirer');
const { logger } = require('../utils/logger');

class RequirementAnalyzer {
  constructor() {
    this.supportedTypes = ['web', 'mobile', 'blockchain', 'ai', 'fullstack'];
  }

  async analyze(description, options = {}) {
    try {
      logger.debug('Starting requirement analysis...');
      
      let requirements;
      
      if (typeof description === 'string') {
        // Text description provided
        requirements = await this.analyzeDescription(description, options);
      } else if (typeof description === 'object') {
        // Requirements object provided
        requirements = this.validateRequirements(description);
      } else {
        throw new Error('Invalid description format');
      }

      if (options.interactive) {
        requirements = await this.interactiveRefinement(requirements);
      }

      logger.debug('Requirement analysis completed');
      return requirements;
    } catch (error) {
      throw new Error(`Requirement analysis failed: ${error.message}`);
    }
  }

  async analyzeDescription(description, options) {
    const requirements = {
      description,
      projectName: this.extractProjectName(description),
      type: options.type || this.detectProjectType(description),
      functional: this.extractFunctionalRequirements(description),
      nonFunctional: this.extractNonFunctionalRequirements(description),
      technical: this.extractTechnicalRequirements(description),
      integrations: this.extractIntegrations(description),
      constraints: this.extractConstraints(description),
      stakeholders: this.extractStakeholders(description)
    };

    return requirements;
  }

  extractProjectName(description) {
    // Try to extract project name from description
    const patterns = [
      /(?:build|create|develop)\s+(?:a|an)?\s*([a-zA-Z0-9\s-]+?)(?:\s+(?:app|application|system|platform|website))/i,
      /^([a-zA-Z0-9\s-]+?)(?:\s+(?:app|application|system|platform|website))/i,
      /project\s+(?:called|named)\s+([a-zA-Z0-9\s-]+)/i
    ];

    for (const pattern of patterns) {
      const match = description.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }

    return 'Untitled Project';
  }

  detectProjectType(description) {
    const keywords = description.toLowerCase();
    
    if (keywords.includes('blockchain') || keywords.includes('smart contract') || 
        keywords.includes('defi') || keywords.includes('nft') || keywords.includes('web3')) {
      return 'blockchain';
    }
    
    if (keywords.includes('mobile') || keywords.includes('react native') || 
        keywords.includes('flutter') || keywords.includes('ios') || keywords.includes('android')) {
      return 'mobile';
    }
    
    if (keywords.includes('ai') || keywords.includes('machine learning') || 
        keywords.includes('nlp') || keywords.includes('computer vision') || keywords.includes('ml')) {
      return 'ai';
    }
    
    if ((keywords.includes('api') && keywords.includes('frontend')) || 
        keywords.includes('full stack') || keywords.includes('fullstack')) {
      return 'fullstack';
    }
    
    return 'web';
  }

  extractFunctionalRequirements(description) {
    const requirements = [];
    const patterns = [
      /(?:users?\s+(?:can|should|must|will|need to)\s+)([^.!?]+)/gi,
      /(?:the\s+(?:app|application|system)\s+(?:should|must|will|needs to)\s+)([^.!?]+)/gi,
      /(?:feature|functionality|capability):\s*([^.!?\n]+)/gi,
      /(?:requirement|req):\s*([^.!?\n]+)/gi
    ];

    patterns.forEach(pattern => {
      let match;
      while ((match = pattern.exec(description)) !== null) {
        const requirement = match[1].trim();
        if (requirement.length > 5) {
          requirements.push(requirement);
        }
      }
    });

    // If no specific requirements found, extract general features
    if (requirements.length === 0) {
      const features = this.extractGeneralFeatures(description);
      requirements.push(...features);
    }

    return [...new Set(requirements)]; // Remove duplicates
  }

  extractGeneralFeatures(description) {
    const features = [];
    const keywords = description.toLowerCase();
    
    // Common features based on project type
    if (keywords.includes('user') || keywords.includes('account')) {
      features.push('User registration and authentication');
    }
    if (keywords.includes('dashboard') || keywords.includes('admin')) {
      features.push('Administrative dashboard');
    }
    if (keywords.includes('payment') || keywords.includes('purchase')) {
      features.push('Payment processing');
    }
    if (keywords.includes('chat') || keywords.includes('message')) {
      features.push('Real-time messaging');
    }
    if (keywords.includes('search')) {
      features.push('Search functionality');
    }
    if (keywords.includes('notification')) {
      features.push('Push notifications');
    }
    if (keywords.includes('api')) {
      features.push('RESTful API endpoints');
    }
    
    return features;
  }

  extractNonFunctionalRequirements(description) {
    const requirements = [];
    const keywords = description.toLowerCase();
    
    // Performance requirements
    if (keywords.includes('fast') || keywords.includes('performance') || keywords.includes('speed')) {
      requirements.push('High performance with sub-second response times');
    }
    
    // Scalability requirements
    if (keywords.includes('scale') || keywords.includes('traffic') || keywords.includes('users')) {
      requirements.push('Scalable architecture to handle growing user base');
    }
    
    // Security requirements
    if (keywords.includes('secure') || keywords.includes('security') || keywords.includes('encryption')) {
      requirements.push('Enterprise-grade security measures');
    }
    
    // Availability requirements
    if (keywords.includes('available') || keywords.includes('uptime') || keywords.includes('24/7')) {
      requirements.push('High availability with minimal downtime');
    }
    
    // Default non-functional requirements
    requirements.push('Responsive design for all device types');
    requirements.push('Cross-browser compatibility');
    requirements.push('SEO optimization');
    
    return [...new Set(requirements)];
  }

  extractTechnicalRequirements(description) {
    const requirements = [];
    const keywords = description.toLowerCase();
    
    // Frontend technologies
    if (keywords.includes('react')) requirements.push('React framework');
    if (keywords.includes('vue')) requirements.push('Vue.js framework');
    if (keywords.includes('angular')) requirements.push('Angular framework');
    if (keywords.includes('nextjs') || keywords.includes('next.js')) requirements.push('Next.js framework');
    
    // Backend technologies
    if (keywords.includes('nodejs') || keywords.includes('node.js')) requirements.push('Node.js backend');
    if (keywords.includes('python')) requirements.push('Python backend');
    if (keywords.includes('golang') || keywords.includes('go')) requirements.push('Go backend');
    
    // Databases
    if (keywords.includes('postgresql') || keywords.includes('postgres')) requirements.push('PostgreSQL database');
    if (keywords.includes('mongodb') || keywords.includes('mongo')) requirements.push('MongoDB database');
    if (keywords.includes('mysql')) requirements.push('MySQL database');
    
    // Blockchain specific
    if (keywords.includes('solana')) requirements.push('Solana blockchain integration');
    if (keywords.includes('ethereum')) requirements.push('Ethereum blockchain integration');
    
    return [...new Set(requirements)];
  }

  extractIntegrations(description) {
    const integrations = [];
    const keywords = description.toLowerCase();
    
    // Payment integrations
    if (keywords.includes('stripe')) integrations.push({ name: 'Stripe', type: 'payment' });
    if (keywords.includes('paypal')) integrations.push({ name: 'PayPal', type: 'payment' });
    
    // AI integrations
    if (keywords.includes('openai') || keywords.includes('gpt')) integrations.push({ name: 'OpenAI', type: 'ai' });
    if (keywords.includes('claude')) integrations.push({ name: 'Anthropic Claude', type: 'ai' });
    
    // Cloud services
    if (keywords.includes('aws')) integrations.push({ name: 'AWS', type: 'cloud' });
    if (keywords.includes('vercel')) integrations.push({ name: 'Vercel', type: 'deployment' });
    
    // Social integrations
    if (keywords.includes('google')) integrations.push({ name: 'Google APIs', type: 'social' });
    if (keywords.includes('facebook')) integrations.push({ name: 'Facebook API', type: 'social' });
    
    return integrations;
  }

  extractConstraints(description) {
    const constraints = [];
    const keywords = description.toLowerCase();
    
    if (keywords.includes('budget')) {
      constraints.push('Budget limitations');
    }
    if (keywords.includes('deadline') || keywords.includes('timeline')) {
      constraints.push('Time constraints');
    }
    if (keywords.includes('team') && keywords.includes('small')) {
      constraints.push('Small development team');
    }
    if (keywords.includes('legacy')) {
      constraints.push('Legacy system integration required');
    }
    
    return constraints;
  }

  extractStakeholders(description) {
    const stakeholders = [];
    const keywords = description.toLowerCase();
    
    if (keywords.includes('customer') || keywords.includes('client')) {
      stakeholders.push('Customers/Clients');
    }
    if (keywords.includes('admin') || keywords.includes('administrator')) {
      stakeholders.push('Administrators');
    }
    if (keywords.includes('user') || keywords.includes('end user')) {
      stakeholders.push('End Users');
    }
    if (keywords.includes('business') || keywords.includes('manager')) {
      stakeholders.push('Business Stakeholders');
    }
    
    return [...new Set(stakeholders)];
  }

  async interactiveRefinement(requirements) {
    logger.info('Starting interactive requirement refinement...');
    
    const questions = [
      {
        type: 'confirm',
        name: 'correctType',
        message: `Project type detected as '${requirements.type}'. Is this correct?`,
        default: true
      },
      {
        type: 'list',
        name: 'newType',
        message: 'Please select the correct project type:',
        choices: this.supportedTypes,
        when: (answers) => !answers.correctType
      },
      {
        type: 'confirm',
        name: 'addFeatures',
        message: 'Would you like to add more features?',
        default: false
      },
      {
        type: 'input',
        name: 'additionalFeatures',
        message: 'Enter additional features (comma-separated):',
        when: (answers) => answers.addFeatures,
        filter: (input) => input.split(',').map(item => item.trim()).filter(item => item.length > 0)
      },
      {
        type: 'confirm',
        name: 'addIntegrations',
        message: 'Would you like to specify additional integrations?',
        default: false
      },
      {
        type: 'checkbox',
        name: 'selectedIntegrations',
        message: 'Select additional integrations:',
        choices: [
          'Stripe Payment',
          'PayPal Payment',
          'OpenAI API',
          'AWS Services',
          'Google APIs',
          'Firebase',
          'Supabase',
          'Vercel Deployment'
        ],
        when: (answers) => answers.addIntegrations
      }
    ];

    const answers = await inquirer.prompt(questions);
    
    // Apply refinements
    if (answers.newType) {
      requirements.type = answers.newType;
    }
    
    if (answers.additionalFeatures) {
      requirements.functional.push(...answers.additionalFeatures);
    }
    
    if (answers.selectedIntegrations) {
      const integrationMap = {
        'Stripe Payment': { name: 'Stripe', type: 'payment' },
        'PayPal Payment': { name: 'PayPal', type: 'payment' },
        'OpenAI API': { name: 'OpenAI', type: 'ai' },
        'AWS Services': { name: 'AWS', type: 'cloud' },
        'Google APIs': { name: 'Google', type: 'social' },
        'Firebase': { name: 'Firebase', type: 'backend' },
        'Supabase': { name: 'Supabase', type: 'backend' },
        'Vercel Deployment': { name: 'Vercel', type: 'deployment' }
      };
      
      answers.selectedIntegrations.forEach(integration => {
        if (integrationMap[integration]) {
          requirements.integrations.push(integrationMap[integration]);
        }
      });
    }
    
    return requirements;
  }

  validateRequirements(requirements) {
    const required = ['description', 'type', 'functional'];
    
    for (const field of required) {
      if (!requirements[field]) {
        throw new Error(`Missing required field: ${field}`);
      }
    }
    
    if (!this.supportedTypes.includes(requirements.type)) {
      throw new Error(`Unsupported project type: ${requirements.type}`);
    }
    
    return requirements;
  }
}

module.exports = { RequirementAnalyzer };