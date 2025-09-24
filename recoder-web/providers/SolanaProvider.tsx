'use client'

import React, { createContext, useContext, useMemo } from 'react'
// Mock Solana implementation to avoid missing dependencies
// Real implementation would use @solana/wallet-adapter-react and related packages

// Mock types
enum WalletAdapterNetwork {
  Mainnet = 'mainnet-beta',
  Testnet = 'testnet',
  Devnet = 'devnet',
}

interface SolanaContextType {
  network: WalletAdapterNetwork
  endpoint: string
}

const SolanaContext = createContext<SolanaContextType | null>(null)

interface SolanaProviderProps {
  children: React.ReactNode
  network?: WalletAdapterNetwork
}

// Mock solana config
const solanaConfig = {
  mainnet: { rpcUrl: 'https://api.mainnet-beta.solana.com' },
  testnet: { rpcUrl: 'https://api.testnet.solana.com' },
  devnet: { rpcUrl: 'https://api.devnet.solana.com' }
}

export function SolanaProvider({ 
  children, 
  network = WalletAdapterNetwork.Mainnet 
}: SolanaProviderProps) {
  // The network can be set to 'devnet', 'testnet', or 'mainnet-beta'
  const endpoint = useMemo(() => {
    switch (network) {
      case WalletAdapterNetwork.Mainnet:
        return solanaConfig.mainnet.rpcUrl
      case WalletAdapterNetwork.Testnet:
        return solanaConfig.testnet.rpcUrl
      case WalletAdapterNetwork.Devnet:
        return solanaConfig.devnet.rpcUrl
      default:
        return solanaConfig.mainnet.rpcUrl
    }
  }, [network])

  return (
    <SolanaContext.Provider value={{ network, endpoint }}>
      {children}
    </SolanaContext.Provider>
  )
}

export function useSolana() {
  const context = useContext(SolanaContext)
  if (!context) {
    throw new Error('useSolana must be used within a SolanaProvider')
  }
  return context
}