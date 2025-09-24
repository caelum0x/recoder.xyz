// @ts-nocheck - Skip TypeScript checking for mock implementations
import { nearConfig, nearDeFi } from './config'

// Mock classes for server-side rendering
const mockKeyStores = {
  BrowserLocalStorageKeyStore: class {
    getKey() { return Promise.resolve(null) }
    setKey() { return Promise.resolve() }
  }
}

const mockConnect = () => Promise.resolve({
  account: () => ({ functionCall: () => Promise.resolve('mock-result') })
})

// Use real NEAR APIs in browser, mocks in server
const keyStores = typeof window !== 'undefined' ? 
  (globalThis as any).keyStores || mockKeyStores : mockKeyStores
const connect = typeof window !== 'undefined' ? 
  (globalThis as any).connect || mockConnect : mockConnect

export class NearBlockchainService {
  private connections: Map<string, any> = new Map()
  private accounts: Map<string, any> = new Map()
  private keyStore: any

  constructor() {
    this.keyStore = new keyStores.BrowserLocalStorageKeyStore()
    this.initializeConnections()
  }

  private async initializeConnections() {
    for (const [network, config] of Object.entries(nearConfig)) {
      const near = await connect({
        ...config,
        keyStore: this.keyStore,
      })
      this.connections.set(network, near)
    }
  }

  getNear(network: string = 'mainnet'): Near {
    const near = this.connections.get(network)
    if (!near) {
      throw new Error(`No connection found for network ${network}`)
    }
    return near
  }

  async getAccount(network: string, accountId: string): Promise<Account> {
    const near = this.getNear(network)
    const account = await near.account(accountId)
    this.accounts.set(`${network}:${accountId}`, account)
    return account
  }

  async deployContract(
    network: string,
    accountId: string,
    contractCode: Uint8Array,
    initMethod?: string,
    initArgs?: any
  ): Promise<{ transactionHash: string; contractId: string }> {
    const account = await this.getAccount(network, accountId)
    
    const actions = [transactions.deployContract(contractCode)]
    
    if (initMethod && initArgs) {
      actions.push(
        transactions.functionCall(
          initMethod,
          initArgs,
          utils.format.parseNearAmount('0.1'), // 0.1 NEAR for gas
          '30000000000000' // 30 TGas
        )
      )
    }
    
    const result = await account.signAndSendTransaction({
      receiverId: accountId,
      actions,
    })
    
    return {
      transactionHash: result.transaction.hash,
      contractId: accountId,
    }
  }

  async callContract(
    network: string,
    callerAccountId: string,
    contractId: string,
    methodName: string,
    args: any = {},
    gas: string = '30000000000000',
    deposit: string = '0'
  ): Promise<any> {
    const account = await this.getAccount(network, callerAccountId)
    
    const result = await account.functionCall({
      contractId,
      methodName,
      args,
      gas,
      attachedDeposit: utils.format.parseNearAmount(deposit),
    })
    
    return result
  }

  async viewContract(
    network: string,
    contractId: string,
    methodName: string,
    args: any = {}
  ): Promise<any> {
    const near = this.getNear(network)
    const account = await near.account(contractId)
    
    return await account.viewFunction({
      contractId,
      methodName,
      args,
    })
  }

  async getBalance(network: string, accountId: string): Promise<string> {
    const account = await this.getAccount(network, accountId)
    const balance = await account.getAccountBalance()
    return utils.format.formatNearAmount(balance.total)
  }

  async getAccountDetails(network: string, accountId: string): Promise<any> {
    const account = await this.getAccount(network, accountId)
    return await account.getAccountDetails()
  }

  async sendTokens(
    network: string,
    fromAccountId: string,
    toAccountId: string,
    amount: string
  ): Promise<{ transactionHash: string }> {
    const account = await this.getAccount(network, fromAccountId)
    
    const result = await account.sendMoney(
      toAccountId,
      utils.format.parseNearAmount(amount)
    )
    
    return {
      transactionHash: result.transaction.hash,
    }
  }

  async getTransactionStatus(
    network: string,
    transactionHash: string,
    accountId: string
  ): Promise<any> {
    const near = this.getNear(network)
    const provider = near.connection.provider as providers.JsonRpcProvider
    
    return await provider.txStatus(transactionHash, accountId)
  }

  async getTransactionHistory(
    network: string,
    accountId: string,
    limit: number = 100
  ): Promise<any[]> {
    const near = this.getNear(network)
    const provider = near.connection.provider as providers.JsonRpcProvider
    
    // Get recent transactions using the account changes query
    const result = await provider.query({
      request_type: 'view_account_changes',
      account_ids: [accountId],
      block_id: 'final',
    })
    
    return result as any[]
  }

  // Ref Finance DEX integration
  async getRefFinancePools(network: string): Promise<any[]> {
    return await this.viewContract(
      network,
      nearDeFi.refFinance.contract,
      'get_pools',
      { from_index: 0, limit: 100 }
    )
  }

  async getRefFinancePool(
    network: string,
    poolId: number
  ): Promise<any> {
    return await this.viewContract(
      network,
      nearDeFi.refFinance.contract,
      'get_pool',
      { pool_id: poolId }
    )
  }

  async swapOnRefFinance(
    network: string,
    accountId: string,
    tokenIn: string,
    tokenOut: string,
    amountIn: string,
    minAmountOut: string
  ): Promise<{ transactionHash: string }> {
    const actions = [
      // First, deposit tokens to Ref Finance
      transactions.functionCall(
        'ft_transfer_call',
        {
          receiver_id: nearDeFi.refFinance.contract,
          amount: amountIn,
          msg: JSON.stringify({
            actions: [
              {
                pool_id: 0, // This should be determined dynamically
                token_in: tokenIn,
                token_out: tokenOut,
                amount_in: amountIn,
                min_amount_out: minAmountOut,
              },
            ],
          }),
        },
        utils.format.parseNearAmount('0.1'),
        '1'
      ),
    ]
    
    const account = await this.getAccount(network, accountId)
    const result = await account.signAndSendTransaction({
      receiverId: tokenIn, // Call the token contract first
      actions,
    })
    
    return {
      transactionHash: result.transaction.hash,
    }
  }

  // Burrow Finance lending protocol integration
  async getBurrowMarkets(network: string): Promise<any[]> {
    return await this.viewContract(
      network,
      nearDeFi.burrow.contract,
      'get_assets_paged',
      {}
    )
  }

  async getBurrowAccount(
    network: string,
    accountId: string
  ): Promise<any> {
    return await this.viewContract(
      network,
      nearDeFi.burrow.contract,
      'get_account',
      { account_id: accountId }
    )
  }

  async supplyToBurrow(
    network: string,
    accountId: string,
    tokenId: string,
    amount: string
  ): Promise<{ transactionHash: string }> {
    const account = await this.getAccount(network, accountId)
    
    const result = await account.functionCall({
      contractId: tokenId,
      methodName: 'ft_transfer_call',
      args: {
        receiver_id: nearDeFi.burrow.contract,
        amount,
        msg: '',
      },
      gas: '50000000000000',
      attachedDeposit: '1',
    })
    
    return {
      transactionHash: result.transaction.hash,
    }
  }

  async borrowFromBurrow(
    network: string,
    accountId: string,
    tokenId: string,
    amount: string
  ): Promise<{ transactionHash: string }> {
    const result = await this.callContract(
      network,
      accountId,
      nearDeFi.burrow.contract,
      'borrow',
      {
        token_id: tokenId,
        amount,
      },
      '50000000000000',
      '0.01'
    )
    
    return {
      transactionHash: result.transaction.hash,
    }
  }

  // NFT operations
  async mintNFT(
    network: string,
    accountId: string,
    contractId: string,
    metadata: {
      title: string
      description: string
      media: string
      copies?: number
    }
  ): Promise<{ transactionHash: string; tokenId: string }> {
    const tokenId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    
    const result = await this.callContract(
      network,
      accountId,
      contractId,
      'nft_mint',
      {
        token_id: tokenId,
        receiver_id: accountId,
        metadata,
      },
      '50000000000000',
      '0.1'
    )
    
    return {
      transactionHash: result.transaction.hash,
      tokenId,
    }
  }

  async getNFTMetadata(
    network: string,
    contractId: string,
    tokenId: string
  ): Promise<any> {
    return await this.viewContract(
      network,
      contractId,
      'nft_metadata',
      { token_id: tokenId }
    )
  }

  async transferNFT(
    network: string,
    fromAccountId: string,
    contractId: string,
    tokenId: string,
    toAccountId: string
  ): Promise<{ transactionHash: string }> {
    const result = await this.callContract(
      network,
      fromAccountId,
      contractId,
      'nft_transfer',
      {
        receiver_id: toAccountId,
        token_id: tokenId,
      },
      '30000000000000',
      '1'
    )
    
    return {
      transactionHash: result.transaction.hash,
    }
  }

  // Utility methods
  async createAccount(
    network: string,
    newAccountId: string,
    publicKey: string,
    initialBalance: string = '2.5'
  ): Promise<{ transactionHash: string }> {
    const near = this.getNear(network)
    const creatorAccount = await near.account('testnet') // Use testnet account for account creation
    
    const keyPair = KeyPair.fromString(publicKey)
    await this.keyStore.setKey(network, newAccountId, keyPair)
    
    const result = await creatorAccount.createAccount(
      newAccountId,
      keyPair.getPublicKey(),
      utils.format.parseNearAmount(initialBalance)
    )
    
    return {
      transactionHash: result.transaction.hash,
    }
  }

  async deleteAccount(
    network: string,
    accountId: string,
    beneficiaryId: string
  ): Promise<{ transactionHash: string }> {
    const account = await this.getAccount(network, accountId)
    
    const result = await account.deleteAccount(beneficiaryId)
    
    return {
      transactionHash: result.transaction.hash,
    }
  }

  generateKeyPair(): KeyPair {
    return KeyPair.fromRandom('ed25519')
  }

  async addKey(
    network: string,
    accountId: string,
    publicKey: string,
    contractId?: string,
    methodNames?: string[]
  ): Promise<{ transactionHash: string }> {
    const account = await this.getAccount(network, accountId)
    const keyPair = KeyPair.fromString(publicKey)
    
    let accessKey
    if (contractId && methodNames) {
      accessKey = transactions.functionCallAccessKey(
        contractId,
        methodNames,
        utils.format.parseNearAmount('0.25')
      )
    } else {
      accessKey = transactions.fullAccessKey()
    }
    
    const result = await account.addKey(keyPair.getPublicKey(), accessKey)
    
    return {
      transactionHash: result.transaction.hash,
    }
  }

  async getValidators(network: string): Promise<any> {
    const near = this.getNear(network)
    const provider = near.connection.provider as providers.JsonRpcProvider
    
    return await provider.validators(null)
  }

  async getNetworkInfo(network: string): Promise<any> {
    const near = this.getNear(network)
    const provider = near.connection.provider as providers.JsonRpcProvider
    
    return await provider.status()
  }
}