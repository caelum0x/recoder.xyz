const { solidityCompilerService } = require('./dist/services/solidity-compiler');

async function testImportCompilation() {
  console.log('Testing Solidity compilation with imports...\n');

  // Test contract with OpenZeppelin imports
  const testContract = `// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract MyToken is ERC20, Ownable {
    uint256 public constant MAX_SUPPLY = 1000000 * 10**18;
    
    constructor(string memory name, string memory symbol) 
        ERC20(name, symbol) 
        Ownable() 
    {
        _mint(msg.sender, 1000 * 10**18);
    }
    
    function mint(address to, uint256 amount) public onlyOwner {
        require(totalSupply() + amount <= MAX_SUPPLY, "Max supply exceeded");
        _mint(to, amount);
    }
}`;

  try {
    console.log('Compiling contract with OpenZeppelin imports...');
    const result = await solidityCompilerService.compile({
      'MyToken.sol': testContract
    }, {
      solcVersion: '0.8.24',
      optimization: true,
      optimizationRuns: 200
    });

    console.log('Compilation result:');
    console.log('Success:', result.success);
    console.log('Compilation time:', result.compilationTime + 'ms');
    
    if (result.errors.length > 0) {
      console.log('Errors:');
      result.errors.forEach(error => {
        console.log(`  - ${error.severity}: ${error.message} (line ${error.line})`);
      });
    }
    
    if (result.warnings.length > 0) {
      console.log('Warnings:');
      result.warnings.forEach(warning => {
        console.log(`  - ${warning.severity}: ${warning.message} (line ${warning.line})`);
      });
    }
    
    if (result.success && result.contracts.MyToken) {
      console.log('Contract compiled successfully!');
      console.log('Contract ABI length:', result.contracts.MyToken.abi.length);
      console.log('Bytecode length:', result.contracts.MyToken.bytecode.length);
      console.log('Deployed bytecode length:', result.contracts.MyToken.deployedBytecode.length);
    }

  } catch (error) {
    console.error('Compilation failed with error:', error);
  }
}

// Run the test
testImportCompilation().catch(console.error);