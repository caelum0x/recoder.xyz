const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting database seeding...');

  // Create admin user
  const hashedPassword = await bcrypt.hash('admin123', 12);
  const adminUser = await prisma.user.upsert({
    where: { email: 'admin@craftcode.com' },
    update: {},
    create: {
      email: 'admin@craftcode.com',
      password: hashedPassword,
      name: 'Admin User',
      role: 'admin',
      isActive: true,
      emailVerified: true,
      subscription: 'enterprise'
    }
  });

  console.log('✅ Created admin user:', adminUser.email);

  // Create demo user
  const demoHashedPassword = await bcrypt.hash('demo123', 12);
  const demoUser = await prisma.user.upsert({
    where: { email: 'demo@craftcode.com' },
    update: {},
    create: {
      email: 'demo@craftcode.com',
      password: demoHashedPassword,
      name: 'Demo User',
      role: 'user',
      isActive: true,
      emailVerified: true,
      subscription: 'pro'
    }
  });

  console.log('✅ Created demo user:', demoUser.email);

  // Create sample templates
  const webTemplate = await prisma.template.upsert({
    where: { id: 'web-template-1' },
    update: {},
    create: {
      id: 'web-template-1',
      name: 'React Web Application',
      category: 'web',
      description: 'A modern React web application with TypeScript, routing, and state management',
      structure: {
        type: 'web',
        framework: 'react',
        language: 'typescript',
        components: [
          {
            name: 'App',
            type: 'component',
            path: 'src/App.tsx',
            dependencies: ['react', 'react-router-dom']
          },
          {
            name: 'Header',
            type: 'component',
            path: 'src/components/Header.tsx',
            dependencies: ['react']
          },
          {
            name: 'Footer',
            type: 'component',
            path: 'src/components/Footer.tsx',
            dependencies: ['react']
          },
          {
            name: 'Home',
            type: 'page',
            path: 'src/pages/Home.tsx',
            dependencies: ['react']
          }
        ],
        dependencies: {
          react: '^18.2.0',
          'react-dom': '^18.2.0',
          'react-router-dom': '^6.8.0',
          typescript: '^4.9.4'
        }
      },
      config: {
        buildTool: 'vite',
        testing: 'vitest',
        styling: 'tailwind'
      },
      public: true,
      userId: adminUser.id
    }
  });

  const apiTemplate = await prisma.template.upsert({
    where: { id: 'api-template-1' },
    update: {},
    create: {
      id: 'api-template-1',
      name: 'Node.js REST API',
      category: 'api',
      description: 'A RESTful API built with Node.js, Express, and TypeScript',
      structure: {
        type: 'api',
        framework: 'express',
        language: 'typescript',
        components: [
          {
            name: 'server',
            type: 'main',
            path: 'src/server.ts',
            dependencies: ['express', 'cors', 'helmet']
          },
          {
            name: 'routes',
            type: 'routes',
            path: 'src/routes/index.ts',
            dependencies: ['express']
          },
          {
            name: 'middleware',
            type: 'middleware',
            path: 'src/middleware/index.ts',
            dependencies: ['express']
          },
          {
            name: 'controllers',
            type: 'controllers',
            path: 'src/controllers/index.ts',
            dependencies: ['express']
          }
        ],
        dependencies: {
          express: '^4.18.2',
          cors: '^2.8.5',
          helmet: '^6.0.1',
          dotenv: '^16.0.3',
          typescript: '^4.9.4'
        }
      },
      config: {
        database: 'postgresql',
        orm: 'prisma',
        authentication: 'jwt',
        testing: 'jest'
      },
      public: true,
      userId: adminUser.id
    }
  });

  const mobileTemplate = await prisma.template.upsert({
    where: { id: 'mobile-template-1' },
    update: {},
    create: {
      id: 'mobile-template-1',
      name: 'React Native App',
      category: 'mobile',
      description: 'A cross-platform mobile application built with React Native',
      structure: {
        type: 'mobile',
        framework: 'react-native',
        language: 'typescript',
        components: [
          {
            name: 'App',
            type: 'component',
            path: 'src/App.tsx',
            dependencies: ['react', 'react-native']
          },
          {
            name: 'Navigation',
            type: 'navigation',
            path: 'src/navigation/index.tsx',
            dependencies: ['@react-navigation/native', '@react-navigation/stack']
          },
          {
            name: 'HomeScreen',
            type: 'screen',
            path: 'src/screens/HomeScreen.tsx',
            dependencies: ['react', 'react-native']
          }
        ],
        dependencies: {
          'react': '^18.2.0',
          'react-native': '^0.72.0',
          '@react-navigation/native': '^6.1.0',
          '@react-navigation/stack': '^6.3.0'
        }
      },
      config: {
        platforms: ['ios', 'android'],
        stateManagement: 'redux',
        testing: 'jest'
      },
      public: true,
      userId: adminUser.id
    }
  });

  console.log('✅ Created sample templates');

  // Create sample projects
  const sampleProject = await prisma.project.create({
    data: {
      name: 'My First Web App',
      type: 'web',
      description: 'A sample web application for demonstration',
      status: 'active',
      config: {
        framework: 'react',
        language: 'typescript',
        features: ['authentication', 'dashboard', 'user-management']
      },
      userId: demoUser.id,
      templateId: webTemplate.id
    }
  });

  console.log('✅ Created sample project:', sampleProject.name);

  // Create sample agents
  const codeAgent = await prisma.agent.create({
    data: {
      name: 'Code Generator',
      type: 'code',
      description: 'AI agent specialized in generating clean, efficient code',
      config: {
        model: 'gpt-4',
        temperature: 0.2,
        maxTokens: 2000,
        systemPrompt: 'You are a senior software engineer specializing in generating clean, efficient, and well-documented code.'
      },
      status: 'active',
      userId: demoUser.id,
      projectId: sampleProject.id
    }
  });

  const chatAgent = await prisma.agent.create({
    data: {
      name: 'Project Assistant',
      type: 'chat',
      description: 'AI assistant for project management and development queries',
      config: {
        model: 'gpt-3.5-turbo',
        temperature: 0.7,
        maxTokens: 1500,
        systemPrompt: 'You are a helpful project assistant specialized in software development and project management.'
      },
      status: 'active',
      userId: demoUser.id,
      projectId: sampleProject.id
    }
  });

  console.log('✅ Created sample agents');

  // Create sample usage records
  await prisma.usageRecord.create({
    data: {
      type: 'api_usage',
      metadata: {
        endpoint: '/api/projects',
        method: 'GET',
        statusCode: 200
      },
      duration: 150,
      success: true,
      userId: demoUser.id,
      projectId: sampleProject.id
    }
  });

  await prisma.usageRecord.create({
    data: {
      type: 'model_usage',
      metadata: {
        model: 'gpt-4',
        operation: 'code_generation'
      },
      tokens: 1500,
      cost: 0.045,
      duration: 3000,
      success: true,
      userId: demoUser.id,
      agentId: codeAgent.id
    }
  });

  console.log('✅ Created sample usage records');

  // Create configurations
  await prisma.configuration.upsert({
    where: { key: 'app_name' },
    update: {},
    create: {
      key: 'app_name',
      value: 'Craft Code',
      description: 'Application name'
    }
  });

  await prisma.configuration.upsert({
    where: { key: 'app_version' },
    update: {},
    create: {
      key: 'app_version',
      value: '1.0.0',
      description: 'Application version'
    }
  });

  await prisma.configuration.upsert({
    where: { key: 'maintenance_mode' },
    update: {},
    create: {
      key: 'maintenance_mode',
      value: false,
      description: 'Enable maintenance mode'
    }
  });

  await prisma.configuration.upsert({
    where: { key: 'max_projects_per_user' },
    update: {},
    create: {
      key: 'max_projects_per_user',
      value: { free: 3, pro: 50, premium: -1, enterprise: -1 },
      description: 'Maximum projects per user by subscription tier'
    }
  });

  console.log('✅ Created configurations');

  // Create notification settings for demo user
  await prisma.notificationSettings.upsert({
    where: { userId: demoUser.id },
    update: {},
    create: {
      userId: demoUser.id,
      emailNotifications: true,
      pushNotifications: false,
      weeklyReports: true,
      securityAlerts: true
    }
  });

  console.log('✅ Created notification settings');

  console.log('🎉 Database seeding completed successfully!');
  console.log('\n📋 Summary:');
  console.log(`- Admin user: ${adminUser.email} (password: admin123)`);
  console.log(`- Demo user: ${demoUser.email} (password: demo123)`);
  console.log(`- Templates: 3 (React Web, Node.js API, React Native)`);
  console.log(`- Projects: 1 (My First Web App)`);
  console.log(`- Agents: 2 (Code Generator, Project Assistant)`);
  console.log(`- Usage records: 2 sample records`);
  console.log(`- Configurations: 4 app settings`);
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error('❌ Error during seeding:', e);
    await prisma.$disconnect();
    process.exit(1);
  });