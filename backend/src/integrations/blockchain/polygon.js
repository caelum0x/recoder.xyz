const { ethers } = require('ethers');
const { logger } = require('../../utils/logger');

class PolygonIntegration {
  constructor(options = {}) {
    this.nodeUrl = options.nodeUrl || process.env.POLYGON_NODE_URL || 'https://polygon-rpc.com';
    this.privateKey = options.privateKey || process.env.POLYGON_PRIVATE_KEY;
    this.networkId = options.networkId || 137; // Polygon Mainnet
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
        return new ethers.providers.InfuraProvider('matic', apiKey);
      } else if (this.nodeUrl.includes('alchemy')) {
        const apiKey = process.env.ALCHEMY_API_KEY;
        if (!apiKey) {
          throw new Error('Alchemy API key is required for Alchemy provider');
        }
        return new ethers.providers.AlchemyProvider('matic', apiKey);
      } else {
        return new ethers.providers.JsonRpcProvider(this.nodeUrl);
      }
    } catch (error) {
      logger.error('Failed to create Polygon provider:', error);
      throw error;
    }
  }

  async getBalance(address) {
    try {
      const balance = await this.provider.getBalance(address);
      return {
        success: true,
        balance: ethers.utils.formatEther(balance),
        balanceWei: balance.toString(),
        currency: 'MATIC'
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

  async sendMatic(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for sending transactions.'
      };
    }

    const { to, value, gasLimit, gasPrice } = options;

    try {
      const tx = {
        to,
        value: ethers.utils.parseEther(value.toString()),
        gasLimit: gasLimit || this.gasLimit,
        gasPrice: gasPrice || this.gasPrice || await this.provider.getGasPrice()
      };

      const signedTx = await this.wallet.sendTransaction(tx);
      const receipt = await signedTx.wait();

      return {
        success: true,
        transactionHash: signedTx.hash,
        receipt: receipt
      };
    } catch (error) {
      logger.error('Failed to send MATIC:', error);
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

  async bridgeFromEthereum(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for bridging.'
      };
    }

    const { tokenAddress, amount, bridgeType = 'pos' } = options;

    try {
      // This is a simplified bridge operation
      // In practice, you would interact with the actual bridge contracts
      
      const bridgeContractAddress = bridgeType === 'pos' ? 
        '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77' : // POS Bridge
        '0x8484Ef722627bf18ca5Ae6BcF031c23E6e922B30';   // Plasma Bridge

      const bridgeABI = [
        'function deposit(address token, uint256 amount) external',
        'function withdraw(bytes calldata data) external'
      ];

      const bridgeContract = new ethers.Contract(bridgeContractAddress, bridgeABI, this.wallet);
      
      const tx = await bridgeContract.deposit(tokenAddress, ethers.utils.parseEther(amount.toString()));
      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: tx.hash,
        receipt: receipt,
        bridgeType: bridgeType
      };
    } catch (error) {
      logger.error('Failed to bridge from Ethereum:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async bridgeToEthereum(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for bridging.'
      };
    }

    const { tokenAddress, amount, bridgeType = 'pos' } = options;

    try {
      // Withdrawal process on Polygon
      const withdrawalData = ethers.utils.defaultAbiCoder.encode(
        ['address', 'uint256'],
        [tokenAddress, ethers.utils.parseEther(amount.toString())]
      );

      const bridgeContractAddress = bridgeType === 'pos' ? 
        '0xA0c68C638235ee32657e8f720a23ceC1bFc77C77' : 
        '0x8484Ef722627bf18ca5Ae6BcF031c23E6e922B30';

      const bridgeABI = [
        'function withdraw(bytes calldata data) external'
      ];

      const bridgeContract = new ethers.Contract(bridgeContractAddress, bridgeABI, this.wallet);
      
      const tx = await bridgeContract.withdraw(withdrawalData);
      const receipt = await tx.wait();

      return {
        success: true,
        transactionHash: tx.hash,
        receipt: receipt,
        bridgeType: bridgeType,
        note: 'Complete the withdrawal on Ethereum after checkpoint inclusion'
      };
    } catch (error) {
      logger.error('Failed to bridge to Ethereum:', error);
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
        gasPriceGwei: ethers.utils.formatUnits(gasPrice, 'gwei'),
        currency: 'MATIC'
      };
    } catch (error) {
      logger.error('Failed to get gas price:', error);
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

  async generatePolygonContract(description, contractType = 'ERC20') {
    const templates = {
      ERC20: {
        name: 'PolygonToken',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PolygonToken is ERC20, Ownable {
    constructor(string memory name, string memory symbol, uint256 initialSupply) 
        ERC20(name, symbol) {
        _mint(msg.sender, initialSupply * 10**decimals());
    }
    
    function mint(address to, uint256 amount) public onlyOwner {
        _mint(to, amount);
    }
    
    // Polygon-specific functions for bridging
    function deposit(address user, bytes calldata depositData) external {
        uint256 amount = abi.decode(depositData, (uint256));
        _mint(user, amount);
    }
    
    function withdraw(uint256 amount) external {
        _burn(msg.sender, amount);
    }
}`
      },
      ERC721: {
        name: 'PolygonNFT',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract PolygonNFT is ERC721, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;
    
    mapping(uint256 => string) private _tokenURIs;
    
    constructor(string memory name, string memory symbol) ERC721(name, symbol) {}
    
    function mintNFT(address recipient, string memory tokenURI) public onlyOwner returns (uint256) {
        _tokenIds.increment();
        uint256 newItemId = _tokenIds.current();
        _mint(recipient, newItemId);
        _setTokenURI(newItemId, tokenURI);
        return newItemId;
    }
    
    function _setTokenURI(uint256 tokenId, string memory uri) internal {
        require(_exists(tokenId), "URI set of nonexistent token");
        _tokenURIs[tokenId] = uri;
    }
    
    function tokenURI(uint256 tokenId) public view virtual override returns (string memory) {
        require(_exists(tokenId), "URI query for nonexistent token");
        return _tokenURIs[tokenId];
    }
    
    // Polygon-specific functions for bridging
    function deposit(address user, bytes calldata depositData) external {
        (uint256 tokenId, string memory uri) = abi.decode(depositData, (uint256, string));
        _mint(user, tokenId);
        _setTokenURI(tokenId, uri);
    }
    
    function withdraw(uint256 tokenId) external {
        require(ownerOf(tokenId) == msg.sender, "Not the owner");
        _burn(tokenId);
    }
}`
      },
      DeFi: {
        name: 'PolygonDeFi',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract PolygonDeFi is ReentrancyGuard, Ownable {
    struct Pool {
        IERC20 token;
        uint256 totalDeposits;
        uint256 rewardRate;
        uint256 lastUpdateTime;
        uint256 rewardPerTokenStored;
    }
    
    mapping(address => Pool) public pools;
    mapping(address => mapping(address => uint256)) public userDeposits;
    mapping(address => mapping(address => uint256)) public userRewardPerTokenPaid;
    mapping(address => mapping(address => uint256)) public rewards;
    
    event Deposited(address indexed user, address indexed token, uint256 amount);
    event Withdrawn(address indexed user, address indexed token, uint256 amount);
    event RewardClaimed(address indexed user, address indexed token, uint256 reward);
    
    function createPool(address token, uint256 rewardRate) external onlyOwner {
        pools[token] = Pool({
            token: IERC20(token),
            totalDeposits: 0,
            rewardRate: rewardRate,
            lastUpdateTime: block.timestamp,
            rewardPerTokenStored: 0
        });
    }
    
    function deposit(address token, uint256 amount) external nonReentrant updateReward(token, msg.sender) {
        require(amount > 0, "Cannot deposit 0");
        require(address(pools[token].token) != address(0), "Pool does not exist");
        
        pools[token].totalDeposits += amount;
        userDeposits[token][msg.sender] += amount;
        
        pools[token].token.transferFrom(msg.sender, address(this), amount);
        
        emit Deposited(msg.sender, token, amount);
    }
    
    function withdraw(address token, uint256 amount) external nonReentrant updateReward(token, msg.sender) {
        require(amount > 0, "Cannot withdraw 0");
        require(userDeposits[token][msg.sender] >= amount, "Insufficient balance");
        
        pools[token].totalDeposits -= amount;
        userDeposits[token][msg.sender] -= amount;
        
        pools[token].token.transfer(msg.sender, amount);
        
        emit Withdrawn(msg.sender, token, amount);
    }
    
    function claimReward(address token) external nonReentrant updateReward(token, msg.sender) {
        uint256 reward = rewards[token][msg.sender];
        if (reward > 0) {
            rewards[token][msg.sender] = 0;
            // Transfer reward token (simplified)
            emit RewardClaimed(msg.sender, token, reward);
        }
    }
    
    modifier updateReward(address token, address account) {
        pools[token].rewardPerTokenStored = rewardPerToken(token);
        pools[token].lastUpdateTime = block.timestamp;
        
        if (account != address(0)) {
            rewards[token][account] = earned(token, account);
            userRewardPerTokenPaid[token][account] = pools[token].rewardPerTokenStored;
        }
        _;
    }
    
    function rewardPerToken(address token) public view returns (uint256) {
        if (pools[token].totalDeposits == 0) {
            return pools[token].rewardPerTokenStored;
        }
        return pools[token].rewardPerTokenStored + 
            (((block.timestamp - pools[token].lastUpdateTime) * pools[token].rewardRate * 1e18) / pools[token].totalDeposits);
    }
    
    function earned(address token, address account) public view returns (uint256) {
        return ((userDeposits[token][account] * 
            (rewardPerToken(token) - userRewardPerTokenPaid[token][account])) / 1e18) + 
            rewards[token][account];
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
      description: `Generated ${contractType} Polygon contract: ${description}`,
      deployment: {
        network: 'Polygon',
        gasToken: 'MATIC',
        bridgeSupport: contractType === 'ERC20' || contractType === 'ERC721'
      }
    };
  }

  async analyzePolygonNetwork() {
    try {
      const [blockNumber, gasPrice, networkId] = await Promise.all([
        this.provider.getBlockNumber(),
        this.provider.getGasPrice(),
        this.provider.getNetwork()
      ]);

      const analysis = {
        currentBlock: blockNumber,
        gasPrice: {
          wei: gasPrice.toString(),
          gwei: ethers.utils.formatUnits(gasPrice, 'gwei')
        },
        networkId: networkId.chainId,
        networkName: networkId.name,
        performance: {
          avgBlockTime: '2-3 seconds',
          tps: '65,000+',
          finality: 'Probabilistic'
        },
        features: {
          evm_compatible: true,
          pos_consensus: true,
          ethereum_bridge: true,
          low_fees: true
        }
      };

      return {
        success: true,
        analysis: analysis
      };
    } catch (error) {
      logger.error('Failed to analyze Polygon network:', error);
      return {
        success: false,
        error: error.message
      };
    }
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

  // Helper method to validate Ethereum address (same format as Polygon)
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

  // Helper method to get network information
  getNetworkInfo() {
    return {
      name: 'Polygon',
      chainId: 137,
      nativeCurrency: 'MATIC',
      rpcUrl: this.nodeUrl,
      blockExplorer: 'https://polygonscan.com',
      bridge: 'https://wallet.polygon.technology/bridge'
    };
  }
}

module.exports = { PolygonIntegration };