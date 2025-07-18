const { logger } = require('../utils/logger');
const { integrationService } = require('./integrationService');
const { validationService } = require('./validationService');

class CodeService {
  async generateFromStructure(structure, options = {}) {
    try {
      const { projectType, projectConfig, language, framework } = options;
      
      const generatedFiles = [];
      let totalLines = 0;

      // Generate files based on structure
      for (const component of structure.components || []) {
        const file = await this.generateComponent(component, {
          projectType,
          projectConfig,
          language,
          framework
        });
        
        generatedFiles.push(file);
        totalLines += file.lines || 0;
      }

      // Generate configuration files
      const configFiles = await this.generateConfigFiles(projectType, projectConfig);
      generatedFiles.push(...configFiles);

      // Generate package files
      const packageFiles = await this.generatePackageFiles(projectType, projectConfig);
      generatedFiles.push(...packageFiles);

      logger.info(`Code generated: ${generatedFiles.length} files, ${totalLines} lines`);
      
      return {
        files: generatedFiles,
        totalLines,
        structure,
        metadata: {
          projectType,
          language,
          framework,
          generatedAt: new Date()
        }
      };
    } catch (error) {
      logger.error('Failed to generate code from structure:', error);
      throw error;
    }
  }

  async generateComponent(component, options) {
    try {
      const { projectType, language, framework } = options;
      
      // Use AI integration to generate component code
      const aiResult = await integrationService.generateCode({
        model: 'gpt-4',
        prompt: `Generate ${component.type} component named ${component.name} for ${projectType} project`,
        language,
        framework,
        context: {
          component,
          requirements: component.requirements || []
        }
      });

      return {
        name: component.name,
        type: component.type,
        path: component.path,
        content: aiResult.code,
        language,
        lines: aiResult.code ? aiResult.code.split('\n').length : 0,
        dependencies: aiResult.dependencies || []
      };
    } catch (error) {
      logger.error('Failed to generate component:', error);
      throw error;
    }
  }

  async generateConfigFiles(projectType, projectConfig) {
    try {
      const configFiles = [];

      // Generate package.json for Node.js projects
      if (projectType === 'web' || projectType === 'api') {
        const packageJson = await this.generatePackageJson(projectConfig);
        configFiles.push(packageJson);
      }

      // Generate Docker files
      if (projectConfig.deployment?.docker) {
        const dockerfile = await this.generateDockerfile(projectType, projectConfig);
        configFiles.push(dockerfile);
      }

      // Generate CI/CD files
      if (projectConfig.cicd) {
        const cicdFiles = await this.generateCICDFiles(projectConfig.cicd);
        configFiles.push(...cicdFiles);
      }

      return configFiles;
    } catch (error) {
      logger.error('Failed to generate config files:', error);
      throw error;
    }
  }

  async generatePackageFiles(projectType, projectConfig) {
    try {
      const packageFiles = [];

      // Generate README
      const readme = await this.generateReadme(projectType, projectConfig);
      packageFiles.push(readme);

      // Generate .gitignore
      const gitignore = await this.generateGitignore(projectType);
      packageFiles.push(gitignore);

      // Generate environment files
      const envFiles = await this.generateEnvironmentFiles(projectConfig);
      packageFiles.push(...envFiles);

      return packageFiles;
    } catch (error) {
      logger.error('Failed to generate package files:', error);
      throw error;
    }
  }

  async generateProject(project, options = {}) {
    try {
      const structure = project.structure || await this.generateDefaultStructure(project.type);
      
      return await this.generateFromStructure(structure, {
        projectType: project.type,
        projectConfig: project.config,
        ...options
      });
    } catch (error) {
      logger.error('Failed to generate project:', error);
      throw error;
    }
  }

  async generateDefaultStructure(projectType) {
    const structures = {
      web: {
        components: [
          { name: 'App', type: 'component', path: 'src/App.js' },
          { name: 'Header', type: 'component', path: 'src/components/Header.js' },
          { name: 'Footer', type: 'component', path: 'src/components/Footer.js' }
        ]
      },
      api: {
        components: [
          { name: 'server', type: 'main', path: 'src/server.js' },
          { name: 'routes', type: 'routes', path: 'src/routes/index.js' },
          { name: 'middleware', type: 'middleware', path: 'src/middleware/index.js' }
        ]
      },
      mobile: {
        components: [
          { name: 'App', type: 'component', path: 'src/App.tsx' },
          { name: 'Home', type: 'screen', path: 'src/screens/Home.tsx' },
          { name: 'Navigation', type: 'navigation', path: 'src/navigation/index.tsx' }
        ]
      }
    };

    return structures[projectType] || structures.web;
  }

  async generatePackageJson(projectConfig) {
    const packageJson = {
      name: projectConfig.name || 'my-project',
      version: '1.0.0',
      description: projectConfig.description || '',
      main: 'src/index.js',
      scripts: {
        start: 'node src/index.js',
        dev: 'nodemon src/index.js',
        test: 'jest',
        build: 'webpack --mode production'
      },
      dependencies: projectConfig.dependencies || {},
      devDependencies: projectConfig.devDependencies || {}
    };

    return {
      name: 'package.json',
      type: 'config',
      path: 'package.json',
      content: JSON.stringify(packageJson, null, 2),
      language: 'json'
    };
  }

  async generateDockerfile(projectType, projectConfig) {
    const dockerConfigs = {
      web: `FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000
CMD ["npm", "start"]`,
      api: `FROM node:16-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 8000
CMD ["npm", "start"]`
    };

    return {
      name: 'Dockerfile',
      type: 'config',
      path: 'Dockerfile',
      content: dockerConfigs[projectType] || dockerConfigs.web,
      language: 'dockerfile'
    };
  }

  async generateReadme(projectType, projectConfig) {
    const readme = `# ${projectConfig.name || 'My Project'}

${projectConfig.description || 'A project generated by Craft Code'}

## Getting Started

### Prerequisites
- Node.js 16 or higher
- npm or yarn

### Installation
\`\`\`bash
npm install
\`\`\`

### Development
\`\`\`bash
npm run dev
\`\`\`

### Production
\`\`\`bash
npm run build
npm start
\`\`\`

## License
MIT
`;

    return {
      name: 'README.md',
      type: 'documentation',
      path: 'README.md',
      content: readme,
      language: 'markdown'
    };
  }

  async generateGitignore(projectType) {
    const gitignoreContent = `node_modules/
dist/
build/
.env
.env.local
.DS_Store
*.log
coverage/
.nyc_output/
.vscode/
.idea/
`;

    return {
      name: '.gitignore',
      type: 'config',
      path: '.gitignore',
      content: gitignoreContent,
      language: 'gitignore'
    };
  }

  async generateEnvironmentFiles(projectConfig) {
    const envExample = `# Environment Variables
NODE_ENV=development
PORT=3000
DATABASE_URL=your_database_url
JWT_SECRET=your_jwt_secret
`;

    return [
      {
        name: '.env.example',
        type: 'config',
        path: '.env.example',
        content: envExample,
        language: 'env'
      }
    ];
  }

  async generateCICDFiles(cicdConfig) {
    const files = [];

    if (cicdConfig.github) {
      const workflow = `name: CI/CD Pipeline

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - name: Setup Node.js
        uses: actions/setup-node@v2
        with:
          node-version: '16'
      - name: Install dependencies
        run: npm ci
      - name: Run tests
        run: npm test

  deploy:
    needs: test
    runs-on: ubuntu-latest
    if: github.ref == 'refs/heads/main'
    steps:
      - uses: actions/checkout@v2
      - name: Deploy
        run: echo "Deploy step"
`;

      files.push({
        name: 'ci.yml',
        type: 'config',
        path: '.github/workflows/ci.yml',
        content: workflow,
        language: 'yaml'
      });
    }

    return files;
  }
}

module.exports = { codeService: new CodeService() };