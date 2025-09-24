'use client'

import { useState, useEffect } from 'react'
import { Tab } from '@headlessui/react'
import {
  DocumentDuplicateIcon,
  PlayIcon,
  WrenchScrewdriverIcon,
  CogIcon,
  FolderOpenIcon,
  CloudArrowUpIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  InformationCircleIcon,
  CommandLineIcon
} from '@heroicons/react/24/outline'
import MonacoCodeEditor from '../../../components/editor/MonacoCodeEditor'

interface SolidityFile {
  id: string
  name: string
  path: string
  content: string
  compiled: boolean
  hasErrors: boolean
  isLibrary: boolean
  isInterface: boolean
  isAbstract: boolean
}

interface CompilationResult {
  success: boolean
  warnings: Array<{ message: string; severity: string; line: number }>
  errors: Array<{ message: string; severity: string; line: number }>
  abi?: any[]
  bytecode?: string
  gasEstimate?: number
}

interface NetworkConfig {
  id: string
  name: string
  chainId: number
  rpcUrl: string
  symbol: string
  isTestnet: boolean
  isActive: boolean
}

function classNames(...classes: string[]) {
  return classes.filter(Boolean).join(' ')
}

export default function SolidityIDE() {
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [files, setFiles] = useState<SolidityFile[]>([
    {
      id: '1',
      name: 'MyToken.sol',
      path: 'contracts/MyToken.sol',
      content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
    constructor(address initialOwner)
        ERC20("MyToken", "MTK")
        Ownable(initialOwner)
    {
        _mint(msg.sender, 1000000 * 10 ** decimals());
    }

    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}`,
      compiled: false,
      hasErrors: false,
      isLibrary: false,
      isInterface: false,
      isAbstract: false
    },
    {
      id: '2',
      name: 'counter_program.rs',
      path: 'programs/counter/src/lib.rs',
      content: `use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod counter_program {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = 0;
        Ok(())
    }

    pub fn increment(ctx: Context<Update>) -> Result<()> {
        let counter = &mut ctx.accounts.counter;
        counter.count = counter.count.checked_add(1).unwrap();
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub counter: Account<'info, Counter>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub counter: Account<'info, Counter>,
}

#[account]
pub struct Counter {
    pub count: u64,
}`,
      compiled: false,
      hasErrors: false,
      isLibrary: false,
      isInterface: false,
      isAbstract: false
    },
    {
      id: '3',
      name: 'hello_near.rs',
      path: 'src/lib.rs',
      content: `use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{near_bindgen, env, log, AccountId, Promise};

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct HelloNear {
    pub greeting: String,
    pub records: std::collections::HashMap<AccountId, String>,
}

impl Default for HelloNear {
    fn default() -> Self {
        Self {
            greeting: "Hello, NEAR!".to_string(),
            records: std::collections::HashMap::new(),
        }
    }
}

#[near_bindgen]
impl HelloNear {
    pub fn get_greeting(&self) -> String {
        self.greeting.clone()
    }

    pub fn set_greeting(&mut self, greeting: String) {
        log!("Setting greeting to: {}", greeting);
        self.greeting = greeting;
    }

    pub fn say_hello(&self, account_id: AccountId) -> String {
        format!("{}, {}!", self.greeting, account_id)
    }

    pub fn set_record(&mut self, message: String) {
        let account_id = env::signer_account_id();
        log!("{} set record: {}", account_id, message);
        self.records.insert(account_id, message);
    }

    pub fn get_record(&self, account_id: AccountId) -> Option<String> {
        self.records.get(&account_id).cloned()
    }
}`,
      compiled: false,
      hasErrors: false,
      isLibrary: false,
      isInterface: false,
      isAbstract: false
    }
  ])
  
  const [activeFileId, setActiveFileId] = useState('1')
  const [compilationResult, setCompilationResult] = useState<CompilationResult | null>(null)
  const [isCompiling, setIsCompiling] = useState(false)
  const [networks, setNetworks] = useState<NetworkConfig[]>([
    { id: '1', name: 'Ethereum Mainnet', chainId: 1, rpcUrl: 'https://mainnet.infura.io', symbol: 'ETH', isTestnet: false, isActive: true },
    { id: '11155111', name: 'Sepolia Testnet', chainId: 11155111, rpcUrl: 'https://sepolia.infura.io', symbol: 'ETH', isTestnet: true, isActive: true },
    { id: '137', name: 'Polygon Mainnet', chainId: 137, rpcUrl: 'https://polygon-rpc.com', symbol: 'MATIC', isTestnet: false, isActive: true },
    { id: '80001', name: 'Mumbai Testnet', chainId: 80001, rpcUrl: 'https://rpc-mumbai.maticvigil.com', symbol: 'MATIC', isTestnet: true, isActive: true },
  ])
  const [selectedNetwork, setSelectedNetwork] = useState('11155111')
  const [isDeploying, setIsDeploying] = useState(false)

  const activeFile = files.find(f => f.id === activeFileId) || files[0]

  const handleFileChange = (content: string) => {
    setFiles(prev => prev.map(file => 
      file.id === activeFileId 
        ? { ...file, content, compiled: false }
        : file
    ))
  }

  const compileContract = async () => {
    try {
      setIsCompiling(true)
      
      // Determine compilation type based on file extension
      let endpoint = '/api/blockchain/compile/solidity'
      let contractName = activeFile.name.replace('.sol', '').replace('.rs', '')
      
      if (activeFile.name.endsWith('.rs')) {
        if (activeFile.content.includes('anchor_lang::prelude')) {
          endpoint = '/api/blockchain/compile/solana'
        } else if (activeFile.content.includes('near_sdk')) {
          endpoint = '/api/blockchain/compile/near'
        }
      }
      
      const payload = activeFile.name.endsWith('.rs') 
        ? {
            source: activeFile.content,
            programName: contractName,
            release: false
          }
        : {
            source: activeFile.content,
            contractName: contractName,
            version: '0.8.24',
            optimization: true,
            optimizationRuns: 200,
            evmVersion: 'london'
          }

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify(payload)
      })

      const result = await response.json()
      setCompilationResult(result)
      
      // Update file compilation status
      setFiles(prev => prev.map(file => 
        file.id === activeFileId 
          ? { ...file, compiled: result.success, hasErrors: !result.success }
          : file
      ))
    } catch (error) {
      console.error('Compilation error:', error)
      setCompilationResult({
        success: false,
        errors: [{ message: 'Failed to compile contract', severity: 'error', line: 1 }],
        warnings: []
      })
    } finally {
      setIsCompiling(false)
    }
  }

  const deployContract = async () => {
    if (!compilationResult?.success) {
      alert('Contract must be compiled successfully before deployment')
      return
    }

    try {
      setIsDeploying(true)
      const response = await fetch('/api/solidity/deploy', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('auth_token')}`
        },
        body: JSON.stringify({
          contractName: activeFile.name.replace('.sol', ''),
          abi: compilationResult.abi,
          bytecode: compilationResult.bytecode,
          networkId: selectedNetwork,
          constructorArgs: []
        })
      })

      const result = await response.json()
      if (result.success) {
        alert(`Contract deployed successfully at address: ${result.contractAddress}`)
      } else {
        alert(`Deployment failed: ${result.error}`)
      }
    } catch (error) {
      console.error('Deployment error:', error)
      alert('Deployment failed')
    } finally {
      setIsDeploying(false)
    }
  }

  const createNewFile = (fileType: 'solidity' | 'solana' | 'near' = 'solidity') => {
    const newId = (files.length + 1).toString()
    
    const templates = {
      solidity: {
        name: `Contract${newId}.sol`,
        path: `contracts/Contract${newId}.sol`,
        content: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Contract${newId} {
    // Your contract code here
}`
      },
      solana: {
        name: `program${newId}.rs`,
        path: `programs/program${newId}/src/lib.rs`,
        content: `use anchor_lang::prelude::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod program${newId} {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, data: u64) -> Result<()> {
        let account = &mut ctx.accounts.my_account;
        account.data = data;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub my_account: Account<'info, MyAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[account]
pub struct MyAccount {
    pub data: u64,
}`
      },
      near: {
        name: `contract${newId}.rs`,
        path: `src/lib.rs`,
        content: `use near_sdk::borsh::{self, BorshDeserialize, BorshSerialize};
use near_sdk::{near_bindgen, env};

#[near_bindgen]
#[derive(BorshDeserialize, BorshSerialize)]
pub struct Contract {
    pub message: String,
}

impl Default for Contract {
    fn default() -> Self {
        Self {
            message: "Hello, World!".to_string(),
        }
    }
}

#[near_bindgen]
impl Contract {
    pub fn get_message(&self) -> String {
        self.message.clone()
    }

    pub fn set_message(&mut self, message: String) {
        env::log_str(&format!("Setting message to: {}", message));
        self.message = message;
    }
}`
      }
    }
    
    const template = templates[fileType]
    const newFile: SolidityFile = {
      id: newId,
      name: template.name,
      path: template.path,
      content: template.content,
      compiled: false,
      hasErrors: false,
      isLibrary: false,
      isInterface: false,
      isAbstract: false
    }
    setFiles(prev => [...prev, newFile])
    setActiveFileId(newId)
  }

  const tabs = [
    {
      name: 'Editor',
      icon: DocumentDuplicateIcon,
      content: (
        <div className="flex h-full">
          {/* File Explorer */}
          <div className="w-64 bg-gray-50 border-r border-gray-200 p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-medium text-gray-900">Files</h3>
              <div className="relative">
                <select
                  onChange={(e) => createNewFile(e.target.value as 'solidity' | 'solana' | 'near')}
                  className="text-xs border border-gray-300 rounded px-2 py-1 bg-white"
                  defaultValue=""
                >
                  <option value="" disabled>New File</option>
                  <option value="solidity">Solidity (.sol)</option>
                  <option value="solana">Solana Rust (.rs)</option>
                  <option value="near">NEAR Rust (.rs)</option>
                </select>
              </div>
            </div>
            <div className="space-y-1">
              {files.map(file => (
                <button
                  key={file.id}
                  onClick={() => setActiveFileId(file.id)}
                  className={`w-full text-left px-2 py-1 rounded text-sm flex items-center gap-2 ${
                    file.id === activeFileId
                      ? 'bg-blue-100 text-blue-900'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className={`w-2 h-2 rounded-full ${
                    file.hasErrors ? 'bg-red-500' :
                    file.compiled ? 'bg-green-500' : 'bg-gray-300'
                  }`} />
                  {file.name}
                </button>
              ))}
            </div>
          </div>

          {/* Editor */}
          <div className="flex-1 flex flex-col">
            <div className="flex items-center justify-between px-4 py-2 border-b border-gray-200 bg-white">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{activeFile.name}</span>
                {!activeFile.compiled && (
                  <span className="text-xs text-orange-600">Not compiled</span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={compileContract}
                  disabled={isCompiling}
                  className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <WrenchScrewdriverIcon className="h-4 w-4" />
                  {isCompiling ? 'Compiling...' : 'Compile'}
                </button>
                <button
                  onClick={deployContract}
                  disabled={isDeploying || !compilationResult?.success}
                  className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                >
                  <CloudArrowUpIcon className="h-4 w-4" />
                  {isDeploying ? 'Deploying...' : 'Deploy'}
                </button>
              </div>
            </div>

            <div className="flex-1">
              <MonacoCodeEditor
                value={activeFile.content}
                onChange={handleFileChange}
                language="solidity"
                theme="vs-dark"
                className="h-full"
                enableAISuggestions={true}
                enableCollaboration={false}
              />
            </div>
          </div>
        </div>
      )
    },
    {
      name: 'Compilation',
      icon: WrenchScrewdriverIcon,
      content: (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Compilation Results</h3>
            <button
              onClick={compileContract}
              disabled={isCompiling}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              {isCompiling ? 'Compiling...' : 'Compile Contract'}
            </button>
          </div>

          {compilationResult ? (
            <div className="space-y-4">
              <div className={`p-4 rounded-lg ${
                compilationResult.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
              }`}>
                <div className="flex items-center gap-2">
                  {compilationResult.success ? (
                    <CheckCircleIcon className="h-5 w-5 text-green-500" />
                  ) : (
                    <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                  )}
                  <span className={`font-medium ${
                    compilationResult.success ? 'text-green-800' : 'text-red-800'
                  }`}>
                    {compilationResult.success ? 'Compilation Successful' : 'Compilation Failed'}
                  </span>
                </div>
              </div>

              {compilationResult.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 mb-2">Errors</h4>
                  <div className="space-y-2">
                    {compilationResult.errors.map((error, index) => (
                      <div key={index} className="text-sm text-red-700">
                        Line {error.line}: {error.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {compilationResult.warnings.length > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                  <h4 className="font-medium text-yellow-800 mb-2">Warnings</h4>
                  <div className="space-y-2">
                    {compilationResult.warnings.map((warning, index) => (
                      <div key={index} className="text-sm text-yellow-700">
                        Line {warning.line}: {warning.message}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {compilationResult.success && (
                <div className="space-y-4">
                  {compilationResult.gasEstimate && (
                    <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                      <h4 className="font-medium text-blue-800 mb-2">Gas Estimation</h4>
                      <div className="text-sm text-blue-700">
                        Deployment cost: ~{compilationResult.gasEstimate.toLocaleString()} gas
                      </div>
                    </div>
                  )}

                  {compilationResult.abi && (
                    <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                      <h4 className="font-medium text-gray-800 mb-2">Contract ABI</h4>
                      <pre className="text-xs text-gray-600 overflow-x-auto bg-white p-2 rounded">
                        {JSON.stringify(compilationResult.abi, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 text-gray-500">
              <WrenchScrewdriverIcon className="mx-auto h-12 w-12 text-gray-300 mb-4" />
              <p>No compilation results yet. Click "Compile Contract" to get started.</p>
            </div>
          )}
        </div>
      )
    },
    {
      name: 'Deploy',
      icon: CloudArrowUpIcon,
      content: (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Contract Deployment</h3>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-6">
            <h4 className="font-medium text-gray-900 mb-4">Network Configuration</h4>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Target Network
                </label>
                <select
                  value={selectedNetwork}
                  onChange={(e) => setSelectedNetwork(e.target.value)}
                  className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500"
                >
                  {networks.filter(n => n.isActive).map(network => (
                    <option key={network.id} value={network.id}>
                      {network.name} ({network.symbol})
                    </option>
                  ))}
                </select>
              </div>

              {selectedNetwork && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <h5 className="font-medium text-gray-900 mb-2">Network Details</h5>
                  {(() => {
                    const network = networks.find(n => n.id === selectedNetwork)
                    return network ? (
                      <div className="text-sm text-gray-600 space-y-1">
                        <div>Chain ID: {network.chainId}</div>
                        <div>Type: {network.isTestnet ? 'Testnet' : 'Mainnet'}</div>
                        <div>Symbol: {network.symbol}</div>
                      </div>
                    ) : null
                  })()}
                </div>
              )}

              <div className="pt-4 border-t">
                <button
                  onClick={deployContract}
                  disabled={isDeploying || !compilationResult?.success}
                  className="w-full px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  <CloudArrowUpIcon className="h-5 w-5" />
                  {isDeploying ? 'Deploying Contract...' : 'Deploy Contract'}
                </button>
                {!compilationResult?.success && (
                  <p className="text-sm text-gray-500 mt-2 text-center">
                    Contract must be compiled successfully before deployment
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )
    },
    {
      name: 'Security',
      icon: ShieldCheckIcon,
      content: (
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium text-gray-900">Security Analysis</h3>
            <button className="px-4 py-2 bg-purple-600 text-white rounded hover:bg-purple-700">
              Run Security Scan
            </button>
          </div>

          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <InformationCircleIcon className="h-5 w-5 text-yellow-500" />
              <span className="font-medium text-yellow-800">Security Scanner</span>
            </div>
            <p className="text-sm text-yellow-700">
              Security scanning will be available once you compile your contract and integrate with security analysis tools.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Common Vulnerabilities</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Reentrancy attacks</li>
                <li>• Integer overflow/underflow</li>
                <li>• Access control issues</li>
                <li>• Front-running vulnerabilities</li>
                <li>• Gas limit problems</li>
              </ul>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-4">
              <h4 className="font-medium text-gray-900 mb-2">Best Practices</h4>
              <ul className="text-sm text-gray-600 space-y-1">
                <li>• Use OpenZeppelin contracts</li>
                <li>• Implement proper access control</li>
                <li>• Add comprehensive tests</li>
                <li>• Use events for transparency</li>
                <li>• Follow check-effects-interactions</li>
              </ul>
            </div>
          </div>
        </div>
      )
    },
    {
      name: 'Settings',
      icon: CogIcon,
      content: (
        <div className="p-6 space-y-6">
          <h3 className="text-lg font-medium text-gray-900">IDE Settings</h3>

          <div className="space-y-6">
            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h4 className="font-medium text-gray-900 mb-4">Compiler Settings</h4>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Solidity Version
                  </label>
                  <select className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                    <option>0.8.24 (latest)</option>
                    <option>0.8.23</option>
                    <option>0.8.22</option>
                    <option>0.8.21</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    EVM Version
                  </label>
                  <select className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500">
                    <option>london</option>
                    <option>paris</option>
                    <option>shanghai</option>
                  </select>
                </div>

                <div className="flex items-center">
                  <input
                    id="optimization"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="optimization" className="ml-2 text-sm text-gray-700">
                    Enable optimization (200 runs)
                  </label>
                </div>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-lg p-6">
              <h4 className="font-medium text-gray-900 mb-4">Editor Settings</h4>
              <div className="space-y-4">
                <div className="flex items-center">
                  <input
                    id="ai-suggestions"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="ai-suggestions" className="ml-2 text-sm text-gray-700">
                    Enable AI code suggestions
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    id="auto-save"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="auto-save" className="ml-2 text-sm text-gray-700">
                    Auto-save files
                  </label>
                </div>

                <div className="flex items-center">
                  <input
                    id="syntax-highlighting"
                    type="checkbox"
                    defaultChecked
                    className="h-4 w-4 text-blue-600 focus:ring-blue-500 border-gray-300 rounded"
                  />
                  <label htmlFor="syntax-highlighting" className="ml-2 text-sm text-gray-700">
                    Advanced syntax highlighting
                  </label>
                </div>
              </div>
            </div>
          </div>
        </div>
      )
    }
  ]

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <div className="flex-shrink-0 bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">Solidity IDE</h1>
            <p className="text-sm text-gray-600">Professional Solidity development environment</p>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-500">
              {files.filter(f => f.compiled).length}/{files.length} compiled
            </span>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <Tab.Group selectedIndex={selectedIndex} onChange={setSelectedIndex}>
          <div className="flex h-full">
            {/* Sidebar with Tabs */}
            <div className="w-16 bg-gray-900 flex flex-col">
              <Tab.List className="flex flex-col space-y-1 p-2">
                {tabs.map((tab, index) => (
                  <Tab
                    key={tab.name}
                    className={({ selected }) =>
                      classNames(
                        'p-3 rounded-lg flex flex-col items-center justify-center text-xs font-medium transition-colors',
                        selected
                          ? 'bg-blue-600 text-white'
                          : 'text-gray-400 hover:text-white hover:bg-gray-700'
                      )
                    }
                    title={tab.name}
                  >
                    <tab.icon className="h-6 w-6 mb-1" />
                    <span className="hidden sm:block">{tab.name}</span>
                  </Tab>
                ))}
              </Tab.List>
            </div>

            {/* Main Panel */}
            <div className="flex-1 bg-white">
              <Tab.Panels className="h-full">
                {tabs.map((tab, index) => (
                  <Tab.Panel key={index} className="h-full">
                    {tab.content}
                  </Tab.Panel>
                ))}
              </Tab.Panels>
            </div>
          </div>
        </Tab.Group>
      </div>
    </div>
  )
}