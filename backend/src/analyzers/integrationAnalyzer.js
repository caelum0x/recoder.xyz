const { BaseAnalyzer } = require('./baseAnalyzer');
const { FileUtils } = require('../utils/file-utils');
const { logger } = require('../utils/logger');
const path = require('path');

class IntegrationAnalyzer extends BaseAnalyzer {
  constructor(options = {}) {
    super(options);
    this.integrationPatterns = {
      api: {
        rest: /\b(axios|fetch|request|superagent|got)\s*\(/gi,
        graphql: /\b(apollo|graphql|relay)\b/gi,
        grpc: /\b(grpc|protobuf)\b/gi
      },
      database: {
        sql: /\b(mysql|postgres|sqlite|mssql|oracle)\b/gi,
        nosql: /\b(mongodb|redis|cassandra|dynamodb|firebase)\b/gi,
        orm: /\b(prisma|sequelize|typeorm|mongoose|knex)\b/gi
      },
      messaging: {
        queue: /\b(rabbitmq|kafka|sqs|pubsub|zeromq)\b/gi,
        realtime: /\b(socket\.io|websocket|sse|pusher)\b/gi
      },
      auth: {
        oauth: /\b(oauth|passport|auth0|firebase-auth)\b/gi,
        jwt: /\b(jwt|jsonwebtoken)\b/gi,
        saml: /\b(saml|sso)\b/gi
      },
      cloud: {
        aws: /\b(aws-sdk|s3|lambda|ec2|rds|dynamodb)\b/gi,
        gcp: /\b(google-cloud|gcp|firebase|bigquery)\b/gi,
        azure: /\b(azure|@azure)\b/gi
      },
      payment: {
        stripe: /\b(stripe)\b/gi,
        paypal: /\b(paypal|braintree)\b/gi,
        other: /\b(square|razorpay|adyen)\b/gi
      },
      analytics: {
        tracking: /\b(google-analytics|mixpanel|amplitude|segment)\b/gi,
        monitoring: /\b(sentry|bugsnag|rollbar|datadog)\b/gi
      }
    };

    this.integrationTypes = {
      synchronous: ['rest', 'grpc', 'database'],
      asynchronous: ['queue', 'webhook', 'event'],
      realtime: ['websocket', 'sse', 'pubsub']
    };
  }

  async analyze(input, context = {}) {
    try {
      const { projectPath, packageJson, files } = input;
      
      const analysis = await this.performAsyncAnalysis(input, async () => {
        const results = {
          apis: await this.analyzeAPIIntegrations(files || projectPath),
          databases: await this.analyzeDatabaseIntegrations(packageJson || projectPath),
          auth: await this.analyzeAuthIntegrations(files || projectPath),
          thirdParty: await this.analyzeThirdPartyIntegrations(packageJson || projectPath),
          webhooks: await this.analyzeWebhookIntegrations(files || projectPath),
          messaging: await this.analyzeMessagingIntegrations(packageJson || projectPath),
          cloud: await this.analyzeCloudIntegrations(packageJson || projectPath),
          config: await this.analyzeIntegrationConfig(projectPath)
        };

        results.summary = this.generateIntegrationSummary(results);
        results.metrics = this.generateIntegrationMetrics(results);
        results.recommendations = this.generateIntegrationRecommendations(results);
        results.complexity = this.calculateIntegrationComplexity(results);
        
        return results;
      });

      return this.createAnalysisResult(analysis, {
        analysisType: 'integration',
        projectPath: typeof input === 'string' ? input : input.projectPath
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  async analyzeAPIIntegrations(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { 
          recursive: true,
          extension: '.js'
        });
        // Also get .ts files
        const tsFiles = await FileUtils.listFiles(filesOrPath, { 
          recursive: true,
          extension: '.ts'
        });
        files.push(...tsFiles);
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const apis = {
        rest: [],
        graphql: [],
        grpc: [],
        webhooks: [],
        endpoints: []
      };

      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (!content) continue;

        const fileApis = this.extractAPICallsFromFile(content, file);
        apis.rest.push(...fileApis.rest);
        apis.graphql.push(...fileApis.graphql);
        apis.grpc.push(...fileApis.grpc);
        apis.endpoints.push(...fileApis.endpoints);
      }

      apis.summary = {
        totalAPIs: apis.rest.length + apis.graphql.length + apis.grpc.length,
        restAPIs: apis.rest.length,
        graphqlAPIs: apis.graphql.length,
        grpcAPIs: apis.grpc.length,
        totalEndpoints: apis.endpoints.length
      };

      return apis;
    } catch (error) {
      logger.error('API integration analysis failed:', error);
      return {};
    }
  }

  extractAPICallsFromFile(content, filePath) {
    const apis = {
      rest: [],
      graphql: [],
      grpc: [],
      endpoints: []
    };

    // Extract REST API calls
    const restPatterns = [
      /axios\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /fetch\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /\.request\s*\(\s*{[^}]*url:\s*['"`]([^'"`]+)['"`]/gi
    ];

    for (const pattern of restPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        apis.rest.push({
          method: match[1] || 'GET',
          url: match[2] || match[1],
          file: filePath,
          line: this.getLineNumber(content, match.index)
        });
      }
    }

    // Extract GraphQL queries
    const graphqlPattern = /(query|mutation|subscription)\s+\w+\s*{[^}]+}/gi;
    let graphqlMatch;
    while ((graphqlMatch = graphqlPattern.exec(content)) !== null) {
      apis.graphql.push({
        type: graphqlMatch[1],
        query: graphqlMatch[0],
        file: filePath,
        line: this.getLineNumber(content, graphqlMatch.index)
      });
    }

    // Extract API endpoints (route definitions)
    const endpointPatterns = [
      /app\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi,
      /@(Get|Post|Put|Delete|Patch)\s*\(\s*['"`]([^'"`]+)['"`]/gi
    ];

    for (const pattern of endpointPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        apis.endpoints.push({
          method: match[1].toUpperCase(),
          path: match[2],
          file: filePath,
          line: this.getLineNumber(content, match.index)
        });
      }
    }

    return apis;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  async analyzeDatabaseIntegrations(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      const databases = {
        sql: [],
        nosql: [],
        orm: [],
        connections: []
      };

      if (!packageJson) return databases;

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check for database packages
      for (const [depName, version] of Object.entries(deps)) {
        if (this.integrationPatterns.database.sql.test(depName)) {
          databases.sql.push({ name: depName, version, type: 'sql' });
        }
        if (this.integrationPatterns.database.nosql.test(depName)) {
          databases.nosql.push({ name: depName, version, type: 'nosql' });
        }
        if (this.integrationPatterns.database.orm.test(depName)) {
          databases.orm.push({ name: depName, version, type: 'orm' });
        }
      }

      databases.summary = {
        totalDatabases: databases.sql.length + databases.nosql.length,
        sqlDatabases: databases.sql.length,
        nosqlDatabases: databases.nosql.length,
        ormTools: databases.orm.length
      };

      return databases;
    } catch (error) {
      logger.error('Database integration analysis failed:', error);
      return {};
    }
  }

  async analyzeAuthIntegrations(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => ['.js', '.ts', '.json'].includes(path.extname(file)));
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const auth = {
        methods: [],
        providers: [],
        middleware: [],
        config: {}
      };

      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (!content) continue;

        const fileAuth = this.extractAuthFromFile(content, file);
        auth.methods.push(...fileAuth.methods);
        auth.providers.push(...fileAuth.providers);
        auth.middleware.push(...fileAuth.middleware);
      }

      auth.summary = {
        authMethods: [...new Set(auth.methods)].length,
        authProviders: [...new Set(auth.providers)].length,
        middlewareCount: auth.middleware.length
      };

      return auth;
    } catch (error) {
      logger.error('Auth integration analysis failed:', error);
      return {};
    }
  }

  extractAuthFromFile(content, filePath) {
    const auth = {
      methods: [],
      providers: [],
      middleware: []
    };

    // Check for auth methods
    if (this.integrationPatterns.auth.jwt.test(content)) {
      auth.methods.push('jwt');
    }
    if (this.integrationPatterns.auth.oauth.test(content)) {
      auth.methods.push('oauth');
    }
    if (this.integrationPatterns.auth.saml.test(content)) {
      auth.methods.push('saml');
    }

    // Check for auth providers
    const providerPatterns = [
      /passport-(\w+)/gi,
      /auth0/gi,
      /firebase\.auth/gi,
      /cognito/gi
    ];

    for (const pattern of providerPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        auth.providers.push(match[1] || match[0]);
      }
    }

    // Check for auth middleware
    const middlewarePatterns = [
      /\.use\s*\(\s*auth/gi,
      /authenticate\s*\(/gi,
      /authorize\s*\(/gi
    ];

    for (const pattern of middlewarePatterns) {
      const matches = content.match(pattern) || [];
      auth.middleware.push(...matches.map(match => ({
        type: 'middleware',
        file: filePath,
        usage: match
      })));
    }

    return auth;
  }

  async analyzeThirdPartyIntegrations(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      const integrations = {
        payment: [],
        analytics: [],
        cloud: [],
        social: [],
        utility: []
      };

      if (!packageJson) return integrations;

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const [depName, version] of Object.entries(deps)) {
        // Payment integrations
        if (this.integrationPatterns.payment.stripe.test(depName)) {
          integrations.payment.push({ name: depName, version, provider: 'stripe' });
        }
        if (this.integrationPatterns.payment.paypal.test(depName)) {
          integrations.payment.push({ name: depName, version, provider: 'paypal' });
        }

        // Analytics integrations
        if (this.integrationPatterns.analytics.tracking.test(depName)) {
          integrations.analytics.push({ name: depName, version, type: 'tracking' });
        }
        if (this.integrationPatterns.analytics.monitoring.test(depName)) {
          integrations.analytics.push({ name: depName, version, type: 'monitoring' });
        }

        // Cloud integrations
        if (this.integrationPatterns.cloud.aws.test(depName)) {
          integrations.cloud.push({ name: depName, version, provider: 'aws' });
        }
        if (this.integrationPatterns.cloud.gcp.test(depName)) {
          integrations.cloud.push({ name: depName, version, provider: 'gcp' });
        }
        if (this.integrationPatterns.cloud.azure.test(depName)) {
          integrations.cloud.push({ name: depName, version, provider: 'azure' });
        }
      }

      integrations.summary = {
        totalIntegrations: Object.values(integrations).flat().length,
        paymentProviders: integrations.payment.length,
        analyticsTools: integrations.analytics.length,
        cloudProviders: integrations.cloud.length
      };

      return integrations;
    } catch (error) {
      logger.error('Third-party integration analysis failed:', error);
      return {};
    }
  }

  async analyzeWebhookIntegrations(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => ['.js', '.ts'].includes(path.extname(file)));
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const webhooks = {
        incoming: [],
        outgoing: [],
        handlers: []
      };

      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (!content) continue;

        const fileWebhooks = this.extractWebhooksFromFile(content, file);
        webhooks.incoming.push(...fileWebhooks.incoming);
        webhooks.outgoing.push(...fileWebhooks.outgoing);
        webhooks.handlers.push(...fileWebhooks.handlers);
      }

      webhooks.summary = {
        totalWebhooks: webhooks.incoming.length + webhooks.outgoing.length,
        incomingWebhooks: webhooks.incoming.length,
        outgoingWebhooks: webhooks.outgoing.length,
        webhookHandlers: webhooks.handlers.length
      };

      return webhooks;
    } catch (error) {
      logger.error('Webhook integration analysis failed:', error);
      return {};
    }
  }

  extractWebhooksFromFile(content, filePath) {
    const webhooks = {
      incoming: [],
      outgoing: [],
      handlers: []
    };

    // Look for webhook endpoints
    const incomingPatterns = [
      /\.post\s*\(\s*['"`][^'"`]*webhook[^'"`]*['"`]/gi,
      /webhook.*handler/gi,
      /on.*webhook/gi
    ];

    for (const pattern of incomingPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        webhooks.incoming.push({
          endpoint: match[0],
          file: filePath,
          line: this.getLineNumber(content, match.index)
        });
      }
    }

    // Look for outgoing webhook calls
    const outgoingPatterns = [
      /axios\.post\s*\([^)]*webhook/gi,
      /fetch\s*\([^)]*webhook/gi,
      /\.send.*webhook/gi
    ];

    for (const pattern of outgoingPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        webhooks.outgoing.push({
          call: match[0],
          file: filePath,
          line: this.getLineNumber(content, match.index)
        });
      }
    }

    return webhooks;
  }

  async analyzeMessagingIntegrations(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      const messaging = {
        queue: [],
        realtime: [],
        pubsub: []
      };

      if (!packageJson) return messaging;

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const [depName, version] of Object.entries(deps)) {
        if (this.integrationPatterns.messaging.queue.test(depName)) {
          messaging.queue.push({ name: depName, version, type: 'queue' });
        }
        if (this.integrationPatterns.messaging.realtime.test(depName)) {
          messaging.realtime.push({ name: depName, version, type: 'realtime' });
        }
      }

      messaging.summary = {
        totalMessaging: messaging.queue.length + messaging.realtime.length,
        queueSystems: messaging.queue.length,
        realtimeSystems: messaging.realtime.length
      };

      return messaging;
    } catch (error) {
      logger.error('Messaging integration analysis failed:', error);
      return {};
    }
  }

  async analyzeCloudIntegrations(packageJsonPath) {
    try {
      let packageJson;
      
      if (typeof packageJsonPath === 'string') {
        const filePath = packageJsonPath.endsWith('package.json') 
          ? packageJsonPath 
          : path.join(packageJsonPath, 'package.json');
        packageJson = await FileUtils.readJSONFile(filePath);
      } else {
        packageJson = packageJsonPath;
      }

      const cloud = {
        aws: [],
        gcp: [],
        azure: [],
        other: []
      };

      if (!packageJson) return cloud;

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      for (const [depName, version] of Object.entries(deps)) {
        if (this.integrationPatterns.cloud.aws.test(depName)) {
          cloud.aws.push({ name: depName, version, provider: 'aws' });
        } else if (this.integrationPatterns.cloud.gcp.test(depName)) {
          cloud.gcp.push({ name: depName, version, provider: 'gcp' });
        } else if (this.integrationPatterns.cloud.azure.test(depName)) {
          cloud.azure.push({ name: depName, version, provider: 'azure' });
        }
      }

      cloud.summary = {
        totalCloudServices: Object.values(cloud).flat().length,
        awsServices: cloud.aws.length,
        gcpServices: cloud.gcp.length,
        azureServices: cloud.azure.length
      };

      return cloud;
    } catch (error) {
      logger.error('Cloud integration analysis failed:', error);
      return {};
    }
  }

  async analyzeIntegrationConfig(projectPath) {
    try {
      const configFiles = [
        '.env',
        '.env.example',
        'config.json',
        'docker-compose.yml',
        'serverless.yml'
      ];

      const config = {
        files: [],
        envVars: [],
        secrets: [],
        services: []
      };

      for (const configFile of configFiles) {
        const filePath = path.join(projectPath, configFile);
        if (await FileUtils.fileExists(filePath)) {
          config.files.push(configFile);
          
          const content = await FileUtils.readFile(filePath);
          if (content) {
            const envVars = this.extractEnvVars(content);
            config.envVars.push(...envVars);
          }
        }
      }

      config.summary = {
        configFiles: config.files.length,
        envVariables: config.envVars.length,
        secrets: config.secrets.length
      };

      return config;
    } catch (error) {
      logger.error('Integration config analysis failed:', error);
      return {};
    }
  }

  extractEnvVars(content) {
    const envVars = [];
    const envPattern = /^([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/gm;
    
    let match;
    while ((match = envPattern.exec(content)) !== null) {
      envVars.push({
        name: match[1],
        value: match[2],
        isSecret: this.isSecretVar(match[1])
      });
    }
    
    return envVars;
  }

  isSecretVar(varName) {
    const secretPatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /api_key/i,
      /private/i
    ];
    
    return secretPatterns.some(pattern => pattern.test(varName));
  }

  calculateIntegrationComplexity(analysis) {
    let complexity = 0;
    
    // API complexity
    complexity += (analysis.apis?.summary?.totalAPIs || 0) * 2;
    
    // Database complexity
    complexity += (analysis.databases?.summary?.totalDatabases || 0) * 3;
    
    // Third-party complexity
    complexity += (analysis.thirdParty?.summary?.totalIntegrations || 0) * 2;
    
    // Messaging complexity
    complexity += (analysis.messaging?.summary?.totalMessaging || 0) * 4;
    
    // Cloud complexity
    complexity += (analysis.cloud?.summary?.totalCloudServices || 0) * 3;
    
    return {
      score: complexity,
      level: this.getComplexityLevel(complexity),
      factors: {
        apis: analysis.apis?.summary?.totalAPIs || 0,
        databases: analysis.databases?.summary?.totalDatabases || 0,
        thirdParty: analysis.thirdParty?.summary?.totalIntegrations || 0,
        messaging: analysis.messaging?.summary?.totalMessaging || 0,
        cloud: analysis.cloud?.summary?.totalCloudServices || 0
      }
    };
  }

  getComplexityLevel(score) {
    if (score < 10) return 'low';
    if (score < 25) return 'medium';
    if (score < 50) return 'high';
    return 'very high';
  }

  generateIntegrationSummary(analysis) {
    const totalIntegrations = (
      (analysis.apis?.summary?.totalAPIs || 0) +
      (analysis.databases?.summary?.totalDatabases || 0) +
      (analysis.thirdParty?.summary?.totalIntegrations || 0) +
      (analysis.messaging?.summary?.totalMessaging || 0) +
      (analysis.cloud?.summary?.totalCloudServices || 0)
    );

    return {
      overview: `Found ${totalIntegrations} total integrations across APIs, databases, and third-party services`,
      totalIntegrations,
      complexity: analysis.complexity?.level || 'unknown',
      riskLevel: this.assessIntegrationRisk(analysis),
      recommendations: this.generateIntegrationRecommendations(analysis).slice(0, 3)
    };
  }

  assessIntegrationRisk(analysis) {
    const factors = [
      (analysis.apis?.summary?.totalAPIs || 0) > 10,
      (analysis.databases?.summary?.totalDatabases || 0) > 3,
      (analysis.thirdParty?.summary?.totalIntegrations || 0) > 5,
      (analysis.messaging?.summary?.totalMessaging || 0) > 2,
      (analysis.cloud?.summary?.totalCloudServices || 0) > 5
    ];

    const riskScore = factors.filter(Boolean).length;
    
    if (riskScore <= 1) return 'low';
    if (riskScore <= 3) return 'medium';
    return 'high';
  }

  generateIntegrationMetrics(analysis) {
    return {
      apiCallsCount: analysis.apis?.summary?.totalAPIs || 0,
      databaseConnections: analysis.databases?.summary?.totalDatabases || 0,
      thirdPartyServices: analysis.thirdParty?.summary?.totalIntegrations || 0,
      messagingChannels: analysis.messaging?.summary?.totalMessaging || 0,
      cloudServices: analysis.cloud?.summary?.totalCloudServices || 0,
      integrationComplexity: analysis.complexity?.score || 0,
      configurationHealth: this.calculateConfigHealth(analysis.config)
    };
  }

  calculateConfigHealth(config) {
    if (!config) return 0;
    
    let score = 50; // Base score
    
    if (config.files?.includes('.env.example')) score += 20;
    if (config.files?.includes('docker-compose.yml')) score += 15;
    if (config.summary?.secrets > 0) score -= 20;
    if (config.summary?.envVariables > 0) score += 15;
    
    return Math.max(0, Math.min(100, score));
  }

  generateIntegrationRecommendations(analysis) {
    const recommendations = [];

    if ((analysis.apis?.summary?.totalAPIs || 0) > 15) {
      recommendations.push({
        type: 'api',
        priority: 'medium',
        message: 'Consider implementing API rate limiting and caching for high API usage',
        action: 'Implement rate limiting middleware and response caching'
      });
    }

    if ((analysis.databases?.summary?.totalDatabases || 0) > 3) {
      recommendations.push({
        type: 'database',
        priority: 'high',
        message: 'Multiple database systems detected - consider consolidation',
        action: 'Evaluate if all databases are necessary or can be consolidated'
      });
    }

    if ((analysis.thirdParty?.summary?.totalIntegrations || 0) > 8) {
      recommendations.push({
        type: 'dependency',
        priority: 'medium',
        message: 'High number of third-party integrations increases complexity',
        action: 'Document all integrations and create fallback strategies'
      });
    }

    if (analysis.config?.summary?.secrets > 0) {
      recommendations.push({
        type: 'security',
        priority: 'critical',
        message: 'Secrets detected in configuration files',
        action: 'Move secrets to secure environment variables or vault'
      });
    }

    if (!analysis.config?.files?.includes('.env.example')) {
      recommendations.push({
        type: 'documentation',
        priority: 'low',
        message: 'Add .env.example file for configuration documentation',
        action: 'Create .env.example with placeholder values'
      });
    }

    return recommendations;
  }
}

module.exports = { IntegrationAnalyzer };