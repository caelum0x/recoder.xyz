const { BaseValidator } = require('./baseValidator');
const { logger } = require('../utils/logger');

class BlockchainValidator extends BaseValidator {
  constructor(options = {}) {
    super(options);
    this.registerBlockchainRules();
  }

  registerBlockchainRules() {
    // Blockchain-specific validation rules
    this.registerRule('valid_contract_syntax', {
      check: (code, context) => this.validateContractSyntax(code, context.language),
      message: 'Smart contract contains syntax errors',
      severity: 'error'
    });

    this.registerRule('no_security_vulnerabilities', {
      check: (code) => this.checkContractSecurity(code),
      message: 'Smart contract contains security vulnerabilities',
      severity: 'error'
    });

    this.registerRule('gas_optimization', {
      check: (code) => this.checkGasOptimization(code),
      message: 'Contract may have gas optimization issues',
      severity: 'warning'
    });

    this.registerRule('proper_access_control', {
      check: (code) => this.checkAccessControl(code),
      message: 'Contract lacks proper access control mechanisms',
      severity: 'error'
    });

    this.registerRule('reentrancy_protection', {
      check: (code) => this.checkReentrancyProtection(code),
      message: 'Contract vulnerable to reentrancy attacks',
      severity: 'error'
    });

    this.registerRule('overflow_protection', {
      check: (code) => this.checkOverflowProtection(code),
      message: 'Contract may be vulnerable to integer overflow/underflow',
      severity: 'error'
    });

    this.registerRule('proper_events', {
      check: (code) => this.checkEventEmission(code),
      message: 'Contract should emit events for important state changes',
      severity: 'warning'
    });

    this.registerRule('upgradability_pattern', {
      check: (code, context) => this.checkUpgradabilityPattern(code, context),
      message: 'Consider implementing upgradability patterns for maintenance',
      severity: 'suggestion'
    });

    this.registerRule('valid_network_config', {
      check: (config) => this.validateNetworkConfig(config),
      message: 'Invalid blockchain network configuration',
      severity: 'error'
    });

    this.registerRule('proper_testing', {
      check: (tests) => this.validateContractTests(tests),
      message: 'Insufficient test coverage for smart contracts',
      severity: 'warning'
    });
  }

  async validate(input, context = {}) {
    try {
      this.validateInput(input, ['blockchain', 'contracts']);

      const result = await this.performAsyncValidation(input, async () => {
        this.reset();

        const blockchainConfig = this.analyzeBlockchainProject(input);
        
        // Validate smart contracts
        await this.validateSmartContracts(blockchainConfig);
        
        // Validate network configuration
        this.validateNetworkConfiguration(blockchainConfig);
        
        // Validate deployment configuration
        this.validateDeploymentConfiguration(blockchainConfig);
        
        // Check security best practices
        this.validateSecurityBestPractices(blockchainConfig);
        
        // Validate testing approach
        this.validateTestingStrategy(blockchainConfig);
        
        // Check tokenomics if applicable
        if (blockchainConfig.hasToken) {
          this.validateTokenomics(blockchainConfig);
        }
        
        return this.createValidationResult(true, {
          blockchain: blockchainConfig.blockchain,
          contractCount: blockchainConfig.contracts.length,
          securityIssues: this.results.errors.filter(e => e.rule && e.rule.includes('security')).length
        });
      });

      return result;
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  analyzeBlockchainProject(input) {
    const config = {
      blockchain: input.blockchain,
      contracts: input.contracts || [],
      networks: input.networks || [],
      testFiles: input.testFiles || [],
      deploymentConfig: input.deploymentConfig || {},
      tokenConfig: input.tokenConfig || null,
      hasToken: !!input.tokenConfig,
      securityLevel: input.securityLevel || 'standard',
      gasOptimization: input.gasOptimization || true,
      auditRequired: input.auditRequired || false
    };

    return config;
  }

  async validateSmartContracts(config) {
    for (const contract of config.contracts) {
      await this.validateSingleContract(contract, config);
    }
  }

  async validateSingleContract(contract, config) {
    const context = { 
      contract: contract.name, 
      language: this.detectContractLanguage(contract.code, config.blockchain) 
    };
    
    // Basic structure validation
    this.validateContractStructure(contract, context);
    
    // Syntax validation
    this.validateField('code', contract.code, ['valid_contract_syntax'], context);
    
    // Security validation
    this.validateContractSecurity(contract, context);
    
    // Gas optimization
    if (config.gasOptimization) {
      this.validateField('code', contract.code, ['gas_optimization'], context);
    }
    
    // Access control
    this.validateField('code', contract.code, ['proper_access_control'], context);
    
    // Event emission
    this.validateField('code', contract.code, ['proper_events'], context);
    
    // Upgradability
    this.validateField('code', contract.code, ['upgradability_pattern'], context);
  }

  detectContractLanguage(code, blockchain) {
    if (blockchain === 'ethereum' || blockchain === 'polygon' || blockchain === 'bsc') {
      if (code.includes('pragma solidity')) return 'solidity';
      if (code.includes('contract ') && code.includes('function ')) return 'solidity';
    }
    
    if (blockchain === 'solana') {
      if (code.includes('use anchor_lang')) return 'rust';
      if (code.includes('#[program]')) return 'rust';
    }
    
    if (blockchain === 'cardano') {
      if (code.includes('module ') && code.includes('PlutusTx')) return 'haskell';
    }
    
    return 'unknown';
  }

  validateContractStructure(contract, context) {
    // Required fields
    if (!contract.name) {
      this.addError('Contract name is required');
    }
    
    if (!contract.code) {
      this.addError('Contract code is required');
    }
    
    // Name validation
    if (contract.name && !this.validateIdentifier(contract.name, 'contract name')) {
      return;
    }
    
    // Version validation
    if (contract.version && !this.validateSemver(contract.version, 'contract version')) {
      return;
    }
  }

  validateContractSecurity(contract, context) {
    // Check for common vulnerabilities
    this.validateField('code', contract.code, ['no_security_vulnerabilities'], context);
    this.validateField('code', contract.code, ['reentrancy_protection'], context);
    this.validateField('code', contract.code, ['overflow_protection'], context);
  }

  validateNetworkConfiguration(config) {
    for (const network of config.networks) {
      this.validateSingleNetwork(network);
    }
  }

  validateSingleNetwork(network) {
    // Required fields
    if (!network.name) {
      this.addError('Network name is required');
    }
    
    if (!network.rpcUrl) {
      this.addError(`Network ${network.name}: RPC URL is required`);
    }
    
    // Validate network configuration
    this.validateField('network', network, ['valid_network_config']);
    
    // Security checks
    if (network.rpcUrl && network.rpcUrl.startsWith('http://')) {
      this.addWarning(`Network ${network.name}: Using insecure HTTP connection`);
    }
    
    // Gas configuration
    if (network.gasPrice && network.gasPrice < 1000000000) { // 1 Gwei
      this.addWarning(`Network ${network.name}: Gas price seems very low`);
    }
    
    if (network.gasLimit && network.gasLimit > 30000000) {
      this.addWarning(`Network ${network.name}: Gas limit seems very high`);
    }
  }

  validateDeploymentConfiguration(config) {
    const deployConfig = config.deploymentConfig;
    
    // Check for deployment strategy
    if (!deployConfig.strategy) {
      this.addWarning('No deployment strategy specified');
    }
    
    // Validate constructor parameters
    if (deployConfig.constructorParams) {
      this.validateConstructorParams(deployConfig.constructorParams);
    }
    
    // Check for verification settings
    if (!deployConfig.verify && config.networks.some(n => n.name === 'mainnet')) {
      this.addWarning('Consider enabling contract verification for mainnet deployment');
    }
    
    // Gas estimation
    if (!deployConfig.gasEstimation) {
      this.addSuggestion('Enable gas estimation for more accurate deployment costs');
    }
  }

  validateConstructorParams(params) {
    for (const [key, value] of Object.entries(params)) {
      if (typeof value === 'string' && value.length === 0) {
        this.addWarning(`Constructor parameter '${key}' is empty`);
      }
      
      // Check for hardcoded addresses
      if (typeof value === 'string' && value.startsWith('0x') && value.length === 42) {
        this.addWarning(`Constructor parameter '${key}' contains hardcoded address`);
      }
    }
  }

  validateSecurityBestPractices(config) {
    // Check if audit is required for high-value contracts
    if (config.securityLevel === 'high' && !config.auditRequired) {
      this.addWarning('High security level contracts should undergo professional audit');
    }
    
    // Multi-signature validation
    const hasMultisig = config.contracts.some(c => 
      c.code.includes('multisig') || c.code.includes('Multisig')
    );
    
    if (config.securityLevel === 'high' && !hasMultisig) {
      this.addSuggestion('Consider implementing multi-signature controls for high security contracts');
    }
    
    // Time lock validation
    const hasTimelock = config.contracts.some(c => 
      c.code.includes('timelock') || c.code.includes('delay')
    );
    
    if (config.hasToken && !hasTimelock) {
      this.addSuggestion('Consider implementing timelock mechanisms for token contracts');
    }
  }

  validateTestingStrategy(config) {
    if (config.testFiles.length === 0) {
      this.addError('No test files found for smart contracts');
      return;
    }
    
    // Test coverage validation
    for (const testFile of config.testFiles) {
      this.validateField('tests', testFile, ['proper_testing']);
    }
    
    // Test types validation
    const hasUnitTests = config.testFiles.some(t => t.includes('unit') || t.includes('test'));
    const hasIntegrationTests = config.testFiles.some(t => t.includes('integration'));
    
    if (!hasUnitTests) {
      this.addWarning('No unit tests found');
    }
    
    if (!hasIntegrationTests && config.contracts.length > 1) {
      this.addWarning('No integration tests found for multi-contract system');
    }
  }

  validateTokenomics(config) {
    const tokenConfig = config.tokenConfig;
    
    // Basic token validation
    if (!tokenConfig.name) {
      this.addError('Token name is required');
    }
    
    if (!tokenConfig.symbol) {
      this.addError('Token symbol is required');
    }
    
    if (!tokenConfig.totalSupply || tokenConfig.totalSupply <= 0) {
      this.addError('Valid total supply is required');
    }
    
    // Tokenomics validation
    if (tokenConfig.distribution) {
      this.validateTokenDistribution(tokenConfig.distribution);
    }
    
    // Vesting validation
    if (tokenConfig.vesting) {
      this.validateVestingSchedule(tokenConfig.vesting);
    }
    
    // Governance validation
    if (tokenConfig.governance) {
      this.validateGovernanceToken(tokenConfig.governance);
    }
  }

  validateTokenDistribution(distribution) {
    const totalPercentage = Object.values(distribution).reduce((sum, pct) => sum + pct, 0);
    
    if (Math.abs(totalPercentage - 100) > 0.01) {
      this.addError(`Token distribution percentages sum to ${totalPercentage}%, should be 100%`);
    }
    
    // Check for reasonable distribution
    if (distribution.team && distribution.team > 30) {
      this.addWarning('Team allocation exceeds 30%, may raise concerns');
    }
    
    if (distribution.founders && distribution.founders > 20) {
      this.addWarning('Founder allocation exceeds 20%, may raise concerns');
    }
  }

  validateVestingSchedule(vesting) {
    for (const [category, schedule] of Object.entries(vesting)) {
      if (!schedule.cliff || schedule.cliff < 0) {
        this.addWarning(`Vesting category '${category}': Invalid cliff period`);
      }
      
      if (!schedule.duration || schedule.duration <= schedule.cliff) {
        this.addWarning(`Vesting category '${category}': Duration should be greater than cliff`);
      }
    }
  }

  validateGovernanceToken(governance) {
    if (!governance.votingPower) {
      this.addWarning('Governance token should specify voting power mechanism');
    }
    
    if (!governance.proposalThreshold) {
      this.addWarning('Governance should specify proposal threshold');
    }
    
    if (!governance.quorum) {
      this.addWarning('Governance should specify quorum requirements');
    }
  }

  // Rule implementation methods
  validateContractSyntax(code, language) {
    switch (language) {
      case 'solidity':
        return this.validateSoliditySyntax(code);
      case 'rust':
        return this.validateRustSyntax(code);
      default:
        return this.validateGenericContractSyntax(code);
    }
  }

  validateSoliditySyntax(code) {
    // Basic Solidity syntax checks
    if (!code.includes('pragma solidity')) {
      return false;
    }
    
    const braceCount = (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
    if (braceCount !== 0) {
      return false;
    }
    
    const parenCount = (code.match(/\(/g) || []).length - (code.match(/\)/g) || []).length;
    if (parenCount !== 0) {
      return false;
    }
    
    return true;
  }

  validateRustSyntax(code) {
    // Basic Rust syntax checks for Solana programs
    if (!code.includes('use anchor_lang') && !code.includes('#[program]')) {
      return false;
    }
    
    return this.hasBalancedBraces(code) && this.hasBalancedParentheses(code);
  }

  validateGenericContractSyntax(code) {
    return this.hasBalancedBraces(code) && this.hasBalancedParentheses(code);
  }

  checkContractSecurity(code) {
    const vulnerabilities = [
      // Reentrancy
      /\.call\{value:.*\}\(\)/g,
      /\.send\(/g,
      /\.transfer\(/g,
      
      // Unchecked external calls
      /\.call\(/g,
      /\.delegatecall\(/g,
      
      // tx.origin usage
      /tx\.origin/g,
      
      // Block timestamp dependency
      /block\.timestamp/g,
      /now\b/g,
      
      // Integer overflow (pre-Solidity 0.8.0)
      /\+\+|\-\-/g
    ];
    
    for (const pattern of vulnerabilities) {
      if (pattern.test(code)) {
        return false;
      }
    }
    
    return true;
  }

  checkGasOptimization(code) {
    const gasIssues = [
      // Storage vs memory
      /storage\s+\w+\s*=/g,
      
      // Loop optimizations
      /for\s*\([^;]*\.length[^;]*;/g,
      
      // Unnecessary external calls in loops
      /for\s*\([^}]*\{[^}]*\.call/gs
    ];
    
    for (const pattern of gasIssues) {
      if (pattern.test(code)) {
        return false;
      }
    }
    
    return true;
  }

  checkAccessControl(code) {
    const hasModifiers = /modifier\s+\w+/g.test(code);
    const hasOwnable = /onlyOwner/g.test(code) || /Ownable/g.test(code);
    const hasAccessControl = /AccessControl/g.test(code);
    
    return hasModifiers || hasOwnable || hasAccessControl;
  }

  checkReentrancyProtection(code) {
    const hasReentrancyGuard = /ReentrancyGuard/g.test(code) || /nonReentrant/g.test(code);
    const hasChecksEffectsInteractions = this.checksEffectsInteractionsPattern(code);
    
    return hasReentrancyGuard || hasChecksEffectsInteractions;
  }

  checksEffectsInteractionsPattern(code) {
    // Simplified check for CEI pattern
    const functions = this.extractSolidityFunctions(code);
    
    for (const func of functions) {
      if (func.includes('.call') || func.includes('.send') || func.includes('.transfer')) {
        // Check if external calls are at the end
        const lines = func.split('\n');
        const lastMeaningfulLine = lines.reverse().find(line => line.trim() && !line.trim().startsWith('}'));
        
        if (lastMeaningfulLine && !this.isExternalCall(lastMeaningfulLine)) {
          return false;
        }
      }
    }
    
    return true;
  }

  extractSolidityFunctions(code) {
    const functionRegex = /function\s+\w+[^{]*\{[^}]*\}/gs;
    return code.match(functionRegex) || [];
  }

  isExternalCall(line) {
    return line.includes('.call') || line.includes('.send') || line.includes('.transfer');
  }

  checkOverflowProtection(code) {
    // Check for SafeMath usage or Solidity >= 0.8.0
    const hasSafeMath = /SafeMath/g.test(code);
    const hasSolidity08 = /pragma solidity \^?0\.8/g.test(code);
    
    return hasSafeMath || hasSolidity08;
  }

  checkEventEmission(code) {
    const hasEvents = /event\s+\w+/g.test(code);
    const hasEmits = /emit\s+\w+/g.test(code);
    
    return hasEvents && hasEmits;
  }

  checkUpgradabilityPattern(code, context) {
    const upgradabilityPatterns = [
      /Initializable/g,
      /UUPSUpgradeable/g,
      /TransparentUpgradeableProxy/g,
      /Proxy/g
    ];
    
    return upgradabilityPatterns.some(pattern => pattern.test(code));
  }

  validateNetworkConfig(config) {
    if (!config.rpcUrl || !config.chainId) {
      return false;
    }
    
    try {
      new URL(config.rpcUrl);
      return true;
    } catch {
      return false;
    }
  }

  validateContractTests(testContent) {
    if (typeof testContent === 'string') {
      // Check for test functions
      const hasTestFunctions = /it\(/g.test(testContent) || 
                              /test_/g.test(testContent) ||
                              /describe\(/g.test(testContent);
      
      // Check for assertions
      const hasAssertions = /assert/g.test(testContent) ||
                           /expect/g.test(testContent) ||
                           /should/g.test(testContent);
      
      return hasTestFunctions && hasAssertions;
    }
    
    return false;
  }

  hasBalancedBraces(code) {
    let count = 0;
    for (const char of code) {
      if (char === '{') count++;
      if (char === '}') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }

  hasBalancedParentheses(code) {
    let count = 0;
    for (const char of code) {
      if (char === '(') count++;
      if (char === ')') count--;
      if (count < 0) return false;
    }
    return count === 0;
  }
}

module.exports = { BlockchainValidator };