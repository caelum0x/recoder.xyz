'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
// TODO: Install NEAR wallet dependencies
// import { setupWalletSelector } from '@near-wallet-selector/core'
// import type { WalletSelector, AccountState } from '@near-wallet-selector/core'
// import { setupModal } from '@near-wallet-selector/modal-ui'
// import type { WalletSelectorModal } from '@near-wallet-selector/modal-ui'
// import { setupMyNearWallet } from '@near-wallet-selector/my-near-wallet'
// import { setupSender } from '@near-wallet-selector/sender'
// import { setupHereWallet } from '@near-wallet-selector/here-wallet'

// Mock types until dependencies are installed
type WalletSelector = any
type AccountState = any
type WalletSelectorModal = any
import { nearConfig, walletConfig } from '@/lib/blockchain/config'

interface NearContextType {
  selector: WalletSelector | null
  modal: WalletSelectorModal | null
  accounts: AccountState[]
  accountId: string | null
  isConnected: boolean
  signIn: () => Promise<void>
  signOut: () => Promise<void>
  network: string
}

const NearContext = createContext<NearContextType | null>(null)

interface NearProviderProps {
  children: React.ReactNode
  network?: 'mainnet' | 'testnet'
}

export function NearProvider({ 
  children, 
  network = 'mainnet' 
}: NearProviderProps) {
  const [selector, setSelector] = useState<WalletSelector | null>(null)
  const [modal, setModal] = useState<WalletSelectorModal | null>(null)
  const [accounts, setAccounts] = useState<AccountState[]>([])
  const [accountId, setAccountId] = useState<string | null>(null)

  const isConnected = accounts.length > 0

  useEffect(() => {
    // Mock initialization until NEAR dependencies are installed
    console.log('NEAR Provider initialized in mock mode for network:', network)
    
    // Set mock state
    setSelector({} as WalletSelector)
    setModal({} as WalletSelectorModal)
    setAccounts([])
    setAccountId(null)
  }, [network])

  const signIn = async () => {
    console.log('Mock NEAR sign in - install @near-wallet-selector dependencies for full functionality')
  }

  const signOut = async () => {
    console.log('Mock NEAR sign out - install @near-wallet-selector dependencies for full functionality')
  }

  return (
    <NearContext.Provider
      value={{
        selector,
        modal,
        accounts,
        accountId,
        isConnected,
        signIn,
        signOut,
        network,
      }}
    >
      {children}
    </NearContext.Provider>
  )
}

export function useNear() {
  const context = useContext(NearContext)
  if (!context) {
    throw new Error('useNear must be used within a NearProvider')
  }
  return context
}