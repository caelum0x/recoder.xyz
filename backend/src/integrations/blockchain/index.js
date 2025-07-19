const { EthereumIntegration } = require('./ethereum');
const { SolanaIntegration } = require('./solana');
const { PolygonIntegration } = require('./polygon');

class BlockchainIntegrationManager {
  constructor() {
    this.integrations = {
      ethereum: null,
      solana: null,
      polygon: null
    };
    this.activeNetwork = null;
  }

  initializeEthereum(options = {}) {
    this.integrations.ethereum = new EthereumIntegration(options);
    return this.integrations.ethereum;
  }

  initializeSolana(options = {}) {
    this.integrations.solana = new SolanaIntegration(options);
    return this.integrations.solana;
  }

  initializePolygon(options = {}) {
    this.integrations.polygon = new PolygonIntegration(options);
    return this.integrations.polygon;
  }

  getIntegration(network) {
    const integration = this.integrations[network.toLowerCase()];
    if (!integration) {
      throw new Error(`${network} integration not initialized`);
    }
    return integration;
  }

  setActiveNetwork(network) {
    if (!this.integrations[network.toLowerCase()]) {
      throw new Error(`${network} integration not initialized`);
    }
    this.activeNetwork = network.toLowerCase();
  }

  getActiveIntegration() {
    if (!this.activeNetwork) {
      throw new Error('No active network set');
    }
    return this.integrations[this.activeNetwork];
  }

  async getBalance(address, network = null) {
    const targetNetwork = network || this.activeNetwork;
    if (!targetNetwork) {
      throw new Error('No network specified and no active network set');
    }

    const integration = this.getIntegration(targetNetwork);
    return await integration.getBalance(address);
  }

  async sendTransaction(options, network = null) {
    const targetNetwork = network || this.activeNetwork;
    if (!targetNetwork) {
      throw new Error('No network specified and no active network set');
    }

    const integration = this.getIntegration(targetNetwork);
    
    switch (targetNetwork) {
      case 'ethereum':
        return await integration.sendTransaction(options);
      case 'solana':
        return await integration.sendSol(options);
      case 'polygon':
        return await integration.sendMatic(options);
      default:
        throw new Error(`Unsupported network: ${targetNetwork}`);
    }
  }

  async deployContract(options, network = null) {
    const targetNetwork = network || this.activeNetwork;
    if (!targetNetwork) {
      throw new Error('No network specified and no active network set');
    }

    const integration = this.getIntegration(targetNetwork);
    
    if (targetNetwork === 'solana') {
      return await integration.deployProgram(options);
    } else {
      return await integration.deployContract(options);
    }
  }

  async generateSmartContract(description, contractType = 'ERC20', network = null) {
    const targetNetwork = network || this.activeNetwork;
    if (!targetNetwork) {
      throw new Error('No network specified and no active network set');
    }

    const integration = this.getIntegration(targetNetwork);
    
    if (targetNetwork === 'solana') {
      return await integration.generateRustProgram(description, contractType);
    } else if (targetNetwork === 'polygon') {
      return await integration.generatePolygonContract(description, contractType);
    } else {
      return await integration.generateSmartContract(description, contractType);
    }
  }

  async analyzeContract(contractAddress, network = null) {
    const targetNetwork = network || this.activeNetwork;
    if (!targetNetwork) {
      throw new Error('No network specified and no active network set');
    }

    const integration = this.getIntegration(targetNetwork);
    
    if (targetNetwork === 'solana') {
      return await integration.analyzeProgram(contractAddress);
    } else {
      return await integration.analyzeContract(contractAddress);
    }
  }

  async crossChainTransfer(options) {
    const { fromNetwork, toNetwork, amount, tokenAddress, recipient } = options;

    if (!this.integrations[fromNetwork] || !this.integrations[toNetwork]) {
      throw new Error('Both source and destination networks must be initialized');
    }

    const fromIntegration = this.getIntegration(fromNetwork);
    const toIntegration = this.getIntegration(toNetwork);

    try {
      // This is a simplified cross-chain transfer
      // In practice, you would use proper bridge protocols
      
      if (fromNetwork === 'ethereum' && toNetwork === 'polygon') {
        return await toIntegration.bridgeFromEthereum({
          tokenAddress,
          amount
        });
      } else if (fromNetwork === 'polygon' && toNetwork === 'ethereum') {
        return await fromIntegration.bridgeToEthereum({
          tokenAddress,
          amount
        });
      } else {
        return {
          success: false,
          error: `Cross-chain transfer from ${fromNetwork} to ${toNetwork} not supported`
        };
      }
    } catch (error) {
      return {
        success: false,
        error: error.message
      };
    }
  }

  getNetworkInfo(network = null) {
    const targetNetwork = network || this.activeNetwork;
    if (!targetNetwork) {
      throw new Error('No network specified and no active network set');
    }

    const networkInfo = {
      ethereum: {
        name: 'Ethereum',
        chainId: 1,
        nativeCurrency: 'ETH',
        consensus: 'Proof of Stake',
        blockTime: '12 seconds',
        finalityTime: '12-19 minutes'
      },
      solana: {
        name: 'Solana',
        nativeCurrency: 'SOL',
        consensus: 'Proof of History + Proof of Stake',
        blockTime: '400ms',
        finalityTime: '2.5 seconds',
        tps: '65,000+'
      },
      polygon: {
        name: 'Polygon',
        chainId: 137,
        nativeCurrency: 'MATIC',
        consensus: 'Proof of Stake',
        blockTime: '2 seconds',
        finalityTime: '2-3 seconds',
        parentChain: 'Ethereum'
      }
    };

    return networkInfo[targetNetwork];
  }

  getAllNetworks() {
    return Object.keys(this.integrations).filter(network => 
      this.integrations[network] !== null
    );
  }

  async compareNetworkFees() {
    const results = {};
    
    for (const [network, integration] of Object.entries(this.integrations)) {
      if (integration) {
        try {
          if (network === 'solana') {
            // Solana fees are typically very low and fixed
            results[network] = {
              success: true,
              fee: '0.000005',
              currency: 'SOL',
              usdEstimate: '< $0.01'
            };
          } else {
            const gasPrice = await integration.getGasPrice();
            results[network] = {
              ...gasPrice,
              network: network
            };
          }
        } catch (error) {
          results[network] = {
            success: false,
            error: error.message
          };
        }
      }
    }
    
    return results;
  }

  async getMultiNetworkBalance(address) {
    const results = {};
    
    for (const [network, integration] of Object.entries(this.integrations)) {
      if (integration) {
        try {
          const balance = await integration.getBalance(address);
          results[network] = balance;
        } catch (error) {
          results[network] = {
            success: false,
            error: error.message
          };
        }
      }
    }
    
    return results;
  }

  validateAddress(address, network = null) {
    const targetNetwork = network || this.activeNetwork;
    if (!targetNetwork) {
      throw new Error('No network specified and no active network set');
    }

    const integration = this.getIntegration(targetNetwork);
    return integration.isValidAddress(address);
  }

  getSupportedFeatures(network = null) {
    const targetNetwork = network || this.activeNetwork;
    if (!targetNetwork) {
      throw new Error('No network specified and no active network set');
    }

    const features = {
      ethereum: {
        smartContracts: true,
        nfts: true,
        defi: true,
        layer2: true,
        crossChain: true,
        programmableTokens: true
      },
      solana: {
        smartContracts: true,
        nfts: true,
        defi: true,
        highThroughput: true,
        lowFees: true,
        parallelExecution: true
      },
      polygon: {
        smartContracts: true,
        nfts: true,
        defi: true,
        ethereumCompatible: true,
        lowFees: true,
        crossChain: true
      }
    };

    return features[targetNetwork] || {};
  }
}

// Export all blockchain integrations
module.exports = {
  BlockchainIntegrationManager,
  EthereumIntegration,
  SolanaIntegration,
  PolygonIntegration
};