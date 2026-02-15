#!/usr/bin/env python3
import asyncio
import sys
from pathlib import Path
from datetime import datetime, timezone
from decimal import Decimal

backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.services.db import execute, execute_mutate
from core.utils.logger import logger

async def fix_trial_users():
    """Fix users who incorrectly have trial credits as non-expiring"""
    print("\n" + "="*60)
    print("FIXING TRIAL USERS WITH INCORRECT NON-EXPIRING CREDITS")
    print("="*60)
    
    # Find users on trial or recently converted from trial
    rows = await execute(
        """
        SELECT *
        FROM credit_accounts
        WHERE trial_status IN ('active', 'converted')
        """
    )

    if not rows:
        print("No trial users found")
        return
    
    fixed_count = 0
    
    for account in rows:
        account_id = account['account_id']
        tier = account.get('tier', 'none')
        trial_status = account.get('trial_status')
        non_expiring = Decimal(str(account.get('non_expiring_credits', 0)))
        expiring = Decimal(str(account.get('expiring_credits', 0)))
        balance = Decimal(str(account.get('balance', 0)))
        

        if non_expiring >= Decimal('5') and trial_status in ['active', 'converted']:
            print(f"\nUser {account_id[:8]}... has incorrect trial credits:")
            print(f"  Trial Status: {trial_status}")
            print(f"  Current Balance: ${balance}")
            print(f"  Non-expiring: ${non_expiring} (INCORRECT - includes trial credits)")
            print(f"  Expiring: ${expiring}")
            
            # Calculate the correction
            trial_amount = Decimal('5')
            corrected_non_expiring = non_expiring - trial_amount
            corrected_expiring = expiring + trial_amount
            
            # The total balance should remain the same
            print(f"\n  Correcting to:")
            print(f"  Non-expiring: ${corrected_non_expiring} (removed trial credits)")
            print(f"  Expiring: ${corrected_expiring} (added trial credits)")
            print(f"  Total Balance: ${balance} (unchanged)")
            
            # Update the credit account
            update_rows = await execute_mutate(
                """
                UPDATE credit_accounts
                SET
                  non_expiring_credits = :non_expiring_credits,
                  expiring_credits = :expiring_credits,
                  updated_at = :updated_at
                WHERE account_id = :account_id
                RETURNING account_id
                """,
                {
                    "account_id": account_id,
                    "non_expiring_credits": float(corrected_non_expiring),
                    "expiring_credits": float(corrected_expiring),
                    "updated_at": datetime.now(timezone.utc).isoformat(),
                },
            )

            if update_rows:
                # Add ledger entry for audit trail
                await execute_mutate(
                    """
                    INSERT INTO credit_ledger
                      (account_id, amount, balance_after, type, description)
                    VALUES
                      (:account_id, :amount, :balance_after, :type, :description)
                    """,
                    {
                        "account_id": account_id,
                        "amount": 0,
                        "balance_after": float(balance),
                        "type": "adjustment",
                        "description": "Fixed trial credits: moved $5 from non-expiring to expiring",
                    },
                )
                
                print(f"  ✅ Fixed credits for user {account_id[:8]}...")
                fixed_count += 1
            else:
                print(f"  ❌ Failed to fix user {account_id[:8]}...")
    
    print(f"\n{'='*60}")
    print(f"COMPLETED: Fixed {fixed_count} users")
    print("="*60)

if __name__ == "__main__":
    asyncio.run(fix_trial_users()) 
