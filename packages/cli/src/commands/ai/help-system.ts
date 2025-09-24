/**
 * AI Commands Help System
 * 
 * Comprehensive help and documentation system for all AI commands,
 * providing examples, best practices, and intelligent suggestions
 * based on user context and project analysis.
 */

import chalk from 'chalk';
import boxen from 'boxen';
import { Logger } from 'recoder-shared';

export interface HelpTopic {
  name: string;
  description: string;
  examples: Array<{
    command: string;
    description: string;
    output?: string;
  }>;
  relatedTopics: string[];
  bestPractices: string[];
}

export class AIHelpSystem {
  private readonly helpTopics: Map<string, HelpTopic> = new Map();

  constructor() {
    this.initializeHelpTopics();
  }

  /**
   * Display comprehensive help for AI commands
   */
  showMainHelp(): void {
    console.log(this.createHeader('🤖 AI Commands Help'));
    
    console.log(chalk.cyan('Available Commands:\n'));
    
    const commandGroups = [
      {
        title: '🚀 Code Generation',
        commands: [
          { cmd: 'ai generate <description>', desc: 'Smart code generation with context awareness' },
          { cmd: 'generate <description>', desc: 'Quick code generation (alias)' },
          { cmd: 'gen <description>', desc: 'Shortest code generation alias' }
        ]
      },
      {
        title: '💬 AI Chat & Assistance',
        commands: [
          { cmd: 'ai chat [message]', desc: 'Intelligent chat with project context' },
          { cmd: 'chat [message]', desc: 'Quick AI chat (alias)' },
          { cmd: 'ai explain <code>', desc: 'Explain code with examples' },
          { cmd: 'explain <code>', desc: 'Quick code explanation (alias)' }
        ]
      },
      {
        title: '🔍 Code Analysis & Review',
        commands: [
          { cmd: 'ai review [files...]', desc: 'AI-powered code review' },
          { cmd: 'review [files...]', desc: 'Quick code review (alias)' },
          { cmd: 'ai optimize [files...]', desc: 'AI code optimization suggestions' },
          { cmd: 'ai debug <error>', desc: 'AI debugging assistance' }
        ]
      },
      {
        title: '🧪 Testing & Documentation',
        commands: [
          { cmd: 'ai test <files...>', desc: 'Generate comprehensive test suites' },
          { cmd: 'ai docs <files...>', desc: 'Generate intelligent documentation' }
        ]
      },
      {
        title: '🦙 Ollama (Local AI)',
        commands: [
          { cmd: 'ai ollama status', desc: 'Check Ollama service status' },
          { cmd: 'ai ollama install [model]', desc: 'Install Ollama and models' },
          { cmd: 'ai ollama models', desc: 'Manage local AI models' },
          { cmd: 'ai ollama recommend', desc: 'Get model recommendations' }
        ]
      },
      {
        title: '📊 System Management',
        commands: [
          { cmd: 'ai status', desc: 'Show AI system status' },
          { cmd: 'ai providers', desc: 'Manage AI providers' },
          { cmd: 'ai optimize', desc: 'Optimize AI system performance' },
          { cmd: 'ai benchmark', desc: 'Benchmark AI performance' }
        ]
      }
    ];

    commandGroups.forEach(group => {
      console.log(chalk.blue(`\n${group.title}:`));
      group.commands.forEach(cmd => {
        console.log(`  ${chalk.green(cmd.cmd.padEnd(30))} ${chalk.gray(cmd.desc)}`);
      });
    });

    console.log(this.createFooter());
  }

  /**
   * Show help for a specific topic
   */
  showTopicHelp(topic: string): void {
    const helpTopic = this.helpTopics.get(topic.toLowerCase());
    
    if (!helpTopic) {
      console.log(chalk.red(`❌ Help topic '${topic}' not found`));
      this.suggestSimilarTopics(topic);
      return;
    }

    console.log(this.createHeader(`📚 ${helpTopic.name} Help`));
    
    console.log(chalk.cyan('Description:'));
    console.log(`  ${helpTopic.description}\n`);

    if (helpTopic.examples.length > 0) {
      console.log(chalk.cyan('Examples:\n'));
      helpTopic.examples.forEach((example, index) => {
        console.log(chalk.blue(`${index + 1}. ${example.description}`));
        console.log(chalk.green(`   $ ${example.command}`));
        
        if (example.output) {
          console.log(chalk.gray(`   ${example.output}`));
        }
        console.log();
      });
    }

    if (helpTopic.bestPractices.length > 0) {
      console.log(chalk.cyan('💡 Best Practices:\n'));
      helpTopic.bestPractices.forEach((practice, index) => {
        console.log(`  ${index + 1}. ${practice}`);
      });
      console.log();
    }

    if (helpTopic.relatedTopics.length > 0) {
      console.log(chalk.cyan('🔗 Related Topics:'));
      console.log(`  ${helpTopic.relatedTopics.map(t => chalk.blue(t)).join(', ')}\n`);
    }

    console.log(this.createFooter());
  }

  /**
   * Show interactive examples
   */
  showInteractiveExamples(): void {
    console.log(this.createHeader('🎯 Interactive Examples'));
    
    const examples = [
      {
        scenario: 'Generate a React component',
        command: 'ai generate "Create a responsive navigation bar component with dark mode toggle"',
        options: '--language typescript --framework react --tests --docs'
      },
      {
        scenario: 'Debug a Python error',
        command: 'ai debug "TypeError: unsupported operand type(s) for +: \'int\' and \'str\'"',
        options: '--suggest-fixes --interactive'
      },
      {
        scenario: 'Review code for security',
        command: 'ai review src/auth.js',
        options: '--security --format markdown --output review.md'
      },
      {
        scenario: 'Chat with project context',
        command: 'ai chat "How can I improve the performance of my React app?"',
        options: '--context --persona expert'
      },
      {
        scenario: 'Generate comprehensive tests',
        command: 'ai test src/utils.js',
        options: '--coverage comprehensive --integration --mocks'
      }
    ];

    examples.forEach((example, index) => {
      console.log(chalk.blue(`${index + 1}. ${example.scenario}`));
      console.log(chalk.green(`   ${example.command}`));
      if (example.options) {
        console.log(chalk.gray(`   Options: ${example.options}`));
      }
      console.log();
    });

    console.log(this.createFooter());
  }

  /**
   * Show quick start guide
   */
  showQuickStart(): void {
    console.log(this.createHeader('🚀 Quick Start Guide'));
    
    const steps = [
      {
        step: '1. Check AI System Status',
        command: 'ai status',
        description: 'Verify that AI services are available and configured'
      },
      {
        step: '2. Install Local AI (Optional)',
        command: 'ai ollama install',
        description: 'Install Ollama for free, private, offline AI capabilities'
      },
      {
        step: '3. Generate Your First Code',
        command: 'generate "Create a hello world function in Python"',
        description: 'Try the smart code generation with automatic optimization'
      },
      {
        step: '4. Start AI Chat',
        command: 'chat "How do I optimize this code for performance?"',
        description: 'Interactive AI assistance with project context awareness'
      },
      {
        step: '5. Review Your Code',
        command: 'review myfile.js --security --performance',
        description: 'Get AI-powered code review with actionable suggestions'
      }
    ];

    steps.forEach(step => {
      console.log(chalk.blue(step.step));
      console.log(chalk.green(`   $ ${step.command}`));
      console.log(chalk.gray(`   ${step.description}\n`));
    });

    console.log(chalk.cyan('💡 Pro Tips:'));
    console.log('  • Use --context to include project information in AI responses');
    console.log('  • Add --optimize for automatic performance enhancements');
    console.log('  • Use --interactive for step-by-step assistance');
    console.log('  • Try --stream for real-time response streaming');
    
    console.log(this.createFooter());
  }

  /**
   * Show configuration help
   */
  showConfigurationHelp(): void {
    console.log(this.createHeader('⚙️ Configuration Guide'));
    
    console.log(chalk.cyan('AI Provider Configuration:\n'));
    
    const providers = [
      {
        name: 'Ollama (Recommended)',
        description: 'Free, private, offline-capable local AI',
        setup: [
          'ai ollama install                 # Auto-install Ollama',
          'ai ollama models --recommendations # Get model recommendations',
          'ai ollama install llama2:7b       # Install specific model'
        ]
      },
      {
        name: 'Claude (Anthropic)',
        description: 'Advanced AI with excellent reasoning capabilities',
        setup: [
          'export ANTHROPIC_API_KEY="your-api-key"',
          'ai status --providers              # Verify configuration'
        ]
      },
      {
        name: 'Groq',
        description: 'Ultra-fast AI inference with free tier',
        setup: [
          'export GROQ_API_KEY="your-api-key"',
          'ai providers                       # Check status'
        ]
      },
      {
        name: 'Gemini (Google)',
        description: 'Multimodal AI with large context windows',
        setup: [
          'export GOOGLE_API_KEY="your-api-key"',
          'ai benchmark --quick               # Test performance'
        ]
      }
    ];

    providers.forEach(provider => {
      console.log(chalk.blue(`${provider.name}:`));
      console.log(chalk.gray(`  ${provider.description}\n`));
      
      provider.setup.forEach(cmd => {
        console.log(chalk.green(`  $ ${cmd}`));
      });
      console.log();
    });

    console.log(chalk.cyan('Advanced Configuration:\n'));
    console.log(chalk.green('  $ ai optimize --models             ') + chalk.gray('# Optimize model selection'));
    console.log(chalk.green('  $ ai ollama preferences --show     ') + chalk.gray('# View user preferences'));
    console.log(chalk.green('  $ ai ollama manage schedule        ') + chalk.gray('# Configure auto-updates'));
    
    console.log(this.createFooter());
  }

  /**
   * Show troubleshooting guide
   */
  showTroubleshooting(): void {
    console.log(this.createHeader('🔧 Troubleshooting Guide'));
    
    const issues = [
      {
        problem: 'AI commands are slow or timing out',
        solutions: [
          'Check system resources: ai status --detailed',
          'Optimize AI performance: ai optimize',
          'Switch to faster model: ai ollama recommend --use-case coding',
          'Clear response cache: ai ollama manage cleanup'
        ]
      },
      {
        problem: 'No AI providers available',
        solutions: [
          'Install local AI: ai ollama install',
          'Configure API keys: see "ai help config"',
          'Check provider status: ai providers',
          'Verify network connection for cloud providers'
        ]
      },
      {
        problem: 'Generated code quality is poor',
        solutions: [
          'Use project context: add --context flag',
          'Specify language/framework: --language python --framework django',
          'Try a different model: --model codellama:7b',
          'Use detailed prompts with specific requirements'
        ]
      },
      {
        problem: 'Ollama installation fails',
        solutions: [
          'Check system requirements: ai status --detailed',
          'Free up disk space (models need 4GB+ each)',
          'Check network connectivity',
          'Try manual installation: visit ollama.ai'
        ]
      }
    ];

    issues.forEach((issue, index) => {
      console.log(chalk.red(`${index + 1}. ${issue.problem}`));
      console.log(chalk.cyan('   Solutions:'));
      issue.solutions.forEach(solution => {
        console.log(`   • ${solution}`);
      });
      console.log();
    });

    console.log(chalk.blue('🆘 Still having issues?'));
    console.log('  • Check detailed logs: ai status --detailed');
    console.log('  • Run benchmark: ai benchmark --quick');
    console.log('  • Reset configuration: ai ollama preferences --reset'); 
    
    console.log(this.createFooter());
  }

  // Private helper methods

  private initializeHelpTopics(): void {
    this.helpTopics.set('generate', {
      name: 'Code Generation',
      description: 'Intelligent code generation with context awareness, optimization, and multiple output formats.',
      examples: [
        {
          command: 'ai generate "Create a REST API endpoint for user authentication"',
          description: 'Generate a complete API endpoint with authentication logic',
          output: 'Generated TypeScript Express.js endpoint with JWT authentication'
        },
        {
          command: 'generate "React component for file upload" --tests --docs',
          description: 'Generate component with tests and documentation',
          output: 'Created FileUpload.tsx, FileUpload.test.tsx, and README.md'
        }
      ],
      bestPractices: [
        'Be specific about requirements and constraints',
        'Specify the target language and framework',
        'Use --context to leverage project information',
        'Include --tests for production-ready code',
        'Use --optimize for performance-enhanced code'
      ],
      relatedTopics: ['chat', 'review', 'test']
    });

    this.helpTopics.set('chat', {
      name: 'AI Chat',
      description: 'Interactive AI assistance with project context and intelligent model selection.',
      examples: [
        {
          command: 'ai chat "How do I implement caching in Redis?"',
          description: 'Get help with specific technical questions'
        },
        {
          command: 'chat --interactive --persona mentor',
          description: 'Start an interactive mentoring session'
        }
      ],
      bestPractices: [
        'Use specific, detailed questions',
        'Enable context for project-aware responses',
        'Choose appropriate persona for your needs',
        'Use interactive mode for complex discussions'
      ],
      relatedTopics: ['generate', 'explain', 'debug']
    });

    // Add more help topics as needed
  }

  private createHeader(title: string): string {
    return boxen(chalk.bold.blue(title), {
      padding: 1,
      margin: 1,
      borderStyle: 'round',
      borderColor: 'blue'
    });
  }

  private createFooter(): string {
    return chalk.gray('\n💡 For more help: ai help <topic> | Examples: ai help examples | Quick start: ai help quickstart\n');
  }

  private suggestSimilarTopics(topic: string): void {
    const availableTopics = Array.from(this.helpTopics.keys());
    const suggestions = availableTopics.filter(t => 
      t.includes(topic.toLowerCase()) || topic.toLowerCase().includes(t)
    );

    if (suggestions.length > 0) {
      console.log(chalk.yellow('Did you mean:'));
      suggestions.forEach(suggestion => {
        console.log(chalk.blue(`  ai help ${suggestion}`));
      });
    } else {
      console.log(chalk.blue('Available help topics:'));
      availableTopics.forEach(t => {
        console.log(chalk.cyan(`  ${t}`));
      });
    }
  }
}

// Export singleton instance
export const aiHelpSystem = new AIHelpSystem();