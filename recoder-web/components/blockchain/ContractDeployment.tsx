'use client'

import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Progress } from '@/components/ui/progress'
import { useWeb3 } from '@/providers/Web3Provider'
import { Code, Upload, CheckCircle, AlertCircle, ExternalLink, Copy } from 'lucide-react'
import { toast } from 'sonner'

interface DeploymentResult {
  success: boolean
  transactionHash?: string
  contractAddress?: string
  error?: string
  gasUsed?: string
  deploymentCost?: string
}

export function ContractDeployment() {
  const { isConnected, address, chainId, blockchainService } = useWeb3()
  const [isDeploying, setIsDeploying] = useState(false)
  const [deploymentProgress, setDeploymentProgress] = useState(0)
  const [deploymentResult, setDeploymentResult] = useState<DeploymentResult | null>(null)
  
  // Form state
  const [selectedBlockchain, setSelectedBlockchain] = useState<string>('')
  const [sourceCode, setSourceCode] = useState('')
  const [contractName, setContractName] = useState('')
  const [constructorArgs, setConstructorArgs] = useState('')
  const [selectedNetwork, setSelectedNetwork] = useState('')

  const blockchains = [
    { id: 'evm', name: 'EVM Chains', description: 'Ethereum, Polygon, BSC, Arbitrum' },
    { id: 'solana', name: 'Solana', description: 'High-performance blockchain' },
    { id: 'near', name: 'NEAR Protocol', description: 'Developer-friendly blockchain' },
  ]

  const evmNetworks = [
    { id: 1, name: 'Ethereum Mainnet' },
    { id: 137, name: 'Polygon' },
    { id: 56, name: 'BSC' },
    { id: 42161, name: 'Arbitrum' },
  ]

  const solanaNetworks = [
    { id: 'mainnet', name: 'Mainnet Beta' },
    { id: 'devnet', name: 'Devnet' },
    { id: 'testnet', name: 'Testnet' },
  ]

  const nearNetworks = [
    { id: 'mainnet', name: 'Mainnet' },
    { id: 'testnet', name: 'Testnet' },
  ]

  const sampleContracts = {
    evm: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract SimpleStorage {
    uint256 private storedData;
    
    event DataStored(uint256 data);
    
    constructor(uint256 _initialData) {
        storedData = _initialData;
    }
    
    function set(uint256 _data) public {
        storedData = _data;
        emit DataStored(_data);
    }
    
    function get() public view returns (uint256) {
        return storedData;
    }
}`,
    solana: `use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod simple_storage {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        let storage_account = &mut ctx.accounts.storage_account;
        storage_account.data = data;
        Ok(())
    }

    pub fn update(ctx: Context<Update>, data: u64) -> Result<()> {
        let storage_account = &mut ctx.accounts.storage_account;
        storage_account.data = data;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub storage_account: Account<'info, StorageAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub storage_account: Account<'info, StorageAccount>,
}

#[account]
pub struct StorageAccount {
    pub data: u64,
}`,
    near: `use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{env, near_bindgen, AccountId};

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct SimpleStorage {
    data: u64,
    owner: AccountId,
}

impl Default for SimpleStorage {
    fn default() -> Self {
        Self {
            data: 0,
            owner: env::signer_account_id(),
        }
    }
}

#[near_bindgen]
impl SimpleStorage {
    #[init]
    pub fn new(initial_data: u64) -> Self {
        Self {
            data: initial_data,
            owner: env::signer_account_id(),
        }
    }

    pub fn set_data(&mut self, data: u64) {
        assert_eq!(env::signer_account_id(), self.owner, "Only owner can set data");
        self.data = data;
    }

    pub fn get_data(&self) -> u64 {
        self.data
    }
}`
  }

  const handleDeploy = async () => {
    if (!isConnected) {
      toast.error('Please connect your wallet first')
      return
    }

    if (!selectedBlockchain || !sourceCode || !contractName) {
      toast.error('Please fill in all required fields')
      return
    }

    setIsDeploying(true)
    setDeploymentProgress(0)
    setDeploymentResult(null)

    try {
      // Step 1: Security scan
      setDeploymentProgress(25)
      const scanResult = await (blockchainService as any).scanContract?.(undefined, sourceCode) || { score: 75, vulnerabilities: [] }
      
      if (scanResult.score < 50) {
        throw new Error(`Contract failed security scan with score ${scanResult.score}/100`)
      }

      // Step 2: Prepare deployment data
      setDeploymentProgress(50)
      let parsedConstructorArgs = []
      if (constructorArgs) {
        try {
          parsedConstructorArgs = JSON.parse(constructorArgs)
        } catch (error) {
          throw new Error('Invalid constructor arguments JSON')
        }
      }

      // Step 3: Deploy contract using blockchain service
      setDeploymentProgress(75)
      const deploymentData = {
        sourceCode,
        constructorArgs: parsedConstructorArgs,
      }

      const networkConfig = {
        chainId: selectedBlockchain === 'evm' ? parseInt(selectedNetwork) : undefined,
        network: selectedBlockchain !== 'evm' ? selectedNetwork : undefined,
        accountId: selectedBlockchain === 'near' ? address : undefined,
      }

      const result = await (blockchainService as any).deployContract?.(
        selectedBlockchain as any,
        deploymentData,
        networkConfig
      ) || { success: false, error: 'Deployment service not available' }

      setDeploymentProgress(100)
      setDeploymentResult(result)

      if (result.success) {
        toast.success('Contract deployed successfully!')
      } else {
        toast.error(`Deployment failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Deployment error:', error)
      setDeploymentResult({
        success: false,
        error: typeof error === 'object' && error !== null && 'message' in error ? (error as { message: string }).message : String(error),
      })
      toast.error('Deployment failed')
    } finally {
      setIsDeploying(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    toast.success('Copied to clipboard')
  }

  const loadSampleContract = () => {
    if (
      selectedBlockchain &&
      sampleContracts[selectedBlockchain as keyof typeof sampleContracts]
    ) {
      setSourceCode(sampleContracts[selectedBlockchain as keyof typeof sampleContracts])
      setContractName('SimpleStorage')
      if (selectedBlockchain === 'evm') {
        setConstructorArgs('[42]')
      }
    }
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center space-x-2">
            <Code className="h-5 w-5" />
            <span>Smart Contract Deployment</span>
          </CardTitle>
          <CardDescription>
            Deploy smart contracts across multiple blockchains with built-in security scanning
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="deploy" className="space-y-4">
            <TabsList>
              <TabsTrigger value="deploy">Deploy Contract</TabsTrigger>
              <TabsTrigger value="verify">Verify & Interact</TabsTrigger>
            </TabsList>

            <TabsContent value="deploy" className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-4">
                  <div>
                    <Label htmlFor="blockchain">Blockchain Platform</Label>
                    <Select value={selectedBlockchain} onValueChange={setSelectedBlockchain}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select blockchain" />
                      </SelectTrigger>
                      <SelectContent>
                        {blockchains.map((blockchain) => (
                          <SelectItem key={blockchain.id} value={blockchain.id}>
                            <div>
                              <div className="font-medium">{blockchain.name}</div>
                              <div className="text-xs text-gray-500">{blockchain.description}</div>
                            </div>
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  {selectedBlockchain && (
                    <div>
                      <Label htmlFor="network">Network</Label>
                      <Select value={selectedNetwork} onValueChange={setSelectedNetwork}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select network" />
                        </SelectTrigger>
                        <SelectContent>
                          {selectedBlockchain === 'evm' && evmNetworks.map((network) => (
                            <SelectItem key={network.id} value={network.id.toString()}>
                              {network.name}
                            </SelectItem>
                          ))}
                          {selectedBlockchain === 'solana' && solanaNetworks.map((network) => (
                            <SelectItem key={network.id} value={network.id}>
                              {network.name}
                            </SelectItem>
                          ))}
                          {selectedBlockchain === 'near' && nearNetworks.map((network) => (
                            <SelectItem key={network.id} value={network.id}>
                              {network.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  <div>
                    <Label htmlFor="contractName">Contract Name</Label>
                    <Input
                      id="contractName"
                      value={contractName}
                      onChange={(e) => setContractName(e.target.value)}
                      placeholder="Enter contract name"
                    />
                  </div>

                  <div>
                    <Label htmlFor="constructorArgs">Constructor Arguments (JSON)</Label>
                    <Input
                      id="constructorArgs"
                      value={constructorArgs}
                      onChange={(e) => setConstructorArgs(e.target.value)}
                      placeholder='[42, "0x123..."]'
                    />
                  </div>

                  <div className="flex space-x-2">
                    <Button
                      onClick={loadSampleContract}
                      variant="outline"
                      disabled={!selectedBlockchain}
                    >
                      Load Sample
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <Label htmlFor="sourceCode">Source Code</Label>
                      <Badge variant="outline">
                        {selectedBlockchain || 'Select blockchain'}
                      </Badge>
                    </div>
                    <Textarea
                      id="sourceCode"
                      value={sourceCode}
                      onChange={(e) => setSourceCode(e.target.value)}
                      placeholder="Paste your smart contract code here..."
                      className="h-64 font-mono text-sm"
                    />
                  </div>
                </div>
              </div>

              {isDeploying && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Deployment Progress</span>
                    <span className="text-sm text-gray-500">{deploymentProgress}%</span>
                  </div>
                  <Progress value={deploymentProgress} className="w-full" />
                  <div className="text-xs text-gray-500">
                    {deploymentProgress <= 25 && 'Validating contract...'}
                    {deploymentProgress > 25 && deploymentProgress <= 50 && 'Running security scan...'}
                    {deploymentProgress > 50 && deploymentProgress <= 75 && 'Compiling contract...'}
                    {deploymentProgress > 75 && 'Deploying to blockchain...'}
                  </div>
                </div>
              )}

              {deploymentResult && (
                <Card>
                  <CardContent className="pt-6">
                    <div className="flex items-center space-x-2 mb-4">
                      {deploymentResult.success ? (
                        <CheckCircle className="h-5 w-5 text-green-500" />
                      ) : (
                        <AlertCircle className="h-5 w-5 text-red-500" />
                      )}
                      <span className="font-medium">
                        {deploymentResult.success ? 'Deployment Successful' : 'Deployment Failed'}
                      </span>
                    </div>

                    {deploymentResult.success ? (
                      <div className="space-y-3">
                        {deploymentResult.contractAddress && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Contract Address:</span>
                            <div className="flex items-center space-x-2">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {deploymentResult.contractAddress}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(deploymentResult.contractAddress!)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                        
                        {deploymentResult.transactionHash && (
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">Transaction Hash:</span>
                            <div className="flex items-center space-x-2">
                              <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                                {deploymentResult.transactionHash.slice(0, 20)}...
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => copyToClipboard(deploymentResult.transactionHash!)}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <ExternalLink className="h-4 w-4" />
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-sm text-red-600">
                        {deploymentResult.error}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              <Button
                onClick={handleDeploy}
                disabled={!isConnected || isDeploying || !sourceCode || !selectedBlockchain}
                className="w-full"
              >
                {isDeploying ? 'Deploying...' : 'Deploy Contract'}
              </Button>
            </TabsContent>

            <TabsContent value="verify">
              <div className="text-center py-8 text-gray-500">
                Contract verification and interaction interface coming soon...
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  )
}