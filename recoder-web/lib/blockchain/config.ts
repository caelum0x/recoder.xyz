// Mock wagmi types to avoid missing dependencies
interface Chain {
  id: number;
  name: string;
  network: string;
  nativeCurrency: {
    name: string;
    symbol: string;
    decimals: number;
  };
  rpcUrls: {
    default: { http: string[] };
    public: { http: string[] };
  };
  blockExplorers: {
    default: { name: string; url: string };
  };
  testnet?: boolean;
}

// Mock chain configurations
const mainnet: Chain = {
  id: 1,
  name: 'Ethereum',
  network: 'homestead',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://eth.llamarpc.com'] }, public: { http: ['https://eth.llamarpc.com'] } },
  blockExplorers: { default: { name: 'Etherscan', url: 'https://etherscan.io' } },
};

const polygon: Chain = {
  id: 137,
  name: 'Polygon',
  network: 'matic',
  nativeCurrency: { name: 'Polygon', symbol: 'MATIC', decimals: 18 },
  rpcUrls: { default: { http: ['https://polygon.llamarpc.com'] }, public: { http: ['https://polygon.llamarpc.com'] } },
  blockExplorers: { default: { name: 'PolygonScan', url: 'https://polygonscan.com' } },
};

const bsc: Chain = {
  id: 56,
  name: 'BNB Smart Chain',
  network: 'bsc',
  nativeCurrency: { name: 'BNB', symbol: 'BNB', decimals: 18 },
  rpcUrls: { default: { http: ['https://bsc.llamarpc.com'] }, public: { http: ['https://bsc.llamarpc.com'] } },
  blockExplorers: { default: { name: 'BscScan', url: 'https://bscscan.com' } },
};

const arbitrum: Chain = {
  id: 42161,
  name: 'Arbitrum One',
  network: 'arbitrum',
  nativeCurrency: { name: 'Ether', symbol: 'ETH', decimals: 18 },
  rpcUrls: { default: { http: ['https://arbitrum.llamarpc.com'] }, public: { http: ['https://arbitrum.llamarpc.com'] } },
  blockExplorers: { default: { name: 'Arbiscan', url: 'https://arbiscan.io' } },
};

// Extended chain configuration with real network details
export const supportedChains = [
  mainnet,
  polygon,
  bsc,
  arbitrum,
] as const

// Solana configuration
export const solanaConfig = {
  mainnet: {
    rpcUrl: 'https://api.mainnet-beta.solana.com',
    networkId: 'mainnet-beta',
    explorerUrl: 'https://explorer.solana.com',
  },
  devnet: {
    rpcUrl: 'https://api.devnet.solana.com',
    networkId: 'devnet',
    explorerUrl: 'https://explorer.solana.com',
  },
  testnet: {
    rpcUrl: 'https://api.testnet.solana.com',
    networkId: 'testnet',
    explorerUrl: 'https://explorer.solana.com',
  },
}

// NEAR configuration
export const nearConfig = {
  mainnet: {
    networkId: 'mainnet',
    nodeUrl: 'https://rpc.mainnet.near.org',
    walletUrl: 'https://wallet.mainnet.near.org',
    helperUrl: 'https://helper.mainnet.near.org',
    explorerUrl: 'https://nearblocks.io',
  },
  testnet: {
    networkId: 'testnet',
    nodeUrl: 'https://rpc.testnet.near.org',
    walletUrl: 'https://wallet.testnet.near.org',
    helperUrl: 'https://helper.testnet.near.org',
    explorerUrl: 'https://testnet.nearblocks.io',
  },
}

// DeFi protocol addresses by chain
export const defiProtocols = {
  [mainnet.id]: {
    uniswap: {
      v3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      v3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
      nftManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    },
    aave: {
      pool: '0x87870Bca3F3fD6335C3F4ce8392D69350B4fA4E2',
      dataProvider: '0x7B4EB56E7CD4b454BA8ff71E4518426369a138a3',
      oracle: '0x54586bE62E3c3580375aE3723C145253060Ca0C2',
    },
    compound: {
      comptroller: '0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B',
      cEth: '0x4Ddc2D193948926D02f9B1fE9e1daa0718270ED5',
    },
  },
  [polygon.id]: {
    uniswap: {
      v3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      v3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
      nftManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    },
    aave: {
      pool: '0x794a61358D6845594F94dc1DB02A252b5b4814aD',
      dataProvider: '0x69FA688f1Dc47d4B5d8029D5a35FB7a548310654',
      oracle: '0xb023e699F5a33916Ea823A16485e259257cA8Bd1',
    },
  },
  [bsc.id]: {
    pancakeswap: {
      factory: '0xcA143Ce32Fe78f1f7019d7d551a6402fC5350c73',
      router: '0x10ED43C718714eb63d5aA57B78B54704E256024E',
    },
  },
  [arbitrum.id]: {
    uniswap: {
      v3Factory: '0x1F98431c8aD98523631AE4a59f267346ea31F984',
      v3Router: '0xE592427A0AEce92De3Edee1F18E0157C05861564',
      quoter: '0xb27308f9F90D607463bb33eA1BeBb41C27CE5AB6',
      nftManager: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
    },
  },
}

// Solana DeFi protocols
export const solanaDeFi = {
  raydium: {
    ammProgram: 'CAMMCzo5YL8w4VFF8KVHrK22GGUsp5VTaW7grrKgrWqK',
    serumProgram: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
  },
  jupiter: {
    program: 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4',
  },
  orca: {
    program: '9W959DqEETiGZocYWCQPaJ6sBmUzgfxXfqGeTEdp3aQP',
  },
}

// NEAR DeFi protocols
export const nearDeFi = {
  refFinance: {
    contract: 'v2.ref-finance.near',
  },
  burrow: {
    contract: 'contract.main.burrow.near',
  },
}

// IPFS configuration
export const ipfsConfig = {
  gateways: [
    'https://ipfs.io/ipfs/',
    'https://gateway.pinata.cloud/ipfs/',
    'https://cloudflare-ipfs.com/ipfs/',
  ],
  api: {
    host: 'ipfs.infura.io',
    port: 5001,
    protocol: 'https',
  },
  pinata: {
    apiUrl: 'https://api.pinata.cloud',
  },
}

// Security scanning configuration
export const securityConfig = {
  mythx: {
    apiUrl: 'https://api.mythx.io',
  },
  slither: {
    enabled: true,
  },
  oyente: {
    enabled: true,
  },
}

// Wallet configuration
export const walletConfig = {
  walletConnect: {
    projectId: process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID || '',
    metadata: {
      name: 'Recoder.xyz',
      description: 'AI-powered development platform with multi-chain support',
      url: 'https://recoder.xyz',
      icons: ['https://recoder.xyz/logo.png'],
    },
  },
  solana: {
    autoConnect: true,
    endpoints: {
      mainnet: solanaConfig.mainnet.rpcUrl,
      devnet: solanaConfig.devnet.rpcUrl,
      testnet: solanaConfig.testnet.rpcUrl,
    },
  },
  near: {
    autoConnect: true,
    modules: [
      {
        id: 'my-near-wallet',
        type: 'browser',
        metadata: {
          name: 'My NEAR Wallet',
          description: 'Web wallet for NEAR Protocol',
          iconUrl: 'https://mynearwallet.com/icon.png',
        },
      },
      {
        id: 'sender',
        type: 'browser',
        metadata: {
          name: 'Sender Wallet',
          description: 'Multi-chain wallet supporting NEAR',
          iconUrl: 'https://senderwallet.io/icon.png',
        },
      },
      {
        id: 'here-wallet',
        type: 'browser',
        metadata: {
          name: 'HERE Wallet',
          description: 'Mobile-first wallet for NEAR Protocol',
          iconUrl: 'https://herewallet.app/icon.png',
        },
      },
    ],
  },
}

export type SupportedChain = typeof supportedChains[number]['id']
export type SolanaNetwork = keyof typeof solanaConfig
export type NearNetwork = keyof typeof nearConfig