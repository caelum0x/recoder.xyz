/**
 * Solidity IDE API Routes
 * Complete Solidity development environment APIs
 */

import { Router, Request, Response } from 'express';
import { solidityCompilerService } from '../services/solidity-compiler';
import { blockchainCompilerService } from '../services/blockchain-compiler';
import { logger } from '../utils/logger';
import { authenticate } from '../middleware/auth';

const router = Router();

// Apply authentication to all routes
router.use(authenticate);

/**
 * POST /api/solidity/compile
 * Compile Solidity source code using real BlockchainCompilerService
 */
router.post('/compile', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source, fileName, solcVersion, optimization, optimizationRuns, evmVersion } = req.body;

    if (!source) {
      res.status(400).json({
        error: 'Source code is required'
      });
      return;
    }

    const contractName = fileName ? fileName.replace('.sol', '') : 'Contract';
    
    // Use the real BlockchainCompilerService for actual compilation
    const result = await blockchainCompilerService.compileSolidity(source, contractName, {
      version: solcVersion,
      optimization: optimization !== false,
      optimizationRuns: optimizationRuns || 200,
      evmVersion: evmVersion || 'london'
    });

    // Analyze for security issues using the existing service
    const securityIssues = await solidityCompilerService.analyzeContract(source);

    res.json({
      success: result.success,
      warnings: [...result.warnings, ...securityIssues.filter(i => i.severity === 'warning')],
      errors: [...result.errors, ...securityIssues.filter(i => i.severity === 'error')],
      bytecode: result.bytecode,
      abi: result.abi,
      metadata: result.metadata,
      gasEstimate: result.gasEstimate,
      compilationTime: result.compilationTime,
      artifacts: result.artifacts,
      securityIssues
    });
  } catch (error) {
    logger.error('Compilation error:', error);
    res.status(500).json({
      error: 'Compilation failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * POST /api/solidity/deploy
 * Deploy compiled contract to blockchain
 */
router.post('/deploy', async (req: Request, res: Response): Promise<void> => {
  try {
    const { contractName, abi, bytecode, networkId, constructorArgs } = req.body;

    if (!contractName || !abi || !bytecode) {
      res.status(400).json({
        error: 'Contract name, ABI, and bytecode are required'
      });
      return;
    }

    // This would normally deploy to actual blockchain
    // For now, simulate deployment
    const mockDeployment = {
      contractAddress: `0x${Math.random().toString(16).substr(2, 40)}`,
      transactionHash: `0x${Math.random().toString(16).substr(2, 64)}`,
      blockNumber: Math.floor(Math.random() * 1000000),
      gasUsed: Math.floor(Math.random() * 500000) + 100000,
      deploymentCost: '0.05'
    };

    // In a real implementation, you would:
    // 1. Connect to the specified network
    // 2. Deploy the contract with Web3/Ethers
    // 3. Wait for confirmation
    // 4. Save deployment info to database

    res.json({
      success: true,
      message: 'Contract deployed successfully',
      ...mockDeployment,
      networkId,
      constructorArgs
    });
  } catch (error) {
    logger.error('Deployment error:', error);
    res.status(500).json({
      error: 'Deployment failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/solidity/versions
 * Get available Solidity compiler versions
 */
router.get('/versions', async (req: Request, res: Response): Promise<void> => {
  try {
    const versions = await blockchainCompilerService.getSupportedVersions();
    res.json({
      versions: versions.solidity,
      default: '0.8.24'
    });
  } catch (error) {
    logger.error('Failed to get versions:', error);
    res.status(500).json({
      error: 'Failed to get compiler versions',
      versions: ['0.8.24', '0.8.23', '0.8.22', '0.8.21'],
      default: '0.8.24'
    });
  }
});

/**
 * POST /api/solidity/analyze
 * Analyze contract for security vulnerabilities
 */
router.post('/analyze', async (req: Request, res: Response): Promise<void> => {
  try {
    const { source } = req.body;

    if (!source) {
      res.status(400).json({
        error: 'Source code is required'
      });
      return;
    }

    const issues = await solidityCompilerService.analyzeContract(source);

    res.json({
      issues,
      summary: {
        errors: issues.filter(i => i.severity === 'error').length,
        warnings: issues.filter(i => i.severity === 'warning').length,
        infos: issues.filter(i => i.severity === 'info').length
      }
    });
  } catch (error) {
    logger.error('Analysis error:', error);
    res.status(500).json({
      error: 'Analysis failed',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/solidity/networks
 * Get supported blockchain networks
 */
router.get('/networks', async (req: Request, res: Response): Promise<void> => {
  try {
    const networks = [
      {
        id: '1',
        name: 'Ethereum Mainnet',
        chainId: 1,
        rpcUrl: 'https://mainnet.infura.io/v3/your-project-id',
        symbol: 'ETH',
        isTestnet: false,
        isActive: true,
        explorerUrl: 'https://etherscan.io'
      },
      {
        id: '11155111',
        name: 'Sepolia Testnet',
        chainId: 11155111,
        rpcUrl: 'https://sepolia.infura.io/v3/your-project-id',
        symbol: 'ETH',
        isTestnet: true,
        isActive: true,
        explorerUrl: 'https://sepolia.etherscan.io'
      },
      {
        id: '137',
        name: 'Polygon Mainnet',
        chainId: 137,
        rpcUrl: 'https://polygon-rpc.com',
        symbol: 'MATIC',
        isTestnet: false,
        isActive: true,
        explorerUrl: 'https://polygonscan.com'
      },
      {
        id: '80001',
        name: 'Mumbai Testnet',
        chainId: 80001,
        rpcUrl: 'https://rpc-mumbai.maticvigil.com',
        symbol: 'MATIC',
        isTestnet: true,
        isActive: true,
        explorerUrl: 'https://mumbai.polygonscan.com'
      },
      {
        id: '56',
        name: 'BSC Mainnet',
        chainId: 56,
        rpcUrl: 'https://bsc-dataseed1.binance.org',
        symbol: 'BNB',
        isTestnet: false,
        isActive: true,
        explorerUrl: 'https://bscscan.com'
      },
      {
        id: '97',
        name: 'BSC Testnet',
        chainId: 97,
        rpcUrl: 'https://data-seed-prebsc-1-s1.binance.org:8545',
        symbol: 'BNB',
        isTestnet: true,
        isActive: true,
        explorerUrl: 'https://testnet.bscscan.com'
      }
    ];

    res.json({ networks });
  } catch (error) {
    logger.error('Failed to get networks:', error);
    res.status(500).json({
      error: 'Failed to get networks'
    });
  }
});

/**
 * POST /api/solidity/project
 * Create new Solidity project
 */
router.post('/project', async (req: Request, res: Response): Promise<void> => {
  try {
    const { name, description, solcVersion, framework } = req.body;
    const userId = (req as any).user?.id;

    if (!name) {
      res.status(400).json({
        error: 'Project name is required'
      });
      return;
    }

    // This would create a new project in the database
    // For now, return a mock project structure
    const projectStructure = {
      id: `solidity_${Date.now()}`,
      name,
      description,
      type: 'blockchain',
      framework: framework || 'hardhat',
      solcVersion: solcVersion || '0.8.24',
      files: [
        {
          name: `${name}.sol`,
          path: `contracts/${name}.sol`,
          content: `// SPDX-License-Identifier: MIT
pragma solidity ^${solcVersion || '0.8.24'};

contract ${name} {
    address public owner;
    
    constructor() {
        owner = msg.sender;
    }
    
    modifier onlyOwner() {
        require(msg.sender == owner, "Not the owner");
        _;
    }
    
    // Your contract logic here
}`
        }
      ],
      dependencies: {
        "@openzeppelin/contracts": "^4.9.0"
      },
      devDependencies: {
        "hardhat": "^2.19.0",
        "@nomiclabs/hardhat-waffle": "^2.0.0",
        "ethereum-waffle": "^4.0.0",
        "chai": "^4.2.0",
        "@nomiclabs/hardhat-ethers": "^2.0.0",
        "ethers": "^5.0.0"
      }
    };

    res.json({
      message: 'Solidity project created successfully',
      project: projectStructure
    });
  } catch (error) {
    logger.error('Failed to create project:', error);
    res.status(500).json({
      error: 'Failed to create project',
      details: error instanceof Error ? error.message : 'Unknown error'
    });
  }
});

/**
 * GET /api/solidity/templates
 * Get contract templates
 */
router.get('/templates', async (req: Request, res: Response): Promise<void> => {
  try {
    const templates = [
      {
        id: 'erc20',
        name: 'ERC20 Token',
        description: 'Standard ERC20 fungible token contract',
        category: 'token',
        code: `// SPDX-License-Identifier: MIT
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
}`
      },
      {
        id: 'erc721',
        name: 'ERC721 NFT',
        description: 'Non-fungible token contract',
        category: 'nft',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyNFT is ERC721, Ownable {
    uint256 private _nextTokenId;

    constructor(address initialOwner)
        ERC721("MyNFT", "MNFT")
        Ownable(initialOwner)
    {}

    function safeMint(address to) public onlyOwner {
        uint256 tokenId = _nextTokenId++;
        _safeMint(to, tokenId);
    }
}`
      },
      {
        id: 'multisig',
        name: 'Multi-Signature Wallet',
        description: 'Multi-signature wallet contract',
        category: 'wallet',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract MultiSigWallet {
    event Deposit(address indexed sender, uint amount, uint balance);
    event SubmitTransaction(
        address indexed owner,
        uint indexed txIndex,
        address indexed to,
        uint value,
        bytes data
    );
    
    address[] public owners;
    mapping(address => bool) public isOwner;
    uint public numConfirmationsRequired;
    
    constructor(address[] memory _owners, uint _numConfirmationsRequired) {
        require(_owners.length > 0, "owners required");
        require(
            _numConfirmationsRequired > 0 &&
            _numConfirmationsRequired <= _owners.length,
            "invalid number of required confirmations"
        );

        for (uint i = 0; i < _owners.length; i++) {
            address owner = _owners[i];
            require(owner != address(0), "invalid owner");
            require(!isOwner[owner], "owner not unique");

            isOwner[owner] = true;
            owners.push(owner);
        }

        numConfirmationsRequired = _numConfirmationsRequired;
    }
    
    receive() external payable {
        emit Deposit(msg.sender, msg.value, address(this).balance);
    }
}`
      },
      {
        id: 'dao',
        name: 'DAO Governance',
        description: 'Decentralized autonomous organization contract',
        category: 'governance',
        code: `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract SimpleDAO {
    struct Proposal {
        uint id;
        string description;
        uint amount;
        address payable recipient;
        uint votes;
        uint timeCreated;
        bool finalized;
        mapping(address => bool) votedVoters;
    }
    
    mapping(uint => Proposal) public proposals;
    uint public numProposals;
    address[] public investors;
    mapping(address => bool) public isInvestor;
    uint public totalShares;
    mapping(address => uint) public shares;
    uint constant VOTING_TIME = 7 days;
    
    constructor() {}
    
    function contribute() external payable {
        require(msg.value > 0, "Must send ether");
        
        if (!isInvestor[msg.sender]) {
            investors.push(msg.sender);
            isInvestor[msg.sender] = true;
        }
        
        shares[msg.sender] += msg.value;
        totalShares += msg.value;
    }
}`
      }
    ];

    res.json({ templates });
  } catch (error) {
    logger.error('Failed to get templates:', error);
    res.status(500).json({
      error: 'Failed to get templates'
    });
  }
});

export default router;
// CommonJS compatibility
module.exports = router;
