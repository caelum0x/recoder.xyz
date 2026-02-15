#!/usr/bin/env python3
"""
Recoder Agent Installation Script for Individual Users

Simple script to install Recoder agents for users by email address or account ID.

Usage:
    # Install Recoder for a user by email
    python install_recoder_for_user.py user@example.com
    
    # Install Recoder for a user by account ID
    python install_recoder_for_user.py abc123-def456-ghi789
    
    # Install with replacement (if agent already exists)
    python install_recoder_for_user.py user@example.com --replace
    
    # Explicitly specify account ID
    python install_recoder_for_user.py abc123-def456-ghi789 --account-id

Examples:
    python install_recoder_for_user.py john.doe@company.com
    python install_recoder_for_user.py admin@example.org --replace
    python install_recoder_for_user.py f47ac10b-58cc-4372-a567-0e02b2c3d479
    python install_recoder_for_user.py f47ac10b-58cc-4372-a567-0e02b2c3d479 --replace
"""

import asyncio
import argparse
import sys
from pathlib import Path
from typing import Optional, Dict, Any

backend_dir = Path(__file__).parent.parent.parent
sys.path.insert(0, str(backend_dir))

from core.utils.recoder_default_agent_service import RecoderDefaultAgentService
from core.services.db import execute, execute_one
from core.utils.logger import logger


class RecoderUserInstaller:
    def __init__(self):
        self.service = RecoderDefaultAgentService()
    
    async def get_account_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        try:
            email_row = await execute_one(
                """
                SELECT account_id
                FROM basejump.billing_customers
                WHERE email = :email
                LIMIT 1
                """,
                {"email": email},
            )

            if email_row:
                account = await execute_one(
                    """
                    SELECT id, name, slug, primary_owner_user_id
                    FROM basejump.accounts
                    WHERE id = :account_id
                    LIMIT 1
                    """,
                    {"account_id": email_row["account_id"]},
                )
                if account:
                    return account

            try:
                rpc_row = await execute_one(
                    "SELECT * FROM get_user_account_by_email(:email_input)",
                    {"email_input": email.lower()},
                )
                if rpc_row:
                    return rpc_row
            except Exception as e:
                logger.debug(f"RPC function not available: {e}")

            rows = await execute(
                """
                SELECT id, name, slug, primary_owner_user_id
                FROM basejump.accounts
                WHERE personal_account = true
                """
            )

            if not rows:
                return None

            email_prefix = email.split('@')[0].lower()
            
            for account in rows:
                account_name = account.get('name') or ''
                account_slug = account.get('slug') or ''
                
                if account_name.lower() == email_prefix or \
                   account_slug.lower() == email_prefix:
                    return account
            
            email_prefix_normalized = email_prefix.replace('.', '').replace('-', '').replace('_', '')
            for account in rows:
                account_name = (account.get('name') or '').lower().replace('.', '').replace('-', '').replace('_', '')
                account_slug = (account.get('slug') or '').lower().replace('.', '').replace('-', '').replace('_', '')
                
                if account_name == email_prefix_normalized or account_slug == email_prefix_normalized:
                    return account
            
            return None
            
        except Exception as e:
            logger.error(f"Error looking up account by email: {e}")
            raise
    
    async def install_for_email(self, email: str, replace: bool = False):
        print(f"🔍 Looking for account with email: {email}")
        
        account = await self.get_account_by_email(email)
        if not account:
            print(f"❌ No account found for email: {email}")
            print(f"   Make sure the user has signed up and has a personal account")
            return
        
        account_id = account['id']
        print(f"✅ Found account: {account['name']} ({account_id})")
        
        print(f"🚀 Installing Recoder agent...")
        agent_id = await self.service.install_recoder_agent_for_user(
            account_id, 
            replace_existing=replace
        )
        
        if agent_id:
            print(f"✅ Successfully installed Recoder agent!")
            print(f"   🤖 Agent ID: {agent_id}")
            print(f"   👤 User: {email}")
            print(f"   📦 Account: {account_id}")
        else:
            print(f"❌ Failed to install Recoder agent for {email}")
    
    async def install_for_account_id(self, account_id: str, replace: bool = False):
        print(f"🚀 Installing Recoder agent for account: {account_id}")
        
        try:
            agent_id = await self.service.install_recoder_agent_for_user(
                account_id, 
                replace_existing=replace
            )
            
            if agent_id:
                print(f"✅ Successfully installed Recoder agent!")
                print(f"   🤖 Agent ID: {agent_id}")
                print(f"   📦 Account: {account_id}")
            else:
                print(f"❌ Failed to install Recoder agent for account {account_id}")
        
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            logger.error(f"Failed to install for account {account_id}: {e}", exc_info=True)



async def main():
    parser = argparse.ArgumentParser(
        description="Install Recoder agent for a user by email or account ID",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__
    )
    
    parser.add_argument('identifier', help='Email address or account ID (UUID) of the user')
    parser.add_argument('--replace', action='store_true', 
                       help='Replace existing Recoder agent if present')
    parser.add_argument('--account-id', action='store_true',
                       help='Treat identifier as account ID instead of email')
    
    args = parser.parse_args()
    
    installer = RecoderUserInstaller()

    try:
        if args.account_id:
            await installer.install_for_account_id(args.identifier, args.replace)
        elif '@' in args.identifier:
            await installer.install_for_email(args.identifier, args.replace)
        else:
            await installer.install_for_account_id(args.identifier, args.replace)
            
    except KeyboardInterrupt:
        print("\n⚠️  Operation cancelled by user")
    except Exception as e:
        print(f"❌ Error: {str(e)}")
        logger.error(f"Script error: {str(e)}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main()) 
