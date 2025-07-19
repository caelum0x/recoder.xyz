const { ethers } = require('ethers');
const { logger } = require('../../utils/logger');

class EthereumIntegration {
  constructor(options = {}) {
    this.nodeUrl = options.nodeUrl || process.env.ETHEREUM_NODE_URL || 'https://mainnet.infura.io/v3/';
    this.privateKey = options.privateKey || process.env.ETHEREUM_PRIVATE_KEY;
    this.networkId = options.networkId || 1; // Mainnet
    this.gasLimit = options.gasLimit || 21000;
    this.gasPrice = options.gasPrice;
    this.timeout = options.timeout || 30000;
    
    this.provider = this.createProvider();
    this.wallet = this.privateKey ? new ethers.Wallet(this.privateKey, this.provider) : null;
  }

  createProvider() {
    try {
      if (this.nodeUrl.includes('infura')) {
        const apiKey = process.env.INFURA_API_KEY;
        if (!apiKey) {
          throw new Error('Infura API key is required for Infura provider');
        }
        return new ethers.providers.InfuraProvider(this.networkId, apiKey);
      } else if (this.nodeUrl.includes('alchemy')) {
        const apiKey = process.env.ALCHEMY_API_KEY;
        if (!apiKey) {
          throw new Error('Alchemy API key is required for Alchemy provider');
        }
        return new ethers.providers.AlchemyProvider(this.networkId, apiKey);
      } else {
        return new ethers.providers.JsonRpcProvider(this.nodeUrl);
      }
    } catch (error) {
      logger.error('Failed to create Ethereum provider:', error);
      throw error;
    }
  }

  async getBalance(address) {
    try {
      const balance = await this.provider.getBalance(address);
      return {
        success: true,
        balance: ethers.utils.formatEther(balance),
        balanceWei: balance.toString()
      };
    } catch (error) {
      logger.error('Failed to get balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTransaction(txHash) {
    try {
      const tx = await this.provider.getTransaction(txHash);
      const receipt = await this.provider.getTransactionReceipt(txHash);
      
      return {
        success: true,
        transaction: tx,
        receipt: receipt
      };
    } catch (error) {
      logger.error('Failed to get transaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendTransaction(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for sending transactions.'
      };
    }

    const { to, value, data, gasLimit, gasPrice } = options;

    try {
      const tx = {
        to,
        value: ethers.utils.parseEther(value.toString()),
        gasLimit: gasLimit || this.gasLimit,
        gasPrice: gasPrice || this.gasPrice || await this.provider.getGasPrice(),
        data: data || '0x'
      };

      const signedTx = await this.wallet.sendTransaction(tx);
      const receipt = await signedTx.wait();

      return {
        success: true,
        transactionHash: signedTx.hash,
        receipt: receipt
      };
    } catch (error) {
      logger.error('Failed to send transaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deployContract(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for contract deployment.'
      };
    }

    const { abi, bytecode, constructorArgs = [], gasLimit, gasPrice } = options;

    try {
      const factory = new ethers.ContractFactory(abi, bytecode, this.wallet);
      
      const deployTx = await factory.deploy(...constructorArgs, {
        gasLimit: gasLimit || this.gasLimit,
        gasPrice: gasPrice || this.gasPrice || await this.provider.getGasPrice()
      });

      const contract = await deployTx.deployed();

      return {
        success: true,
        contractAddress: contract.address,
        transactionHash: deployTx.deployTransaction.hash,
        contract: contract
      };
    } catch (error) {
      logger.error('Failed to deploy contract:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async callContract(options) {
    const { contractAddress, abi, methodName, args = [], value = 0 } = options;

    try {
      const contract = new ethers.Contract(contractAddress, abi, this.provider);
      
      if (value > 0 || methodName.includes('write') || methodName.includes('send')) {
        if (!this.wallet) {
          return {
            success: false,
            error: 'Wallet not configured for state-changing calls'
          };
        }
        
        const contractWithSigner = contract.connect(this.wallet);
        const tx = await contractWithSigner[methodName](...args, {
          value: ethers.utils.parseEther(value.toString())
        });
        const receipt = await tx.wait();
        
        return {
          success: true,
          transactionHash: tx.hash,
          receipt: receipt,
          result: receipt.events
        };
      } else {
        const result = await contract[methodName](...args);
        
        return {
          success: true,
          result: result
        };
      }
    } catch (error) {
      logger.error('Failed to call contract:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async estimateGas(options) {
    const { to, value, data } = options;

    try {
      const tx = {
        to,
        value: ethers.utils.parseEther(value.toString()),
        data: data || '0x'
      };

      const gasEstimate = await this.provider.estimateGas(tx);
      
      return {
        success: true,
        gasEstimate: gasEstimate.toString()
      };
    } catch (error) {
      logger.error('Failed to estimate gas:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getGasPrice() {
    try {
      const gasPrice = await this.provider.getGasPrice();
      
      return {
        success: true,
        gasPrice: gasPrice.toString(),
        gasPriceGwei: ethers.utils.formatUnits(gasPrice, 'gwei')
      };
    } catch (error) {
      logger.error('Failed to get gas price:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getBlockNumber() {
    try {
      const blockNumber = await this.provider.getBlockNumber();
      
      return {
        success: true,
        blockNumber: blockNumber
      };
    } catch (error) {
      logger.error('Failed to get block number:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getBlock(blockNumber = 'latest') {
    try {
      const block = await this.provider.getBlock(blockNumber);
      
      return {
        success: true,
        block: block
      };
    } catch (error) {
      logger.error('Failed to get block:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async waitForTransaction(txHash, confirmations = 1) {
    try {
      const receipt = await this.provider.waitForTransaction(txHash, confirmations);
      
      return {
        success: true,
        receipt: receipt
      };
    } catch (error) {
      logger.error('Failed to wait for transaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateSmartContract(description, contractType = 'ERC20') {
    const templates = {
      ERC20: {
        name: 'StandardToken',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract StandardToken is ERC20, Ownable {
    constructor(string memory name, string memory symbol, uint256 initialSupply) 
        ERC20(name, symbol) {
        _mint(msg.sender, initialSupply * 10**decimals());
    }
    
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
}`
      },
      ERC721: {
        name: 'StandardNFT',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract StandardNFT is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
    
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}
    
    function mintNFT(address recipient, string memory tokenURI) public onlyOwner returns (uint256) {
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId);
        _setTokenURI(newItemId, tokenURI);
        return newItemId;
    }
}`
      },
      Multisig: {
        name: 'MultiSigWallet',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract MultiSigWallet {
    address[] public owners;
    uint public required;
    
    struct Transaction {
        address to;
        uint value;
        bytes data;
        bool executed;
    }
    
    Transaction[] public transactions;
    mapping(uint => mapping(address => bool)) public confirmations;
    
    event Confirmation(address indexed sender, uint indexed transactionId);
    event Execution(uint indexed transactionId);
    
    constructor(address[] memory _owners, uint _required) {
        require(_owners.length > 0 && _required > 0 && _required <= _owners.length);
        owners = _owners;
        required = _required;
    }
    
    function submitTransaction(address _to, uint _value, bytes memory _data) public returns (uint) {
        uint transactionId = transactions.length;
        transactions.push(Transaction({
            to: _to,
            value: _value,
            data: _data,
            executed: false
        }));
        confirmTransaction(transactionId);
        return transactionId;
    }
    
    function confirmTransaction(uint _transactionId) public {
        require(isOwner(msg.sender));
        require(!confirmations[_transactionId][msg.sender]);
        
        confirmations[_transactionId][msg.sender] = true;
        emit Confirmation(msg.sender, _transactionId);
        
        if (isConfirmed(_transactionId)) {
            executeTransaction(_transactionId);
        }
    }
    
    function executeTransaction(uint _transactionId) public {
        require(isConfirmed(_transactionId));
        require(!transactions[_transactionId].executed);
        
        Transaction storage txn = transactions[_transactionId];
        txn.executed = true;
        
        (bool success,) = txn.to.call{value: txn.value}(txn.data);
        require(success);
        
        emit Execution(_transactionId);
    }
    
    function isOwner(address _address) public view returns (bool) {
        for (uint i = 0; i < owners.length; i++) {
            if (owners[i] == _address) return true;
        }
        return false;
    }
    
    function isConfirmed(uint _transactionId) public view returns (bool) {
        uint count = 0;
        for (uint i = 0; i < owners.length; i++) {
            if (confirmations[_transactionId][owners[i]]) count++;
        }
        return count >= required;
    }
}`
      }
    };

    const template = templates[contractType];
    if (!template) {
      return {
        success: false,
        error: `Contract type ${contractType} not supported`
      };
    }

    return {
      success: true,
      contractName: template.name,
      contractCode: template.code,
      description: `Generated ${contractType} contract: ${description}`
    };
  }

  async analyzeContract(contractAddress) {
    try {
      const code = await this.provider.getCode(contractAddress);
      
      if (code === '0x') {
        return {
          success: false,
          error: 'No contract found at this address'
        };
      }

      const analysis = {
        hasCode: true,
        codeSize: code.length,
        isContract: true,
        analysis: {
          complexity: this.analyzeCodeComplexity(code),
          securityChecks: this.performBasicSecurityChecks(code),
          gasOptimization: this.suggestGasOptimizations(code)
        }
      };

      return {
        success: true,
        contractAddress: contractAddress,
        analysis: analysis
      };
    } catch (error) {
      logger.error('Failed to analyze contract:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  analyzeCodeComplexity(code) {
    return {
      bytecodeLength: code.length,
      complexity: code.length > 10000 ? 'high' : code.length > 5000 ? 'medium' : 'low',
      estimatedFunctions: Math.floor(code.length / 100)
    };
  }

  performBasicSecurityChecks(code) {
    const checks = {
      hasReentrancyGuard: code.includes('nonReentrant'),
      hasAccessControl: code.includes('onlyOwner') || code.includes('onlyRole'),
      hasSafemath: code.includes('SafeMath') || code.includes('checked'),
      hasEvents: code.includes('emit'),
      hasModifiers: true
    };

    const score = Object.values(checks).filter(Boolean).length;
    checks.securityScore = Math.round((score / Object.keys(checks).length) * 100);

    return checks;
  }

  suggestGasOptimizations(code) {
    const suggestions = [];
    
    if (!code.includes('unchecked')) {
      suggestions.push('Consider using unchecked blocks for arithmetic operations that cannot overflow');
    }
    
    if (code.includes('string')) {
      suggestions.push('Consider using bytes32 instead of string for fixed-length data');
    }
    
    if (code.includes('public') && !code.includes('external')) {
      suggestions.push('Use external instead of public for functions only called externally');
    }

    return {
      suggestions: suggestions,
      optimizationPotential: suggestions.length > 2 ? 'high' : suggestions.length > 0 ? 'medium' : 'low'
    };
  }

  // Configuration methods
  setProvider(nodeUrl) {
    this.nodeUrl = nodeUrl;
    this.provider = this.createProvider();
  }

  setWallet(privateKey) {
    this.privateKey = privateKey;
    this.wallet = new ethers.Wallet(privateKey, this.provider);
  }

  setGasOptions(gasLimit, gasPrice) {
    this.gasLimit = gasLimit;
    this.gasPrice = gasPrice;
  }

  // Helper method to validate Ethereum address
  isValidAddress(address) {
    return ethers.utils.isAddress(address);
  }

  // Helper method to convert between units
  convertUnits(value, fromUnit = 'ether', toUnit = 'wei') {
    try {
      if (toUnit === 'wei') {
        return ethers.utils.parseUnits(value.toString(), fromUnit);
      } else {
        return ethers.utils.formatUnits(value, toUnit);
      }
    } catch (error) {
      return null;
    }
  }
}

module.exports = { EthereumIntegration };