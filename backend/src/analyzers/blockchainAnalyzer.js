const { BaseAnalyzer } = require('./baseAnalyzer');
const { FileUtils } = require('../utils/file-utils');
const { logger } = require('../utils/logger');
const path = require('path');

class BlockchainAnalyzer extends BaseAnalyzer {
  constructor(options = {}) {
    super(options);
    this.blockchainFrameworks = {
      ethereum: {
        packages: ['web3', 'ethers', '@openzeppelin/contracts', 'truffle', 'hardhat'],
        extensions: ['.sol'],
        networks: ['mainnet', 'goerli', 'sepolia', 'polygon', 'arbitrum']
      },
      solana: {
        packages: ['@solana/web3.js', '@project-serum/anchor', '@solana/spl-token'],
        extensions: ['.rs'],
        networks: ['mainnet-beta', 'devnet', 'testnet']
      },
      binance: {
        packages: ['@binance-chain/javascript-sdk'],
        extensions: ['.sol'],
        networks: ['bsc-mainnet', 'bsc-testnet']
      },
      polkadot: {
        packages: ['@polkadot/api', '@polkadot/extension-dapp'],
        extensions: ['.rs'],
        networks: ['polkadot', 'kusama']
      },
      cardano: {
        packages: ['@emurgo/cardano-serialization-lib', 'lucid-cardano'],
        extensions: ['.hs', '.plutus'],
        networks: ['mainnet', 'testnet']
      },
      hyperledger: {
        packages: ['fabric-network', 'fabric-ca-client'],
        extensions: ['.go', '.js'],
        networks: ['private']
      }
    };

    this.smartContractPatterns = {
      ethereum: {
        contract: /contract\s+(\w+)\s*{/g,
        function: /function\s+(\w+)\s*\([^)]*\)\s*(public|private|internal|external)?/g,
        modifier: /modifier\s+(\w+)\s*\([^)]*\)/g,
        event: /event\s+(\w+)\s*\([^)]*\)/g,
        mapping: /mapping\s*\([^)]+\)\s+(\w+)/g,
        struct: /struct\s+(\w+)\s*{/g
      },
      solana: {
        program: /#\[program\]/g,
        instruction: /pub\s+fn\s+(\w+)/g,
        account: /#\[account\]/g,
        state: /#\[state\]/g
      }
    };

    this.securityPatterns = {
      reentrancy: /\.call\s*\{/g,
      overflow: /\+\+|\-\-|[\+\-\*\/]\s*=/g,
      unchecked: /unchecked\s*{/g,
      selfdestruct: /selfdestruct\s*\(/g,
      delegatecall: /delegatecall\s*\(/g,
      timestamp: /block\.timestamp|now/g,
      randomness: /block\.difficulty|blockhash/g
    };

    this.defiPatterns = {
      token: /ERC20|ERC721|ERC1155/g,
      exchange: /swap|exchange|trade|liquidity/gi,
      lending: /lend|borrow|collateral|interest/gi,
      staking: /stake|unstake|reward|yield/gi,
      governance: /vote|proposal|governance|dao/gi,
      oracle: /oracle|price|feed|chainlink/gi
    };
  }

  async analyze(input, context = {}) {
    try {
      const { projectPath, packageJson, files } = input;
      
      const analysis = await this.performAsyncAnalysis(input, async () => {
        const results = {
          blockchain: await this.detectBlockchainFramework(packageJson || projectPath),
          contracts: await this.analyzeSmartContracts(files || projectPath),
          security: await this.analyzeSecurityPatterns(files || projectPath),
          defi: await this.analyzeDeFiFeatures(files || projectPath),
          networks: await this.analyzeNetworkConfig(projectPath),
          testing: await this.analyzeBlockchainTesting(packageJson || projectPath),
          deployment: await this.analyzeDeploymentConfig(projectPath),
          governance: await this.analyzeGovernanceFeatures(files || projectPath),
          tokenomics: await this.analyzeTokenomics(files || projectPath),
          interoperability: await this.analyzeInteroperability(files || projectPath)
        };

        results.summary = this.generateBlockchainSummary(results);
        results.metrics = this.generateBlockchainMetrics(results);
        results.recommendations = this.generateBlockchainRecommendations(results);
        results.complexity = this.calculateBlockchainComplexity(results);
        results.riskAssessment = this.assessBlockchainRisks(results);
        
        return results;
      });

      return this.createAnalysisResult(analysis, {
        analysisType: 'blockchain',
        projectPath: typeof input === 'string' ? input : input.projectPath
      });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  async detectBlockchainFramework(packageJsonPath) {
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

      const framework = {
        primary: 'unknown',
        networks: [],
        packages: [],
        confidence: 0
      };

      if (!packageJson) {
        // Check for non-JS blockchain projects
        const projectPath = typeof packageJsonPath === 'string' ? 
          (packageJsonPath.endsWith('package.json') ? path.dirname(packageJsonPath) : packageJsonPath) : 
          '.';
        
        if (await FileUtils.fileExists(path.join(projectPath, 'Cargo.toml'))) {
          framework.primary = 'solana';
          framework.confidence = 80;
          return framework;
        }
        
        if (await FileUtils.fileExists(path.join(projectPath, 'truffle-config.js')) ||
            await FileUtils.fileExists(path.join(projectPath, 'hardhat.config.js'))) {
          framework.primary = 'ethereum';
          framework.confidence = 90;
          return framework;
        }
        
        return framework;
      }

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };
      let maxConfidence = 0;

      for (const [blockchainName, config] of Object.entries(this.blockchainFrameworks)) {
        const foundPackages = config.packages.filter(pkg => 
          Object.keys(deps).some(dep => dep.includes(pkg))
        );
        
        if (foundPackages.length > 0) {
          const confidence = Math.min(100, (foundPackages.length / config.packages.length) * 100 + 20);
          
          if (confidence > maxConfidence) {
            framework.primary = blockchainName;
            framework.confidence = confidence;
            framework.packages = foundPackages.map(pkg => ({
              name: pkg,
              version: deps[pkg] || 'unknown'
            }));
            framework.networks = config.networks;
            maxConfidence = confidence;
          }
        }
      }

      return framework;
    } catch (error) {
      logger.error('Blockchain framework detection failed:', error);
      return { primary: 'unknown', networks: [], packages: [], confidence: 0 };
    }
  }

  async analyzeSmartContracts(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => {
          const ext = path.extname(file);
          return ['.sol', '.rs', '.go', '.js', '.ts'].includes(ext);
        });
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const contracts = {
        solidity: [],
        rust: [],
        other: [],
        functions: [],
        events: [],
        modifiers: [],
        interfaces: []
      };

      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (!content) continue;

        const ext = path.extname(file);
        
        if (ext === '.sol') {
          const solidityAnalysis = this.analyzeSolidityContract(content, file);
          contracts.solidity.push(solidityAnalysis);
          contracts.functions.push(...solidityAnalysis.functions);
          contracts.events.push(...solidityAnalysis.events);
          contracts.modifiers.push(...solidityAnalysis.modifiers);
        } else if (ext === '.rs') {
          const rustAnalysis = this.analyzeRustContract(content, file);
          contracts.rust.push(rustAnalysis);
        } else {
          const genericAnalysis = this.analyzeGenericContract(content, file);
          contracts.other.push(genericAnalysis);
        }
      }

      contracts.summary = {
        totalContracts: contracts.solidity.length + contracts.rust.length + contracts.other.length,
        solidityContracts: contracts.solidity.length,
        rustContracts: contracts.rust.length,
        totalFunctions: contracts.functions.length,
        totalEvents: contracts.events.length,
        complexity: this.calculateContractComplexity(contracts)
      };

      return contracts;
    } catch (error) {
      logger.error('Smart contract analysis failed:', error);
      return {};
    }
  }

  analyzeSolidityContract(content, filePath) {
    const contract = {
      name: path.basename(filePath, '.sol'),
      file: filePath,
      contracts: [],
      functions: [],
      events: [],
      modifiers: [],
      mappings: [],
      structs: [],
      imports: [],
      pragma: null
    };

    const patterns = this.smartContractPatterns.ethereum;

    // Extract contract declarations
    let match;
    while ((match = patterns.contract.exec(content)) !== null) {
      contract.contracts.push({
        name: match[1],
        line: this.getLineNumber(content, match.index)
      });
    }

    // Extract functions
    patterns.function.lastIndex = 0;
    while ((match = patterns.function.exec(content)) !== null) {
      contract.functions.push({
        name: match[1],
        visibility: match[2] || 'public',
        line: this.getLineNumber(content, match.index)
      });
    }

    // Extract events
    patterns.event.lastIndex = 0;
    while ((match = patterns.event.exec(content)) !== null) {
      contract.events.push({
        name: match[1],
        line: this.getLineNumber(content, match.index)
      });
    }

    // Extract modifiers
    patterns.modifier.lastIndex = 0;
    while ((match = patterns.modifier.exec(content)) !== null) {
      contract.modifiers.push({
        name: match[1],
        line: this.getLineNumber(content, match.index)
      });
    }

    // Extract pragma
    const pragmaMatch = content.match(/pragma\s+solidity\s+([^;]+);/);
    if (pragmaMatch) {
      contract.pragma = pragmaMatch[1];
    }

    // Extract imports
    const importMatches = content.match(/import\s+["'][^"']+["'];/g) || [];
    contract.imports = importMatches;

    return contract;
  }

  analyzeRustContract(content, filePath) {
    const contract = {
      name: path.basename(filePath, '.rs'),
      file: filePath,
      programs: [],
      instructions: [],
      accounts: [],
      imports: []
    };

    const patterns = this.smartContractPatterns.solana;

    // Extract Solana program markers
    const programMatches = content.match(patterns.program) || [];
    contract.programs = programMatches.length;

    // Extract instructions
    let match;
    patterns.instruction.lastIndex = 0;
    while ((match = patterns.instruction.exec(content)) !== null) {
      contract.instructions.push({
        name: match[1],
        line: this.getLineNumber(content, match.index)
      });
    }

    // Extract account structures
    const accountMatches = content.match(patterns.account) || [];
    contract.accounts = accountMatches.length;

    return contract;
  }

  analyzeGenericContract(content, filePath) {
    const contract = {
      name: path.basename(filePath),
      file: filePath,
      type: 'generic',
      functions: this.extractGenericFunctions(content),
      classes: this.extractGenericClasses(content)
    };

    return contract;
  }

  extractGenericFunctions(content) {
    const functionPattern = /(?:function|async\s+function|const\s+\w+\s*=\s*(?:async\s*)?\([^)]*\)\s*=>|\w+\s*\([^)]*\)\s*{)/g;
    const functions = [];
    
    let match;
    while ((match = functionPattern.exec(content)) !== null) {
      functions.push({
        signature: match[0],
        line: this.getLineNumber(content, match.index)
      });
    }
    
    return functions;
  }

  extractGenericClasses(content) {
    const classPattern = /class\s+(\w+)/g;
    const classes = [];
    
    let match;
    while ((match = classPattern.exec(content)) !== null) {
      classes.push({
        name: match[1],
        line: this.getLineNumber(content, match.index)
      });
    }
    
    return classes;
  }

  calculateContractComplexity(contracts) {
    let complexity = 0;
    
    complexity += contracts.solidity.length * 5;
    complexity += contracts.rust.length * 6;
    complexity += contracts.functions.length * 2;
    complexity += contracts.events.length;
    complexity += contracts.modifiers.length * 3;
    
    return complexity;
  }

  getLineNumber(content, index) {
    return content.substring(0, index).split('\n').length;
  }

  async analyzeSecurityPatterns(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => ['.sol', '.rs', '.js', '.ts'].includes(path.extname(file)));
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const security = {
        vulnerabilities: [],
        patterns: {},
        riskLevel: 'low',
        recommendations: []
      };

      let totalContent = '';
      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) totalContent += content + ' ';
      }

      // Analyze security patterns
      for (const [patternName, pattern] of Object.entries(this.securityPatterns)) {
        const matches = totalContent.match(pattern) || [];
        if (matches.length > 0) {
          security.patterns[patternName] = matches.length;
          security.vulnerabilities.push({
            type: patternName,
            count: matches.length,
            severity: this.getVulnerabilitySeverity(patternName),
            description: this.getVulnerabilityDescription(patternName)
          });
        }
      }

      security.riskLevel = this.calculateSecurityRisk(security.vulnerabilities);
      security.recommendations = this.generateSecurityRecommendations(security.vulnerabilities);

      security.summary = {
        totalVulnerabilities: security.vulnerabilities.length,
        criticalIssues: security.vulnerabilities.filter(v => v.severity === 'critical').length,
        highIssues: security.vulnerabilities.filter(v => v.severity === 'high').length,
        riskLevel: security.riskLevel
      };

      return security;
    } catch (error) {
      logger.error('Security pattern analysis failed:', error);
      return {};
    }
  }

  getVulnerabilitySeverity(patternName) {
    const severityMap = {
      reentrancy: 'critical',
      selfdestruct: 'critical',
      delegatecall: 'high',
      overflow: 'high',
      timestamp: 'medium',
      randomness: 'medium',
      unchecked: 'low'
    };
    
    return severityMap[patternName] || 'low';
  }

  getVulnerabilityDescription(patternName) {
    const descriptions = {
      reentrancy: 'Potential reentrancy vulnerability detected',
      selfdestruct: 'Use of selfdestruct function detected',
      delegatecall: 'Use of delegatecall detected - review for security',
      overflow: 'Potential integer overflow/underflow',
      timestamp: 'Dependency on block timestamp',
      randomness: 'Weak randomness source detected',
      unchecked: 'Unchecked arithmetic operations'
    };
    
    return descriptions[patternName] || 'Security pattern detected';
  }

  calculateSecurityRisk(vulnerabilities) {
    const criticalCount = vulnerabilities.filter(v => v.severity === 'critical').length;
    const highCount = vulnerabilities.filter(v => v.severity === 'high').length;
    
    if (criticalCount > 0) return 'critical';
    if (highCount > 2) return 'high';
    if (highCount > 0 || vulnerabilities.length > 5) return 'medium';
    return 'low';
  }

  generateSecurityRecommendations(vulnerabilities) {
    const recommendations = [];
    
    if (vulnerabilities.some(v => v.type === 'reentrancy')) {
      recommendations.push('Implement reentrancy guards using OpenZeppelin ReentrancyGuard');
    }
    
    if (vulnerabilities.some(v => v.type === 'overflow')) {
      recommendations.push('Use SafeMath library or Solidity 0.8+ for overflow protection');
    }
    
    if (vulnerabilities.some(v => v.type === 'timestamp')) {
      recommendations.push('Avoid using block.timestamp for critical logic');
    }
    
    return recommendations;
  }

  async analyzeDeFiFeatures(filesOrPath) {
    try {
      let files = [];
      
      if (typeof filesOrPath === 'string') {
        files = await FileUtils.listFiles(filesOrPath, { recursive: true });
        files = files.filter(file => ['.sol', '.js', '.ts'].includes(path.extname(file)));
      } else {
        files = Array.isArray(filesOrPath) ? filesOrPath : [filesOrPath];
      }

      const defi = {
        features: {},
        protocols: [],
        tokens: [],
        integrations: []
      };

      let totalContent = '';
      for (const file of files) {
        const content = await FileUtils.readFile(file);
        if (content) totalContent += content + ' ';
      }

      // Analyze DeFi patterns
      for (const [featureName, pattern] of Object.entries(this.defiPatterns)) {
        const matches = totalContent.match(pattern) || [];
        defi.features[featureName] = {
          detected: matches.length > 0,
          count: matches.length,
          keywords: [...new Set(matches.map(m => m.toLowerCase()))]
        };
      }

      // Detect specific protocols
      defi.protocols = this.detectDeFiProtocols(totalContent);
      defi.tokens = this.detectTokenStandards(totalContent);
      defi.integrations = this.detectDeFiIntegrations(totalContent);

      defi.summary = {
        totalFeatures: Object.values(defi.features).filter(f => f.detected).length,
        protocols: defi.protocols.length,
        tokenStandards: defi.tokens.length,
        category: this.categorizeDeFiProject(defi)
      };

      return defi;
    } catch (error) {
      logger.error('DeFi features analysis failed:', error);
      return {};
    }
  }

  detectDeFiProtocols(content) {
    const protocols = [];
    const protocolPatterns = {
      uniswap: /uniswap|IUniswap/gi,
      aave: /aave|IAave/gi,
      compound: /compound|ICompound/gi,
      makerdao: /maker|dai/gi,
      synthetix: /synthetix|synth/gi,
      yearn: /yearn|vault/gi,
      curve: /curve|CRV/gi,
      sushiswap: /sushiswap|sushi/gi
    };

    for (const [protocol, pattern] of Object.entries(protocolPatterns)) {
      if (pattern.test(content)) {
        protocols.push(protocol);
      }
    }

    return protocols;
  }

  detectTokenStandards(content) {
    const tokens = [];
    const tokenPatterns = {
      erc20: /ERC20|IERC20/gi,
      erc721: /ERC721|IERC721/gi,
      erc1155: /ERC1155|IERC1155/gi,
      erc777: /ERC777|IERC777/gi
    };

    for (const [standard, pattern] of Object.entries(tokenPatterns)) {
      if (pattern.test(content)) {
        tokens.push(standard);
      }
    }

    return tokens;
  }

  detectDeFiIntegrations(content) {
    const integrations = [];
    const integrationPatterns = {
      chainlink: /chainlink|@chainlink/gi,
      thegraph: /graph|subgraph/gi,
      ipfs: /ipfs|pinata/gi,
      metamask: /metamask|web3/gi
    };

    for (const [integration, pattern] of Object.entries(integrationPatterns)) {
      if (pattern.test(content)) {
        integrations.push(integration);
      }
    }

    return integrations;
  }

  categorizeDeFiProject(defi) {
    const features = defi.features;
    
    if (features.exchange?.detected && features.token?.detected) return 'DEX';
    if (features.lending?.detected) return 'Lending Protocol';
    if (features.staking?.detected) return 'Staking Protocol';
    if (features.governance?.detected) return 'DAO/Governance';
    if (features.token?.detected) return 'Token Project';
    if (features.oracle?.detected) return 'Oracle Service';
    
    return 'General DeFi';
  }

  async analyzeNetworkConfig(projectPath) {
    try {
      const networks = {
        configured: [],
        config: {},
        deployment: {}
      };

      if (!projectPath) return networks;

      // Check for network configuration files
      const configFiles = [
        'hardhat.config.js',
        'truffle-config.js',
        'brownie-config.yaml',
        'foundry.toml'
      ];

      for (const configFile of configFiles) {
        const filePath = path.join(projectPath, configFile);
        if (await FileUtils.fileExists(filePath)) {
          const content = await FileUtils.readFile(filePath);
          if (content) {
            networks.config[configFile] = this.parseNetworkConfig(content);
            networks.configured = [...new Set([...networks.configured, ...Object.keys(networks.config[configFile])])];
          }
        }
      }

      networks.summary = {
        totalNetworks: networks.configured.length,
        hasMainnet: networks.configured.includes('mainnet'),
        hasTestnet: networks.configured.some(net => net.includes('test') || net.includes('goerli')),
        configFiles: Object.keys(networks.config).length
      };

      return networks;
    } catch (error) {
      logger.error('Network config analysis failed:', error);
      return {};
    }
  }

  parseNetworkConfig(content) {
    const networks = {};
    
    // Simple regex-based parsing for network names
    const networkPattern = /(\w+):\s*{[^}]*url:/g;
    let match;
    
    while ((match = networkPattern.exec(content)) !== null) {
      networks[match[1]] = { configured: true };
    }
    
    return networks;
  }

  async analyzeBlockchainTesting(packageJsonPath) {
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

      const testing = {
        frameworks: [],
        tools: [],
        coverage: false
      };

      if (!packageJson) return testing;

      const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

      // Check for blockchain testing frameworks
      const testingFrameworks = {
        hardhat: /hardhat/i,
        truffle: /truffle/i,
        foundry: /foundry/i,
        brownie: /brownie/i,
        waffle: /waffle/i,
        ganache: /ganache/i
      };

      for (const [framework, pattern] of Object.entries(testingFrameworks)) {
        if (Object.keys(deps).some(dep => pattern.test(dep))) {
          testing.frameworks.push(framework);
        }
      }

      // Check for testing tools
      const testingTools = {
        chai: /chai/i,
        mocha: /mocha/i,
        jest: /jest/i,
        solhint: /solhint/i,
        slither: /slither/i
      };

      for (const [tool, pattern] of Object.entries(testingTools)) {
        if (Object.keys(deps).some(dep => pattern.test(dep))) {
          testing.tools.push(tool);
        }
      }

      testing.coverage = Object.keys(deps).some(dep => dep.includes('coverage'));

      testing.summary = {
        testingFrameworks: testing.frameworks.length,
        testingTools: testing.tools.length,
        coverageEnabled: testing.coverage
      };

      return testing;
    } catch (error) {
      logger.error('Blockchain testing analysis failed:', error);
      return {};
    }
  }

  async analyzeDeploymentConfig(projectPath) {
    try {
      const deployment = {
        scripts: [],
        automation: false,
        verification: false,
        monitoring: false
      };

      if (!projectPath) return deployment;

      // Check for deployment scripts
      const scriptDirs = ['scripts/', 'deploy/', 'migrations/'];
      for (const dir of scriptDirs) {
        const dirPath = path.join(projectPath, dir);
        if (await FileUtils.fileExists(dirPath)) {
          const files = await FileUtils.listFiles(dirPath);
          deployment.scripts.push(...files);
        }
      }

      // Check for CI/CD configuration
      const ciFiles = ['.github/workflows/', '.gitlab-ci.yml', 'azure-pipelines.yml'];
      for (const file of ciFiles) {
        if (await FileUtils.fileExists(path.join(projectPath, file))) {
          deployment.automation = true;
          break;
        }
      }

      deployment.summary = {
        deploymentScripts: deployment.scripts.length,
        automationConfigured: deployment.automation,
        verificationSetup: deployment.verification,
        monitoringSetup: deployment.monitoring
      };

      return deployment;
    } catch (error) {
      logger.error('Deployment config analysis failed:', error);
      return {};
    }
  }

  async analyzeGovernanceFeatures(filesOrPath) {
    // Mock governance analysis
    return {
      features: {
        voting: { implemented: false, type: 'none' },
        proposals: { implemented: false, count: 0 },
        timelock: { implemented: false },
        multisig: { implemented: false },
        delegation: { implemented: false }
      },
      tokens: {
        governanceToken: false,
        votingPower: 'none'
      },
      summary: {
        governanceScore: 0,
        decentralizationLevel: 'centralized'
      }
    };
  }

  async analyzeTokenomics(filesOrPath) {
    // Mock tokenomics analysis
    return {
      supply: {
        totalSupply: 'unknown',
        maxSupply: 'unknown',
        supplyType: 'unknown'
      },
      distribution: {
        publicSale: 0,
        team: 0,
        treasury: 0,
        ecosystem: 0
      },
      mechanisms: {
        burning: false,
        minting: false,
        staking: false,
        reflection: false
      },
      summary: {
        tokenomicsComplexity: 'simple',
        inflationaryModel: false
      }
    };
  }

  async analyzeInteroperability(filesOrPath) {
    // Mock interoperability analysis
    return {
      bridges: {
        implemented: false,
        networks: []
      },
      oracles: {
        integrated: false,
        providers: []
      },
      crossChain: {
        protocols: [],
        features: []
      },
      summary: {
        interoperabilityScore: 0,
        crossChainReady: false
      }
    };
  }

  calculateBlockchainComplexity(analysis) {
    let complexity = 0;
    
    // Framework complexity
    const frameworkComplexity = {
      ethereum: 6,
      solana: 7,
      polkadot: 8,
      cardano: 7,
      hyperledger: 9
    };
    complexity += frameworkComplexity[analysis.blockchain?.primary] || 5;
    
    // Contract complexity
    complexity += (analysis.contracts?.summary?.totalContracts || 0) * 3;
    complexity += (analysis.contracts?.summary?.totalFunctions || 0) * 0.5;
    
    // Security complexity
    complexity += (analysis.security?.summary?.totalVulnerabilities || 0) * 2;
    
    // DeFi complexity
    complexity += (analysis.defi?.summary?.totalFeatures || 0) * 2;
    
    // Network complexity
    complexity += (analysis.networks?.summary?.totalNetworks || 0);
    
    return {
      score: complexity,
      level: this.getComplexityLevel(complexity),
      factors: {
        framework: analysis.blockchain?.primary,
        contracts: analysis.contracts?.summary?.totalContracts || 0,
        security: analysis.security?.summary?.totalVulnerabilities || 0,
        defi: analysis.defi?.summary?.totalFeatures || 0,
        networks: analysis.networks?.summary?.totalNetworks || 0
      }
    };
  }

  getComplexityLevel(score) {
    if (score < 20) return 'low';
    if (score < 40) return 'medium';
    if (score < 70) return 'high';
    return 'very high';
  }

  assessBlockchainRisks(analysis) {
    const risks = [];
    
    if (analysis.security?.riskLevel === 'critical') {
      risks.push({ type: 'security', level: 'critical', message: 'Critical security vulnerabilities detected' });
    }
    
    if ((analysis.contracts?.summary?.totalContracts || 0) > 10) {
      risks.push({ type: 'complexity', level: 'medium', message: 'High number of smart contracts increases risk' });
    }
    
    if (!analysis.testing?.summary?.testingFrameworks) {
      risks.push({ type: 'testing', level: 'high', message: 'No testing framework detected for smart contracts' });
    }
    
    return {
      risks,
      overallRisk: this.calculateOverallRisk(risks),
      mitigationStrategies: this.generateRiskMitigations(risks)
    };
  }

  calculateOverallRisk(risks) {
    const criticalCount = risks.filter(r => r.level === 'critical').length;
    const highCount = risks.filter(r => r.level === 'high').length;
    
    if (criticalCount > 0) return 'critical';
    if (highCount > 1) return 'high';
    if (highCount > 0 || risks.length > 3) return 'medium';
    return 'low';
  }

  generateRiskMitigations(risks) {
    const mitigations = [];
    
    if (risks.some(r => r.type === 'security')) {
      mitigations.push('Conduct thorough security audit before mainnet deployment');
    }
    
    if (risks.some(r => r.type === 'testing')) {
      mitigations.push('Implement comprehensive testing suite with high coverage');
    }
    
    if (risks.some(r => r.type === 'complexity')) {
      mitigations.push('Consider modular architecture and formal verification');
    }
    
    return mitigations;
  }

  generateBlockchainSummary(analysis) {
    const blockchain = analysis.blockchain?.primary || 'unknown';
    const contracts = analysis.contracts?.summary?.totalContracts || 0;
    const security = analysis.security?.riskLevel || 'unknown';

    return {
      overview: `${blockchain} blockchain project with ${contracts} smart contracts and ${security} security risk`,
      blockchain: analysis.blockchain,
      complexity: analysis.complexity?.level || 'unknown',
      security: security,
      category: analysis.defi?.summary?.category || 'General Blockchain',
      recommendations: this.generateBlockchainRecommendations(analysis).slice(0, 3)
    };
  }

  generateBlockchainMetrics(analysis) {
    return {
      frameworkConfidence: analysis.blockchain?.confidence || 0,
      contractCount: analysis.contracts?.summary?.totalContracts || 0,
      functionCount: analysis.contracts?.summary?.totalFunctions || 0,
      securityScore: this.calculateSecurityScore(analysis.security),
      defiFeatures: analysis.defi?.summary?.totalFeatures || 0,
      networkSupport: analysis.networks?.summary?.totalNetworks || 0,
      testingCoverage: analysis.testing?.summary?.testingFrameworks || 0,
      overallComplexity: analysis.complexity?.score || 0,
      riskLevel: analysis.riskAssessment?.overallRisk || 'unknown'
    };
  }

  calculateSecurityScore(security) {
    if (!security) return 0;
    
    let score = 100;
    score -= (security.summary?.criticalIssues || 0) * 30;
    score -= (security.summary?.highIssues || 0) * 15;
    score -= (security.summary?.totalVulnerabilities || 0) * 5;
    
    return Math.max(0, score);
  }

  generateBlockchainRecommendations(analysis) {
    const recommendations = [];

    if ((analysis.blockchain?.confidence || 0) < 80) {
      recommendations.push({
        type: 'framework',
        priority: 'medium',
        message: 'Blockchain framework detection confidence is low',
        action: 'Verify project dependencies and configuration'
      });
    }

    if (!analysis.testing?.summary?.testingFrameworks) {
      recommendations.push({
        type: 'testing',
        priority: 'critical',
        message: 'No testing framework detected for smart contracts',
        action: 'Implement Hardhat, Truffle, or Foundry for testing'
      });
    }

    if (analysis.security?.riskLevel === 'critical' || analysis.security?.riskLevel === 'high') {
      recommendations.push({
        type: 'security',
        priority: 'critical',
        message: 'High security risk detected in smart contracts',
        action: 'Conduct security audit and fix vulnerabilities'
      });
    }

    if ((analysis.contracts?.summary?.totalContracts || 0) > 5 && !analysis.deployment?.summary?.automationConfigured) {
      recommendations.push({
        type: 'deployment',
        priority: 'medium',
        message: 'Consider setting up automated deployment pipeline',
        action: 'Configure CI/CD for automated testing and deployment'
      });
    }

    if (!analysis.networks?.summary?.hasTestnet) {
      recommendations.push({
        type: 'network',
        priority: 'high',
        message: 'No testnet configuration detected',
        action: 'Add testnet configuration for development and testing'
      });
    }

    if (analysis.defi?.summary?.totalFeatures > 3 && !analysis.governance?.summary?.governanceScore) {
      recommendations.push({
        type: 'governance',
        priority: 'low',
        message: 'Consider implementing governance features for DeFi project',
        action: 'Add governance token and voting mechanisms'
      });
    }

    return recommendations;
  }
}

module.exports = { BlockchainAnalyzer };