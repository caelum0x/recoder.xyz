const { BaseGenerator } = require('./baseGenerator');
const { logger } = require('../utils/logger');

class BlockchainGenerator extends BaseGenerator {
  constructor(options = {}) {
    super(options);
    this.registerBlockchainTemplates();
  }

  registerBlockchainTemplates() {
    this.registerTemplate('solidityContract', (data) => this.generateSolidityContract(data));
    this.registerTemplate('solidityInterface', (data) => this.generateSolidityInterface(data));
    this.registerTemplate('hardhatConfig', (data) => this.generateHardhatConfig(data));
    this.registerTemplate('rustProgram', (data) => this.generateRustProgram(data));
    this.registerTemplate('web3Client', (data) => this.generateWeb3Client(data));
  }

  async generate(input, context = {}) {
    try {
      this.validateInput(input, ['blockchain', 'projectName']);
      
      const config = this.mergeConfigurations(this.getDefaultBlockchainConfig(), input, context);
      const structure = await this.generateBlockchainStructure(config);
      
      return this.createGenerationResult(true, { blockchain: input.blockchain });
    } catch (error) {
      return this.createErrorResult(error, { input });
    }
  }

  getDefaultBlockchainConfig() {
    return {
      blockchain: 'ethereum',
      framework: 'hardhat',
      contracts: ['Token', 'Marketplace'],
      networks: ['localhost', 'goerli', 'mainnet']
    };
  }

  async generateBlockchainStructure(config) {
    if (config.blockchain === 'ethereum') {
      return this.generateEthereumStructure(config);
    } else if (config.blockchain === 'solana') {
      return this.generateSolanaStructure(config);
    }
    return {};
  }

  generateEthereumStructure(config) {
    return {
      'contracts': config.contracts.reduce((acc, contract) => {
        acc[`${contract}.sol`] = { template: 'solidityContract', data: { ...config, contractName: contract } };
        return acc;
      }, {}),
      'scripts': {
        'deploy.js': this.generateDeployScript(config)
      },
      'test': {
        'Token.test.js': this.generateContractTest(config)
      },
      'hardhat.config.js': { template: 'hardhatConfig', data: config }
    };
  }

  generateSolanaStructure(config) {
    return {
      'programs': {
        [config.projectName]: {
          'src': {
            'lib.rs': { template: 'rustProgram', data: config }
          }
        }
      },
      'Anchor.toml': this.generateAnchorConfig(config)
    };
  }

  generateSolidityContract(data) {
    return `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";

/**
 * @title ${data.contractName}
 * @dev ${data.contractName} contract for ${data.projectName}
 */
contract ${data.contractName} is ERC20, Ownable, ReentrancyGuard {
    
    // Events
    event TokensMinted(address indexed to, uint256 amount);
    event TokensBurned(address indexed from, uint256 amount);
    
    // Constants
    uint256 public constant MAX_SUPPLY = 1000000 * 10**18; // 1 million tokens
    
    // State variables
    mapping(address => bool) public minters;
    
    constructor(
        string memory name,
        string memory symbol,
        uint256 initialSupply
    ) ERC20(name, symbol) {
        _mint(msg.sender, initialSupply);
    }
    
    /**
     * @dev Mint tokens to specified address
     * @param to Address to mint tokens to
     * @param amount Amount of tokens to mint
     */
    function mint(address to, uint256 amount) external onlyMinter {
        require(totalSupply() + amount <= MAX_SUPPLY, "${data.contractName}: Max supply exceeded");
        _mint(to, amount);
        emit TokensMinted(to, amount);
    }
    
    /**
     * @dev Burn tokens from caller's balance
     * @param amount Amount of tokens to burn
     */
    function burn(uint256 amount) external {
        _burn(msg.sender, amount);
        emit TokensBurned(msg.sender, amount);
    }
    
    /**
     * @dev Add minter role to address
     * @param minter Address to add as minter
     */
    function addMinter(address minter) external onlyOwner {
        minters[minter] = true;
    }
    
    /**
     * @dev Remove minter role from address
     * @param minter Address to remove from minters
     */
    function removeMinter(address minter) external onlyOwner {
        minters[minter] = false;
    }
    
    /**
     * @dev Check if address has minter role
     */
    modifier onlyMinter() {
        require(minters[msg.sender] || msg.sender == owner(), "${data.contractName}: Not authorized to mint");
        _;
    }
}`;
  }

  generateHardhatConfig(data) {
    return `require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.19",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    goerli: {
      url: process.env.GOERLI_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    },
    mainnet: {
      url: process.env.MAINNET_URL || "",
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : []
    }
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD"
  }
};`;
  }

  generateRustProgram(data) {
    return `use anchor_lang::prelude::*;

declare_id!("11111111111111111111111111111111");

#[program]
pub mod ${data.projectName.toLowerCase().replace(/[^a-z0-9]/g, '_')} {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        let base_account = &mut ctx.accounts.base_account;
        base_account.count = 0;
        Ok(())
    }

    pub fn increment(ctx: Context<Update>) -> Result<()> {
        let base_account = &mut ctx.accounts.base_account;
        base_account.count += 1;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(init, payer = user, space = 8 + 8)]
    pub base_account: Account<'info, BaseAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct Update<'info> {
    #[account(mut)]
    pub base_account: Account<'info, BaseAccount>,
}

#[account]
pub struct BaseAccount {
    pub count: u64,
}`;
  }

  generateDeployScript(config) {
    return `const { ethers } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();

  console.log("Deploying contracts with the account:", deployer.address);
  console.log("Account balance:", (await deployer.getBalance()).toString());

  // Deploy ${config.contracts[0]} contract
  const ${config.contracts[0]} = await ethers.getContractFactory("${config.contracts[0]}");
  const ${config.contracts[0].toLowerCase()} = await ${config.contracts[0]}.deploy(
    "${config.projectName} Token",
    "TKN",
    ethers.utils.parseEther("1000000") // 1 million tokens
  );

  await ${config.contracts[0].toLowerCase()}.deployed();

  console.log("${config.contracts[0]} deployed to:", ${config.contracts[0].toLowerCase()}.address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });`;
  }

  generateContractTest(config) {
    return `const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("${config.contracts[0]}", function () {
  let ${config.contracts[0].toLowerCase()};
  let owner;
  let addr1;
  let addr2;

  beforeEach(async function () {
    [owner, addr1, addr2] = await ethers.getSigners();

    const ${config.contracts[0]} = await ethers.getContractFactory("${config.contracts[0]}");
    ${config.contracts[0].toLowerCase()} = await ${config.contracts[0]}.deploy(
      "${config.projectName} Token",
      "TKN",
      ethers.utils.parseEther("1000")
    );
    await ${config.contracts[0].toLowerCase()}.deployed();
  });

  describe("Deployment", function () {
    it("Should set the right owner", async function () {
      expect(await ${config.contracts[0].toLowerCase()}.owner()).to.equal(owner.address);
    });

    it("Should assign the total supply of tokens to the owner", async function () {
      const ownerBalance = await ${config.contracts[0].toLowerCase()}.balanceOf(owner.address);
      expect(await ${config.contracts[0].toLowerCase()}.totalSupply()).to.equal(ownerBalance);
    });
  });

  describe("Transactions", function () {
    it("Should transfer tokens between accounts", async function () {
      await ${config.contracts[0].toLowerCase()}.transfer(addr1.address, 50);
      const addr1Balance = await ${config.contracts[0].toLowerCase()}.balanceOf(addr1.address);
      expect(addr1Balance).to.equal(50);

      await ${config.contracts[0].toLowerCase()}.connect(addr1).transfer(addr2.address, 50);
      const addr2Balance = await ${config.contracts[0].toLowerCase()}.balanceOf(addr2.address);
      expect(addr2Balance).to.equal(50);
    });

    it("Should fail if sender doesn't have enough tokens", async function () {
      const initialOwnerBalance = await ${config.contracts[0].toLowerCase()}.balanceOf(owner.address);

      await expect(
        ${config.contracts[0].toLowerCase()}.connect(addr1).transfer(owner.address, 1)
      ).to.be.revertedWith("ERC20: transfer amount exceeds balance");

      expect(await ${config.contracts[0].toLowerCase()}.balanceOf(owner.address)).to.equal(
        initialOwnerBalance
      );
    });
  });
});`;
  }

  generateAnchorConfig(config) {
    return `[features]
seeds = false
skip-lint = false

[programs.localnet]
${config.projectName.toLowerCase().replace(/[^a-z0-9]/g, '_')} = "11111111111111111111111111111111"

[registry]
url = "https://api.apr.dev"

[provider]
cluster = "localnet"
wallet = "~/.config/solana/id.json"

[scripts]
test = "yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts"`;
  }
}

module.exports = { BlockchainGenerator };