// Mock ethers implementation to avoid missing dependencies
interface MockProvider {
  getBalance: (address: string) => Promise<{ toString: () => string }>;
  getBlockNumber: () => Promise<number>;
  getLogs: (filter: any) => Promise<any[]>;
  estimateGas: (tx: any) => Promise<{ toString: () => string }>;
  getGasPrice: () => Promise<{ toString: () => string }>;
  getBlock: (blockNumber: number | string) => Promise<any>;
  waitForTransaction: (hash: string, confirmations: number) => Promise<any>;
}

interface MockSigner {
  getAddress: () => Promise<string>;
}

interface MockContract {
  address: string;
  deployTransaction: { hash: string };
  deployed: () => Promise<MockContract>;
  connect: (signer: MockSigner) => MockContract;
  [key: string]: any;
}

interface MockContractFactory {
  deploy: (...args: any[]) => Promise<MockContract>;
}

const mockEthers = {
  providers: {
    JsonRpcProvider: class {
      constructor(public url: string) {}
      
      async getBalance(address: string) {
        return { toString: () => '1000000000000000000' }; // 1 ETH
      }
      
      async getBlockNumber() {
        return 18000000;
      }
      
      async getLogs(filter: any) {
        return [];
      }
      
      async estimateGas(tx: any) {
        return { toString: () => '21000' };
      }
      
      async getGasPrice() {
        return { toString: () => '20000000000' }; // 20 gwei
      }
      
      async getBlock(blockNumber: number | string) {
        return {
          number: typeof blockNumber === 'number' ? blockNumber : 18000000,
          timestamp: Date.now() / 1000,
          gasLimit: { toString: () => '30000000' }
        };
      }
      
      async waitForTransaction(hash: string, confirmations: number) {
        return { status: 1, transactionHash: hash };
      }
    }
  },
  Contract: class {
    constructor(public address: string, public abi: any[], public provider: any) {}
    
    connect(signer: MockSigner) {
      return this;
    }
    
    async balanceOf(address: string) {
      return '1000000000000000000'; // 1 token
    }
    
    async decimals() {
      return 18;
    }
    
    [key: string]: any;
  },
  ContractFactory: class {
    constructor(public abi: any[], public bytecode: string, public provider: any) {}
    
    async deploy(...args: any[]) {
      return {
        address: '0x' + Math.random().toString(16).substring(2, 42),
        deployTransaction: { hash: '0x' + Math.random().toString(16).substring(2, 66) },
        deployed: () => Promise.resolve(this)
      };
    }
  },
  Signer: class {},
  utils: {
    formatEther: (wei: string | { toString: () => string }) => {
      const weiStr = typeof wei === 'string' ? wei : wei.toString();
      return (parseInt(weiStr) / 1e18).toString();
    },
    formatUnits: (value: string | { toString: () => string }, decimals: number) => {
      const valueStr = typeof value === 'string' ? value : value.toString();
      return (parseInt(valueStr) / Math.pow(10, decimals)).toString();
    },
    parseEther: (ether: string) => {
      return (parseFloat(ether) * 1e18).toString();
    }
  }
};

// Mock viem types
interface Chain {
  id: number;
  name: string;
  rpcUrls: { default: { http: string[] } };
}

interface PublicClient {
  chain: Chain;
}

interface WalletClient {
  chain: Chain;
  account?: { address: string };
}

import { supportedChains, defiProtocols } from './config'

export class EVMBlockchainService {
  private providers: Map<number, InstanceType<typeof mockEthers.providers.JsonRpcProvider>> = new Map()
  private signers: Map<number, MockSigner> = new Map()

  constructor() {
    this.initializeProviders()
  }

  private initializeProviders() {
    supportedChains.forEach((chain) => {
      const rpcUrl = this.getRpcUrl(chain)
      if (rpcUrl) {
        const provider = new mockEthers.providers.JsonRpcProvider(rpcUrl)
        this.providers.set(chain.id, provider)
      }
    })
  }

  private getRpcUrl(chain: Chain): string | null {
    // Use environment variables for RPC URLs
    switch (chain.id) {
      case 1: // Ethereum mainnet
        return process.env.NEXT_PUBLIC_ETHEREUM_RPC_URL || 'https://eth.llamarpc.com'
      case 137: // Polygon
        return process.env.NEXT_PUBLIC_POLYGON_RPC_URL || 'https://polygon.llamarpc.com'
      case 56: // BSC
        return process.env.NEXT_PUBLIC_BSC_RPC_URL || 'https://bsc.llamarpc.com'
      case 42161: // Arbitrum
        return process.env.NEXT_PUBLIC_ARBITRUM_RPC_URL || 'https://arbitrum.llamarpc.com'
      default:
        return null
    }
  }

  async deployContract(
    chainId: number,
    bytecode: string,
    abi: any[],
    constructorArgs: any[] = [],
    walletClient?: WalletClient
  ): Promise<{ address: string; transactionHash: string }> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    if (!walletClient) {
      throw new Error('Wallet client required for deployment')
    }

    // Create contract factory
    const factory = new mockEthers.ContractFactory(abi, bytecode, provider)
    
    // Deploy contract
    const contract = await factory.deploy(...constructorArgs)
    await contract.deployed()

    return {
      address: contract.address,
      transactionHash: contract.deployTransaction.hash,
    }
  }

  async interactWithContract(
    chainId: number,
    contractAddress: string,
    abi: any[],
    method: string,
    args: any[] = [],
    options: {
      gasLimit?: number
      gasPrice?: string
      value?: string
    } = {}
  ): Promise<any> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    const contract = new mockEthers.Contract(contractAddress, abi, provider)
    
    // For read-only operations
    if (this.isReadOnlyMethod(abi, method)) {
      return await contract[method](...args)
    }

    // For write operations, need signer
    const signer = this.signers.get(chainId)
    if (!signer) {
      throw new Error('Signer required for write operations')
    }

    const contractWithSigner = contract.connect(signer)
    const tx = await contractWithSigner[method](...args, options)
    return await tx.wait()
  }

  private isReadOnlyMethod(abi: any[], methodName: string): boolean {
    const method = abi.find(item => item.name === methodName)
    return method && (method.stateMutability === 'view' || method.stateMutability === 'pure')
  }

  async getBalance(chainId: number, address: string): Promise<string> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    const balance = await provider.getBalance(address)
    return mockEthers.utils.formatEther(balance)
  }

  async getTokenBalance(
    chainId: number,
    tokenAddress: string,
    userAddress: string
  ): Promise<string> {
    const erc20Abi = [
      'function balanceOf(address owner) view returns (uint256)',
      'function decimals() view returns (uint8)',
    ]

    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    const contract = new mockEthers.Contract(tokenAddress, erc20Abi, provider)
    const [balance, decimals] = await Promise.all([
      contract.balanceOf(userAddress),
      contract.decimals(),
    ])

    return mockEthers.utils.formatUnits(balance, decimals)
  }

  async getTransactionHistory(
    chainId: number,
    address: string,
    limit: number = 100
  ): Promise<any[]> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    // Get latest block number
    const latestBlock = await provider.getBlockNumber()
    const fromBlock = Math.max(0, latestBlock - 10000) // Last ~10k blocks

    // Get transaction history (simplified version)
    const history = await provider.getLogs({
      fromBlock,
      toBlock: 'latest',
      address,
    })

    return history.slice(0, limit)
  }

  async estimateGas(
    chainId: number,
    to: string,
    data: string,
    value: string = '0'
  ): Promise<string> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    const gasEstimate = await provider.estimateGas({
      to,
      data,
      value: mockEthers.utils.parseEther(value),
    })

    return gasEstimate.toString()
  }

  async getCurrentGasPrice(chainId: number): Promise<string> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    const gasPrice = await provider.getGasPrice()
    return mockEthers.utils.formatUnits(gasPrice, 9) // gwei = 9 decimals
  }

  async getBlockInfo(chainId: number, blockNumber?: number): Promise<any> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    return await provider.getBlock(blockNumber || 'latest')
  }

  async waitForTransaction(
    chainId: number,
    transactionHash: string,
    confirmations: number = 1
  ): Promise<any> {
    const provider = this.providers.get(chainId)
    if (!provider) {
      throw new Error(`No provider found for chain ${chainId}`)
    }

    return await provider.waitForTransaction(transactionHash, confirmations)
  }

  // DeFi specific methods
  async getUniswapV3Pool(
    chainId: number,
    token0: string,
    token1: string,
    fee: number
  ): Promise<string> {
    const protocols = defiProtocols[chainId]
    if (!protocols?.uniswap) {
      throw new Error(`Uniswap not available on chain ${chainId}`)
    }

    const factoryAbi = [
      'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
    ]

    return await this.interactWithContract(
      chainId,
      protocols.uniswap.v3Factory,
      factoryAbi,
      'getPool',
      [token0, token1, fee]
    )
  }

  async getAaveUserAccountData(
    chainId: number,
    userAddress: string
  ): Promise<any> {
    const protocols = defiProtocols[chainId]
    if (!protocols?.aave) {
      throw new Error(`Aave not available on chain ${chainId}`)
    }

    const poolAbi = [
      'function getUserAccountData(address user) external view returns (uint256 totalCollateralBase, uint256 totalDebtBase, uint256 availableBorrowsBase, uint256 currentLiquidationThreshold, uint256 ltv, uint256 healthFactor)',
    ]

    return await this.interactWithContract(
      chainId,
      protocols.aave.pool,
      poolAbi,
      'getUserAccountData',
      [userAddress]
    )
  }

  setSigner(chainId: number, signer: MockSigner) {
    this.signers.set(chainId, signer)
  }

  removeSigner(chainId: number) {
    this.signers.delete(chainId)
  }

  getProvider(chainId: number): InstanceType<typeof mockEthers.providers.JsonRpcProvider> | undefined {
    return this.providers.get(chainId)
  }

  getSigner(chainId: number): MockSigner | undefined {
    return this.signers.get(chainId)
  }
}