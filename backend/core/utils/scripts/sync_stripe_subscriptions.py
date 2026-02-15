#!/usr/bin/env python3
import asyncio
import sys
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime, timezone
from decimal import Decimal
import time

backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

import stripe
from core.services.db import execute, execute_mutate
from core.utils.config import config
from core.utils.logger import logger
from core.billing.shared.config import get_tier_by_price_id, TIERS

stripe.api_key = config.STRIPE_SECRET_KEY

class FastSyncService:
    def __init__(self):
        self.stats = {
            'total_users': 0,
            'synced': 0,
            'converted_to_trial': 0,
            'errors': 0,
            'skipped': 0,
            'no_subscription': 0,
            'wrong_status': 0,
            'no_price_id': 0,
            'unmatched_tier': 0,
            'start_time': time.time()
        }
    
    async def run(self):
        print("\n" + "="*60)
        print("STRIPE SUBSCRIPTION SYNC")
        print("="*60)
        
        await self.sync_stripe_subscriptions()
        await self.convert_free_users_batch()
        await self.fix_topup_credits_batch()
        
        self.print_stats()
    
    async def sync_stripe_subscriptions(self):
        print("\n📊 SYNCING STRIPE SUBSCRIPTIONS...")
        
        offset = 0
        batch_size = 1000
        
        while True:
            customers = await execute(
                """
                SELECT id, account_id
                FROM basejump.billing_customers
                ORDER BY id
                LIMIT :limit OFFSET :offset
                """,
                {"limit": batch_size, "offset": offset},
            )

            if not customers:
                break
            
            print(f"  Processing batch {offset//batch_size + 1} ({len(customers)} customers)...")
            
            tasks = []
            for customer in customers:
                tasks.append(self.sync_customer_subscription(customer))
            
            for i in range(0, len(tasks), 10):
                chunk = tasks[i:i+10]
                await asyncio.gather(*chunk, return_exceptions=True)
            
            offset += batch_size
            
            if len(customers) < batch_size:
                break
        
        print(f"  ✅ Processed {self.stats['synced']} subscriptions")
    
    async def sync_customer_subscription(self, customer: Dict) -> None:
        stripe_customer_id = customer['id']
        account_id = customer['account_id']
        
        try:
            subscriptions = await stripe.Subscription.list_async(
                customer=stripe_customer_id,
                status='all',
                limit=1,
                expand=['data.items.data.price']
            )
            
            if not subscriptions.data:
                self.stats['no_subscription'] += 1
                logger.debug(f"Customer {stripe_customer_id}: no subscription found")
                return
            
            sub = subscriptions.data[0]
            
            if sub.status not in ['active', 'trialing']:
                self.stats['wrong_status'] += 1
                logger.debug(f"Customer {stripe_customer_id}: subscription status is {sub.status}, skipping")
                return
            
            if sub.status in ['active', 'trialing']:
                price_id = None
                items_data = None
                if hasattr(sub, 'items'):
                    if callable(sub.items):
                        items_obj = sub.items()
                        if hasattr(items_obj, 'data'):
                            items_data = items_obj.data
                    elif hasattr(sub.items, 'data'):
                        items_data = sub.items.data
                
                if items_data and len(items_data) > 0:
                    item = items_data[0]
                    if hasattr(item, 'price'):
                        if hasattr(item.price, 'id'):
                            price_id = item.price.id
                        elif isinstance(item.price, str):
                            price_id = item.price
                
                if not price_id:
                    self.stats['no_price_id'] += 1
                    logger.debug(f"Customer {stripe_customer_id}: no price_id found in subscription")
                    return
                
                tier = get_tier_by_price_id(price_id) if price_id else None
                if not tier:
                    self.stats['unmatched_tier'] += 1
                    logger.debug(f"Customer {stripe_customer_id}: price_id {price_id} doesn't match any configured tier")
                    return
                
                logger.info(f"Syncing customer {stripe_customer_id} with tier {tier.name}")
                
                update_data = {
                    'tier': tier.name,
                    'stripe_subscription_id': sub.id,
                    'billing_cycle_anchor': datetime.fromtimestamp(sub.created).isoformat() if sub.created else None,
                    'updated_at': datetime.now(timezone.utc).isoformat()
                }
                
                if sub.current_period_end:
                    update_data['next_credit_grant'] = datetime.fromtimestamp(sub.current_period_end).isoformat()
                
                await execute_mutate(
                    """
                    UPDATE credit_accounts
                    SET
                      tier = :tier,
                      stripe_subscription_id = :stripe_subscription_id,
                      billing_cycle_anchor = :billing_cycle_anchor,
                      next_credit_grant = :next_credit_grant,
                      updated_at = :updated_at
                    WHERE account_id = :account_id
                    """,
                    {
                        "account_id": account_id,
                        "tier": update_data["tier"],
                        "stripe_subscription_id": update_data["stripe_subscription_id"],
                        "billing_cycle_anchor": update_data["billing_cycle_anchor"],
                        "next_credit_grant": update_data.get("next_credit_grant"),
                        "updated_at": update_data["updated_at"],
                    },
                )
                
                self.stats['synced'] += 1
                
        except Exception as e:
            logger.error(f"Error syncing customer {stripe_customer_id}: {e}")
            self.stats['errors'] += 1
    
    async def convert_free_users_batch(self):
        print("\n🔄 CONVERTING FREE TIER USERS...")
        
        offset = 0
        batch_size = 1000
        total_converted = 0
        
        while True:
            free_users = await execute(
                """
                SELECT account_id, balance
                FROM credit_accounts
                WHERE tier = 'free'
                  AND stripe_subscription_id IS NULL
                ORDER BY account_id
                LIMIT :limit OFFSET :offset
                """,
                {"limit": batch_size, "offset": offset},
            )

            if not free_users:
                break
            
            print(f"  Converting batch {offset//batch_size + 1} ({len(free_users)} users)...")
            
            account_ids = []
            ledger_entries = []
            
            for user in free_users:
                account_id = user['account_id']
                old_balance = Decimal(str(user['balance']))
                
                account_ids.append(account_id)
                
                if old_balance > 0:
                    ledger_entries.append({
                        'account_id': account_id,
                        'amount': float(-old_balance),
                        'balance_after': 0,
                        'type': 'adjustment',
                        'description': 'Free tier discontinued - please start a trial to continue',
                        'created_at': datetime.now(timezone.utc).isoformat()
                    })
            
            if account_ids:
                try:
                    update_chunk_size = 50
                    for i in range(0, len(account_ids), update_chunk_size):
                        chunk_ids = account_ids[i:i+update_chunk_size]
                        
                        await execute_mutate(
                            """
                            UPDATE credit_accounts
                            SET
                              tier = 'none',
                              balance = 0,
                              expiring_credits = 0,
                              non_expiring_credits = 0,
                              trial_status = NULL,
                              updated_at = :updated_at
                            WHERE account_id = ANY(:account_ids)
                            """,
                            {
                                "account_ids": chunk_ids,
                                "updated_at": datetime.now(timezone.utc).isoformat(),
                            },
                        )
                    
                    if ledger_entries:
                        for i in range(0, len(ledger_entries), 100):
                            chunk = ledger_entries[i:i+100]
                            for entry in chunk:
                                await execute_mutate(
                                    """
                                    INSERT INTO credit_ledger
                                      (account_id, amount, balance_after, type, description, created_at)
                                    VALUES
                                      (:account_id, :amount, :balance_after, :type, :description, :created_at)
                                    """,
                                    entry,
                                )
                    
                    total_converted += len(account_ids)
                    self.stats['converted_to_trial'] += len(account_ids)
                    
                except Exception as e:
                    logger.error(f"Error converting batch: {e}")
                    self.stats['errors'] += 1
            
            offset += batch_size
            
            if len(free_users) < batch_size:
                break
        
        print(f"  ✅ Converted {total_converted} users to trial-ready state")
    
    async def fix_topup_credits_batch(self):
        print("\n💰 CHECKING TOPUP CREDITS...")
        
        offset = 0
        batch_size = 1000
        user_purchases = {}
        
        while True:
            purchases = await execute(
                """
                SELECT account_id, amount_dollars
                FROM credit_purchases
                WHERE status = 'completed'
                ORDER BY account_id
                LIMIT :limit OFFSET :offset
                """,
                {"limit": batch_size, "offset": offset},
            )

            if not purchases:
                break
            
            for purchase in purchases:
                account_id = purchase['account_id']
                amount = Decimal(str(purchase.get('amount_dollars', 0)))
                if account_id not in user_purchases:
                    user_purchases[account_id] = Decimal('0')
                user_purchases[account_id] += amount
            
            offset += batch_size
            
            if len(purchases) < batch_size:
                break
        
        if not user_purchases:
            print("  No purchases to check")
            return
        
        print(f"  Found {len(user_purchases)} users with purchases")
        
        fixed_count = 0
        account_ids = list(user_purchases.keys())
        
        for i in range(0, len(account_ids), 100):
            chunk_ids = account_ids[i:i+100]
            
            accounts = await execute(
                """
                SELECT account_id, non_expiring_credits
                FROM credit_accounts
                WHERE account_id = ANY(:account_ids)
                """,
                {"account_ids": chunk_ids},
            )
            
            for account in accounts:
                account_id = account['account_id']
                current_non_expiring = Decimal(str(account.get('non_expiring_credits', 0)))
                expected_purchases = user_purchases[account_id]
                
                if current_non_expiring < expected_purchases:
                    missing = expected_purchases - current_non_expiring
                    
                    from core.billing.credits.manager import credit_manager
                    await credit_manager.add_credits(
                        account_id=account_id,
                        amount=missing,
                        is_expiring=False,
                        description=f"Sync fix: Restored missing topup credits (${missing})"
                    )
                    
                    fixed_count += 1
        
        if fixed_count > 0:
            print(f"  ✅ Fixed {fixed_count} users with missing topup credits")
        else:
            print("  ✅ All topup credits are correct")
    
    def print_stats(self):
        elapsed = time.time() - self.stats['start_time']
        
        print("\n" + "="*60)
        print("SYNC COMPLETE")
        print("="*60)
        print(f"Time taken: {elapsed:.2f} seconds")
        print(f"Subscriptions synced: {self.stats['synced']}")
        print(f"Users converted to trial-ready: {self.stats['converted_to_trial']}")
        print(f"Errors: {self.stats['errors']}")
        print("\n📊 Subscription Sync Details:")
        print(f"  No subscription found: {self.stats['no_subscription']}")
        print(f"  Wrong status (not active/trialing): {self.stats['wrong_status']}")
        print(f"  No price ID in subscription: {self.stats['no_price_id']}")
        print(f"  Price ID doesn't match tiers: {self.stats['unmatched_tier']}")
        print("="*60)

async def main():
    service = FastSyncService()
    try:
        await service.run()
    except Exception as e:
        print(f"\n❌ FATAL ERROR: {e}")
        logger.error(f"Sync failed: {e}", exc_info=True)
        sys.exit(1)

if __name__ == "__main__":
    print("Starting fast sync service...")
    asyncio.run(main()) 
