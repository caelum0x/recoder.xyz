// DevOps Automation API - Comprehensive infrastructure automation and deployment management
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from 'next-auth';
import { prisma } from '@/lib/database';
import { z } from 'zod';
import rateLimit from '@/lib/rate-limit';
import { v4 as uuidv4 } from 'uuid';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs-extra';
import path from 'path';
import yaml from 'js-yaml';

const execAsync = promisify(exec);

// Rate limiting
const limiter = rateLimit({
  interval: 60 * 1000, // 1 minute
  uniqueTokenPerInterval: 50,
});

const createDeploymentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
  projectId: z.string().uuid(),
  platform: z.enum(['aws', 'gcp', 'azure', 'vercel', 'netlify', 'digitalocean', 'heroku', 'docker']),
  environment: z.enum(['development', 'staging', 'production']),
  configuration: z.object({
    region: z.string().optional(),
    instanceType: z.string().optional(),
    autoScale: z.boolean().default(false),
    minInstances: z.number().min(1).max(100).default(1),
    maxInstances: z.number().min(1).max(100).default(10),
    buildCommand: z.string().optional(),
    startCommand: z.string().optional(),
    environmentVars: z.record(z.string()).default({}),
    domains: z.array(z.string()).optional(),
    ssl: z.boolean().default(true),
    monitoring: z.boolean().default(true),
    logging: z.boolean().default(true),
    backup: z.boolean().default(false),
    cicd: z.boolean().default(true)
  }),
  infrastructure: z.object({
    containerized: z.boolean().default(true),
    orchestrator: z.enum(['docker', 'kubernetes', 'docker-swarm', 'none']).optional(),
    database: z.object({
      type: z.enum(['postgresql', 'mysql', 'mongodb', 'redis', 'none']).optional(),
      managed: z.boolean().default(true),
      backups: z.boolean().default(true)
    }).optional(),
    storage: z.object({
      type: z.enum(['s3', 'gcs', 'azure-blob', 'local']).optional(),
      size: z.string().optional()
    }).optional(),
    networking: z.object({
      vpc: z.boolean().default(true),
      loadBalancer: z.boolean().default(false),
      cdn: z.boolean().default(false)
    }).optional()
  })
});

const pipelineSchema = z.object({
  name: z.string().min(1).max(100),
  projectId: z.string().uuid(),
  stages: z.array(z.object({
    name: z.string(),
    type: z.enum(['build', 'test', 'security', 'deploy', 'notify']),
    commands: z.array(z.string()),
    condition: z.enum(['always', 'on_success', 'on_failure']).default('on_success'),
    timeout: z.number().min(60).max(3600).default(600),
    retries: z.number().min(0).max(5).default(0),
    environment: z.record(z.string()).optional()
  })).min(1),
  triggers: z.object({
    push: z.boolean().default(true),
    pullRequest: z.boolean().default(true),
    schedule: z.string().optional(),
    manual: z.boolean().default(true)
  }),
  notifications: z.object({
    slack: z.string().optional(),
    email: z.array(z.string()).optional(),
    webhook: z.string().optional()
  }).optional()
});

// POST - Create deployment or pipeline
export async function POST(request: NextRequest) {
  try {
    // Rate limiting
    try {
      await limiter.check(request, 5, 'devops-automation-create');
    } catch {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      );
    }

    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { action } = body;

    if (action === 'create_deployment') {
      const validatedData = createDeploymentSchema.parse(body);
      
      // Check project access
      const project = await prisma.project.findFirst({
        where: {
          id: validatedData.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 });
      }

      // Create deployment configuration
      const deployment = await prisma.deployment.create({
        data: {
          id: uuidv4(),
          name: validatedData.name,
          description: validatedData.description,
          projectId: validatedData.projectId,
          platform: validatedData.platform,
          environment: validatedData.environment,
          configuration: validatedData.configuration,
          infrastructure: validatedData.infrastructure,
          status: 'pending',
          createdBy: session.user.id,
          metadata: {
            createdAt: new Date().toISOString(),
            version: '1.0.0'
          }
        }
      });

      // Generate infrastructure as code
      const iacConfig = await generateInfrastructureCode(deployment);
      
      // Create CI/CD pipeline if enabled
      if (validatedData.configuration.cicd) {
        await createCICDPipeline(deployment, project);
      }

      // Log deployment creation
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'deployment_create',
          platform: 'devops',
          success: true,
          metadata: {
            deploymentId: deployment.id,
            platform: validatedData.platform,
            environment: validatedData.environment,
            containerized: validatedData.infrastructure.containerized
          }
        }
      });

      return NextResponse.json({
        deployment: {
          ...deployment,
          infrastructureCode: iacConfig
        },
        message: 'Deployment configuration created successfully'
      }, { status: 201 });

    } else if (action === 'create_pipeline') {
      const validatedData = pipelineSchema.parse(body);
      
      // Check project access
      const project = await prisma.project.findFirst({
        where: {
          id: validatedData.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!project) {
        return NextResponse.json({ error: 'Project not found or access denied' }, { status: 403 });
      }

      // Create CI/CD pipeline
      const pipeline = await prisma.cicdPipeline.create({
        data: {
          id: uuidv4(),
          name: validatedData.name,
          projectId: validatedData.projectId,
          stages: validatedData.stages,
          triggers: validatedData.triggers,
          notifications: validatedData.notifications,
          status: 'active',
          createdBy: session.user.id,
          metadata: {
            createdAt: new Date().toISOString(),
            stageCount: validatedData.stages.length
          }
        }
      });

      // Generate pipeline configuration files
      const pipelineConfig = await generatePipelineConfig(pipeline, project);

      // Log pipeline creation
      await prisma.auditLog.create({
        data: {
          userId: session.user.id,
          action: 'pipeline_create',
          platform: 'devops',
          success: true,
          metadata: {
            pipelineId: pipeline.id,
            stageCount: validatedData.stages.length,
            hasNotifications: !!validatedData.notifications
          }
        }
      });

      return NextResponse.json({
        pipeline: {
          ...pipeline,
          configFiles: pipelineConfig
        },
        message: 'CI/CD pipeline created successfully'
      }, { status: 201 });

    } else if (action === 'deploy') {
      const { deploymentId, version } = body;
      
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: { project: true }
      });

      if (!deployment) {
        return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
      }

      // Check access
      const hasAccess = await prisma.project.findFirst({
        where: {
          id: deployment.projectId,
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id,
                  role: { in: ['admin', 'editor'] }
                }
              }
            }
          ]
        }
      });

      if (!hasAccess) {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }

      // Execute deployment
      const deploymentExecution = await executeDeployment(deployment, version, session.user.id);

      return NextResponse.json({
        execution: deploymentExecution,
        message: 'Deployment initiated successfully'
      });
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 });

  } catch (error) {
    console.error('DevOps automation error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid input data', details: error.errors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to process request' },
      { status: 500 }
    );
  }
}

// GET - Get deployments and pipelines
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession();
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type'); // 'deployments' or 'pipelines'
    const projectId = searchParams.get('projectId');
    const deploymentId = searchParams.get('deploymentId');
    const pipelineId = searchParams.get('pipelineId');

    if (deploymentId) {
      // Get specific deployment with executions
      const deployment = await prisma.deployment.findUnique({
        where: { id: deploymentId },
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          executions: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!deployment) {
        return NextResponse.json({ error: 'Deployment not found' }, { status: 404 });
      }

      return NextResponse.json({ deployment });

    } else if (pipelineId) {
      // Get specific pipeline with runs
      const pipeline = await prisma.cicdPipeline.findUnique({
        where: { id: pipelineId },
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          runs: {
            orderBy: { createdAt: 'desc' },
            take: 10
          }
        }
      });

      if (!pipeline) {
        return NextResponse.json({ error: 'Pipeline not found' }, { status: 404 });
      }

      return NextResponse.json({ pipeline });

    } else if (type === 'deployments') {
      // Get deployments
      const whereConditions: any = {
        project: {
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id
                }
              }
            }
          ]
        }
      };

      if (projectId) {
        whereConditions.projectId = projectId;
      }

      const deployments = await prisma.deployment.findMany({
        where: whereConditions,
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              executions: true
            }
          },
          executions: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({ deployments });

    } else if (type === 'pipelines') {
      // Get pipelines
      const whereConditions: any = {
        project: {
          OR: [
            { userId: session.user.id },
            { 
              collaborators: {
                some: {
                  userId: session.user.id
                }
              }
            }
          ]
        }
      };

      if (projectId) {
        whereConditions.projectId = projectId;
      }

      const pipelines = await prisma.cicdPipeline.findMany({
        where: whereConditions,
        include: {
          project: {
            select: {
              id: true,
              name: true
            }
          },
          _count: {
            select: {
              runs: true
            }
          },
          runs: {
            orderBy: { createdAt: 'desc' },
            take: 1
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      return NextResponse.json({ pipelines });

    } else {
      // Get overview data
      const [deployments, pipelines] = await Promise.all([
        prisma.deployment.findMany({
          where: {
            project: {
              OR: [
                { userId: session.user.id },
                { 
                  collaborators: {
                    some: {
                      userId: session.user.id
                    }
                  }
                }
              ]
            }
          },
          include: {
            project: {
              select: {
                id: true,
                name: true
              }
            },
            _count: {
              select: {
                executions: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        }),
        
        prisma.cicdPipeline.findMany({
          where: {
            project: {
              OR: [
                { userId: session.user.id },
                { 
                  collaborators: {
                    some: {
                      userId: session.user.id
                    }
                  }
                }
              ]
            }
          },
          include: {
            project: {
              select: {
                id: true,
                name: true
              }
            },
            _count: {
              select: {
                runs: true
              }
            }
          },
          orderBy: { createdAt: 'desc' },
          take: 5
        })
      ]);

      return NextResponse.json({ 
        overview: {
          deployments,
          pipelines
        }
      });
    }

  } catch (error) {
    console.error('Get DevOps data error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch DevOps data' },
      { status: 500 }
    );
  }
}

async function generateInfrastructureCode(deployment: any) {
  const platform = deployment.platform;
  const config = deployment.configuration;
  const infrastructure = deployment.infrastructure;
  
  let iacConfig = {};

  switch (platform) {
    case 'aws':
      iacConfig = {
        terraform: {
          'main.tf': generateAWSTerraform(deployment),
          'variables.tf': generateTerraformVariables(config),
          'outputs.tf': generateTerraformOutputs()
        },
        cloudformation: generateAWSCloudFormation(deployment),
        'docker-compose.yml': generateDockerCompose(deployment)
      };
      break;
      
    case 'gcp':
      iacConfig = {
        terraform: {
          'main.tf': generateGCPTerraform(deployment),
          'variables.tf': generateTerraformVariables(config)
        },
        'app.yaml': generateGCPAppEngine(deployment),
        'docker-compose.yml': generateDockerCompose(deployment)
      };
      break;
      
    case 'azure':
      iacConfig = {
        'azure-pipelines.yml': generateAzurePipelines(deployment),
        'docker-compose.yml': generateDockerCompose(deployment),
        'bicep/main.bicep': generateAzureBicep(deployment)
      };
      break;
      
    case 'docker':
      iacConfig = {
        'Dockerfile': generateDockerfile(deployment),
        'docker-compose.yml': generateDockerCompose(deployment),
        '.dockerignore': generateDockerIgnore()
      };
      break;
      
    default:
      iacConfig = {
        'docker-compose.yml': generateDockerCompose(deployment)
      };
  }

  return iacConfig;
}

async function createCICDPipeline(deployment: any, project: any) {
  const pipelineConfig = {
    name: `${deployment.name}-pipeline`,
    projectId: project.id,
    stages: [
      {
        name: 'Build',
        type: 'build',
        commands: [
          'npm install',
          deployment.configuration.buildCommand || 'npm run build'
        ],
        condition: 'always',
        timeout: 600
      },
      {
        name: 'Test',
        type: 'test',
        commands: [
          'npm test',
          'npm run test:e2e'
        ],
        condition: 'on_success',
        timeout: 300
      },
      {
        name: 'Security Scan',
        type: 'security',
        commands: [
          'npm audit',
          'docker scan .'
        ],
        condition: 'on_success',
        timeout: 180
      },
      {
        name: 'Deploy',
        type: 'deploy',
        commands: [
          `deploy to ${deployment.environment}`,
          deployment.configuration.startCommand || 'npm start'
        ],
        condition: 'on_success',
        timeout: 900
      }
    ],
    triggers: {
      push: true,
      pullRequest: true,
      manual: true
    }
  };

  return await prisma.cicdPipeline.create({
    data: {
      ...pipelineConfig,
      id: uuidv4(),
      status: 'active',
      createdBy: deployment.createdBy,
      metadata: {
        autoGenerated: true,
        deploymentId: deployment.id
      }
    }
  });
}

async function generatePipelineConfig(pipeline: any, project: any) {
  const configs = {};

  // Generate GitHub Actions workflow
  configs['.github/workflows/deploy.yml'] = yaml.dump({
    name: pipeline.name,
    on: {
      push: pipeline.triggers.push ? { branches: ['main', 'develop'] } : undefined,
      pull_request: pipeline.triggers.pullRequest ? { branches: ['main'] } : undefined,
      workflow_dispatch: pipeline.triggers.manual || undefined
    },
    jobs: {
      deploy: {
        'runs-on': 'ubuntu-latest',
        steps: pipeline.stages.map((stage: any, index: number) => ({
          name: stage.name,
          run: stage.commands.join('\n'),
          timeout: stage.timeout,
          'continue-on-error': stage.condition === 'always'
        }))
      }
    }
  });

  // Generate GitLab CI/CD
  configs['.gitlab-ci.yml'] = yaml.dump({
    stages: pipeline.stages.map((stage: any) => stage.name.toLowerCase()),
    ...pipeline.stages.reduce((acc: any, stage: any) => {
      acc[stage.name.toLowerCase()] = {
        stage: stage.name.toLowerCase(),
        script: stage.commands,
        timeout: `${stage.timeout}s`,
        when: stage.condition === 'always' ? 'always' : 'on_success'
      };
      return acc;
    }, {})
  });

  // Generate Jenkins pipeline
  configs['Jenkinsfile'] = `
pipeline {
    agent any
    
    stages {
        ${pipeline.stages.map((stage: any) => `
        stage('${stage.name}') {
            steps {
                ${stage.commands.map((cmd: string) => `sh '${cmd}'`).join('\n                ')}
            }
            post {
                ${stage.condition === 'always' ? 'always' : 'success'} {
                    echo 'Stage ${stage.name} completed'
                }
            }
        }`).join('')}
    }
}`;

  return configs;
}

async function executeDeployment(deployment: any, version: string, userId: string) {
  const executionId = uuidv4();
  
  try {
    // Create execution record
    const execution = await prisma.deploymentExecution.create({
      data: {
        id: executionId,
        deploymentId: deployment.id,
        version: version || '1.0.0',
        status: 'running',
        environment: deployment.environment,
        triggeredBy: userId,
        metadata: {
          startTime: new Date().toISOString(),
          platform: deployment.platform
        }
      }
    });

    // Execute deployment in background
    executeDeploymentInBackground(deployment, executionId).catch(console.error);

    return {
      executionId,
      status: 'running',
      startedAt: new Date().toISOString()
    };

  } catch (error) {
    console.error('Deployment execution setup error:', error);
    throw error;
  }
}

async function executeDeploymentInBackground(deployment: any, executionId: string) {
  const startTime = Date.now();
  
  try {
    // Simulate deployment process
    const steps = [
      'Initializing deployment environment',
      'Building application',
      'Running tests',
      'Creating container image',
      'Pushing to registry',
      'Deploying to target environment',
      'Running health checks',
      'Finalizing deployment'
    ];

    let currentStep = 0;
    
    for (const step of steps) {
      currentStep++;
      
      // Update execution status
      await prisma.deploymentExecution.update({
        where: { id: executionId },
        data: {
          status: 'running',
          metadata: {
            currentStep: currentStep,
            totalSteps: steps.length,
            currentAction: step,
            progress: Math.round((currentStep / steps.length) * 100)
          }
        }
      });

      // Simulate step execution time
      await new Promise(resolve => setTimeout(resolve, 2000));
    }

    // Mark as successful
    await prisma.deploymentExecution.update({
      where: { id: executionId },
      data: {
        status: 'success',
        completedAt: new Date(),
        results: {
          success: true,
          duration: Date.now() - startTime,
          url: `https://${deployment.name}-${deployment.environment}.example.com`,
          steps: steps.length
        }
      }
    });

  } catch (error) {
    console.error('Deployment execution error:', error);
    
    await prisma.deploymentExecution.update({
      where: { id: executionId },
      data: {
        status: 'failed',
        completedAt: new Date(),
        results: {
          success: false,
          error: error instanceof Error ? error.message : 'Deployment failed',
          duration: Date.now() - startTime
        }
      }
    });
  }
}

// Helper functions for generating infrastructure code
function generateAWSTerraform(deployment: any) {
  return `
provider "aws" {
  region = "${deployment.configuration.region || 'us-west-2'}"
}

resource "aws_ecs_cluster" "${deployment.name}" {
  name = "${deployment.name}-${deployment.environment}"
}

resource "aws_ecs_service" "${deployment.name}" {
  name            = "${deployment.name}-service"
  cluster         = aws_ecs_cluster.${deployment.name}.id
  task_definition = aws_ecs_task_definition.${deployment.name}.arn
  desired_count   = ${deployment.configuration.minInstances}
  
  deployment_configuration {
    maximum_percent         = 200
    minimum_healthy_percent = 100
  }
}`;
}

function generateDockerCompose(deployment: any) {
  return `
version: '3.8'

services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=${deployment.environment}
      ${Object.entries(deployment.configuration.environmentVars || {})
        .map(([key, value]) => `- ${key}=${value}`).join('\n      ')}
    restart: unless-stopped
    
  ${deployment.infrastructure.database?.type === 'postgresql' ? `
  db:
    image: postgres:15
    environment:
      - POSTGRES_DB=app
      - POSTGRES_USER=app
      - POSTGRES_PASSWORD=password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    restart: unless-stopped
      
volumes:
  postgres_data:` : ''}`;
}

function generateDockerfile(deployment: any) {
  return `
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

${deployment.configuration.buildCommand ? `RUN ${deployment.configuration.buildCommand}` : ''}

EXPOSE 3000

USER node

CMD ["${deployment.configuration.startCommand || 'npm start'}"]`;
}

function generateTerraformVariables(config: any) {
  return `
variable "region" {
  description = "AWS region"
  type        = string
  default     = "${config.region || 'us-west-2'}"
}

variable "environment" {
  description = "Environment name"
  type        = string
  default     = "production"
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = ${config.minInstances || 1}
}`;
}

function generateTerraformOutputs() {
  return `
output "cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "service_name" {
  value = aws_ecs_service.main.name
}`;
}

function generateGCPTerraform(deployment: any) {
  return `
provider "google" {
  project = var.project_id
  region  = "${deployment.configuration.region || 'us-central1'}"
}

resource "google_cloud_run_service" "${deployment.name}" {
  name     = "${deployment.name}-${deployment.environment}"
  location = "${deployment.configuration.region || 'us-central1'}"

  template {
    spec {
      containers {
        image = "gcr.io/\${var.project_id}/${deployment.name}:latest"
        
        env {
          name  = "NODE_ENV"
          value = "${deployment.environment}"
        }
      }
    }
  }
}`;
}

function generateAWSCloudFormation(deployment: any) {
  return {
    AWSTemplateFormatVersion: '2010-09-09',
    Description: `Infrastructure for ${deployment.name}`,
    Resources: {
      ECSCluster: {
        Type: 'AWS::ECS::Cluster',
        Properties: {
          ClusterName: `${deployment.name}-${deployment.environment}`
        }
      }
    }
  };
}

function generateGCPAppEngine(deployment: any) {
  return `
runtime: nodejs18
env: standard

automatic_scaling:
  min_instances: ${deployment.configuration.minInstances || 1}
  max_instances: ${deployment.configuration.maxInstances || 10}

env_variables:
  NODE_ENV: ${deployment.environment}
  ${Object.entries(deployment.configuration.environmentVars || {})
    .map(([key, value]) => `${key}: ${value}`).join('\n  ')}`;
}

function generateAzurePipelines(deployment: any) {
  return `
trigger:
- main

pool:
  vmImage: 'ubuntu-latest'

steps:
- task: NodeTool@0
  inputs:
    versionSpec: '18.x'
  displayName: 'Install Node.js'

- script: |
    npm install
    ${deployment.configuration.buildCommand || 'npm run build'}
  displayName: 'Build application'

- task: Docker@2
  displayName: 'Build and push image'
  inputs:
    command: 'buildAndPush'
    repository: '${deployment.name}'
    tags: '$(Build.BuildId)'`;
}

function generateAzureBicep(deployment: any) {
  return `
param appName string = '${deployment.name}'
param environment string = '${deployment.environment}'
param location string = resourceGroup().location

resource appServicePlan 'Microsoft.Web/serverfarms@2021-02-01' = {
  name: '\${appName}-plan'
  location: location
  sku: {
    name: 'B1'
    tier: 'Basic'
  }
}

resource webApp 'Microsoft.Web/sites@2021-02-01' = {
  name: '\${appName}-\${environment}'
  location: location
  properties: {
    serverFarmId: appServicePlan.id
  }
}`;
}

function generateDockerIgnore() {
  return `
node_modules
npm-debug.log
.git
.env
*.md
.DS_Store
coverage
.nyc_output`;
}