use anchor_lang::prelude::*;
use anchor_spl::token::{self, Token, TokenAccount, Transfer, Mint};
use std::convert::TryInto;

declare_id!("DEXhashGoes12345678901234567890123456789ABC");

#[program]
pub mod dex {
    use super::*;

    /// Initialize a new liquidity pool for token pair
    pub fn initialize_pool(
        ctx: Context<InitializePool>,
        fee_rate: u64, // Fee rate in basis points (e.g., 30 = 0.3%)
    ) -> Result<()> {
        let pool = &mut ctx.accounts.pool;
        
        pool.token_a_mint = ctx.accounts.token_a_mint.key();
        pool.token_b_mint = ctx.accounts.token_b_mint.key();
        pool.token_a_vault = ctx.accounts.token_a_vault.key();
        pool.token_b_vault = ctx.accounts.token_b_vault.key();
        pool.lp_mint = ctx.accounts.lp_mint.key();
        pool.fee_rate = fee_rate;
        pool.authority = ctx.accounts.authority.key();
        pool.reserve_a = 0;
        pool.reserve_b = 0;
        pool.total_lp_supply = 0;
        pool.bump = *ctx.bumps.get("pool").unwrap();
        
        msg!("Pool initialized for tokens {} and {}", 
             ctx.accounts.token_a_mint.key(), 
             ctx.accounts.token_b_mint.key());
        
        Ok(())
    }

    /// Add liquidity to an existing pool
    pub fn add_liquidity(
        ctx: Context<AddLiquidity>,
        amount_a_desired: u64,
        amount_b_desired: u64,
        amount_a_min: u64,
        amount_b_min: u64,
        deadline: i64,
    ) -> Result<()> {
        // Check deadline
        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= deadline, DexError::TransactionExpired);

        let pool = &mut ctx.accounts.pool;
        
        let (amount_a, amount_b, lp_tokens) = if pool.total_lp_supply == 0 {
            // First liquidity provision
            let initial_lp = (amount_a_desired as u128 * amount_b_desired as u128).integer_sqrt() as u64;
            require!(initial_lp > 1000, DexError::InsufficientLiquidityMinted); // Minimum liquidity
            
            (amount_a_desired, amount_b_desired, initial_lp - 1000) // Burn first 1000 LP tokens
        } else {
            // Calculate optimal amounts based on current reserves
            let amount_b_optimal = quote(amount_a_desired, pool.reserve_a, pool.reserve_b)?;
            
            let (final_a, final_b) = if amount_b_optimal <= amount_b_desired {
                require!(amount_b_optimal >= amount_b_min, DexError::InsufficientBAmount);
                (amount_a_desired, amount_b_optimal)
            } else {
                let amount_a_optimal = quote(amount_b_desired, pool.reserve_b, pool.reserve_a)?;
                require!(amount_a_optimal <= amount_a_desired, DexError::InsufficientAAmount);
                require!(amount_a_optimal >= amount_a_min, DexError::InsufficientAAmount);
                (amount_a_optimal, amount_b_desired)
            };
            
            // Calculate LP tokens to mint
            let lp_a = final_a as u128 * pool.total_lp_supply as u128 / pool.reserve_a as u128;
            let lp_b = final_b as u128 * pool.total_lp_supply as u128 / pool.reserve_b as u128;
            let lp_tokens = std::cmp::min(lp_a, lp_b) as u64;
            
            (final_a, final_b, lp_tokens)
        };

        // Transfer tokens from user to pool vaults
        transfer_tokens_to_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.user_token_a,
            &ctx.accounts.token_a_vault,
            &ctx.accounts.user,
            amount_a,
        )?;

        transfer_tokens_to_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.user_token_b,
            &ctx.accounts.token_b_vault,
            &ctx.accounts.user,
            amount_b,
        )?;

        // Mint LP tokens to user
        let pool_key = pool.key();
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        let signer = &[&seeds[..]];

        let cpi_accounts = token::MintTo {
            mint: ctx.accounts.lp_mint.to_account_info(),
            to: ctx.accounts.user_lp_token.to_account_info(),
            authority: ctx.accounts.pool.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer);
        token::mint_to(cpi_ctx, lp_tokens)?;

        // Update pool state
        pool.reserve_a += amount_a;
        pool.reserve_b += amount_b;
        pool.total_lp_supply += lp_tokens;

        emit!(LiquidityAdded {
            user: ctx.accounts.user.key(),
            amount_a,
            amount_b,
            lp_tokens,
        });

        Ok(())
    }

    /// Remove liquidity from pool
    pub fn remove_liquidity(
        ctx: Context<RemoveLiquidity>,
        lp_tokens: u64,
        amount_a_min: u64,
        amount_b_min: u64,
        deadline: i64,
    ) -> Result<()> {
        // Check deadline
        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= deadline, DexError::TransactionExpired);

        let pool = &mut ctx.accounts.pool;
        
        // Calculate token amounts to return
        let amount_a = lp_tokens as u128 * pool.reserve_a as u128 / pool.total_lp_supply as u128;
        let amount_b = lp_tokens as u128 * pool.reserve_b as u128 / pool.total_lp_supply as u128;
        
        let amount_a = amount_a as u64;
        let amount_b = amount_b as u64;
        
        require!(amount_a >= amount_a_min, DexError::InsufficientAAmount);
        require!(amount_b >= amount_b_min, DexError::InsufficientBAmount);

        // Burn LP tokens
        let cpi_accounts = token::Burn {
            mint: ctx.accounts.lp_mint.to_account_info(),
            from: ctx.accounts.user_lp_token.to_account_info(),
            authority: ctx.accounts.user.to_account_info(),
        };
        let cpi_program = ctx.accounts.token_program.to_account_info();
        let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
        token::burn(cpi_ctx, lp_tokens)?;

        // Transfer tokens from vaults to user
        let pool_key = pool.key();
        let seeds = &[
            b"pool",
            pool.token_a_mint.as_ref(),
            pool.token_b_mint.as_ref(),
            &[pool.bump],
        ];
        let signer = &[&seeds[..]];

        transfer_tokens_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.token_a_vault,
            &ctx.accounts.user_token_a,
            &ctx.accounts.pool.to_account_info(),
            amount_a,
            signer,
        )?;

        transfer_tokens_from_vault(
            &ctx.accounts.token_program,
            &ctx.accounts.token_b_vault,
            &ctx.accounts.user_token_b,
            &ctx.accounts.pool.to_account_info(),
            amount_b,
            signer,
        )?;

        // Update pool state
        pool.reserve_a -= amount_a;
        pool.reserve_b -= amount_b;
        pool.total_lp_supply -= lp_tokens;

        emit!(LiquidityRemoved {
            user: ctx.accounts.user.key(),
            amount_a,
            amount_b,
            lp_tokens,
        });

        Ok(())
    }

    /// Swap tokens using the constant product formula
    pub fn swap(
        ctx: Context<Swap>,
        amount_in: u64,
        amount_out_min: u64,
        deadline: i64,
        a_to_b: bool, // true if swapping token A for token B
    ) -> Result<()> {
        // Check deadline
        let clock = Clock::get()?;
        require!(clock.unix_timestamp <= deadline, DexError::TransactionExpired);

        let pool = &mut ctx.accounts.pool;
        
        // Calculate output amount using constant product formula
        let (reserve_in, reserve_out) = if a_to_b {
            (pool.reserve_a, pool.reserve_b)
        } else {
            (pool.reserve_b, pool.reserve_a)
        };

        let amount_out = get_amount_out(amount_in, reserve_in, reserve_out, pool.fee_rate)?;
        require!(amount_out >= amount_out_min, DexError::InsufficientOutputAmount);

        // Perform the swap
        if a_to_b {
            // Transfer token A from user to vault
            transfer_tokens_to_vault(
                &ctx.accounts.token_program,
                &ctx.accounts.user_token_a,
                &ctx.accounts.token_a_vault,
                &ctx.accounts.user,
                amount_in,
            )?;

            // Transfer token B from vault to user
            let pool_key = pool.key();
            let seeds = &[
                b"pool",
                pool.token_a_mint.as_ref(),
                pool.token_b_mint.as_ref(),
                &[pool.bump],
            ];
            let signer = &[&seeds[..]];

            transfer_tokens_from_vault(
                &ctx.accounts.token_program,
                &ctx.accounts.token_b_vault,
                &ctx.accounts.user_token_b,
                &ctx.accounts.pool.to_account_info(),
                amount_out,
                signer,
            )?;

            // Update reserves
            pool.reserve_a += amount_in;
            pool.reserve_b -= amount_out;
        } else {
            // Transfer token B from user to vault
            transfer_tokens_to_vault(
                &ctx.accounts.token_program,
                &ctx.accounts.user_token_b,
                &ctx.accounts.token_b_vault,
                &ctx.accounts.user,
                amount_in,
            )?;

            // Transfer token A from vault to user
            let pool_key = pool.key();
            let seeds = &[
                b"pool",
                pool.token_a_mint.as_ref(),
                pool.token_b_mint.as_ref(),
                &[pool.bump],
            ];
            let signer = &[&seeds[..]];

            transfer_tokens_from_vault(
                &ctx.accounts.token_program,
                &ctx.accounts.token_a_vault,
                &ctx.accounts.user_token_a,
                &ctx.accounts.pool.to_account_info(),
                amount_out,
                signer,
            )?;

            // Update reserves
            pool.reserve_b += amount_in;
            pool.reserve_a -= amount_out;
        }

        emit!(Swap {
            user: ctx.accounts.user.key(),
            amount_in,
            amount_out,
            a_to_b,
        });

        Ok(())
    }

    /// Get quote for adding liquidity
    pub fn get_quote(
        ctx: Context<GetQuote>,
        amount_a: u64,
    ) -> Result<u64> {
        let pool = &ctx.accounts.pool;
        let amount_b = quote(amount_a, pool.reserve_a, pool.reserve_b)?;
        Ok(amount_b)
    }
}

// Helper functions

fn transfer_tokens_to_vault<'info>(
    token_program: &AccountInfo<'info>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: &Signer<'info>,
    amount: u64,
) -> Result<()> {
    let cpi_accounts = Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_program = token_program.to_account_info();
    let cpi_ctx = CpiContext::new(cpi_program, cpi_accounts);
    token::transfer(cpi_ctx, amount)
}

fn transfer_tokens_from_vault<'info>(
    token_program: &AccountInfo<'info>,
    from: &Account<'info, TokenAccount>,
    to: &Account<'info, TokenAccount>,
    authority: &AccountInfo<'info>,
    amount: u64,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = Transfer {
        from: from.to_account_info(),
        to: to.to_account_info(),
        authority: authority.to_account_info(),
    };
    let cpi_program = token_program.to_account_info();
    let cpi_ctx = CpiContext::new_with_signer(cpi_program, cpi_accounts, signer_seeds);
    token::transfer(cpi_ctx, amount)
}

/// Calculate output amount for a swap using constant product formula
/// Formula: amount_out = (amount_in * 997 * reserve_out) / (reserve_in * 1000 + amount_in * 997)
/// The 997/1000 factor accounts for the 0.3% fee
fn get_amount_out(
    amount_in: u64,
    reserve_in: u64,
    reserve_out: u64,
    fee_rate: u64, // Fee rate in basis points
) -> Result<u64> {
    require!(amount_in > 0, DexError::InsufficientInputAmount);
    require!(reserve_in > 0 && reserve_out > 0, DexError::InsufficientLiquidity);

    let fee_complement = 10000 - fee_rate; // e.g., 9970 for 0.3% fee
    let amount_in_with_fee = amount_in as u128 * fee_complement as u128;
    let numerator = amount_in_with_fee * reserve_out as u128;
    let denominator = reserve_in as u128 * 10000 + amount_in_with_fee;
    
    Ok((numerator / denominator) as u64)
}

/// Calculate the equivalent amount of token B for a given amount of token A
fn quote(amount_a: u64, reserve_a: u64, reserve_b: u64) -> Result<u64> {
    require!(amount_a > 0, DexError::InsufficientAmount);
    require!(reserve_a > 0 && reserve_b > 0, DexError::InsufficientLiquidity);
    
    let amount_b = amount_a as u128 * reserve_b as u128 / reserve_a as u128;
    Ok(amount_b as u64)
}

// Integer square root implementation
trait IntegerSquareRoot {
    fn integer_sqrt(self) -> Self;
}

impl IntegerSquareRoot for u128 {
    fn integer_sqrt(self) -> Self {
        if self < 2 {
            return self;
        }
        
        let mut x = self;
        let mut y = (self + 1) / 2;
        
        while y < x {
            x = y;
            y = (y + self / y) / 2;
        }
        
        x
    }
}

// Account structures

#[derive(Accounts)]
pub struct InitializePool<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + std::mem::size_of::<Pool>(),
        seeds = [b"pool", token_a_mint.key().as_ref(), token_b_mint.key().as_ref()],
        bump
    )]
    pub pool: Account<'info, Pool>,
    
    pub token_a_mint: Account<'info, Mint>,
    pub token_b_mint: Account<'info, Mint>,
    
    #[account(
        init,
        payer = authority,
        token::mint = token_a_mint,
        token::authority = pool,
    )]
    pub token_a_vault: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = authority,
        token::mint = token_b_mint,
        token::authority = pool,
    )]
    pub token_b_vault: Account<'info, TokenAccount>,
    
    #[account(
        init,
        payer = authority,
        mint::decimals = 6,
        mint::authority = pool,
    )]
    pub lp_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub authority: Signer<'info>,
    
    pub token_program: Program<'info, Token>,
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}

#[derive(Accounts)]
pub struct AddLiquidity<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    
    #[account(mut)]
    pub token_a_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub token_b_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_lp_token: Account<'info, TokenAccount>,
    
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct RemoveLiquidity<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    
    #[account(mut)]
    pub token_a_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub token_b_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub lp_mint: Account<'info, Mint>,
    
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_lp_token: Account<'info, TokenAccount>,
    
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub pool: Account<'info, Pool>,
    
    #[account(mut)]
    pub token_a_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub token_b_vault: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_a: Account<'info, TokenAccount>,
    
    #[account(mut)]
    pub user_token_b: Account<'info, TokenAccount>,
    
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct GetQuote<'info> {
    pub pool: Account<'info, Pool>,
}

// State definitions

#[account]
pub struct Pool {
    pub token_a_mint: Pubkey,
    pub token_b_mint: Pubkey,
    pub token_a_vault: Pubkey,
    pub token_b_vault: Pubkey,
    pub lp_mint: Pubkey,
    pub fee_rate: u64,        // Fee rate in basis points (e.g., 30 = 0.3%)
    pub authority: Pubkey,
    pub reserve_a: u64,
    pub reserve_b: u64,
    pub total_lp_supply: u64,
    pub bump: u8,
}

// Events

#[event]
pub struct LiquidityAdded {
    pub user: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub lp_tokens: u64,
}

#[event]
pub struct LiquidityRemoved {
    pub user: Pubkey,
    pub amount_a: u64,
    pub amount_b: u64,
    pub lp_tokens: u64,
}

#[event]
pub struct Swap {
    pub user: Pubkey,
    pub amount_in: u64,
    pub amount_out: u64,
    pub a_to_b: bool,
}

// Error definitions

#[error_code]
pub enum DexError {
    #[msg("Insufficient input amount")]
    InsufficientInputAmount,
    
    #[msg("Insufficient output amount")]
    InsufficientOutputAmount,
    
    #[msg("Insufficient liquidity")]
    InsufficientLiquidity,
    
    #[msg("Insufficient amount")]
    InsufficientAmount,
    
    #[msg("Insufficient A amount")]
    InsufficientAAmount,
    
    #[msg("Insufficient B amount")]
    InsufficientBAmount,
    
    #[msg("Insufficient liquidity minted")]
    InsufficientLiquidityMinted,
    
    #[msg("Transaction expired")]
    TransactionExpired,
    
    #[msg("Invalid fee rate")]
    InvalidFeeRate,
}