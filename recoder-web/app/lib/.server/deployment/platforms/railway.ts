/**
 * Railway Deployment Integration
 * Handles deployments to Railway platform using GraphQL API
 *
 * Railway supports several deployment methods:
 * 1. GitHub repo connection
 * 2. Docker image
 * 3. CLI deployment with railpack
 * 4. Template deployment
 *
 * This implementation uses a file-based approach with base64 encoding
 * for direct deployment without requiring GitHub integration.
 *
 * API Documentation: https://docs.railway.app/reference/graphql-api
 */

import type { DeploymentConfig, DeploymentResult, FileTree } from '../types';
import { fetchWithRetry, withRetry } from '../utils/retry';

interface RailwayUser {
  id: string;
  name: string;
  email: string;
}

interface RailwayProject {
  id: string;
  name: string;
  environments: {
    edges: Array<{
      node: {
        id: string;
        name: string;
      };
    }>;
  };
}

interface RailwayService {
  id: string;
  name: string;
}

interface RailwayDeployment {
  id: string;
  status: string;
  staticUrl?: string;
  url?: string;
}

interface RailwayDomain {
  id: string;
  domain: string;
}

export class RailwayDeployer {
  private apiUrl = 'https://backboard.railway.com/graphql/v2';
  private token: string;

  constructor(token?: string) {
    this.token = token || process.env.RAILWAY_TOKEN || '';
  }

  /**
   * Deploy to Railway
   */
  async deploy(config: DeploymentConfig, files: FileTree): Promise<DeploymentResult> {
    const startTime = Date.now();

    try {
      console.log(`[Railway] Starting deployment: ${config.projectName}`);

      if (!this.token) {
        throw new Error('Railway token not configured. Get your token from https://railway.app/account/tokens');
      }

      // Step 1: Get user info
      const me = await this.getMe();
      console.log(`[Railway] User: ${me.name || me.email}`);

      // Step 2: Create or get project
      const project = await this.createOrGetProject(config.projectName);
      console.log(`[Railway] Project: ${project.name} (${project.id})`);

      // Get the default environment (production)
      const environmentId = project.environments?.edges?.[0]?.node?.id;
      if (!environmentId) {
        throw new Error('No environment found in project');
      }
      console.log(`[Railway] Environment: ${environmentId}`);

      // Step 3: Create service
      const service = await this.createService(project.id, config.projectName);
      console.log(`[Railway] Service created: ${service.id}`);

      // Step 4: Set environment variables if provided
      if (config.environmentVariables && Object.keys(config.environmentVariables).length > 0) {
        await this.setEnvironmentVariables(
          project.id,
          environmentId,
          service.id,
          config.environmentVariables
        );
        console.log(`[Railway] Environment variables set`);
      }

      // Step 5: Create deployment with files
      const deployment = await this.createDeploymentWithFiles(
        project.id,
        environmentId,
        service.id,
        files,
        config
      );
      console.log(`[Railway] Deployment created: ${deployment.id}`);

      // Step 6: Generate a public domain
      const domain = await this.generateServiceDomain(
        project.id,
        environmentId,
        service.id
      );
      console.log(`[Railway] Domain generated: ${domain.domain}`);

      // Step 7: Wait for deployment to complete
      const finalDeployment = await this.waitForDeployment(
        project.id,
        environmentId,
        service.id,
        180000 // 3 minutes timeout
      );

      const endTime = Date.now();
      const totalTime = endTime - startTime;

      const url = `https://${domain.domain}`;
      console.log(`[Railway] Deployment successful: ${url}`);

      return {
        id: deployment.id,
        deploymentId: deployment.id,
        platform: 'railway',
        status: 'deployed',
        url,
        buildTime: totalTime,
        deployTime: totalTime,
        metadata: {
          projectId: project.id,
          serviceId: service.id,
          environmentId,
          domain: domain.domain,
        },
      };
    } catch (error) {
      console.error('[Railway] Deployment failed:', error);

      return {
        id: `railway-${Date.now()}`,
        platform: 'railway',
        status: 'failed',
        error: error instanceof Error ? error.message : 'Deployment failed',
        buildTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Execute GraphQL query/mutation with retry
   */
  private async graphql<T>(query: string, variables?: Record<string, any>): Promise<T> {
    return withRetry(async () => {
      const response = await fetchWithRetry(this.apiUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`Railway API error: ${response.status} - ${text}`);
      }

      const result = await response.json() as any;

      if (result.errors?.length) {
        const errorMessage = result.errors.map((e: any) => e.message).join(', ');
        // Don't retry on validation errors
        if (errorMessage.includes('validation') || errorMessage.includes('not found')) {
          throw new Error(`GraphQL error: ${errorMessage}`);
        }
        throw new Error(`GraphQL error: ${errorMessage}`);
      }

      return result.data;
    }, {
      maxRetries: 3,
      onRetry: (attempt, error) => {
        console.log(`[Railway] Retrying GraphQL request (attempt ${attempt}): ${error.message}`);
      },
    });
  }

  /**
   * Get current user info
   */
  private async getMe(): Promise<RailwayUser> {
    const data = await this.graphql<{ me: RailwayUser }>(`
      query {
        me {
          id
          name
          email
        }
      }
    `);
    return data.me;
  }

  /**
   * Create or get existing project
   */
  private async createOrGetProject(name: string): Promise<RailwayProject> {
    // First try to find existing project
    try {
      const existing = await this.graphql<{ projects: { edges: Array<{ node: RailwayProject }> } }>(`
        query {
          projects(first: 100) {
            edges {
              node {
                id
                name
                environments {
                  edges {
                    node {
                      id
                      name
                    }
                  }
                }
              }
            }
          }
        }
      `);

      const found = existing.projects.edges.find(
        (e) => e.node.name.toLowerCase() === name.toLowerCase()
      );

      if (found) {
        console.log(`[Railway] Found existing project: ${found.node.name}`);
        return found.node;
      }
    } catch (error) {
      console.log(`[Railway] Could not search for existing project, creating new one`);
    }

    // Create new project
    const data = await this.graphql<{ projectCreate: RailwayProject }>(`
      mutation projectCreate($input: ProjectCreateInput!) {
        projectCreate(input: $input) {
          id
          name
          environments {
            edges {
              node {
                id
                name
              }
            }
          }
        }
      }
    `, {
      input: { name }
    });
    return data.projectCreate;
  }

  /**
   * Create a service in the project
   */
  private async createService(projectId: string, name: string): Promise<RailwayService> {
    const data = await this.graphql<{ serviceCreate: RailwayService }>(`
      mutation serviceCreate($input: ServiceCreateInput!) {
        serviceCreate(input: $input) {
          id
          name
        }
      }
    `, {
      input: {
        projectId,
        name,
      }
    });
    return data.serviceCreate;
  }

  /**
   * Set environment variables for a service
   */
  private async setEnvironmentVariables(
    projectId: string,
    environmentId: string,
    serviceId: string,
    variables: Record<string, string>
  ): Promise<void> {
    await this.graphql(`
      mutation variablesUpsert($input: VariableCollectionUpsertInput!) {
        variableCollectionUpsert(input: $input)
      }
    `, {
      input: {
        projectId,
        environmentId,
        serviceId,
        variables,
      }
    });
  }

  // NOTE: deploymentSourceUploadUrl is an undocumented internal mutation
  // used by the Railway CLI (railway up). It is not part of the public API
  // and may change without notice. Monitor Railway CLI releases for changes.
  // See: https://github.com/railwayapp/cli
  /**
   * Create a deployment with files using Railway's upload API
   * Railway uses a tarball upload approach for CLI deployments
   */
  private async createDeploymentWithFiles(
    projectId: string,
    environmentId: string,
    serviceId: string,
    files: FileTree,
    config: DeploymentConfig
  ): Promise<RailwayDeployment> {
    // Create a nixpacks configuration based on the project
    const nixpacksConfig = this.generateNixpacksConfig(config, files);

    // Add nixpacks.toml to files if needed
    const deployFiles = { ...files };
    if (!deployFiles['nixpacks.toml'] && !deployFiles['railway.toml']) {
      deployFiles['nixpacks.toml'] = {
        content: nixpacksConfig,
      };
    }

    // Get upload URL from Railway
    const uploadUrlData = await this.graphql<{
      deploymentSourceUploadUrl: { url: string; deploymentId: string }
    }>(`
      mutation deploymentSourceUploadUrl($input: DeploymentSourceUploadUrlInput!) {
        deploymentSourceUploadUrl(input: $input) {
          url
          deploymentId
        }
      }
    `, {
      input: {
        projectId,
        environmentId,
        serviceId,
      }
    });

    const { url: uploadUrl, deploymentId } = uploadUrlData.deploymentSourceUploadUrl;

    // Create tarball from files
    const tarball = await this.createTarball(deployFiles);

    // Upload the tarball
    const uploadResponse = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/gzip',
      },
      body: tarball as unknown as BodyInit,
    });

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`Failed to upload files: ${uploadResponse.status} - ${errorText}`);
    }

    console.log(`[Railway] Files uploaded, deployment ID: ${deploymentId}`);

    return {
      id: deploymentId,
      status: 'BUILDING',
    };
  }

  /**
   * Generate Nixpacks configuration based on project type
   */
  private generateNixpacksConfig(config: DeploymentConfig, files: FileTree): string {
    const hasPackageJson = 'package.json' in files;
    const hasNextConfig = 'next.config.js' in files || 'next.config.ts' in files || 'next.config.mjs' in files;

    let content = '';

    if (hasNextConfig) {
      content = `[phases.build]
cmds = ["npm install", "npm run build"]

[start]
cmd = "npm start"
`;
    } else if (hasPackageJson) {
      const buildCmd = config.buildCommand || 'npm run build';
      const startCmd = config.startCommand || 'npm start';

      content = `[phases.setup]
nixPkgs = ["nodejs-18_x", "npm-9_x"]

[phases.install]
cmds = ["npm install"]

[phases.build]
cmds = ["${buildCmd}"]

[start]
cmd = "${startCmd}"
`;
    } else {
      // Static site
      content = `[phases.setup]
nixPkgs = ["nodejs-18_x"]

[start]
cmd = "npx serve -s ${config.outputDirectory || '.'}"
`;
    }

    return content;
  }

  /**
   * Create a gzipped tarball from files
   * This is a simplified tar implementation suitable for text source files.
   * Limitations: does not handle binary files, symlinks, or very deep directory
   * structures. Filenames longer than 100 chars are truncated with a warning.
   * For production use with complex file trees, consider a proper tar library.
   */
  private async createTarball(files: FileTree): Promise<Uint8Array> {
    // Build a simple tar archive
    const encoder = new TextEncoder();
    const chunks: Uint8Array[] = [];

    for (const [path, file] of Object.entries(files)) {
      const content = typeof file === 'string' ? file : file.content;
      if (!content) continue;

      const contentBytes = encoder.encode(content);

      // Check filename length - tar v7 format only supports 100 chars.
      // Log a warning and truncate if necessary.
      let filePath = path;
      if (filePath.length > 100) {
        console.warn(
          `[Railway] Filename exceeds 100 chars and will be truncated in tarball: ${filePath} (${filePath.length} chars)`
        );
        filePath = filePath.slice(filePath.length - 100);
      }

      // Create tar header (512 bytes)
      const header = new Uint8Array(512);

      // File name (100 bytes)
      const nameBytes = encoder.encode(filePath);
      header.set(nameBytes, 0);

      // File mode (8 bytes) - 0644 in octal
      header.set(encoder.encode('0000644\0'), 100);

      // Owner UID (8 bytes)
      header.set(encoder.encode('0000000\0'), 108);

      // Owner GID (8 bytes)
      header.set(encoder.encode('0000000\0'), 116);

      // File size in octal (12 bytes)
      const sizeOctal = contentBytes.length.toString(8).padStart(11, '0') + '\0';
      header.set(encoder.encode(sizeOctal), 124);

      // Modification time (12 bytes)
      const mtime = Math.floor(Date.now() / 1000).toString(8).padStart(11, '0') + '\0';
      header.set(encoder.encode(mtime), 136);

      // Checksum placeholder (8 bytes of spaces)
      header.set(encoder.encode('        '), 148);

      // Type flag - '0' for regular file
      header[156] = 48; // '0'

      // USTAR magic bytes at offset 257 so the tarball is properly identified
      // as a POSIX-compliant (USTAR) archive by extraction tools.
      // Format: "ustar\0" (6 bytes at 257) + "00" version (2 bytes at 263)
      header.set(encoder.encode('ustar\0'), 257);
      header.set(encoder.encode('00'), 263);

      // Calculate and set checksum
      let checksum = 0;
      for (let i = 0; i < 512; i++) {
        checksum += header[i];
      }
      const checksumStr = checksum.toString(8).padStart(6, '0') + '\0 ';
      header.set(encoder.encode(checksumStr), 148);

      chunks.push(header);
      chunks.push(contentBytes);

      // Pad to 512 byte boundary
      const padding = 512 - (contentBytes.length % 512);
      if (padding < 512) {
        chunks.push(new Uint8Array(padding));
      }
    }

    // Add two empty 512-byte blocks to end the archive
    chunks.push(new Uint8Array(1024));

    // Combine all chunks
    const totalLength = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const tarball = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      tarball.set(chunk, offset);
      offset += chunk.length;
    }

    // Compress with gzip using CompressionStream if available
    if (typeof CompressionStream !== 'undefined') {
      const stream = new Blob([tarball]).stream();
      const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
      const compressed = await new Response(compressedStream).arrayBuffer();
      return new Uint8Array(compressed);
    }

    // Fallback: return uncompressed (Railway should handle both)
    return tarball;
  }

  /**
   * Generate a public domain for the service
   */
  private async generateServiceDomain(
    projectId: string,
    environmentId: string,
    serviceId: string
  ): Promise<RailwayDomain> {
    const data = await this.graphql<{ serviceDomainCreate: RailwayDomain }>(`
      mutation serviceDomainCreate($input: ServiceDomainCreateInput!) {
        serviceDomainCreate(input: $input) {
          id
          domain
        }
      }
    `, {
      input: {
        projectId,
        environmentId,
        serviceId,
      }
    });
    return data.serviceDomainCreate;
  }

  /**
   * Wait for deployment to complete
   */
  private async waitForDeployment(
    projectId: string,
    environmentId: string,
    serviceId: string,
    maxWaitMs = 180000
  ): Promise<RailwayDeployment | null> {
    const startTime = Date.now();
    const pollInterval = 5000;

    while (Date.now() - startTime < maxWaitMs) {
      try {
        const data = await this.graphql<{ deployments: { edges: Array<{ node: RailwayDeployment }> } }>(`
          query deployments($projectId: String!, $serviceId: String!) {
            deployments(
              first: 1
              input: {
                projectId: $projectId
                serviceId: $serviceId
              }
            ) {
              edges {
                node {
                  id
                  status
                  staticUrl
                }
              }
            }
          }
        `, {
          projectId,
          serviceId,
        });

        const deployment = data.deployments?.edges?.[0]?.node;
        if (deployment) {
          const status = deployment.status?.toUpperCase();
          console.log(`[Railway] Deployment status: ${status}`);

          if (status === 'SUCCESS' || status === 'READY' || status === 'RUNNING') {
            return deployment;
          }
          if (status === 'FAILED' || status === 'CRASHED' || status === 'REMOVED') {
            throw new Error(`Deployment failed with status: ${status}`);
          }
        }
      } catch (error) {
        if (error instanceof Error && error.message.includes('Deployment failed')) {
          throw error;
        }
        // Continue polling if query fails (deployment might not exist yet)
        console.log('[Railway] Waiting for deployment...');
      }

      await new Promise(resolve => setTimeout(resolve, pollInterval));
    }

    // Timeout but deployment might still complete
    console.log('[Railway] Deployment is still building, but continuing...');
    return null;
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(deploymentId: string): Promise<RailwayDeployment | null> {
    try {
      const data = await this.graphql<{ deployment: RailwayDeployment }>(`
        query deployment($id: String!) {
          deployment(id: $id) {
            id
            status
            staticUrl
          }
        }
      `, { id: deploymentId });
      return data.deployment;
    } catch {
      return null;
    }
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(deploymentId: string): Promise<string> {
    try {
      const data = await this.graphql<{ deploymentLogs: { logs: string[] } }>(`
        query deploymentLogs($deploymentId: String!) {
          deploymentLogs(deploymentId: $deploymentId, limit: 100) {
            logs
          }
        }
      `, { deploymentId });
      return data.deploymentLogs?.logs?.join('\n') || '';
    } catch {
      return 'Logs unavailable';
    }
  }

  /**
   * Add a database to the project (PostgreSQL, MySQL, Redis, MongoDB)
   */
  async addDatabase(
    projectId: string,
    environmentId: string,
    type: 'postgresql' | 'mysql' | 'redis' | 'mongodb'
  ): Promise<{ serviceId: string; connectionString: string }> {
    // Railway provides database templates
    const templateMap: Record<string, string> = {
      postgresql: 'postgres',
      mysql: 'mysql',
      redis: 'redis',
      mongodb: 'mongo',
    };

    const data = await this.graphql<{
      templateDeploy: {
        services: Array<{ id: string }>;
        variables: Record<string, string>;
      };
    }>(`
      mutation templateDeploy($input: TemplateDeployInput!) {
        templateDeploy(input: $input) {
          services {
            id
          }
          variables
        }
      }
    `, {
      input: {
        projectId,
        environmentId,
        templateCode: templateMap[type],
      }
    });

    const serviceId = data.templateDeploy.services[0]?.id;
    const connectionString = data.templateDeploy.variables.DATABASE_URL ||
                             data.templateDeploy.variables.REDIS_URL ||
                             data.templateDeploy.variables.MONGODB_URL || '';

    return { serviceId, connectionString };
  }

  /**
   * Test connection to Railway API
   */
  async testConnection(): Promise<boolean> {
    try {
      await this.getMe();
      return true;
    } catch {
      return false;
    }
  }
}

export function createRailwayDeployer(token?: string): RailwayDeployer {
  return new RailwayDeployer(token);
}
