const { Connection, PublicKey, Keypair, Transaction, SystemProgram, LAMPORTS_PER_SOL } = require('@solana/web3.js');
const { Token, TOKEN_PROGRAM_ID } = require('@solana/spl-token');
const { logger } = require('../../utils/logger');

class SolanaIntegration {
  constructor(options = {}) {
    this.rpcUrl = options.rpcUrl || process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
    this.commitment = options.commitment || 'confirmed';
    this.timeout = options.timeout || 30000;
    
    this.connection = new Connection(this.rpcUrl, this.commitment);
    this.wallet = options.privateKey ? this.createWalletFromPrivateKey(options.privateKey) : null;
  }

  createWalletFromPrivateKey(privateKey) {
    try {
      const secretKey = Uint8Array.from(JSON.parse(privateKey));
      return Keypair.fromSecretKey(secretKey);
    } catch (error) {
      logger.error('Failed to create wallet from private key:', error);
      throw error;
    }
  }

  async getBalance(publicKey) {
    try {
      const pubKey = new PublicKey(publicKey);
      const balance = await this.connection.getBalance(pubKey);
      
      return {
        success: true,
        balance: balance / LAMPORTS_PER_SOL,
        balanceLamports: balance
      };
    } catch (error) {
      logger.error('Failed to get balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTransaction(signature) {
    try {
      const transaction = await this.connection.getTransaction(signature);
      
      return {
        success: true,
        transaction: transaction
      };
    } catch (error) {
      logger.error('Failed to get transaction:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async sendSol(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for sending transactions.'
      };
    }

    const { to, amount } = options;

    try {
      const toPubKey = new PublicKey(to);
      const lamports = amount * LAMPORTS_PER_SOL;

      const transaction = new Transaction().add(
        SystemProgram.transfer({
          fromPubkey: this.wallet.publicKey,
          toPubkey: toPubKey,
          lamports: lamports
        })
      );

      const signature = await this.connection.sendTransaction(transaction, [this.wallet]);
      await this.connection.confirmTransaction(signature);

      return {
        success: true,
        signature: signature,
        amount: amount,
        to: to
      };
    } catch (error) {
      logger.error('Failed to send SOL:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async createToken(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for token creation.'
      };
    }

    const { decimals = 9, initialSupply = 0 } = options;

    try {
      const mint = await Token.createMint(
        this.connection,
        this.wallet,
        this.wallet.publicKey,
        null,
        decimals,
        TOKEN_PROGRAM_ID
      );

      let tokenAccount = null;
      if (initialSupply > 0) {
        tokenAccount = await mint.createAccount(this.wallet.publicKey);
        await mint.mintTo(tokenAccount, this.wallet.publicKey, [], initialSupply);
      }

      return {
        success: true,
        mintAddress: mint.publicKey.toString(),
        tokenAccount: tokenAccount ? tokenAccount.toString() : null,
        initialSupply: initialSupply,
        decimals: decimals
      };
    } catch (error) {
      logger.error('Failed to create token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async transferToken(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for token transfer.'
      };
    }

    const { mintAddress, to, amount, fromTokenAccount } = options;

    try {
      const mint = new Token(this.connection, new PublicKey(mintAddress), TOKEN_PROGRAM_ID, this.wallet);
      const toTokenAccount = await mint.createAssociatedTokenAccountIfNotExist(new PublicKey(to));
      
      const fromAccount = fromTokenAccount ? new PublicKey(fromTokenAccount) : 
        await mint.createAssociatedTokenAccountIfNotExist(this.wallet.publicKey);

      const signature = await mint.transfer(
        fromAccount,
        toTokenAccount,
        this.wallet.publicKey,
        [],
        amount
      );

      return {
        success: true,
        signature: signature,
        amount: amount,
        to: to,
        mintAddress: mintAddress
      };
    } catch (error) {
      logger.error('Failed to transfer token:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTokenBalance(options) {
    const { tokenAccount } = options;

    try {
      const balance = await this.connection.getTokenAccountBalance(new PublicKey(tokenAccount));
      
      return {
        success: true,
        balance: balance.value.uiAmount,
        balanceRaw: balance.value.amount,
        decimals: balance.value.decimals
      };
    } catch (error) {
      logger.error('Failed to get token balance:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getTokenAccounts(publicKey) {
    try {
      const accounts = await this.connection.getParsedTokenAccountsByOwner(
        new PublicKey(publicKey),
        { programId: TOKEN_PROGRAM_ID }
      );

      const tokenAccounts = accounts.value.map(account => ({
        address: account.pubkey.toString(),
        mint: account.account.data.parsed.info.mint,
        balance: account.account.data.parsed.info.tokenAmount.uiAmount,
        decimals: account.account.data.parsed.info.tokenAmount.decimals
      }));

      return {
        success: true,
        tokenAccounts: tokenAccounts
      };
    } catch (error) {
      logger.error('Failed to get token accounts:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deployProgram(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for program deployment.'
      };
    }

    const { programData, programId } = options;

    try {
      // This is a simplified version - actual program deployment is more complex
      const programAccount = programId ? new PublicKey(programId) : Keypair.generate();
      
      // In reality, you would use tools like Anchor or the Solana CLI for deployment
      return {
        success: true,
        programId: programAccount.publicKey ? programAccount.publicKey.toString() : programAccount.toString(),
        message: 'Program deployment initiated. Use Solana CLI or Anchor for actual deployment.'
      };
    } catch (error) {
      logger.error('Failed to deploy program:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async callProgram(options) {
    if (!this.wallet) {
      return {
        success: false,
        error: 'Wallet not configured. Private key is required for program calls.'
      };
    }

    const { programId, instruction, accounts = [] } = options;

    try {
      const transaction = new Transaction();
      
      // This is a simplified version - actual program calls require proper instruction data
      const programInstruction = {
        keys: accounts.map(acc => ({
          pubkey: new PublicKey(acc.pubkey),
          isSigner: acc.isSigner || false,
          isWritable: acc.isWritable || false
        })),
        programId: new PublicKey(programId),
        data: Buffer.from(instruction, 'hex')
      };

      transaction.add(programInstruction);
      
      const signature = await this.connection.sendTransaction(transaction, [this.wallet]);
      await this.connection.confirmTransaction(signature);

      return {
        success: true,
        signature: signature,
        programId: programId
      };
    } catch (error) {
      logger.error('Failed to call program:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getRecentBlockhash() {
    try {
      const { blockhash } = await this.connection.getRecentBlockhash();
      
      return {
        success: true,
        blockhash: blockhash
      };
    } catch (error) {
      logger.error('Failed to get recent blockhash:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getSlot() {
    try {
      const slot = await this.connection.getSlot();
      
      return {
        success: true,
        slot: slot
      };
    } catch (error) {
      logger.error('Failed to get slot:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getEpochInfo() {
    try {
      const epochInfo = await this.connection.getEpochInfo();
      
      return {
        success: true,
        epochInfo: epochInfo
      };
    } catch (error) {
      logger.error('Failed to get epoch info:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async generateRustProgram(description, programType = 'basic') {
    const templates = {
      basic: {
        name: 'BasicProgram',
        code: `use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
};

// Declare and export the program's entrypoint
entrypoint!(process_instruction);

// Program entrypoint's implementation
pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let account = next_account_info(accounts_iter)?;

    if account.owner != program_id {
        msg!("Account does not have the correct program id");
        return Err(ProgramError::IncorrectProgramId);
    }

    msg!("Hello, Solana!");
    Ok(())
}`
      },
      token: {
        name: 'TokenProgram',
        code: `use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    program_pack::{Pack, Sealed},
    sysvar::{rent::Rent, Sysvar},
};

use spl_token::state::Mint;

entrypoint!(process_instruction);

#[derive(Debug, PartialEq)]
pub enum TokenInstruction {
    InitializeMint { decimals: u8 },
    Transfer { amount: u64 },
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = TokenInstruction::unpack(instruction_data)?;

    match instruction {
        TokenInstruction::InitializeMint { decimals } => {
            msg!("Instruction: InitializeMint");
            initialize_mint(accounts, decimals, program_id)
        }
        TokenInstruction::Transfer { amount } => {
            msg!("Instruction: Transfer");
            transfer(accounts, amount, program_id)
        }
    }
}

fn initialize_mint(
    accounts: &[AccountInfo],
    decimals: u8,
    program_id: &Pubkey,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let mint_account = next_account_info(accounts_iter)?;
    let rent = &Rent::from_account_info(next_account_info(accounts_iter)?)?;

    msg!("Initializing mint with {} decimals", decimals);
    Ok(())
}

fn transfer(
    accounts: &[AccountInfo],
    amount: u64,
    program_id: &Pubkey,
) -> ProgramResult {
    msg!("Transferring {} tokens", amount);
    Ok(())
}`
      },
      nft: {
        name: 'NFTProgram',
        code: `use solana_program::{
    account_info::{next_account_info, AccountInfo},
    entrypoint,
    entrypoint::ProgramResult,
    msg,
    program_error::ProgramError,
    pubkey::Pubkey,
    borsh::{BorshDeserialize, BorshSerialize},
};

entrypoint!(process_instruction);

#[derive(BorshSerialize, BorshDeserialize, Debug)]
pub struct NFTMetadata {
    pub name: String,
    pub symbol: String,
    pub uri: String,
    pub mint_authority: Pubkey,
}

#[derive(Debug, PartialEq)]
pub enum NFTInstruction {
    CreateNFT { name: String, symbol: String, uri: String },
    TransferNFT { token_id: u64 },
}

pub fn process_instruction(
    program_id: &Pubkey,
    accounts: &[AccountInfo],
    instruction_data: &[u8],
) -> ProgramResult {
    let instruction = NFTInstruction::unpack(instruction_data)?;

    match instruction {
        NFTInstruction::CreateNFT { name, symbol, uri } => {
            msg!("Instruction: CreateNFT");
            create_nft(accounts, name, symbol, uri, program_id)
        }
        NFTInstruction::TransferNFT { token_id } => {
            msg!("Instruction: TransferNFT");
            transfer_nft(accounts, token_id, program_id)
        }
    }
}

fn create_nft(
    accounts: &[AccountInfo],
    name: String,
    symbol: String,
    uri: String,
    program_id: &Pubkey,
) -> ProgramResult {
    let accounts_iter = &mut accounts.iter();
    let mint_account = next_account_info(accounts_iter)?;
    let metadata_account = next_account_info(accounts_iter)?;
    let mint_authority = next_account_info(accounts_iter)?;

    msg!("Creating NFT: {} ({})", name, symbol);
    
    let metadata = NFTMetadata {
        name,
        symbol,
        uri,
        mint_authority: *mint_authority.key,
    };

    Ok(())
}

fn transfer_nft(
    accounts: &[AccountInfo],
    token_id: u64,
    program_id: &Pubkey,
) -> ProgramResult {
    msg!("Transferring NFT with token ID: {}", token_id);
    Ok(())
}`
      }
    };

    const template = templates[programType];
    if (!template) {
      return {
        success: false,
        error: `Program type ${programType} not supported`
      };
    }

    return {
      success: true,
      programName: template.name,
      programCode: template.code,
      description: `Generated ${programType} Solana program: ${description}`,
      buildInstructions: [
        'cargo build --target bpf-unknown-unknown --release',
        'solana program deploy target/deploy/program.so'
      ]
    };
  }

  async analyzeProgram(programId) {
    try {
      const programAccount = await this.connection.getAccountInfo(new PublicKey(programId));
      
      if (!programAccount) {
        return {
          success: false,
          error: 'Program not found'
        };
      }

      const analysis = {
        executable: programAccount.executable,
        owner: programAccount.owner.toString(),
        dataLength: programAccount.data.length,
        lamports: programAccount.lamports,
        rentEpoch: programAccount.rentEpoch,
        analysis: {
          isExecutable: programAccount.executable,
          codeSize: programAccount.data.length,
          complexity: this.analyzeProgramComplexity(programAccount.data),
          securityChecks: this.performBasicProgramSecurityChecks(programAccount)
        }
      };

      return {
        success: true,
        programId: programId,
        analysis: analysis
      };
    } catch (error) {
      logger.error('Failed to analyze program:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  analyzeProgramComplexity(data) {
    return {
      dataLength: data.length,
      complexity: data.length > 50000 ? 'high' : data.length > 20000 ? 'medium' : 'low',
      estimatedInstructions: Math.floor(data.length / 100)
    };
  }

  performBasicProgramSecurityChecks(account) {
    const checks = {
      isExecutable: account.executable,
      hasProperOwner: account.owner.toString() !== SystemProgram.programId.toString(),
      hasRentExemption: account.lamports > 0,
      dataIntegrity: account.data.length > 0
    };

    const score = Object.values(checks).filter(Boolean).length;
    checks.securityScore = Math.round((score / Object.keys(checks).length) * 100);

    return checks;
  }

  // Configuration methods
  setConnection(rpcUrl, commitment) {
    this.rpcUrl = rpcUrl;
    this.commitment = commitment;
    this.connection = new Connection(rpcUrl, commitment);
  }

  setWallet(privateKey) {
    this.wallet = this.createWalletFromPrivateKey(privateKey);
  }

  // Helper method to validate Solana address
  isValidAddress(address) {
    try {
      new PublicKey(address);
      return true;
    } catch {
      return false;
    }
  }

  // Helper method to generate new keypair
  generateKeypair() {
    const keypair = Keypair.generate();
    return {
      publicKey: keypair.publicKey.toString(),
      secretKey: Array.from(keypair.secretKey)
    };
  }

  // Helper method to convert SOL to lamports
  solToLamports(sol) {
    return sol * LAMPORTS_PER_SOL;
  }

  // Helper method to convert lamports to SOL
  lamportsToSol(lamports) {
    return lamports / LAMPORTS_PER_SOL;
  }
}

module.exports = { SolanaIntegration };