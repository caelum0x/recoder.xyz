import json
import base64
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any
from uuid import uuid4

from core.credentials.credential_service import EncryptionService
from core.services.db import Table, execute_read, execute_mutate
from core.utils.logger import logger


@dataclass
class ComposioProfile:
    profile_id: str
    account_id: str
    mcp_qualified_name: str
    profile_name: str
    display_name: str
    encrypted_config: str
    config_hash: str
    toolkit_slug: str
    toolkit_name: str
    mcp_url: str
    redirect_url: Optional[str] = None
    connected_account_id: Optional[str] = None
    is_active: bool = True
    is_default: bool = False
    is_connected: bool = False
    created_at: datetime = None
    updated_at: datetime = None


class ComposioProfileService:
    def __init__(self):
        self._table = Table("user_mcp_credential_profiles")
        self._encryption = EncryptionService()

    def _encrypt_config(self, config: Dict[str, Any]) -> tuple[str, str]:
        """Encrypt config dict, return (base64-encoded ciphertext, sha256 hash)."""
        encrypted_bytes, config_hash = self._encryption.encrypt_config(config)
        encoded = base64.b64encode(encrypted_bytes).decode('utf-8')
        return encoded, config_hash

    def _decrypt_config(self, encrypted_config: str, config_hash: str) -> Dict[str, Any]:
        """Decrypt base64-encoded ciphertext with integrity verification."""
        encrypted_bytes = base64.b64decode(encrypted_config)
        return self._encryption.decrypt_config(encrypted_bytes, config_hash)

    def _build_config(
        self,
        toolkit_slug: str,
        toolkit_name: str,
        mcp_url: str,
        redirect_url: Optional[str] = None,
        user_id: str = "default",
        connected_account_id: Optional[str] = None,
    ) -> Dict[str, Any]:
        return {
            "type": "composio",
            "toolkit_slug": toolkit_slug,
            "toolkit_name": toolkit_name,
            "mcp_url": mcp_url,
            "redirect_url": redirect_url,
            "user_id": user_id,
            "connected_account_id": connected_account_id,
            "created_at": datetime.now(timezone.utc).isoformat()
        }

    async def _generate_unique_profile_name(self, base_name: str, account_id: str, mcp_qualified_name: str) -> str:
        original_name = base_name
        counter = 1
        current_name = base_name

        while True:
            existing = await self._table.get_by(
                {"account_id": account_id, "mcp_qualified_name": mcp_qualified_name, "profile_name": current_name},
                cols="profile_id"
            )

            if not existing:
                return current_name

            counter += 1
            current_name = f"{original_name} ({counter})"

    async def create_profile(
        self,
        account_id: str,
        profile_name: str,
        toolkit_slug: str,
        toolkit_name: str,
        mcp_url: str,
        redirect_url: Optional[str] = None,
        user_id: str = "default",
        is_default: bool = False,
        connected_account_id: Optional[str] = None,
    ) -> ComposioProfile:
        try:
            logger.debug(f"Creating Composio profile for user: {account_id}, toolkit: {toolkit_slug}")
            logger.debug(f"MCP URL to store: {mcp_url}")
            
            config = self._build_config(
                toolkit_slug, toolkit_name, mcp_url, redirect_url, user_id, connected_account_id
            )
            encrypted_config, config_hash = self._encrypt_config(config)
            
            mcp_qualified_name = f"composio.{toolkit_slug}"
            profile_id = str(uuid4())
            now = datetime.now(timezone.utc)

            unique_profile_name = await self._generate_unique_profile_name(
                profile_name, account_id, mcp_qualified_name
            )

            if unique_profile_name != profile_name:
                logger.debug(f"Generated unique profile name: {unique_profile_name} (original: {profile_name})")

            if is_default:
                await execute_mutate(
                    'UPDATE "user_mcp_credential_profiles" SET "is_default" = false '
                    'WHERE "account_id" = :account_id AND "mcp_qualified_name" = :mqn',
                    {"account_id": account_id, "mqn": mcp_qualified_name}
                )

            result = await self._table.insert({
                'profile_id': profile_id,
                'account_id': account_id,
                'mcp_qualified_name': mcp_qualified_name,
                'profile_name': unique_profile_name,
                'display_name': unique_profile_name,
                'encrypted_config': encrypted_config,
                'config_hash': config_hash,
                'is_active': True,
                'is_default': is_default,
                'created_at': now.isoformat(),
                'updated_at': now.isoformat()
            })

            if not result:
                raise Exception("Failed to create profile in database")
            
            logger.debug(f"Successfully created Composio profile: {profile_id}")
            
            return ComposioProfile(
                profile_id=profile_id,
                account_id=account_id,
                mcp_qualified_name=mcp_qualified_name,
                profile_name=unique_profile_name,
                display_name=unique_profile_name,
                encrypted_config=encrypted_config,
                config_hash=config_hash,
                toolkit_slug=toolkit_slug,
                toolkit_name=toolkit_name,
                mcp_url=mcp_url,
                redirect_url=redirect_url,
                connected_account_id=connected_account_id,
                is_active=True,
                is_default=is_default,
                is_connected=bool(redirect_url),
                created_at=now,
                updated_at=now
            )
            
        except Exception as e:
            logger.error(f"Failed to create Composio profile: {e}", exc_info=True)
            raise

    async def get_mcp_config_for_agent(self, profile_id: str) -> Dict[str, Any]:
        try:
            profile_data = await self._table.get("profile_id", profile_id)

            if not profile_data:
                raise ValueError(f"Profile {profile_id} not found")

            config = self._decrypt_config(profile_data['encrypted_config'], profile_data['config_hash'])

            if config.get('type') != 'composio':
                raise ValueError(f"Profile {profile_id} is not a Composio profile")

            return {
                "name": config['toolkit_name'],
                "type": "composio",
                "mcp_qualified_name": profile_data['mcp_qualified_name'],
                "toolkit_slug": config.get('toolkit_slug', ''),
                "config": {
                    "profile_id": profile_id
                },
                "enabledTools": []
            }

        except Exception as e:
            logger.error(f"Failed to get MCP config for profile {profile_id}: {e}", exc_info=True)
            raise

    async def get_mcp_url_for_runtime(self, profile_id: str) -> str:
        try:
            profile_data = await self._table.get("profile_id", profile_id)

            if not profile_data:
                raise ValueError(f"Profile {profile_id} not found")

            config = self._decrypt_config(profile_data['encrypted_config'], profile_data['config_hash'])

            if config.get('type') != 'composio':
                raise ValueError(f"Profile {profile_id} is not a Composio profile")

            mcp_url = config.get('mcp_url')
            if not mcp_url:
                raise ValueError(f"Profile {profile_id} has no MCP URL")

            logger.debug(f"Retrieved MCP URL for profile {profile_id}")
            return mcp_url

        except Exception as e:
            logger.error(f"Failed to get MCP URL for profile {profile_id}: {e}", exc_info=True)
            raise

    async def get_profile_config(self, profile_id: str) -> Dict[str, Any]:
        try:
            row = await self._table.get("profile_id", profile_id, cols="encrypted_config, config_hash")

            if not row:
                raise ValueError(f"Profile {profile_id} not found")

            return self._decrypt_config(row['encrypted_config'], row['config_hash'])
            
        except Exception as e:
            logger.error(f"Failed to get config for profile {profile_id}: {e}", exc_info=True)
            raise

    async def get_profiles(self, account_id: str, toolkit_slug: Optional[str] = None) -> List[ComposioProfile]:
        try:
            if toolkit_slug:
                rows = await self._table.list(
                    {"account_id": account_id, "mcp_qualified_name": f"composio.{toolkit_slug}"},
                    limit=1000
                )
            else:
                rows = await execute_read(
                    'SELECT * FROM "user_mcp_credential_profiles" '
                    'WHERE "account_id" = :account_id AND "mcp_qualified_name" LIKE :pattern',
                    {"account_id": account_id, "pattern": "composio.%"}
                )

            profiles = []
            for row in rows:
                config = self._decrypt_config(row['encrypted_config'], row['config_hash'])
                
                profile = ComposioProfile(
                    profile_id=row['profile_id'],
                    account_id=row['account_id'],
                    mcp_qualified_name=row['mcp_qualified_name'],
                    profile_name=row['profile_name'],
                    display_name=row['display_name'],
                    encrypted_config=row['encrypted_config'],
                    config_hash=row['config_hash'],
                    toolkit_slug=config.get('toolkit_slug', ''),
                    toolkit_name=config.get('toolkit_name', ''),
                    mcp_url=config.get('mcp_url', ''),
                    redirect_url=config.get('redirect_url'),
                    connected_account_id=config.get('connected_account_id'),
                    is_active=row.get('is_active', True),
                    is_default=row.get('is_default', False),
                    is_connected=bool(config.get('redirect_url')),
                    created_at=datetime.fromisoformat(row['created_at'].replace('Z', '+00:00')) if row.get('created_at') else None,
                    updated_at=datetime.fromisoformat(row['updated_at'].replace('Z', '+00:00')) if row.get('updated_at') else None
                )
                profiles.append(profile)
            
            return profiles
            
        except Exception as e:
            logger.error(f"Failed to get Composio profiles: {e}", exc_info=True)
            raise 