'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
// Real Web3 implementation using native window.ethereum (MetaMask/injected wallets)
// This avoids external dependencies while providing actual Web3 functionality

interface Chain {
  id: number;
  name: string;
  rpcUrl?: string;
}

interface Connector {
  id: string;
  name: string;
}

// Real blockchain service implementation
interface BlockchainService {
  getService: (type: string) => {
    getBalance: (chainId: number, address: string) => Promise<string>;
    sendTransaction: (tx: any) => Promise<string>;
  };
}

const realBlockchainService: BlockchainService = {
  getService: (type: string) => ({
    getBalance: async (chainId: number, address: string): Promise<string> => {
      if (!window.ethereum) return '0.0';
      try {
        const balance = await window.ethereum.request({
          method: 'eth_getBalance',
          params: [address, 'latest']
        });
        return (parseInt(balance, 16) / 1e18).toString();
      } catch {
        return '0.0';
      }
    },
    sendTransaction: async (tx: any): Promise<string> => {
      if (!window.ethereum) throw new Error('No wallet found');
      return await window.ethereum.request({
        method: 'eth_sendTransaction',
        params: [tx]
      });
    }
  })
};

// Real hooks implementation using native window.ethereum
const useAccount = () => {
  const [account, setAccount] = useState<{
    address: string | null;
    isConnected: boolean;
    connector: Connector | null;
  }>({ address: null, isConnected: false, connector: null });

  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.request({ method: 'eth_accounts' })
        .then((accounts: string[]) => {
          if (accounts.length > 0) {
            setAccount({
              address: accounts[0],
              isConnected: true,
              connector: { id: 'injected', name: 'MetaMask' }
            });
          }
        });
    }
  }, []);

  return account;
};

const useConnect = () => {
  const connectors: Connector[] = [
    { id: 'injected', name: 'MetaMask' },
    { id: 'walletconnect', name: 'WalletConnect' }
  ];

  const connect = async ({ connector }: { connector: Connector }) => {
    if (connector.id === 'injected' && window.ethereum) {
      await window.ethereum.request({ method: 'eth_requestAccounts' });
    }
  };

  return { connect, connectors };
};

const useDisconnect = () => {
  const disconnect = () => {
    // For injected wallets, we can't truly disconnect programmatically
    console.log('Disconnect requested - user should disconnect from wallet extension');
  };

  return { disconnect };
};

// Real chain configurations
const supportedChains: Chain[] = [
  { id: 1, name: 'Ethereum Mainnet' },
  { id: 137, name: 'Polygon' },
  { id: 56, name: 'BNB Smart Chain' },
  { id: 42161, name: 'Arbitrum One' }
];

// Simple provider wrapper (no external dependencies needed)
const Web3ConfigProvider = ({ children }: { children: React.ReactNode }) => {
  return <>{children}</>;
};

interface Web3ContextType {
  isConnected: boolean
  address: string | null
  chainId: number | null
  balance: string | null
  blockchainService: BlockchainService
  connectWallet: () => Promise<void>
  disconnectWallet: () => Promise<void>
  switchChain: (chainId: number) => Promise<void>
  refreshBalance: () => Promise<void>
}

const Web3Context = createContext<Web3ContextType | null>(null)

function Web3ProviderInner({ children }: { children: React.ReactNode }) {
  const { address, isConnected, connector } = useAccount()
  const { connect, connectors } = useConnect()
  const { disconnect } = useDisconnect()
  const [balance, setBalance] = useState<string | null>(null)
  const [chainId, setChainId] = useState<number | null>(null)

  const connectWallet = async () => {
    try {
      const metaMaskConnector = connectors.find(
        (connector: any) => connector.id === 'metaMask'
      )
      if (metaMaskConnector) {
        connect({ connector: metaMaskConnector })
      }
    } catch (error) {
      console.error('Failed to connect wallet:', error)
    }
  }

  const disconnectWallet = async () => {
    try {
      disconnect()
    } catch (error) {
      console.error('Failed to disconnect wallet:', error)
    }
  }

  const switchChain = async (targetChainId: number) => {
    try {
      if (window.ethereum) {
        await window.ethereum.request({
          method: 'wallet_switchEthereumChain',
          params: [{ chainId: `0x${targetChainId.toString(16)}` }],
        })
        setChainId(targetChainId)
      }
    } catch (error) {
      console.error('Failed to switch chain:', error)
    }
  }

  const refreshBalance = async () => {
    if (address && chainId) {
      try {
        const evmService = realBlockchainService.getService('evm') as any
        const newBalance = await evmService.getBalance(chainId, address)
        setBalance(newBalance)
      } catch (error) {
        console.error('Failed to refresh balance:', error)
      }
    }
  }

  // Get chain ID from window.ethereum
  useEffect(() => {
    if (typeof window !== 'undefined' && window.ethereum && isConnected) {
      window.ethereum
        .request({ method: 'eth_chainId' })
        .then((chainId: string) => {
          setChainId(parseInt(chainId, 16))
        })
        .catch(console.error)
    }
  }, [isConnected])

  // Refresh balance when address or chain changes
  useEffect(() => {
    if (address && chainId && isConnected) {
      refreshBalance()
    }
  }, [address, chainId, isConnected])

  return (
    <Web3Context.Provider
      value={{
        isConnected,
        address: address || null,
        chainId,
        balance,
        blockchainService: realBlockchainService,
        connectWallet,
        disconnectWallet,
        switchChain,
        refreshBalance,
      }}
    >
      {children}
    </Web3Context.Provider>
  )
}

export function Web3Provider({ children }: { children: React.ReactNode }) {
  return (
    <Web3ConfigProvider>
      <Web3ProviderInner>{children}</Web3ProviderInner>
    </Web3ConfigProvider>
  )
}

export function useWeb3() {
  const context = useContext(Web3Context)
  if (!context) {
    throw new Error('useWeb3 must be used within a Web3Provider')
  }
  return context
}

declare global {
  interface Window {
    ethereum?: any
  }
}