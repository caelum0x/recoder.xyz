import { EVMBlockchainService } from './evm-service'
import { SolanaBlockchainService } from './solana-service'
import { NearBlockchainService } from './near-service'
import { IPFSService } from './ipfs-service'
import { SecurityScanner } from './security-scanner'
import { supportedChains, solanaConfig, nearConfig, SupportedChain, SolanaNetwork, NearNetwork } from './config'

export type BlockchainType = 'evm' | 'solana' | 'near'

export interface DeploymentResult {
  success: boolean
  transactionHash?: string
  contractAddress?: string
  error?: string
  gasUsed?: string
  deploymentCost?: string
}

export interface SwapResult {
  success: boolean
  transactionHash?: string
  amountOut?: string
  error?: string
  gasUsed?: string
  swapCost?: string
}

export interface NFTResult {
  success: boolean
  transactionHash?: string
  tokenId?: string
  mintAddress?: string
  error?: string
  metadataUrl?: string
}

export class BlockchainService {
  private evmService: EVMBlockchainService
  private solanaService: SolanaBlockchainService
  private nearService: NearBlockchainService
  private ipfsService: IPFSService
  private securityScanner: SecurityScanner

  constructor() {
    this.evmService = new EVMBlockchainService()
    this.solanaService = new SolanaBlockchainService()
    this.nearService = new NearBlockchainService()
    this.ipfsService = new IPFSService()
    this.securityScanner = new SecurityScanner()
  }

  // Multi-chain deployment
  async deployContract(
    blockchain: BlockchainType,
    contractData: {
      sourceCode: string
      bytecode?: string
      abi?: any[]
      constructorArgs?: any[]
    },
    networkConfig: {
      chainId?: number
      network?: SolanaNetwork | NearNetwork
      accountId?: string
    }
  ): Promise<DeploymentResult> {
    try {
      // Security scan before deployment
      const scanResult = await this.securityScanner.scanSourceCode(contractData.sourceCode)
      
      if (scanResult.score < 50) {
        return {
          success: false,
          error: `Contract failed security scan with score ${scanResult.score}/100. Please fix critical issues before deployment.`,
        }
      }

      switch (blockchain) {
        case 'evm':
          if (!networkConfig.chainId || !contractData.bytecode || !contractData.abi) {
            throw new Error('Missing required parameters for EVM deployment')
          }
          
          const evmResult = await this.evmService.deployContract(
            networkConfig.chainId,
            contractData.bytecode,
            contractData.abi,
            contractData.constructorArgs || []
          )
          
          return {
            success: true,
            transactionHash: evmResult.transactionHash,
            contractAddress: evmResult.address,
          }

        case 'solana':
          if (!networkConfig.network) {
            throw new Error('Network required for Solana deployment')
          }
          
          // Convert source code to program data (simplified)
          const programData = Buffer.from(contractData.sourceCode, 'utf8')
          
          // This would need a proper Solana program build process
          throw new Error('Solana program deployment requires proper build toolchain')

        case 'near':
          if (!networkConfig.network || !networkConfig.accountId) {
            throw new Error('Network and account ID required for NEAR deployment')
          }
          
          // Convert source code to WASM (simplified)
          const contractCode = new Uint8Array(Buffer.from(contractData.sourceCode, 'utf8'))
          
          const nearResult = await this.nearService.deployContract(
            networkConfig.network,
            networkConfig.accountId,
            contractCode
          )
          
          return {
            success: true,
            transactionHash: nearResult.transactionHash,
            contractAddress: nearResult.contractId,
          }

        default:
          throw new Error(`Unsupported blockchain: ${blockchain}`)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // Multi-chain token swaps
  async swapTokens(
    blockchain: BlockchainType,
    swapData: {
      tokenIn: string
      tokenOut: string
      amountIn: string
      minAmountOut: string
      userAddress: string
      slippage?: number
    },
    networkConfig: {
      chainId?: number
      network?: SolanaNetwork | NearNetwork
    }
  ): Promise<SwapResult> {
    try {
      switch (blockchain) {
        case 'evm':
          if (!networkConfig.chainId) {
            throw new Error('Chain ID required for EVM swap')
          }
          
          // Use Uniswap V3 for the swap
          const poolAddress = await this.evmService.getUniswapV3Pool(
            networkConfig.chainId,
            swapData.tokenIn,
            swapData.tokenOut,
            3000 // 0.3% fee tier
          )
          
          if (!poolAddress || poolAddress === '0x0000000000000000000000000000000000000000') {
            throw new Error('No liquidity pool found for this token pair')
          }
          
          // Execute swap (simplified - would need proper Uniswap integration)
          return {
            success: true,
            transactionHash: 'pending_implementation',
          }

        case 'solana':
          if (!networkConfig.network) {
            throw new Error('Network required for Solana swap')
          }
          
          // Get Jupiter quote
          const quote = await this.solanaService.getJupiterQuote(
            swapData.tokenIn,
            swapData.tokenOut,
            parseInt(swapData.amountIn),
            (swapData.slippage || 0.5) * 100
          )
          
          // Execute swap would require user's keypair
          return {
            success: true,
            amountOut: quote.outAmount,
          }

        case 'near':
          if (!networkConfig.network) {
            throw new Error('Network required for NEAR swap')
          }
          
          const nearResult = await this.nearService.swapOnRefFinance(
            networkConfig.network,
            swapData.userAddress,
            swapData.tokenIn,
            swapData.tokenOut,
            swapData.amountIn,
            swapData.minAmountOut
          )
          
          return {
            success: true,
            transactionHash: nearResult.transactionHash,
          }

        default:
          throw new Error(`Unsupported blockchain: ${blockchain}`)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // Multi-chain NFT operations
  async mintNFT(
    blockchain: BlockchainType,
    nftData: {
      name: string
      description: string
      imageFile: File
      attributes?: Array<{ trait_type: string; value: string | number }>
      userAddress: string
      contractAddress?: string
    },
    networkConfig: {
      chainId?: number
      network?: SolanaNetwork | NearNetwork
    }
  ): Promise<NFTResult> {
    try {
      // Upload image and metadata to IPFS
      const imageResult = await this.ipfsService.uploadNFTImage(nftData.imageFile)
      
      const metadata = {
        name: nftData.name,
        description: nftData.description,
        image: imageResult.ipfsUrl,
        attributes: nftData.attributes || [],
      }
      
      const metadataResult = await this.ipfsService.uploadNFTMetadata(metadata)

      switch (blockchain) {
        case 'evm':
          if (!networkConfig.chainId || !nftData.contractAddress) {
            throw new Error('Chain ID and contract address required for EVM NFT minting')
          }
          
          // Mint NFT using ERC-721 contract (simplified)
          const erc721Abi = [
            'function mint(address to, string memory tokenURI) public returns (uint256)',
          ]
          
          const result = await this.evmService.interactWithContract(
            networkConfig.chainId,
            nftData.contractAddress,
            erc721Abi,
            'mint',
            [nftData.userAddress, metadataResult.url]
          )
          
          return {
            success: true,
            transactionHash: result.transactionHash,
            metadataUrl: metadataResult.url,
          }

        case 'solana':
          if (!networkConfig.network) {
            throw new Error('Network required for Solana NFT minting')
          }
          
          const solanaResult = await this.solanaService.mintNFT(
            networkConfig.network,
            this.solanaService.getKeypair()!, // Would need proper keypair management
            {
              name: nftData.name,
              symbol: 'NFT',
              uri: metadataResult.url,
            }
          )
          
          return {
            success: true,
            transactionHash: solanaResult.transactionSignature,
            mintAddress: solanaResult.mint,
            metadataUrl: metadataResult.url,
          }

        case 'near':
          if (!networkConfig.network || !nftData.contractAddress) {
            throw new Error('Network and contract address required for NEAR NFT minting')
          }
          
          const nearResult = await this.nearService.mintNFT(
            networkConfig.network,
            nftData.userAddress,
            nftData.contractAddress,
            {
              title: nftData.name,
              description: nftData.description,
              media: imageResult.url,
            }
          )
          
          return {
            success: true,
            transactionHash: nearResult.transactionHash,
            tokenId: nearResult.tokenId,
            metadataUrl: metadataResult.url,
          }

        default:
          throw new Error(`Unsupported blockchain: ${blockchain}`)
      }
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  // Portfolio management across chains
  async getPortfolio(userAddresses: {
    evm?: { [chainId: number]: string }
    solana?: { [network: string]: string }
    near?: { [network: string]: string }
  }): Promise<{
    totalValueUSD: number
    chains: Array<{
      blockchain: BlockchainType
      network: string
      address: string
      balance: string
      tokens: Array<{
        symbol: string
        balance: string
        valueUSD: number
      }>
    }>
  }> {
    const chains = []
    let totalValueUSD = 0

    // EVM chains
    if (userAddresses.evm) {
      for (const [chainId, address] of Object.entries(userAddresses.evm)) {
        const balance = await this.evmService.getBalance(parseInt(chainId), address)
        const chain = supportedChains.find(c => c.id === parseInt(chainId))
        
        chains.push({
          blockchain: 'evm' as BlockchainType,
          network: chain?.name || `Chain ${chainId}`,
          address,
          balance,
          tokens: [], // Would fetch ERC-20 tokens
        })
      }
    }

    // Solana
    if (userAddresses.solana) {
      for (const [network, address] of Object.entries(userAddresses.solana)) {
        const balance = await this.solanaService.getBalance(network, address)
        
        chains.push({
          blockchain: 'solana' as BlockchainType,
          network,
          address,
          balance: balance.toString(),
          tokens: [], // Would fetch SPL tokens
        })
      }
    }

    // NEAR
    if (userAddresses.near) {
      for (const [network, address] of Object.entries(userAddresses.near)) {
        const balance = await this.nearService.getBalance(network, address)
        
        chains.push({
          blockchain: 'near' as BlockchainType,
          network,
          address,
          balance,
          tokens: [], // Would fetch NEP-141 tokens
        })
      }
    }

    return {
      totalValueUSD,
      chains,
    }
  }

  // Security scanning
  async scanContract(
    contractAddress?: string,
    sourceCode?: string,
    chainId?: number,
    rpcUrl?: string
  ) {
    if (contractAddress && chainId && rpcUrl) {
      return await this.securityScanner.scanDeployedContract(contractAddress, chainId, rpcUrl)
    } else if (sourceCode) {
      return await this.securityScanner.scanSourceCode(sourceCode)
    } else {
      throw new Error('Either contract address with chain info or source code is required')
    }
  }

  // IPFS operations
  async uploadToIPFS(file: File | Buffer | any) {
    if (file instanceof File || Buffer.isBuffer(file)) {
      return await this.ipfsService.uploadFile(file)
    } else {
      return await this.ipfsService.uploadJSON(file)
    }
  }

  async downloadFromIPFS(cid: string) {
    return await this.ipfsService.downloadFile(cid)
  }

  // Utility methods
  getSupportedChains() {
    return {
      evm: supportedChains.map(chain => ({
        id: chain.id,
        name: chain.name,
        nativeCurrency: chain.nativeCurrency,
        rpcUrls: chain.rpcUrls,
        blockExplorers: chain.blockExplorers,
      })),
      solana: Object.keys(solanaConfig),
      near: Object.keys(nearConfig),
    }
  }

  getService(blockchain: BlockchainType) {
    switch (blockchain) {
      case 'evm':
        return this.evmService
      case 'solana':
        return this.solanaService
      case 'near':
        return this.nearService
      default:
        throw new Error(`Unsupported blockchain: ${blockchain}`)
    }
  }

  getIPFSService() {
    return this.ipfsService
  }

  getSecurityScanner() {
    return this.securityScanner
  }
}

// Create singleton instance
export const blockchainService = new BlockchainService()

// Export individual services and types
export {
  EVMBlockchainService,
  SolanaBlockchainService,
  NearBlockchainService,
  IPFSService,
  SecurityScanner,
  supportedChains,
  solanaConfig,
  nearConfig,
}

export type {
  SupportedChain,
  SolanaNetwork,
  NearNetwork,
} from './config'

export type { SecurityIssue, ScanResult } from './security-scanner'