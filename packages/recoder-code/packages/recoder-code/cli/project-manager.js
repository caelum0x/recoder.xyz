#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
// Handle chalk properly
const chalkModule = require('chalk');
const chalk = chalkModule.default || chalkModule;

class ProjectManager {
  constructor() {
    this.projectDir = '.recoder';
    this.contextFile = path.join(this.projectDir, 'project-context.json');
    this.planFile = path.join(this.projectDir, 'project-plan.md');
    this.todoFile = path.join(this.projectDir, 'todos.json');
    this.sessionFile = path.join(this.projectDir, 'session-history.json');
    this.notesFile = path.join(this.projectDir, 'notes.md');
    this.architectureFile = path.join(this.projectDir, 'architecture.md');
    this.progressFile = path.join(this.projectDir, 'progress.json');
    this.documentsDir = path.join(this.projectDir, 'documents');
    this.templatesDir = path.join(this.projectDir, 'templates');
    this.sessionsDir = path.join(this.projectDir, 'sessions');
    this.backupsDir = path.join(this.projectDir, 'backups');
    
    this.ensureProjectStructure();
  }

  ensureProjectStructure() {
    if (!fs.existsSync(this.projectDir)) {
      fs.mkdirSync(this.projectDir, { recursive: true });
      console.log(chalk.gray(`📁 Created .recoder project directory`));
    }
    
    // Ensure subdirectories exist
    const subdirs = [this.documentsDir, this.templatesDir, this.sessionsDir, this.backupsDir];
    subdirs.forEach(dir => {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    });
  }

  // Initialize default templates
  initializeDefaultTemplates() {
    const templates = {
      'meeting-notes': `# Meeting Notes - {{title}}

**Date:** {{date}}
**Attendees:** {{attendees}}
**Duration:** {{duration}}

## Agenda
{{agenda}}

## Discussion Points
{{discussion}}

## Action Items
{{actionItems}}

## Next Steps
{{nextSteps}}`,
      
      'feature-spec': `# Feature Specification - {{featureName}}

**Created:** {{timestamp}}
**Author:** {{author}}
**Status:** {{status}}

## Overview
{{overview}}

## Requirements
### Functional Requirements
{{functionalReqs}}

### Non-Functional Requirements
{{nonFunctionalReqs}}

## Technical Design
{{technicalDesign}}

## Implementation Plan
{{implementationPlan}}

## Testing Strategy
{{testingStrategy}}

## Acceptance Criteria
{{acceptanceCriteria}}`,
      
      'api-documentation': `# API Documentation - {{apiName}}

**Version:** {{version}}
**Created:** {{timestamp}}
**Base URL:** {{baseUrl}}

## Overview
{{description}}

## Authentication
{{authentication}}

## Endpoints

### {{endpointName}}
- **Method:** {{method}}
- **URL:** {{url}}
- **Description:** {{endpointDescription}}
- **Parameters:** {{parameters}}
- **Response:** {{response}}
- **Example:** {{example}}`,
      
      'bug-report': `# Bug Report - {{title}}

**Date:** {{timestamp}}
**Reporter:** {{reporter}}
**Severity:** {{severity}}
**Status:** {{status}}

## Description
{{description}}

## Steps to Reproduce
{{stepsToReproduce}}

## Expected Behavior
{{expectedBehavior}}

## Actual Behavior
{{actualBehavior}}

## Environment
{{environment}}

## Screenshots/Logs
{{screenshots}}

## Potential Fix
{{potentialFix}}`,
      
      'code-review': `# Code Review - {{prTitle}}

**Date:** {{timestamp}}
**Reviewer:** {{reviewer}}
**Author:** {{author}}
**PR/MR:** {{prLink}}

## Summary
{{summary}}

## Files Changed
{{filesChanged}}

## Review Comments

### Code Quality
{{codeQuality}}

### Performance
{{performance}}

### Security
{{security}}

### Testing
{{testing}}

## Approval Status
{{approvalStatus}}

## Action Items
{{actionItems}}`,
      
      'research-notes': `# Research Notes - {{topic}}

**Date:** {{timestamp}}
**Researcher:** {{researcher}}
**Purpose:** {{purpose}}

## Research Questions
{{questions}}

## Findings
{{findings}}

## Sources
{{sources}}

## Conclusions
{{conclusions}}

## Next Steps
{{nextSteps}}

## References
{{references}}`,
      
      'deployment-guide': `# Deployment Guide - {{projectName}}

**Version:** {{version}}
**Updated:** {{timestamp}}
**Environment:** {{environment}}

## Prerequisites
{{prerequisites}}

## Deployment Steps
{{deploymentSteps}}

## Configuration
{{configuration}}

## Environment Variables
{{envVars}}

## Verification
{{verification}}

## Rollback Procedure
{{rollbackProcedure}}

## Troubleshooting
{{troubleshooting}}`,
      
      'changelog-entry': `# Changelog Entry - {{version}}

**Date:** {{timestamp}}
**Version:** {{version}}
**Type:** {{releaseType}}

## Added
{{added}}

## Changed
{{changed}}

## Fixed
{{fixed}}

## Removed
{{removed}}

## Security
{{security}}

## Breaking Changes
{{breakingChanges}}`
    };
    
    Object.keys(templates).forEach(templateName => {
      const templatePath = path.join(this.templatesDir, `${templateName}.template`);
      if (!fs.existsSync(templatePath)) {
        fs.writeFileSync(templatePath, templates[templateName]);
        console.log(chalk.gray(`📄 Created template: ${templateName}.template`));
      }
    });
  }

  // === Project Templates ===

  // Get available project templates
  getProjectTemplates() {
    return {
      'web-frontend': {
        name: 'Frontend Web Application',
        description: 'React/Vue/Angular single page application',
        type: 'frontend',
        frameworks: ['React', 'Vue', 'Angular', 'HTML/CSS/JS'],
        defaultTodos: [
          'Set up project structure and build tools',
          'Create component architecture',
          'Implement routing and navigation',
          'Add state management (Redux/Vuex/NgRx)',
          'Style components and responsive design',
          'Set up testing framework',
          'Optimize bundle size and performance',
          'Deploy to hosting platform'
        ],
        defaultDocs: ['api-integration', 'component-guide', 'deployment-guide']
      },
      'web-fullstack': {
        name: 'Full-Stack Web Application',
        description: 'Complete web application with frontend and backend',
        type: 'fullstack',
        frameworks: ['Node.js', 'Express', 'React', 'Database'],
        defaultTodos: [
          'Design database schema',
          'Set up backend API server',
          'Implement authentication system',
          'Create RESTful API endpoints',
          'Build frontend user interface',
          'Connect frontend to backend',
          'Add input validation and error handling',
          'Set up testing for both frontend and backend',
          'Configure deployment pipeline'
        ],
        defaultDocs: ['api-documentation', 'database-schema', 'deployment-guide']
      },
      'mobile-app': {
        name: 'Mobile Application',
        description: 'iOS/Android mobile application',
        type: 'mobile',
        frameworks: ['React Native', 'Flutter', 'Swift', 'Kotlin'],
        defaultTodos: [
          'Set up development environment',
          'Design app navigation flow',
          'Create core UI components',
          'Implement data persistence',
          'Add device-specific features',
          'Integrate with APIs/services',
          'Test on multiple devices',
          'Prepare for app store submission'
        ],
        defaultDocs: ['app-store-guide', 'testing-guide', 'feature-spec']
      },
      'api-service': {
        name: 'API/Microservice',
        description: 'Backend API service or microservice',
        type: 'backend',
        frameworks: ['Node.js', 'Python', 'Go', 'Java'],
        defaultTodos: [
          'Design API schema and endpoints',
          'Set up database and models',
          'Implement authentication/authorization',
          'Create CRUD operations',
          'Add input validation and sanitization',
          'Implement error handling and logging',
          'Write API documentation',
          'Set up monitoring and health checks',
          'Configure containerization and deployment'
        ],
        defaultDocs: ['api-documentation', 'deployment-guide', 'monitoring-guide']
      },
      'data-science': {
        name: 'Data Science Project',
        description: 'Data analysis, ML, or research project',
        type: 'data-science',
        frameworks: ['Python', 'Jupyter', 'Pandas', 'Scikit-learn'],
        defaultTodos: [
          'Define research questions and objectives',
          'Collect and clean datasets',
          'Perform exploratory data analysis',
          'Feature engineering and selection',
          'Train and evaluate models',
          'Validate results and tune hyperparameters',
          'Create visualizations and reports',
          'Document methodology and findings',
          'Prepare presentation or publication'
        ],
        defaultDocs: ['research-notes', 'methodology', 'results-summary']
      },
      'devops-automation': {
        name: 'DevOps/Automation Project',
        description: 'Infrastructure, deployment, or automation project',
        type: 'devops',
        frameworks: ['Docker', 'Kubernetes', 'Terraform', 'Ansible'],
        defaultTodos: [
          'Define infrastructure requirements',
          'Design deployment architecture',
          'Create infrastructure as code',
          'Set up CI/CD pipelines',
          'Implement monitoring and alerting',
          'Configure backup and disaster recovery',
          'Document deployment procedures',
          'Test scaling and failover scenarios'
        ],
        defaultDocs: ['deployment-guide', 'monitoring-guide', 'runbook']
      },
      'cli-tool': {
        name: 'Command Line Tool',
        description: 'CLI application or developer tool',
        type: 'cli',
        frameworks: ['Node.js', 'Python', 'Go', 'Rust'],
        defaultTodos: [
          'Design command interface and arguments',
          'Implement core functionality',
          'Add configuration file support',
          'Create help documentation',
          'Handle errors gracefully',
          'Add progress indicators and logging',
          'Write tests for all commands',
          'Package for distribution',
          'Create installation guide'
        ],
        defaultDocs: ['user-guide', 'development-guide', 'changelog']
      },
      'library-package': {
        name: 'Library/Package',
        description: 'Reusable code library or npm package',
        type: 'library',
        frameworks: ['TypeScript', 'JavaScript', 'Python', 'Go'],
        defaultTodos: [
          'Define public API interface',
          'Implement core functionality',
          'Write comprehensive tests',
          'Create TypeScript definitions',
          'Set up build and bundling',
          'Write API documentation',
          'Add usage examples',
          'Configure package publishing',
          'Set up continuous integration'
        ],
        defaultDocs: ['api-documentation', 'usage-examples', 'contributing-guide']
      }
    };
  }

  // Initialize project from template
  initProjectFromTemplate(templateId, projectName, options = {}) {
    const templates = this.getProjectTemplates();
    const template = templates[templateId];
    
    if (!template) {
      console.log(chalk.red(`❌ Template not found: ${templateId}`));
      console.log(chalk.gray('Available templates:'));
      Object.keys(templates).forEach(id => {
        console.log(chalk.gray(`  ${id} - ${templates[id].name}`));
      });
      return false;
    }
    
    console.log(chalk.cyan(`🎯 Initializing ${template.name} project...`));
    console.log(chalk.gray(`   Description: ${template.description}`));
    console.log(chalk.gray(`   Frameworks: ${template.frameworks.join(', ')}`));
    
    // Initialize basic project structure
    const projectOptions = {
      name: projectName || template.name,
      type: template.type,
      template: templateId,
      frameworks: template.frameworks,
      ...options
    };
    
    this.initProject(projectOptions);
    
    // Add template-specific todos
    if (template.defaultTodos && template.defaultTodos.length > 0) {
      const todos = this.loadTodos();
      template.defaultTodos.forEach((todoText, index) => {
        todos.items.push({
          id: Date.now() + index,
          text: todoText,
          category: 'setup',
          priority: 'medium',
          created: new Date().toISOString()
        });
      });
      this.saveTodos(todos);
      console.log(chalk.green(`✅ Added ${template.defaultTodos.length} template todos`));
    }
    
    // Create template-specific documents
    if (template.defaultDocs && template.defaultDocs.length > 0) {
      template.defaultDocs.forEach(docTemplate => {
        const docName = `${docTemplate}-${template.type}`;
        this.createDocument(docName, '', docTemplate);
      });
      console.log(chalk.green(`✅ Created ${template.defaultDocs.length} template documents`));
    }
    
    // Update project plan with template information
    this.updateProjectPlanWithTemplate(template);
    
    console.log(chalk.bold.green('\\n🎉 Project template initialized successfully!'));
    console.log(chalk.yellow('Next steps:'));
    console.log(chalk.gray('  1. Review the generated todos: recoder-code --todos'));
    console.log(chalk.gray('  2. Check project plan: recoder-code --plan'));
    console.log(chalk.gray('  3. Start coding with: recoder-code'));
    
    return true;
  }

  // Update project plan with template-specific content
  updateProjectPlanWithTemplate(template) {
    const planContent = `# ${template.name} - Project Plan

## Overview
${template.description}

**Project Type:** ${template.type}
**Template Used:** ${template.name}
**Frameworks/Technologies:** ${template.frameworks.join(', ')}

## Development Phases

### Phase 1: Setup & Architecture
- Project structure setup
- Development environment configuration
- Framework and tooling selection

### Phase 2: Core Development
- Core functionality implementation
- Feature development
- Testing setup

### Phase 3: Integration & Testing
- Component integration
- End-to-end testing
- Performance optimization

### Phase 4: Deployment & Documentation
- Deployment configuration
- Documentation completion
- Final testing and release

## Key Considerations

### Technical Requirements
- Performance requirements
- Scalability considerations
- Security requirements
- Browser/device compatibility

### Best Practices
- Code organization and structure
- Testing strategy
- Documentation standards
- Version control workflow

## Resources & Documentation
- Framework documentation
- Best practices guides
- Deployment guides
- Community resources

---
*Generated from ${template.name} template*
*Created: ${new Date().toLocaleDateString()}*
`;

    try {
      fs.writeFileSync(this.planFile, planContent);
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not update project plan: ${error.message}`));
    }
  }

  // Show available project templates
  showProjectTemplates() {
    const templates = this.getProjectTemplates();
    
    console.log(chalk.bold.cyan('🎯 Available Project Templates'));
    console.log(chalk.gray('═'.repeat(50)));
    
    Object.entries(templates).forEach(([id, template]) => {
      console.log(chalk.yellow(`📋 ${id}`));
      console.log(chalk.white(`   ${template.name}`));
      console.log(chalk.gray(`   ${template.description}`));
      console.log(chalk.gray(`   Frameworks: ${template.frameworks.join(', ')}`));
      console.log(chalk.gray(`   Default todos: ${template.defaultTodos.length}`));
      console.log();
    });
    
    console.log(chalk.gray('Usage:'));
    console.log(chalk.gray('  recoder-code --init-template <template-id> [project-name]'));
    console.log(chalk.gray('  recoder-code --init-template web-frontend "My React App"'));
  }

  // Initialize a new project
  initProject(options = {}) {
    const projectId = crypto.randomBytes(8).toString('hex');
    const timestamp = new Date().toISOString();
    
    const context = {
      id: projectId,
      name: options.name || path.basename(process.cwd()),
      description: options.description || 'Recoder Code Project',
      created: timestamp,
      lastUpdated: timestamp,
      type: options.type || 'general',
      framework: options.framework || null,
      language: options.language || null,
      version: '1.0.0',
      status: 'active',
      directory: process.cwd(),
      files: {
        important: [],
        generated: [],
        modified: []
      },
      dependencies: [],
      scripts: {},
      environment: {
        node: process.version,
        platform: process.platform,
        arch: process.arch
      },
      collaborators: [],
      tags: options.tags || [],
      metadata: options.metadata || {}
    };

    this.saveContext(context);
    this.initializeProjectPlan(options);
    this.initializeTodos();
    this.initializeProgress();
    this.createArchitectureDoc(options);
    this.createNotesFile();
    this.initializeDefaultTemplates();
    
    console.log(chalk.green(`✅ Initialized project: ${context.name}`));
    console.log(chalk.gray(`   ID: ${projectId}`));
    console.log(chalk.gray(`   Directory: ${process.cwd()}`));
    
    return context;
  }

  // Load existing project context
  loadContext() {
    try {
      if (fs.existsSync(this.contextFile)) {
        const context = JSON.parse(fs.readFileSync(this.contextFile, 'utf8'));
        context.lastAccessed = new Date().toISOString();
        this.saveContext(context);
        return context;
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load project context: ${error.message}`));
    }
    return null;
  }

  // Save project context
  saveContext(context) {
    try {
      context.lastUpdated = new Date().toISOString();
      fs.writeFileSync(this.contextFile, JSON.stringify(context, null, 2));
    } catch (error) {
      console.log(chalk.red(`❌ Could not save project context: ${error.message}`));
    }
  }

  // Initialize project plan document
  initializeProjectPlan(options = {}) {
    const planContent = `# ${options.name || path.basename(process.cwd())} - Project Plan

## 📋 Project Overview
**Description:** ${options.description || 'Project description goes here'}
**Type:** ${options.type || 'General Development'}
**Framework:** ${options.framework || 'TBD'}
**Language:** ${options.language || 'TBD'}
**Created:** ${new Date().toLocaleDateString()}

## 🎯 Objectives
- [ ] Define project requirements
- [ ] Set up development environment
- [ ] Implement core functionality
- [ ] Add testing and documentation
- [ ] Deploy and maintain

## 🏗️ Architecture Overview
See [architecture.md](./architecture.md) for detailed technical architecture.

## 📅 Timeline
| Phase | Description | Duration | Status |
|-------|-------------|----------|---------|
| 1 | Planning & Setup | TBD | 🔄 In Progress |
| 2 | Core Development | TBD | ⏳ Pending |
| 3 | Testing & Polish | TBD | ⏳ Pending |
| 4 | Deployment | TBD | ⏳ Pending |

## 🔧 Technology Stack
- **Frontend:** TBD
- **Backend:** TBD
- **Database:** TBD
- **Deployment:** TBD

## 📚 Resources
- [Project Notes](./notes.md)
- [Session History](./session-history.json)
- [Todo List](./todos.json)

## 📝 Recent Updates
*Updates will be logged here by Recoder Code*

---
*Generated by Recoder Code - ${new Date().toLocaleString()}*
`;

    fs.writeFileSync(this.planFile, planContent);
    console.log(chalk.gray('📄 Created project-plan.md'));
  }

  // Initialize todos
  initializeTodos() {
    const todos = {
      created: new Date().toISOString(),
      lastUpdated: new Date().toISOString(),
      items: [],
      completed: [],
      archived: []
    };
    
    fs.writeFileSync(this.todoFile, JSON.stringify(todos, null, 2));
    console.log(chalk.gray('📝 Created todos.json'));
  }

  // Initialize progress tracking
  initializeProgress() {
    const progress = {
      created: new Date().toISOString(),
      sessions: [],
      metrics: {
        totalSessions: 0,
        totalCommands: 0,
        filesCreated: 0,
        filesModified: 0,
        linesOfCode: 0,
        timeSpent: 0
      },
      milestones: [],
      achievements: []
    };
    
    fs.writeFileSync(this.progressFile, JSON.stringify(progress, null, 2));
    console.log(chalk.gray('📊 Created progress.json'));
  }

  // Create architecture documentation
  createArchitectureDoc(options = {}) {
    const archContent = `# ${options.name || path.basename(process.cwd())} - Technical Architecture

## 🏗️ System Architecture
*Architecture diagrams and descriptions will be added here*

## 🗂️ Directory Structure
\`\`\`
${path.basename(process.cwd())}/
├── src/          # Source code
├── tests/        # Test files
├── docs/         # Documentation
├── config/       # Configuration files
└── .recoder/     # Recoder Code project files
\`\`\`

## 🔧 Component Design
*Component architecture will be documented here*

## 🗄️ Data Models
*Data structures and models will be defined here*

## 🔄 API Design
*API endpoints and interfaces will be documented here*

## 🔒 Security Considerations
*Security measures and best practices will be noted here*

## 🚀 Deployment Architecture
*Deployment strategy and infrastructure will be outlined here*

## 📈 Scalability Plan
*Scaling strategies and performance considerations*

## 🔍 Testing Strategy
*Testing approaches and frameworks*

---
*Generated by Recoder Code - ${new Date().toLocaleString()}*
*This document should be updated as the architecture evolves*
`;

    fs.writeFileSync(this.architectureFile, archContent);
    console.log(chalk.gray('🏗️ Created architecture.md'));
  }

  // Create notes file
  createNotesFile() {
    const notesContent = `# Project Notes

## 📝 Development Notes
*Add your development notes, ideas, and observations here*

## 🐛 Issues & Bugs
*Track issues encountered during development*

## 💡 Ideas & Improvements
*Future features and enhancement ideas*

## 📚 Learning & Resources
*Useful links, tutorials, and references*

## 🔄 Session Logs
*Important decisions and changes made during Recoder sessions*

---
*Generated by Recoder Code - ${new Date().toLocaleString()}*
`;

    fs.writeFileSync(this.notesFile, notesContent);
    console.log(chalk.gray('📓 Created notes.md'));
  }

  // Add todo item
  addTodo(item, category = 'general') {
    const todos = this.loadTodos();
    const newTodo = {
      id: crypto.randomBytes(4).toString('hex'),
      text: item,
      category: category,
      status: 'pending',
      created: new Date().toISOString(),
      priority: 'medium'
    };
    
    todos.items.push(newTodo);
    todos.lastUpdated = new Date().toISOString();
    this.saveTodos(todos);
    
    console.log(chalk.green(`✅ Added todo: ${item}`));
    return newTodo;
  }

  // Complete todo
  completeTodo(id) {
    const todos = this.loadTodos();
    const todoIndex = todos.items.findIndex(todo => todo.id === id);
    
    if (todoIndex !== -1) {
      const completedTodo = todos.items.splice(todoIndex, 1)[0];
      completedTodo.completed = new Date().toISOString();
      completedTodo.status = 'completed';
      todos.completed.push(completedTodo);
      todos.lastUpdated = new Date().toISOString();
      this.saveTodos(todos);
      
      console.log(chalk.green(`✅ Completed: ${completedTodo.text}`));
      return completedTodo;
    }
    return null;
  }

  // Load todos
  loadTodos() {
    try {
      if (fs.existsSync(this.todoFile)) {
        return JSON.parse(fs.readFileSync(this.todoFile, 'utf8'));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load todos: ${error.message}`));
    }
    return { items: [], completed: [], archived: [] };
  }

  // Save todos
  saveTodos(todos) {
    try {
      fs.writeFileSync(this.todoFile, JSON.stringify(todos, null, 2));
    } catch (error) {
      console.log(chalk.red(`❌ Could not save todos: ${error.message}`));
    }
  }

  // Log session activity
  logSession(activity) {
    try {
      const sessionLog = {
        timestamp: new Date().toISOString(),
        sessionId: activity.sessionId,
        command: activity.command,
        success: activity.success,
        duration: activity.duration,
        files: activity.files || [],
        tokens: activity.tokens || 0,
        model: activity.model || 'unknown'
      };

      let sessionHistory = [];
      if (fs.existsSync(this.sessionFile)) {
        sessionHistory = JSON.parse(fs.readFileSync(this.sessionFile, 'utf8'));
      }
      
      sessionHistory.push(sessionLog);
      
      // Keep only last 100 sessions to prevent file bloat
      if (sessionHistory.length > 100) {
        sessionHistory = sessionHistory.slice(-100);
      }
      
      fs.writeFileSync(this.sessionFile, JSON.stringify(sessionHistory, null, 2));
    } catch (error) {
      console.log(chalk.red(`❌ Could not log session: ${error.message}`));
    }
  }

  // Update project plan
  updatePlan(section, content) {
    try {
      let planContent = '';
      if (fs.existsSync(this.planFile)) {
        planContent = fs.readFileSync(this.planFile, 'utf8');
      }
      
      const timestamp = new Date().toLocaleString();
      const updateNote = `\n\n## 📝 Update - ${timestamp}\n${content}\n`;
      
      planContent += updateNote;
      fs.writeFileSync(this.planFile, planContent);
      
      console.log(chalk.green(`✅ Updated project plan`));
    } catch (error) {
      console.log(chalk.red(`❌ Could not update plan: ${error.message}`));
    }
  }

  // Add note
  addNote(content, category = 'general') {
    try {
      let notesContent = '';
      if (fs.existsSync(this.notesFile)) {
        notesContent = fs.readFileSync(this.notesFile, 'utf8');
      }
      
      const timestamp = new Date().toLocaleString();
      const note = `\n## 📝 ${category.toUpperCase()} - ${timestamp}\n${content}\n`;
      
      notesContent += note;
      fs.writeFileSync(this.notesFile, notesContent);
      
      console.log(chalk.green(`✅ Added note to ${category}`));
    } catch (error) {
      console.log(chalk.red(`❌ Could not add note: ${error.message}`));
    }
  }

  // Get project status
  getProjectStatus() {
    const context = this.loadContext();
    const todos = this.loadTodos();
    
    if (!context) {
      return {
        exists: false,
        initialized: false
      };
    }
    
    return {
      exists: true,
      initialized: true,
      context: context,
      todos: {
        pending: todos.items.length,
        completed: todos.completed.length,
        total: todos.items.length + todos.completed.length
      },
      files: {
        plan: fs.existsSync(this.planFile),
        architecture: fs.existsSync(this.architectureFile),
        notes: fs.existsSync(this.notesFile),
        todos: fs.existsSync(this.todoFile)
      }
    };
  }

  // Show project summary
  showProjectSummary() {
    const status = this.getProjectStatus();
    
    if (!status.exists) {
      console.log(chalk.yellow('📂 No Recoder project found in current directory'));
      console.log(chalk.gray('   Run: recoder-code --init to initialize a project'));
      return;
    }
    
    const context = status.context;
    console.log(chalk.bold.cyan(`📂 Project: ${context.name}`));
    console.log(chalk.gray('═════════════════════════════════'));
    console.log(chalk.white(`Description: ${context.description}`));
    console.log(chalk.white(`Type: ${context.type}`));
    console.log(chalk.white(`Created: ${new Date(context.created).toLocaleDateString()}`));
    console.log(chalk.white(`Last Updated: ${new Date(context.lastUpdated).toLocaleDateString()}`));
    console.log();
    
    console.log(chalk.bold.yellow('📋 Tasks:'));
    console.log(chalk.white(`  Pending: ${status.todos.pending}`));
    console.log(chalk.white(`  Completed: ${status.todos.completed}`));
    console.log(chalk.white(`  Total: ${status.todos.total}`));
    console.log();
    
    console.log(chalk.bold.green('📄 Documentation:'));
    console.log(chalk.white(`  Project Plan: ${status.files.plan ? '✅' : '❌'}`));
    console.log(chalk.white(`  Architecture: ${status.files.architecture ? '✅' : '❌'}`));
    console.log(chalk.white(`  Notes: ${status.files.notes ? '✅' : '❌'}`));
    console.log(chalk.white(`  Todos: ${status.files.todos ? '✅' : '❌'}`));
  }

  // Track file changes
  trackFileChange(filePath, action = 'modified') {
    const context = this.loadContext();
    if (!context) return;
    
    const relativePath = path.relative(process.cwd(), filePath);
    
    if (!context.files[action]) {
      context.files[action] = [];
    }
    
    if (!context.files[action].includes(relativePath)) {
      context.files[action].push(relativePath);
      this.saveContext(context);
    }
  }

  // Export project with comprehensive data and sharing options
  exportProject(outputPath = null, includeFullData = false, sharingOptions = {}) {
    const exportPath = outputPath || `./${path.basename(process.cwd())}-recoder-export.json`;
    const status = this.getProjectStatus();
    
    if (!status.exists) {
      console.log(chalk.red('❌ No project to export'));
      return null;
    }
    
    const exportData = {
      context: status.context,
      todos: this.loadTodos(),
      exportedAt: new Date().toISOString(),
      version: '2.0.0',
      exportType: includeFullData ? 'full' : 'basic',
      sharing: {
        exportedBy: process.env.USER || process.env.USERNAME || 'anonymous',
        exportedFrom: process.platform,
        nodeVersion: process.version,
        purpose: sharingOptions.purpose || 'collaboration',
        isShared: !!sharingOptions.sharing,
        shareSettings: sharingOptions
      }
    };
    
    if (includeFullData) {
      // Include additional data for full export
      exportData.documents = {};
      exportData.templates = {};
      exportData.sessions = [];
      exportData.backups = this.listBackups();
      exportData.sessionStats = this.getSessionStats();
      
      // Export documents
      const docs = this.listDocuments();
      docs.forEach(docName => {
        const content = this.loadDocument(docName);
        if (content) {
          exportData.documents[docName] = content;
        }
      });
      
      // Export templates
      try {
        const templateFiles = fs.readdirSync(this.templatesDir).filter(f => f.endsWith('.template'));
        templateFiles.forEach(file => {
          const templateName = file.replace('.template', '');
          const templatePath = path.join(this.templatesDir, file);
          const templateContent = fs.readFileSync(templatePath, 'utf8');
          exportData.templates[templateName] = templateContent;
        });
      } catch (error) {
        // Templates directory might not exist
      }
      
      // Export recent sessions (last 5) with privacy controls
      const sessions = this.listSessions({ limit: 5 });
      sessions.forEach(session => {
        const sessionExport = {
          id: session.id,
          created: session.created,
          modified: session.modified,
          messageCount: session.messageCount,
          model: session.model
        };
        
        // Include conversation history based on sharing settings
        if (sharingOptions.includeConversations !== false) {
          let conversationHistory = session.data.conversationHistory || [];
          
          // Apply privacy filters if sharing with others
          if (sharingOptions.sharing) {
            conversationHistory = this.sanitizeConversationForSharing(conversationHistory, sharingOptions);
          }
          
          sessionExport.conversationHistory = conversationHistory;
        }
        
        exportData.sessions.push(sessionExport);
      });
      
      // Export project files content
      exportData.projectFiles = {};
      if (fs.existsSync(this.planFile)) {
        exportData.projectFiles.plan = fs.readFileSync(this.planFile, 'utf8');
      }
      if (fs.existsSync(this.notesFile)) {
        exportData.projectFiles.notes = fs.readFileSync(this.notesFile, 'utf8');
      }
      if (fs.existsSync(this.architectureFile)) {
        exportData.projectFiles.architecture = fs.readFileSync(this.architectureFile, 'utf8');
      }
    }
    
    try {
      fs.writeFileSync(exportPath, JSON.stringify(exportData, null, 2));
      console.log(chalk.green(`✅ Project exported to: ${exportPath}`));
      console.log(chalk.gray(`   Export type: ${exportData.exportType}`));
      if (includeFullData) {
        console.log(chalk.gray(`   Documents: ${Object.keys(exportData.documents).length}`));
        console.log(chalk.gray(`   Templates: ${Object.keys(exportData.templates).length}`));
        console.log(chalk.gray(`   Sessions: ${exportData.sessions.length}`));
      }
      return exportPath;
    } catch (error) {
      console.log(chalk.red(`❌ Export failed: ${error.message}`));
      return null;
    }
  }

  // Import project from export file
  importProject(importPath, options = {}) {
    try {
      if (!fs.existsSync(importPath)) {
        console.log(chalk.red(`❌ Import file not found: ${importPath}`));
        return false;
      }
      
      const importData = JSON.parse(fs.readFileSync(importPath, 'utf8'));
      const { overwrite = false, selectiveImport = false } = options;
      
      console.log(chalk.cyan(`📥 Importing project from: ${importPath}`));
      console.log(chalk.gray(`   Version: ${importData.version || '1.0.0'}`));
      console.log(chalk.gray(`   Export type: ${importData.exportType || 'basic'}`));
      
      // Check if project already exists
      const existingProject = this.loadContext();
      if (existingProject && !overwrite) {
        console.log(chalk.yellow('⚠️  Project already exists in this directory'));
        console.log(chalk.gray('   Use --overwrite to replace existing project'));
        return false;
      }
      
      // Create backup of existing project if it exists
      if (existingProject) {
        console.log(chalk.cyan('📦 Creating backup of existing project...'));
        this.createBackup('Pre-import backup');
      }
      
      // Import context
      if (importData.context) {
        const context = { ...importData.context };
        context.id = crypto.randomBytes(8).toString('hex'); // New ID for imported project
        context.directory = process.cwd();
        context.imported = new Date().toISOString();
        context.importedFrom = importPath;
        context.lastUpdated = new Date().toISOString();
        
        this.saveContext(context);
        console.log(chalk.green(`✅ Imported project context: ${context.name}`));
      }
      
      // Import todos
      if (importData.todos) {
        this.saveTodos(importData.todos);
        console.log(chalk.green(`✅ Imported todos: ${importData.todos.items?.length || 0} pending, ${importData.todos.completed?.length || 0} completed`));
      }
      
      // Import documents (if full export)
      if (importData.documents) {
        let importedDocs = 0;
        Object.keys(importData.documents).forEach(docName => {
          this.createDocument(docName, importData.documents[docName]);
          importedDocs++;
        });
        console.log(chalk.green(`✅ Imported ${importedDocs} documents`));
      }
      
      // Import templates (if full export)
      if (importData.templates) {
        let importedTemplates = 0;
        Object.keys(importData.templates).forEach(templateName => {
          this.createTemplate(templateName, importData.templates[templateName]);
          importedTemplates++;
        });
        console.log(chalk.green(`✅ Imported ${importedTemplates} templates`));
      }
      
      // Import project files (if full export)
      if (importData.projectFiles) {
        if (importData.projectFiles.plan) {
          fs.writeFileSync(this.planFile, importData.projectFiles.plan);
          console.log(chalk.green(`✅ Imported project plan`));
        }
        if (importData.projectFiles.notes) {
          fs.writeFileSync(this.notesFile, importData.projectFiles.notes);
          console.log(chalk.green(`✅ Imported project notes`));
        }
        if (importData.projectFiles.architecture) {
          fs.writeFileSync(this.architectureFile, importData.projectFiles.architecture);
          console.log(chalk.green(`✅ Imported architecture documentation`));
        }
      }
      
      // Import sessions (if full export)
      if (importData.sessions && importData.sessions.length > 0) {
        let importedSessions = 0;
        importData.sessions.forEach(sessionData => {
          const newSessionId = crypto.randomBytes(8).toString('hex');
          const session = {
            ...sessionData,
            id: newSessionId,
            imported: true,
            importedAt: new Date().toISOString()
          };
          this.saveSession(session, newSessionId);
          importedSessions++;
        });
        console.log(chalk.green(`✅ Imported ${importedSessions} sessions`));
      }
      
      console.log(chalk.bold.green('\\n🎉 Project import completed successfully!'));
      return true;
      
    } catch (error) {
      console.log(chalk.red(`❌ Import failed: ${error.message}`));
      return false;
    }
  }

  // === Enhanced Document Management Functions ===

  // Create a new document with template
  createDocument(name, content = '', template = null) {
    const timestamp = new Date().toISOString();
    const docPath = path.join(this.documentsDir, `${name}.md`);
    
    let docContent = content;
    if (template) {
      docContent = this.applyTemplate(template, { name, timestamp, content });
    } else if (!content) {
      docContent = `# ${name}\n\nCreated: ${timestamp}\n\n${content}`;
    }
    
    try {
      fs.writeFileSync(docPath, docContent);
      console.log(chalk.green(`✅ Created document: ${name}.md`));
      this.trackFileChange(docPath, 'created');
      return docPath;
    } catch (error) {
      console.log(chalk.red(`❌ Could not create document: ${error.message}`));
      return null;
    }
  }

  // Load document content
  loadDocument(name) {
    const docPath = path.join(this.documentsDir, `${name}.md`);
    try {
      if (fs.existsSync(docPath)) {
        return fs.readFileSync(docPath, 'utf8');
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load document: ${error.message}`));
    }
    return null;
  }

  // Update document content
  updateDocument(name, content, append = false) {
    const docPath = path.join(this.documentsDir, `${name}.md`);
    try {
      let finalContent = content;
      if (append && fs.existsSync(docPath)) {
        const existing = fs.readFileSync(docPath, 'utf8');
        finalContent = existing + '\n\n' + content;
      }
      
      fs.writeFileSync(docPath, finalContent);
      console.log(chalk.green(`✅ Updated document: ${name}.md`));
      this.trackFileChange(docPath, 'modified');
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Could not update document: ${error.message}`));
      return false;
    }
  }

  // List all documents
  listDocuments() {
    try {
      const files = fs.readdirSync(this.documentsDir).filter(f => f.endsWith('.md'));
      return files.map(f => f.replace('.md', ''));
    } catch (error) {
      return [];
    }
  }

  // Create document template
  createTemplate(name, template) {
    const templatePath = path.join(this.templatesDir, `${name}.template`);
    try {
      fs.writeFileSync(templatePath, template);
      console.log(chalk.green(`✅ Created template: ${name}.template`));
      return templatePath;
    } catch (error) {
      console.log(chalk.red(`❌ Could not create template: ${error.message}`));
      return null;
    }
  }

  // Apply template with variables
  applyTemplate(templateName, variables = {}) {
    const templatePath = path.join(this.templatesDir, `${templateName}.template`);
    try {
      if (fs.existsSync(templatePath)) {
        let template = fs.readFileSync(templatePath, 'utf8');
        
        // Replace template variables
        Object.keys(variables).forEach(key => {
          const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
          template = template.replace(regex, variables[key]);
        });
        
        return template;
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not apply template: ${error.message}`));
    }
    return '';
  }

  // === Session Management Functions ===

  // Save current conversation state
  saveSession(sessionData, sessionId = null) {
    const id = sessionId || crypto.randomBytes(8).toString('hex');
    const timestamp = new Date().toISOString();
    const sessionPath = path.join(this.sessionsDir, `session-${id}.json`);
    
    const session = {
      id: id,
      timestamp: timestamp,
      projectContext: this.loadContext(),
      conversationHistory: sessionData.conversationHistory || [],
      todos: this.loadTodos(),
      currentModel: sessionData.model || 'unknown',
      metadata: sessionData.metadata || {},
      ...sessionData
    };
    
    try {
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
      console.log(chalk.green(`✅ Session saved: ${id}`));
      return id;
    } catch (error) {
      console.log(chalk.red(`❌ Could not save session: ${error.message}`));
      return null;
    }
  }

  // Load saved session
  loadSession(sessionId) {
    const sessionPath = path.join(this.sessionsDir, `session-${sessionId}.json`);
    try {
      if (fs.existsSync(sessionPath)) {
        return JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not load session: ${error.message}`));
    }
    return null;
  }

  // List all saved sessions with optional filtering
  listSessions(options = {}) {
    try {
      const files = fs.readdirSync(this.sessionsDir).filter(f => f.startsWith('session-') && f.endsWith('.json'));
      let sessions = files.map(f => {
        const sessionId = f.replace('session-', '').replace('.json', '');
        const sessionPath = path.join(this.sessionsDir, f);
        const stats = fs.statSync(sessionPath);
        
        // Load session data for filtering
        let sessionData = null;
        try {
          sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
        } catch (e) {
          sessionData = {};
        }
        
        return {
          id: sessionId,
          file: f,
          created: stats.birthtime,
          modified: stats.mtime,
          size: stats.size,
          data: sessionData,
          messageCount: sessionData.conversationHistory?.length || 0,
          model: sessionData.currentModel || 'unknown',
          lastActivity: sessionData.metadata?.lastActivity || stats.mtime
        };
      });
      
      // Apply filters
      if (options.search) {
        const searchLower = options.search.toLowerCase();
        sessions = sessions.filter(session => {
          return session.id.toLowerCase().includes(searchLower) ||
                 session.model.toLowerCase().includes(searchLower) ||
                 (session.data.conversationHistory && 
                  session.data.conversationHistory.some(msg => 
                    msg.content && msg.content.toLowerCase().includes(searchLower)
                  ));
        });
      }
      
      if (options.model) {
        sessions = sessions.filter(session => 
          session.model.toLowerCase().includes(options.model.toLowerCase())
        );
      }
      
      if (options.minMessages) {
        sessions = sessions.filter(session => session.messageCount >= options.minMessages);
      }
      
      if (options.dateFrom) {
        const fromDate = new Date(options.dateFrom);
        sessions = sessions.filter(session => new Date(session.created) >= fromDate);
      }
      
      if (options.dateTo) {
        const toDate = new Date(options.dateTo);
        sessions = sessions.filter(session => new Date(session.created) <= toDate);
      }
      
      // Sort sessions
      const sortBy = options.sortBy || 'modified';
      const sortOrder = options.sortOrder || 'desc';
      
      sessions.sort((a, b) => {
        let valueA = a[sortBy];
        let valueB = b[sortBy];
        
        if (sortBy === 'created' || sortBy === 'modified' || sortBy === 'lastActivity') {
          valueA = new Date(valueA);
          valueB = new Date(valueB);
        }
        
        if (sortOrder === 'desc') {
          return valueB > valueA ? 1 : valueB < valueA ? -1 : 0;
        } else {
          return valueA > valueB ? 1 : valueA < valueB ? -1 : 0;
        }
      });
      
      // Apply limit
      if (options.limit) {
        sessions = sessions.slice(0, options.limit);
      }
      
      return sessions;
    } catch (error) {
      return [];
    }
  }

  // Search sessions by content
  searchSessions(query, options = {}) {
    return this.listSessions({ 
      search: query, 
      ...options 
    });
  }

  // === Advanced Search Functions ===

  // Advanced search across all project data
  performAdvancedSearch(query, options = {}) {
    const results = {
      query: query,
      options: options,
      sessions: [],
      documents: [],
      todos: [],
      totalResults: 0
    };
    
    const searchTerms = query.toLowerCase().split(' ').filter(term => term.length > 0);
    
    // Search sessions
    if (options.includeSessions !== false) {
      const sessions = this.listSessions();
      sessions.forEach(session => {
        const relevance = this.calculateSessionRelevance(session, searchTerms, options);
        if (relevance > 0) {
          results.sessions.push({
            ...session,
            relevance: relevance,
            type: 'session'
          });
        }
      });
    }
    
    // Search documents
    if (options.includeDocuments !== false) {
      const documents = this.listDocuments();
      documents.forEach(docName => {
        const content = this.loadDocument(docName);
        if (content) {
          const relevance = this.calculateDocumentRelevance(docName, content, searchTerms, options);
          if (relevance > 0) {
            results.documents.push({
              name: docName,
              content: content,
              relevance: relevance,
              type: 'document',
              preview: this.generateContentPreview(content, searchTerms)
            });
          }
        }
      });
    }
    
    // Search todos
    if (options.includeTodos !== false) {
      const todos = this.loadTodos();
      [...todos.items, ...todos.completed].forEach(todo => {
        const relevance = this.calculateTodoRelevance(todo, searchTerms, options);
        if (relevance > 0) {
          results.todos.push({
            ...todo,
            relevance: relevance,
            type: 'todo',
            status: todos.completed.includes(todo) ? 'completed' : 'pending'
          });
        }
      });
    }
    
    // Sort all results by relevance
    const allResults = [...results.sessions, ...results.documents, ...results.todos];
    allResults.sort((a, b) => b.relevance - a.relevance);
    
    // Apply result limit
    const limit = options.limit || 20;
    const limitedResults = allResults.slice(0, limit);
    
    // Group back into categories
    results.sessions = limitedResults.filter(r => r.type === 'session');
    results.documents = limitedResults.filter(r => r.type === 'document');
    results.todos = limitedResults.filter(r => r.type === 'todo');
    results.totalResults = allResults.length;
    
    return results;
  }

  // Calculate session relevance score
  calculateSessionRelevance(session, searchTerms, options) {
    let score = 0;
    
    // Search in session ID and model
    const sessionText = `${session.id} ${session.model}`.toLowerCase();
    searchTerms.forEach(term => {
      if (sessionText.includes(term)) {
        score += 1;
      }
    });
    
    // Search in conversation history
    if (session.data.conversationHistory) {
      session.data.conversationHistory.forEach(message => {
        if (message.content) {
          const messageText = message.content.toLowerCase();
          searchTerms.forEach(term => {
            const matches = (messageText.match(new RegExp(term, 'g')) || []).length;
            score += matches * 0.5; // Weight conversation content lower than metadata
          });
        }
      });
    }
    
    // Apply filters
    if (options.model && !session.model.toLowerCase().includes(options.model.toLowerCase())) {
      score = 0;
    }
    
    if (options.dateFrom) {
      const sessionDate = new Date(session.created);
      const filterDate = new Date(options.dateFrom);
      if (sessionDate < filterDate) {
        score = 0;
      }
    }
    
    return score;
  }

  // Calculate document relevance score
  calculateDocumentRelevance(docName, content, searchTerms, options) {
    let score = 0;
    
    const nameText = docName.toLowerCase();
    const contentText = content.toLowerCase();
    
    // Search in document name (higher weight)
    searchTerms.forEach(term => {
      if (nameText.includes(term)) {
        score += 3;
      }
    });
    
    // Search in document content
    searchTerms.forEach(term => {
      const matches = (contentText.match(new RegExp(term, 'g')) || []).length;
      score += matches;
    });
    
    return score;
  }

  // Calculate todo relevance score
  calculateTodoRelevance(todo, searchTerms, options) {
    let score = 0;
    
    const todoText = `${todo.text} ${todo.category || ''}`.toLowerCase();
    
    searchTerms.forEach(term => {
      if (todoText.includes(term)) {
        score += 2;
      }
    });
    
    // Apply filters
    if (options.todoStatus) {
      const isCompleted = todo.completed || false;
      if ((options.todoStatus === 'completed' && !isCompleted) ||
          (options.todoStatus === 'pending' && isCompleted)) {
        score = 0;
      }
    }
    
    if (options.todoCategory && todo.category !== options.todoCategory) {
      score = 0;
    }
    
    return score;
  }

  // Generate content preview with highlighted terms
  generateContentPreview(content, searchTerms, maxLength = 200) {
    const lines = content.split('\n');
    let bestLine = '';
    let bestScore = 0;
    
    // Find the line with the most search term matches
    lines.forEach(line => {
      const lineText = line.toLowerCase();
      let lineScore = 0;
      
      searchTerms.forEach(term => {
        if (lineText.includes(term)) {
          lineScore += 1;
        }
      });
      
      if (lineScore > bestScore && line.trim().length > 10) {
        bestScore = lineScore;
        bestLine = line.trim();
      }
    });
    
    // Truncate if too long
    if (bestLine.length > maxLength) {
      bestLine = bestLine.substring(0, maxLength) + '...';
    }
    
    return bestLine || content.substring(0, maxLength) + '...';
  }

  // Show advanced search results
  showSearchResults(results) {
    console.log(chalk.bold.cyan(`🔍 Search Results for: "${results.query}"`));
    console.log(chalk.gray('═'.repeat(50)));
    console.log(chalk.white(`Total results: ${results.totalResults}`));
    console.log();
    
    // Show sessions
    if (results.sessions.length > 0) {
      console.log(chalk.yellow('💬 Sessions:'));
      results.sessions.forEach(session => {
        console.log(chalk.cyan(`  📅 ${session.id}`));
        console.log(chalk.gray(`    Model: ${session.model} | Messages: ${session.messageCount}`));
        console.log(chalk.gray(`    Modified: ${this.getTimeAgo(new Date(session.modified))}`));
        console.log(chalk.gray(`    Relevance: ${session.relevance.toFixed(1)}`));
        console.log();
      });
    }
    
    // Show documents
    if (results.documents.length > 0) {
      console.log(chalk.yellow('📄 Documents:'));
      results.documents.forEach(doc => {
        console.log(chalk.cyan(`  📝 ${doc.name}.md`));
        console.log(chalk.gray(`    Preview: "${doc.preview}"`));
        console.log(chalk.gray(`    Relevance: ${doc.relevance.toFixed(1)}`));
        console.log();
      });
    }
    
    // Show todos
    if (results.todos.length > 0) {
      console.log(chalk.yellow('✅ Todos:'));
      results.todos.forEach(todo => {
        const statusIcon = todo.status === 'completed' ? '✅' : '⏳';
        console.log(chalk.cyan(`  ${statusIcon} ${todo.text}`));
        if (todo.category) {
          console.log(chalk.gray(`    Category: ${todo.category}`));
        }
        console.log(chalk.gray(`    Relevance: ${todo.relevance.toFixed(1)}`));
        console.log();
      });
    }
    
    if (results.totalResults === 0) {
      console.log(chalk.yellow('No results found for your search query.'));
      console.log(chalk.gray('Try different keywords or check your filters.'));
    }
  }

  // Tagged search functionality
  searchByTags(tags, options = {}) {
    const results = {
      tags: tags,
      sessions: [],
      documents: [],
      todos: []
    };
    
    // Note: This is a basic implementation
    // In a full system, we'd want to add proper tagging to sessions, docs, and todos
    console.log(chalk.yellow('🏷️  Tagged search is a planned feature'));
    console.log(chalk.gray('For now, use regular search with tag-like keywords'));
    
    return results;
  }

  // Get session statistics
  getSessionStats() {
    const sessions = this.listSessions();
    
    if (sessions.length === 0) {
      return {
        total: 0,
        totalMessages: 0,
        models: {},
        averageMessages: 0,
        totalSize: 0,
        dateRange: null
      };
    }
    
    const stats = {
      total: sessions.length,
      totalMessages: sessions.reduce((sum, s) => sum + s.messageCount, 0),
      models: {},
      totalSize: sessions.reduce((sum, s) => sum + s.size, 0),
      dateRange: {
        earliest: sessions[sessions.length - 1].created,
        latest: sessions[0].created
      }
    };
    
    // Count models
    sessions.forEach(session => {
      stats.models[session.model] = (stats.models[session.model] || 0) + 1;
    });
    
    stats.averageMessages = Math.round(stats.totalMessages / stats.total);
    
    return stats;
  }

  // Delete old sessions (keep only last N)
  cleanupSessions(keepCount = 10) {
    const sessions = this.listSessions();
    if (sessions.length > keepCount) {
      const toDelete = sessions.slice(keepCount);
      toDelete.forEach(session => {
        const sessionPath = path.join(this.sessionsDir, session.file);
        try {
          fs.unlinkSync(sessionPath);
          console.log(chalk.gray(`🗑️  Cleaned up old session: ${session.id}`));
        } catch (error) {
          console.log(chalk.yellow(`⚠️  Could not delete session: ${error.message}`));
        }
      });
    }
  }

  // === Smart Backup & Rotation Functions ===

  // Auto backup based on activity and schedule
  performSmartBackup(reason = 'scheduled') {
    const context = this.loadContext();
    if (!context) return null;
    
    const backups = this.listBackups();
    const lastBackup = backups.length > 0 ? backups[0] : null;
    const now = new Date();
    
    // Check if backup is needed based on various criteria
    const needsBackup = this.shouldCreateBackup(lastBackup, reason);
    
    if (!needsBackup) {
      console.log(chalk.gray('📦 Backup not needed at this time'));
      return null;
    }
    
    const backupId = this.createBackup(`Auto backup - ${reason}`);
    
    if (backupId) {
      // Perform rotation after successful backup
      this.rotateBackups();
      console.log(chalk.green(`✅ Smart backup completed: ${backupId}`));
    }
    
    return backupId;
  }

  // Determine if a backup should be created
  shouldCreateBackup(lastBackup, reason) {
    const now = new Date();
    
    // Always backup on major events
    if (['major-change', 'pre-import', 'manual'].includes(reason)) {
      return true;
    }
    
    // No previous backup exists
    if (!lastBackup) {
      return true;
    }
    
    const lastBackupTime = new Date(lastBackup.created);
    const hoursSinceLastBackup = (now - lastBackupTime) / (1000 * 60 * 60);
    
    // Backup frequency based on project activity
    const activityLevel = this.getProjectActivityLevel();
    let backupIntervalHours;
    
    switch (activityLevel) {
      case 'high':
        backupIntervalHours = 4; // Every 4 hours for active projects
        break;
      case 'medium':
        backupIntervalHours = 12; // Every 12 hours for moderate activity
        break;
      case 'low':
        backupIntervalHours = 24; // Daily for low activity
        break;
      default:
        backupIntervalHours = 24;
    }
    
    return hoursSinceLastBackup >= backupIntervalHours;
  }

  // Get project activity level based on recent sessions and changes
  getProjectActivityLevel() {
    const sessions = this.listSessions({ limit: 10 });
    const context = this.loadContext();
    
    if (!context) return 'low';
    
    const now = new Date();
    const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    
    // Count recent sessions
    const recentSessions = sessions.filter(session => 
      new Date(session.lastActivity) > lastWeek
    );
    
    // Count recent file changes
    const modifiedFiles = context.files.modified || [];
    const createdFiles = context.files.created || [];
    const totalFileChanges = modifiedFiles.length + createdFiles.length;
    
    // Determine activity level
    if (recentSessions.length >= 5 || totalFileChanges >= 10) {
      return 'high';
    } else if (recentSessions.length >= 2 || totalFileChanges >= 3) {
      return 'medium';
    } else {
      return 'low';
    }
  }

  // Rotate backups based on retention policy
  rotateBackups() {
    const backups = this.listBackups();
    const retentionPolicy = this.getBackupRetentionPolicy();
    
    console.log(chalk.gray(`🔄 Rotating backups (policy: keep ${retentionPolicy.total} total)`));
    
    if (backups.length <= retentionPolicy.total) {
      return; // No rotation needed
    }
    
    // Categorize backups by age
    const now = new Date();
    const categorized = this.categorizeBackupsByAge(backups, now);
    
    // Determine which backups to keep
    const toKeep = this.selectBackupsToKeep(categorized, retentionPolicy);
    const toDelete = backups.filter(backup => !toKeep.includes(backup.id));
    
    // Delete old backups
    toDelete.forEach(backup => {
      this.deleteBackup(backup.id);
    });
    
    if (toDelete.length > 0) {
      console.log(chalk.gray(`🗑️  Rotated ${toDelete.length} old backups`));
    }
  }

  // Get backup retention policy based on project activity
  getBackupRetentionPolicy() {
    const activityLevel = this.getProjectActivityLevel();
    
    switch (activityLevel) {
      case 'high':
        return {
          total: 20,
          recent: 10,    // Keep 10 most recent
          daily: 7,      // Keep 7 daily backups
          weekly: 3      // Keep 3 weekly backups
        };
      case 'medium':
        return {
          total: 15,
          recent: 5,
          daily: 7,
          weekly: 3
        };
      case 'low':
        return {
          total: 10,
          recent: 3,
          daily: 5,
          weekly: 2
        };
      default:
        return {
          total: 10,
          recent: 3,
          daily: 5,
          weekly: 2
        };
    }
  }

  // Categorize backups by age for retention policy
  categorizeBackupsByAge(backups, now) {
    const oneDay = 24 * 60 * 60 * 1000;
    const oneWeek = 7 * oneDay;
    const oneMonth = 30 * oneDay;
    
    return {
      recent: backups.filter(backup => {
        const age = now - new Date(backup.created);
        return age < oneDay;
      }),
      daily: backups.filter(backup => {
        const age = now - new Date(backup.created);
        return age >= oneDay && age < oneWeek;
      }),
      weekly: backups.filter(backup => {
        const age = now - new Date(backup.created);
        return age >= oneWeek && age < oneMonth;
      }),
      monthly: backups.filter(backup => {
        const age = now - new Date(backup.created);
        return age >= oneMonth;
      })
    };
  }

  // Select which backups to keep based on retention policy
  selectBackupsToKeep(categorized, policy) {
    const toKeep = new Set();
    
    // Keep most recent backups
    categorized.recent
      .sort((a, b) => new Date(b.created) - new Date(a.created))
      .slice(0, policy.recent)
      .forEach(backup => toKeep.add(backup.id));
    
    // Keep daily backups (one per day)
    const dailyByDate = {};
    categorized.daily.forEach(backup => {
      const date = new Date(backup.created).toDateString();
      if (!dailyByDate[date] || new Date(backup.created) > new Date(dailyByDate[date].created)) {
        dailyByDate[date] = backup;
      }
    });
    
    Object.values(dailyByDate)
      .sort((a, b) => new Date(b.created) - new Date(a.created))
      .slice(0, policy.daily)
      .forEach(backup => toKeep.add(backup.id));
    
    // Keep weekly backups (one per week)
    const weeklyByWeek = {};
    categorized.weekly.forEach(backup => {
      const weekStart = this.getWeekStart(new Date(backup.created));
      const weekKey = weekStart.toDateString();
      if (!weeklyByWeek[weekKey] || new Date(backup.created) > new Date(weeklyByWeek[weekKey].created)) {
        weeklyByWeek[weekKey] = backup;
      }
    });
    
    Object.values(weeklyByWeek)
      .sort((a, b) => new Date(b.created) - new Date(a.created))
      .slice(0, policy.weekly)
      .forEach(backup => toKeep.add(backup.id));
    
    return Array.from(toKeep);
  }

  // Get the start of the week for a given date
  getWeekStart(date) {
    const day = date.getDay();
    const diff = date.getDate() - day;
    return new Date(date.setDate(diff));
  }

  // Delete a specific backup
  deleteBackup(backupId) {
    try {
      const backupDir = fs.readdirSync(this.backupsDir)
        .find(dir => dir.includes(backupId));
      
      if (backupDir) {
        const backupPath = path.join(this.backupsDir, backupDir);
        fs.rmSync(backupPath, { recursive: true, force: true });
        return true;
      }
    } catch (error) {
      console.log(chalk.yellow(`⚠️  Could not delete backup ${backupId}: ${error.message}`));
    }
    return false;
  }

  // Get backup schedule recommendations
  getBackupScheduleInfo() {
    const activityLevel = this.getProjectActivityLevel();
    const policy = this.getBackupRetentionPolicy();
    const backups = this.listBackups();
    const lastBackup = backups.length > 0 ? backups[0] : null;
    
    const info = {
      activityLevel: activityLevel,
      retentionPolicy: policy,
      currentBackups: backups.length,
      lastBackup: lastBackup ? {
        id: lastBackup.id,
        created: lastBackup.created,
        age: this.getTimeAgo(new Date(lastBackup.created))
      } : null,
      nextBackupRecommended: null
    };
    
    if (lastBackup) {
      const shouldBackup = this.shouldCreateBackup(lastBackup, 'scheduled');
      info.nextBackupRecommended = shouldBackup ? 'now' : 'later';
    } else {
      info.nextBackupRecommended = 'now';
    }
    
    return info;
  }

  // Show backup status and schedule
  showBackupStatus() {
    const info = this.getBackupScheduleInfo();
    
    console.log(chalk.bold.cyan('💾 Backup Status & Schedule'));
    console.log(chalk.gray('═'.repeat(40)));
    
    console.log(chalk.yellow('📊 Current Status:'));
    console.log(chalk.white(`  Activity Level: ${info.activityLevel}`));
    console.log(chalk.white(`  Total Backups: ${info.currentBackups}`));
    console.log(chalk.white(`  Retention Limit: ${info.retentionPolicy.total}`));
    
    if (info.lastBackup) {
      console.log(chalk.white(`  Last Backup: ${info.lastBackup.age} ago`));
      console.log(chalk.white(`  Last Backup ID: ${info.lastBackup.id}`));
    } else {
      console.log(chalk.yellow(`  Last Backup: None`));
    }
    
    console.log();
    console.log(chalk.yellow('⏰ Schedule:'));
    
    let intervalDescription;
    switch (info.activityLevel) {
      case 'high':
        intervalDescription = 'Every 4 hours (high activity)';
        break;
      case 'medium':
        intervalDescription = 'Every 12 hours (medium activity)';
        break;
      case 'low':
        intervalDescription = 'Every 24 hours (low activity)';
        break;
      default:
        intervalDescription = 'As needed';
    }
    
    console.log(chalk.white(`  Backup Frequency: ${intervalDescription}`));
    console.log(chalk.white(`  Retention Policy: ${info.retentionPolicy.recent} recent, ${info.retentionPolicy.daily} daily, ${info.retentionPolicy.weekly} weekly`));
    
    if (info.nextBackupRecommended === 'now') {
      console.log(chalk.green(`  Next Backup: Recommended now`));
      console.log(chalk.gray(`    Run: recoder-code --backup`));
    } else {
      console.log(chalk.gray(`  Next Backup: Scheduled based on activity`));
    }
  }

  // === Backup Functions ===

  // Create backup of project state
  createBackup(description = '') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupId = crypto.randomBytes(4).toString('hex');
    const backupDir = path.join(this.backupsDir, `backup-${timestamp}-${backupId}`);
    
    try {
      fs.mkdirSync(backupDir, { recursive: true });
      
      // Backup main files
      const filesToBackup = [
        this.contextFile,
        this.planFile,
        this.todoFile,
        this.notesFile,
        this.architectureFile,
        this.progressFile
      ];
      
      filesToBackup.forEach(file => {
        if (fs.existsSync(file)) {
          const filename = path.basename(file);
          fs.copyFileSync(file, path.join(backupDir, filename));
        }
      });
      
      // Backup documents directory
      if (fs.existsSync(this.documentsDir)) {
        const docsBackupDir = path.join(backupDir, 'documents');
        fs.mkdirSync(docsBackupDir, { recursive: true });
        const docs = fs.readdirSync(this.documentsDir);
        docs.forEach(doc => {
          fs.copyFileSync(
            path.join(this.documentsDir, doc),
            path.join(docsBackupDir, doc)
          );
        });
      }
      
      // Create backup metadata
      const backupInfo = {
        id: backupId,
        timestamp: timestamp,
        description: description,
        projectName: this.loadContext()?.name || 'unknown',
        files: filesToBackup.filter(f => fs.existsSync(f)).map(f => path.basename(f))
      };
      
      fs.writeFileSync(path.join(backupDir, 'backup-info.json'), JSON.stringify(backupInfo, null, 2));
      
      console.log(chalk.green(`✅ Backup created: ${backupId}`));
      return backupId;
    } catch (error) {
      console.log(chalk.red(`❌ Backup failed: ${error.message}`));
      return null;
    }
  }

  // Restore from backup
  restoreBackup(backupId) {
    const backupDir = fs.readdirSync(this.backupsDir).find(dir => dir.includes(backupId));
    if (!backupDir) {
      console.log(chalk.red(`❌ Backup not found: ${backupId}`));
      return false;
    }
    
    const backupPath = path.join(this.backupsDir, backupDir);
    try {
      // Create current backup before restore
      this.createBackup('Pre-restore backup');
      
      // Restore files
      const files = fs.readdirSync(backupPath);
      files.forEach(file => {
        if (file === 'backup-info.json' || file === 'documents') return;
        
        const sourcePath = path.join(backupPath, file);
        const targetPath = path.join(this.projectDir, file);
        fs.copyFileSync(sourcePath, targetPath);
      });
      
      // Restore documents
      const docsBackupPath = path.join(backupPath, 'documents');
      if (fs.existsSync(docsBackupPath)) {
        if (fs.existsSync(this.documentsDir)) {
          fs.rmSync(this.documentsDir, { recursive: true });
        }
        fs.mkdirSync(this.documentsDir, { recursive: true });
        
        const docs = fs.readdirSync(docsBackupPath);
        docs.forEach(doc => {
          fs.copyFileSync(
            path.join(docsBackupPath, doc),
            path.join(this.documentsDir, doc)
          );
        });
      }
      
      console.log(chalk.green(`✅ Restored from backup: ${backupId}`));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Restore failed: ${error.message}`));
      return false;
    }
  }

  // List available backups
  listBackups() {
    try {
      const backups = fs.readdirSync(this.backupsDir).filter(dir => dir.startsWith('backup-'));
      return backups.map(dir => {
        const backupPath = path.join(this.backupsDir, dir);
        const infoPath = path.join(backupPath, 'backup-info.json');
        
        let info = { id: dir, timestamp: dir };
        if (fs.existsSync(infoPath)) {
          try {
            info = JSON.parse(fs.readFileSync(infoPath, 'utf8'));
          } catch (e) {
            // Use default info
          }
        }
        
        const stats = fs.statSync(backupPath);
        return {
          ...info,
          created: stats.birthtime,
          size: this.getDirSize(backupPath)
        };
      }).sort((a, b) => b.created - a.created);
    } catch (error) {
      return [];
    }
  }

  // Helper function to get directory size
  getDirSize(dirPath) {
    let size = 0;
    try {
      const files = fs.readdirSync(dirPath);
      files.forEach(file => {
        const filePath = path.join(dirPath, file);
        const stats = fs.statSync(filePath);
        if (stats.isFile()) {
          size += stats.size;
        } else if (stats.isDirectory()) {
          size += this.getDirSize(filePath);
        }
      });
    } catch (error) {
      // Ignore errors
    }
    return size;
  }

  // === Enhanced Status and Management ===

  // Get comprehensive project status
  getEnhancedProjectStatus() {
    const basicStatus = this.getProjectStatus();
    
    if (!basicStatus.exists) {
      return basicStatus;
    }
    
    return {
      ...basicStatus,
      documents: {
        count: this.listDocuments().length,
        list: this.listDocuments()
      },
      sessions: {
        count: this.listSessions().length,
        recent: this.listSessions().slice(0, 5)
      },
      backups: {
        count: this.listBackups().length,
        latest: this.listBackups()[0] || null
      },
      storage: {
        projectSize: this.getDirSize(this.projectDir),
        documentsSize: fs.existsSync(this.documentsDir) ? this.getDirSize(this.documentsDir) : 0,
        sessionsSize: fs.existsSync(this.sessionsDir) ? this.getDirSize(this.sessionsDir) : 0,
        backupsSize: fs.existsSync(this.backupsDir) ? this.getDirSize(this.backupsDir) : 0
      }
    };
  }

  // Enhanced project summary
  showEnhancedProjectSummary() {
    const status = this.getEnhancedProjectStatus();
    
    if (!status.exists) {
      console.log(chalk.yellow('📂 No Recoder project found in current directory'));
      console.log(chalk.gray('   Run: recoder-code --init to initialize a project'));
      return;
    }
    
    const context = status.context;
    console.log(chalk.bold.cyan(`📂 Project: ${context.name}`));
    console.log(chalk.gray('═'.repeat(50)));
    console.log(chalk.white(`Description: ${context.description}`));
    console.log(chalk.white(`Type: ${context.type}`));
    console.log(chalk.white(`Created: ${new Date(context.created).toLocaleDateString()}`));
    console.log(chalk.white(`Last Updated: ${new Date(context.lastUpdated).toLocaleDateString()}`));
    console.log();
    
    console.log(chalk.bold.yellow('📋 Tasks:'));
    console.log(chalk.white(`  Pending: ${status.todos.pending}`));
    console.log(chalk.white(`  Completed: ${status.todos.completed}`));
    console.log(chalk.white(`  Total: ${status.todos.total}`));
    console.log();
    
    console.log(chalk.bold.green('📄 Documentation:'));
    console.log(chalk.white(`  Project Plan: ${status.files.plan ? '✅' : '❌'}`));
    console.log(chalk.white(`  Architecture: ${status.files.architecture ? '✅' : '❌'}`));
    console.log(chalk.white(`  Notes: ${status.files.notes ? '✅' : '❌'}`));
    console.log(chalk.white(`  Custom Documents: ${status.documents.count}`));
    console.log();
    
    console.log(chalk.bold.blue('💾 Sessions & Data:'));
    console.log(chalk.white(`  Saved Sessions: ${status.sessions.count}`));
    console.log(chalk.white(`  Backups: ${status.backups.count}`));
    console.log(chalk.white(`  Project Size: ${this.formatBytes(status.storage.projectSize)}`));
    
    if (status.sessions.recent.length > 0) {
      console.log();
      console.log(chalk.bold.magenta('🕒 Recent Sessions:'));
      status.sessions.recent.forEach(session => {
        console.log(chalk.white(`  ${session.id} - ${new Date(session.modified).toLocaleString()}`));
      });
    }
  }

  // Format bytes for display
  formatBytes(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  }

  // === Workspace Management ===

  // Get the global workspaces directory
  getWorkspacesDir() {
    const homeDir = process.env.HOME || process.env.USERPROFILE || process.cwd();
    return path.join(homeDir, '.recoder-workspaces');
  }

  // Initialize workspaces directory
  ensureWorkspacesDir() {
    const workspacesDir = this.getWorkspacesDir();
    if (!fs.existsSync(workspacesDir)) {
      fs.mkdirSync(workspacesDir, { recursive: true });
    }
    return workspacesDir;
  }

  // Register current project as a workspace
  registerWorkspace(alias = null) {
    const context = this.loadContext();
    if (!context) {
      console.log(chalk.red('❌ No project context found. Initialize project first with --init'));
      return false;
    }

    const workspacesDir = this.ensureWorkspacesDir();
    const workspacesFile = path.join(workspacesDir, 'workspaces.json');
    
    let workspaces = {};
    if (fs.existsSync(workspacesFile)) {
      try {
        workspaces = JSON.parse(fs.readFileSync(workspacesFile, 'utf8'));
      } catch (error) {
        workspaces = {};
      }
    }

    const workspaceId = alias || context.name.toLowerCase().replace(/[^a-z0-9]/g, '-');
    const currentDir = process.cwd();
    
    workspaces[workspaceId] = {
      name: context.name,
      path: currentDir,
      type: context.type,
      created: context.created,
      lastAccessed: new Date().toISOString(),
      id: context.id,
      alias: alias
    };

    try {
      fs.writeFileSync(workspacesFile, JSON.stringify(workspaces, null, 2));
      console.log(chalk.green(`✅ Workspace registered: ${workspaceId}`));
      console.log(chalk.gray(`   Path: ${currentDir}`));
      console.log(chalk.gray(`   Use: recoder-code --workspace ${workspaceId}`));
      return true;
    } catch (error) {
      console.log(chalk.red(`❌ Failed to register workspace: ${error.message}`));
      return false;
    }
  }

  // List all registered workspaces
  listWorkspaces() {
    const workspacesDir = this.getWorkspacesDir();
    const workspacesFile = path.join(workspacesDir, 'workspaces.json');
    
    if (!fs.existsSync(workspacesFile)) {
      return {};
    }

    try {
      return JSON.parse(fs.readFileSync(workspacesFile, 'utf8'));
    } catch (error) {
      return {};
    }
  }

  // Switch to a workspace
  switchToWorkspace(workspaceId) {
    const workspaces = this.listWorkspaces();
    
    if (!workspaces[workspaceId]) {
      console.log(chalk.red(`❌ Workspace not found: ${workspaceId}`));
      console.log(chalk.gray('Available workspaces:'));
      Object.keys(workspaces).forEach(id => {
        console.log(chalk.gray(`  ${id} - ${workspaces[id].name}`));
      });
      return false;
    }

    const workspace = workspaces[workspaceId];
    
    // Check if workspace path still exists
    if (!fs.existsSync(workspace.path)) {
      console.log(chalk.red(`❌ Workspace path no longer exists: ${workspace.path}`));
      return false;
    }

    // Update last accessed time
    workspace.lastAccessed = new Date().toISOString();
    const workspacesFile = path.join(this.getWorkspacesDir(), 'workspaces.json');
    fs.writeFileSync(workspacesFile, JSON.stringify(workspaces, null, 2));

    console.log(chalk.cyan(`🔄 Switching to workspace: ${workspace.name}`));
    console.log(chalk.gray(`   Path: ${workspace.path}`));
    console.log(chalk.gray(`   Type: ${workspace.type}`));
    console.log(chalk.yellow(`\n💡 Change directory to: cd "${workspace.path}"`));
    console.log(chalk.gray('   Then run recoder-code to work in this workspace'));
    
    return workspace;
  }

  // Remove workspace registration
  unregisterWorkspace(workspaceId) {
    const workspaces = this.listWorkspaces();
    
    if (!workspaces[workspaceId]) {
      console.log(chalk.red(`❌ Workspace not found: ${workspaceId}`));
      return false;
    }

    delete workspaces[workspaceId];
    
    const workspacesFile = path.join(this.getWorkspacesDir(), 'workspaces.json');
    fs.writeFileSync(workspacesFile, JSON.stringify(workspaces, null, 2));
    
    console.log(chalk.green(`✅ Workspace unregistered: ${workspaceId}`));
    return true;
  }

  // Show workspace status
  showWorkspaces() {
    const workspaces = this.listWorkspaces();
    const currentDir = process.cwd();
    
    if (Object.keys(workspaces).length === 0) {
      console.log(chalk.yellow('📂 No workspaces registered'));
      console.log(chalk.gray('   Use --register-workspace to add current project'));
      return;
    }

    console.log(chalk.bold.cyan('🗂️  Registered Workspaces'));
    console.log(chalk.gray('═'.repeat(50)));
    
    Object.entries(workspaces).forEach(([id, workspace]) => {
      const isCurrent = workspace.path === currentDir;
      const marker = isCurrent ? chalk.green('● ') : chalk.gray('○ ');
      const lastAccessed = new Date(workspace.lastAccessed);
      const timeAgo = this.getTimeAgo(lastAccessed);
      
      console.log(`${marker}${chalk.cyan(id)} - ${chalk.white(workspace.name)}`);
      console.log(chalk.gray(`    ${workspace.path}`));
      console.log(chalk.gray(`    Type: ${workspace.type} | Last accessed: ${timeAgo}`));
      console.log();
    });
    
    console.log(chalk.gray('Commands:'));
    console.log(chalk.gray('  --workspace <id>         Switch to workspace'));
    console.log(chalk.gray('  --register-workspace     Register current project'));
    console.log(chalk.gray('  --unregister <id>        Remove workspace'));
  }

  // Get time ago helper (duplicate but needed here)
  getTimeAgo(date) {
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);
    
    if (seconds < 60) return 'just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  // === Collaborative Sharing Functions ===

  // Sanitize conversation history for sharing
  sanitizeConversationForSharing(conversationHistory, sharingOptions) {
    const sensitivePatterns = [
      /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}/g, // Email addresses
      /(?:api_key|password|secret|token|auth)[\s=:]+[\w\-]+/gi, // API keys and secrets
      /(?:localhost|127\.0\.0\.1|192\.168\.|10\.0\.)/g, // Local/private IPs
      /\/Users\/[^\/\s]+|C:\\Users\\[^\\\s]+/g, // User home directories
    ];
    
    return conversationHistory.map(message => {
      if (message.role === 'user' || message.role === 'assistant') {
        let content = message.content;
        
        // Remove sensitive information
        if (sharingOptions.removeSensitive !== false) {
          sensitivePatterns.forEach(pattern => {
            content = content.replace(pattern, '[REDACTED]');
          });
        }
        
        // Limit message length if specified
        if (sharingOptions.maxMessageLength) {
          content = content.length > sharingOptions.maxMessageLength ? 
            content.substring(0, sharingOptions.maxMessageLength) + '...[TRUNCATED]' : 
            content;
        }
        
        return {
          ...message,
          content: content
        };
      }
      
      return message;
    });
  }

  // Create a shareable export with guided privacy settings
  createShareableExport(options = {}) {
    const shareOptions = {
      sharing: true,
      purpose: options.purpose || 'team-collaboration',
      includeConversations: options.includeConversations !== false,
      removeSensitive: options.removeSensitive !== false,
      maxMessageLength: options.maxMessageLength || 500,
      includePersonalInfo: options.includePersonalInfo || false
    };
    
    // Create special filename for shared exports
    const timestamp = new Date().toISOString().split('T')[0];
    const context = this.loadContext();
    const projectName = context ? context.name.toLowerCase().replace(/[^a-z0-9]/g, '-') : 'project';
    const shareFilename = `${projectName}-shared-${timestamp}.json`;
    
    console.log(chalk.cyan('📤 Creating shareable export...'));
    console.log(chalk.gray(`   Applying privacy filters`));
    console.log(chalk.gray(`   Max message length: ${shareOptions.maxMessageLength} chars`));
    console.log(chalk.gray(`   Remove sensitive data: ${shareOptions.removeSensitive ? 'Yes' : 'No'}`));
    
    const exportPath = this.exportProject(shareFilename, true, shareOptions);
    
    if (exportPath) {
      console.log(chalk.green('\\n✅ Shareable export created!'));
      console.log(chalk.yellow('📋 Sharing Instructions:'));
      console.log(chalk.gray(`   1. Share the file: ${exportPath}`));
      console.log(chalk.gray(`   2. Recipient can import with: recoder-code --import ${exportPath}`));
      console.log(chalk.gray(`   3. They'll get project structure, docs, and sanitized sessions`));
      
      // Generate sharing summary
      this.generateSharingSummary(shareOptions);
    }
    
    return exportPath;
  }

  // Generate a summary of what's included in the shared export
  generateSharingSummary(shareOptions) {
    console.log(chalk.cyan('\\n📊 Sharing Summary:'));
    console.log(chalk.green('  ✅ Included:'));
    console.log(chalk.white('    • Project structure and metadata'));
    console.log(chalk.white('    • Todo lists and progress tracking'));
    console.log(chalk.white('    • Custom documents and templates'));
    console.log(chalk.white('    • Project plan and architecture docs'));
    
    if (shareOptions.includeConversations) {
      console.log(chalk.white('    • Recent conversation sessions (sanitized)'));
    }
    
    console.log(chalk.red('\\n  ❌ Privacy Protected (Removed/Redacted):'));
    console.log(chalk.gray('    • Email addresses and personal info'));
    console.log(chalk.gray('    • API keys, passwords, and tokens'));
    console.log(chalk.gray('    • Local file paths and IP addresses'));
    console.log(chalk.gray('    • Long messages (truncated for privacy)'));
    
    if (!shareOptions.includePersonalInfo) {
      console.log(chalk.gray('    • Personal system information'));
    }
  }

  // Import shared project with collaboration setup
  importSharedProject(importPath, collaboratorName = null) {
    console.log(chalk.cyan('👥 Importing shared project...'));
    
    // Import with special handling for shared projects
    const success = this.importProject(importPath, { 
      overwrite: false, 
      selectiveImport: false,
      isSharedImport: true 
    });
    
    if (success && collaboratorName) {
      // Add collaborator information to project context
      const context = this.loadContext();
      if (context) {
        if (!context.collaborators) {
          context.collaborators = [];
        }
        
        const existingCollaborator = context.collaborators.find(c => c.name === collaboratorName);
        if (!existingCollaborator) {
          context.collaborators.push({
            name: collaboratorName,
            role: 'collaborator',
            joinedAt: new Date().toISOString(),
            importedFrom: importPath
          });
          
          this.saveContext(context);
          console.log(chalk.green(`✅ Added collaborator: ${collaboratorName}`));
        }
      }
    }
    
    return success;
  }

  // === Smart Session Management ===

  // Get the most recent active session that could be resumed
  getResumeCandidate() {
    const sessions = this.listSessions({ limit: 5 });
    
    if (sessions.length === 0) return null;
    
    // Find the most recent session that was active today or yesterday
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24 * 60 * 60 * 1000);
    
    for (const session of sessions) {
      const lastActivity = new Date(session.lastActivity);
      
      // Skip if session is too old (more than 24 hours)
      if (lastActivity < yesterday) continue;
      
      // Skip if session has very few messages (likely not productive)
      if (session.messageCount < 3) continue;
      
      // This is a good candidate for resuming
      return {
        ...session,
        activityDescription: this.getTimeAgo(lastActivity),
        lastUserMessage: this.getLastUserMessage(session.data)
      };
    }
    
    return null;
  }

  // Get the last user message from session data for preview
  getLastUserMessage(sessionData) {
    if (!sessionData.conversationHistory || sessionData.conversationHistory.length === 0) {
      return null;
    }
    
    // Find last user message
    const lastUserMsg = [...sessionData.conversationHistory]
      .reverse()
      .find(msg => msg.role === 'user');
      
    if (!lastUserMsg) return null;
    
    // Create preview (first 80 characters)
    const preview = lastUserMsg.content.length > 80 ? 
      lastUserMsg.content.substring(0, 80) + '...' : 
      lastUserMsg.content;
      
    return preview;
  }

  // Check if auto-resume should be offered
  shouldOfferAutoResume() {
    const candidate = this.getResumeCandidate();
    if (!candidate) return null;
    
    // Don't offer if the session was just created (less than 10 minutes of activity)
    const sessionStart = new Date(candidate.created);
    const sessionEnd = new Date(candidate.lastActivity);
    const sessionDuration = sessionEnd - sessionStart;
    
    if (sessionDuration < 10 * 60 * 1000) return null; // Less than 10 minutes
    
    return candidate;
  }

  // === Project Analytics and Insights ===

  // Generate project analytics report
  generateAnalytics() {
    const context = this.loadContext();
    const todos = this.loadTodos();
    const sessions = this.listSessions();
    const sessionStats = this.getSessionStats();
    const documents = this.listDocuments();
    const backups = this.listBackups();
    
    if (!context) {
      return {
        error: 'No project context found'
      };
    }
    
    // Calculate project age
    const projectAge = new Date() - new Date(context.created);
    const projectAgeDays = Math.floor(projectAge / (1000 * 60 * 60 * 24));
    
    // Activity metrics
    const lastActivity = sessions.length > 0 ? 
      new Date(sessions[0].lastActivity) : 
      new Date(context.lastUpdated);
    const daysSinceActivity = Math.floor((new Date() - lastActivity) / (1000 * 60 * 60 * 24));
    
    // Todo completion rate
    const totalTodos = todos.items.length + todos.completed.length;
    const completionRate = totalTodos > 0 ? 
      Math.round((todos.completed.length / totalTodos) * 100) : 0;
    
    // Session productivity metrics
    const averageSessionLength = sessionStats.total > 0 ? 
      Math.round(sessionStats.totalMessages / sessionStats.total) : 0;
    
    // File activity tracking
    const modifiedFiles = context.files.modified || [];
    const createdFiles = context.files.created || [];
    
    const analytics = {
      project: {
        name: context.name,
        type: context.type,
        age: {
          days: projectAgeDays,
          description: this.getAgeDescription(projectAgeDays)
        },
        lastActivity: {
          days: daysSinceActivity,
          description: this.getActivityDescription(daysSinceActivity)
        }
      },
      productivity: {
        todos: {
          total: totalTodos,
          completed: todos.completed.length,
          pending: todos.items.length,
          completionRate: completionRate,
          status: this.getProductivityStatus(completionRate)
        },
        sessions: {
          total: sessionStats.total,
          averageLength: averageSessionLength,
          totalMessages: sessionStats.totalMessages,
          modelsUsed: Object.keys(sessionStats.models).length,
          mostUsedModel: this.getMostUsedModel(sessionStats.models)
        },
        files: {
          created: createdFiles.length,
          modified: modifiedFiles.length,
          documents: documents.length
        }
      },
      insights: this.generateInsights(sessionStats, todos, projectAgeDays, daysSinceActivity),
      storage: {
        projectSize: this.getDirSize(this.projectDir),
        sessionsSize: this.getDirSize(this.sessionsDir),
        documentsSize: fs.existsSync(this.documentsDir) ? this.getDirSize(this.documentsDir) : 0,
        backupsCount: backups.length
      }
    };
    
    return analytics;
  }
  
  getAgeDescription(days) {
    if (days < 1) return 'New project';
    if (days < 7) return 'Fresh start';
    if (days < 30) return 'Getting started';
    if (days < 90) return 'Developing';
    if (days < 365) return 'Maturing';
    return 'Established';
  }
  
  getActivityDescription(daysSince) {
    if (daysSince === 0) return 'Active today';
    if (daysSince === 1) return 'Yesterday';
    if (daysSince < 7) return `${daysSince} days ago`;
    if (daysSince < 30) return `${Math.floor(daysSince / 7)} weeks ago`;
    if (daysSince < 365) return `${Math.floor(daysSince / 30)} months ago`;
    return 'Long dormant';
  }
  
  getProductivityStatus(completionRate) {
    if (completionRate >= 80) return 'Highly productive';
    if (completionRate >= 60) return 'Good progress';
    if (completionRate >= 40) return 'Steady progress';
    if (completionRate >= 20) return 'Getting started';
    return 'Early stage';
  }
  
  getMostUsedModel(models) {
    if (Object.keys(models).length === 0) return 'None';
    
    return Object.entries(models)
      .sort((a, b) => b[1] - a[1])
      .map(([model, count]) => `${model} (${count}x)`)[0];
  }
  
  generateInsights(sessionStats, todos, projectAge, daysSinceActivity) {
    const insights = [];
    
    // Activity insights
    if (daysSinceActivity === 0) {
      insights.push({
        type: 'activity',
        icon: '🔥',
        message: 'Project is actively being worked on today'
      });
    } else if (daysSinceActivity > 7) {
      insights.push({
        type: 'activity',
        icon: '⏰',
        message: `Project has been inactive for ${daysSinceActivity} days. Consider resuming work or archiving.`
      });
    }
    
    // Productivity insights
    const totalTodos = todos.items.length + todos.completed.length;
    if (totalTodos > 0) {
      const completionRate = Math.round((todos.completed.length / totalTodos) * 100);
      if (completionRate >= 80) {
        insights.push({
          type: 'productivity',
          icon: '🎯',
          message: `Excellent progress! ${completionRate}% of todos completed.`
        });
      } else if (todos.items.length > 10) {
        insights.push({
          type: 'productivity',
          icon: '📝',
          message: `Consider breaking down ${todos.items.length} pending todos into smaller tasks.`
        });
      }
    }
    
    // Session insights
    if (sessionStats.total > 0) {
      if (sessionStats.averageMessages > 20) {
        insights.push({
          type: 'sessions',
          icon: '💬',
          message: 'High engagement sessions! You\'re having detailed conversations with the AI.'
        });
      }
      
      if (Object.keys(sessionStats.models).length > 3) {
        insights.push({
          type: 'sessions',
          icon: '🤖',
          message: `You've experimented with ${Object.keys(sessionStats.models).length} different models.`
        });
      }
    }
    
    // Storage insights
    const projectSizeMB = this.getDirSize(this.projectDir) / 1024 / 1024;
    if (projectSizeMB > 10) {
      insights.push({
        type: 'storage',
        icon: '💾',
        message: `Project data is ${this.formatBytes(this.getDirSize(this.projectDir))}. Consider cleanup if needed.`
      });
    }
    
    // Growth insights
    if (projectAge < 7 && sessionStats.total > 5) {
      insights.push({
        type: 'growth',
        icon: '🚀',
        message: 'Fast start! Lots of activity in a new project.'
      });
    }
    
    return insights;
  }
  
  // Display analytics report
  showAnalytics() {
    const analytics = this.generateAnalytics();
    
    if (analytics.error) {
      console.log(chalk.red(`❌ ${analytics.error}`));
      return;
    }
    
    console.log(chalk.bold.cyan('📊 Project Analytics'));
    console.log(chalk.gray('═'.repeat(50)));
    
    // Project overview
    console.log(chalk.yellow('📂 Project Overview'));
    console.log(chalk.white(`  Name: ${analytics.project.name}`));
    console.log(chalk.white(`  Type: ${analytics.project.type}`));
    console.log(chalk.white(`  Age: ${analytics.project.age.days} days (${analytics.project.age.description})`));
    console.log(chalk.white(`  Last Activity: ${analytics.project.lastActivity.description}`));
    console.log();
    
    // Productivity metrics
    console.log(chalk.yellow('⚡ Productivity'));
    console.log(chalk.white(`  Todo Completion: ${analytics.productivity.todos.completionRate}% (${analytics.productivity.todos.status})`));
    console.log(chalk.white(`  Todos: ${analytics.productivity.todos.completed}/${analytics.productivity.todos.total} completed`));
    console.log(chalk.white(`  Sessions: ${analytics.productivity.sessions.total} total`));
    console.log(chalk.white(`  Messages: ${analytics.productivity.sessions.totalMessages.toLocaleString()} total`));
    console.log(chalk.white(`  Average Session: ${analytics.productivity.sessions.averageLength} messages`));
    console.log(chalk.white(`  Files: ${analytics.productivity.files.created} created, ${analytics.productivity.files.modified} modified`));
    console.log();
    
    // Storage information
    console.log(chalk.yellow('💾 Storage'));
    console.log(chalk.white(`  Project Size: ${this.formatBytes(analytics.storage.projectSize)}`));
    console.log(chalk.white(`  Sessions: ${this.formatBytes(analytics.storage.sessionsSize)}`));
    console.log(chalk.white(`  Documents: ${this.formatBytes(analytics.storage.documentsSize)}`));
    console.log(chalk.white(`  Backups: ${analytics.storage.backupsCount} available`));
    console.log();
    
    // Insights
    if (analytics.insights.length > 0) {
      console.log(chalk.yellow('💡 Insights'));
      analytics.insights.forEach(insight => {
        console.log(chalk.white(`  ${insight.icon} ${insight.message}`));
      });
      console.log();
    }
    
    // Model usage
    if (analytics.productivity.sessions.total > 0) {
      console.log(chalk.yellow('🤖 AI Models'));
      console.log(chalk.white(`  Most Used: ${analytics.productivity.sessions.mostUsedModel}`));
      console.log(chalk.white(`  Models Tried: ${analytics.productivity.sessions.modelsUsed}`));
    }
  }
}

module.exports = ProjectManager;